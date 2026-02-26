/**
 * File: render_gallery_and_results.js
 * Purpose: Render gallery grid, kết quả try-on, selected bubbles, lookbook
 * Layer: Presentation
 *
 * Input: state.results, state.selectedItems, state.activeGalleryTab
 * Output: DOM updates cho gallery section và selected bubbles
 *
 * Flow:
 * 1. updateGalleryUI → filter + render gallery cards
 * 2. renderGalleryCard → build HTML cho từng card
 * 3. renderSelectedBubbles → render remove bubbles
 * 4. Share lookbook flow
 */

let visibleResultsCount = 6;

function updateGalleryUI() {
    const container = document.getElementById('results-grid');
    if (!container) return;

    if (state.results.length === 0) {
        state.results = [
            { id: 101, name: 'Everyday Chic', imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500&auto=format&fit=crop&q=60', timestamp: Date.now() - 7200000, matchPercentage: 98, tag: 'latest' },
            { id: 102, name: 'Office Ready', imageUrl: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=500&auto=format&fit=crop&q=60', timestamp: Date.now() - 86400000, matchPercentage: 92, tag: 'shared' },
            { id: 103, name: 'Gala Evening', imageUrl: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=500&auto=format&fit=crop&q=60', timestamp: Date.now() - 172800000, matchPercentage: 99, tag: 'draft' },
            { id: 104, name: 'City Walker', imageUrl: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=500&auto=format&fit=crop&q=60', timestamp: Date.now() - 259200000, matchPercentage: 88, tag: 'archived' }
        ];
    }

    const filtered = filterResults(state.results);
    if (filtered.length === 0) {
        container.innerHTML = `<div class="gallery-empty-state"><span class="material-symbols-outlined">photo_library</span><p>${t('no_results')}</p></div>`;
        return;
    }

    const visible = filtered.slice(0, visibleResultsCount);
    container.innerHTML = visible.map(result => renderGalleryCard(result, state.selectedResultIds?.includes(result.id))).join('');
    addGalleryCardListeners(container, false);
    updateStickyActionBar();
}

function filterResults(results) {
    let filtered = results;
    if (state.activeGalleryTab && state.activeGalleryTab !== 'latest') {
        filtered = results.filter(r => r.tag === state.activeGalleryTab);
    }
    return filtered.sort((a, b) => {
        if ((b.matchPercentage || 0) !== (a.matchPercentage || 0)) {
            return (b.matchPercentage || 0) - (a.matchPercentage || 0);
        }
        return (b.timestamp || 0) - (a.timestamp || 0);
    });
}

function setupInfiniteScroll() {
    const section = document.getElementById('gallery-section');
    if (!section) return;
    section.addEventListener('scroll', () => {
        if (section.scrollTop + section.clientHeight >= section.scrollHeight - 50) {
            if (visibleResultsCount < state.results.length) {
                visibleResultsCount += 3;
                updateGalleryUI();
            }
        }
    });
}

function renderSelectedBubbles() {
    const container = elements.selectedItemsBubbles;
    if (!container) return;

    // Show ALL selected items — primary (hero image) gets a highlight crown
    const allItems = state.selectedItems;

    if (allItems.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = allItems.map((item, index) => {
        const isPrimary = item.imageUrl === state.clothingImage;
        const realIndex = state.selectedItems.indexOf(item);
        return `
        <div class="selected-item-bubble ${isPrimary ? 'primary-bubble' : ''}"
             data-index="${realIndex}"
             title="${isPrimary ? 'Item chính' : 'Click để đặt làm item chính'}"
             style="animation-delay: ${index * 0.08}s">
            <img src="${item.imageUrl}" alt="${item.category}" referrerpolicy="no-referrer">
            ${isPrimary ? '<div class="bubble-primary-badge">★</div>' : ''}
            <div class="bubble-category-badge">${getCategoryLabel(item.category) || 'Item'}</div>
            <button class="bubble-remove-btn" data-index="${realIndex}" title="${t('remove_selection')}">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
    `}).join('');

    // Pre-fetch external images via service worker for CORS
    container.querySelectorAll('img').forEach(img => {
        img.addEventListener('error', function () {
            if (this.dataset.fixed) return;
            this.dataset.fixed = 'true';
            if (window.fixBrokenImage) {
                window.fixBrokenImage(this);
            }
        }, { once: true });

        if (img.src && img.src.startsWith('http') && !img.src.startsWith(chrome.runtime.getURL(''))) {
            if (window.fetchImageViaBackground) {
                window.fetchImageViaBackground(img.src).catch(() => { });
            }
        }
    });

    // Remove button handler
    container.querySelectorAll('.bubble-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.hideGlobalTooltip) hideGlobalTooltip();
            const index = parseInt(btn.dataset.index);
            if (!isNaN(index) && state.selectedItems[index]) {
                toggleClothingSelection(state.selectedItems[index]);
            }
        });
    });

    // Click bubble → set as primary item
    container.querySelectorAll('.selected-item-bubble').forEach(bubble => {
        bubble.addEventListener('click', (e) => {
            if (e.target.closest('.bubble-remove-btn')) return; // Don't trigger on X button
            const index = parseInt(bubble.dataset.index);
            if (!isNaN(index) && state.selectedItems[index]) {
                if (window.setPrimaryItem) {
                    setPrimaryItem(state.selectedItems[index]);
                }
            }
        });
    });

    // Clear all selection button (inside clothing image container)
    const clearBtn = document.getElementById('clear-clothing-selection-btn');
    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = 'true';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Clear all selected items
            state.selectedItems = [];
            state.clothingImage = null;
            state.clothingSourceUrl = null;
            saveSelectedItems();
            if (window.updateUI) updateUI();
            if (window.renderClothingHistory) renderClothingHistory();
        });
    }
}

