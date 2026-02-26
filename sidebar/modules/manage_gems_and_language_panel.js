/**
 * File: manage_gems_and_language_panel.js
 * Purpose: Quản lý Gems panel (mua gems) và Language panel (đổi ngôn ngữ)
 * Layer: Presentation
 *
 * Input: state.gemsBalance, state.locale, state.showGemsPanel, state.showLanguagePanel
 * Output: Hiển thị/ẩn gems và language panels, cập nhật locale + i18n strings
 *
 * Flow:
 * 1. toggleGemsPanel/showGemsPanel/hideGemsPanel → toggle gems panel
 * 2. purchaseGems → mở web app checkout
 * 3. toggleLanguagePanel/changeLanguage → cập nhật locale, lưu preference
 * 4. updateUIStrings → sync toàn bộ DOM với i18n keys
 * 5. updateGemPackagePrices → cập nhật giá theo locale
 */

function toggleGemsPanel() {
    const gemsPanel = document.getElementById('gems-panel');
    const languagePanel = document.getElementById('language-panel');
    const profileMenu = document.getElementById('profile-menu');

    if (languagePanel && !languagePanel.classList.contains('hidden')) hideLanguagePanel();
    if (profileMenu && !profileMenu.classList.contains('hidden')) hideProfileMenu();

    if (gemsPanel?.classList.contains('hidden')) window.showGemsPanel();
    else hideGemsPanel();
}

function showGemsPanel() {
    const gemsPanel = document.getElementById('gems-panel');
    const gemsPanelBalance = document.getElementById('gems-panel-balance');
    const gemsPanelTries = document.getElementById('gems-panel-tries');
    if (gemsPanelBalance) gemsPanelBalance.textContent = state.gemsBalance;
    if (gemsPanelTries) gemsPanelTries.textContent = Math.floor(state.gemsBalance / GEM_COST_STANDARD);
    gemsPanel?.classList.remove('hidden');
    state.showGemsPanel = true;
    updateGemPackagePrices(); // Always render prices in current locale when panel opens
}

function hideGemsPanel() {
    document.getElementById('gems-panel')?.classList.add('hidden');
    state.showGemsPanel = false;
}

