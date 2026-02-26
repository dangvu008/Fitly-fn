/**
 * File: cloud_sync.js
 * Purpose: Xử lý đồng bộ dữ liệu giữa Local Storage và Supabase Cloud
 * Layer: Application / Infrastructure
 * Data Contract:
 * - Exports: syncToCloud, syncFromCloud, startAutoSync, stopAutoSync
 * Fix Log:
 * - [Fix 4] syncToCloud now checks FEATURES.SYNC_TO_CLOUD same as syncFromCloud
 * - [Fix 5] Unified token retrieval via getAuthToken() for both sync directions
 */

import { getAuthToken } from './auth_state_manager.js';
import { FEATURES, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';
import { log } from './debug_logger.js';

let syncInterval = null;

export async function syncToCloud() {
    // FIX 4: Check feature flag — mirrors the same guard in syncFromCloud
    if (!FEATURES.SYNC_TO_CLOUD) return { success: true, skipped: true };

    try {
        // FIX 5: Use getAuthToken() (same as syncFromCloud) for consistent token resolution
        const accessToken = await getAuthToken();
        if (!accessToken) {
            return { success: false, error: 'Not authenticated' };
        }

        const storageData = await chrome.storage.local.get(['user', 'user_models', 'default_model_id']);
        const userId = storageData.user?.id;
        if (!userId) return { success: false, error: 'No user ID' };

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_AUTH_KEY,
            'Content-Type': 'application/json',
        };

        const models = (storageData.user_models || [])
            .filter(m => m.url && !m.url.startsWith('data:'))
            .map(m => ({
                id: m.id,
                user_id: userId,
                image_url: m.url,
                label: m.label || 'Model',
                source: m.source || 'upload',
                is_default: m.id === storageData.default_model_id,
            }));

        if (models.length > 0) {
            await fetch(`${SUPABASE_URL}/rest/v1/user_models?on_conflict=id`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify(models),
            });
        }

        return { success: true };
    } catch (error) {
        console.error('[Fitly] Cloud sync error:', error);
        return { success: false, error: error.message };
    }
}

export async function syncFromCloud() {
    if (!FEATURES.SYNC_TO_CLOUD) return { success: true, skipped: true };

    try {
        const token = await getAuthToken();
        if (!token) return { success: false, error: 'Not authenticated' };

        const storageData = await chrome.storage.local.get(['user']);
        const userId = storageData.user?.id;

        if (!userId) {
            console.warn('[syncFromCloud] No user ID found');
            return { success: false, error: 'No user ID' };
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/user_models?user_id=eq.${userId}&select=id,image_url,label,source,is_default,created_at&order=created_at.desc&limit=10`, {
            headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_AUTH_KEY },
        });

        if (response.ok) {
            const models = await response.json();
            const validModels = models.filter(m => m.image_url && !m.image_url.startsWith('data:'));
            const updates = {};
            if (validModels.length > 0) {
                updates.user_models = validModels.map(m => ({
                    id: m.id,
                    url: m.image_url,
                    imageUrl: m.image_url,
                    label: m.label,
                    source: m.source,
                    createdAt: m.created_at,
                }));
                const defaultModel = validModels.find(m => m.is_default);
                if (defaultModel) {
                    updates.default_model_id = defaultModel.id;
                }
            }
            if (Object.keys(updates).length > 0) {
                try {
                    await chrome.storage.local.set(updates);
                } catch (quotaErr) {
                    if (quotaErr.message?.includes('QuotaBytes') || quotaErr.message?.includes('QUOTA_BYTES')) {
                        console.warn('[Fitly] Storage quota exceeded during sync, cleaning up old data...');
                        await chrome.storage.local.remove(['fitly_results']);
                        try {
                            await chrome.storage.local.set(updates);
                            log('[Fitly] Synced after cleanup');
                        } catch (retryErr) {
                            console.error('[Fitly] Still cannot sync after cleanup:', retryErr.message);
                        }
                    } else {
                        throw quotaErr;
                    }
                }
            }
        }

        return { success: true };
    } catch (error) {
        console.error('[Fitly] Sync from cloud error:', error);
        return { success: false, error: error.message };
    }
}

export function startAutoSync() {
    if (syncInterval) return;

    syncInterval = setInterval(async () => {
        const token = await getAuthToken();
        if (token) {
            await syncToCloud();
        }
    }, FEATURES.AUTO_SYNC_INTERVAL);
    log('[Fitly SW] Auto-sync started');
}

export function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}
