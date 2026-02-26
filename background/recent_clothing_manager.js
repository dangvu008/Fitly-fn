/**
 * File: recent_clothing_manager.js
 * Purpose: Quản lý danh sách quần áo xem/thử đồ gần đây (Recent Clothing)
 * Layer: Application / Feature
 * * Data Contract:
 * - Exports: handleGetRecentClothing, handleSaveRecentClothing, handleDeleteRecentClothing
 */

import { demoState } from './ENVIRONMENT_CONFIG.js';
import { createThumbnailBase64 } from './image_compressor.js';

export async function createClothingThumbnail(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('http')) return null;

    try {
        const response = await fetch(imageUrl, { headers: { 'Accept': 'image/*' } });
        if (!response.ok) return null;

        const blob = await response.blob();
        return await createThumbnailBase64(blob);
    } catch (e) {
        return null;
    }
}

export async function handleGetRecentClothing() {
    const data = await chrome.storage.local.get(['recent_clothing', 'demo_wardrobe']);
    let items = data.recent_clothing || [];

    const wardrobeItems = data.demo_wardrobe || [];
    if (wardrobeItems.length > 0) {
        const existingUrls = new Set(items.map(i => i.imageUrl || i.image_url));
        for (const wItem of wardrobeItems) {
            const url = wItem.image_url || wItem.imageUrl;
            if (url && !existingUrls.has(url)) {
                items.push({
                    id: wItem.id,
                    imageUrl: url,
                    sourceUrl: wItem.source_url || '',
                    name: wItem.name || 'Item',
                    category: wItem.category || null,
                    sourceType: 'online',
                    timestamp: wItem.created_at ? new Date(wItem.created_at).getTime() : Date.now(),
                    tryCount: 0,
                    saved: true,
                });
                existingUrls.add(url);
            }
        }
    }

    if (items.length === 0) {
        items = demoState.recentClothing;
    }

    return { success: true, items };
}

export async function handleSaveRecentClothing(data) {
    const storage = await chrome.storage.local.get('recent_clothing');
    let recentClothing = storage.recent_clothing || [];

    const exists = recentClothing.find(item => item.imageUrl === data.imageUrl);
    if (exists) {
        recentClothing = recentClothing.filter(item => item.imageUrl !== data.imageUrl);
        exists.timestamp = Date.now();
        exists.tryCount = (exists.tryCount || 1) + 1;
        if (!exists.name && data.sourceUrl && !data.sourceUrl.startsWith('data:') && !data.sourceUrl.startsWith('blob:')) {
            try {
                const hostname = new URL(data.sourceUrl).hostname;
                exists.name = hostname.replace('www.', '');
            } catch (_urlErr) {
                // Invalid URL format — name stays empty, fallback to 'Item'
            }
        }
        if (!exists.category && data.category) {
            exists.category = data.category;
        }
        recentClothing.unshift(exists);
    } else {
        const isLocalUpload = data.imageUrl.startsWith('data:') || data.imageUrl.startsWith('blob:');

        let name = data.name;
        if (!name && data.sourceUrl && !data.sourceUrl.startsWith('data:') && !data.sourceUrl.startsWith('blob:')) {
            try {
                const hostname = new URL(data.sourceUrl).hostname;
                name = hostname.replace('www.', '');
            } catch (_urlErr) {
                // Invalid URL format — name stays empty, fallback to 'Item'
            }
        }

        const newItemId = 'clothing-' + Date.now();

        recentClothing.unshift({
            id: newItemId,
            imageUrl: data.imageUrl,
            sourceUrl: data.sourceUrl,
            name: name || 'Item',
            category: data.category || null,
            sourceType: data.sourceType || (isLocalUpload ? 'local_upload' : 'online'),
            cachedKey: data.cachedKey || null,
            timestamp: Date.now(),
            tryCount: 1,
            saved: !!data.saved,
        });

        if (data.imageUrl && data.imageUrl.startsWith('http')) {
            setTimeout(async () => {
                try {
                    const thumb = await createClothingThumbnail(data.imageUrl);
                    if (thumb) {
                        const thumbStore = await chrome.storage.local.get('clothing_thumbnails');
                        const thumbnails = thumbStore.clothing_thumbnails || {};
                        thumbnails[newItemId] = thumb;
                        const keys = Object.keys(thumbnails);
                        if (keys.length > 20) {
                            const oldestKey = keys.reduce((a, b) => thumbnails[a].timestamp < thumbnails[b].timestamp ? a : b);
                            delete thumbnails[oldestKey];
                        }
                        await chrome.storage.local.set({ clothing_thumbnails: thumbnails });
                    }
                } catch (thumbErr) {
                    console.warn('[handleSaveRecentClothing] Background thumbnail creation failed:', thumbErr.message);
                }
            }, 0);
        }
    }

    if (recentClothing.length > 30) {
        recentClothing = recentClothing.slice(0, 30);
    }

    try {
        await chrome.storage.local.set({ recent_clothing: recentClothing });
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Quota exceeded' };
    }
}