function renderGalleryCard(result, isSelected) {
    const displayName = result.name || t('gallery.outfit_name', { id: result.id });
    const timeAgo = getTimeAgo(result.timestamp);
    const starValue = (result.matchPercentage || 0) / 20;
    const fullStars = Math.floor(starValue);
    const hasHalf = (starValue - fullStars) >= 0.5;

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        let starIcon = i <= fullStars ? 'star' : (i === fullStars + 1 && hasHalf ? 'star_half' : 'star_outline');
        starsHtml += `<span class="star material-symbols-outlined" data-value="${i}" style="font-size: 10px;">${starIcon}</span>`;
    }

    const tagData = getTagLabel(result.tag);
    const tagBadgeHtml = tagData && result.tag !== 'latest'
        ? `<div class="card-tag-badge" style="--tag-color: ${tagData.color}"><span class="material-symbols-outlined" style="font-size: 12px;">${tagData.icon}</span>${tagData.label}</div>`
        : '';

    return `
        <div class="gallery-card ${isSelected ? 'card-selected' : ''}" data-id="${result.id}">
            <div class="gallery-card-image-wrapper">
                <img src="${result.imageUrl}" alt="${displayName}" class="gallery-card-image" loading="lazy"
                     referrerpolicy="no-referrer">
                <div class="card-select-check ${isSelected ? 'selected' : ''}" data-action="toggle-select">
                    <span class="material-symbols-outlined">check</span>
                </div>
                <div class="card-star-rating"><div class="stars">${starsHtml}</div></div>
                ${tagBadgeHtml}
            </div>
            <div class="gallery-card-content">
                <h3 class="gallery-card-title" contenteditable="true" spellcheck="false" data-id="${result.id}" title="${t('click_to_rename')}">${escapeHtml(displayName)}</h3>
                <p class="gallery-card-meta">${t('created_time_ago', { time: timeAgo })}</p>
                <div class="gallery-card-actions">
                    <button class="card-detail-btn" data-action="detail">
                        <span class="material-symbols-outlined" style="font-size: 14px;">zoom_in</span> ${t('detail')}
                    </button>
                    <button class="card-delete-btn" data-action="delete">
                        <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function addGalleryCardListeners(container, isMock) {
    container.querySelectorAll('.gallery-card').forEach(card => {
        const id = parseInt(card.dataset.id);

        // Add error handler for gallery images (CSP-compliant)
        const img = card.querySelector('.gallery-card-image');
        if (img) {
            img.addEventListener('error', function () {
                if (this.dataset.fixed) return;
                this.dataset.fixed = 'true';
                if (window.fixBrokenImage) {
                    window.fixBrokenImage(this);
                }
            }, { once: true });
        }

        card.querySelector('[data-action="toggle-select"]').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleResultSelection(id);
        });

        const titleEl = card.querySelector('.gallery-card-title');
        if (titleEl) {
            const saveRename = () => {
                const newName = titleEl.textContent.trim();
                if (newName) {
                    const result = isMock ? null : state.results.find(r => r.id === id);
                    if (result) {
                        result.name = newName;
                        if (state.activePopups.includes(id)) {
                            sendToActiveTab({ type: 'UPDATE_POPUP_NAME', data: { id, name: newName } });
                        }
                        saveResults();
                    }
                    showToast(t('outfit_renamed'), 'success');
                }
                titleEl.scrollLeft = 0;
            };
            titleEl.addEventListener('blur', saveRename);
            titleEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
                if (e.key === 'Escape') titleEl.blur();
            });
            titleEl.addEventListener('click', (e) => e.stopPropagation());
        }

        card.querySelector('[data-action="detail"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const result = state.results.find(r => r.id === id);
            if (result) openImagePopup(result.imageUrl);
        });

        card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(t('delete') + '?')) {
                if (isMock) { card.remove(); showToast(t('deleted_demo'), 'success'); }
                else deleteResult(id);
            }
        });

        card.querySelector('.gallery-card-image-wrapper').addEventListener('click', (e) => {
            if (!e.target.closest('.card-select-check')) toggleResultSelection(id);
        });
    });
}

function updateStickyActionBar() {
    const stickyBar = document.querySelector('.gallery-sticky-actions');
    if (!stickyBar) return;
    const selectedCount = state.selectedResultIds?.length || 0;
    const shareBtn = document.getElementById('share-friends-btn');
    if (selectedCount > 0) {
        stickyBar.classList.remove('hidden');
        if (shareBtn) shareBtn.innerHTML = `<span class="material-symbols-outlined">ios_share</span> ${t('share_count_items', { count: selectedCount })}`;
    } else {
        if (shareBtn) shareBtn.innerHTML = `<span class="material-symbols-outlined">ios_share</span> ${t('share_with_friends')}`;
    }
}

function toggleResultSelection(id) {
    if (!state.selectedResultIds) state.selectedResultIds = [];
    const index = state.selectedResultIds.indexOf(id);
    if (index === -1) {
        if (state.selectedResultIds.length >= 2) state.selectedResultIds.shift();
        state.selectedResultIds.push(id);
    } else {
        state.selectedResultIds.splice(index, 1);
    }
    updateGalleryUI();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderResultThumbnails() {
    updateGalleryUI();
}

// ==========================================
// SHARE LOOKBOOK — Moved to manage_share_lookbook.js
// openShareLookbook(), downloadLookbookCard(), initShareLookbookEvents()
// are now handled by the dedicated module.
// ==========================================

// Expose ra window
window.updateGalleryUI = updateGalleryUI;
window.filterResults = filterResults;
window.setupInfiniteScroll = setupInfiniteScroll;
window.renderSelectedBubbles = renderSelectedBubbles;
window.renderGalleryCard = renderGalleryCard;
window.addGalleryCardListeners = addGalleryCardListeners;
window.updateStickyActionBar = updateStickyActionBar;
window.toggleResultSelection = toggleResultSelection;
window.escapeHtml = escapeHtml;
window.renderResultThumbnails = renderResultThumbnails;
