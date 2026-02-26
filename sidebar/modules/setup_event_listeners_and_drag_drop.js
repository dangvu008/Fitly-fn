/**
 * File: setup_event_listeners_and_drag_drop.js
 * Purpose: Thiết lập toàn bộ event listeners, drag-drop, category tabs, tooltips
 * Layer: Presentation
 *
 * Input: DOM đã loaded, các functions từ modules khác
 * Output: Tất cả UI interactions được bind với handlers
 *
 * Flow:
 * 1. setupEventListeners → bind tất cả DOM events
 * 2. setupDragAndDrop → xử lý kéo thả ảnh
 * 3. initCategoryTabs → tab quần áo (top/bottom/dress/shoes)
 * 4. initTooltipSystem → tooltip global
 * 5. Image URL handling / paste URL modal
 */

function setupEventListeners() {
    elements.errorRetryBtn?.addEventListener('click', async () => {
        showErrorOverlay(false);
        // STEP 1: Silent refresh token trước khi retry
        // Giải quyết root cause: retry khi AUTH_EXPIRED sẽ fail lại vì token vẫn hết hạn
        try {
            await chrome.runtime.sendMessage({ type: 'ENSURE_FRESH_TOKEN' });
        } catch (_) { /* best-effort refresh */ }
        // STEP 2: Retry try-on nếu có đủ data
        if (state.modelImage && (state.selectedItems?.length > 0 || state.clothingImage)) {
            processTryOn();
        }
    });

    elements.errorCloseBtn?.addEventListener('click', () => showErrorOverlay(false));
    elements.successCloseBtn?.addEventListener('click', () => showSuccessOverlay(false));

    elements.loginGoogleBtn?.addEventListener('click', async () => handleSocialLogin('google'));
    document.querySelector('.social-btn.facebook')?.addEventListener('click', () => handleSocialLogin('facebook'));
    document.querySelector('.social-btn.apple')?.addEventListener('click', () => handleSocialLogin('apple'));

    // Auth tabs
    const authTabs = document.querySelectorAll('.auth-tab');
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
            document.getElementById('register-form').classList.toggle('hidden', target !== 'register');
        });
    });

    document.getElementById('menu-logout')?.addEventListener('click', handleLogout);

    // Toggle hiển thị mật khẩu (HTML dùng class "toggle-password")
    document.querySelectorAll('.toggle-password').forEach(toggle => {
        toggle.addEventListener('click', function () {
            const input = this.previousElementSibling;
            const icon = this.querySelector('.material-symbols-outlined') || this;
            if (input && input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility';
            } else if (input) {
                input.type = 'password';
                icon.textContent = 'visibility_off';
            }
        });
    });

    document.querySelector('.forgot-password')?.addEventListener('click', (e) => {
        e.preventDefault();
        showToast(t('check_email_reset'), 'info');
    });

    // ---- Đăng nhập thủ công ----
    document.getElementById('login-submit-btn')?.addEventListener('click', handleEmailLoginSubmit);
    document.getElementById('login-email')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleEmailLoginSubmit(); });
    document.getElementById('login-password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleEmailLoginSubmit(); });

    // ---- Đăng ký thủ công ----
    document.getElementById('register-submit-btn')?.addEventListener('click', handleEmailRegisterSubmit);
    document.getElementById('register-confirm-password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleEmailRegisterSubmit(); });

    // Skip login (đã ẩn, giữ handler phòng khi cần bật lại)
    // document.getElementById('skip-login-btn') handler removed (guest mode disabled)

    // STEP: Logo click → always navigate home (close all overlays)
    document.querySelector('.logo')?.addEventListener('click', () => navigateToHome());

    // STEP: Avatar/Profile button → navigate home if on overlay page, otherwise toggle menu
    elements.profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOverlayPageActive()) {
            navigateToHome();
        } else {
            toggleProfileMenu();
        }
    });

    elements.gemsDisplay?.addEventListener('click', () => toggleGemsPanel());
    document.getElementById('language-btn')?.addEventListener('click', () => toggleLanguagePanel());
    document.getElementById('close-gems-panel')?.addEventListener('click', () => hideGemsPanel());
    document.getElementById('close-language-panel')?.addEventListener('click', () => hideLanguagePanel());

    document.querySelectorAll('.gem-package').forEach(pkg => {
        pkg.addEventListener('click', () => purchaseGems(pkg.dataset.package));
    });

    document.querySelectorAll('.language-option').forEach(opt => {
        opt.addEventListener('click', () => changeLanguage(opt.dataset.lang));
    });

    // Model upload
    elements.modelUploadInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { showToast(t('image_too_large'), 'error'); return; }
        if (!file.type.startsWith('image/')) { showToast(t('select_image_file'), 'error'); return; }
        showToast('⏳ Đang xử lý ảnh...', 'info');
        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawDataUrl = event.target.result;
            try {
                const originalHash = window.generateImageHash ? window.generateImageHash(rawDataUrl) : null;
                state.modelImage = rawDataUrl;
                updateUI();
                const resizedUrl = await resizeImageForStorage(rawDataUrl);
                const added = await addUserModel(resizedUrl, 'upload', originalHash);
                if (added) showToast(t('photo_added_success'), 'success');
            } catch (err) {
                const originalHash = window.generateImageHash ? window.generateImageHash(rawDataUrl) : null;
                const added = await addUserModel(rawDataUrl, 'upload', originalHash);
                if (added) showToast(t('photo_added_success'), 'success');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    elements.pasteUrlBtn?.addEventListener('click', (e) => { e.stopPropagation(); handlePasteUrl(); });

    document.getElementById('clear-clothing-history')?.addEventListener('click', clearClothingHistory);
    elements.clearAllResults?.addEventListener('click', clearAllResults);

    document.getElementById('view-all-results-btn')?.addEventListener('click', () => openGallery());
    document.getElementById('view-gallery-btn')?.addEventListener('click', () => openGallery());
    document.getElementById('close-gallery-btn')?.addEventListener('click', () => closeGallery());

    document.querySelectorAll('.gallery-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeGalleryTab = tab.dataset.tab || 'latest';
            updateGalleryUI();
        });
    });

    elements.clothingImageContainer?.addEventListener('click', () => {
        if (state.selectedItems.length === 0) startImageSelection();
    });

    elements.clothingImageContainer?.addEventListener('dblclick', () => {
        if (state.selectedItems.length > 0) {
            state.selectedItems = [];
            state.clothingImage = null;
            updateUI();
            showToast(t('clothing_removed'));
        }
    });

    elements.tryOnBtn?.addEventListener('click', (e) => processTryOn(e));

    // Inline result buttons
    $('result-download-btn')?.addEventListener('click', () => handleResultDownload());
    $('result-copy-btn')?.addEventListener('click', () => handleResultCopy());
    $('result-save-btn')?.addEventListener('click', () => handleResultSave());
    $('result-compare-btn')?.addEventListener('click', () => openCompareView());
    $('regenerate-btn')?.addEventListener('click', () => handleResultRegenerate());
    $('result-use-model-btn')?.addEventListener('click', () => handleUseResultAsModel());
    $('result-popup-btn')?.addEventListener('click', () => {
        if (state.currentResultId) openResultPopup(state.currentResultId);
        else if (state.results.length > 0) openResultPopup(state.results[0].id);
    });
    $('inline-edit-btn')?.addEventListener('click', () => handleResultEdit());
    $('inline-edit-undo-btn')?.addEventListener('click', () => handleUndoEdit());
    $('inline-edit-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleResultEdit(); }
    });

    // Category Tags for editing
    document.querySelectorAll('.edit-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const suggestion = btn.dataset.suggestion;
            const editInput = $('inline-edit-input');
            if (suggestion && editInput) {
                // Populate input
                const currentVal = editInput.value.trim();
                if (currentVal && !currentVal.includes(suggestion)) {
                    editInput.value = currentVal + ', ' + suggestion;
                } else {
                    editInput.value = suggestion;
                }

                // Add active state to tag for visual feedback
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 500);

                editInput.focus();
            }
        });
    });
    // Satisfaction confirmation buttons
    $('result-satisfied-btn')?.addEventListener('click', () => handleSatisfied());
    $('result-unsatisfied-btn')?.addEventListener('click', () => handleUnsatisfied());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'v' || e.key === 'V') { e.preventDefault(); handlePasteUrl(); }
        if ((e.key === 't' || e.key === 'T') && state.modelImage && state.clothingImage && !state.isProcessing) {
            e.preventDefault(); processTryOn();
        }
        if (e.key === 'Enter' && state.modelImage && state.clothingImage && !state.isProcessing) processTryOn();
        if (e.key === 'Escape' && state.activePopups.length > 0) {
            closeResultPopup(state.activePopups[state.activePopups.length - 1]);
        }
        if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && state.results.length > 0) {
            e.preventDefault(); copyResultImage(state.results[0].imageUrl);
        }
        if ((e.key === 'r' || e.key === 'R') && state.results.length > 0) {
            e.preventDefault();
            const activeId = state.activePopups.length > 0 ? state.activePopups[state.activePopups.length - 1] : state.results[0].id;
            renameResult(activeId);
        }
        if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (state.results[index]) { e.preventDefault(); openResultPopup(state.results[index].id); }
        }
    });

    setupDragAndDrop();
}

