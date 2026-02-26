/**
 * File: manage_all_outfits_page.js
 * Purpose: Quản lý màn hình "All Outfits" (Select Looks) — grid 2 cột, filter, select, compare, lookbook
 * Layer: Presentation
 *
 * Input: state.results (local try-on), GET_OUTFITS (saved outfits), GET_DELETED_OUTFITS (trash)
 * Output: DOM updates cho all-outfits-section
 *
 * Flow:
 * 1. openAllOutfits() → show section, load + merge data, render grid
 * 2. filterAllOutfits(tab) → All / Favorites / Deleted
 * 3. toggleOutfitSelect(id) → select/deselect outfit, update bottom bar
 * 4. Compare / Lookbook integration
 * 5. Search outfits by name
 */

// ==========================================
// STATE
// ==========================================
let allOutfitsData = []; // Merged list of all outfits
let allOutfitsDeletedData = []; // Outfits in trash bin
let allOutfitsActiveTab = 'all';
let allOutfitsSelectedIds = [];
let allOutfitsFavoriteIds = [];
let allOutfitsSearchQuery = '';
let allOutfitsSearchVisible = false;

/**
 * Normalize image URL for dedup: strip query params (signed tokens).
 * "https://storage.com/img.jpg?token=abc" → "https://storage.com/img.jpg"
 */
function normalizeImageUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname;
    } catch {
        return url;
    }
}

// Track visibility state before opening All Outfits
let wasInlineResultVisible = false;
let wasCreatedOutfitsVisible = false;

// ==========================================
// PERSISTENCE — Favorites
// ==========================================

function loadFavoriteOutfitIds() {
    try {
        const raw = localStorage.getItem('fitly_favorite_outfit_ids');
        allOutfitsFavoriteIds = raw ? JSON.parse(raw) : [];
    } catch (_e) {
        allOutfitsFavoriteIds = [];
    }
}

function saveFavoriteOutfitIds() {
    try {
        localStorage.setItem('fitly_favorite_outfit_ids', JSON.stringify(allOutfitsFavoriteIds));
    } catch (_e) { /* storage full */ }
}

function toggleFavorite(id) {
    const strId = String(id);
    const idx = allOutfitsFavoriteIds.indexOf(strId);
    if (idx === -1) {
        allOutfitsFavoriteIds.push(strId);
    } else {
        allOutfitsFavoriteIds.splice(idx, 1);
    }
    saveFavoriteOutfitIds();
    renderAllOutfitsGrid();
}

// ==========================================
// OPEN / CLOSE
// ==========================================

async function openAllOutfits() {
    const section = document.getElementById('all-outfits-section');
    if (!section) return;

    // STEP 1: Load favorites
    loadFavoriteOutfitIds();

    // STEP 2: Save visibility state BEFORE hiding
    const inlineResultEl = document.getElementById('inline-result-section');
    const createdOutfitsEl = document.getElementById('created-outfits-list-section');
    wasInlineResultVisible = inlineResultEl ? !inlineResultEl.classList.contains('hidden') : false;
    wasCreatedOutfitsVisible = createdOutfitsEl ? !createdOutfitsEl.classList.contains('hidden') : false;

    // STEP 3: Hide main content, show all outfits section
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.classList.add('hidden');
    if (inlineResultEl) inlineResultEl.classList.add('hidden');
    if (createdOutfitsEl) createdOutfitsEl.classList.add('hidden');
    section.classList.remove('hidden');

    // STEP 3: Reset state
    allOutfitsActiveTab = 'all';
    allOutfitsSelectedIds = [];
    allOutfitsSearchQuery = '';
    allOutfitsSearchVisible = false;

    // STEP 4: Update tab UI
    updateAllOutfitsTabs();

    // STEP 5: Load data
    await loadAllOutfitsData();

    // STEP 6: Render
    renderAllOutfitsGrid();
    updateAllOutfitsBottomBar();
}

function closeAllOutfits() {
    const section = document.getElementById('all-outfits-section');
    if (section) section.classList.add('hidden');

    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.classList.remove('hidden');

    // Restore previously visible sections
    if (wasInlineResultVisible) {
        document.getElementById('inline-result-section')?.classList.remove('hidden');
    }
    if (wasCreatedOutfitsVisible) {
        document.getElementById('created-outfits-list-section')?.classList.remove('hidden');
    }

    allOutfitsSelectedIds = [];
}

// ==========================================
// DATA LOADING
// ==========================================

