/**
 * File: handle_add_wardrobe_modal.js
 * Purpose: Modal cho phép user xác nhận và chọn category khi thêm item vào tủ đồ từ context menu
 * Layer: Presentation
 *
 * Input: { imageUrl, pageUrl, detectedCategory, sourceName, altText }
 * Output: Gửi ADD_TO_WARDROBE message đến background với category đã chọn
 *
 * Flow:
 * 1. openAddWardrobeModal(data) → populate preview + validate image quality + show modal
 * 2. User chọn category chip → enable save button
 * 3. User confirm → gửi ADD_TO_WARDROBE → toast success → đóng modal
 * 4. closeAddWardrobeModal() → đóng modal, xóa state
 *
 * Edge Cases:
 * - Ảnh không tải được → hiển thị placeholder
 * - Ảnh kích thước nhỏ / aspect ratio lạ → hiển thị warning (non-blocking)
 * - User đóng modal trước khi chọn → không lưu gì
 * - ADD_TO_WARDROBE thất bại → toast error + không đóng modal
 */

// ==========================================
// IMAGE QUALITY VALIDATION CONSTANTS
// ==========================================

/** Minimum natural dimensions for a usable wardrobe item image */
const WARDROBE_MIN_WIDTH = 200;
const WARDROBE_MIN_HEIGHT = 200;

/** Acceptable aspect ratio range (width / height) */
const WARDROBE_MIN_ASPECT = 0.25; // Extremely tall — likely not a product shot
const WARDROBE_MAX_ASPECT = 2.5;  // Very wide — likely banner or panorama

/** URL patterns that indicate non-product images (icons, logos, banners, etc.) */
const WARDROBE_EXCLUDED_URL_PATTERNS = /\b(icon|logo|sprite|avatar|badge|flag|emoji|placeholder|loading|spinner|arrow|chevron|close|menu|hamburger|banner|promo|hero|social|facebook|twitter|instagram|youtube|tiktok|pinterest|payment|visa|mastercard|paypal|1x1|spacer|pixel|tracking|ad-|advert)\b/i;

let _pendingWardrobeItem = null;
let _selectedCategory = null;
let _qualityWarningDismissed = false;

function openAddWardrobeModal(data) {
    _pendingWardrobeItem = data;
    _selectedCategory = data.detectedCategory || null;
    _qualityWarningDismissed = false;

    const modal = document.getElementById('wardrobe-category-modal');
    if (!modal) return;

    // STEP 1: Set preview image + run quality validation on load
    const previewImg = document.getElementById('category-modal-preview-img');
    if (previewImg) {
        previewImg.src = data.imageUrl || '';
        previewImg.onerror = () => {
            previewImg.style.display = 'none';
            const placeholder = document.getElementById('category-modal-img-placeholder');
            if (placeholder) placeholder.classList.remove('hidden');
            // Cannot validate → show generic warning
            _showQualityWarning('Không thể tải ảnh để kiểm tra chất lượng.');
        };
        previewImg.onload = () => {
            previewImg.style.display = '';
            const placeholder = document.getElementById('category-modal-img-placeholder');
            if (placeholder) placeholder.classList.add('hidden');

            // Validate image quality after natural dimensions are available
            const validation = _validateWardrobeImage(previewImg, data.imageUrl);
            if (!validation.valid) {
                _showQualityWarning(validation.reason);
            } else {
                _hideQualityWarning();
            }
        };
    }

    // STEP 2: Set default name
    const nameInput = document.getElementById('category-modal-name');
    if (nameInput) {
        const defaultName = data.sourceName ? `Saved from ${data.sourceName}` : (data.altText || '');
        nameInput.value = defaultName;
        nameInput.placeholder = typeof t === 'function' ? t('item_name_optional') : 'Tên item (tùy chọn)';
    }

    // STEP 3: Pre-select detected category
    _resetCategoryChips();
    if (_selectedCategory) {
        _selectCategory(_selectedCategory);
    }

    // STEP 4: Update save button state
    _updateSaveButton();

    // STEP 5: Show modal with animation
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });
}

function closeAddWardrobeModal() {
    const modal = document.getElementById('wardrobe-category-modal');
    if (!modal) return;

    modal.classList.remove('visible');
    setTimeout(() => {
        modal.classList.add('hidden');
        _pendingWardrobeItem = null;
        _selectedCategory = null;
        _qualityWarningDismissed = false;
        _resetCategoryChips();
        _hideQualityWarning();

        // Clear name input
        const nameInput = document.getElementById('category-modal-name');
        if (nameInput) nameInput.value = '';

        // Clear preview
        const previewImg = document.getElementById('category-modal-preview-img');
        if (previewImg) previewImg.src = '';
    }, 250);
}

