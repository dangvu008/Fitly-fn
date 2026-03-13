/**
 * File: service_worker.js
 * Purpose: Entry point cho Chrome Extension Service Worker
 * Layer: Infrastructure
 * * Flow:
 * 1. Initialize context menus
 * 2. Setup message routing
 * 3. Handle installation events
 * 4. Setup auto-sync and proactive auth refresh
 */

import { createContextMenus, handleContextTryonImage, handleContextAddWardrobe } from './background/context_menus.js';
import { handleMessage } from './background/message_routing.js';
import { updateCachedAuthState, restoreSupabaseSession, getAuthToken } from './background/auth_state_manager.js';
import { syncFromCloud, startAutoSync, stopAutoSync } from './background/cloud_sync.js';
import { proactiveTokenRefresh, startProactiveRefreshTimer } from './background/auth_handlers.js';
import { supabase } from './extension/config.js';
import { markSessionReady } from './background/session_ready_gate.js';

// Khởi tạo Context Menus khi extension được cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener(() => {
    createContextMenus();
});

// Lắng nghe Context Menu clicks và route đến đúng handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {

    try {
        // Lấy URL ảnh từ context phù hợp
        // Priority 1: srcUrl (thẻ <img> trực tiếp)
        // Priority 2: linkUrl (thẻ <a> với href là ảnh)
        // Priority 3: Session storage (background-image hoặc element phức tạp)
        let imageUrl = info.srcUrl || info.linkUrl || null;
        let altText = '';
        let nearbyText = '';

        // Nếu không có srcUrl/linkUrl, thử lấy từ session storage (content script đã detect)
        if (!imageUrl) {
            try {
                const session = await chrome.storage.session.get(['last_context_menu_image', 'last_context_menu_timestamp']);

                // Chỉ dùng nếu detect trong vòng 2 giây (tránh dùng data cũ)
                if (session.last_context_menu_image &&
                    session.last_context_menu_timestamp &&
                    (Date.now() - session.last_context_menu_timestamp) < 2000) {

                    imageUrl = session.last_context_menu_image.url;
                    altText = session.last_context_menu_image.altText || '';
                    nearbyText = session.last_context_menu_image.nearbyText || '';

                }
            } catch (e) {
                console.warn('[Fitly] Failed to get context menu image from session:', e);
            }
        }

        if (!imageUrl) {
            console.warn('[Fitly] No image URL found in context menu click');
            // Hiển thị notification cho user
            chrome.notifications.create('no-image-' + Date.now(), {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Fitly',
                message: 'Không tìm thấy ảnh. Vui lòng click chuột phải trực tiếp vào ảnh quần áo.'
            });
            return;
        }

        if (info.menuItemId === 'fitly-try-on') {
            await handleContextTryonImage({
                srcUrl: imageUrl,
                pageUrl: info.pageUrl,
                altText,
                nearbyText
            }, tab);
        } else if (info.menuItemId === 'fitly-add-wardrobe') {
            await handleContextAddWardrobe({
                srcUrl: imageUrl,
                pageUrl: info.pageUrl,
                altText,
                nearbyText
            }, tab);
        }
    } catch (error) {
        console.error('[Fitly] Error in context menu handler:', error);
        // Hiển thị notification lỗi
        chrome.notifications.create('error-' + Date.now(), {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Fitly - Lỗi',
            message: 'Đã xảy ra lỗi: ' + error.message
        });
    }
});


// Setup Message Routing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Xử lý message STORE_CONTEXT_MENU_IMAGE từ content script
    if (message.type === 'STORE_CONTEXT_MENU_IMAGE') {
        chrome.storage.session.set({
            last_context_menu_image: message.data,
            last_context_menu_timestamp: Date.now()
        }).then(() => {
            console.log('[Fitly] Stored context menu image from content script');
            sendResponse({ success: true });
        }).catch(err => {
            console.error('[Fitly] Failed to store context menu image:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true; // Keep channel open for async response
    }

    // Popup state persistence — delegate storage.session access to SW
    // to avoid "Access to storage is not allowed" in content scripts
    if (message.type === 'SAVE_POPUP_STATE') {
        chrome.storage.session.set({ fitly_active_popups: message.data })
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'GET_POPUP_STATE') {
        chrome.storage.session.get('fitly_active_popups')
            .then(result => sendResponse({ success: true, data: result.fitly_active_popups || [] }))
            .catch(err => sendResponse({ success: false, data: [], error: err.message }));
        return true;
    }

    // FIX: Handle hover button try-on/wardrobe DIRECTLY — bypass sessionReady gate.
    // These actions don't need auth (only open sidePanel + store pending image).
    // Going through handleMessage() causes: (1) delay from await sessionReady when SW restarts,
    // (2) user gesture context expires → sidePanel.open() fails.
    if (message.type === 'CONTEXT_TRYON_IMAGE') {
        handleContextTryonImage(message.data, sender.tab)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'CONTEXT_ADD_WARDROBE') {
        handleContextAddWardrobe(message.data, sender.tab)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    // Không log quá nhiều để tránh rác console
    if (message.type !== 'GET_AUTH_STATE') {
        // console.log(`[SW] Received message type: ${message.type}`);
    }

    // Gọi hàm định tuyến từ message_routing.js
    handleMessage(message, sender).then(sendResponse);

    // Trả về true để Chrome biết chúng ta sẽ gửi response bất đồng bộ
    return true;
});


// ==========================================
// ALARM-BASED PROACTIVE TOKEN REFRESH
// ==========================================
// chrome.alarms survive SW restarts — unlike setInterval which dies when SW is killed.
// This ensures tokens stay fresh even during idle periods.
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'fitly-token-refresh') {
        console.log('[SW] Token refresh alarm fired');
        await proactiveTokenRefresh();
    }
});

// ==========================================
// STARTUP LOGIC
// ==========================================

// Initial setup khi service worker khởi động
(async () => {
    // Cho phép content scripts truy cập chrome.storage.session
    // (MV3 mặc định chỉ cho service worker + extension pages)
    await chrome.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
    });

    // CRITICAL: Restore Supabase client session từ storage TRƯỚC khi làm bất kỳ thứ gì.
    // Chrome kill SW bất kỳ lúc nào → Supabase client mất in-memory session.
    console.log('[SW] Restoring Supabase session after SW start...');
    await restoreSupabaseSession();
    console.log('[SW] Session restore complete');

    // Cập nhật trạng thái auth cache
    await updateCachedAuthState();

    // Mở cổng — message handler bắt đầu xử lý
    markSessionReady();
    console.log('[SW] Session ready gate OPENED');

    // Kiểm tra xem user có session không, nếu có thì bắt đầu sync
    const token = await getAuthToken();
    if (token) {
        startAutoSync();
        startProactiveRefreshTimer();

        // Initial sync from cloud (delay một chút để tránh block startup)
        setTimeout(async () => {
            await syncFromCloud();
        }, 2000);
    }
})();

// Lắng nghe Supabase auth state changes để bật/tắt sync
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.access_token) {
            startAutoSync();
            if (event === 'SIGNED_IN') {
                syncFromCloud();
            }
        }
    } else if (event === 'SIGNED_OUT') {
        stopAutoSync();
    }
});