/**
 * File: detect_fashion_page.js
 * Purpose: Xác định trang hiện tại có phải trang thời trang / e-commerce hay không
 * Layer: Content Script / Filter (L1 + L2)
 *
 * Data Contract:
 * - Input: window.location (URL hiện tại), document <meta>, <title>
 * - Output: window.__fitlyIsFashionPage (boolean) — cached result
 *
 * Flow:
 * 1. Check domain against FASHION_DOMAINS whitelist (đa quốc gia)
 * 2. Check <title>, <meta> keywords/description for fashion keywords (đa ngôn ngữ)
 * 3. Check URL path for product patterns
 * 4. Exclude non-product paths (/login, /cart, /checkout, /account)
 * 5. Cache result per page load
 *
 * Edge Cases:
 * - Marketplace domains (amazon, ebay) — only match fashion sub-paths
 * - Generic domains — fallback to meta/title keyword detection
 * - International sites with non-Latin URLs
 */

(function () {
    'use strict';

    // Prevent multiple executions
    if (typeof window.__fitlyFashionDetectorLoaded !== 'undefined') return;
    window.__fitlyFashionDetectorLoaded = true;

    // ==========================================
    // FASHION DOMAIN WHITELIST
    // ==========================================

    /** Domains that are always considered fashion pages */
    const FASHION_DOMAINS = [
        // Vietnam
        'shopee.vn', 'lazada.vn', 'tiki.vn', 'sendo.vn',
        'onedoshop.com', 'weeboo.vn', 'coolmate.me', 'routine.vn',
        'canifa.com', 'ivy-mode.com', 'elise.vn', 'hnoss.com',
        'yody.vn', 'pantio.vn', 'lados.vn', 'orion.vn',
        'hnshop.vn', 'sixdo.vn', 'hnclassic.vn', 'juno.vn',

        // Global fast fashion
        'zara.com', 'hm.com', 'uniqlo.com', 'asos.com', 'shein.com',
        'fashionnova.com', 'forever21.com', 'mango.com', 'gap.com',
        'oldnavy.com', 'bananarepublic.com', 'primark.com',
        'boohoo.com', 'prettylittlething.com', 'missguided.com',
        'topshop.com', 'next.co.uk', 'riverisland.com',

        // Asian — Japan
        'zozo.jp', 'zozotown.net', 'rakuten.co.jp', 'amazon.co.jp',
        'magaseek.com', 'fashionwalker.com', 'stripe-department.com',
        'baycrews.jp', 'urban-research.jp',

        // Asian — Korea
        'musinsa.com', 'wconcept.com', 'stylenanda.com',
        'gmarket.co.kr', '11st.co.kr', 'coupang.com',
        'ssfshop.com', 'lfmall.co.kr', 'handsome.co.kr',

        // Asian — China
        'taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com',
        'vip.com', 'mogujie.com',

        // Asian — Southeast Asia
        'zalora.com', 'zalora.vn', 'pomelo.com', 'yesstyle.com',
        'lazada.co.th', 'shopee.co.th', 'central.co.th',
        'lazada.co.id', 'shopee.co.id', 'tokopedia.com',
        'lazada.sg', 'shopee.sg', 'lazada.com.my', 'shopee.com.my',
        'lazada.com.ph', 'shopee.ph',

        // Luxury / Premium
        'farfetch.com', 'net-a-porter.com', 'ssense.com',
        'mytheresa.com', 'matchesfashion.com', 'luisaviaroma.com',
        'nordstrom.com', 'saksfifthavenue.com', 'bloomingdales.com',
        'neimanmarcus.com',

        // Sportswear
        'nike.com', 'adidas.com', 'puma.com', 'newbalance.com',
        'underarmour.com', 'reebok.com', 'asics.com',

        // Department / Multi-brand
        'macys.com', 'kohls.com', 'jcpenney.com', 'target.com',
        'walmart.com', 'costco.com',

        // Europe
        'aboutyou.com', 'zalando.de', 'zalando.fr', 'zalando.co.uk',
        'galerieslafayette.com', 'lacoste.com',
        'johnlewis.com', 'selfridges.com', 'harrods.com',
        'asos.de', 'asos.fr', 'asos.it',

        // Brand stores
        'levi.com', 'calvinklein.com', 'tommy.com', 'ralphlauren.com',
        'gucci.com', 'prada.com', 'louisvuitton.com', 'dior.com',
        'burberry.com', 'balenciaga.com', 'versace.com',
        'hermes.com', 'chanel.com', 'armani.com', 'fendi.com',
    ];

    /**
     * Marketplace domains — only fashion if URL path matches fashion categories.
     * Key: domain substring, Value: regex for fashion-related paths
     */
    const MARKETPLACE_FASHION_PATHS = {
        'amazon': /\/(fashion|clothing|shoes|bags|accessories|dp\/[A-Z0-9]+)/i,
        'ebay': /\/(fashion|clothing|shoes|sch\/.*clothing)/i,
        'etsy': /\/(listing|shop).*?(dress|shirt|jacket|clothing|fashion)/i,
        'rakuten': /\/(fashion|clothing|shoes|bag|f\/[a-z]+-wear)/i,
        'coupang': /\/(vp|products|search\?.*clothing)/i,
        'taobao': /\/(item|list).*?(服|裤|鞋|包|裙|衣)/i,
        'tmall': /\/(item|list).*?(服|裤|鞋|包|裙|衣)/i,
        'jd': /\/(product|item|list).*?(服|裤|鞋|包|裙|衣)/i,
    };

    /** Paths to exclude — never show buttons on these pages */
    const EXCLUDED_PATH_PATTERNS = [
        /\/(login|signin|sign-in|signup|sign-up|register)/i,
        /\/(cart|checkout|payment|order)/i,
        /\/(account|profile|settings|preferences)/i,
        /\/(help|support|faq|contact|about)/i,
        /\/(terms|privacy|policy)/i,
    ];

    /**
     * Fashion keywords to detect in <title>, <meta>, URL — MULTILINGUAL
     * Covers: EN, VI, JA, KO, ZH, TH, ID, ES, FR
     */
    const FASHION_KEYWORDS = new RegExp([
        // English
        'fashion', 'clothing', 'apparel', 'wear', 'outfit', 'dress', 'shirt',
        'jacket', 'pants', 'jeans', 'shoes', 'sneaker', 'accessori', 'handbag',
        'purse', 'style', 'boutique', 'garment', 'textile', 'lookbook', 'collection',
        'skirt', 'blouse', 'hoodie', 'sweater', 'coat', 'trousers', 'swimwear',

        // Vietnamese — bổ sung thêm từ còn thiếu
        'thời trang', 'quần áo', 'váy', 'đầm', 'áo khoác', 'áo thun', 'áo sơ mi',
        'quần', 'giày', 'dép', 'túi xách', 'phụ kiện', 'trang phục',
        'bộ đồ', 'đồ nữ', 'đồ nam', 'khoác', 'mặc', 'hàng thời trang',
        'áo len', 'áo vest', 'cardigan', 'áo hoodie', 'áo nỉ',

        // Japanese
        'ファッション', 'ウェア', 'アパレル', '服', '衣類', 'コーデ',
        'スタイル', 'コレクション', 'ルックブック', '新作', '着こなし',

        // Korean
        '패션', '의류', '옷', '코디', '스타일', '컬렉션', '신상',
        '데일리룩', '룩북', '착장',

        // Chinese
        '时尚', '服装', '服饰', '穿搭', '潮流', '新品', '款式',
        '搭配', '衣服', '穿着',

        // Thai
        'แฟชั่น', 'เสื้อผ้า', 'เครื่องแต่งกาย', 'สไตล์', 'คอลเลกชัน',

        // Indonesian
        'fashion', 'pakaian', 'busana', 'gaya', 'koleksi', 'mode',

        // Spanish
        'moda', 'ropa', 'vestimenta', 'estilo', 'colección', 'boutique',

        // French
        'mode', 'vêtement', 'habillement', 'collection', 'prêt-à-porter',
    ].join('|'), 'iu');

    /** Product page URL patterns — Shopify, WooCommerce, and generic e-commerce */
    const PRODUCT_PATH_PATTERNS = /\/(product|p|item|i|dp|pd|detail|goods|shohin|sangpum|barang|produk|products|shop|product-category|collections)[/\-]/i;

    // ==========================================
    // DETECTION LOGIC
    // ==========================================

    /**
     * Check if current hostname matches any whitelisted fashion domain.
     * Supports subdomains (e.g., m.shopee.vn, www.zara.com).
     */
    function isDomainWhitelisted(hostname) {
        const host = hostname.toLowerCase();
        return FASHION_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain));
    }

    /**
     * Check if current page is a fashion sub-path on a marketplace domain.
     */
    function isMarketplaceFashionPath(hostname, pathname) {
        const host = hostname.toLowerCase();
        for (const [key, regex] of Object.entries(MARKETPLACE_FASHION_PATHS)) {
            if (host.includes(key) && regex.test(pathname)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if current path is an excluded page (login, cart, etc.).
     */
    function isExcludedPath(pathname) {
        return EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(pathname));
    }

    // ==========================================
    // PLATFORM FINGERPRINTING
    // ==========================================

    /**
     * Fingerprint e-commerce platforms via JS globals + body classes + meta.
     * These signals are injected automatically by the platform — no manual config needed.
     *
     * Coverage:
     *   Shopify, WooCommerce, Magento (Adobe Commerce), BigCommerce,
     *   Squarespace Commerce, Wix Stores, PrestaShop, OpenCart, Salesforce Commerce,
     *   VTEX, Nopcommerce, Ecwid, Swell, Medusa, Vendure
     */
    function isEcommerceProductPage() {
        try {
            // LAYER A — STRONGEST: og:type = "product"
            // Set automatically by ALL major e-commerce platforms.
            // Shopify, WooCommerce (Yoast/RankMath), Magento, BigCommerce, PrestaShop.
            const ogType = document.querySelector('meta[property="og:type"]');
            if (ogType && ogType.getAttribute('content') === 'product') return true;

            // LAYER B — STRONG: Platform JS globals
            // Each platform exposes a global object — reliable fingerprint.
            if (
                typeof window.Shopify !== 'undefined'         // Shopify (all versions)
                || typeof window.ShopifyAnalytics !== 'undefined' // Shopify analytics
                || typeof window.wc_add_to_cart_params !== 'undefined' // WooCommerce
                || typeof window.woocommerce_params !== 'undefined'     // WooCommerce
                || typeof window.Magento !== 'undefined'      // Magento 1
                || typeof window.require !== 'undefined' && document.querySelector('[data-mage-init]') // Magento 2
                || typeof window.BCData !== 'undefined'       // BigCommerce
                || typeof window.Static !== 'undefined' && document.querySelector('[data-sqs-type="product"]') // Squarespace
                || typeof window.Ecwid !== 'undefined'        // Ecwid widget
                || typeof window.__vtex !== 'undefined'       // VTEX
            ) {
                // Platform detected — still check if it's a product page (not homepage/category)
                // via URL path or og:type (already checked above)
                const pathname = window.location.pathname;
                if (PRODUCT_PATH_PATTERNS.test(pathname)) return true;
                // Also true if there's a product schema
                if (document.querySelector('[itemtype*="schema.org/Product"]')) return true;
            }

            // LAYER C — MEDIUM: DOM structural signals
            // "Add to Cart" and price elements are the most reliable cross-platform signals.

            // C1: Add-to-cart button — only exists on product pages
            const addToCartBtn = document.querySelector([
                '[class*="add-to-cart"]',
                '[class*="addToCart"]',
                '[class*="add_to_cart"]',
                '[id*="add-to-cart"]',
                '[id*="AddToCart"]',
                '[name="add"]',               // Shopify default form field
                'button[data-action*="cart"]',
                'button[data-add-to-cart]',
                '[data-testid*="add-to-cart"]',
            ].join(','));
            if (addToCartBtn) return true;

            // C2: Product variant selectors (size, color pickers)
            const variantSelector = document.querySelector([
                '[class*="product-variant"]',
                '[class*="ProductVariant"]',
                'select[name="id"]',           // Shopify variant selector
                '[data-option-name]',
                '[class*="swatch"]',
                '[class*="size-selector"]',
                '[id*="product-select"]',
            ].join(','));
            if (variantSelector) return true;

            // C3: Product price with schema markup
            const priceSchema = document.querySelector([
                '[itemprop="price"]',
                '[itemprop="offers"]',
                '[class*="product__price"]',
                '[class*="ProductPrice"]',
                '[class*="product-price"]',
            ].join(','));
            if (priceSchema) return true;

            // C4: Schema.org Product via microdata OR JSON-LD
            if (document.querySelector('[itemtype*="schema.org/Product"]')) return true;

        } catch (e) {
            // DOM query errors — skip
        }
        return false;
    }

    /**
     * Check page metadata (title, meta tags) for fashion-related keywords.
     * This is the FALLBACK layer — used when platform detection fails.
     */
    function hasPageFashionSignals() {
        // PRIORITY: Platform/product page detection (language-agnostic)
        if (isEcommerceProductPage()) return true;

        // STEP 1: Check <title>
        const title = document.title || '';
        if (FASHION_KEYWORDS.test(title)) return true;

        // STEP 2: Check <meta name="keywords"> and <meta name="description">
        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords && FASHION_KEYWORDS.test(metaKeywords.content || '')) return true;

        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && FASHION_KEYWORDS.test(metaDesc.content || '')) return true;

        // STEP 3: Check Open Graph title/description
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && FASHION_KEYWORDS.test(ogTitle.content || '')) return true;

        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc && FASHION_KEYWORDS.test(ogDesc.content || '')) return true;

        // STEP 4: Check URL path for product patterns
        if (PRODUCT_PATH_PATTERNS.test(window.location.pathname)) {
            if (FASHION_KEYWORDS.test(window.location.href)) return true;
        }

        // STEP 5: Check page headings (h1, h2) for fashion keywords
        const headings = document.querySelectorAll('h1, h2');
        for (const h of headings) {
            if (FASHION_KEYWORDS.test(h.textContent || '')) return true;
        }

        // STEP 6: Check navigation / breadcrumbs for fashion keywords
        const navElements = document.querySelectorAll('nav, [class*="breadcrumb"], [class*="nav-"], [class*="menu"]');
        for (const nav of navElements) {
            const navText = (nav.textContent || '').slice(0, 500);
            if (FASHION_KEYWORDS.test(navText)) return true;
        }

        // STEP 7: Check JSON-LD structured data
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent || '');
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    const type = (item['@type'] || '').toLowerCase();
                    if (type === 'product' || type === 'clothingstore') return true;
                    const category = item.category || item.productGroup || '';
                    if (typeof category === 'string' && FASHION_KEYWORDS.test(category)) return true;
                }
            } catch (e) {
                // Invalid JSON — skip
            }
        }

        return false;
    }

    // ==========================================
    // MAIN DETECTION — CACHED
    // ==========================================

    /**
     * Determine if the current page is a fashion page.
     * Result is cached on window.__fitlyIsFashionPage.
     * @returns {boolean}
     */
    function detectFashionPage() {
        // Return cached result if available
        if (typeof window.__fitlyIsFashionPage !== 'undefined') {
            return window.__fitlyIsFashionPage;
        }

        const hostname = window.location.hostname;
        const pathname = window.location.pathname;

        // STEP 1: Exclude non-product paths first
        if (isExcludedPath(pathname)) {
            window.__fitlyIsFashionPage = false;
            return false;
        }

        // STEP 2: Check whitelisted fashion domains
        if (isDomainWhitelisted(hostname)) {
            window.__fitlyIsFashionPage = true;
            return true;
        }

        // STEP 3: Check marketplace fashion sub-paths
        if (isMarketplaceFashionPath(hostname, pathname)) {
            window.__fitlyIsFashionPage = true;
            return true;
        }

        // STEP 4: Fallback — detect from page metadata
        if (hasPageFashionSignals()) {
            window.__fitlyIsFashionPage = true;
            return true;
        }

        // Default: not a fashion page
        window.__fitlyIsFashionPage = false;
        return false;
    }

    // Expose for other content scripts
    window.__fitlyDetectFashionPage = detectFashionPage;

    // Run detection when DOM is ready
    function initDetection() {
        detectFashionPage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDetection);
    } else {
        initDetection();
    }

})();
