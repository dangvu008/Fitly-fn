/**
 * File: inject_sidebar.js
 * Purpose: Content script để inject sidebar và lắng nghe image selection
 * 
 * Input: Messages từ service worker
 * Output: Image selection events, sidebar toggle
 * 
 * Flow:
 * 1. Lắng nghe messages từ background
 * 2. Bật chế độ chọn ảnh khi được yêu cầu
 * 3. Gửi image URL được chọn về sidebar
 * 4. Support for lazy-loaded images and modern image formats
 */

(function () {
    'use strict';

    let isSelectionMode = false;
    let selectedImages = new Set();
    let tooltip = null;

    // ==========================================
    // MESSAGE LISTENER
    // ==========================================

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
            case 'CAPTURE_IMAGE':
                // Gửi image URL về sidebar
                chrome.runtime.sendMessage({
                    type: 'IMAGE_SELECTED',
                    imageUrl: message.imageUrl
                });
                sendResponse({ success: true });
                break;

            case 'START_IMAGE_SELECTION':
                enableImageSelection();
                sendResponse({ success: true });
                break;

            case 'STOP_IMAGE_SELECTION':
                disableImageSelection();
                sendResponse({ success: true });
                break;

            /**
             * GET_IMAGE_CONTEXT: Handled by the enhanced listener below (line ~1430)
             * that uses lastRightClickedElement for better accuracy.
             */

            default:
                sendResponse({ success: false, error: 'Unknown message type' });

        }
        return true;
    });

    // ==========================================
    // IMAGE SELECTION MODE
    // ==========================================

    function enableImageSelection() {
        if (isSelectionMode) return;

        isSelectionMode = true;
        document.body.style.cursor = 'crosshair';

        // Find all images including lazy-loaded ones
        const images = findAllImages();

        images.forEach(img => {
            if (isValidClothingImage(img)) {
                img.classList.add('vt-selectable');
                img.addEventListener('click', handleImageClick, true);
                img.addEventListener('mouseenter', handleImageHover);
                img.addEventListener('mouseleave', handleImageLeave);
                selectedImages.add(img);
            }
        });

        // Check if we found any images
        if (selectedImages.size === 0) {
            showNotification(window.t ? window.t('no_clothing_found') : '😔 Xin lỗi! Không tìm thấy ảnh quần áo phù hợp trên trang này', 'warning');
            showAlternativeOptions();
            disableImageSelection();
            return;
        }

        // Create tooltip
        createTooltip();

        // Add escape listener
        document.addEventListener('keydown', handleEscape);

        // Observe for new images (lazy loading)
        observeNewImages();

        showNotification(`Tìm thấy ${selectedImages.size} ảnh. Click để chọn.`);
    }

    // Show alternative options when image selection fails
    function showAlternativeOptions() {
        // Remove existing modal
        const existing = document.querySelector('.vt-alt-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'vt-alt-modal';
        modal.innerHTML = `
            <div class="vt-alt-content">
                <div class="vt-alt-header">
                    <span class="vt-alt-icon">😔</span>
                    <h3>${window.t ? window.t('cannot_get_image') : 'Không thể lấy ảnh từ trang này'}</h3>
                </div>
                <p>${window.t ? window.t('protected_image_help') : 'Một số trang web bảo vệ ảnh của họ. Đừng lo, bạn có thể thử các cách sau:'}</p>
                <div class="vt-alt-options">
                    <button class="vt-alt-btn vt-alt-url" data-action="paste-url">
                        <span class="vt-alt-btn-icon">🔗</span>
                        <span class="vt-alt-btn-text">
                            <strong>${window.t ? window.t('paste_image_url') : 'Dán URL ảnh'}</strong>
                            <small>${window.t ? window.t('copy_image_address') : 'Chuột phải vào ảnh → Copy image address'}</small>
                        </span>
                    </button>
                    <button class="vt-alt-btn vt-alt-upload" data-action="upload-image">
                        <span class="vt-alt-btn-icon">📤</span>
                        <span class="vt-alt-btn-text">
                            <strong>${window.t ? window.t('upload_image') : 'Tải ảnh lên'}</strong>
                            <small>${window.t ? window.t('upload_image_sub') : 'Chọn ảnh từ máy tính của bạn'}</small>
                        </span>
                    </button>
                    <button class="vt-alt-btn vt-alt-screenshot" data-action="screenshot">
                        <span class="vt-alt-btn-icon">📸</span>
                        <span class="vt-alt-btn-text">
                            <strong>${window.t ? window.t('screenshot') : 'Chụp màn hình'}</strong>
                            <small>${window.t ? window.t('screenshot_sub') : 'Chụp phần ảnh quần áo bạn muốn thử'}</small>
                        </span>
                    </button>
                </div>
                <input type="file" id="vt-alt-file-input" accept="image/*" style="display: none;">
                <button class="vt-alt-close">${window.t ? window.t('close') : 'Đóng'}</button>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listeners
        modal.querySelector('.vt-alt-close').addEventListener('click', () => {
            modal.remove();
        });

        // File input change listener
        modal.querySelector('#vt-alt-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) {
                    showNotification(window.t ? window.t('image_too_large') : 'Ảnh quá lớn (tối đa 10MB)', 'error');
                    return;
                }
                if (!file.type.startsWith('image/')) {
                    showNotification(window.t ? window.t('select_image_file') : 'Vui lòng chọn file ảnh', 'error');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    chrome.runtime.sendMessage({
                        type: 'IMAGE_SELECTED',
                        imageUrl: event.target.result
                    });
                    modal.remove();
                    showNotification(window.t ? window.t('get_image_success') : '✅ Đã tải ảnh lên!', 'success');
                };
                reader.readAsDataURL(file);
            }
        });

        modal.querySelectorAll('.vt-alt-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;

                if (action === 'paste-url') {
                    modal.remove();
                    promptForImageUrl();
                } else if (action === 'upload-image') {
                    // Trigger file input
                    modal.querySelector('#vt-alt-file-input').click();
                } else if (action === 'screenshot') {
                    modal.remove();
                    showNotification('💡 Mẹo: Windows: Win+Shift+S | Mac: Cmd+Shift+4', 'info');
                }
            });
        });

        // Close when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // Prompt user for image URL
    function promptForImageUrl() {
        const url = prompt(window.t ? window.t('paste_url_prompt') : 'Dán URL ảnh quần áo vào đây:\n(Chuột phải vào ảnh → Copy image address)');

        if (url && url.trim()) {
            validateAndUseImageUrl(url.trim());
        }
    }

    // Validate image URL and send to sidebar
    async function validateAndUseImageUrl(url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            showNotification(window.t ? window.t('invalid_url_error') : '❌ URL không hợp lệ. Phải bắt đầu bằng http:// hoặc https://', 'error');
            return;
        }

        showNotification(window.t ? window.t('checking_image_info') : '🔄 Đang kiểm tra ảnh...', 'info');

        try {
            // Try to load the image
            const isValid = await testImageUrl(url);

            if (isValid) {
                chrome.runtime.sendMessage({
                    type: 'IMAGE_SELECTED',
                    imageUrl: url
                });
                showNotification(window.t ? window.t('get_image_success') : '✅ Đã lấy ảnh thành công!', 'success');
            } else {
                showImageLoadError(url);
            }
        } catch (error) {
            console.error('Image validation error:', error);
            showImageLoadError(url);
        }
    }

    // Test if image URL is loadable
    function testImageUrl(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const timeout = setTimeout(() => {
                resolve(false);
            }, 10000);

            img.onload = () => {
                clearTimeout(timeout);
                resolve(true);
            };

            img.onerror = () => {
                clearTimeout(timeout);
                // Still try to use it - some images block direct loading but work through API
                resolve(true);
            };

            img.src = url;
        });
    }

    // Show error when image can't be loaded
    function showImageLoadError(url) {
        // Remove existing modal
        const existing = document.querySelector('.vt-error-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'vt-error-modal';
        modal.innerHTML = `
            <div class="vt-error-content">
                <div class="vt-error-header">
                    <span class="vt-error-icon">😅</span>
                    <h3>${window.t ? window.t('image_unavailable') : 'Oops! Không thể tải ảnh này'}</h3>
                </div>
                <p>${window.t ? window.t('image_protected') : 'Trang web này có thể đang chặn việc lấy ảnh trực tiếp. Điều này khá phổ biến với các trang thương mại điện tử.'}</p>
                <div class="vt-error-suggestion">
                    <strong>${window.t ? window.t('suggestion_label') : '💡 Gợi ý:'}</strong>
                    <ol>
                        <li>${window.t ? window.t('suggest_save_first') : 'Thử lưu ảnh về máy trước'}</li>
                        <li>${window.t ? window.t('suggest_upload_sidebar') : 'Sau đó tải lên trong Fitly sidebar'}</li>
                    </ol>
                </div>
                <div class="vt-error-actions">
                    <button class="vt-error-btn vt-error-retry">${window.t ? window.t('retry_other_url') : 'Thử URL khác'}</button>
                    <button class="vt-error-btn vt-error-use-anyway">${window.t ? window.t('use_anyway') : 'Vẫn thử dùng URL này'}</button>
                    <button class="vt-error-btn vt-error-close">${window.t ? window.t('close') : 'Đóng'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.vt-error-retry').addEventListener('click', () => {
            modal.remove();
            promptForImageUrl();
        });

        modal.querySelector('.vt-error-use-anyway').addEventListener('click', () => {
            modal.remove();
            chrome.runtime.sendMessage({
                type: 'IMAGE_SELECTED',
                imageUrl: url
            });
            showNotification(window.t ? window.t('image_added_warning_local') : 'Đã thêm ảnh. Nếu không hiển thị, hãy thử lưu ảnh về máy.', 'warning');
        });

        modal.querySelector('.vt-error-close').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    function findAllImages() {
        const images = [];

        // Regular img elements
        document.querySelectorAll('img').forEach(img => images.push(img));

        // Background images in divs (common in product pages)
        document.querySelectorAll('[style*="background-image"]').forEach(el => {
            const style = el.getAttribute('style');
            const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (match && match[1]) {
                // Create a fake img-like object for consistent handling
                el._vtImageUrl = match[1];
                images.push(el);
            }
        });

        // Picture elements with source
        document.querySelectorAll('picture source').forEach(source => {
            const srcset = source.getAttribute('srcset');
            if (srcset) {
                const parent = source.closest('picture');
                if (parent) {
                    const img = parent.querySelector('img');
                    if (img) images.push(img);
                }
            }
        });

        return images;
    }

    function isValidClothingImage(element) {
        // Get dimensions
        const rect = element.getBoundingClientRect();
        const width = rect.width || element.naturalWidth || 0;
        const height = rect.height || element.naturalHeight || 0;

        // Minimum size check (at least 100x100)
        if (width < 100 || height < 100) return false;

        // Skip very small images (icons, buttons)
        if (width < 50 && height < 50) return false;

        // Skip hidden images
        if (rect.width === 0 || rect.height === 0) return false;

        // Get image URL
        const src = getImageUrl(element);
        if (!src) return false;

        // Skip data URIs that are too small (probably icons)
        if (src.startsWith('data:') && src.length < 1000) return false;

        // Skip common non-clothing images
        const skipPatterns = [
            /logo/i,
            /icon/i,
            /avatar/i,
            /profile/i,
            /sprite/i,
            /banner/i,
            /badge/i,
            /rating/i,
            /star/i,
            /cart/i,
            /payment/i,
            /visa|mastercard|paypal/i,
            /placeholder/i,
            /loading/i,
            /spinner/i,
        ];

        for (const pattern of skipPatterns) {
            if (pattern.test(src)) return false;
        }

        return true;
    }

    function getImageUrl(element) {
        let url = null;
        // Check for our stored URL (for background images)
        if (element._vtImageUrl) url = element._vtImageUrl;

        if (!url) {
            // Check srcset first for high-res images
            const srcset = element.getAttribute('srcset');
            if (srcset) {
                const sources = srcset.split(',').map(s => s.trim().split(/\s+/));
                // Get the largest image
                let largest = sources[sources.length - 1];
                if (largest && largest[0]) {
                    url = largest[0];
                }
            }
        }

        if (!url) {
            // Check data-src for lazy-loaded images
            const dataSrc = element.getAttribute('data-src') ||
                element.getAttribute('data-lazy-src') ||
                element.getAttribute('data-original');
            if (dataSrc) url = dataSrc;
        }

        if (!url) {
            // Regular src
            url = element.src || element.currentSrc;
        }

        // Đảm bảo URL là absolute
        if (url && !url.startsWith('http') && !url.startsWith('data:')) {
            try {
                return new URL(url, window.location.href).href;
            } catch (e) {
                return url;
            }
        }

        return url;
    }

    function handleImageClick(event) {
        event.preventDefault();
        event.stopPropagation();

        const element = event.currentTarget;
        const imageUrl = getImageUrl(element);

        if (imageUrl) {
            // Send to sidebar
            chrome.runtime.sendMessage({
                type: 'IMAGE_SELECTED',
                imageUrl: imageUrl
            });

            disableImageSelection();
            showNotification('Đã chọn ảnh!', 'success');
        }
    }

    function handleImageHover(event) {
        const element = event.currentTarget;
        const rect = element.getBoundingClientRect();

        if (tooltip) {
            tooltip.style.display = 'block';
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.top = `${rect.top - 40}px`;
        }
    }

    function handleImageLeave() {
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    function disableImageSelection() {
        isSelectionMode = false;
        document.body.style.cursor = '';

        selectedImages.forEach(img => {
            img.classList.remove('vt-selectable');
            img.removeEventListener('click', handleImageClick, true);
            img.removeEventListener('mouseenter', handleImageHover);
            img.removeEventListener('mouseleave', handleImageLeave);
        });
        selectedImages.clear();

        document.removeEventListener('keydown', handleEscape);

        // Remove tooltip
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }

        // Disconnect observer
        if (window._vtObserver) {
            window._vtObserver.disconnect();
            window._vtObserver = null;
        }
    }

    function handleEscape(event) {
        if (event.key === 'Escape') {
            disableImageSelection();
            showNotification('Đã hủy chọn ảnh');
        }
    }

    // ==========================================
    // MUTATION OBSERVER (for lazy-loaded images)
    // ==========================================

    function observeNewImages() {
        if (window._vtObserver) return;

        window._vtObserver = new MutationObserver((mutations) => {
            if (!isSelectionMode) return;

            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeName === 'IMG' && isValidClothingImage(node)) {
                        node.classList.add('vt-selectable');
                        node.addEventListener('click', handleImageClick, true);
                        node.addEventListener('mouseenter', handleImageHover);
                        node.addEventListener('mouseleave', handleImageLeave);
                        selectedImages.add(node);
                    }
                });
            });
        });

        window._vtObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ==========================================
    // UI HELPERS
    // ==========================================

    function createTooltip() {
        tooltip = document.createElement('div');
        tooltip.className = 'vt-tooltip';
        tooltip.textContent = 'Click để thử đồ';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);
    }

    function showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.querySelector('.vt-notification');
        if (existing) existing.remove();

        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠️',
            info: '👗'
        };

        const notification = document.createElement('div');
        notification.className = `vt-notification vt-notification-${type}`;
        notification.innerHTML = `
            <span class="vt-notification-icon">${icons[type] || icons.info}</span>
            <span class="vt-notification-text">${message}</span>
        `;
        document.body.appendChild(notification);

        // Remove after delay (longer for warnings/errors)
        const delay = (type === 'warning' || type === 'error') ? 5000 : 3000;
        setTimeout(() => {
            notification.classList.add('vt-notification-hide');
            setTimeout(() => notification.remove(), 300);
        }, delay);
    }

    // ==========================================
    // FLOATING RESULT POPUPS (on webpage)
    // ==========================================

    let popupContainer = null;
    let activePopups = new Map(); // id -> popup element
    let highestZIndex = 10000;

    // Helper function to escape HTML
    function escapeHtmlContent(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function ensurePopupContainer() {
        if (popupContainer && document.body.contains(popupContainer)) return;

        popupContainer = document.createElement('div');
        popupContainer.id = 'fitly-popup-container';
        popupContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 2147483647;
        `;
        document.body.appendChild(popupContainer);
    }

    function createResultPopup(data) {
        const { id, name, imageUrl, index } = data;
        const displayName = name || `Kết quả #${index}`;

        ensurePopupContainer();

        // Check if popup already exists
        if (activePopups.has(id)) {
            bringPopupToFront(activePopups.get(id));
            return;
        }

        // Calculate position (stagger new popups)
        const popupCount = activePopups.size;
        const baseX = 100 + (popupCount * 40);
        const baseY = 100 + (popupCount * 40);

        const popup = document.createElement('div');
        popup.className = 'fitly-result-popup';
        popup.dataset.id = id;
        popup.style.cssText = `
            position: fixed;
            left: ${baseX}px;
            top: ${baseY}px;
            width: 320px;
            min-width: 200px;
            max-width: 500px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            overflow: hidden;
            pointer-events: auto;
            z-index: ${++highestZIndex};
            resize: both;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        `;

        popup.innerHTML = `
            <div class="fitly-popup-header" style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: #262626;
                border-bottom: 1px solid #333;
                cursor: grab;
                user-select: none;
            ">
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <span style="
                        width: 20px;
                        height: 20px;
                        flex-shrink: 0;
                        background: linear-gradient(135deg, #f97316, #ec4899);
                        border-radius: 5px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 11px;
                        font-weight: 700;
                        color: white;
                    ">${index}</span>
                    <span class="fitly-popup-title" title="Double-click để đổi tên" style="
                        font-size: 13px; 
                        font-weight: 600; 
                        color: white;
                        cursor: text;
                        padding: 2px 6px;
                        border-radius: 4px;
                        transition: background 0.15s;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        max-width: 180px;
                    ">${escapeHtmlContent(displayName)}</span>
                    <button class="fitly-popup-btn fitly-rename-btn" title="Đổi tên" style="
                        width: 20px;
                        height: 20px;
                        border: none;
                        border-radius: 4px;
                        background: transparent;
                        color: #666;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 11px;
                        transition: all 0.15s;
                        flex-shrink: 0;
                    ">✏️</button>
                </div>
                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <button class="fitly-popup-btn fitly-minimize-btn" style="
                        width: 24px;
                        height: 24px;
                        border: none;
                        border-radius: 6px;
                        background: #333;
                        color: #999;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 16px;
                        transition: all 0.15s;
                    ">−</button>
                    <button class="fitly-popup-btn fitly-close-btn" style="
                        width: 24px;
                        height: 24px;
                        border: none;
                        border-radius: 6px;
                        background: #333;
                        color: #999;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 14px;
                        transition: all 0.15s;
                    ">×</button>
                </div>
            </div>
            <div class="fitly-popup-body" style="
                position: relative;
                background: #0a0a0a;
            ">
                <span class="fitly-popup-badge" style="
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background: linear-gradient(135deg, #f97316, #ec4899);
                    color: white;
                    font-size: 11px;
                    font-weight: 600;
                    padding: 4px 10px;
                    border-radius: 6px;
                    z-index: 1;
                    max-width: calc(100% - 80px);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                ">${escapeHtmlContent(displayName)}</span>
                <button class="fitly-toggle-btn" data-showing="after" title="Xem ảnh gốc" style="
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 4px 10px;
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    font-size: 11px;
                    font-weight: 600;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 6px;
                    cursor: pointer;
                    z-index: 2;
                    transition: all 0.15s;
                ">👤 Before</button>
                <img class="fitly-result-img" src="${imageUrl}" alt="Try-on Result" style="
                    width: 100%;
                    display: block;
                    max-height: 450px;
                    object-fit: contain;
                    background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
                " draggable="false">
                <img class="fitly-original-img" src="${data.modelUrl || ''}" alt="Original" style="
                    width: 100%;
                    display: none;
                    max-height: 450px;
                    object-fit: contain;
                    background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
                " draggable="false">
            </div>
            <div class="fitly-popup-actions" style="
                display: flex;
                justify-content: center;
                gap: 10px;
                padding: 10px;
                background: #262626;
                border-top: 1px solid #333;
            ">
                <button class="fitly-action-btn" data-action="copy" title="Copy ảnh (Ctrl+C)" style="
                    width: 38px;
                    height: 38px;
                    border: none;
                    border-radius: 10px;
                    background: #333;
                    color: #ccc;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                ">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                </button>
                <button class="fitly-action-btn" data-action="download" title="Tải về" style="
                    width: 38px;
                    height: 38px;
                    border: none;
                    border-radius: 10px;
                    background: #333;
                    color: #ccc;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                ">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
                <button class="fitly-action-btn" data-action="compare" title="So sánh outfit" style="
                    width: 38px;
                    height: 38px;
                    border: none;
                    border-radius: 10px;
                    background: #333;
                    color: #ccc;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                ">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="8" height="18" rx="1"/>
                        <rect x="14" y="3" width="8" height="18" rx="1"/>
                        <line x1="12" y1="6" x2="12" y2="18" stroke-dasharray="2 2"/>
                    </svg>
                </button>
                <button class="fitly-action-btn" data-action="save" title="Lưu outfit" style="
                    width: 38px;
                    height: 38px;
                    border: none;
                    border-radius: 10px;
                    background: #333;
                    color: #ccc;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                ">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
                    </svg>
                </button>
            </div>
        `;

        popupContainer.appendChild(popup);
        activePopups.set(id, popup);

        // Save popup state to persist across page navigation
        savePopupState();

        // Setup drag
        setupPopupDragOnPage(popup);

        // Setup button events
        setupPopupButtonEvents(popup, data);

        // Add hover effects
        popup.querySelectorAll('.fitly-popup-btn, .fitly-action-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#444';
                btn.style.color = '#fff';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = '#333';
                btn.style.color = btn.classList.contains('fitly-close-btn') ? '#999' : '#ccc';
            });
        });

        // Notify sidebar
        chrome.runtime.sendMessage({ type: 'POPUP_OPENED', id });
    }

    function setupPopupDragOnPage(popup) {
        const header = popup.querySelector('.fitly-popup-header');
        let isDragging = false;
        let startX, startY, initialX, initialY;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.fitly-popup-btn')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = popup.offsetLeft;
            initialY = popup.offsetTop;

            header.style.cursor = 'grabbing';
            bringPopupToFront(popup);

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newX = initialX + dx;
            let newY = initialY + dy;

            // Keep popup on screen
            const rect = popup.getBoundingClientRect();
            newX = Math.max(0, Math.min(window.innerWidth - rect.width, newX));
            newY = Math.max(0, Math.min(window.innerHeight - 50, newY));

            popup.style.left = `${newX}px`;
            popup.style.top = `${newY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'grab';
            }
        });

        // Click to bring to front
        popup.addEventListener('mousedown', () => {
            bringPopupToFront(popup);
        });
    }

    function bringPopupToFront(popup) {
        popup.style.zIndex = ++highestZIndex;
        popup.style.boxShadow = '0 20px 60px rgba(0,0,0,0.6), 0 0 0 2px rgba(249,115,22,0.3)';

        // Remove highlight from others
        activePopups.forEach((p) => {
            if (p !== popup) {
                p.style.boxShadow = '0 20px 60px rgba(0,0,0,0.5)';
            }
        });
    }

    function setupPopupButtonEvents(popup, data) {
        const id = data.id;
        const imageUrl = data.imageUrl;
        const index = data.index;

        // Close button
        popup.querySelector('.fitly-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            closeResultPopupOnPage(id);
        });

        // Minimize button
        const minimizeBtn = popup.querySelector('.fitly-minimize-btn');
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const body = popup.querySelector('.fitly-popup-body');
            const actions = popup.querySelector('.fitly-popup-actions');
            const isMinimized = body.style.display === 'none';

            body.style.display = isMinimized ? 'block' : 'none';
            actions.style.display = isMinimized ? 'flex' : 'none';
            minimizeBtn.textContent = isMinimized ? '−' : '+';
            popup.style.resize = isMinimized ? 'both' : 'none';

            // Save state after minimize/maximize
            savePopupState();
        });

        // Rename button
        const renameBtn = popup.querySelector('.fitly-rename-btn');
        const titleEl = popup.querySelector('.fitly-popup-title');

        const handleRename = () => {
            const currentName = titleEl.textContent;
            const newName = prompt('Đặt tên cho kết quả này:', currentName);

            if (newName !== null) {
                const trimmedName = newName.trim() || `Kết quả #${index}`;
                updatePopupName(popup, trimmedName);

                // Notify sidebar
                chrome.runtime.sendMessage({
                    type: 'RESULT_RENAMED',
                    id: id,
                    name: newName.trim() || null
                });

                showNotification(`Đã đổi tên thành "${trimmedName}"`, 'success');
            }
        };

        renameBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            handleRename();
        });

        // Double-click on title to rename
        titleEl?.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            handleRename();
        });

        // Hover effect on title
        titleEl?.addEventListener('mouseenter', () => {
            titleEl.style.background = 'rgba(255,255,255,0.1)';
        });
        titleEl?.addEventListener('mouseleave', () => {
            titleEl.style.background = 'transparent';
        });

        // Before/After toggle button
        const toggleBtn = popup.querySelector('.fitly-toggle-btn');
        const resultImg = popup.querySelector('.fitly-result-img');
        const originalImg = popup.querySelector('.fitly-original-img');
        const badgeEl = popup.querySelector('.fitly-popup-badge');

        if (toggleBtn && resultImg && originalImg && data.modelUrl) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShowingAfter = toggleBtn.dataset.showing === 'after';

                if (isShowingAfter) {
                    // Show before (original)
                    resultImg.style.display = 'none';
                    originalImg.style.display = 'block';
                    toggleBtn.textContent = '✨ After';
                    toggleBtn.title = 'Xem kết quả thử đồ';
                    toggleBtn.dataset.showing = 'before';
                    if (badgeEl) badgeEl.textContent = 'Ảnh gốc';
                } else {
                    // Show after (result)
                    resultImg.style.display = 'block';
                    originalImg.style.display = 'none';
                    toggleBtn.textContent = '👤 Before';
                    toggleBtn.title = 'Xem ảnh gốc';
                    toggleBtn.dataset.showing = 'after';
                    if (badgeEl) badgeEl.textContent = escapeHtmlContent(data.name || `Kết quả #${index}`);
                }
            });

            // Hover effect
            toggleBtn.addEventListener('mouseenter', () => {
                toggleBtn.style.background = 'rgba(249, 115, 22, 0.8)';
                toggleBtn.style.borderColor = 'rgba(249, 115, 22, 0.5)';
            });
            toggleBtn.addEventListener('mouseleave', () => {
                toggleBtn.style.background = 'rgba(0, 0, 0, 0.7)';
                toggleBtn.style.borderColor = 'rgba(255,255,255,0.2)';
            });
        } else if (toggleBtn && !data.modelUrl) {
            // Hide toggle if no original image
            toggleBtn.style.display = 'none';
        }

        // Action buttons
        popup.querySelectorAll('.fitly-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;

                if (action === 'copy') {
                    await copyImageToClipboard(imageUrl);
                } else if (action === 'download') {
                    downloadImage(imageUrl);
                } else if (action === 'compare') {
                    // Gửi message tới sidebar để mở compare view
                    chrome.runtime.sendMessage({
                        type: 'OPEN_COMPARE_VIEW',
                        data: data
                    });
                    showNotification('Mở so sánh outfit trong sidebar', 'success');
                } else if (action === 'save') {
                    chrome.runtime.sendMessage({
                        type: 'SAVE_RESULT_OUTFIT',
                        data: data
                    });
                    showNotification('Đã lưu outfit!', 'success');
                }
            });
        });
    }

    // Copy image to clipboard
    async function copyImageToClipboard(imageUrl) {
        try {
            showNotification('🔄 Đang copy ảnh...', 'info');

            // Fetch image as blob
            let blob;
            if (imageUrl.startsWith('data:')) {
                // Convert base64 to blob
                const response = await fetch(imageUrl);
                blob = await response.blob();
            } else {
                const response = await fetch(imageUrl);
                blob = await response.blob();
            }

            // Convert to PNG if needed (clipboard requires PNG)
            if (blob.type !== 'image/png') {
                blob = await convertToPng(blob);
            }

            // Copy to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': blob
                })
            ]);

            showNotification('✅ Đã copy ảnh! Paste vào Zalo, Messenger...', 'success');
        } catch (error) {
            console.error('Copy image error:', error);

            // Fallback: copy URL
            try {
                await navigator.clipboard.writeText(imageUrl);
                showNotification('📋 Đã copy link ảnh (không thể copy ảnh trực tiếp)', 'warning');
            } catch (e) {
                showNotification('❌ Không thể copy. Hãy tải về.', 'error');
            }
        }
    }

    // Convert image blob to PNG
    function convertToPng(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                canvas.toBlob((pngBlob) => {
                    if (pngBlob) {
                        resolve(pngBlob);
                    } else {
                        reject(new Error('Failed to convert to PNG'));
                    }
                }, 'image/png');
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    function closeResultPopupOnPage(id) {
        const popup = activePopups.get(id);
        if (popup) {
            popup.remove();
            activePopups.delete(id);
        }

        // Save state after closing
        savePopupState();

        // Notify sidebar
        chrome.runtime.sendMessage({ type: 'POPUP_CLOSED', id });
    }

    function updatePopupName(popup, name) {
        const titleEl = popup.querySelector('.fitly-popup-title');
        const badgeEl = popup.querySelector('.fitly-popup-badge');

        if (titleEl) {
            titleEl.textContent = name;
        }
        if (badgeEl) {
            badgeEl.textContent = name;
        }

        // Save state after renaming
        savePopupState();
    }

    async function downloadImage(imageUrl) {
        try {
            const link = document.createElement('a');
            if (imageUrl.startsWith('data:')) {
                link.href = imageUrl;
            } else {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                link.href = URL.createObjectURL(blob);
            }
            link.download = `fitly-tryon-${Date.now()}.png`;
            link.click();
            showNotification('Đang tải về...', 'success');
        } catch (error) {
            console.error('Download error:', error);
            showNotification('Không thể tải về', 'error');
        }
    }

    async function shareImage(imageUrl) {
        try {
            await navigator.clipboard.writeText(imageUrl);
            showNotification('Đã copy link ảnh!', 'success');
        } catch (error) {
            showNotification('Không thể copy link', 'error');
        }
    }

    // Handle popup messages
    function handlePopupMessages(message, sender, sendResponse) {
        switch (message.type) {
            case 'CREATE_RESULT_POPUP':
                createResultPopup(message.data);
                sendResponse({ success: true });
                break;

            case 'CLOSE_RESULT_POPUP':
                closeResultPopupOnPage(message.data.id);
                sendResponse({ success: true });
                break;

            case 'CLOSE_ALL_POPUPS':
                activePopups.forEach((popup, id) => {
                    popup.remove();
                });
                activePopups.clear();
                sendResponse({ success: true });
                break;

            case 'BRING_POPUP_TO_FRONT':
                const popup = activePopups.get(message.data.id);
                if (popup) {
                    bringPopupToFront(popup);
                }
                sendResponse({ success: true });
                break;

            case 'UPDATE_POPUP_NAME':
                const popupToUpdate = activePopups.get(message.data.id);
                if (popupToUpdate) {
                    updatePopupName(popupToUpdate, message.data.name);
                }
                sendResponse({ success: true });
                break;
        }
    }

    // ==========================================
    // POPUP STATE PERSISTENCE
    // ==========================================

    async function savePopupState() {
        const popupStates = [];
        activePopups.forEach((popup, id) => {
            const rect = popup.getBoundingClientRect();
            const titleEl = popup.querySelector('.fitly-popup-title');
            const bodyEl = popup.querySelector('.fitly-popup-body');
            const isMinimized = bodyEl ? bodyEl.style.display === 'none' : false;

            popupStates.push({
                id: id,
                name: titleEl?.textContent || '',
                imageUrl: popup.querySelector('.fitly-result-img')?.src || '',
                modelUrl: popup.querySelector('.fitly-original-img')?.src || '',
                index: parseInt(popup.querySelector('.fitly-popup-header span')?.textContent) || 1,
                position: { x: rect.left, y: rect.top },
                size: { width: rect.width, height: rect.height },
                isMinimized: isMinimized,
                zIndex: parseInt(popup.style.zIndex) || 10000
            });
        });

        try {
            // Delegate to background to avoid "Access to storage is not allowed" race condition
            await chrome.runtime.sendMessage({
                type: 'SAVE_POPUP_STATE',
                data: popupStates
            });
        } catch (error) {
            console.warn('[Fitly] Could not save popup state:', error);
        }
    }

    async function restorePopups() {
        try {
            // Delegate to background to avoid "Access to storage is not allowed" race condition
            const response = await chrome.runtime.sendMessage({
                type: 'GET_POPUP_STATE'
            });

            const fitly_active_popups = response?.data;
            if (!fitly_active_popups || fitly_active_popups.length === 0) return;

            // Restore each popup
            for (const state of fitly_active_popups) {
                // Re-create popup with saved state
                createResultPopup({
                    id: state.id,
                    name: state.name,
                    imageUrl: state.imageUrl,
                    modelUrl: state.modelUrl,
                    index: state.index
                });

                // Restore position and size
                const popup = activePopups.get(state.id);
                if (popup) {
                    popup.style.left = `${state.position.x}px`;
                    popup.style.top = `${state.position.y}px`;
                    popup.style.width = `${state.size.width}px`;
                    popup.style.zIndex = state.zIndex;

                    // Restore minimized state
                    if (state.isMinimized) {
                        const body = popup.querySelector('.fitly-popup-body');
                        const actions = popup.querySelector('.fitly-popup-actions');
                        const minimizeBtn = popup.querySelector('.fitly-minimize-btn');
                        if (body) body.style.display = 'none';
                        if (actions) actions.style.display = 'none';
                        if (minimizeBtn) minimizeBtn.textContent = '+';
                        popup.style.resize = 'none';
                    }

                    // Update highest z-index
                    if (state.zIndex > highestZIndex) {
                        highestZIndex = state.zIndex;
                    }
                }
            }
        } catch (error) {
            console.warn('[Fitly] Could not restore popups:', error);
        }
    }

    // ==========================================
    // NATIVE CONTEXT MENU HELPER
    // ==========================================

    let lastRightClickedElement = null;

    // Track the last right-clicked element to get context for native menu
    document.addEventListener('contextmenu', (e) => {
        lastRightClickedElement = e.target;
    }, true);

    // ==========================================
    // INIT
    // ==========================================

    // Extend message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Handle popup-related messages
        if (['CREATE_RESULT_POPUP', 'CLOSE_RESULT_POPUP', 'CLOSE_ALL_POPUPS', 'BRING_POPUP_TO_FRONT', 'UPDATE_POPUP_NAME'].includes(message.type)) {
            handlePopupMessages(message, sender, sendResponse);
            return true;
        }

        // Handle native context menu context requests
        if (message.type === 'GET_IMAGE_CONTEXT') {
            let altText = '';
            let productTitle = '';
            let nearbyText = '';

            try {
                // If we didn't capture the element, do a crude DOM search by URL (fallback)
                let target = lastRightClickedElement;
                if (!target || (target.nodeName !== 'IMG' && getImageUrl(target) !== message.imageUrl)) {
                    target = Array.from(document.querySelectorAll('img')).find(img => img.src === message.imageUrl) || lastRightClickedElement;
                }

                if (target) {
                    altText = target.alt || target.title || '';

                    const ancestors = [
                        target.closest('a'),
                        target.closest('[class*="product"]'),
                        target.closest('[class*="item"]'),
                        target.closest('figure'),
                        target.closest('li'),
                        target.closest('article'),
                    ].filter(Boolean);

                    for (const ancestor of ancestors) {
                        const nameEl = ancestor.querySelector('h1,h2,h3,h4,[class*="name"],[class*="title"],[class*="product-name"]');
                        if (nameEl?.textContent?.trim()) {
                            productTitle = nameEl.textContent.trim().slice(0, 120);
                            break;
                        }
                    }

                    const parent = target.parentElement;
                    if (parent) {
                        nearbyText = parent.textContent?.trim().slice(0, 80) || '';
                    }
                }

                if (!altText && !productTitle) {
                    productTitle = document.title?.slice(0, 100) || '';
                }
            } catch (e) {
                console.warn('[Fitly] Error getting image context:', e);
            }

            sendResponse({ altText, productTitle, nearbyText });
            return true;
        }
    });

    // Content script initialized with popup support

    // Restore popups on page load
    restorePopups();

})();
