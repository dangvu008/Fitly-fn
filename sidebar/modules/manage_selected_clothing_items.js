/**
 * File: manage_selected_clothing_items.js
 * Purpose: Quản lý danh sách clothing items đã chọn và lịch sử quần áo
 * Layer: Domain
 *
 * Input: Clothing item objects { id, imageUrl, name, category, sourceUrl }
 * Output: Cập nhật state.selectedItems, render bubbles, lưu vào chrome.storage
 *
 * Flow:
 * 1. toggleClothingSelection → add/remove/replace item theo category
 * 2. saveSelectedItems → persist vào chrome.storage.local
 * 3. loadSelectedItems → load từ storage khi init
 * 4. loadRecentClothing → fetch từ service worker
 * 5. renderClothingHistory → render grid với event listeners
 * 6. toggleHideClothingItem → ẩn/hiện item mà không xóa
 */

// Set of hidden item IDs (loaded from storage)
let hiddenClothingIds = new Set();

async function loadHiddenClothingIds() {
    try {
        const result = await chrome.storage.local.get(['hidden_clothing_ids']);
        if (result.hidden_clothing_ids && Array.isArray(result.hidden_clothing_ids)) {
            hiddenClothingIds = new Set(result.hidden_clothing_ids);
        }
    } catch (error) {
        console.error('Failed to load hidden clothing ids:', error);
    }
}

async function toggleHideClothingItem(itemId, imageUrl) {
    // Use imageUrl as fallback key if id is missing
    const key = itemId || imageUrl;
    if (!key) return;

    if (hiddenClothingIds.has(key)) {
        hiddenClothingIds.delete(key);
    } else {
        hiddenClothingIds.add(key);
        // Deselect if currently selected
        const hiddenIdx = state.selectedItems.findIndex(i => i.imageUrl === imageUrl);
        if (hiddenIdx > -1) {
            state.selectedItems.splice(hiddenIdx, 1);
            if (window.updateUI) updateUI();
        }
    }

    try {
        await chrome.storage.local.set({ 'hidden_clothing_ids': [...hiddenClothingIds] });
    } catch (error) {
        console.error('Failed to persist hidden clothing ids:', error);
    }

    renderClothingHistory();
    if (window.renderWardrobeGrid) renderWardrobeGrid();
}