async function loadAllOutfitsData() {
    allOutfitsData = [];

    // STEP 1: Load saved outfits from background (cloud source of truth)
    let cloudDeletedImageUrls = new Set();
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_OUTFITS', data: { limit: 100 } });
        if (response?.success && response.outfits?.length > 0) {
            response.outfits.forEach(outfit => {
                allOutfitsData.push({
                    id: String(outfit.id),
                    name: outfit.name || 'Outfit',
                    imageUrl: outfit.result_image_url,
                    clothingUrl: outfit.clothing_image_url,
                    modelUrl: outfit.model_image_url,
                    timestamp: outfit.created_at ? new Date(outfit.created_at).getTime() : Date.now(),

                    tags: outfit.tags || [],
                    source: outfit.source_type || 'ai',
                    isHidden: false,
                });
            });
        }
    } catch (err) {
        console.warn('[AllOutfits] Failed to load saved outfits:', err);
    }

    // STEP 1.5: Load deleted outfits to build exclusion set
    // This prevents deleted outfits from "resurrecting" via state.results merge
    try {
        const delResponse = await chrome.runtime.sendMessage({ type: 'GET_DELETED_OUTFITS', data: { limit: 100 } });
        if (delResponse?.success && delResponse.outfits?.length > 0) {
            delResponse.outfits.forEach(o => {
                if (o.result_image_url) cloudDeletedImageUrls.add(normalizeImageUrl(o.result_image_url));
            });
        }
    } catch (_err) {
        // Non-critical: if we can't load deleted list, merge proceeds normally
    }

    // STEP 2: Merge local try-on results if not already in saved
    // Dedup by id, imageUrl, AND normalized URL (strip query params for signed tokens)
    // Also exclude results whose image matches a deleted outfit
    if (state.results && state.results.length > 0) {
        const existingIds = new Set(allOutfitsData.map(o => o.id));
        const existingImageUrls = new Set(allOutfitsData.map(o => o.imageUrl).filter(Boolean));
        const existingNormalizedUrls = new Set(
            allOutfitsData.map(o => normalizeImageUrl(o.imageUrl)).filter(u => u !== '')
        );
        state.results.forEach(result => {
            const rid = String(result.id);
            const isDuplicateById = existingIds.has(rid);
            const normalizedResultUrl = normalizeImageUrl(result.imageUrl);
            const isDuplicateByImage = result.imageUrl && (
                existingImageUrls.has(result.imageUrl) ||
                existingNormalizedUrls.has(normalizedResultUrl)
            );
            // Skip if this result's image was soft-deleted on cloud
            const isDeleted = normalizedResultUrl && cloudDeletedImageUrls.has(normalizedResultUrl);
            if (!isDuplicateById && !isDuplicateByImage && !isDeleted) {
                allOutfitsData.push({
                    id: rid,
                    name: result.name || t('gallery.outfit_name', { id: result.id }) || `Outfit #${result.id}`,
                    imageUrl: result.imageUrl,
                    clothingUrl: result.clothingUrl,
                    modelUrl: result.modelUrl,
                    timestamp: result.timestamp || Date.now(),

                    tags: result.tag ? [result.tag] : [],
                    source: 'local',
                    isHidden: false,
                });
            }
        });
    }

    // STEP 3: Sort by timestamp desc
    allOutfitsData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // STEP 4: Load trash bin data if on deleted tab
    if (allOutfitsActiveTab === 'deleted') {
        await loadDeletedOutfitsData();
    }
}

async function loadDeletedOutfitsData() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_DELETED_OUTFITS', data: { limit: 50 } });
        if (response?.success && response.outfits?.length > 0) {
            allOutfitsDeletedData = response.outfits.map(outfit => ({
                id: String(outfit.id),
                name: outfit.name || 'Outfit',
                imageUrl: outfit.result_image_url,
                clothingUrl: outfit.clothing_image_url,
                modelUrl: outfit.model_image_url,
                deletedAt: outfit.deleted_at,
                daysRemaining: outfit.daysRemaining ?? 30,
                timestamp: outfit.created_at ? new Date(outfit.created_at).getTime() : Date.now(),
            }));
        } else {
            allOutfitsDeletedData = [];
        }
    } catch (err) {
        console.warn('[AllOutfits] Failed to load deleted outfits:', err);
        allOutfitsDeletedData = [];
    }
}

// ==========================================
// FILTERING
// ==========================================