// ==========================================
// IMAGE QUALITY VALIDATION
// ==========================================

/**
 * Validate a wardrobe image based on natural dimensions, aspect ratio, and URL patterns.
 * This is a non-blocking check — the UI shows a warning but still allows saving.
 *
 * @param {HTMLImageElement} imgEl - The loaded preview image element
 * @param {string} imageUrl - The image URL string
 * @returns {{ valid: boolean, reason: string }}
 */
function _validateWardrobeImage(imgEl, imageUrl) {
    // STEP 1: URL-based fast reject — clearly non-product images
    if (imageUrl && WARDROBE_EXCLUDED_URL_PATTERNS.test(imageUrl)) {
        return {
            valid: false,
            reason: 'Ảnh này trông giống logo, icon hoặc banner quảng cáo — có thể không phù hợp để phối đồ.'
        };
    }

    // STEP 2: Natural dimensions check
    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;

    if (natW > 0 && natH > 0) {
        // Too small — likely thumbnail, icon, or low-quality
        if (natW < WARDROBE_MIN_WIDTH || natH < WARDROBE_MIN_HEIGHT) {
            return {
                valid: false,
                reason: `Ảnh quá nhỏ (${natW}×${natH}px). Nên dùng ảnh rõ nét, tối thiểu 200×200px để thử đồ chính xác hơn.`
            };
        }

        // STEP 3: Aspect ratio check
        const ratio = natW / natH;
        if (ratio < WARDROBE_MIN_ASPECT) {
            return {
                valid: false,
                reason: 'Ảnh quá dọc bất thường — có thể là ảnh cắt hoặc không phải ảnh sản phẩm nguyên vẹn.'
            };
        }
        if (ratio > WARDROBE_MAX_ASPECT) {
            return {
                valid: false,
                reason: 'Ảnh quá ngang — có thể là banner hoặc ảnh panorama, không phù hợp để thử đồ.'
            };
        }
    }

    return { valid: true, reason: '' };
}

/**
 * Show quality warning banner in modal.
 * @param {string} reason - Human-readable explanation
 */
function _showQualityWarning(reason) {
    if (_qualityWarningDismissed) return;
    const banner = document.getElementById('wardrobe-quality-warning');
    const text = document.getElementById('wardrobe-quality-warning-text');
    if (!banner) return;
    if (text) text.textContent = '⚠️ ' + reason;
    banner.classList.remove('hidden');
}

/**
 * Hide quality warning banner.
 */
function _hideQualityWarning() {
    const banner = document.getElementById('wardrobe-quality-warning');
    if (banner) banner.classList.add('hidden');
}

function _selectCategory(category) {
    _selectedCategory = category;
    const chips = document.querySelectorAll('#wardrobe-category-modal .category-chip');
    chips.forEach(chip => {
        chip.classList.toggle('active', chip.dataset.category === category);
    });
    // Thay đổi label nút và phân loại label dựa trên category
    const btn = document.getElementById('confirm-add-wardrobe-btn');
    const isOutfit = category === 'outfit';
    if (btn) {
        const iconEl = btn.querySelector('.material-symbols-outlined');
        if (iconEl) iconEl.textContent = isOutfit ? 'style' : 'checkroom';
        btn.childNodes[btn.childNodes.length - 1].textContent = isOutfit ? ' Lưu vào Outfit' : ' Lưu vào tủ đồ';
    }
    // Update name placeholder
    const nameInput = document.getElementById('category-modal-name');
    if (nameInput && isOutfit) {
        nameInput.placeholder = 'Tên outfit (tùy chọn)';
    } else if (nameInput) {
        nameInput.placeholder = 'Tên item (tùy chọn)';
    }
    _updateSaveButton();
}

function _resetCategoryChips() {
    const chips = document.querySelectorAll('#wardrobe-category-modal .category-chip');
    chips.forEach(chip => chip.classList.remove('active'));
}

function _updateSaveButton() {
    const btn = document.getElementById('confirm-add-wardrobe-btn');
    if (!btn) return;
    btn.disabled = !_selectedCategory;
}