// ==========================================
// DRAG & DROP
// ==========================================

function setupDragAndDrop() {
    const dropZones = [
        { element: elements.modelImageContainer, type: 'model' },
        { element: elements.clothingImageContainer, type: 'clothing' }
    ];

    let dragOverlay = null;

    function createDragOverlay() {
        if (dragOverlay) return dragOverlay;
        dragOverlay = document.createElement('div');
        dragOverlay.className = 'drag-overlay';
        dragOverlay.innerHTML = `<div class="drag-content"><span class="drag-icon">📸</span><span class="drag-text">Thả ảnh vào đây</span></div>`;
        return dragOverlay;
    }

    document.body.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        const overlay = createDragOverlay();
        if (!document.body.contains(overlay)) document.body.appendChild(overlay);
        overlay.classList.add('active');
    });

    document.body.addEventListener('dragleave', (e) => {
        if (e.relatedTarget && document.body.contains(e.relatedTarget)) return;
        dragOverlay?.classList.remove('active');
    });

    document.body.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    document.body.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragOverlay?.classList.remove('active');
        const files = e.dataTransfer.files;
        if (files.length === 0) return;
        const file = files[0];
        if (!file.type.startsWith('image/')) { showToast(t('drop_image_file'), 'error'); return; }

        const dropY = e.clientY;
        const bodyRect = document.body.getBoundingClientRect();
        const isTopHalf = dropY < bodyRect.height / 2;
        let targetType = 'clothing';
        if (!state.modelImage) targetType = 'model';
        else if (isTopHalf && state.modelImage) {
            const modelRect = elements.modelImageContainer?.getBoundingClientRect();
            if (modelRect && dropY < modelRect.bottom + 50) targetType = 'model';
        }
        await handleDroppedImage(file, targetType);
    });

    dropZones.forEach(({ element, type }) => {
        if (!element) return;
        element.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); element.classList.add('drag-over'); });
        element.addEventListener('dragleave', (e) => { e.preventDefault(); element.classList.remove('drag-over'); });
        element.addEventListener('drop', async (e) => {
            e.preventDefault(); e.stopPropagation();
            element.classList.remove('drag-over');
            dragOverlay?.classList.remove('active');
            const files = e.dataTransfer.files;
            if (files.length === 0) return;
            const file = files[0];
            if (!file.type.startsWith('image/')) { showToast(t('drop_image_file'), 'error'); return; }
            await handleDroppedImage(file, type);
        });
    });
}

