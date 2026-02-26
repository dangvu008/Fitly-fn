/**
 * File: i18n.js
 * Purpose: Hệ thống đa ngôn ngữ và định dạng tiền tệ cho extension
 * 
 * Features:
 * - Translations đầy đủ cho 9 ngôn ngữ
 * - Currency formatting theo locale
 * - Đồng bộ với web app
 * 
 * Usage: All exports are available via window.i18n object
 * Example: window.i18n.t('hello', 'vi')
 */

// IIFE to avoid polluting global scope but expose via window.i18n if available
(function (global) {

    // =====================================================
    // SUPPORTED LOCALES
    // =====================================================

    const SUPPORTED_LOCALES = ['en', 'vi', 'ja', 'ko', 'zh', 'th', 'id', 'es', 'fr'];
    const DEFAULT_LOCALE = 'vi';

    // =====================================================
    // LOCALE INFO (for display)
    // =====================================================

    const LOCALE_INFO = {
        en: { native: 'English', flag: '🇺🇸', english: 'English' },
        vi: { native: 'Tiếng Việt', flag: '🇻🇳', english: 'Vietnamese' },
        ja: { native: '日本語', flag: '🇯🇵', english: 'Japanese' },
        ko: { native: '한국어', flag: '🇰🇷', english: 'Korean' },
        zh: { native: '中文', flag: '🇨🇳', english: 'Chinese' },
        th: { native: 'ไทย', flag: '🇹🇭', english: 'Thai' },
        id: { native: 'Bahasa Indonesia', flag: '🇮🇩', english: 'Indonesian' },
        es: { native: 'Español', flag: '🇪🇸', english: 'Spanish' },
        fr: { native: 'Français', flag: '🇫🇷', english: 'French' },
    };

    // =====================================================
    // CURRENCY CONFIG (by locale)
    // =====================================================

    const CURRENCY_CONFIG = {
        en: { code: 'USD', symbol: '$', position: 'before', decimals: 2, separator: ',', decimal: '.' },
        vi: { code: 'VND', symbol: '₫', position: 'after', decimals: 0, separator: '.', decimal: ',' },
        ja: { code: 'JPY', symbol: '¥', position: 'before', decimals: 0, separator: ',', decimal: '.' },
        ko: { code: 'KRW', symbol: '₩', position: 'before', decimals: 0, separator: ',', decimal: '.' },
        zh: { code: 'CNY', symbol: '¥', position: 'before', decimals: 2, separator: ',', decimal: '.' },
        th: { code: 'THB', symbol: '฿', position: 'before', decimals: 2, separator: ',', decimal: '.' },
        id: { code: 'IDR', symbol: 'Rp', position: 'before', decimals: 0, separator: '.', decimal: ',' },
        es: { code: 'EUR', symbol: '€', position: 'after', decimals: 2, separator: '.', decimal: ',' },
        fr: { code: 'EUR', symbol: '€', position: 'after', decimals: 2, separator: ' ', decimal: ',' },
    };

    // =====================================================
    // TRANSLATIONS
    // =====================================================

    const TRANSLATIONS = global.FITLY_LOCALES || {};

    // =====================================================
    // TRANSLATION FUNCTION
    // =====================================================

    /**
     * Get translation for a key
     * @param {string} key - Translation key
     * @param {string} locale - Locale code
     * @param {object} vars - Variables for interpolation
     * @returns {string}
     */
    function t(key, locale = DEFAULT_LOCALE, vars = {}) {
        // Support dot-notation for nested keys (e.g. 'clothing_history.empty_message')
        function getNestedValue(obj, dotKey) {
            if (!obj) return undefined;
            const parts = dotKey.split('.');
            let current = obj;
            for (const part of parts) {
                if (current == null || typeof current !== 'object') return undefined;
                current = current[part];
            }
            return typeof current === 'string' ? current : undefined;
        }

        const translation =
            getNestedValue(TRANSLATIONS[locale], key) ||
            getNestedValue(TRANSLATIONS[DEFAULT_LOCALE], key) ||
            key;

        // Interpolate variables
        if (vars && typeof translation === 'string') {
            return translation.replace(/\{(\w+)\}/g, (_, varName) => String(vars[varName] ?? ''));
        }

        return translation;
    }

    // =====================================================
    // CURRENCY FORMATTING
    // =====================================================

    /**
     * Foreign currency markup factor (applied when pricing in non-VND currencies)
     * Covers payment processing fees, currency conversion costs, and revenue parity
     */
    const FOREIGN_CURRENCY_MARKUP = 1.18; // 18% markup for non-VND currencies

    /**
     * Format a price in the appropriate currency for the locale
     * @param {number} amount - Amount in VND (base currency)
     * @param {string} locale - Target locale
     * @param {boolean} applyMarkup - Apply foreign currency markup (default: true)
     * @returns {string} Formatted price string
     */
    function formatCurrency(amount, locale = DEFAULT_LOCALE, applyMarkup = true) {
        const config = CURRENCY_CONFIG[locale] || CURRENCY_CONFIG[DEFAULT_LOCALE];

        // Convert from VND to target currency (approximate rates)
        let convertedAmount = convertFromVND(amount, config.code);

        // Apply markup for non-VND currencies to account for payment processing
        // and ensure revenue parity across different markets
        if (applyMarkup && config.code !== 'VND') {
            convertedAmount = convertedAmount * FOREIGN_CURRENCY_MARKUP;
        }

        // Format number
        let formatted = formatNumber(convertedAmount, config.decimals, config.separator, config.decimal);

        // Add currency symbol
        if (config.position === 'before') {
            return `${config.symbol}${formatted}`;
        } else {
            return `${formatted} ${config.symbol}`;
        }
    }

    /**
     * Convert amount from VND to target currency
     * These are approximate exchange rates - in production, use a real API
     */
    function convertFromVND(amountVND, targetCurrency) {
        const rates = {
            VND: 1,
            USD: 0.00004,      // 1 USD ≈ 25,000 VND
            JPY: 0.006,        // 1 JPY ≈ 170 VND
            KRW: 0.053,        // 1 KRW ≈ 19 VND
            CNY: 0.00029,      // 1 CNY ≈ 3,500 VND
            THB: 0.0014,       // 1 THB ≈ 700 VND
            IDR: 0.64,         // 1 IDR ≈ 1.56 VND
            EUR: 0.000037,     // 1 EUR ≈ 27,000 VND
        };

        return amountVND * (rates[targetCurrency] || 1);
    }

    /**
     * Format a number with thousands separator and decimal places
     */
    function formatNumber(num, decimals, separator, decimalChar) {
        const fixed = num.toFixed(decimals);
        const parts = fixed.split('.');

        // Add thousands separator
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);

        if (decimals > 0 && parts[1]) {
            return parts[0] + decimalChar + parts[1];
        }

        return parts[0];
    }

    /**
     * Format price in VND (for Vietnamese locale specifically)
     * @param {number} amount - Amount in VND
     * @returns {string}
     */
    function formatPriceVND(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
        }).format(amount);
    }

    // =====================================================
    // TIME AGO FORMATTING
    // =====================================================

    /**
     * Format a timestamp to "time ago" string
     * @param {string|number|Date} timestamp
     * @param {string} locale
     * @returns {string}
     */
    function formatTimeAgo(timestamp, locale = DEFAULT_LOCALE) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();

        const minutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);

        if (minutes < 1) return t('just_now', locale);
        if (minutes < 60) return t('minutes_ago', locale, { count: minutes });
        if (hours < 24) return t('hours_ago', locale, { count: hours });
        if (days < 7) return t('days_ago', locale, { count: days });
        if (weeks < 5) return t('weeks_ago', locale, { count: weeks });
        return t('months_ago', locale, { count: months });
    }

    // =====================================================
    // LOADING MESSAGES
    // =====================================================

    const LOADING_MESSAGES = {
        en: [
            'Finding the perfect fit... ✨',
            'AI stylist is working magic... 🪄',
            'Almost there, looking fabulous! 💫',
            'Creating your look... 👗',
            'Mixing colors beautifully... 🎨',
        ],
        vi: [
            'Đang tìm phong cách hoàn hảo... ✨',
            'AI stylist đang làm phép... 🪄',
            'Sắp xong rồi, đẹp lắm! 💫',
            'Đang tạo look cho bạn... 👗',
            'Đang phối màu thật đẹp... 🎨',
        ],
        ja: [
            'ぴったりのスタイルを探しています... ✨',
            'AIスタイリストが魔法をかけています... 🪄',
            'もうすぐ完成、素敵です！ 💫',
            'あなたのルックを作成中... 👗',
            '美しく色を合わせています... 🎨',
        ],
        ko: [
            '완벽한 스타일을 찾는 중... ✨',
            'AI 스타일리스트가 마법을 부리는 중... 🪄',
            '거의 완성! 멋져요! 💫',
            '당신의 룩을 만드는 중... 👗',
            '아름답게 색을 조합하는 중... 🎨',
        ],
        zh: [
            '正在寻找完美风格... ✨',
            'AI造型师正在施展魔法... 🪄',
            '快好了，看起来很棒！ 💫',
            '正在为您打造造型... 👗',
            '正在美丽地搭配颜色... 🎨',
        ],
        th: [
            'กำลังหาสไตล์ที่ลงตัว... ✨',
            'AI สไตลิสต์กำลังทำเวทมนตร์... 🪄',
            'เกือบเสร็จแล้ว สวยมาก! 💫',
            'กำลังสร้างลุคให้คุณ... 👗',
            'กำลังผสมสีอย่างสวยงาม... 🎨',
        ],
        id: [
            'Mencari gaya yang sempurna... ✨',
            'AI stylist sedang bekerja... 🪄',
            'Hampir selesai, terlihat cantik! 💫',
            'Membuat tampilan Anda... 👗',
            'Memadukan warna dengan indah... 🎨',
        ],
        es: [
            'Buscando el estilo perfecto... ✨',
            'El estilista AI está haciendo magia... 🪄',
            '¡Casi listo, te ves fabuloso! 💫',
            'Creando tu look... 👗',
            'Combinando colores hermosamente... 🎨',
        ],
        fr: [
            'Recherche du style parfait... ✨',
            'Le styliste IA fait sa magie... 🪄',
            'Presque fini, ça a l\'air fabuleux ! 💫',
            'Création de votre look... 👗',
            'Association harmonieuse des couleurs... 🎨',
        ],
    };

    /**
     * Get loading message for locale
     * @param {number} index
     * @param {string} locale
     * @returns {string}
     */
    function getLoadingMessage(index, locale = DEFAULT_LOCALE) {
        const messages = LOADING_MESSAGES[locale] || LOADING_MESSAGES[DEFAULT_LOCALE];
        return messages[index % messages.length];
    }

    // =====================================================
    // STORAGE HELPERS
    // =====================================================

    /**
     * Save locale preference to storage
     */
    async function saveLocalePreference(locale) {
        try {
            await chrome.storage.local.set({ extension_locale: locale });
            return true;
        } catch (e) {
            console.error('Failed to save locale preference:', e);
            return false;
        }
    }

    /**
     * Load locale preference from storage
     */
    async function loadLocalePreference() {
        try {
            const data = await chrome.storage.local.get('extension_locale');
            if (data.extension_locale && SUPPORTED_LOCALES.includes(data.extension_locale)) {
                return data.extension_locale;
            }

            // Fallback to browser language
            const browserLang = navigator.language?.split('-')[0];
            if (SUPPORTED_LOCALES.includes(browserLang)) {
                return browserLang;
            }

            return DEFAULT_LOCALE;
        } catch (e) {
            console.error('Failed to load locale preference:', e);
            return DEFAULT_LOCALE;
        }
    }

    // =====================================================
    // EXPOSE TO GLOBALS
    // =====================================================

    global.i18n = {
        SUPPORTED_LOCALES,
        DEFAULT_LOCALE,
        LOCALE_INFO,
        CURRENCY_CONFIG,
        TRANSLATIONS,
        LOADING_MESSAGES,
        t,
        formatCurrency,
        formatPriceVND,
        formatTimeAgo,
        getLoadingMessage,
        saveLocalePreference,
        loadLocalePreference,
    };

    // Khai báo t ra global (sử dụng được trong service worker và content scripts)
    global.t = t;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
