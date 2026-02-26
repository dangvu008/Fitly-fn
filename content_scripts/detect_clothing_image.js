/**
 * File: detect_clothing_image.js
 * Purpose: Xác định một ảnh cụ thể có khả năng là ảnh quần áo / thời trang không
 * Layer: Content Script / Filter (L3)
 *
 * Data Contract:
 * - Input: HTMLElement (img hoặc element có background-image)
 * - Output: boolean — true nếu ảnh có khả năng là quần áo
 *
 * Flow:
 * 1. Kiểm tra kích thước tối thiểu (120×150)
 * 2. Kiểm tra aspect ratio hợp lệ (loại banner, strip)
 * 3. Loại trừ URL patterns (icon, logo, banner, sprite, placeholder)
 * 4. Kiểm tra alt text / aria-label cho fashion keywords (đa ngôn ngữ)
 * 5. Kiểm tra context (nằm trong product card / grid)
 * 6. Scoring system — trả true nếu score đủ cao
 *
 * Edge Cases:
 * - Lazy-loaded images (src = placeholder trước khi load)
 * - CSS background images
 * - <picture> / <source> elements
 * - SVG / data: URI images
 * - International e-commerce sites (JP, KR, CN, TH, ID, ES, FR)
 */

(function () {
    'use strict';

    if (typeof window.__fitlyClothingDetectorLoaded !== 'undefined') return;
    window.__fitlyClothingDetectorLoaded = true;

    // ==========================================
    // CONSTANTS
    // ==========================================

    /** Minimum dimensions for a clothing product image */
    const MIN_WIDTH = 120;
    const MIN_HEIGHT = 150;

    /** Aspect ratio bounds (width/height) — exclude extreme banners and strips */
    const MIN_ASPECT_RATIO = 0.35; // Very tall portrait is OK (model shots)
    const MAX_ASPECT_RATIO = 1.8;  // Slightly landscape is OK (flat-lay shots)

    /** URL substrings that indicate non-product images */
    const EXCLUDED_URL_PATTERNS = /\b(icon|logo|sprite|avatar|badge|flag|emoji|placeholder|loading|spinner|arrow|chevron|close|menu|hamburger|search|star|rating|heart|thumb|play|pause|share|social|facebook|twitter|instagram|youtube|tiktok|pinterest|whatsapp|telegram|payment|visa|mastercard|paypal|momo|vnpay|zalopay|banner|promo|hero|carousel-nav|dot|bullet|separator|divider|pixel|tracking|analytics|beacon|ad-|advert|1x1|spacer|review-?img|user-?photo|profile-?pic|comment-?img|testimonial)\b/i;

    /** URL patterns that strongly suggest product images */
    const PRODUCT_URL_PATTERNS = /\b(product|item|goods|catalog|merchandise|clothing|apparel|fashion|wear|dress|shirt|pant|jean|shoe|jacket|img[-_]?prod|img[-_]?item|shohin|seihin|sangpum|barang|produk|商品|상품|สินค้า)\b/i;

    /**
     * Alt text / aria-label keywords indicating clothing — MULTILINGUAL
     * Covers: EN, VI, JA, KO, ZH, TH, ID, ES, FR
     */
    const CLOTHING_ALT_KEYWORDS = new RegExp([
        // English
        'dress', 'shirt', 'blouse', 'jacket', 'coat', 'blazer', 'pants', 'jeans',
        'shorts', 'skirt', 'shoe', 'sneaker', 'boot', 'sandal', 'heel', 'bag',
        'purse', 'hat', 'scarf', 'belt', 'watch', 'sunglasses', 'accessories',
        'top', 'bottom', 'hoodie', 'sweater', 'cardigan', 'vest', 'jumpsuit',
        'romper', 'legging', 'polo', 'tank', 'crop', 'bikini', 'swimwear',
        'trousers', 'loafer', 'oxford', 'backpack', 'clutch', 'tote',

        // Vietnamese
        'váy', 'đầm', 'áo', 'quần', 'giày', 'dép', 'túi', 'mũ', 'khăn',
        'thắt lưng', 'trang phục', 'phụ kiện',

        // Japanese
        'ドレス', 'シャツ', 'ブラウス', 'ジャケット', 'コート', 'ブレザー',
        'パンツ', 'ジーンズ', 'ショートパンツ', 'スカート', 'シューズ', '靴',
        'スニーカー', 'ブーツ', 'サンダル', 'ヒール', 'バッグ', '鞄', '帽子',
        'スカーフ', 'ベルト', '腕時計', 'サングラス', 'アクセサリー',
        'トップス', 'ボトムス', 'パーカー', 'セーター', 'カーディガン',
        'ベスト', 'ワンピース', 'レギンス', 'ポロシャツ', 'ビキニ', '水着',
        'トレーナー', 'ジャンパー', 'Tシャツ',

        // Korean
        '드레스', '셔츠', '블라우스', '자켓', '코트', '블레이저',
        '바지', '청바지', '반바지', '치마', '신발', '운동화',
        '부츠', '샌들', '힐', '가방', '모자', '스카프', '벨트',
        '시계', '선글라스', '액세서리', '상의', '하의', '후드티',
        '스웨터', '가디건', '조끼', '점프수트', '레깅스', '폴로',
        '비키니', '수영복', '원피스', '맨투맨', '니트',

        // Chinese
        '连衣裙', '衬衫', '上衣', '夹克', '外套', '西装',
        '裤子', '牛仔裤', '短裤', '裙子', '鞋子', '运动鞋',
        '靴子', '凉鞋', '高跟鞋', '包包', '手提包', '帽子',
        '围巾', '腰带', '手表', '太阳镜', '配饰', '卫衣',
        '毛衣', '开衫', '背心', '连体裤', '打底裤', 'T恤',
        '比基尼', '泳衣', '风衣', '羽绒服',

        // Thai
        'เสื้อ', 'กางเกง', 'กระโปรง', 'ชุดเดรส', 'แจ็คเก็ต', 'เสื้อคลุม',
        'รองเท้า', 'รองเท้าผ้าใบ', 'รองเท้าบูท', 'รองเท้าแตะ',
        'รองเท้าส้นสูง', 'กระเป๋า', 'หมวก', 'ผ้าพันคอ', 'เข็มขัด',
        'นาฬิกา', 'แว่นตา', 'เครื่องประดับ', 'อุปกรณ์เสริม',
        'ฮู้ดดี้', 'สเวตเตอร์', 'เสื้อกล้าม', 'บิกินี่', 'ชุดว่ายน้ำ',

        // Indonesian
        'baju', 'kemeja', 'blus', 'jaket', 'mantel', 'celana',
        'jins', 'rok', 'sepatu', 'sneaker', 'sandal', 'tas',
        'topi', 'syal', 'ikat pinggang', 'jam tangan', 'kacamata',
        'aksesori', 'hoodie', 'sweater', 'gaun', 'bikini', 'kaos',

        // Spanish
        'vestido', 'camisa', 'blusa', 'chaqueta', 'abrigo', 'pantalón',
        'vaqueros', 'falda', 'zapato', 'zapatilla', 'bota', 'bolso',
        'sombrero', 'bufanda', 'cinturón', 'reloj', 'gafas',
        'accesorios', 'sudadera', 'jersey', 'cárdigan', 'traje',

        // French
        'robe', 'chemise', 'chemisier', 'veste', 'manteau', 'blazer',
        'pantalon', 'jupe', 'chaussure', 'basket', 'botte', 'sac',
        'chapeau', 'écharpe', 'ceinture', 'montre', 'lunettes',
        'accessoires', 'sweat', 'pull', 'gilet', 'combinaison', 'maillot',
    ].join('|'), 'iu');

    /** CSS selectors suggesting a product container context */
    const PRODUCT_CONTAINER_SELECTORS = [
        '[class*="product"]',
        '[class*="item"]',
        '[class*="card"]',
        '[class*="goods"]',
        '[class*="catalog"]',
        '[data-product]',
        '[data-item]',
        '[data-sku]',
        '[data-product-id]',
        '[data-item-id]',
        '[itemtype*="Product"]',
        '[class*="grid"] > *',
        '[class*="listing"]',
        // Japanese e-commerce
        '[class*="商品"]',
        '[class*="アイテム"]',
        // Korean e-commerce
        '[class*="상품"]',
        '[class*="아이템"]',
        // Thai / Indo e-commerce
        '[class*="สินค้า"]',
        '[class*="produk"]',
    ];

    // ==========================================
    // DETECTION LOGIC
    // ==========================================

    /**
     * Get the image URL from an element (img src or CSS background-image).
     */
    function getElementImageUrl(el) {
        if (el.tagName === 'IMG') {
            return el.currentSrc || el.src || el.dataset.src || el.dataset.lazySrc || '';
        }
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none') {
            const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
            if (match) return match[1];
        }
        return '';
    }

    /**
     * Check if image dimensions meet minimum requirements.
     */
    function hasValidDimensions(el) {
        const rect = el.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        if (width < MIN_WIDTH || height < MIN_HEIGHT) return false;

        const ratio = width / height;
        if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) return false;

        return true;
    }

    /**
     * Check if image URL suggests a non-product image (icon, logo, etc.).
     */
    function isExcludedByUrl(imageUrl) {
        if (!imageUrl) return true;
        if (imageUrl.startsWith('data:image/svg')) return true;
        if (imageUrl.endsWith('.svg')) return true;
        if (imageUrl.startsWith('data:') && imageUrl.length < 500) return true;
        return EXCLUDED_URL_PATTERNS.test(imageUrl);
    }

    /**
     * Check if element is inside a product-like container.
     */
    function isInProductContext(el) {
        let current = el.parentElement;
        let depth = 0;
        const maxDepth = 5;

        while (current && depth < maxDepth) {
            for (const selector of PRODUCT_CONTAINER_SELECTORS) {
                try {
                    if (current.matches(selector)) return true;
                } catch (e) {
                    // Invalid selector — skip
                }
            }
            current = current.parentElement;
            depth++;
        }
        return false;
    }

    /**
     * Get descriptive text from element (alt, title, aria-label).
     */
    function getElementDescription(el) {
        const parts = [];
        if (el.alt) parts.push(el.alt);
        if (el.title) parts.push(el.title);
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) parts.push(ariaLabel);
        // Also check parent's text content (limited)
        if (el.parentElement) {
            const parentTitle = el.parentElement.getAttribute('title') || '';
            const parentAria = el.parentElement.getAttribute('aria-label') || '';
            if (parentTitle) parts.push(parentTitle);
            if (parentAria) parts.push(parentAria);
        }
        return parts.join(' ');
    }

    // ==========================================
    // MAIN SCORING FUNCTION
    // ==========================================

    /**
     * Determine if an element's image is likely a clothing/fashion product image.
     * Uses a scoring system: score >= threshold → likely clothing.
     *
     * @param {HTMLElement} el - The image element to check
     * @returns {boolean} True if likely a clothing image
     */
    function isLikelyClothingImage(el) {
        // Hard filters — instant reject
        if (!hasValidDimensions(el)) return false;

        const imageUrl = getElementImageUrl(el);
        if (isExcludedByUrl(imageUrl)) return false;

        // Scoring system
        let score = 0;

        // +2: URL contains product-related keywords
        if (PRODUCT_URL_PATTERNS.test(imageUrl)) {
            score += 2;
        }

        // +2: Alt text / aria-label contains clothing keywords (multilingual)
        const description = getElementDescription(el);
        if (description && CLOTHING_ALT_KEYWORDS.test(description)) {
            score += 2;
        }

        // +1: Element is inside a product container
        if (isInProductContext(el)) {
            score += 1;
        }

        // +1: URL contains common e-commerce image CDN patterns
        if (/cdn|media|image|img|asset|static/.test(imageUrl) && !/icon|logo|sprite/.test(imageUrl)) {
            score += 1;
        }

        // +1: Image has good product-like dimensions (portrait-ish, 200px+)
        const rect = el.getBoundingClientRect();
        if (rect.width >= 200 && rect.height >= 250 && rect.width / rect.height < 1.0) {
            score += 1;
        }

        // On a confirmed fashion page, lower the threshold
        const isFashionPage = window.__fitlyIsFashionPage === true;
        const threshold = isFashionPage ? 1 : 2;

        return score >= threshold;
    }

    // Expose for other content scripts
    window.__fitlyIsLikelyClothingImage = isLikelyClothingImage;

})();