async function handleDroppedImage(file, type) {
    if (file.size > 10 * 1024 * 1024) { showToast(t('image_too_large'), 'error'); return; }
    showToast('📸 Đang xử lý ảnh...', 'info');
    try {
        const imageUrl = await fileToDataUrl(file);
        if (type === 'model') {
            const originalHash = window.generateImageHash ? window.generateImageHash(imageUrl) : null;
            const resizedUrl = await resizeImageForStorage(imageUrl);
            const added = await addUserModel(resizedUrl, 'drag-drop', originalHash);
            if (added) { state.modelImage = resizedUrl; updateUI(); showToast(t('model_photo_added'), 'success'); }
        } else {
            state.clothingImage = imageUrl;
            state.clothingSourceUrl = null;
            updateUI();
            showToast(t('clothing_photo_added'), 'success');
            if (state.modelImage && state.gemsBalance >= GEM_COST_STANDARD) {
                setTimeout(() => showToast(t('press_t_to_try'), 'info'), 1500);
            }
        }
    } catch (error) {
        showToast(t('cannot_read_image'), 'error');
    }
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==========================================
// IMAGE URL PASTE
// ==========================================

async function handlePasteUrl() {
    try {
        const url = await navigator.clipboard.readText();
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            await validateAndSetClothingImage(url.trim());
        } else {
            showToast(t('invalid_url'), 'error');
        }
    } catch (error) {
        const url = prompt('Dán URL ảnh quần áo:\n\n💡 Mẹo: Chuột phải vào ảnh → Copy image address');
        if (url && url.trim() && url.startsWith('http')) {
            await validateAndSetClothingImage(url.trim());
        } else if (url) {
            showToast(t('invalid_url_short'), 'error');
        }
    }
}

