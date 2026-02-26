/**
 * File: wardrobe_manager.js
 * Purpose: Quản lý logic thêm, bớt, đọc dữ liệu tủ đồ (Wardrobe items) từ Local Storage hoặc Supabase
 * Layer: Application / Feature
 *
 * Data Contract:
 * - Exports: handleAddToWardrobe, handleGetWardrobe
 *
 * Special routing:
 * - data.category === 'outfit' → lưu vào saved_outfits (không phải wardrobe_items)
 *   Dùng cho ảnh người mẫu toàn thân được thêm từ web làm "Outfit inspiration"
 */

import { supabase } from '../extension/config.js';
import { isDemoMode, isGuestMode, getAuthToken } from './auth_state_manager.js';
import { MOCK_USER, MOCK_WARDROBE, demoState } from './ENVIRONMENT_CONFIG.js';
import { log } from './debug_logger.js';

export async function handleAddToWardrobe(data) {
    const demoMode = await isDemoMode();

    // STEP 0: Block guest user (chưa đăng nhập thực sự) — không phải demo mode cố ý
    if (demoMode) {
        const guest = await isGuestMode();
        if (guest) {
            console.warn('[Fitly] Blocked: guest user tried to add to wardrobe without login.');
            return { success: false, error: 'Cần đăng nhập để lưu vào tủ đồ', requireLogin: true };
        }
    }

    // STEP 1: Nếu user chọn category "outfit" → lưu vào saved_outfits, không vào wardrobe_items
    // Dùng cho ảnh người mẫu toàn thân / lookbook từ web
    if (data.category === 'outfit') {
        const { handleSaveOutfit } = await import('./outfit_manager.js');
        const result = await handleSaveOutfit({
            name: data.name || null,
            result_image_url: data.image_url,
            clothing_image_url: null,
            model_image_url: null,
            source_type: 'external',
            source_url: data.source_url || null,
        });
        // Tag response để modal biết đây là outfit (không phải wardrobe item)
        return { ...result, savedAsOutfit: true };
    }

    // STEP 2: Demo mode → in-memory + local storage
    if (demoMode) {
        const newItem = {
            id: 'wardrobe-' + Date.now(),
            user_id: MOCK_USER.id,
            image_url: data.image_url,
            name: data.name || 'New Item',
            category: data.category || 'other',
            source_url: data.source_url,
            storage_type: data.storage_type || 'external',
            created_at: new Date().toISOString(),
        };

        const storage = await chrome.storage.local.get('demo_wardrobe');
        let wardrobe = storage.demo_wardrobe || [...MOCK_WARDROBE];

        const exists = wardrobe.find(item => item.image_url === data.image_url);
        if (exists) {
            return { success: true, item: exists, message: 'Đã có trong tủ đồ' };
        }

        wardrobe.unshift(newItem);
        await chrome.storage.local.set({ demo_wardrobe: wardrobe });
        demoState.wardrobe = wardrobe;

        log('[Fitly] Added to wardrobe (demo):', newItem.name, 'Total:', wardrobe.length);
        return { success: true, item: newItem };
    }

    // STEP 3: Authenticated → Supabase
    try {
        const token = await getAuthToken();
        if (!token) {
            return { success: false, error: 'Cần đăng nhập để lưu vào tủ đồ' };
        }

        const tokenData = await chrome.storage.local.get('user');
        const userId = tokenData.user?.id;

        if (!userId) {
            return { success: false, error: 'Không tìm thấy thông tin người dùng' };
        }

        const { data: existing } = await supabase
            .from('wardrobe_items')
            .select('id, image_url, name')
            .eq('image_url', data.image_url)
            .maybeSingle();

        if (existing) {
            return { success: true, item: existing, message: 'Đã có trong tủ đồ' };
        }

        const { data: newItem, error } = await supabase
            .from('wardrobe_items')
            .insert({
                user_id: userId,
                image_url: data.image_url,
                name: data.name || 'New Item',
                category: data.category || 'other',
                source_url: data.source_url,
                storage_type: data.storage_type || 'external',
                thumbnail_cached: data.thumbnail_cached || false,
            })
            .select()
            .single();

        if (error) {
            console.error('[Fitly] Error inserting wardrobe item:', error);
            return { success: false, error: 'Không thể lưu vào tủ đồ' };
        }

        const storage = await chrome.storage.local.get('demo_wardrobe');
        let wardrobe = storage.demo_wardrobe || [];
        wardrobe.unshift(newItem);
        await chrome.storage.local.set({ demo_wardrobe: wardrobe });

        log('[Fitly] Added to wardrobe (DB):', newItem.name);
        return { success: true, item: newItem };

    } catch (error) {
        console.error('[Fitly] Exception in handleAddToWardrobe:', error);
        return { success: false, error: error.message };
    }
}

export async function handleGetWardrobe(data = {}) {
    const demoMode = await isDemoMode();

    if (demoMode) {
        const storage = await chrome.storage.local.get('demo_wardrobe');
        let items = storage.demo_wardrobe || [...MOCK_WARDROBE];
        demoState.wardrobe = items;

        if (data.category) {
            items = items.filter(item => item.category === data.category);
        }
        return { success: true, items, total: items.length };
    }

    try {
        const token = await getAuthToken();
        if (!token) {
            const storage = await chrome.storage.local.get('demo_wardrobe');
            let items = storage.demo_wardrobe || [];
            if (data.category) {
                items = items.filter(item => item.category === data.category);
            }
            return { success: true, items, total: items.length };
        }

        let query = supabase
            .from('wardrobe_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (data.category) {
            query = query.eq('category', data.category);
        }

        const { data: items, error } = await query;

        if (error) {
            console.error('[Fitly] Error loading wardrobe:', error);
            const storage = await chrome.storage.local.get('demo_wardrobe');
            let localItems = storage.demo_wardrobe || [];
            if (data.category) {
                localItems = localItems.filter(item => item.category === data.category);
            }
            return { success: true, items: localItems, total: localItems.length };
        }

        await chrome.storage.local.set({ demo_wardrobe: items });
        demoState.wardrobe = items;

        log('[Fitly] Loaded wardrobe from DB:', items.length, 'items');
        return { success: true, items, total: items.length };

    } catch (error) {
        console.error('[Fitly] Exception in handleGetWardrobe:', error);
        const storage = await chrome.storage.local.get('demo_wardrobe');
        let items = storage.demo_wardrobe || [];
        if (data.category) {
            items = items.filter(item => item.category === data.category);
        }
        return { success: true, items, total: items.length };
    }
}