function getFilteredOutfits() {
    // STEP 1: Tab filter
    if (allOutfitsActiveTab === 'deleted') {
        // Trash tab uses separate data source
        let filtered = [...allOutfitsDeletedData];
        if (allOutfitsSearchQuery.trim()) {
            const q = allOutfitsSearchQuery.toLowerCase().trim();
            filtered = filtered.filter(o => (o.name || '').toLowerCase().includes(q));
        }
        return filtered;
    }

    let filtered = [...allOutfitsData];

    if (allOutfitsActiveTab === 'favorites') {
        filtered = filtered.filter(o => allOutfitsFavoriteIds.includes(o.id));
    } else if (allOutfitsActiveTab === 'external') {
        filtered = filtered.filter(o => o.source === 'external');
    }

    // STEP 2: Search filter
    if (allOutfitsSearchQuery.trim()) {
        const q = allOutfitsSearchQuery.toLowerCase().trim();
        filtered = filtered.filter(o =>
            (o.name || '').toLowerCase().includes(q) ||
            (o.tags || []).some(tag => tag.toLowerCase().includes(q))
        );
    }

    return filtered;
}

async function switchAllOutfitsTab(tab) {
    allOutfitsActiveTab = tab;
    allOutfitsSelectedIds = [];
    updateAllOutfitsTabs();

    // Load trash data when switching to deleted tab
    if (tab === 'deleted') {
        await loadDeletedOutfitsData();
    }

    renderAllOutfitsGrid();
    updateAllOutfitsBottomBar();
}

function updateAllOutfitsTabs() {
    const tabs = document.querySelectorAll('#all-outfits-section .ao-tab');
    tabs.forEach(tabEl => {
        const tabName = tabEl.dataset.tab;
        tabEl.classList.toggle('active', tabName === allOutfitsActiveTab);
    });
}

// ==========================================
// RENDER GRID
// ==========================================

