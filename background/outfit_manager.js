/**
 * File: outfit_manager.js
 * Purpose: Quản lý danh sách outfit đã lưu (Saved Outfits) và lịch sử Try-on
 * Layer: Application / Feature
 *
 * Data Contract:
 * - Exports: handleSaveOutfit, handleGetOutfits, handleGetTryonHistory,
 *            handleDeleteOutfit, handleGetDeletedOutfits, handleRestoreOutfit, handlePermanentDeleteOutfit
 *
 * Storage strategy:
 * - Authenticated user: ghi vào bảng `saved_outfits` trên Supabase (persistent, cross-device)
 * - Fallback: chrome.storage.local nếu network lỗi
 * - Demo/guest: in-memory demoState + chrome.storage.local
 *
 * DB Table: public.saved_outfits
 *   id uuid PK | user_id uuid FK | name text | result_image_url text |
 *   clothing_image_url text | model_image_url text | tryon_history_id uuid FK | created_at timestamptz
 *
 * Fix Log:
 * - [Fix 1] handleSaveOutfit chỉ dùng demoState → mất data sau reload
 *           → Fixed: ghi vào Supabase saved_outfits khi authenticated, fallback local storage
 * - [Fix 2] handleGetOutfits chỉ đọc demoState → luôn trả mock data
 *           → Fixed: đọc từ Supabase saved_outfits + merge local fallback
 */