async function validateAndSetClothingImage(url) {
    showToast(t('checking_image'), 'info');
    try {
        const isValid = await testImageLoadable(url);
        if (isValid) {
            state.clothingImage = url;
            updateUI();
            showToast(t('image_added_success'), 'success');
        } else {
            showImageErrorModal(url);
        }
    } catch {
        showImageErrorModal(url);
    }
}

function testImageLoadable(url) {
    return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => resolve(false), 8000);
        img.onload = () => { clearTimeout(timeout); resolve(true); };
        img.onerror = () => { clearTimeout(timeout); resolve(true); }; // Network block → still let try
        img.src = url;
    });
}

function showImageErrorModal(url) {
    const existing = document.querySelector('.image-error-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.className = 'image-error-modal';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content">
            <div class="modal-header"><span class="modal-icon">😅</span><h3>Không thể tải ảnh này</h3></div>
            <p>Trang web có thể đang chặn việc lấy ảnh trực tiếp. Đây là điều phổ biến với các trang TMĐT.</p>
            <div class="modal-actions">
                <button class="modal-btn primary" data-action="use-anyway">Vẫn thử dùng URL này</button>
                <button class="modal-btn secondary" data-action="retry">Thử URL khác</button>
                <button class="modal-btn tertiary" data-action="close">Đóng</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-action="use-anyway"]').addEventListener('click', () => { modal.remove(); state.clothingImage = url; updateUI(); showToast(t('image_added_warning'), 'warning'); });
    modal.querySelector('[data-action="retry"]').addEventListener('click', () => { modal.remove(); const newUrl = prompt('Dán URL ảnh quần áo:'); if (newUrl?.trim()?.startsWith('http')) validateAndSetClothingImage(newUrl.trim()); });
    modal.querySelector('[data-action="close"]').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
}

function startImageSelection() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        const url = tabs[0].url || '';
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('edge://')) {
            showCannotSelectModal('protected');
            return;
        }
        chrome.tabs.sendMessage(tabs[0].id, { type: 'START_IMAGE_SELECTION' })
            .then(() => showToast(t('click_clothing_hint')))
            .catch(() => showCannotSelectModal('script'));
    });
}

function showCannotSelectModal(reason) {
    const existing = document.querySelector('.cannot-select-modal');
    if (existing) existing.remove();
    const messages = {
        protected: { title: 'Không thể chọn ảnh trên trang này', description: 'Đây là trang hệ thống. Mở trang web thương mại điện tử để thử đồ.' },
        script: { title: 'Không thể chọn ảnh', description: 'Trang web này có thể đang chặn extension.' }
    };
    const msg = messages[reason] || messages.script;
    const modal = document.createElement('div');
    modal.className = 'cannot-select-modal';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content">
            <div class="modal-header"><span class="modal-icon">😔</span><h3>${msg.title}</h3></div>
            <p>${msg.description}</p>
            <div class="modal-actions">
                <button class="modal-btn primary" data-action="paste">🔗 Dán URL ngay</button>
                <button class="modal-btn tertiary" data-action="close">Đóng</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-action="paste"]').addEventListener('click', () => { modal.remove(); handlePasteUrl(); });
    modal.querySelector('[data-action="close"]').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
}

// ==========================================
// CATEGORY TABS
// ==========================================

function initCategoryTabs() {
    const tabContainer = document.getElementById('category-tabs');
    if (!tabContainer) return;
    // STEP 1: Query đúng class .cat-tab (HTML dùng .cat-tab, không phải .category-tab)
    const tabs = tabContainer.querySelectorAll('.cat-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // STEP 2: Toggle active state
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // STEP 3: Update selected category trong state
            state.selectedCategory = tab.dataset.category || 'top';
            // STEP 4: Re-render clothing list filtered by new category
            if (window.renderClothingHistory) renderClothingHistory();
        });
    });
}