export async function handleDeleteRecentClothing(data) {
    // STEP 1: Xóa khỏi recent_clothing (local storage)
    const storage = await chrome.storage.local.get('recent_clothing');
    let recentClothing = storage.recent_clothing || [];
    recentClothing = recentClothing.filter(item => item.imageUrl !== data.imageUrl);
    await chrome.storage.local.set({ recent_clothing: recentClothing });

    // STEP 2: Xóa khỏi demo_wardrobe cache (ngăn item tái xuất hiện khi merge)
    const wardrobeStorage = await chrome.storage.local.get('demo_wardrobe');
    let demoWardrobe = wardrobeStorage.demo_wardrobe || [];
    const beforeLen = demoWardrobe.length;
    demoWardrobe = demoWardrobe.filter(item => {
        const url = item.image_url || item.imageUrl;
        return url !== data.imageUrl;
    });
    if (demoWardrobe.length !== beforeLen) {
        await chrome.storage.local.set({ demo_wardrobe: demoWardrobe });
    }

    // STEP 3: Xóa khỏi Supabase DB (awaited — đảm bảo DB xoá xong trước khi reload wardrobe)
    let dbDeleted = false;
    if (data.clothingId && !data.clothingId.startsWith('clothing-') && !data.clothingId.startsWith('wardrobe-')) {
        try {
            const { getAuthToken } = await import('./auth_state_manager.js');
            const token = await getAuthToken();
            if (token) {
                const { supabase } = await import('../extension/config.js');
                const { error } = await supabase
                    .from('wardrobe_items')
                    .delete()
                    .eq('id', data.clothingId);
                if (error) {
                    console.warn('[Fitly] Failed to delete wardrobe item from DB:', error.message);
                } else {
                    dbDeleted = true;
                    console.log('[Fitly] ✅ Wardrobe item deleted from DB:', data.clothingId);
                }
            }
        } catch (e) {
            // Non-critical: local delete đã thành công
            console.warn('[Fitly] Non-critical: failed to delete from Supabase:', e.message);
        }
    }

    return { success: true, dbDeleted };
}

/**
 * handleDeleteWardrobeItem - Xoá trực tiếp wardrobe item từ Supabase DB + Storage
 * Input: { itemId: string (UUID) }
 * Output: { success: boolean, error?: string }
 *
 * Flow:
 * 1. Lấy item info từ DB (để biết image_url → storage path)
 * 2. Xoá record từ wardrobe_items table
 * 3. Xoá file ảnh từ Storage bucket
 * 4. Xoá khỏi demo_wardrobe local cache
 */
export async function handleDeleteWardrobeItem(data) {
    if (!data.itemId) {
        return { success: false, error: 'Item ID is required' };
    }

    try {
        const { getAuthToken } = await import('./auth_state_manager.js');
        const token = await getAuthToken();
        if (!token) {
            return { success: false, error: 'Not authenticated' };
        }

        const { supabase } = await import('../extension/config.js');

        // STEP 1: Get item to find storage path
        const { data: item, error: fetchErr } = await supabase
            .from('wardrobe_items')
            .select('id, image_url')
            .eq('id', data.itemId)
            .single();

        if (fetchErr) {
            console.warn('[Fitly] Could not fetch wardrobe item for delete:', fetchErr.message);
            // Still try to delete the record even if we can't get storage path
        }

        // STEP 2: Delete DB record
        const { error: deleteErr } = await supabase
            .from('wardrobe_items')
            .delete()
            .eq('id', data.itemId);

        if (deleteErr) {
            console.error('[Fitly] Failed to delete wardrobe item from DB:', deleteErr.message);
            return { success: false, error: deleteErr.message };
        }

        console.log('[Fitly] ✅ Wardrobe item deleted from DB:', data.itemId);

        // STEP 3: Delete from Storage (best-effort, non-blocking)
        if (item?.image_url) {
            try {
                const url = new URL(item.image_url);
                const pathParts = url.pathname.split('/storage/v1/object/public/users/');
                if (pathParts.length > 1) {
                    const storagePath = pathParts[1];
                    await supabase.storage.from('users').remove([storagePath]);
                    console.log('[Fitly] ✅ Storage file deleted:', storagePath);
                }
            } catch (storageErr) {
                // Non-critical: DB record already deleted
                console.warn('[Fitly] Could not delete storage file:', storageErr.message);
            }
        }

        // STEP 4: Also remove from demo_wardrobe local cache
        const wardrobeStorage = await chrome.storage.local.get('demo_wardrobe');
        let demoWardrobe = wardrobeStorage.demo_wardrobe || [];
        const beforeLen = demoWardrobe.length;
        demoWardrobe = demoWardrobe.filter(w => w.id !== data.itemId);
        if (demoWardrobe.length !== beforeLen) {
            await chrome.storage.local.set({ demo_wardrobe: demoWardrobe });
        }

        return { success: true };
    } catch (error) {
        console.error('[Fitly] Exception in handleDeleteWardrobeItem:', error);
        return { success: false, error: error.message };
    }
}

/**
 * handleSaveClothingToWardrobe - Lưu một món đồ từ recent clothing vào wardrobe
 * Input: { imageUrl, sourceUrl, name, category }
 * Output: { success } hoặc { success: false, error }
 *
 * Flow:
 * 1. Gọi handleAddToWardrobe để thêm vào wardrobe
 * 2. Mark item trong recent clothing là đã saved
 */
export async function handleSaveClothingToWardrobe(data) {
    if (!data.imageUrl) {
        return { success: false, error: 'Image URL is required' };
    }

    // Import wardrobe manager để gọi handleAddToWardrobe
    const { handleAddToWardrobe } = await import('./wardrobe_manager.js');

    const result = await handleAddToWardrobe({
        image_url: data.imageUrl,
        source_url: data.sourceUrl,
        name: data.name || 'Saved Item',
        category: data.category || 'other',
    });

    if (result.success) {
        // Mark as saved trong recent clothing
        const storage = await chrome.storage.local.get('recent_clothing');
        let recentClothing = storage.recent_clothing || [];

        recentClothing = recentClothing.map(item => {
            if (item.imageUrl === data.imageUrl) {
                return { ...item, saved: true };
            }
            return item;
        });

        await chrome.storage.local.set({ recent_clothing: recentClothing });
    }

    return result;
}
