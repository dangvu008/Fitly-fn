/**
 * File: auth_listener.js
 * Purpose: Content script lắng nghe auth state từ web app
 * 
 * Input: postMessage events từ web app
 * Output: Gửi message cho service worker để lưu token
 * 
 * Flow:
 * 1. Lắng nghe window.postMessage
 * 2. Kiểm tra message type = FITLY_AUTH_STATE hoặc FITLY_AUTH_SUCCESS
 * 3. Gửi token cho service worker
 */

(function () {
    'use strict';

    const EXTENSION_AUTH_MESSAGE = 'FITLY_AUTH_STATE';
    const AUTH_SUCCESS_MESSAGE = 'FITLY_AUTH_SUCCESS';

    // Lắng nghe postMessage từ web app
    window.addEventListener('message', (event) => {
        // Chỉ accept messages từ cùng origin (web app)
        if (event.source !== window) return;

        const message = event.data;

        // Handle auth state message (from ExtensionAuthBridge)
        if (message?.type === EXTENSION_AUTH_MESSAGE) {
            // console.log('[FitlyExt] Received auth state from web:', message.payload?.authenticated);

            chrome.runtime.sendMessage({
                type: 'STORE_AUTH_TOKEN',
                payload: message.payload
            }).then((response) => {
                // console.log('[FitlyExt] Auth token stored:', response?.success);
            }).catch((error) => {
                console.error('[FitlyExt] Failed to store auth token:', error);
            });
            return;
        }

        // Handle auth success message (from popup login)
        if (message?.type === AUTH_SUCCESS_MESSAGE) {
            // console.log('[FitlyExt] Received auth success from popup');

            chrome.runtime.sendMessage({
                type: 'AUTH_SUCCESS',
                session: message.session
            }).then((response) => {
                // console.log('[FitlyExt] Auth success processed:', response?.success);
            }).catch((error) => {
                console.error('[FitlyExt] Failed to process auth success:', error);
            });
            return;
        }
    });

    // Khi page load, request auth state từ web app
    // Web app sẽ respond nếu đã logged in
    window.postMessage({ type: 'FITLY_REQUEST_AUTH' }, '*');

    // console.log('[FitlyExt] Auth listener initialized');
})();
