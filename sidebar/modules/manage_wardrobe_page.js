/**
 * File: manage_wardrobe_page.js
 * Purpose: Logic cho trang Wardrobe - filter, sort, render grid quần áo đã lưu
 * Layer: Presentation
 *
 * Input: state.recentClothing, wardrobeState (category, search, sort)
 * Output: DOM wardrobe-section hiển thị grid quần áo
 *
 * Flow:
 * 1. initWardrobe → setup event listeners (open/close/search/category/sort)
 * 2. openWardrobe → hide mainContent, show wardrobeSection, renderWardrobeGrid
 * 3. renderWardrobeGrid → filter + sort state.recentClothing → render HTML
 * 4. setupWardrobeGridDelegation → event delegation cho action buttons
 */

let wardrobeState = {
    category: 'all',
    search: '',
    sort: 'newest'
};

function initWardrobe() {
    const openBtn = document.getElementById('open-wardrobe-btn');
    const closeBtn = document.getElementById('close-wardrobe-btn');

    if (openBtn) openBtn.addEventListener('click', openWardrobe);
    if (closeBtn) closeBtn.addEventListener('click', closeWardrobe);

    const searchInput = document.getElementById('wardrobe-search');
    const clearSearchBtn = document.getElementById('wardrobe-search-clear');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            wardrobeState.search = e.target.value.toLowerCase().trim();
            clearSearchBtn?.classList.toggle('hidden', !wardrobeState.search);
            renderWardrobeGrid();
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                wardrobeState.search = '';
                clearSearchBtn.classList.add('hidden');
                renderWardrobeGrid();
            }
        });
    }

    const categoryTabs = document.querySelectorAll('.wardrobe-cat-tab');
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            categoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            wardrobeState.category = tab.dataset.category;
            renderWardrobeGrid();
        });
    });

    const sortBtn = document.getElementById('wardrobe-sort-btn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            wardrobeState.sort = wardrobeState.sort === 'newest' ? 'oldest' : 'newest';
            const icon = sortBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.style.transform = wardrobeState.sort === 'oldest' ? 'rotate(180deg)' : 'rotate(0deg)';
                icon.style.transition = 'transform 0.3s ease';
            }
            renderWardrobeGrid();
        });
    }

    setupWardrobeGridDelegation();
}

async function openWardrobe() {
    const mainContent = document.getElementById('main-content');
    const wardrobeSection = document.getElementById('wardrobe-section');

    if (mainContent) mainContent.classList.add('hidden');
    if (wardrobeSection) {
        wardrobeSection.classList.remove('hidden');

        // loadRecentClothing() đã merge cả local + Supabase wardrobe items (nếu đã đăng nhập)
        await loadRecentClothing();

        const countEl = document.getElementById('wardrobe-total-count');
        if (countEl) countEl.textContent = t('wardrobe_item_count', { count: state.recentClothing.length });
        renderWardrobeGrid();
        renderQuickWardrobeCarousel();
    }
}

function closeWardrobe() {
    const mainContent = document.getElementById('main-content');
    const wardrobeSection = document.getElementById('wardrobe-section');
    if (wardrobeSection) wardrobeSection.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
}

/**
 * Render Quick Wardrobe Carousel below the inline result
 * Hiển thị TẤT CẢ items từ state.recentClothing (cả wardrobe DB lẫn local)
 */
