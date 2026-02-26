/**
 * File: manage_user_models.js
 * Purpose: Quản lý user model photos - load, render, add, delete, set default
 * Layer: Domain
 *
 * Input: Messages từ service worker (GET_USER_MODELS, ADD_USER_MODEL, DELETE, SET_DEFAULT)
 * Output: Cập nhật state.userModels, state.modelImage, render grid UI
 *
 * Flow:
 * 1. loadUserModels → fetch từ service worker → update state
 * 2. renderUserModels → build HTML grid với thumbnail circles
 * 3. Scroll: setupInfiniteScrollForModels (pagination placeholder)
 * 4. addUserModel → gửi lên service worker → reload grid
 * 5. deleteUserModel / setDefaultModel → cập nhật state + re-render
 */

async function loadUserModels() {
    console.log('[ModelLoad] ▶ START loadUserModels()');
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_USER_MODELS' });
        console.log('[ModelLoad] ◀ GET_USER_MODELS response:', {
            success: response?.success,
            modelCount: response?.models?.length,
            defaultModelId: response?.defaultModelId,
            hasThumbnails: !!response?.thumbnails && Object.keys(response.thumbnails || {}).length > 0
        });

        if (response?.success) {
            const realModels = (response.models || []).map(m => ({
                id: m.id,
                imageUrl: m.url || m.imageUrl,
                url: m.url || m.imageUrl,
                createdAt: m.createdAt || m.created_at || m.timestamp || Date.now()
            }));

            console.log('[ModelLoad] realModels mapped:', realModels.length, 'items');
            realModels.forEach((m, i) => {
                const urlPreview = (m.url || '').slice(0, 60);
                console.log(`[ModelLoad]   [${i}] id=${m.id} url=${urlPreview}...`);
            });

            if (realModels.length > 0) {
                state.userModels = realModels;
            } else if (state.userModels.length === 0) {
                state.userModels = [];
            }

            state.defaultModelId = response.defaultModelId;

            // Lưu thumbnails cho fallback offline
            if (response.thumbnails) {
                state.modelThumbnails = response.thumbnails;
            }

            console.log('[ModelLoad] state.defaultModelId =', state.defaultModelId);

            // STEP 1: Try to find and set the default model
            let modelSelected = false;

            if (state.defaultModelId) {
                const defaultModel = state.userModels.find(m => m.id === state.defaultModelId);
                console.log('[ModelLoad] defaultModel found?', !!defaultModel, defaultModel?.id);
                if (defaultModel) {
                    state.modelImage = defaultModel.url;
                    state.selectedModelId = defaultModel.id;
                    modelSelected = true;
                    console.log('[ModelLoad] ✅ state.modelImage SET from default =', (state.modelImage || '').slice(0, 60) + '...');
                } else {
                    console.warn('[ModelLoad] ⚠️ defaultModelId is set but model NOT FOUND — will fallback');
                }
            }

            // STEP 2: Fallback — pick first model if no default was resolved
            if (!modelSelected && state.userModels.length > 0) {
                const fallbackModel = state.userModels[0];
                state.modelImage = fallbackModel.url;
                state.selectedModelId = fallbackModel.id;
                state.defaultModelId = fallbackModel.id;
                modelSelected = true;
                console.log('[ModelLoad] ✅ Fallback to first model:', fallbackModel.id);
            }

            // STEP 3: Always call updateUI when models exist
            if (modelSelected) {
                updateUI();
                console.log('[ModelLoad] ✅ updateUI() called after model selection');
            } else {
                console.log('[ModelLoad] No models available → showing placeholder');
            }

            renderUserModels();
            console.log('[ModelLoad] ✅ renderUserModels() done');
        } else {
            console.error('[ModelLoad] ❌ GET_USER_MODELS failed:', response);
        }
    } catch (error) {
        console.error('[ModelLoad] ❌ Exception in loadUserModels:', error);
    }
    console.log('[ModelLoad] ▶ END loadUserModels(). Final state.modelImage =', state.modelImage ? 'IS SET' : 'null');
}