// ==========================================
// TOOLTIP SYSTEM
// ==========================================

let tooltipEl = null;

function initTooltipSystem() {
    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        const text = target.getAttribute('data-tooltip');
        if (!text) return;
        showGlobalTooltip(target, text);
    });
    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) hideGlobalTooltip();
    });
    document.addEventListener('scroll', hideGlobalTooltip, true);
}

function showGlobalTooltip(target, text) {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'global-tooltip';
        document.body.appendChild(tooltipEl);
    }
    tooltipEl.textContent = text;
    const rect = target.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left + rect.width / 2 - tipRect.width / 2}px`;
    tooltipEl.style.top = `${rect.top - tipRect.height - 8}px`;
    tooltipEl.classList.add('visible');
}

function hideGlobalTooltip() {
    tooltipEl?.classList.remove('visible');
}

async function loadCachedFallback(imgElement, cachedKey) {
    if (!cachedKey || !window.imageCache) return;
    try {
        const cached = await window.imageCache.getCachedImage(cachedKey);
        if (cached) {
            imgElement.src = cached;
        } else {
            imgElement.style.display = 'none';
            const parent = imgElement.closest('.clothing-history-item');
            if (parent) { parent.title = 'Ảnh không khả dụng'; parent.style.opacity = '0.5'; }
        }
    } catch (error) {
        console.warn('[Fitly] Cache fallback failed:', error.message);
    }
}

async function cacheLocalUploadImages() {
    if (!window.imageCache) return;
    for (const item of state.recentClothing) {
        const isLocalUpload = item.sourceType === 'local_upload';
        const isDataUrl = item.imageUrl?.startsWith('data:') || item.imageUrl?.startsWith('blob:');
        const key = item.cachedKey || item.id;
        if ((isLocalUpload || isDataUrl) && key && !item._cached) {
            const cached = await window.imageCache.cacheImage(key, item.imageUrl);
            if (cached) {
                item._cached = true;
                if (!item.cachedKey) {
                    item.cachedKey = key;
                    chrome.runtime.sendMessage({ type: 'SAVE_RECENT_CLOTHING', data: { ...item, cachedKey: key } }).catch(() => { });
                }
            }
        }
    }
}

// ==========================================
// NAVIGATE TO HOME — Close all overlay sections
// ==========================================

/**
 * Check if any overlay page (help, wardrobe, all-outfits, share-lookbook) is currently visible
 * @returns {boolean}
 */
function isOverlayPageActive() {
    const overlayIds = ['help-section', 'wardrobe-section', 'all-outfits-section', 'share-lookbook-section'];
    return overlayIds.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });
}

/**
 * Navigate back to home — close all overlay sections and panels
 */
function navigateToHome() {
    // STEP 1: Close overlay pages
    if (typeof closeHelpPage === 'function') closeHelpPage();
    if (typeof closeWardrobe === 'function') closeWardrobe();
    if (typeof closeAllOutfits === 'function') closeAllOutfits();
    if (typeof closeShareLookbook === 'function') closeShareLookbook();

    // STEP 2: Close utility panels
    if (typeof hideGemsPanel === 'function') hideGemsPanel();
    if (typeof hideLanguagePanel === 'function') hideLanguagePanel();
    if (typeof hideProfileMenu === 'function') hideProfileMenu();
}

// Expose ra window
window.setupEventListeners = setupEventListeners;
window.setupDragAndDrop = setupDragAndDrop;
window.handleDroppedImage = handleDroppedImage;
window.fileToDataUrl = fileToDataUrl;
window.handlePasteUrl = handlePasteUrl;
window.validateAndSetClothingImage = validateAndSetClothingImage;
window.testImageLoadable = testImageLoadable;
window.showImageErrorModal = showImageErrorModal;
window.startImageSelection = startImageSelection;
window.showCannotSelectModal = showCannotSelectModal;
window.initCategoryTabs = initCategoryTabs;
window.initTooltipSystem = initTooltipSystem;
window.showGlobalTooltip = showGlobalTooltip;
window.hideGlobalTooltip = hideGlobalTooltip;
window.loadCachedFallback = loadCachedFallback;
window.cacheLocalUploadImages = cacheLocalUploadImages;
window.navigateToHome = navigateToHome;
window.isOverlayPageActive = isOverlayPageActive;
