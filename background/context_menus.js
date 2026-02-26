/**
 * File: context_menus.js
 * Purpose: Xử lý các options click chuột phải (Thêm vào tủ đồ, Thử với Fitly)
 * Layer: Application / Controller
 * * Data Contract:
 * - Exports: createContextMenus, handleContextTryonImage, handleContextAddWardrobe
 */

import { inferCategoryFromUrl } from './infer_clothing_category_from_url.js';
import { log } from './debug_logger.js';

export function createContextMenus() {
    chrome.contextMenus.removeAll(() => {
        // Parent menu - xuất hiện khi right-click vào ảnh, link, video, hoặc bất kỳ đâu trên trang
        chrome.contextMenus.create({
            id: 'fitly-parent',
            title: '👗 Fitly Virtual Try-On',
            contexts: ['image', 'link', 'video', 'page']
        });

        chrome.contextMenus.create({
            id: 'fitly-try-on',
            parentId: 'fitly-parent',
            title: '✨ Thử đồ này với Fitly',
            contexts: ['image', 'link', 'video', 'page']
        });

        chrome.contextMenus.create({
            id: 'fitly-add-wardrobe',
            parentId: 'fitly-parent',
            title: '🗂️ Thêm vào tủ đồ',
            contexts: ['image', 'link', 'video', 'page']
        });
    });
}

export async function handleContextTryonImage(data, tab) {
    if (!tab) return { success: false, error: 'No tab context' };

    // STEP 1: Mở sidePanel NGAY LẬP TỨC — phải gọi trước mọi async operation
    // để giữ user gesture context (Chrome yêu cầu user gesture cho sidePanel.open)
    let sidebarOpened = false;
    try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        sidebarOpened = true;
    } catch (e) {
        console.warn('[Fitly] sidePanel.open with windowId failed:', e.message);
        try {
            await chrome.sidePanel.open({ tabId: tab.id });
            sidebarOpened = true;
        } catch (e2) {
            console.warn('[Fitly] sidePanel.open with tabId failed:', e2.message);
        }
    }

    if (!sidebarOpened) {
        console.error('[Fitly] Could not open side panel at all');
        chrome.notifications.create('sidepanel-error-' + Date.now(), {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Fitly',
            message: 'Không thể mở sidebar. Vui lòng click vào icon Fitly trên thanh công cụ.'
        });
        return { success: false, error: 'Could not open side panel' };
    }

    // STEP 2: Lưu pending image vào session storage (sidebar sẽ đọc khi init)
    try {
        await chrome.storage.session.set({
            pending_clothing_image: data.srcUrl,
            pending_source_url: data.pageUrl
        });
    } catch (e) {
        console.warn('[Fitly] Error setting session storage:', e);
    }

    // STEP 3: Gửi message đến tab content script (nếu đang lắng nghe)
    chrome.tabs.sendMessage(tab.id, {
        type: 'CAPTURE_IMAGE',
        imageUrl: data.srcUrl,
        sourceUrl: data.pageUrl
    }).catch(() => { });

    // STEP 4: Gửi SHOW_PENDING_CLOTHING đến sidebar với retry
    // Sidebar cần thời gian để init (auth check, load models, setup listeners...)
    // Retry nhiều lần vì không biết sidebar mất bao lâu để sẵn sàng
    const sendPendingClothing = () => {
        chrome.runtime.sendMessage({
            type: 'SHOW_PENDING_CLOTHING'
        }).catch(() => { });
    };

    // Retry: 800ms, 2000ms, 4000ms — cover sidebar init 1-4 giây
    setTimeout(sendPendingClothing, 800);
    setTimeout(sendPendingClothing, 2000);
    setTimeout(sendPendingClothing, 4000);

    return { success: true };
}

export async function handleContextAddWardrobe(data, tab) {
    if (!tab) return { success: false, error: 'No tab context' };

    try {
        // STEP 1: Mở sidebar NGAY LẬP TỨC — giữ user gesture context
        let sidebarOpened = false;
        try {
            await chrome.sidePanel.open({ windowId: tab.windowId });
            sidebarOpened = true;
        } catch (e) {
            console.warn('[Fitly] sidePanel.open with windowId failed:', e.message);
            try {
                await chrome.sidePanel.open({ tabId: tab.id });
                sidebarOpened = true;
            } catch (e2) {
                console.warn('[Fitly] sidePanel.open with tabId failed:', e2.message);
            }
        }

        if (!sidebarOpened) {
            console.error('[Fitly] Could not open side panel for wardrobe');
            chrome.notifications.create('sidepanel-error-' + Date.now(), {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Fitly',
                message: 'Không thể mở sidebar. Vui lòng click vào icon Fitly trên thanh công cụ.'
            });
            return { success: false, error: 'Could not open side panel' };
        }

        // STEP 2: Extract source name
        let sourceName = 'Web';
        try {
            if (data.pageUrl) {
                sourceName = new URL(data.pageUrl).hostname;
            }
        } catch (e) {
            console.warn('[Fitly] Could not parse pageUrl:', data.pageUrl);
        }

        // STEP 3: Build context text to detect category
        let contextText = '';
        if (data.altText) contextText += ' ' + data.altText;
        if (data.productTitle) contextText += ' ' + data.productTitle;
        if (data.nearbyText) contextText += ' ' + data.nearbyText;

        // STEP 4: Auto-detect category
        const detectedCategory = inferCategoryFromUrl(data.srcUrl, data.pageUrl, contextText);
        log('[Fitly] Detected category:', detectedCategory, '| context:', contextText.trim().slice(0, 80));

        // STEP 5: Store pending wardrobe item vào session storage để sidebar đọc
        await chrome.storage.session.set({
            pending_wardrobe_item: {
                imageUrl: data.srcUrl,
                pageUrl: data.pageUrl || '',
                detectedCategory: detectedCategory,
                sourceName: sourceName,
                altText: data.altText || '',
            }
        });
        log('[Fitly] Stored pending wardrobe item');

        // STEP 6: Gửi message đến sidebar để mở modal — retry nhiều lần
        const sendWardrobeModal = () => {
            chrome.runtime.sendMessage({
                type: 'SHOW_WARDROBE_CATEGORY_MODAL'
            }).catch(() => { });
        };

        // Retry: 800ms, 2000ms, 4000ms — cover sidebar init 1-4 giây
        setTimeout(sendWardrobeModal, 800);
        setTimeout(sendWardrobeModal, 2000);
        setTimeout(sendWardrobeModal, 4000);

        return { success: true };
    } catch (error) {
        console.error('[Fitly] Error in handleContextAddWardrobe:', error);
        chrome.notifications.create('wardrobe-error-' + Date.now(), {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Fitly',
            message: 'Không thể mở tủ đồ. Vui lòng thử lại: ' + error.message
        });
        return { success: false, error: String(error) };
    }
}