import { isDemoMode, getAuthToken } from './auth_state_manager.js';
import { demoState, MOCK_USER, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from './ENVIRONMENT_CONFIG.js';
import { log } from './debug_logger.js';

const LOCAL_OUTFITS_KEY = 'fitly_saved_outfits';
const LOCAL_DELETED_IDS_KEY = 'fitly_deleted_outfit_ids';
const MAX_LOCAL_OUTFITS = 50;

// ============================================================================
// LOCAL STORAGE HELPERS (fallback khi offline / guest)
// ============================================================================

async function loadLocalOutfits() {
    try {
        const data = await chrome.storage.local.get([LOCAL_OUTFITS_KEY]);
        return data[LOCAL_OUTFITS_KEY] || [];
    } catch (e) {
        console.warn('[OutfitManager] Failed to load local outfits:', e.message);
        return [];
    }
}

async function saveLocalOutfits(outfits) {
    try {
        const trimmed = outfits.slice(0, MAX_LOCAL_OUTFITS);
        await chrome.storage.local.set({ [LOCAL_OUTFITS_KEY]: trimmed });
    } catch (e) {
        console.warn('[OutfitManager] Failed to save local outfits:', e.message);
    }
}

/** Load locally persisted deleted outfit IDs (tombstone set) */
async function loadDeletedIds() {
    try {
        const data = await chrome.storage.local.get([LOCAL_DELETED_IDS_KEY]);
        return new Set(data[LOCAL_DELETED_IDS_KEY] || []);
    } catch (e) {
        return new Set();
    }
}

/** Persist a deleted outfit ID to tombstone set */
async function addDeletedId(outfitId) {
    try {
        const ids = await loadDeletedIds();
        ids.add(String(outfitId));
        // Keep max 200 tombstones to prevent unbounded growth
        const arr = [...ids].slice(-200);
        await chrome.storage.local.set({ [LOCAL_DELETED_IDS_KEY]: arr });
    } catch (e) {
        console.warn('[OutfitManager] Failed to persist deleted ID:', e.message);
    }
}

/** Clear tombstone set (called after successful cloud sync) */
async function clearDeletedIds() {
    try {
        await chrome.storage.local.remove(LOCAL_DELETED_IDS_KEY);
    } catch (e) {
        // ignore
    }
}

// ============================================================================
// SAVE OUTFIT
// ============================================================================

/**
 * Lưu outfit sau khi try-on thành công.
 *
 * Flow:
 * 1. Authenticated → INSERT vào Supabase saved_outfits
 * 2. Fallback → persist vào chrome.storage.local
 * 3. Demo/guest → in-memory demoState + local storage
 */
export async function handleSaveOutfit(data) {
    const demoMode = await isDemoMode();

    // STEP 1: Build outfit object
    const outfitPayload = {
        name: data.name || `Outfit ${new Date().toLocaleDateString('vi-VN')}`,
        result_image_url: data.result_image_url,
        clothing_image_url: data.clothing_image_url || null,
        model_image_url: data.model_image_url || null,
        tryon_history_id: data.tryon_history_id || null,
        source_type: data.source_type || 'tryon',
        source_url: data.source_url || null,
    };

    if (demoMode) {
        // Demo mode: in-memory + local storage
        const existingLocal = await loadLocalOutfits();
        const allDemo = [...(demoState.outfits || []), ...existingLocal];
        const normalizedNew = normalizeImageUrl(outfitPayload.result_image_url);
        const alreadyExists = allDemo.find(o => normalizeImageUrl(o.result_image_url) === normalizedNew);
        if (alreadyExists) {
            log('[OutfitManager] Duplicate detected in demo, skipping save');
            return { success: true, outfit: alreadyExists, duplicate: true };
        }

        const newOutfit = {
            id: 'outfit-' + Date.now(),
            user_id: MOCK_USER.id,
            ...outfitPayload,
            created_at: new Date().toISOString(),
        };
        demoState.outfits.unshift(newOutfit);
        await saveLocalOutfits([newOutfit, ...existingLocal]);
        return { success: true, outfit: newOutfit };
    }

    // STEP 2: Authenticated → lưu lên Supabase
    try {
        const token = await getAuthToken();
        if (!token) throw new Error('NOT_AUTHENTICATED');

        // Lấy user_id từ JWT sub claim — bắt buộc để RLS policy WITH CHECK (auth.uid() = user_id) pass
        let userId;
        try {
            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1]));
            userId = payload.sub;
        } catch {
            throw new Error('CANNOT_EXTRACT_USER_ID');
        }
        if (!userId) throw new Error('USER_ID_NOT_FOUND');

        // STEP 2.5: Check duplicate by result_image_url before INSERT
        try {
            const dupCheckUrl = `${SUPABASE_AUTH_URL}/rest/v1/saved_outfits?result_image_url=eq.${encodeURIComponent(outfitPayload.result_image_url)}&deleted_at=is.null&select=id,name,result_image_url,created_at&limit=1`;
            const existingCheck = await fetch(dupCheckUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                },
            });
            if (existingCheck.ok) {
                const existing = await existingCheck.json();
                if (existing.length > 0) {
                    log('[OutfitManager] Duplicate detected, skipping save:', existing[0].id);
                    return { success: true, outfit: existing[0], duplicate: true };
                }
            }
        } catch (dupErr) {
            // Non-blocking: if dedup check fails, proceed with insert
            console.warn('[OutfitManager] Dedup check failed, proceeding:', dupErr.message);
        }

        const response = await fetch(
            `${SUPABASE_AUTH_URL}/rest/v1/saved_outfits`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation',
                },
                body: JSON.stringify({ ...outfitPayload, user_id: userId }),
            }
        );

        if (response.ok) {
            const [savedOutfit] = await response.json();
            log('[OutfitManager] Saved outfit to Supabase:', savedOutfit?.id);

            // Cập nhật local cache luôn để offline fallback
            const existingLocal = await loadLocalOutfits();
            await saveLocalOutfits([savedOutfit, ...existingLocal]);

            return { success: true, outfit: savedOutfit };
        } else {
            const errText = await response.text();
            console.warn('[OutfitManager] Supabase insert failed:', response.status, errText);
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }
    } catch (error) {
        console.warn('[OutfitManager] Cloud save failed, falling back to local:', error.message);

        // STEP 3: Fallback → local storage only
        const newOutfit = {
            id: 'outfit-local-' + Date.now(),
            ...outfitPayload,
            created_at: new Date().toISOString(),
        };
        const existingLocal = await loadLocalOutfits();

        // Dedup: skip if same result_image_url already exists in local
        const normalizedNew = normalizeImageUrl(newOutfit.result_image_url);
        const existingMatch = existingLocal.find(o => normalizeImageUrl(o.result_image_url) === normalizedNew);
        if (existingMatch) {
            return { success: true, outfit: existingMatch, duplicate: true };
        }

        await saveLocalOutfits([newOutfit, ...existingLocal]);

        return { success: true, outfit: newOutfit, savedLocally: true };
    }
}

