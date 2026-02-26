/**
 * File: state_and_config.js
 * Purpose: Khai báo state toàn cục, config constants, và i18n helpers
 * Layer: Domain
 *
 * Input: window.i18n (loaded từ lib/i18n.js)
 * Output: window.state, window.GEM_COST_*, helpers t(), formatPrice(), getTimeAgo(),
 *         getCategoryLabel(), getTagLabel(), $(), elements{}
 *
 * Flow:
 * 1. Destructure window.i18n refs
 * 2. Khai báo state object
 * 3. Export helper functions ra window
 */

// ==========================================
// I18N - Use window.i18n from lib/i18n.js
// ==========================================
const {
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
    LOCALE_INFO,
    CURRENCY_CONFIG,
    TRANSLATIONS,
    LOADING_MESSAGES,
    t: i18nT,
    formatCurrency,
    formatPriceVND,
    formatTimeAgo,
    getLoadingMessage,
    saveLocalePreference,
    loadLocalePreference,
} = window.i18n || {};

// ==========================================
// GLOBAL STATE
// ==========================================
const state = {
    authenticated: false,
    user: null,
    profile: null,
    gemsBalance: 0,
    modelImage: null,
    clothingImage: null,
    selectedItems: [], // Array of { id, imageUrl, name, category }
    mixMatchMode: false, // false = single item (replace), true = multi item (up to 4)
    selectedCategory: 'top',
    clothingSourceUrl: null,
    resultImage: null,
    isProcessing: false,
    recentClothing: [],
    showRecentClothing: false,
    userModels: [],
    defaultModelId: null,
    selectedModelId: null,
    results: [],
    activePopups: [],
    resultWindows: {},
    nextResultId: 1,
    activeGalleryTab: 'latest',
    locale: 'vi',
    showGemsPanel: false,
    showLanguagePanel: false,
    hiddenOutfitIds: [], // IDs of outfits hidden by user (not deleted)
    showHiddenOutfits: false, // Toggle show/hide hidden outfits
    tryonProcessing: false, // Guard: suppress auth-expired handlers during active try-on
};

// ==========================================
// CONFIG
// ==========================================
const GEM_COST_STANDARD = 5;
const GEM_COST_HD = 10;
const MAX_SELECTED_ITEMS = 5;

// ==========================================
// I18N HELPERS
// ==========================================
function t(key, vars = {}) {
    if (!i18nT) {
        console.warn('[i18n] i18n module not loaded');
        return key;
    }
    return i18nT(key, state.locale, vars);
}

function formatPrice(amountVND) {
    if (!formatCurrency) return amountVND + '₫';
    return formatCurrency(amountVND, state.locale);
}

function getTimeAgo(timestamp) {
    if (!formatTimeAgo) return '';
    return formatTimeAgo(timestamp, state.locale);
}

function getCategoryLabel(category) {
    if (!category) return '';
    return t(`category.${category}`) || category;
}

function getTagLabel(tag) {
    const colors = {
        latest: '#3b82f6',
        shared: '#10b981',
        draft: '#f59e0b',
        archived: '#6b7280'
    };
    const icons = {
        latest: 'schedule',
        shared: 'share',
        draft: 'edit_note',
        archived: 'archive'
    };
    return {
        label: t(`tag.${tag}`) || tag,
        icon: icons[tag] || 'label',
        color: colors[tag] || '#6b7280'
    };
}

// ==========================================
// DOM HELPERS
// ==========================================
const $ = (id) => document.getElementById(id);

const elements = {
    gemsDisplay: $('gems-display'),
    gemsCount: $('gems-count'),
    profileBtn: $('profile-btn'),
    sidebarLoadingSection: $('sidebar-loading-section'),
    authSection: $('auth-section'),
    mainContent: $('main-content'),
    resultSection: $('result-section'),
    loginGoogleBtn: $('login-google-btn'),
    modelImageContainer: $('model-image-container'),
    modelImage: $('model-image'),
    modelPlaceholder: $('model-placeholder'),
    modelUploadInput: $('model-upload-input'),
    changeModelBtn: $('change-model-btn'),
    clothingImageContainer: $('clothing-image-container'),
    clothingImage: $('clothing-image'),
    clothingPlaceholder: $('clothing-placeholder'),
    selectedItemsBubbles: $('selected-items-bubbles'),
    pasteUrlBtn: $('paste-url-btn'),
    tryOnBtn: $('try-on-btn'),
    resultPreviewSection: $('result-preview-section'),
    resultThumbnails: $('result-thumbnails'),
    resultCount: $('result-count'),
    clearAllResults: $('clear-all-results'),
    loadingOverlay: $('loading-overlay'),
    loadingText: $('loading-text'),
    loadingProgressBar: $('loading-progress-bar'),
    errorOverlay: $('error-overlay'),
    errorMessageText: $('error-message-text'),
    errorRetryBtn: $('error-retry-btn'),
    errorCloseBtn: $('error-close-btn'),
    successOverlay: $('success-overlay'),
    successMessageText: $('success-message-text'),
    successCloseBtn: $('success-close-btn'),
    recentClothingSection: null,
};

// Expose ra window
window.state = state;
window.GEM_COST_STANDARD = GEM_COST_STANDARD;
window.GEM_COST_HD = GEM_COST_HD;
window.MAX_SELECTED_ITEMS = MAX_SELECTED_ITEMS;
window.t = t;
window.formatPrice = formatPrice;
window.getTimeAgo = getTimeAgo;
window.getCategoryLabel = getCategoryLabel;
window.getTagLabel = getTagLabel;
window.$ = $;
window.elements = elements;
window.i18nHelpers = {
    LOADING_MESSAGES,
    getLoadingMessage,
    saveLocalePreference,
    loadLocalePreference,
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
    LOCALE_INFO,
    CURRENCY_CONFIG,
    formatPriceVND,
};