function renderQuickWardrobeCarousel() {
    const carouselContainer = document.getElementById('quick-wardrobe-carousel');
    if (!carouselContainer) return;

    // Unhide parent container (hidden on logout)
    const parentContainer = carouselContainer.closest('.quick-wardrobe-carousel-container');
    if (parentContainer) parentContainer.classList.remove('hidden');

    // STEP 1: Filter ALL items, only exclude hidden ones
    const visibleItems = state.recentClothing.filter(item => {
        const itemKey = item.id || item.imageUrl;
        const isHidden = typeof hiddenClothingIds !== 'undefined'
            ? hiddenClothingIds.has(itemKey)
            : false;
        return !isHidden;
    });

    // STEP 2: Show up to 20 most recent items
    const displayItems = visibleItems.slice(0, 20);

    if (displayItems.length === 0) {
        carouselContainer.innerHTML = `<span style="font-size: 11px; color: var(--color-foreground-muted); padding: 8px;">${t('item_history_empty', { default: 'Chưa có item nào' })}</span>`;
        return;
    }

    // STEP 3: Render each item with delete button + optional save button
    carouselContainer.innerHTML = displayItems.map(item => {
        const isSelected = state.selectedItems.some(i => i.imageUrl === item.imageUrl);
        const itemKey = item.id || item.imageUrl;
        const isSaved = item.saved === true;
        return `
            <div class="quick-carousel-item ${isSelected ? 'selected' : ''}" data-item-key="${itemKey}" data-url="${item.imageUrl}" data-source-url="${item.sourceUrl || ''}" data-saved="${isSaved}" style="flex: 0 0 60px; height: 80px; border-radius: 8px; overflow: hidden; position: relative; cursor: pointer; border: 2px solid ${isSelected ? 'var(--color-primary)' : 'transparent'};">
                <img src="${item.imageUrl}" alt="${item.name || 'Item'}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                ${!isSaved ? `<button class="quick-carousel-save-btn" data-url="${item.imageUrl}" title="${t('clothing_history.save_to_collection', { default: 'Lưu vào tủ đồ' })}" style="position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.55); border: none; color: #ff6b6b; font-size: 11px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; z-index: 2; opacity: 0; transition: opacity 0.15s ease;">♥</button>` : ''}
                <button class="quick-carousel-delete-btn" data-item-key="${itemKey}" data-url="${item.imageUrl}" title="${t('delete', { default: 'Xoá' })}" style="position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.55); border: none; color: white; font-size: 11px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; z-index: 2; opacity: 0; transition: opacity 0.15s ease;">
                    <span class="material-symbols-outlined" style="font-size: 13px;">close</span>
                </button>
            </div>
        `;
    }).join('');

    // STEP 4: Attach click listeners — select, delete, or save
    carouselContainer.querySelectorAll('.quick-carousel-item').forEach((itemEl, idx) => {
        const deleteBtn = itemEl.querySelector('.quick-carousel-delete-btn');
        const saveBtn = itemEl.querySelector('.quick-carousel-save-btn');

        // Show/hide action buttons on hover
        itemEl.addEventListener('mouseenter', () => {
            if (deleteBtn) deleteBtn.style.opacity = '1';
            if (saveBtn) saveBtn.style.opacity = '1';
        });
        itemEl.addEventListener('mouseleave', () => {
            if (deleteBtn) deleteBtn.style.opacity = '0';
            if (saveBtn) saveBtn.style.opacity = '0';
        });

        // Delete button — permanently remove item
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const key = deleteBtn.dataset.itemKey;
                const url = deleteBtn.dataset.url;
                if (window.deleteClothingFromHistory) {
                    await deleteClothingFromHistory(key, url);
                }
                renderQuickWardrobeCarousel();
            });
        }

        // Save button — add item to wardrobe
        if (saveBtn) {
            saveBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = saveBtn.dataset.url;
                if (window.saveClothingToWardrobe) {
                    await saveClothingToWardrobe(url);
                }
                renderQuickWardrobeCarousel();
            });
        }

        // Click item — select for try-on
        itemEl.addEventListener('click', () => {
            const item = displayItems[idx];
            state.clothingImage = item.imageUrl;
            state.clothingSourceUrl = item.sourceUrl || null;
            state.selectedItems = [{
                id: item.id || `item-${Date.now()}`,
                imageUrl: item.imageUrl,
                name: item.name,
                category: item.category || 'top',
                sourceUrl: item.sourceUrl
            }];
            updateUI();

            // Highlight selected
            carouselContainer.querySelectorAll('.quick-carousel-item').forEach(el => {
                el.style.border = '2px solid transparent';
                el.classList.remove('selected');
            });
            itemEl.style.border = '2px solid var(--color-primary)';
            itemEl.classList.add('selected');

            if (state.modelImage && state.gemsBalance >= (window.GEM_COST_STANDARD || 5)) {
                showToast(t('press_t_to_try') || 'Nhấn T hoặc nút Thử đồ để xem kết quả', 'info');
            }
        });
    });
}