function toggleClothingSelection(item) {
    if (!item.category) {
        item.category = state.selectedCategory || 'top';
    }

    const existingIndex = state.selectedItems.findIndex(i => i.imageUrl === item.imageUrl);

    if (existingIndex > -1) {
        // Deselect current item if it's already selected
        state.selectedItems.splice(existingIndex, 1);
        showToast(`${t('photo_deselected')}: ${getCategoryLabel(item.category)}`, 'info');
    } else {
        // SINGLE MODE: replace all items with the new one
        if (!state.mixMatchMode) {
            if (state.selectedItems.length > 0) {
                state.selectedItems = [];
            }
        } else if (state.selectedItems.length >= MAX_SELECTED_ITEMS) {
            showToast(t('max_items_selected', { count: MAX_SELECTED_ITEMS }), 'warning');
            return false;
        }
        if (!item.imageType) {
            item.imageType = 'unknown';
        }

        // STEP: Duplicate category detection — warn for stacking top/bottom/dress
        const singleCategories = ['top', 'bottom', 'dress'];
        if (singleCategories.includes(item.category)) {
            const duplicates = state.selectedItems.filter(i => i.category === item.category);
            if (duplicates.length > 0) {
                const catLabel = getCategoryLabel(item.category);
                showToast(
                    t('quality_warning.duplicate_category', {
                        count: duplicates.length + 1,
                        category: catLabel
                    }),
                    'warning'
                );
            }
        }

        // STEP: Dress + top/bottom combo warning
        if (item.category === 'dress') {
            const hasTop = state.selectedItems.some(i => i.category === 'top');
            const hasBottom = state.selectedItems.some(i => i.category === 'bottom');
            if (hasTop || hasBottom) {
                showToast(t('quality_warning.combo_dress_conflict'), 'warning');
            }
        } else if (item.category === 'top' || item.category === 'bottom') {
            const hasDress = state.selectedItems.some(i => i.category === 'dress');
            if (hasDress) {
                showToast(t('quality_warning.combo_dress_conflict'), 'warning');
            }
        }

        state.selectedItems.push(item);
        showToast(`${t('photo_selected')}: ${getCategoryLabel(item.category)}`, 'success');
    }

    // Sort selected items: Base layer (dress/top) -> Bottoms -> Outerwear -> Shoes -> Accessories
    const orderMap = { 'dress': 1, 'top': 2, 'bottom': 3, 'outerwear': 4, 'shoes': 5, 'accessories': 6 };
    state.selectedItems.sort((a, b) => (orderMap[a.category] || 9) - (orderMap[b.category] || 9));

    // STEP 1: Determine main display image — always prioritize dress/top as the "hero" image
    // The main large image is fixed to the primary garment (dress > top).
    // Adding secondary items (bottom, shoes, accessories) does NOT change the main image.
    const primaryCategories = ['dress', 'top'];

    if (state.selectedItems.length > 0) {
        const primaryItem = state.selectedItems.find(i => primaryCategories.includes(i.category));

        if (primaryItem) {
            // Always show the primary garment (dress/top) as main image
            state.clothingImage = primaryItem.imageUrl;
            state.clothingSourceUrl = primaryItem.sourceUrl;
        } else {
            // No primary garment — fallback to first item in list
            state.clothingImage = state.selectedItems[0].imageUrl;
            state.clothingSourceUrl = state.selectedItems[0].sourceUrl;
        }
    } else {
        state.clothingImage = null;
        state.clothingSourceUrl = null;
    }

    /* We trigger full UI updates */
    if (window.updateUI) updateUI();
    if (window.renderClothingHistory) renderClothingHistory();
    saveSelectedItems();

    // Tier 1: Quick image quality check (async, non-blocking)
    if (window.quickValidateClothingImage && existingIndex === -1) {
        quickValidateClothingImage(item.imageUrl).catch(() => { });
    }

    return true;
}

async function saveSelectedItems() {
    try {
        await chrome.storage.local.set({ 'selectedItems': state.selectedItems });
    } catch (error) {
        console.error('Failed to save selected items:', error);
    }
}

async function loadSelectedItems() {
    try {
        const result = await chrome.storage.local.get(['selectedItems']);
        if (result.selectedItems && Array.isArray(result.selectedItems)) {
            state.selectedItems = result.selectedItems;
            if (state.selectedItems.length > 0) {
                // Prioritize dress/top as main image, consistent with toggleClothingSelection
                const primaryItem = state.selectedItems.find(i => ['dress', 'top'].includes(i.category));
                const displayItem = primaryItem || state.selectedItems[0];
                state.clothingImage = displayItem.imageUrl;
                state.clothingSourceUrl = displayItem.sourceUrl;
            }
            updateUI();
        }
    } catch (error) {
        console.error('Failed to load selected items:', error);
    }
}

