/**
 * File: purchase_gems_handler.js
 * Purpose: Xử lý logic mua Gems qua Polar.sh với đồng bộ tiền tệ theo ngôn ngữ
 * Layer: Presentation
 * 
 * Input: User click vào gem package
 * Output: Redirect đến Polar checkout URL
 * 
 * Flow:
 * 1. Fetch gem packages từ database (với gateway_price_id)
 * 2. Render packages vào UI với giá theo locale (VND cho vi, USD cho en, etc.)
 * 3. Handle click → gọi Edge Function create-polar-checkout
 * 4. Redirect user đến Polar checkout page
 * 
 * Security Note:
 * - Yêu cầu authentication (access_token)
 * - Validate package_id trước khi gọi Edge Function
 */

// ============================================================================
// FETCH GEM PACKAGES
// ============================================================================

/**
 * Fetch available gem packages từ database
 * @returns {Promise<Array>} List of gem packages
 */
async function fetchGemPackages() {
    try {
        const { data, error } = await supabase
            .from('gem_packages')
            .select('*')
            .eq('is_active', true)
            .eq('gateway_provider', 'polar')
            .order('gems', { ascending: true });

        if (error) {
            console.error('[fetchGemPackages] Error:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('[fetchGemPackages] Exception:', error);
        return [];
    }
}

// ============================================================================
// RENDER GEM PACKAGES
// ============================================================================

/**
 * Render gem packages trong UI với giá đồng bộ theo locale
 * @param {Array} packages - List of gem packages
 */
function renderGemPackages(packages) {
    const container = document.querySelector('.gem-packages');
    if (!container) return;

    // Clear existing packages
    container.innerHTML = '';

    // Get current locale
    const locale = window.state?.locale || 'vi';
    const { formatCurrency } = window.i18n || {};

    // Package icons
    const icons = {
        50: '<span class="material-symbols-outlined" style="color: #fbc02d;">bolt</span>',
        120: '<span class="material-symbols-outlined" style="color: #fdd835;">auto_awesome</span>',
        250: '<span class="material-symbols-outlined" style="color: #f57c00;">star</span>',
        800: '<span style="font-size: 22px;">👑</span>'
    };

    // Find the package with the best value (lowest price per gem)
    const bestValuePkg = packages.reduce((best, pkg) => {
        const ppg = pkg.price_vnd / pkg.gems;
        return (!best || ppg < best.ppg) ? { id: pkg.id, ppg } : best;
    }, null);

    packages.forEach((pkg) => {
        const isPopular = pkg.gems === 120;
        const isBestValue = bestValuePkg && pkg.id === bestValuePkg.id;
        const icon = icons[pkg.gems] || '<span class="material-symbols-outlined">diamond</span>';

        // STEP 1: Format price theo locale
        let priceText = '';
        if (formatCurrency) {
            priceText = formatCurrency(pkg.price_vnd, locale, true);
        } else {
            priceText = locale === 'vi' ? `${pkg.price_vnd.toLocaleString('vi-VN')}₫` : `$${pkg.price_usd}`;
        }

        // STEP 2: Calculate per-gem price
        const perGemVND = Math.round(pkg.price_vnd / pkg.gems);
        let perGemText = '';
        if (formatCurrency) {
            perGemText = formatCurrency(perGemVND, locale, true);
        } else {
            perGemText = locale === 'vi' ? `${perGemVND.toLocaleString('vi-VN')}₫` : `$${(pkg.price_usd / pkg.gems).toFixed(2)}`;
        }

        const packageEl = document.createElement('button');
        let classes = 'gem-package';
        if (isPopular) classes += ' popular';
        if (isBestValue && !isPopular) classes += ' best-value';
        packageEl.className = classes;
        packageEl.dataset.packageId = pkg.id;
        packageEl.dataset.gems = pkg.gems;

        // STEP 3: Build inner HTML
        const popularBadgeHTML = isPopular ? `
            <div class="popular-badge-container">
                <span class="badge-text" data-i18n="popular">Phổ<br>biến</span>
            </div>
        ` : '';

        const bestValueTagHTML = (isBestValue && !isPopular) ? `
            <div class="best-value-tag" data-i18n="best_value">Tiết kiệm nhất</div>
        ` : '';

        packageEl.innerHTML = `
            ${popularBadgeHTML}
            ${bestValueTagHTML}
            
            <div class="package-icon-wrapper">
                ${icon}
            </div>
            
            <div class="package-info">
                <span class="package-name">${pkg.name}</span>
                <div class="package-gems">
                    ${pkg.gems} <span class="material-symbols-outlined" style="font-size: 13px; margin-left: 2px;">diamond</span>
                    <span class="package-per-gem">· ${perGemText}/${window.t ? window.t('gem_per_try') || '/gem' : '/gem'}</span>
                </div>
            </div>
            
            <span class="package-price">${priceText}</span>
        `;

        packageEl.addEventListener('click', () => handlePurchaseClick(pkg));
        container.appendChild(packageEl);
    });

    // Update i18n strings
    if (window.updateUIStrings) {
        window.updateUIStrings();
    }

    // Update payment note
    const noteEl = document.querySelector('.gems-panel-note');
    if (noteEl) {
        noteEl.setAttribute('data-i18n', 'payment_note');
        if (window.t) {
            noteEl.textContent = window.t('payment_note') || 'Thanh toán an toàn qua Polar.sh';
        }
    }
}

// ============================================================================
// HANDLE PURCHASE
// ============================================================================

/**
 * Handle purchase button click
 * @param {Object} package - Selected gem package
 */
async function handlePurchaseClick(pkg) {
    console.log('[handlePurchaseClick] Package:', pkg);

    // Check authentication
    if (!state.authenticated) {
        showToast(t('login_to_try') || 'Vui lòng đăng nhập', 'error');
        return;
    }

    // Get access token from Supabase ChromeStorageAdapter key
    let accessToken;
    try {
        const storageData = await chrome.storage.local.get(['fitly-auth-token']);
        if (storageData['fitly-auth-token']) {
            const parsed = typeof storageData['fitly-auth-token'] === 'string'
                ? JSON.parse(storageData['fitly-auth-token'])
                : storageData['fitly-auth-token'];
            accessToken = parsed?.access_token;
        }
    } catch (e) {
        console.error('[handlePurchaseClick] Error reading auth token:', e);
    }

    if (!accessToken) {
        showToast(t('login_to_try') || 'Vui lòng đăng nhập', 'error');
        return;
    }

    try {
        // Hide gems panel
        hideGemsPanel();

        // Show loading toast
        showToast(t('opening_checkout') || 'Đang mở trang thanh toán...', 'info');

        // Call Edge Function to create checkout session
        const response = await fetch(`${SUPABASE_URL}/functions/v1/create-polar-checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                package_id: pkg.id
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to create checkout session');
        }

        const data = await response.json();

        if (data.url) {
            // Open checkout URL in new tab
            chrome.tabs.create({ url: data.url });
            showToast('✅ Đã mở trang thanh toán', 'success');
        } else {
            throw new Error('No checkout URL returned');
        }

    } catch (error) {
        console.error('[handlePurchaseClick] Error:', error);
        showToast(
            t('payment_error_message') || 'Thanh toán lỗi, vui lòng thử lại',
            'error'
        );
    }
}

// ============================================================================
// INITIALIZE
// ============================================================================

/**
 * Initialize gem packages
 * Called when gems panel is opened
 */
async function initializeGemPackages() {
    console.log('[initializeGemPackages] Fetching packages...');

    const packages = await fetchGemPackages();

    if (packages.length === 0) {
        console.warn('[initializeGemPackages] No packages found');
        // Show fallback UI
        const container = document.querySelector('.gem-packages');
        if (container) {
            container.innerHTML = '<p style="text-align: center; color: #666;">Không có gói gems nào khả dụng</p>';
        }
        return;
    }

    console.log('[initializeGemPackages] Found', packages.length, 'packages');
    renderGemPackages(packages);
}

// ============================================================================
// OVERRIDE EXISTING FUNCTIONS
// ============================================================================

/**
 * Override showGemsPanel to fetch packages dynamically
 */
const originalShowGemsPanel = window.showGemsPanel;
window.showGemsPanel = async function () {
    // Call original function
    if (originalShowGemsPanel) {
        originalShowGemsPanel();
    }

    // Initialize packages
    await initializeGemPackages();
};

// ============================================================================
// EXPORTS
// ============================================================================

window.fetchGemPackages = fetchGemPackages;
window.renderGemPackages = renderGemPackages;
window.handlePurchaseClick = handlePurchaseClick;
window.initializeGemPackages = initializeGemPackages;

console.log('[purchase_gems_handler.js] Loaded');