function renderAllOutfitsGrid() {
    const grid = document.getElementById('all-outfits-grid');
    if (!grid) return;

    const filtered = getFilteredOutfits();

    if (filtered.length === 0) {
        const emptyMsg = allOutfitsActiveTab === 'favorites'
            ? (t('all_outfits.empty_favorites') || 'Chưa có outfit yêu thích')
            : allOutfitsActiveTab === 'deleted'
                ? (t('all_outfits.empty_trash') || 'Thùng rác trống')
                : allOutfitsActiveTab === 'external'
                    ? (t('all_outfits.empty_external') || 'Chưa có outfit từ web')
                    : (t('all_outfits.empty') || 'Chưa có outfit nào');
        const emptyIcon = allOutfitsActiveTab === 'deleted' ? 'delete'
            : allOutfitsActiveTab === 'external' ? 'language'
                : 'checkroom';

        grid.innerHTML = `
            <div class="ao-empty-state">
                <span class="material-symbols-outlined">${emptyIcon}</span>
                <p>${emptyMsg}</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(outfit =>
        allOutfitsActiveTab === 'deleted' ? renderTrashCard(outfit) : renderAllOutfitCard(outfit)
    ).join('');

    // STEP 2: Attach event listeners
    grid.querySelectorAll('.ao-card').forEach(card => {
        const id = card.dataset.id;

        // Select checkbox
        card.querySelector('.ao-card-check')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleOutfitSelect(id);
        });

        // Favorite button
        card.querySelector('.ao-fav-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(id);
        });

        // Delete button
        card.querySelector('.ao-del-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteOutfit(id);
        });

        // Click card → view detail
        card.addEventListener('click', () => {
            const outfit = allOutfitsData.find(o => o.id === id);
            if (outfit && window.showResultInline) {
                closeAllOutfits();
                showResultInline({ imageUrl: outfit.imageUrl, id: outfit.id, name: outfit.name });
            }
        });

        // Fix broken images
        const img = card.querySelector('.ao-card-img');
        if (img) {
            img.addEventListener('error', function () {
                if (this.dataset.fixed) return;
                this.dataset.fixed = 'true';
                if (window.fixBrokenImage) fixBrokenImage(this);
            }, { once: true });
        }
    });

    // Trash card event listeners
    grid.querySelectorAll('.ao-trash-card').forEach(card => {
        const id = card.dataset.id;

        card.querySelector('.ao-restore-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            restoreOutfit(id);
        });

        card.querySelector('.ao-perm-del-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            permanentDeleteOutfit(id);
        });

        // Fix broken images
        const img = card.querySelector('.ao-card-img');
        if (img) {
            img.addEventListener('error', function () {
                if (this.dataset.fixed) return;
                this.dataset.fixed = 'true';
                if (window.fixBrokenImage) fixBrokenImage(this);
            }, { once: true });
        }
    });
}

function renderAllOutfitCard(outfit) {
    const isSelected = allOutfitsSelectedIds.includes(outfit.id);
    const isFav = allOutfitsFavoriteIds.includes(outfit.id);

    // Generate style tags
    const styleTags = generateStyleTags(outfit);
    const tagsHtml = styleTags.length > 0
        ? styleTags.map(tag => `<span class="ao-style-tag">${escapeHtml(tag)}</span>`).join('')
        : '';

    return `
        <div class="ao-card ${isSelected ? 'ao-card--selected' : ''}" data-id="${outfit.id}">
            <div class="ao-card-image-wrap">
                <img src="${outfit.imageUrl}" alt="${escapeHtml(outfit.name)}" class="ao-card-img" loading="lazy"
                     referrerpolicy="no-referrer">
                <div class="ao-card-check ${isSelected ? 'checked' : ''}">
                    <span class="material-symbols-outlined">${isSelected ? 'check_circle' : 'radio_button_unchecked'}</span>
                </div>
                <button class="ao-fav-btn ${isFav ? 'ao-fav-btn--active' : ''}" title="${isFav ? 'Unfavorite' : 'Favorite'}">
                    <span class="material-symbols-outlined">${isFav ? 'favorite' : 'favorite_border'}</span>
                </button>
                <button class="ao-del-btn" title="${t('delete') || 'Delete'}">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
            <div class="ao-card-info">
                <h4 class="ao-card-name">${escapeHtml(outfit.name)}</h4>
                ${tagsHtml ? `<div class="ao-card-tags">${tagsHtml}</div>` : ''}
            </div>
        </div>
    `;
}

function renderTrashCard(outfit) {
    const daysText = outfit.daysRemaining !== undefined
        ? `${outfit.daysRemaining} ${t('days_remaining') || 'ngày'}`
        : '';

    return `
        <div class="ao-trash-card" data-id="${outfit.id}">
            <div class="ao-card-image-wrap ao-trash-overlay">
                <img src="${outfit.imageUrl}" alt="${escapeHtml(outfit.name)}" class="ao-card-img" loading="lazy"
                     referrerpolicy="no-referrer">
                ${daysText ? `<div class="ao-trash-days-badge"><span class="material-symbols-outlined" style="font-size:12px">schedule</span> ${daysText}</div>` : ''}
            </div>
            <div class="ao-card-info">
                <h4 class="ao-card-name">${escapeHtml(outfit.name)}</h4>
                <div class="ao-trash-actions">
                    <button class="ao-restore-btn" title="${t('restore') || 'Khôi phục'}">
                        <span class="material-symbols-outlined">restore</span>
                        <span>${t('restore') || 'Khôi phục'}</span>
                    </button>
                    <button class="ao-perm-del-btn" title="${t('delete_forever') || 'Xoá hẳn'}">
                        <span class="material-symbols-outlined">delete_forever</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}
function generateStyleTags(outfit) {
    // Generate descriptive style tags based on outfit data
    const tags = [];
    if (outfit.tags && outfit.tags.length > 0) {
        return outfit.tags.slice(0, 3);
    }
    // Fallback: generate from name
    const name = (outfit.name || '').toLowerCase();
    if (name.includes('casual') || name.includes('everyday')) tags.push('Casual');
    if (name.includes('office') || name.includes('work')) tags.push('Professional');
    if (name.includes('gala') || name.includes('evening') || name.includes('formal')) tags.push('Formal');
    if (name.includes('street') || name.includes('city')) tags.push('Street');
    if (name.includes('chic')) tags.push('Minimalist');
    if (name.includes('boho')) tags.push('Boho');

    if (tags.length === 0) {
        // Generate from source
        if (outfit.source === 'ai') tags.push('AI Generated');
        if (outfit.source === 'external') tags.push('Web Import');
    }

    return tags.slice(0, 3);
}

// ==========================================
// SELECTION
// ==========================================

function toggleOutfitSelect(id) {
    const idx = allOutfitsSelectedIds.indexOf(id);
    if (idx === -1) {
        if (allOutfitsSelectedIds.length >= 4) {
            allOutfitsSelectedIds.shift();
        }
        allOutfitsSelectedIds.push(id);
    } else {
        allOutfitsSelectedIds.splice(idx, 1);
    }
    renderAllOutfitsGrid();
    updateAllOutfitsBottomBar();
}

// ==========================================
// BOTTOM BAR
// ==========================================

function updateAllOutfitsBottomBar() {
    const compareBtn = document.getElementById('ao-compare-btn');
    const lookbookBtn = document.getElementById('ao-lookbook-btn');
    const count = allOutfitsSelectedIds.length;

    if (compareBtn) {
        compareBtn.disabled = count < 2;
        compareBtn.innerHTML = `<span class="material-symbols-outlined">compare</span> ${t('all_outfits.compare') || 'Compare'}`;
    }
    if (lookbookBtn) {
        lookbookBtn.innerHTML = `<span class="material-symbols-outlined">auto_stories</span> ${t('all_outfits.lookbook') || 'Lookbook'}`;
    }
}

// ==========================================
// SEARCH
// ==========================================

function toggleAllOutfitsSearch() {
    allOutfitsSearchVisible = !allOutfitsSearchVisible;
    const searchWrap = document.getElementById('ao-search-wrap');
    const searchInput = document.getElementById('ao-search-input');

    if (searchWrap) {
        searchWrap.classList.toggle('hidden', !allOutfitsSearchVisible);
    }
    if (allOutfitsSearchVisible && searchInput) {
        searchInput.focus();
    } else {
        allOutfitsSearchQuery = '';
        if (searchInput) searchInput.value = '';
        renderAllOutfitsGrid();
    }
}

// ==========================================
// ACTIONS — Compare / Lookbook
// ==========================================

function handleAllOutfitsCompare() {
    if (allOutfitsSelectedIds.length < 2) {
        showToast(t('all_outfits.select_two') || 'Chọn ít nhất 2 outfit để so sánh', 'warning');
        return;
    }

    // Map selected IDs to state.results format for compare view
    const selectedOutfits = allOutfitsSelectedIds
        .map(id => allOutfitsData.find(o => o.id === id))
        .filter(Boolean);

    // Ensure results exist in state.results for compare view to access
    selectedOutfits.forEach(outfit => {
        const existsInResults = state.results.find(r => String(r.id) === outfit.id);
        if (!existsInResults) {
            state.results.push({
                id: parseInt(outfit.id) || outfit.id,
                name: outfit.name,
                imageUrl: outfit.imageUrl,
                timestamp: outfit.timestamp,
            });
        }
    });

    // Set current result for compare start
    state.currentResultId = parseInt(selectedOutfits[0].id) || selectedOutfits[0].id;

    closeAllOutfits();
    if (window.openCompareView) openCompareView();
}

function handleAllOutfitsLookbook() {
    const selectedOutfits = allOutfitsSelectedIds
        .map(id => allOutfitsData.find(o => o.id === id))
        .filter(Boolean);

    if (selectedOutfits.length === 0) {
        // Use first visible outfit
        const filtered = getFilteredOutfits();
        if (filtered.length > 0) selectedOutfits.push(filtered[0]);
    }

    if (selectedOutfits.length === 0) {
        showToast(t('all_outfits.no_outfit_for_lookbook') || 'Không có outfit nào để tạo Lookbook', 'warning');
        return;
    }

    // Ensure results exist in state.results for lookbook
    selectedOutfits.forEach(outfit => {
        const existsInResults = state.results.find(r => String(r.id) === outfit.id);
        if (!existsInResults) {
            state.results.push({
                id: parseInt(outfit.id) || outfit.id,
                name: outfit.name,
                imageUrl: outfit.imageUrl,
                timestamp: outfit.timestamp,
            });
        }
    });

    state.selectedResultIds = selectedOutfits.map(o => parseInt(o.id) || o.id);

    closeAllOutfits();
    if (window.openShareLookbook) openShareLookbook();
}

// ==========================================
// DELETE OUTFIT
// ==========================================

async function deleteOutfit(id) {
    // Soft-delete — chuyển vào thùng rác
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'DELETE_OUTFIT',
            data: { id }
        });

        if (response?.success) {
            // Find the outfit before removing — need imageUrl for filtering state.results
            const deletedOutfit = allOutfitsData.find(o => o.id === id);
            allOutfitsData = allOutfitsData.filter(o => o.id !== id);
            allOutfitsSelectedIds = allOutfitsSelectedIds.filter(sid => sid !== id);

            // Remove from state.results by both id AND imageUrl
            // to prevent "resurrection" from tryon_history merge
            if (state.results) {
                const deletedImageUrl = deletedOutfit?.imageUrl;
                const deletedNormalized = deletedImageUrl ? normalizeImageUrl(deletedImageUrl) : null;
                state.results = state.results.filter(r => {
                    if (String(r.id) === id) return false;
                    if (deletedNormalized && r.imageUrl && normalizeImageUrl(r.imageUrl) === deletedNormalized) return false;
                    return true;
                });
                // Persist cleaned state.results to local storage
                if (window.saveResults) saveResults();
            }

            renderAllOutfitsGrid();
            updateAllOutfitsBottomBar();
            showToast(t('all_outfits.moved_to_trash') || 'Đã chuyển vào thùng rác', 'success');
        } else {
            throw new Error(response?.error || 'Unknown error');
        }
    } catch (err) {
        console.error('[AllOutfits] Soft-delete failed:', err);
        showToast(t('all_outfits.delete_error') || 'Không thể xoá outfit', 'error');
    }
}