function renderUserModels() {
    const grid = document.getElementById('user-models-grid');
    if (!grid) return;

    let displayModels = state.userModels || [];
    const isEmpty = displayModels.length === 0;

    // CRITICAL: Deduplicate by imageUrl trước khi render
    const seenUrls = new Set();
    let finalModels = displayModels.filter(m => {
        const url = m.imageUrl || m.url;
        if (!url || seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
    });

    if (finalModels.length > 0) {
        finalModels.sort((a, b) => {
            const aIsActive = state.selectedModelId === a.id || state.modelImage === a.imageUrl;
            const bIsActive = state.selectedModelId === b.id || state.modelImage === b.imageUrl;
            if (aIsActive && !bIsActive) return -1;
            if (!aIsActive && bIsActive) return 1;
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : (parseInt(a.id) || 0);
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : (parseInt(b.id) || 0);
            return bTime - aTime;
        });
    }

    let html = '';

    if (isEmpty) {
        html += ``;
    } else {
        html += `
            <button class="add-model-card" id="add-model-btn-card" title="${t('user_model.add_new_title')}">
                <span class="material-symbols-outlined">add</span>
            </button>
        `;
        const thumbnails = state.modelThumbnails || {};
        html += finalModels.map((item, index) => {
            const isActive = state.selectedModelId === item.id || state.modelImage === item.imageUrl;
            const isDefault = state.defaultModelId === item.id;
            const isPinned = isDefault;
            // Fallback thumbnail cho trường hợp cloud URL load fail
            const thumbSrc = thumbnails[item.id] || '';

            return `
                <div class="user-model-item ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''}"
                     data-id="${item.id}"
                     data-url="${item.imageUrl}"
                     data-thumb="${thumbSrc}"
                     title="${t('user_model.model_image_title').replace('{index}', index + 1)}${isPinned ? ' (' + t('user_model.pinned_badge') + ')' : ''}">
                    <img src="${item.imageUrl}" alt="Model ${index + 1}">                    <div class="item-index">${index + 1}</div>
                    ${isPinned ? '<div class="pin-badge" title="' + t('user_model.pinned_badge') + '"><span class="material-symbols-outlined">push_pin</span></div>' : ''}
                    ${isActive ? '<div class="model-label">' + t('user_model.model_label') + '</div>' : ''}
                </div>
            `;
        }).join('');
    }

    grid.innerHTML = html;

    // Add error handlers for model images (CSP-compliant)
    grid.querySelectorAll('.user-model-item img').forEach(img => {
        img.addEventListener('error', function () {
            if (this.dataset.errorHandled) return;
            this.dataset.errorHandled = 'true';

            // Try fallback thumbnail
            const thumb = this.closest('.user-model-item')?.dataset.thumb;
            if (thumb && this.src !== thumb) {
                this.src = thumb;
                this.closest('.user-model-item')?.classList.add('using-local');
            } else {
                this.style.opacity = '0.3';
            }
        }, { once: true });
    });

    grid.querySelectorAll('.user-model-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            const url = item.dataset.url;
            state.modelImage = url;
            state.selectedModelId = id;
            chrome.storage.local.set({ model_image: url }).catch(console.error);
            updateUI();
            renderUserModels();
        });
    });

    const addBtn = document.getElementById('add-model-btn-card');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            document.getElementById('model-upload-input').click();
        });
    }

    setupInfiniteScrollForModels(grid);
}

/**
 * Purpose: Compress & resize ảnh trước khi lưu vào Chrome storage
 * Input: dataUrl (base64), maxSize (px)
 * Output: Promise<string> - compressed base64 JPEG
 */
function resizeImageForStorage(dataUrl, maxSize = 768) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            if (width <= maxSize && height <= maxSize) {
                if (dataUrl.startsWith('data:image/jpeg') && dataUrl.length < 400000) {
                    resolve(dataUrl);
                    return;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
                return;
            }

            if (width > height) {
                height = Math.round(height * maxSize / width);
                width = maxSize;
            } else {
                width = Math.round(width * maxSize / height);
                height = maxSize;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.65));
        };
        img.onerror = () => reject(new Error('Failed to load image for resize'));
        img.src = dataUrl;
    });
}

function setupInfiniteScrollForModels(grid) {
    if (!grid || grid._scrollObserverSet) return;
    grid._scrollObserverSet = true;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadMoreModels();
            }
        });
    }, { threshold: 0.5 });

    const sentinel = grid.querySelector('.scroll-sentinel');
    if (sentinel) observer.observe(sentinel);
}

async function loadMoreModels() {
    console.log('[Infinite Scroll] Reached end of list');
    // TODO: Implement pagination when backend supports it
}

async function addUserModel(imageUrl, source = 'upload', originalHash = null) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'ADD_USER_MODEL',
            data: { imageUrl, source, originalHash }
        });
        if (response?.success) {
            await loadUserModels();
            if (response.model) {
                state.modelImage = response.model.url;
                state.selectedModelId = response.model.id;
                chrome.storage.local.set({ model_image: response.model.url }).catch(console.error);
                updateUI();
            }
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to add user model:', error);
        return false;
    }
}

async function deleteUserModel(modelId) {
    if (!modelId || modelId.startsWith('mock')) {
        showToast(t('user_model.delete_demo_warning'), 'warning');
        return;
    }
    const confirmed = await showConfirmDialog({
        type: 'delete',
        icon: '🗑️',
        title: t('delete_confirm') || 'Xóa ảnh này?',
        message: t('delete_model_message') || 'Ảnh mẫu này sẽ bị xóa vĩnh viễn.',
        confirmText: t('delete') || 'Xóa',
        cancelText: t('close') || 'Hủy',
    });
    if (!confirmed) return;

    // Tìm URL của model đang xoá để clear luôn thẻ active
    const deletedModel = state.userModels.find(m => m.id === modelId);
    const deletedUrl = deletedModel ? deletedModel.url : null;

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'DELETE_USER_MODEL',
            data: { modelId }
        });
        if (response?.success) {
            // Xoá logic
            if (state.selectedModelId === modelId || state.modelImage === deletedUrl || state.userModels.length <= 1) {
                state.selectedModelId = null;
                state.modelImage = null;
                chrome.storage.local.remove('model_image');
            }
            // Loại trực tiếp khỏi mảng trong memory trước khi load lại db, ép render mượt
            state.userModels = state.userModels.filter(m => m.id !== modelId);

            await loadUserModels(); // Load lại state từ DB (nếu default mới được chọn)
            updateUI();
            renderUserModels(); // Ép render lại tab photos
            removeMainImageActions(); // Remove 2 nút Pin/Xóa trên hình đã bị xóa
            showToast(t('photo_deleted'), 'success');
        } else {
            showToast(response?.error || t('photo_delete_error'), 'error');
        }
    } catch (error) {
        console.error('Failed to delete user model:', error);
        showToast(t('photo_delete_error'), 'error');
    }
}