async function purchaseGems(packageId) {
    // FIX: Sidebar không dùng state.session — lấy token từ chrome.storage.local
    if (!state.authenticated) {
        showToast(t('login_to_try'), 'error');
        return;
    }

    // Lấy access_token từ Supabase ChromeStorageAdapter key
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
        console.error('[purchaseGems] Error reading auth token:', e);
    }

    if (!accessToken) {
        showToast(t('login_to_try'), 'error');
        return;
    }

    try {
        hideGemsPanel();
        showToast(t('opening_checkout'), 'info');

        // Gọi Edge Function để lấy Checkout URL (Polar)
        const response = await fetch(`${SUPABASE_URL}/functions/v1/create-polar-checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ package_id: packageId })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to create checkout session');
        }

        const data = await response.json();
        if (data.url) {
            chrome.tabs.create({ url: data.url });
        } else {
            throw new Error('No checkout URL returned');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        showToast(t('payment_error_message') || 'Thanh toán lỗi, vui lòng thử lại', 'error');
    }
}

// ==========================================
// LANGUAGE PANEL
// ==========================================

function toggleLanguagePanel() {
    const languagePanel = document.getElementById('language-panel');
    const gemsPanel = document.getElementById('gems-panel');
    const profileMenu = document.getElementById('profile-menu');

    if (gemsPanel && !gemsPanel.classList.contains('hidden')) hideGemsPanel();
    if (profileMenu && !profileMenu.classList.contains('hidden')) hideProfileMenu();

    if (languagePanel?.classList.contains('hidden')) showLanguagePanel();
    else hideLanguagePanel();
}

function showLanguagePanel() {
    updateLanguageOptions();
    document.getElementById('language-panel')?.classList.remove('hidden');
    state.showLanguagePanel = true;
}

function hideLanguagePanel() {
    document.getElementById('language-panel')?.classList.add('hidden');
    state.showLanguagePanel = false;
}

function updateLanguageOptions() {
    const { LOCALE_INFO, SUPPORTED_LOCALES } = window.i18nHelpers || {};
    const localeInfoFallback = LOCALE_INFO || {
        en: { native: 'English', flag: '🇺🇸' },
        vi: { native: 'Tiếng Việt', flag: '🇻🇳' },
        ja: { native: '日本語', flag: '🇯🇵' },
        ko: { native: '한국어', flag: '🇰🇷' },
        zh: { native: '中文', flag: '🇨🇳' },
        th: { native: 'ไทย', flag: '🇹🇭' },
        id: { native: 'Bahasa Indonesia', flag: '🇮🇩' },
        es: { native: 'Español', flag: '🇪🇸' },
        fr: { native: 'Français', flag: '🇫🇷' },
    };

    document.querySelectorAll('.language-option').forEach(opt => {
        const lang = opt.dataset.lang;
        opt.classList.toggle('active', lang === state.locale);
        const info = localeInfoFallback[lang];
        if (info) {
            const flagEl = opt.querySelector('.lang-flag');
            const nameEl = opt.querySelector('.lang-name');
            if (flagEl) flagEl.textContent = info.flag;
            if (nameEl) nameEl.textContent = info.native;
        }
    });

    const currentLangDisplay = document.getElementById('current-language-display');
    const languageBtn = document.getElementById('language-btn');
    const info = localeInfoFallback[state.locale];
    if (info) {
        if (currentLangDisplay) currentLangDisplay.textContent = `${info.flag} ${info.native}`;
        if (languageBtn) { languageBtn.textContent = info.flag; languageBtn.title = info.native; }
    }
}

async function changeLanguage(locale) {
    const { SUPPORTED_LOCALES, saveLocalePreference } = window.i18nHelpers || {};
    const validLocales = SUPPORTED_LOCALES || ['en', 'vi', 'ja', 'ko', 'zh', 'th', 'id', 'es', 'fr'];
    if (!validLocales.includes(locale)) return;

    state.locale = locale;

    if (saveLocalePreference) {
        await saveLocalePreference(locale);
    } else {
        await chrome.storage.local.set({ extension_locale: locale });
    }

    updateLanguageOptions();
    updateUIStrings();
    updateGemPackagePrices(); // Sync gem prices to new locale currency
    hideLanguagePanel();

    if (state.authenticated) {
        try {
            await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', data: { language: locale } });
        } catch (e) { /* ignore */ }
    }

    showToast('✅ ' + t('changed_to'), 'success');
}

function updateUIStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const text = t(key);
        if (text && text !== key) el.textContent = text;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (!key) return;
        const text = t(key);
        if (text) el.placeholder = text;
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (!key) return;
        const text = t(key);
        if (text) el.title = text;
    });

    if (elements.tryOnBtn && !elements.tryOnBtn.disabled) {
        const triesRemaining = Math.floor(state.gemsBalance / GEM_COST_STANDARD);
        const tries = t('tries_remaining').includes('{tries}')
            ? t('tries_remaining').replace('{tries}', triesRemaining)
            : `${triesRemaining} ${t('tries_remaining')}`;
        if (state.modelImage && state.clothingImage && state.gemsBalance < GEM_COST_STANDARD) {
            elements.tryOnBtn.innerHTML = `💎 ${t('try_on_button.not_enough_gems')}`;
        } else {
            elements.tryOnBtn.innerHTML = `✨ ${t('try_on_button.try_now')} <span class="gem-cost">(${tries})</span>`;
        }
    }
}

function updateGemPackagePrices() {
    const packages = [
        { selector: '[data-package="starter"]', price: 49000 },
        { selector: '[data-package="pro"]', price: 129000 },
        { selector: '[data-package="premium"]', price: 399000 },
    ];
    packages.forEach(pkg => {
        const el = document.querySelector(pkg.selector);
        if (!el) return;
        const priceEl = el.querySelector('.package-price');
        if (priceEl) priceEl.textContent = formatPrice(pkg.price);
        const badgeEl = el.querySelector('.package-badge');
        if (badgeEl) badgeEl.textContent = t('popular');
        const nameEl = el.querySelector('.package-name');
        if (nameEl) {
            const packageKey = pkg.selector.match(/data-package="(\w+)"/)?.[1];
            if (packageKey) nameEl.textContent = t(`${packageKey}_pack`);
        }
    });
}

async function loadLanguagePreference() {
    try {
        const { loadLocalePreference, DEFAULT_LOCALE } = window.i18nHelpers || {};
        if (loadLocalePreference) {
            state.locale = await loadLocalePreference();
        } else {
            const data = await chrome.storage.local.get('extension_locale');
            state.locale = data.extension_locale || 'vi';
        }
        updateUIStrings();
        updateLanguageOptions();
        updateGemPackagePrices(); // Init gem prices according to saved locale
    } catch (e) {
        state.locale = 'vi';
        updateGemPackagePrices(); // Fallback: show VND prices
    }
}

// Expose ra window
window.toggleGemsPanel = toggleGemsPanel;
window.showGemsPanel = showGemsPanel;
window.hideGemsPanel = hideGemsPanel;
window.purchaseGems = purchaseGems;
window.toggleLanguagePanel = toggleLanguagePanel;
window.showLanguagePanel = showLanguagePanel;
window.hideLanguagePanel = hideLanguagePanel;
window.updateLanguageOptions = updateLanguageOptions;
window.changeLanguage = changeLanguage;
window.updateUIStrings = updateUIStrings;
window.updateGemPackagePrices = updateGemPackagePrices;
window.loadLanguagePreference = loadLanguagePreference;
