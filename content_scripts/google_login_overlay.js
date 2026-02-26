/**
 * File: google_login_overlay.js
 * Purpose: Hiển thị login overlay với Google Sign In button
 * Layer: Presentation
 * 
 * Data Contract:
 * - Input: Message SHOW_LOGIN_OVERLAY từ extension
 * - Output: UI overlay với Google Sign In button
 * 
 * Flow:
 * 1. Nhận message SHOW_LOGIN_OVERLAY
 * 2. Hiển thị overlay với Google button
 * 3. User click -> gọi google_auth_service
 * 4. Auth success -> đóng overlay
 * 
 * Security Note:
 * - OAuth flow được xử lý bởi Supabase Auth
 * - Không lưu credentials trong content script
 */

(function () {
    'use strict';

    const OVERLAY_ID = 'fitly-google-login-overlay';

    // Listen for messages from extension
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SHOW_LOGIN_OVERLAY') {
            showLoginOverlay();
            sendResponse({ success: true });
        } else if (message.type === 'HIDE_LOGIN_OVERLAY') {
            hideLoginOverlay();
            sendResponse({ success: true });
        }
        return true;
    });

    /**
     * Show login overlay with Google Sign In button
     */
    function showLoginOverlay() {
        // Don't create if already exists
        if (document.getElementById(OVERLAY_ID)) {
            // console.log('[FitlyExt] Login overlay already exists');
            return;
        }

        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = `
            <style>
                #${OVERLAY_ID} {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    z-index: 2147483647 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    background: rgba(0, 0, 0, 0.7) !important;
                    backdrop-filter: blur(8px) !important;
                    -webkit-backdrop-filter: blur(8px) !important;
                    animation: fitlyFadeIn 0.3s ease-out !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                }
                
                @keyframes fitlyFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes fitlySlideUp {
                    from { 
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to { 
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                
                #${OVERLAY_ID}.fitly-closing {
                    animation: fitlyFadeOut 0.2s ease-out forwards !important;
                }
                
                @keyframes fitlyFadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                
                #${OVERLAY_ID} .fitly-login-card {
                    position: relative !important;
                    width: 420px !important;
                    max-width: 90vw !important;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
                    border-radius: 24px !important;
                    padding: 48px 40px !important;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8) !important;
                    animation: fitlySlideUp 0.4s ease-out !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
                
                #${OVERLAY_ID} .fitly-close-btn {
                    position: absolute !important;
                    top: 16px !important;
                    right: 16px !important;
                    width: 36px !important;
                    height: 36px !important;
                    border-radius: 50% !important;
                    background: rgba(255, 255, 255, 0.1) !important;
                    color: rgba(255, 255, 255, 0.7) !important;
                    border: none !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 20px !important;
                    font-weight: 300 !important;
                    transition: all 0.2s !important;
                }
                
                #${OVERLAY_ID} .fitly-close-btn:hover {
                    background: rgba(255, 255, 255, 0.2) !important;
                    color: white !important;
                    transform: rotate(90deg) !important;
                }
                
                #${OVERLAY_ID} .fitly-logo {
                    text-align: center !important;
                    margin-bottom: 32px !important;
                }
                
                #${OVERLAY_ID} .fitly-logo-icon {
                    width: 64px !important;
                    height: 64px !important;
                    background: linear-gradient(135deg, #f97316, #ec4899) !important;
                    border-radius: 16px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 32px !important;
                    margin-bottom: 16px !important;
                    box-shadow: 0 8px 16px rgba(249, 115, 22, 0.3) !important;
                }
                
                #${OVERLAY_ID} .fitly-title {
                    font-size: 28px !important;
                    font-weight: 700 !important;
                    color: white !important;
                    margin: 0 0 8px 0 !important;
                    text-align: center !important;
                }
                
                #${OVERLAY_ID} .fitly-subtitle {
                    font-size: 14px !important;
                    color: rgba(255, 255, 255, 0.6) !important;
                    margin: 0 0 32px 0 !important;
                    text-align: center !important;
                    line-height: 1.5 !important;
                }
                
                #${OVERLAY_ID} .fitly-google-btn {
                    width: 100% !important;
                    height: 56px !important;
                    background: white !important;
                    color: #1f2937 !important;
                    border: none !important;
                    border-radius: 14px !important;
                    font-size: 16px !important;
                    font-weight: 600 !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 12px !important;
                    transition: all 0.2s !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
                    margin-bottom: 16px !important;
                }
                
                #${OVERLAY_ID} .fitly-google-btn:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25) !important;
                }
                
                #${OVERLAY_ID} .fitly-google-btn:active {
                    transform: translateY(0) !important;
                }
                
                #${OVERLAY_ID} .fitly-google-btn:disabled {
                    opacity: 0.6 !important;
                    cursor: not-allowed !important;
                    transform: none !important;
                }
                
                #${OVERLAY_ID} .fitly-google-icon {
                    width: 24px !important;
                    height: 24px !important;
                }
                
                #${OVERLAY_ID} .fitly-spinner {
                    width: 20px !important;
                    height: 20px !important;
                    border: 2px solid rgba(31, 41, 55, 0.3) !important;
                    border-top-color: #1f2937 !important;
                    border-radius: 50% !important;
                    animation: fitlySpin 0.8s linear infinite !important;
                }
                
                @keyframes fitlySpin {
                    to { transform: rotate(360deg); }
                }
                
                #${OVERLAY_ID} .fitly-divider {
                    display: flex !important;
                    align-items: center !important;
                    gap: 16px !important;
                    margin: 24px 0 !important;
                    color: rgba(255, 255, 255, 0.4) !important;
                    font-size: 13px !important;
                }
                
                #${OVERLAY_ID} .fitly-divider::before,
                #${OVERLAY_ID} .fitly-divider::after {
                    content: '' !important;
                    flex: 1 !important;
                    height: 1px !important;
                    background: rgba(255, 255, 255, 0.1) !important;
                }
                
                #${OVERLAY_ID} .fitly-features {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 12px !important;
                }
                
                #${OVERLAY_ID} .fitly-feature {
                    display: flex !important;
                    align-items: center !important;
                    gap: 12px !important;
                    color: rgba(255, 255, 255, 0.7) !important;
                    font-size: 13px !important;
                }
                
                #${OVERLAY_ID} .fitly-feature-icon {
                    width: 20px !important;
                    height: 20px !important;
                    background: rgba(249, 115, 22, 0.2) !important;
                    border-radius: 6px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    flex-shrink: 0 !important;
                }
                
                #${OVERLAY_ID} .fitly-error {
                    background: rgba(239, 68, 68, 0.1) !important;
                    border: 1px solid rgba(239, 68, 68, 0.3) !important;
                    color: #fca5a5 !important;
                    padding: 12px 16px !important;
                    border-radius: 10px !important;
                    font-size: 13px !important;
                    margin-bottom: 16px !important;
                    display: none !important;
                }
                
                #${OVERLAY_ID} .fitly-error.show {
                    display: block !important;
                }
            </style>
            
            <div class="fitly-login-card">
                <button class="fitly-close-btn" title="Đóng">×</button>
                
                <div class="fitly-logo">
                    <div class="fitly-logo-icon">👗</div>
                    <h1 class="fitly-title">Fitly AI</h1>
                    <p class="fitly-subtitle">Thử đồ ảo thông minh với AI</p>
                </div>
                
                <div id="fitly-error-message" class="fitly-error"></div>
                
                <button id="fitly-google-signin-btn" class="fitly-google-btn">
                    <svg class="fitly-google-icon" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span id="fitly-btn-text">Đăng nhập với Google</span>
                </button>
                
                <div class="fitly-divider">Bạn sẽ nhận được</div>
                
                <div class="fitly-features">
                    <div class="fitly-feature">
                        <div class="fitly-feature-icon">💎</div>
                        <span>100 Gems miễn phí khi đăng ký</span>
                    </div>
                    <div class="fitly-feature">
                        <div class="fitly-feature-icon">🎨</div>
                        <span>Thử đồ không giới hạn với AI</span>
                    </div>
                    <div class="fitly-feature">
                        <div class="fitly-feature-icon">👔</div>
                        <span>Tủ đồ cá nhân riêng biệt</span>
                    </div>
                </div>
            </div>
        `;

        // Add to page
        document.body.appendChild(overlay);

        // Get elements
        const closeBtn = overlay.querySelector('.fitly-close-btn');
        const googleBtn = overlay.querySelector('#fitly-google-signin-btn');
        const btnText = overlay.querySelector('#fitly-btn-text');
        const errorMessage = overlay.querySelector('#fitly-error-message');

        // Close button handler
        closeBtn.addEventListener('click', hideLoginOverlay);

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideLoginOverlay();
            }
        });

        // ESC key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                hideLoginOverlay();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Google Sign In button handler
        googleBtn.addEventListener('click', async () => {
            try {
                // Disable button
                googleBtn.disabled = true;
                btnText.textContent = 'Đang đăng nhập...';
                googleBtn.innerHTML = `
                    <div class="fitly-spinner"></div>
                    <span>Đang đăng nhập...</span>
                `;
                errorMessage.classList.remove('show');

                // Send message to service worker to handle Google Sign In
                const response = await chrome.runtime.sendMessage({
                    type: 'GOOGLE_SIGN_IN'
                });

                if (response.success) {
                    // console.log('[FitlyExt] Google Sign In successful');
                    
                    // Show success message briefly
                    btnText.textContent = 'Đăng nhập thành công!';
                    
                    // Close overlay after 1 second
                    setTimeout(() => {
                        hideLoginOverlay();
                        
                        // Notify sidebar to refresh
                        chrome.runtime.sendMessage({
                            type: 'AUTH_SUCCESS',
                            user: response.user
                        }).catch(console.error);
                    }, 1000);
                } else {
                    // Show error
                    showError(response.error || 'Đăng nhập thất bại');
                    
                    // Re-enable button
                    googleBtn.disabled = false;
                    googleBtn.innerHTML = `
                        <svg class="fitly-google-icon" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>Đăng nhập với Google</span>
                    `;
                }
            } catch (error) {
                console.error('[FitlyExt] Error during Google Sign In:', error);
                showError('Đã xảy ra lỗi. Vui lòng thử lại.');
                
                // Re-enable button
                googleBtn.disabled = false;
                googleBtn.innerHTML = `
                    <svg class="fitly-google-icon" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Đăng nhập với Google</span>
                `;
            }
        });

        /**
         * Show error message
         */
        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.classList.add('show');
        }

        // console.log('[FitlyExt] Google login overlay shown');
    }

    /**
     * Hide and remove login overlay
     */
    function hideLoginOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;

        // Add closing animation
        overlay.classList.add('fitly-closing');

        // Remove after animation
        setTimeout(() => {
            overlay.remove();
            // console.log('[FitlyExt] Google login overlay hidden');
        }, 200);
    }

    // console.log('[FitlyExt] Google login overlay script initialized');
})();
