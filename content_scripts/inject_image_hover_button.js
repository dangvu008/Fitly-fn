/**
 * File: inject_image_hover_button.js
 * Purpose: Hiển thị nút hover "Thử đồ" + "Thêm vào tủ đồ" trên ảnh quần áo thời trang
 * Layer: Content Script / UI Overlay
 *
 * Input: Ảnh quần áo đã qua bộ lọc detect_fashion_page + detect_clothing_image
 * Output: Floating buttons (try-on + wardrobe) khi hover,
 *         gửi message CONTEXT_TRYON_IMAGE / CONTEXT_ADD_WARDROBE đến background
 *
 * Flow:
 * 1. Check isFashionPage() — nếu false → early return
 * 2. Load locale preference from storage
 * 3. Inject stylesheet
 * 4. Scan ảnh qua isLikelyClothingImage() filter
 * 5. Gắn hover buttons — compact icon-only cho ảnh nhỏ, full buttons cho ảnh lớn
 * 6. Click button → gửi message đến background service worker
 * 7. MutationObserver theo dõi DOM mới (lazy load, infinite scroll)
 *
 * Security: Không log sensitive data. Rate limit scan.
 * Edge Cases: Lazy-loaded images, CSS background images, SPA navigation
 */

(function () {
    'use strict';

    // Tránh inject nhiều lần
    if (window.__fitlyHoverInjected) return;
    window.__fitlyHoverInjected = true;

    // ==========================================
    // LOCALE SETUP
    // ==========================================

    let currentLocale = 'en';

    /** Get localized text for hover button keys */
    function tBtn(key) {
        if (window.i18n && typeof window.i18n.t === 'function') {
            return window.i18n.t(`hover_btn.${key}`, currentLocale);
        }
        // Fallback English
        const fallback = {
            try_on: 'Try On',
            add_wardrobe: 'Wardrobe',
            loading: 'Opening...',
            adding: 'Adding...',
            added: 'Added!',
            tooltip_try: 'Try on with Fitly',
            tooltip_wardrobe: 'Add to Fitly wardrobe',
        };
        return fallback[key] || key;
    }

    /** Load locale preference asynchronously */
    async function loadLocale() {
        try {
            const data = await chrome.storage.local.get('extension_locale');
            if (data.extension_locale) {
                currentLocale = data.extension_locale;
                return;
            }
        } catch (e) {
            // storage unavailable — ignore
        }
        // Fallback to browser language
        const browserLang = (navigator.language || '').split('-')[0];
        const supported = ['en', 'vi', 'ja', 'ko', 'zh', 'th', 'id', 'es', 'fr'];
        if (supported.includes(browserLang)) {
            currentLocale = browserLang;
        }
    }

    // ==========================================
    // WAIT FOR FASHION PAGE DETECTION
    // ==========================================

    /**
     * Chờ detect_fashion_page.js chạy xong, rồi mới quyết định scan.
     * Retry up to 20 lần, mỗi lần 250ms (tổng 5s) — đủ cho SPA/React pages.
     *
     * FIX [Bug #3]: Tăng timeout từ 10×200ms → 20×250ms để handle SPA cần 3s+ để render DOM.
     */
    function waitForFashionDetection(callback) {
        let attempts = 0;
        const maxAttempts = 20;

        function check() {
            if (typeof window.__fitlyIsFashionPage !== 'undefined') {
                callback(window.__fitlyIsFashionPage);
                return;
            }
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(check, 250);
            } else {
                // Fallback: gọi detector trực tiếp nếu available, hoặc false
                const fallback = typeof window.__fitlyDetectFashionPage === 'function'
                    ? window.__fitlyDetectFashionPage()
                    : false;
                callback(fallback);
            }
        }
        check();
    }

    waitForFashionDetection(async (isFashion) => {
        if (!isFashion) return;
        await loadLocale();
        initHoverButtons();
    });

    // ==========================================
    // MAIN INITIALIZATION
    // ==========================================

    function initHoverButtons() {
        // ==========================================
        // CONSTANTS
        // ==========================================

        const COMPACT_THRESHOLD = 250; // px — ảnh nhỏ hơn dùng compact mode
        const MIN_IMAGE_SIZE = 120;    // px — ảnh quá nhỏ không hiện nút

        // ==========================================
        // STYLES
        // ==========================================
        const style = document.createElement('style');
        style.textContent = `
            /* ===== FULL MODE: 2 buttons ===== */
            .fitly-hover-container {
                position: absolute;
                z-index: 2147483646;
                display: flex;
                flex-direction: column;
                gap: 4px;
                top: 8px;
                right: 8px;
                opacity: 0;
                transition: opacity 0.2s ease;
                pointer-events: none;
            }
            .fitly-hover-container-visible {
                opacity: 1 !important;
                pointer-events: all !important;
            }
            .fitly-hover-btn {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 5px 10px;
                color: white;
                font-size: 11px;
                font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                border: none;
                border-radius: 16px;
                cursor: pointer;
                white-space: nowrap;
                pointer-events: all;
                transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
                line-height: 1.2;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
            .fitly-hover-btn:hover {
                transform: scale(1.05);
            }
            .fitly-btn-tryon {
                background: linear-gradient(135deg, rgba(124,58,237,0.9), rgba(219,39,119,0.9));
                box-shadow: 0 2px 10px rgba(124,58,237,0.45);
            }
            .fitly-btn-tryon:hover {
                box-shadow: 0 4px 14px rgba(124,58,237,0.6);
            }
            .fitly-btn-wardrobe {
                background: linear-gradient(135deg, rgba(14,165,233,0.9), rgba(99,102,241,0.9));
                box-shadow: 0 2px 10px rgba(14,165,233,0.40);
            }
            .fitly-btn-wardrobe:hover {
                box-shadow: 0 4px 14px rgba(14,165,233,0.6);
            }
            .fitly-img-wrapper {
                position: relative !important;
            }

            /* ===== COMPACT MODE: single Fitly icon button ===== */
            .fitly-compact-trigger {
                position: absolute;
                z-index: 2147483646;
                top: 6px;
                right: 6px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: none;
                background: linear-gradient(135deg, rgba(124,58,237,0.92), rgba(219,39,119,0.92));
                box-shadow: 0 2px 8px rgba(124,58,237,0.5);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                line-height: 1;
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.15s ease;
                pointer-events: none;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
            .fitly-compact-trigger-visible {
                opacity: 1 !important;
                pointer-events: all !important;
            }
            .fitly-compact-trigger:hover {
                transform: scale(1.12);
                box-shadow: 0 4px 12px rgba(124,58,237,0.65);
            }

            /* ===== COMPACT DROPDOWN ===== */
            .fitly-compact-dropdown {
                position: absolute;
                top: 32px;
                right: 0;
                display: none;
                flex-direction: column;
                gap: 3px;
                background: rgba(30, 30, 40, 0.92);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border-radius: 10px;
                padding: 4px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.3);
                z-index: 2147483647;
                min-width: 110px;
            }
            .fitly-compact-dropdown.fitly-dropdown-open {
                display: flex;
            }
            .fitly-compact-dropdown-item {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                color: white;
                font-size: 11px;
                font-weight: 500;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                border: none;
                border-radius: 7px;
                cursor: pointer;
                white-space: nowrap;
                background: transparent;
                transition: background 0.15s ease;
                line-height: 1.2;
            }
            .fitly-compact-dropdown-item:hover {
                background: rgba(255,255,255,0.12);
            }
        `;
        document.head.appendChild(style);

        // ==========================================
        // BUTTON FACTORY — FULL MODE
        // ==========================================

        function createFullButtonContainer(imageUrl, pageUrl) {
            const container = document.createElement('div');
            container.className = 'fitly-hover-container';
            container.dataset.fitlyBtnContainer = '1';

            // STEP 1: Nút "Thử đồ"
            const tryOnBtn = document.createElement('button');
            tryOnBtn.className = 'fitly-hover-btn fitly-btn-tryon';
            tryOnBtn.innerHTML = `👗 ${tBtn('try_on')}`;
            tryOnBtn.title = tBtn('tooltip_try');

            tryOnBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                tryOnBtn.innerHTML = `⏳ ${tBtn('loading')}`;
                tryOnBtn.style.opacity = '0.7';

                try {
                    // FIX: Timeout safety — avoid hang when SW doesn't respond
                    await Promise.race([
                        chrome.runtime.sendMessage({
                            type: 'CONTEXT_TRYON_IMAGE',
                            data: {
                                srcUrl: imageUrl,
                                pageUrl: pageUrl || window.location.href,
                            }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                } catch (err) {
                    console.warn('[Fitly] Failed to send CONTEXT_TRYON_IMAGE:', err);
                }

                setTimeout(() => {
                    tryOnBtn.innerHTML = `👗 ${tBtn('try_on')}`;
                    tryOnBtn.style.opacity = '1';
                }, 2000);
            });

            // STEP 2: Nút "Thêm vào tủ đồ"
            const wardrobeBtn = document.createElement('button');
            wardrobeBtn.className = 'fitly-hover-btn fitly-btn-wardrobe';
            wardrobeBtn.innerHTML = `🗂️ ${tBtn('add_wardrobe')}`;
            wardrobeBtn.title = tBtn('tooltip_wardrobe');

            wardrobeBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                wardrobeBtn.innerHTML = `⏳ ${tBtn('adding')}`;
                wardrobeBtn.style.opacity = '0.7';

                try {
                    // FIX: Timeout safety — avoid hang when SW doesn't respond
                    await Promise.race([
                        chrome.runtime.sendMessage({
                            type: 'CONTEXT_ADD_WARDROBE',
                            data: {
                                srcUrl: imageUrl,
                                pageUrl: pageUrl || window.location.href,
                            }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                } catch (err) {
                    console.warn('[Fitly] Failed to send CONTEXT_ADD_WARDROBE:', err);
                }

                setTimeout(() => {
                    wardrobeBtn.innerHTML = `✅ ${tBtn('added')}`;
                    wardrobeBtn.style.opacity = '1';
                }, 500);

                setTimeout(() => {
                    wardrobeBtn.innerHTML = `🗂️ ${tBtn('add_wardrobe')}`;
                }, 2500);
            });

            container.appendChild(tryOnBtn);
            container.appendChild(wardrobeBtn);
            return container;
        }

        // ==========================================
        // BUTTON FACTORY — COMPACT MODE
        // ==========================================

        function createCompactButton(imageUrl, pageUrl) {
            const wrapper = document.createElement('div');
            wrapper.dataset.fitlyBtnContainer = '1';
            wrapper.style.cssText = 'position:absolute;top:0;right:0;z-index:2147483646;';

            // STEP 1: Trigger button (Fitly icon)
            const trigger = document.createElement('button');
            trigger.className = 'fitly-compact-trigger';
            trigger.innerHTML = '👗';
            trigger.title = 'Fitly';

            // STEP 2: Dropdown menu
            const dropdown = document.createElement('div');
            dropdown.className = 'fitly-compact-dropdown';

            // Try On action
            const tryOnItem = document.createElement('button');
            tryOnItem.className = 'fitly-compact-dropdown-item';
            tryOnItem.innerHTML = `👗 ${tBtn('try_on')}`;

            tryOnItem.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                tryOnItem.innerHTML = `⏳ ${tBtn('loading')}`;
                try {
                    // FIX: Timeout safety — avoid hang when SW doesn't respond
                    await Promise.race([
                        chrome.runtime.sendMessage({
                            type: 'CONTEXT_TRYON_IMAGE',
                            data: { srcUrl: imageUrl, pageUrl: pageUrl || window.location.href }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                } catch (err) {
                    console.warn('[Fitly] Failed to send CONTEXT_TRYON_IMAGE:', err);
                }
                setTimeout(() => {
                    tryOnItem.innerHTML = `👗 ${tBtn('try_on')}`;
                    dropdown.classList.remove('fitly-dropdown-open');
                }, 1500);
            });

            // Wardrobe action
            const wardrobeItem = document.createElement('button');
            wardrobeItem.className = 'fitly-compact-dropdown-item';
            wardrobeItem.innerHTML = `🗂️ ${tBtn('add_wardrobe')}`;

            wardrobeItem.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                wardrobeItem.innerHTML = `⏳ ${tBtn('adding')}`;
                try {
                    // FIX: Timeout safety — avoid hang when SW doesn't respond
                    await Promise.race([
                        chrome.runtime.sendMessage({
                            type: 'CONTEXT_ADD_WARDROBE',
                            data: { srcUrl: imageUrl, pageUrl: pageUrl || window.location.href }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                } catch (err) {
                    console.warn('[Fitly] Failed to send CONTEXT_ADD_WARDROBE:', err);
                }
                setTimeout(() => {
                    wardrobeItem.innerHTML = `✅ ${tBtn('added')}`;
                }, 400);
                setTimeout(() => {
                    wardrobeItem.innerHTML = `🗂️ ${tBtn('add_wardrobe')}`;
                    dropdown.classList.remove('fitly-dropdown-open');
                }, 2000);
            });

            dropdown.appendChild(tryOnItem);
            dropdown.appendChild(wardrobeItem);

            // STEP 3: Toggle dropdown on click
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropdown.classList.toggle('fitly-dropdown-open');
            });

            // Close dropdown when leaving the wrapper
            wrapper.addEventListener('mouseleave', () => {
                dropdown.classList.remove('fitly-dropdown-open');
            });

            wrapper.appendChild(trigger);
            wrapper.appendChild(dropdown);
            return { wrapper, trigger };
        }

        // ==========================================
        // IMAGE DETECTION & ATTACHMENT
        // ==========================================

        /** Lấy URL ảnh từ element (img src hoặc CSS background-image) */
        function getImageUrl(el) {
            if (el.tagName === 'IMG') {
                const src = el.currentSrc || el.src || el.dataset.src || '';
                if (src && src.startsWith('http')) return src;
            }
            const bg = window.getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none') {
                const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
                if (match && match[1].startsWith('http')) {
                    return match[1];
                }
            }
            return null;
        }

        function attachHoverButton(el) {
            // Không gắn 2 lần
            if (el.dataset.fitlyAttached) return;
            el.dataset.fitlyAttached = '1';

            // L3 Filter: kiểm tra ảnh có phải quần áo không
            if (typeof window.__fitlyIsLikelyClothingImage === 'function') {
                if (!window.__fitlyIsLikelyClothingImage(el)) return;
            }

            const imageUrl = getImageUrl(el);
            if (!imageUrl) return;

            // Check dimensions — skip images that are too small
            const rect = el.getBoundingClientRect();
            if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) {
                // FIX [Bug #2]: Lazy-loaded images có BoundingClientRect=0 khi chưa load
                // → Đăng ký load event để retry sau khi ảnh render đầy đủ
                if (el.tagName === 'IMG' && !el.complete && (rect.width === 0 || rect.height === 0)) {
                    el.addEventListener('load', () => {
                        delete el.dataset.fitlyAttached; // Reset để có thể attach lại
                        attachHoverButton(el);
                    }, { once: true });
                }
                return;
            }

            // STEP 1: Find best anchor element for button placement
            // Prefer a parent that already has position:relative and contains the image
            let anchor = el;

            // FIX [Bug #5]: Expand anchor detection — handle <a>, <picture>, <figure>,
            // và cả <div> wrapper bất kỳ có overflow:hidden (pattern phổ biến trên Shopee/Lazada)
            const parent = el.parentElement;
            if (parent) {
                if (parent.tagName === 'A' || parent.tagName === 'PICTURE' || parent.tagName === 'FIGURE') {
                    anchor = parent;
                    if (anchor.dataset.fitlyAttached) return;
                    anchor.dataset.fitlyAttached = '1';
                } else {
                    // Check nếu parent div/span có overflow:hidden → dùng parent làm anchor
                    // để tránh buttons bị clipped
                    try {
                        const parentOv = window.getComputedStyle(parent).overflow;
                        if (parentOv === 'hidden' || parentOv === 'clip') {
                            anchor = parent;
                            if (anchor.dataset.fitlyAttached) return;
                            anchor.dataset.fitlyAttached = '1';
                        }
                    } catch (e) {
                        // getComputedStyle failed — skip
                    }
                }
            }

            // STEP 2: Ensure anchor has position for absolute children
            const pos = window.getComputedStyle(anchor).position;
            if (pos === 'static') {
                anchor.style.position = 'relative';
            }

            // STEP 3: Fix overflow:hidden on anchor itself + ancestors (up to 5 levels)
            // FIX [Bug #1]: Bắt đầu từ chính anchor (không phải anchor.parentElement)
            // Shopee/Lazada thường có overflow:hidden trực tiếp trên <a> hoặc card container
            try {
                const anchorOv = window.getComputedStyle(anchor).overflow;
                if (anchorOv === 'hidden' || anchorOv === 'clip') {
                    anchor.style.overflow = 'visible';
                }
            } catch (e) {
                // getComputedStyle failed — skip
            }

            let parentEl = anchor.parentElement;
            for (let i = 0; i < 5 && parentEl; i++) {
                try {
                    const ov = window.getComputedStyle(parentEl).overflow;
                    if (ov === 'hidden' || ov === 'clip') {
                        parentEl.style.overflow = 'visible';
                    }
                } catch (e) {
                    // skip
                }
                parentEl = parentEl.parentElement;
            }

            const isCompact = rect.width < COMPACT_THRESHOLD;

            if (isCompact) {
                // COMPACT MODE — single icon trigger + dropdown
                const { wrapper, trigger } = createCompactButton(imageUrl, window.location.href);
                anchor.appendChild(wrapper);

                anchor.addEventListener('mouseenter', () => {
                    trigger.classList.add('fitly-compact-trigger-visible');
                });

                anchor.addEventListener('mouseleave', (e) => {
                    if (!wrapper.contains(e.relatedTarget)) {
                        trigger.classList.remove('fitly-compact-trigger-visible');
                    }
                });

                wrapper.addEventListener('mouseleave', (e) => {
                    if (!anchor.contains(e.relatedTarget)) {
                        trigger.classList.remove('fitly-compact-trigger-visible');
                    }
                });
            } else {
                // FULL MODE — 2 buttons
                const container = createFullButtonContainer(imageUrl, window.location.href);
                anchor.appendChild(container);

                anchor.addEventListener('mouseenter', () => {
                    container.classList.add('fitly-hover-container-visible');
                });

                anchor.addEventListener('mouseleave', (e) => {
                    if (!container.contains(e.relatedTarget)) {
                        container.classList.remove('fitly-hover-container-visible');
                    }
                });

                container.addEventListener('mouseleave', (e) => {
                    if (!anchor.contains(e.relatedTarget)) {
                        container.classList.remove('fitly-hover-container-visible');
                    }
                });
            }
        }

        // ==========================================
        // SCAN & OBSERVE
        // ==========================================

        /** Quét ảnh trong container, áp dụng bộ lọc */
        function scanImages(root = document) {
            // Quét <img> tags
            root.querySelectorAll('img').forEach(img => {
                if (!img.dataset.fitlyAttached) {
                    attachHoverButton(img);
                }
            });

            // Quét các div/a có background-image
            const bgCandidates = root.querySelectorAll('[style*="background-image"], [style*="background:"]');
            bgCandidates.forEach(el => {
                if (!el.dataset.fitlyAttached) {
                    attachHoverButton(el);
                }
            });
        }

        // Initial scan sau khi trang load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => scanImages());
        } else {
            // Delay nhỏ để ảnh lazy-load kịp render
            setTimeout(() => scanImages(), 500);
        }

        // Theo dõi DOM thay đổi (lazy load, infinite scroll)
        let scanTimeout = null;
        const observer = new MutationObserver((mutations) => {
            // Debounce scan — tránh quá nhiều scan liên tục
            if (scanTimeout) clearTimeout(scanTimeout);
            scanTimeout = setTimeout(() => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;

                        if (node.tagName === 'IMG') {
                            attachHoverButton(node);
                            // FIX [Bug #4]: Nếu ảnh chưa load xong → retry sau khi load
                            if (!node.complete) {
                                node.addEventListener('load', () => {
                                    delete node.dataset.fitlyAttached;
                                    attachHoverButton(node);
                                }, { once: true });
                            }
                        }
                        node.querySelectorAll?.('img').forEach(img => {
                            attachHoverButton(img);
                            // FIX [Bug #4]: Same retry for child images
                            if (!img.complete) {
                                img.addEventListener('load', () => {
                                    delete img.dataset.fitlyAttached;
                                    attachHoverButton(img);
                                }, { once: true });
                            }
                        });
                    }
                }
            }, 300);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // ==========================================
        // CONTEXT MENU DETECTOR (preserved from original)
        // ==========================================

        document.addEventListener('contextmenu', (event) => {
            const imageInfo = detectImageFromContextMenu(event.target);

            if (imageInfo) {
                try {
                    chrome.runtime.sendMessage({
                        type: 'STORE_CONTEXT_MENU_IMAGE',
                        data: imageInfo
                    }).catch(err => {
                        console.warn('[Fitly] Failed to send context menu image:', err);
                    });
                } catch (err) {
                    console.warn('[Fitly] Error sending message:', err);
                }
            }
        }, true);

        /** Detect ảnh từ element được click chuột phải */
        function detectImageFromContextMenu(element) {
            if (!element) return null;

            // Case 1: <img> trực tiếp
            if (element.tagName === 'IMG' && element.src) {
                return {
                    url: element.currentSrc || element.src,
                    altText: element.alt || '',
                    nearbyText: getNearbyText(element)
                };
            }

            // Case 2: Background image
            const bgImage = getImageUrl(element);
            if (bgImage) {
                return {
                    url: bgImage,
                    altText: element.getAttribute('aria-label') || element.getAttribute('title') || '',
                    nearbyText: getNearbyText(element)
                };
            }

            // Case 3: Parent có background image (traverse 3 levels)
            let parent = element.parentElement;
            let level = 0;
            while (parent && level < 3) {
                const parentBg = getImageUrl(parent);
                if (parentBg) {
                    return {
                        url: parentBg,
                        altText: parent.getAttribute('aria-label') || parent.getAttribute('title') || '',
                        nearbyText: getNearbyText(parent)
                    };
                }
                parent = parent.parentElement;
                level++;
            }

            // Case 4: Child có <img>
            const childImg = element.querySelector('img');
            if (childImg && childImg.src) {
                return {
                    url: childImg.currentSrc || childImg.src,
                    altText: childImg.alt || '',
                    nearbyText: getNearbyText(childImg)
                };
            }

            // Case 5: <picture> element
            if (element.tagName === 'PICTURE') {
                const img = element.querySelector('img');
                if (img && img.src) {
                    return {
                        url: img.currentSrc || img.src,
                        altText: img.alt || '',
                        nearbyText: getNearbyText(img)
                    };
                }
            }

            return null;
        }

        /** Get nearby text for context detection */
        function getNearbyText(element) {
            try {
                let text = element.textContent || '';
                if (element.parentElement) {
                    text += ' ' + element.parentElement.textContent;
                }
                if (element.previousElementSibling) {
                    text += ' ' + element.previousElementSibling.textContent;
                }
                if (element.nextElementSibling) {
                    text += ' ' + element.nextElementSibling.textContent;
                }
                text = text.replace(/\s+/g, ' ').trim();
                return text.slice(0, 200);
            } catch (e) {
                return '';
            }
        }
    }

})();