async function setDefaultModel(modelId) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'SET_DEFAULT_MODEL',
            data: { modelId }
        });
        if (response?.success) {
            state.defaultModelId = modelId;
            if (modelId) {
                const model = state.userModels.find(m => m.id === modelId);
                if (model) {
                    state.modelImage = model.url;
                    state.selectedModelId = modelId;
                    chrome.storage.local.set({ model_image: model.url }).catch(console.error);
                }
                showToast(t('default_set'), 'success');
            } else {
                showToast(t('user_model.unpinned_info'), 'info');
            }
            renderUserModels();
            updateUI();
        }
    } catch (error) {
        console.error('Failed to set default model:', error);
        showToast(t('error_short'), 'error');
    }
}

function renderMainImageActions() {
    removeMainImageActions();
    if (!state.selectedModelId || state.selectedModelId.startsWith('mock')) return;

    const imageWrapper = elements.modelImage?.parentElement;
    if (!imageWrapper) return;

    const isPinned = state.defaultModelId === state.selectedModelId;
    const actionsHTML = `
        <div class="main-image-actions" id="main-image-actions">
            <button class="main-action-btn pin-btn" id="main-pin-btn" title="${isPinned ? t('user_model.unpin_tooltip') : t('user_model.pin_tooltip')}">
                <span class="material-symbols-outlined">${isPinned ? 'keep_off' : 'push_pin'}</span>
                <span class="btn-label">${isPinned ? t('user_model.unpin_action') : t('user_model.pin_action')}</span>
            </button>
            <button class="main-action-btn delete-btn" id="main-delete-btn" title="${t('delete')}">
                <span class="material-symbols-outlined">delete</span>
                <span class="btn-label">${t('delete')}</span>
            </button>
        </div>
    `;
    imageWrapper.insertAdjacentHTML('beforeend', actionsHTML);

    document.getElementById('main-pin-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await (isPinned ? setDefaultModel(null) : setDefaultModel(state.selectedModelId));
    });

    document.getElementById('main-delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteUserModel(state.selectedModelId);
    });
}

function removeMainImageActions() {
    document.getElementById('main-image-actions')?.remove();
}

function setupMainImageClickHandler() {
    const modelImageContainer = document.getElementById('model-image-container');
    const modelImage = document.getElementById('model-image');
    const modelUploadInput = document.getElementById('model-upload-input');

    if (modelImageContainer && modelImage && modelUploadInput) {
        modelImageContainer.addEventListener('click', (e) => {
            if (e.target.closest('.main-image-actions')) return;
            if (state.modelImage && !state.selectedModelId?.startsWith('mock')) {
                openImagePopup(state.modelImage);
            } else {
                modelUploadInput.click();
            }
        });
    }
}

function openImagePopup(imageUrl) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.9);
        z-index: 10000; display: flex; align-items: center;
        justify-content: center; cursor: zoom-out; animation: fadeIn 0.2s ease-out;
    `;

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 90%; max-height: 90%; object-fit: contain;
        border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeBtn.style.cssText = `
        position: absolute; top: 20px; right: 20px; width: 48px; height: 48px;
        border-radius: 50%; background: rgba(255,255,255,0.9); border: none;
        cursor: pointer; display: flex; align-items: center;
        justify-content: center; font-size: 24px; transition: transform 0.2s;
    `;
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.transform = 'scale(1.1)');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.transform = 'scale(1)');

    const closePopup = () => {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => overlay.remove(), 200);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); }, { once: true });

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

// Expose ra window
window.generateImageHash = function (str) {
    if (!str) return null;
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        let chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString(36);
};

window.loadUserModels = loadUserModels;
window.renderUserModels = renderUserModels;
window.resizeImageForStorage = resizeImageForStorage;
window.addUserModel = addUserModel;
window.deleteUserModel = deleteUserModel;
window.setDefaultModel = setDefaultModel;
window.renderMainImageActions = renderMainImageActions;
window.removeMainImageActions = removeMainImageActions;
window.setupMainImageClickHandler = setupMainImageClickHandler;
window.openImagePopup = openImagePopup;
window.setupInfiniteScrollForModels = setupInfiniteScrollForModels;
window.loadMoreModels = loadMoreModels;