async function loadRecentClothing() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_RECENT_CLOTHING' });
        if (response?.success && response.items) {
            state.recentClothing = response.items;
        }
    } catch (error) {
        console.error('Failed to load recent clothing:', error);
    }

    // STEP 2: Merge wardrobe items từ Supabase DB (nếu đã đăng nhập)
    // Giúp clothing tabs (Áo/Quần/Váy/Giày/Phụ kiện) hiển thị items đã lưu vào tủ
    if (state.authenticated) {
        try {
            const wardrobeRes = await chrome.runtime.sendMessage({ type: 'GET_WARDROBE', data: {} });
            if (wardrobeRes?.success && wardrobeRes.items?.length > 0) {
                // Merge chỉ items chưa có trong recentClothing (dedup theo imageUrl)
                const existingUrls = new Set(state.recentClothing.map(i => i.imageUrl || i.image_url));
                for (const wItem of wardrobeRes.items) {
                    const url = wItem.image_url || wItem.imageUrl;
                    // Bỏ qua items category 'outfit' — không phải quần áo đơn lẻ
                    if (!url || existingUrls.has(url) || wItem.category === 'outfit') continue;
                    state.recentClothing.push({
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
        } catch (e) {
            // Non-critical: local history vẫn hiển thị được
            console.warn('[Fitly] Could not load wardrobe items for clothing tabs:', e.message);
        }
    }

    renderClothingHistory();
}

function renderClothingHistory() {
    const grid = document.getElementById('clothing-history-grid');
    if (!grid) return;

    if (state.recentClothing.length === 0) {
        grid.innerHTML = `<div class="clothing-history-empty">${t('clothing_history.empty_message')}</div>`;
        return;
    }

    // STEP 1: Filter items by the active category tab
    // Items without a category default to 'top' (most common case for quick-selected items)
    const activeCategory = state.selectedCategory || 'top';
    const filteredClothing = activeCategory === 'all'
        ? state.recentClothing
        : state.recentClothing.filter(item => {
            const itemCategory = item.category || 'top';
            return itemCategory === activeCategory;
        });

    if (filteredClothing.length === 0) {
        grid.innerHTML = `<div class="clothing-history-empty">${t('clothing_history.empty_category') || 'Chưa có item nào trong danh mục này'}</div>`;
        return;
    }

    // STEP 2: Filter out hidden items — they should not appear at all
    const visibleClothing = filteredClothing.filter(item => {
        const itemKey = item.id || item.imageUrl;
        return !hiddenClothingIds.has(itemKey);
    });

    if (visibleClothing.length === 0) {
        grid.innerHTML = `<div class="clothing-history-empty">${t('clothing_history.empty_category') || 'Chưa có item nào trong danh mục này'}</div>`;
        return;
    }

    grid.innerHTML = visibleClothing.map(item => {
        const isSelected = state.selectedItems.some(i => i.imageUrl === item.imageUrl);
        const isSaved = item.saved;
        const hasSourceUrl = item.sourceUrl && item.sourceUrl.startsWith('http');
        const isLocalUpload = item.sourceType === 'local_upload';
        const poseLabel = item.name || item.pose || t('clothing_history.default_pose');

        return `
            <div class="clothing-history-item ${isSelected ? 'selected' : ''} ${isSaved ? 'saved' : ''} ${hasSourceUrl ? 'has-source' : ''}"
                 data-id="${item.id || ''}"
                 data-url="${item.imageUrl}"
                 data-source-url="${item.sourceUrl || ''}"
                 data-source-type="${item.sourceType || 'online'}"
                 data-cached-key="${item.cachedKey || item.id || ''}"
                 title="${isSaved ? t('clothing_history.saved_tooltip') : t('clothing_history.select_tooltip')}${hasSourceUrl ? ` • ${t('clothing_history.has_link_tooltip')}` : ''}${isLocalUpload ? ` • ${t('clothing_history.local_upload_tooltip')}` : ''}">
                <img src="${item.imageUrl}" alt="Clothing" loading="lazy"
                     referrerpolicy="no-referrer"
                     data-cache-key="${item.cachedKey || item.id || ''}">
                <div class="thumbnail-overlay">
                    <span class="thumbnail-label">${poseLabel}</span>
                </div>
                <div class="status-dot"></div>
                ${item.tryCount > 1 ? `<span class="clothing-try-count">×${item.tryCount}</span>` : ''}
                <button class="clothing-quick-try" data-action="quick-try" title="${t('clothing_history.quick_try_tooltip')}">
                    ✨ ${t('clothing_history.quick_try_button')}
                </button>
                <button class="clothing-hide-toggle" data-action="hide" title="Tắt item">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="clothing-item-actions">
                    ${hasSourceUrl ? `<button class="clothing-action-btn visit-btn" data-action="visit" title="${t('clothing_history.visit_product_page')}">🛒</button>` : ''}
                    ${!isSaved ? `<button class="clothing-action-btn save-btn" data-action="save" title="${t('clothing_history.save_to_collection')}">♥</button>` : ''}
                    <button class="clothing-action-btn delete-btn" data-action="delete" title="${t('delete')}">×</button>
                </div>
            </div>
        `;
    }).join('');

    cacheLocalUploadImages();

    grid.querySelectorAll('img[data-cache-key]').forEach(img => {
        img.addEventListener('error', async function () {
            const clothingId = this.closest('.clothing-history-item')?.dataset?.id;

            // Retry 1: Thử load thumbnail từ chrome.storage (cơ chế mới phòng URL chết)
            if (clothingId && !this.dataset.thumbnailTried) {
                this.dataset.thumbnailTried = 'true';
                try {
                    const thumbStore = await chrome.storage.local.get('clothing_thumbnails');
                    const thumb = thumbStore.clothing_thumbnails?.[clothingId];
                    if (thumb && this.src !== thumb) {
                        this.src = thumb;
                        return; // return để đợi event (nếu error tiếp thì sẽ chạy xuống các retry sau)
                    }
                } catch (_thumbErr) {
                    // Non-critical: thumbnail fallback is best-effort
                }
            }

            const cacheKey = this.dataset.cacheKey;
            // Retry 2: thử load qua cache IndexedDB (cho local upload cũ)
            if (cacheKey && typeof loadCachedFallback === 'function' && !this.dataset.idbTried) {
                this.dataset.idbTried = 'true';
                loadCachedFallback(this, cacheKey);
            }
            // Retry 3: thử fetch qua background service worker (bypass CORS)
            else if (!this.dataset.retried && this.src && this.src.startsWith('http')) {
                this.dataset.retried = 'true';
                fetchImageViaBackground(this.src).then(dataUrl => {
                    if (dataUrl) {
                        this.src = dataUrl;
                        this.style.opacity = '1';
                    }
                }).catch(() => { });
            }
        }, { once: false });
    });

    grid.querySelectorAll('.clothing-history-item').forEach(item => {
        // Hide toggle button — always visible, dedicated listener
        const hideToggle = item.querySelector('.clothing-hide-toggle');
        if (hideToggle) {
            hideToggle.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = item.dataset.url;
                const id = item.dataset.id;
                await toggleHideClothingItem(id, url);
            });
        }

        item.addEventListener('click', (e) => {
            if (e.target.closest('.clothing-item-actions') || e.target.closest('.clothing-hide-toggle')) return;
            const url = item.dataset.url;
            const sourceUrl = item.dataset.sourceUrl;
            const id = item.dataset.id;
            const name = item.querySelector('.thumbnail-label')?.textContent || 'Item';
            toggleClothingSelection({
                id: id || `item-${Date.now()}`,
                imageUrl: url,
                name,
                category: state.selectedCategory,
                sourceUrl
            });
        });

        item.querySelectorAll('.clothing-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const url = item.dataset.url;
                const id = item.dataset.id;
                const sourceUrl = item.dataset.sourceUrl;

                if (action === 'delete') {
                    await deleteClothingFromHistory(id, url);
                } else if (action === 'save') {
                    await saveClothingToWardrobe(url);
                } else if (action === 'quick-try') {
                    await quickTryClothing(url, sourceUrl);
                } else if (action === 'visit' && sourceUrl) {
                    openProductPage(sourceUrl);
                }
            });
        });
    });
}