// ============================================================================
// GET OUTFITS
// ============================================================================

/**
 * Lấy danh sách outfits để hiển thị "Outfit vừa tạo".
 *
 * Flow:
 * 1. Authenticated → đọc từ Supabase saved_outfits (newest first)
 * 2. Merge với local storage (offline-created outfits)
 * 3. Demo/guest → local storage + demoState fallback
 */
export async function handleGetOutfits(data = {}) {
    const limit = Math.min(data?.limit || 20, 50);
    const demoMode = await isDemoMode();

    if (demoMode) {
        const localOutfits = await loadLocalOutfits();
        const merged = mergeAndDedup([...localOutfits, ...demoState.outfits]);
        return { success: true, outfits: merged.slice(0, limit), total: merged.length };
    }

    // Authenticated user → đọc từ Supabase
    try {
        const token = await getAuthToken();
        if (!token) throw new Error('NOT_AUTHENTICATED');

        const response = await fetch(
            `${SUPABASE_AUTH_URL}/rest/v1/saved_outfits?deleted_at=is.null&order=created_at.desc&limit=${limit}&select=id,name,result_image_url,clothing_image_url,model_image_url,tryon_history_id,source_type,source_url,created_at`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const cloudOutfits = await response.json();
            log('[OutfitManager] Loaded', cloudOutfits.length, 'outfits from Supabase');

            // Merge với local storage — CHỈ thêm outfits tạo offline (chưa sync lên cloud)
            // để tránh outfit đã soft-delete trên cloud bị "sống lại" từ local cache
            const localOutfits = await loadLocalOutfits();
            const cloudIds = new Set(cloudOutfits.map(o => o.id));
            const cloudImageUrls = new Set(cloudOutfits.map(o => o.result_image_url).filter(Boolean));
            const localOnly = localOutfits.filter(o =>
                !cloudIds.has(o.id) &&
                (!o.result_image_url || !cloudImageUrls.has(o.result_image_url)) &&
                (o.id?.startsWith('outfit-local-') || o.id?.startsWith('outfit-'))  // chỉ giữ offline-created
            );
            const merged = mergeAndDedup([...cloudOutfits, ...localOnly]);

            // Sync local cache = cloud truth + offline-only
            await saveLocalOutfits(merged.slice(0, MAX_LOCAL_OUTFITS));

            // Cloud sync succeeded — clear tombstones (cloud is source of truth)
            await clearDeletedIds();

            return { success: true, outfits: merged.slice(0, limit), total: merged.length };
        } else {
            const errText = await response.text();
            console.warn('[OutfitManager] GET_OUTFITS Supabase failed:', response.status, errText);
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.warn('[OutfitManager] GET_OUTFITS fallback to local:', error.message);
        // Fallback: local storage only — filter out locally-tracked deleted IDs
        const localOutfits = await loadLocalOutfits();
        const deletedIds = await loadDeletedIds();
        const filtered = localOutfits.filter(o => !deletedIds.has(String(o.id)));
        return { success: true, outfits: filtered.slice(0, limit), total: filtered.length };
    }
}

// ============================================================================
// GET TRYON HISTORY (Gallery)
// ============================================================================

/**
 * Lấy lịch sử try-on đầy đủ từ Supabase để hiển thị Gallery.
 */
export async function handleGetTryonHistory(data = {}) {
    const demoMode = await isDemoMode();
    if (demoMode) {
        return { success: true, history: [] };
    }

    try {
        const token = await getAuthToken();
        if (!token) {
            return { success: false, error: 'NOT_AUTHENTICATED', history: [] };
        }

        const limit = Math.min(data?.limit || 50, 100);

        const response = await fetch(
            `${SUPABASE_AUTH_URL}/rest/v1/tryon_history?status=eq.completed&order=created_at.desc&limit=${limit}&select=id,result_image_url,clothing_image_urls,gems_used,quality,status,created_at`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error('[Fitly] GET_TRYON_HISTORY error:', response.status, errText);
            return { success: false, error: `HTTP ${response.status}`, history: [] };
        }

        const history = await response.json();
        log('[Fitly] Loaded', history.length, 'tryon history items from DB');
        return { success: true, history: history || [] };
    } catch (error) {
        console.error('[Fitly] handleGetTryonHistory error:', error);
        return { success: false, error: error.message, history: [] };
    }
}

// ============================================================================
// DELETE OUTFIT
// ============================================================================

/**
 * Soft-delete outfit — set deleted_at = NOW(). Khôi phục được trong 30 ngày.
 */
export async function handleDeleteOutfit(data) {
    const outfitId = data?.id;
    if (!outfitId) return { success: false, error: 'MISSING_OUTFIT_ID' };

    const demoMode = await isDemoMode();

    if (demoMode) {
        demoState.outfits = (demoState.outfits || []).filter(o => String(o.id) !== String(outfitId));
        const localOutfits = await loadLocalOutfits();
        await saveLocalOutfits(localOutfits.filter(o => String(o.id) !== String(outfitId)));
        return { success: true };
    }

    // STEP 1: Soft-delete — PATCH deleted_at
    // IMPORTANT: Use Prefer: return=representation to verify rows were actually updated.
    // Without this, PostgREST returns 204 OK even if 0 rows matched — causing
    // the code to falsely report success while cloud data remains unchanged.
    try {
        const token = await getAuthToken();
        if (!token) throw new Error('NOT_AUTHENTICATED');

        const response = await fetch(
            `${SUPABASE_AUTH_URL}/rest/v1/saved_outfits?id=eq.${outfitId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation',
                },
                body: JSON.stringify({ deleted_at: new Date().toISOString() }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error('[OutfitManager] Soft-delete failed:', response.status, errText);
            return { success: false, error: `Soft-delete failed: HTTP ${response.status}` };
        }

        // Verify at least 1 row was actually updated
        const updatedRows = await response.json();
        if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
            // ID không có trong saved_outfits (có thể từ tryon_history)
            // → vẫn tiếp tục local-only delete để user không bị kẹt
            log('[OutfitManager] No saved_outfit row for id:', outfitId, '— proceeding with local-only delete');
        }

        log('[OutfitManager] Soft-deleted outfit:', outfitId);
    } catch (error) {
        console.error('[OutfitManager] Cloud soft-delete failed:', error.message);
        return { success: false, error: error.message };
    }

    // STEP 2: Remove from local cache + persist deleted ID tombstone
    try {
        const localOutfits = await loadLocalOutfits();
        await saveLocalOutfits(localOutfits.filter(o => String(o.id) !== String(outfitId)));
        await addDeletedId(outfitId);
    } catch (e) {
        console.warn('[OutfitManager] Local cleanup failed:', e.message);
    }

    return { success: true };
}

// ============================================================================
// GET DELETED OUTFITS (Trash Bin)
// ============================================================================

/**
 * Lấy danh sách outfit đã soft-delete (thùng rác).
 * Tự động purge items > 30 ngày.
 */
export async function handleGetDeletedOutfits(data = {}) {
    const limit = Math.min(data?.limit || 50, 100);
    const demoMode = await isDemoMode();
    if (demoMode) return { success: true, outfits: [], total: 0 };

    try {
        const token = await getAuthToken();
        if (!token) throw new Error('NOT_AUTHENTICATED');

        const response = await fetch(
            `${SUPABASE_AUTH_URL}/rest/v1/saved_outfits?deleted_at=not.is.null&order=deleted_at.desc&limit=${limit}&select=id,name,result_image_url,clothing_image_url,model_image_url,deleted_at,created_at`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const deletedOutfits = await response.json();

        // Auto-purge > 30 days
        const now = Date.now();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const toPurge = deletedOutfits.filter(o => now - new Date(o.deleted_at).getTime() > THIRTY_DAYS);
        const toKeep = deletedOutfits.filter(o => now - new Date(o.deleted_at).getTime() <= THIRTY_DAYS);

        // Purge expired in background (fire-and-forget)
        if (toPurge.length > 0) {
            toPurge.forEach(o => {
                handlePermanentDeleteOutfit({ id: o.id }).catch(() => { });
            });
            log('[OutfitManager] Auto-purged', toPurge.length, 'expired trash items');
        }

        // Add daysRemaining for UI
        const outfitsWithDays = toKeep.map(o => ({
            ...o,
            daysRemaining: Math.max(0, Math.ceil((THIRTY_DAYS - (now - new Date(o.deleted_at).getTime())) / (24 * 60 * 60 * 1000))),
        }));

        return { success: true, outfits: outfitsWithDays, total: outfitsWithDays.length };
    } catch (error) {
        console.warn('[OutfitManager] GET_DELETED_OUTFITS error:', error.message);
        return { success: true, outfits: [], total: 0 };
    }
}

// ============================================================================
// RESTORE OUTFIT (from Trash)
// ============================================================================

/**
 * Khôi phục outfit từ thùng rác — set deleted_at = null.
 */
export async function handleRestoreOutfit(data) {
    const outfitId = data?.id;
    if (!outfitId) return { success: false, error: 'MISSING_OUTFIT_ID' };

    try {
        const token = await getAuthToken();
        if (!token) throw new Error('NOT_AUTHENTICATED');

        const response = await fetch(
            `${SUPABASE_AUTH_URL}/rest/v1/saved_outfits?id=eq.${outfitId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation',
                },
                body: JSON.stringify({ deleted_at: null }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            return { success: false, error: errText };
        }

        // Verify restore actually updated a row
        const updatedRows = await response.json();
        if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
            console.error('[OutfitManager] Restore: 0 rows updated for id:', outfitId);
            return { success: false, error: 'NO_ROWS_UPDATED' };
        }

        log('[OutfitManager] Restored outfit:', outfitId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// PERMANENT DELETE OUTFIT
// ============================================================================

/**
 * Xoá vĩnh viễn outfit — DELETE thực sự từ Supabase.
 */
export async function handlePermanentDeleteOutfit(data) {
    const outfitId = data?.id;
    if (!outfitId) return { success: false, error: 'MISSING_OUTFIT_ID' };

    try {
        const token = await getAuthToken();
        if (!token) throw new Error('NOT_AUTHENTICATED');

        const response = await fetch(
            `${SUPABASE_AUTH_URL}/rest/v1/saved_outfits?id=eq.${outfitId}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            return { success: false, error: errText };
        }

        log('[OutfitManager] Permanently deleted outfit:', outfitId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// UTILS
// ============================================================================

/**
 * Normalize image URL for dedup: strip query params (signed tokens).
 * "https://storage.com/img.jpg?token=abc" → "https://storage.com/img.jpg"
 */
function normalizeImageUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname;
    } catch {
        return url;
    }
}

/**
 * Merge và dedup outfits dựa trên normalized result_image_url.
 * Newest first (by created_at).
 */
function mergeAndDedup(outfits) {
    const seenUrls = new Set();
    return outfits
        .filter(o => {
            if (!o?.result_image_url) return false;
            const normalized = normalizeImageUrl(o.result_image_url);
            if (seenUrls.has(normalized)) return false;
            seenUrls.add(normalized);
            return true;
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