async function restoreOutfit(id) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'RESTORE_OUTFIT',
            data: { id }
        });

        if (response?.success) {
            allOutfitsDeletedData = allOutfitsDeletedData.filter(o => o.id !== id);
            renderAllOutfitsGrid();
            showToast(t('all_outfits.restored') || 'Đã khôi phục outfit', 'success');
        } else {
            throw new Error(response?.error || 'Unknown error');
        }
    } catch (err) {
        console.error('[AllOutfits] Restore failed:', err);
        showToast(t('all_outfits.restore_error') || 'Không thể khôi phục', 'error');
    }
}

async function permanentDeleteOutfit(id) {
    const confirmMsg = t('all_outfits.permanent_delete_confirm') || 'Xoá vĩnh viễn outfit này?';
    const confirmDetail = t('all_outfits.permanent_delete_msg') || 'Hành động này không thể hoàn tác.';
    if (!window.confirm(`${confirmMsg}\n${confirmDetail}`)) return;

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'PERMANENT_DELETE_OUTFIT',
            data: { id }
        });

        if (response?.success) {
            allOutfitsDeletedData = allOutfitsDeletedData.filter(o => o.id !== id);
            renderAllOutfitsGrid();
            showToast(t('all_outfits.permanently_deleted') || 'Đã xoá vĩnh viễn', 'success');
        } else {
            throw new Error(response?.error || 'Unknown error');
        }
    } catch (err) {
        console.error('[AllOutfits] Permanent delete failed:', err);
        showToast(t('all_outfits.delete_error') || 'Không thể xoá', 'error');
    }
}