async function deleteClothingFromHistory(clothingId, imageUrl) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'DELETE_RECENT_CLOTHING',
            data: { clothingId, imageUrl }
        });
        if (response?.success) {
            if (state.clothingImage === imageUrl) state.clothingImage = null;
            await loadRecentClothing();
            updateUI();
            showToast(t('result_deleted'), 'success');
        }
    } catch (error) {
        console.error('Failed to delete clothing:', error);
        showToast(t('photo_delete_error'), 'error');
    }
}

async function saveClothingToWardrobe(imageUrl) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'SAVE_CLOTHING_TO_WARDROBE',
            data: { imageUrl }
        });
        if (response?.success) {
            await loadRecentClothing();
            showToast(t('saved_to_collection'), 'success');
        } else {
            showToast(response?.error || t('save_error'), 'error');
        }
    } catch (error) {
        console.error('Failed to save clothing:', error);
        showToast(t('save_error'), 'error');
    }
}

async function quickTryClothing(imageUrl, sourceUrl = null) {
    const isSelected = state.selectedItems.some(i => i.imageUrl === imageUrl);
    if (!isSelected) {
        const success = toggleClothingSelection({
            id: `quick-${Date.now()}`,
            imageUrl,
            name: getCategoryLabel(state.selectedCategory) || t('quick_try_item'),
            category: state.selectedCategory,
            sourceUrl
        });
        if (!success) return;
    }
    if (state.modelImage) {
        if (state.gemsBalance >= GEM_COST_STANDARD) {
            showToast(t('processing_try_on'), 'info');
            await processTryOn();
        } else {
            showToast(t('not_enough_gems'), 'error');
        }
    } else {
        showToast(t('select_photo_first'), 'warning');
    }
}