async function _confirmAddToWardrobe() {
    if (!_pendingWardrobeItem || !_selectedCategory) return;

    const btn = document.getElementById('confirm-add-wardrobe-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';
    }

    const nameInput = document.getElementById('category-modal-name');
    const itemName = (nameInput?.value?.trim()) || `Saved from ${_pendingWardrobeItem.sourceName || 'Web'}`;

    try {
        const result = await chrome.runtime.sendMessage({
            type: 'ADD_TO_WARDROBE',
            data: {
                image_url: _pendingWardrobeItem.imageUrl,
                source_url: _pendingWardrobeItem.pageUrl || '',
                name: itemName,
                category: _selectedCategory,
                storage_type: 'external',
                sourceType: 'online'
            }
        });

        if (result?.success) {
            closeAddWardrobeModal();

            if (result.savedAsOutfit) {
                // Lưu dưới dạng Outfit inspiration (ảnh người mẫu toàn thân)
                if (typeof showToast === 'function') {
                    showToast('✅ Đã lưu vào Outfit của bạn!', 'success');
                }
                // Cập nhật ngay section "Outfit vừa tạo"
                if (typeof renderCreatedOutfitsList === 'function') {
                    renderCreatedOutfitsList();
                }
            } else {
                // Lưu vào tủ đồ thông thường
                const categoryLabels = {
                    top: 'Áo', bottom: 'Quần', dress: 'Váy/Đầm',
                    shoes: 'Giày', accessories: 'Phụ kiện'
                };
                const catLabel = categoryLabels[_selectedCategory] || _selectedCategory;
                if (typeof showToast === 'function') {
                    showToast(`✅ Đã thêm vào tủ đồ (${catLabel})`, 'success');
                }

                // Save to recent clothing as well
                await chrome.runtime.sendMessage({
                    type: 'SAVE_RECENT_CLOTHING',
                    data: {
                        imageUrl: _pendingWardrobeItem.imageUrl,
                        sourceUrl: _pendingWardrobeItem.pageUrl || '',
                        name: itemName,
                        category: _selectedCategory,
                        sourceType: 'online',
                        saved: true
                    }
                }).catch(() => { });

                // Refresh wardrobe grid nếu đang mở
                if (typeof renderWardrobeGrid === 'function') {
                    const wardrobeSection = document.getElementById('wardrobe-section');
                    if (wardrobeSection && !wardrobeSection.classList.contains('hidden')) {
                        await loadRecentClothing?.();
                        renderWardrobeGrid();
                    }
                }
            }
        } else if (result?.requireLogin) {
            // STEP: Guest user chưa đăng nhập → đóng modal và nhắc đăng nhập
            closeAddWardrobeModal();
            if (typeof showToast === 'function') {
                showToast('🔐 Vui lòng đăng nhập để lưu vào tủ đồ', 'warning');
            }
            // Trigger login UI nếu có (navigate đến màn hình đăng nhập)
            if (typeof showLoginSection === 'function') {
                showLoginSection();
            }
        } else {
            const errMsg = result?.error || 'Không thể lưu. Vui lòng thử lại.';
            if (typeof showToast === 'function') showToast(`❌ ${errMsg}`, 'error');

            // Re-enable button
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Lưu vào tủ đồ';
            }
        }
    } catch (err) {
        console.error('[Fitly] Error confirming add to wardrobe:', err);
        if (typeof showToast === 'function') showToast('❌ Lỗi kết nối. Thử lại.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Lưu vào tủ đồ';
        }
    }
}

function initAddWardrobeModal() {
    // Close button
    const closeBtn = document.getElementById('close-category-modal-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeAddWardrobeModal);

    // Backdrop click
    const modal = document.getElementById('wardrobe-category-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAddWardrobeModal();
        });
    }

    // Category chips
    const chips = document.querySelectorAll('#wardrobe-category-modal .category-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => _selectCategory(chip.dataset.category));
    });

    // Confirm button
    const confirmBtn = document.getElementById('confirm-add-wardrobe-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', _confirmAddToWardrobe);

    // Quality warning dismiss button
    const dismissBtn = document.getElementById('wardrobe-quality-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            _qualityWarningDismissed = true;
            _hideQualityWarning();
        });
    }
}

// Expose ra window
window.openAddWardrobeModal = openAddWardrobeModal;
window.closeAddWardrobeModal = closeAddWardrobeModal;
window.initAddWardrobeModal = initAddWardrobeModal;