// ==========================================
// EVENT SETUP
// ==========================================

function setupAllOutfitsEvents() {
    // Close button
    document.getElementById('ao-close-btn')?.addEventListener('click', closeAllOutfits);

    // Search toggle
    document.getElementById('ao-search-btn')?.addEventListener('click', toggleAllOutfitsSearch);

    // Search input
    const searchInput = document.getElementById('ao-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            allOutfitsSearchQuery = e.target.value;
            renderAllOutfitsGrid();
        });
    }

    // Tabs
    document.querySelectorAll('#all-outfits-section .ao-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchAllOutfitsTab(tab.dataset.tab);
        });
    });

    // Compare button
    document.getElementById('ao-compare-btn')?.addEventListener('click', handleAllOutfitsCompare);

    // Lookbook button
    document.getElementById('ao-lookbook-btn')?.addEventListener('click', handleAllOutfitsLookbook);
}

// ==========================================
// INIT
// ==========================================
setupAllOutfitsEvents();

// ==========================================
// EXPOSE
// ==========================================
window.openAllOutfits = openAllOutfits;
window.closeAllOutfits = closeAllOutfits;
window.toggleOutfitSelect = toggleOutfitSelect;
window.switchAllOutfitsTab = switchAllOutfitsTab;
window.toggleAllOutfitsSearch = toggleAllOutfitsSearch;
window.handleAllOutfitsCompare = handleAllOutfitsCompare;
window.handleAllOutfitsLookbook = handleAllOutfitsLookbook;
window.deleteOutfit = deleteOutfit;
window.restoreOutfit = restoreOutfit;
window.permanentDeleteOutfit = permanentDeleteOutfit;