async function clearClothingHistory() {
    if (!confirm(t('clear_all_confirm') + '?')) return;
    try {
        await chrome.storage.local.remove('recent_clothing');
        state.recentClothing = [];
        state.clothingImage = null;
        renderClothingHistory();
        updateUI();
        showToast(t('history_cleared'), 'success');
    } catch (error) {
        console.error('Failed to clear history:', error);
    }
}

/**
 * Initialize the mix-match toggle button.
 * Loads persisted state from chrome.storage.local.
 */
function initMixMatchToggle() {
    const toggleBtn = document.getElementById('mix-match-toggle');
    if (!toggleBtn) return;

    // Load persisted state
    chrome.storage.local.get(['fitly_mix_match_mode'], (result) => {
        state.mixMatchMode = result.fitly_mix_match_mode === true;
        if (state.mixMatchMode) {
            toggleBtn.classList.add('active');
        }
    });

    toggleBtn.addEventListener('click', () => {
        state.mixMatchMode = !state.mixMatchMode;
        toggleBtn.classList.toggle('active', state.mixMatchMode);

        // Persist
        chrome.storage.local.set({ fitly_mix_match_mode: state.mixMatchMode });

        // When switching to single mode and multiple items selected, keep only primary
        if (!state.mixMatchMode && state.selectedItems.length > 1) {
            const primary = state.selectedItems.find(i => i.imageUrl === state.clothingImage) || state.selectedItems[0];
            state.selectedItems = [primary];
            state.clothingImage = primary.imageUrl;
            state.clothingSourceUrl = primary.sourceUrl;
            saveSelectedItems();
            if (window.updateUI) updateUI();
            if (window.renderClothingHistory) renderClothingHistory();
            showToast(t('mix_match_off_kept_primary'), 'info');
        } else {
            const modeLabel = state.mixMatchMode ? t('mix_match_on') : t('mix_match_off');
            showToast(modeLabel, 'info');
        }
    });
}

// Expose ra window
window.toggleClothingSelection = toggleClothingSelection;
window.saveSelectedItems = saveSelectedItems;
window.loadSelectedItems = loadSelectedItems;
window.loadRecentClothing = loadRecentClothing;
window.initMixMatchToggle = initMixMatchToggle;
window.renderClothingHistory = renderClothingHistory;
window.deleteClothingFromHistory = deleteClothingFromHistory;
window.saveClothingToWardrobe = saveClothingToWardrobe;
window.quickTryClothing = quickTryClothing;
window.clearClothingHistory = clearClothingHistory;
window.loadHiddenClothingIds = loadHiddenClothingIds;
window.toggleHideClothingItem = toggleHideClothingItem;
window.setPrimaryItem = setPrimaryItem;

/**
 * Set a selected item as the primary (hero) display image.
 * Called when user clicks a bubble to change which item is shown large.
 */
function setPrimaryItem(item) {
    if (!item || item.imageUrl === state.clothingImage) return; // Already primary

    state.clothingImage = item.imageUrl;
    state.clothingSourceUrl = item.sourceUrl;

    if (window.updateUI) updateUI();
    if (window.renderClothingHistory) renderClothingHistory();
    showToast(`${getCategoryLabel(item.category) || 'Item'} — đã đặt làm item chính`, 'info');
}
