/**
 * File: infer_clothing_category_from_url.js
 * Purpose: Phân tích URL ảnh, URL trang, alt text và string gộp để tự động nhận dạng thể loại quần áo
 * Layer: Application / Utility
 * * Data Contract:
 * - Input: srcUrl (string), pageUrl (string), contextText (string)
 * - Output: category (string - enum: 'dress', 'outerwear', 'bottom', 'shoes', 'accessories', 'top', 'other')
 * * Flow:
 * 1. Gộp các tham số đầu vào thành lowercase
 * 2. Ưu tiên theo thứ tự tìm kiếm từ khoá trong mảng gộp (dress -> outerwear -> ...)
 * 3. Fallback về 'top' do là phổ biến nhất.
 */

export function inferCategoryFromUrl(srcUrl = '', pageUrl = '', contextText = '') {
    const combined = [srcUrl, pageUrl, contextText].join(' ').toLowerCase();

    // --- DRESS (ưu tiên trước top/bottom để tránh match nhầm) ---
    if (/dress|váy|đầm|jumpsuit|romper|overall/.test(combined)) return 'dress';

    // --- OUTERWEAR ---
    if (/jacket|coat|blazer|cardigan|hoodie|sweatshirt|windbreaker|puffer|vest|áo khoác|bomber/.test(combined)) return 'outerwear';

    // --- BOTTOM ---
    if (/pant|jean|short|skirt|trouser|legging|culotte|quần|chân váy/.test(combined)) return 'bottom';

    // --- SHOES ---
    if (/shoe|boot|sneaker|sandal|heel|loafer|slipper|mule|giày|dép|guốc/.test(combined)) return 'shoes';

    // --- ACCESSORIES ---
    if (/bag|purse|handbag|wallet|hat|cap|scarf|belt|watch|sunglasse|jewelry|necklace|bracelet|ring|earring|túi|mũ|khăn|thắt lưng/.test(combined)) return 'accessories';

    // --- TOP (shirt, blouse, tee, etc.) ---
    if (/shirt|tshirt|t-shirt|blouse|top|tee|polo|tank|crop|áo sơ|áo thun|áo phông/.test(combined)) return 'top';

    // --- Fallback: 'top' vì phổ biến nhất trong fashion ---
    return 'top';
}