function renderWardrobeGrid() {
    const grid = document.getElementById('wardrobe-grid');
    const emptyState = document.getElementById('wardrobe-empty');
    if (!grid) return;

    let filteredItems = state.recentClothing.filter(item => {
        if (wardrobeState.search) {
            const name = (item.name || '').toLowerCase();
            const source = (item.sourceUrl || '').toLowerCase();
            if (!name.includes(wardrobeState.search) && !source.includes(wardrobeState.search)) return false;
        }
        if (wardrobeState.category !== 'all') {
            if (item.category && item.category !== wardrobeState.category) return false;
        }
        return true;
    });

    filteredItems.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (parseInt(a.id) || 0);
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (parseInt(b.id) || 0);
        return wardrobeState.sort === 'newest' ? timeB - timeA : timeA - timeB;
    });

    const countEl = document.getElementById('wardrobe-total-count');
    if (countEl) countEl.textContent = t('wardrobe_item_count', { count: filteredItems.length });

    if (filteredItems.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    grid.innerHTML = filteredItems.map(item => {
        const isSelected = state.selectedItems.some(i => i.imageUrl === item.imageUrl);
        const hasSourceUrl = item.sourceUrl && item.sourceUrl.startsWith('http');
        let poseLabel = item.name || t('clothing');
        if (item.category) poseLabel += ` • ${getCategoryLabel(item.category)}`;
        // Check hidden state using shared hiddenClothingIds (via window)
        const itemKey = item.id || item.imageUrl;
        const isHidden = typeof hiddenClothingIds !== 'undefined'
            ? hiddenClothingIds.has(itemKey)
            : false;

        return `
            <div class="clothing-history-item ${isSelected ? 'selected' : ''} ${isHidden ? 'item-hidden' : ''}" title="${isHidden ? 'Đang ẩn - Click 👁 để hiện lại' : (isSelected ? t('currently_selected') : t('clothing_history.select_tooltip'))}">
                <img src="${item.imageUrl}" alt="Clothing" loading="lazy" data-cache-key="${item.cachedKey || item.id || ''}">
                <div class="thumbnail-overlay"><span class="thumbnail-label">${poseLabel}</span></div>
                ${isSelected ? '<div class="status-dot"></div>' : ''}
                <div class="clothing-item-actions">
                    ${!isHidden ? `<button class="clothing-action-btn" data-action="quick-try" data-url="${item.imageUrl}" data-source-url="${item.sourceUrl || ''}" data-item-id="${item.id || ''}" title="${t('try_on_button.try_now')}">
                        <span class="material-symbols-outlined">auto_fix_high</span>
                    </button>` : ''}
                    <button class="clothing-action-btn hide-btn" data-action="hide" data-item-id="${item.id || ''}" data-url="${item.imageUrl}" title="${isHidden ? 'Hiện item' : 'Ẩn item'}">${isHidden ? '👁' : '🙈'}</button>
                    ${hasSourceUrl && !isHidden ? `<button class="clothing-action-btn" data-action="visit" data-source-url="${item.sourceUrl}" title="${t('open_product')}">🛒</button>` : ''}
                    <button class="clothing-action-btn delete-btn" data-action="delete" data-item-id="${item.id}" data-url="${item.imageUrl}" title="${t('delete')}">×</button>
                </div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('img[data-cache-key]').forEach(img => {
        img.addEventListener('error', function () {
            const cacheKey = this.dataset.cacheKey;
            if (cacheKey && typeof loadCachedFallback === 'function') {
                loadCachedFallback(this, cacheKey);
            }
        }, { once: true });
    });
}

function setupWardrobeGridDelegation() {
    const grid = document.getElementById('wardrobe-grid');
    if (!grid) return;

    grid.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('.clothing-action-btn[data-action]');
        if (actionBtn) {
            e.stopPropagation();
            const action = actionBtn.dataset.action;
            const url = actionBtn.dataset.url;
            const sourceUrl = actionBtn.dataset.sourceUrl;
            const itemId = actionBtn.dataset.itemId;

            if (action === 'hide') {
                if (window.toggleHideClothingItem) {
                    await toggleHideClothingItem(itemId, url);
                }
            } else if (action === 'quick-try') {
                closeWardrobe();
                await quickTryClothing(url, sourceUrl);
            } else if (action === 'visit' && sourceUrl) {
                openProductPage(sourceUrl);
            } else if (action === 'delete') {
                await deleteClothingFromWardrobe(itemId, url);
            }
            return;
        }

        const card = e.target.closest('.clothing-history-item');
        if (!card) return;
        // Block click-to-select on hidden items
        if (card.classList.contains('item-hidden')) return;
        const img = card.querySelector('img');
        if (img) {
            const item = state.recentClothing.find(i => i.imageUrl === img.getAttribute('src'));
            if (item) {
                toggleClothingSelection({
                    id: item.id || `item-${Date.now()}`,
                    imageUrl: item.imageUrl,
                    name: item.name,
                    category: item.category || 'top',
                    sourceUrl: item.sourceUrl
                });
                renderWardrobeGrid();
            }
        }
    });
}

async function quickTryClothingFromWardrobe(url, source, id) {
    closeWardrobe();
    await quickTryClothing(url, source);
}

async function deleteClothingFromWardrobe(id, url) {
    const confirmed = await showConfirmDialog({
        type: 'delete',
        icon: '🗑️',
        title: t('delete_confirm') || 'Xóa khỏi tủ đồ?',
        message: t('delete_clothing_message') || 'Món đồ này sẽ bị xóa khỏi tủ đồ của bạn.',
        confirmText: t('delete') || 'Xóa',
        cancelText: t('close') || 'Hủy',
    });
    if (!confirmed) return;

    // STEP 1: Xoá từ Supabase DB nếu item có UUID id (không phải local-only)
    // Guard: id phải tồn tại, không rỗng, không phải "undefined" (string), và không phải local prefix
    if (id && id !== 'undefined' && !id.startsWith('clothing-') && !id.startsWith('wardrobe-')) {
        try {
            const delRes = await chrome.runtime.sendMessage({
                type: 'DELETE_WARDROBE_ITEM',
                data: { itemId: id }
            });
            if (!delRes?.success) {
                // Warn nhưng KHÔNG return — vẫn tiếp tục xoá local để item biến mất khỏi UI
                console.warn('[Fitly] DB delete failed for wardrobe item:', id, delRes?.error);
            }
        } catch (dbErr) {
            console.warn('[Fitly] DB delete exception:', dbErr.message);
        }
    }

    // STEP 2: Xoá từ local storage (recent_clothing + demo_wardrobe)
    await chrome.runtime.sendMessage({
        type: 'DELETE_RECENT_CLOTHING',
        data: { clothingId: id, imageUrl: url }
    });

    // STEP 3: Bỏ chọn nếu item đang được selected
    const selectedIdx = state.selectedItems.findIndex(i => i.imageUrl === url);
    if (selectedIdx > -1) {
        state.selectedItems.splice(selectedIdx, 1);
        saveSelectedItems();
    }
    if (state.clothingImage === url) {
        // Chuyển sang item khác hoặc clear
        if (state.selectedItems.length > 0) {
            state.clothingImage = state.selectedItems[0].imageUrl;
            state.clothingSourceUrl = state.selectedItems[0].sourceUrl;
        } else {
            state.clothingImage = null;
            state.clothingSourceUrl = null;
        }
    }

    // STEP 4: Reload & re-render
    await loadRecentClothing();
    updateUI();
    showToast(t('result_deleted') || 'Đã xoá', 'success');
    renderWardrobeGrid();
    renderQuickWardrobeCarousel();
    const countEl = document.getElementById('wardrobe-total-count');
    if (countEl) countEl.textContent = t('wardrobe_item_count', { count: state.recentClothing.length });
}

// Expose ra window
window.initWardrobe = initWardrobe;
window.openWardrobe = openWardrobe;
window.closeWardrobe = closeWardrobe;
window.renderWardrobeGrid = renderWardrobeGrid;
window.setupWardrobeGridDelegation = setupWardrobeGridDelegation;
window.quickTryClothingFromWardrobe = quickTryClothingFromWardrobe;
window.deleteClothingFromWardrobe = deleteClothingFromWardrobe;
window.renderQuickWardrobeCarousel = renderQuickWardrobeCarousel;
