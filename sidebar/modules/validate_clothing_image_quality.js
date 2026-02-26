/**
 * File: validate_clothing_image_quality.js
 * Purpose: Kiểm tra chất lượng ảnh quần áo 2 tầng trước khi thử đồ
 * Layer: Application (Validation)
 *
 * Input: imageUrl (string) hoặc items[] (array of selected items)
 * Output: { warnings: string[], score: number } hoặc { proceed: boolean }
 *
 * Flow:
 * 1. quickValidateClothingImage → Canvas-based checks khi chọn item (Tier 1)
 * 2. deepValidateBeforeTryOn → Aggregate check trước khi bấm Try-On (Tier 2)
 * 3. showImageQualityWarning → Hiện banner cảnh báo (dismissible)
 *
 * Edge Cases: CORS blocked images, data: URLs, blob: URLs
 * Security: Không log sensitive image data
 */

// STEP 1: Dismissed warnings tracking — avoid repeating for same URL
if (!state._dismissedQualityWarnings) {
    state._dismissedQualityWarnings = new Set();
}

// ==========================================
// TIER 1: QUICK CLIENT-SIDE VALIDATION
// ==========================================

/**
 * quickValidateClothingImage - Kiểm tra nhanh chất lượng ảnh khi user chọn item
 *
 * Input:  imageUrl (string) — URL hoặc data: URI của ảnh
 * Output: { warnings: string[], passed: boolean }
 *
 * Flow:
 * 1. Load ảnh vào Image element → lấy naturalWidth/Height
 * 2. Check resolution, aspect ratio, kích thước
 * 3. Nếu có thể → vẽ vào Canvas để check blur (Laplacian variance)
 * 4. Trả về danh sách warnings
 */
async function quickValidateClothingImage(imageUrl) {
    // STEP 1: Skip nếu user đã dismiss warning cho URL này
    if (state._dismissedQualityWarnings.has(imageUrl)) {
        return { warnings: [], passed: true };
    }

    const warnings = [];

    try {
        // STEP 2: Load ảnh để lấy dimensions
        const imgInfo = await loadImageForValidation(imageUrl);
        if (!imgInfo) {
            // Không load được — có thể CORS block, skip validation
            return { warnings: [], passed: true };
        }

        const { width, height, img } = imgInfo;

        // STEP 3: Check resolution — quá nhỏ
        if (width < 100 || height < 100) {
            warnings.push({
                type: 'too_small',
                severity: 'high',
                message: t('quality_warning.too_small') || '⚠️ Ảnh quá nhỏ — có thể là thumbnail hoặc icon'
            });
        } else if (width < 250 && height < 250) {
            warnings.push({
                type: 'low_resolution',
                severity: 'medium',
                message: t('quality_warning.low_resolution') || '⚠️ Ảnh độ phân giải thấp — kết quả có thể không tốt'
            });
        }

        // STEP 4: Check aspect ratio bất thường (banner, header, strip)
        const ratio = width / height;
        if (ratio > 4 || ratio < 0.25) {
            warnings.push({
                type: 'unusual_ratio',
                severity: 'medium',
                message: t('quality_warning.unusual_ratio') || '⚠️ Tỷ lệ ảnh bất thường — có thể là banner, không phải ảnh sản phẩm'
            });
        }

        // STEP 5: Check ảnh vuông nhỏ (icon/logo)
        if (Math.abs(ratio - 1) < 0.15 && width < 200 && height < 200) {
            warnings.push({
                type: 'likely_icon',
                severity: 'high',
                message: t('quality_warning.likely_icon') || '⚠️ Có thể là icon hoặc logo, không phải ảnh sản phẩm'
            });
        }

        // STEP 6: Canvas-based blur + partial garment detection
        // Thử trực tiếp trước, nếu CORS block → dùng fetchImageViaBackground bypass
        let analysisResult = null;
        try {
            analysisResult = analyzeImageSharpness(img, width, height);
        } catch (canvasErr) {
            // Canvas bị tainted bởi CORS → thử bypass qua background fetch
            if (window.fetchImageViaBackground && imageUrl.startsWith('http')) {
                try {
                    const dataUrl = await fetchImageViaBackground(imageUrl);
                    if (dataUrl) {
                        const bgImg = await loadImageForValidation(dataUrl);
                        if (bgImg) {
                            analysisResult = analyzeImageSharpness(bgImg.img, bgImg.width, bgImg.height);
                        }
                    }
                } catch (_bgErr) {
                    // Background fetch also failed → skip analysis
                }
            }
        }

        if (analysisResult) {
            if (analysisResult.isBlurry) {
                warnings.push({
                    type: 'blurry',
                    severity: 'medium',
                    message: t('quality_warning.blurry') || '⚠️ Ảnh bị mờ — chất lượng thử đồ có thể giảm'
                });
            }
            if (analysisResult.isPartialGarment) {
                warnings.push({
                    type: 'partial_garment',
                    severity: 'high',
                    message: t('quality_warning.partial_garment') || '⚠️ Ảnh có vẻ chỉ là chi tiết sản phẩm (zoom sát), không phải toàn bộ quần áo'
                });
            }
            if (analysisResult.multiplePeople) {
                warnings.push({
                    type: 'multiple_people',
                    severity: 'high',
                    message: t('quality_warning.multiple_people') || '⚠️ Ảnh chứa nhiều người — AI có thể nhầm lẫn món đồ cần dùng'
                });
            }
            if (analysisResult.onModel && !analysisResult.multiplePeople) {
                warnings.push({
                    type: 'on_model_image',
                    severity: 'medium',
                    message: t('quality_warning.on_model_image') || '💡 Ảnh quần áo có người mẫu mặc — kết quả có thể khác. Nên dùng ảnh sản phẩm trải phẳng'
                });
            }
            if (analysisResult.hasTextOverlay) {
                warnings.push({
                    type: 'has_text_overlay',
                    severity: 'medium',
                    message: t('quality_warning.has_text_overlay') || '⚠️ Ảnh có chữ/watermark — có thể ảnh hưởng chất lượng thử đồ'
                });
            }
        }
    } catch (error) {
        console.warn('[Fitly Quality] Validation error (non-blocking):', error.message);
        return { warnings: [], passed: true };
    }

    // STEP 7: Show warning nếu có
    if (warnings.length > 0) {
        showImageQualityWarning(warnings, imageUrl);
    }

    return {
        warnings,
        passed: warnings.filter(w => w.severity === 'high').length === 0
    };
}

// ==========================================
// TIER 2: DEEP VALIDATION BEFORE TRY-ON
// ==========================================

/**
 * deepValidateBeforeTryOn - Kiểm tra kỹ tất cả items trước khi try-on
 *
 * Input:  items[] — state.selectedItems
 * Output: { proceed: boolean, warnings: object[] }
 *
 * Flow:
 * 1. Re-check từng item bằng quickValidate
 * 2. Nếu có warnings severity HIGH → hiện confirmation dialog
 * 3. User chọn Tiếp tục hoặc Hủy
 */
async function deepValidateBeforeTryOn(items, options = {}) {
    if (!items || items.length === 0) {
        return { proceed: true, warnings: [] };
    }

    const allWarnings = [];

    // STEP 1: Validate từng item
    for (const item of items) {
        // Skip items đã được dismiss
        if (state._dismissedQualityWarnings.has(item.imageUrl)) continue;

        try {
            const imgInfo = await loadImageForValidation(item.imageUrl);
            if (!imgInfo) continue;

            const { width, height, img } = imgInfo;
            const itemWarnings = [];

            // Re-run checks (same as Tier 1 nhưng không show toast)
            if (width < 100 || height < 100) {
                itemWarnings.push({
                    type: 'too_small',
                    severity: 'high',
                    message: `"${item.name || 'Item'}" — ảnh quá nhỏ (${width}×${height}px)`
                });
            } else if (width < 250 && height < 250) {
                itemWarnings.push({
                    type: 'low_resolution',
                    severity: 'medium',
                    message: `"${item.name || 'Item'}" — độ phân giải thấp (${width}×${height}px)`
                });
            }

            const ratio = width / height;
            if (ratio > 4 || ratio < 0.25) {
                itemWarnings.push({
                    type: 'unusual_ratio',
                    severity: 'medium',
                    message: `"${item.name || 'Item'}" — tỷ lệ ảnh bất thường`
                });
            }

            // Canvas analysis with CORS bypass
            let deepAnalysis = null;
            try {
                deepAnalysis = analyzeImageSharpness(img, width, height);
            } catch (_corsErr) {
                if (window.fetchImageViaBackground && item.imageUrl.startsWith('http')) {
                    try {
                        const dataUrl = await fetchImageViaBackground(item.imageUrl);
                        if (dataUrl) {
                            const bgImg = await loadImageForValidation(dataUrl);
                            if (bgImg) deepAnalysis = analyzeImageSharpness(bgImg.img, bgImg.width, bgImg.height);
                        }
                    } catch (_) { /* skip */ }
                }
            }
            if (deepAnalysis) {
                if (deepAnalysis.isBlurry) {
                    itemWarnings.push({
                        type: 'blurry',
                        severity: 'medium',
                        message: `"${item.name || 'Item'}" — ảnh bị mờ`
                    });
                }
                if (deepAnalysis.isPartialGarment) {
                    itemWarnings.push({
                        type: 'partial_garment',
                        severity: 'high',
                        message: `"${item.name || 'Item'}" — có vẻ chỉ là chi tiết sản phẩm, không phải toàn bộ quần áo`
                    });
                }
                if (deepAnalysis.multiplePeople) {
                    itemWarnings.push({
                        type: 'multiple_people',
                        severity: 'high',
                        message: `"${item.name || 'Item'}" — ảnh chứa nhiều người, AI có thể nhầm lẫn`
                    });
                }
                if (deepAnalysis.onModel && !deepAnalysis.multiplePeople) {
                    itemWarnings.push({
                        type: 'on_model_image',
                        severity: 'medium',
                        message: `"${item.name || 'Item'}" — ảnh có người mẫu mặc, nên dùng ảnh trải phẳng`
                    });
                }
                if (deepAnalysis.hasTextOverlay) {
                    itemWarnings.push({
                        type: 'has_text_overlay',
                        severity: 'medium',
                        message: `"${item.name || 'Item'}" — ảnh có chữ/watermark`
                    });
                }
            }

            if (itemWarnings.length > 0) {
                allWarnings.push({ item, warnings: itemWarnings });
            }
        } catch (e) {
            // Skip validation errors — non-blocking
        }
    }

    // STEP 2: Semantic combo validation — detect category conflicts
    // These warnings help user understand AI will skip/stack items
    const singleCategories = ['top', 'bottom', 'dress'];
    for (const cat of singleCategories) {
        const itemsInCategory = items.filter(i => i.category === cat);
        if (itemsInCategory.length > 1) {
            const catLabel = getCategoryLabel ? getCategoryLabel(cat) : cat;
            allWarnings.push({
                item: itemsInCategory[1],
                warnings: [{
                    type: 'duplicate_category',
                    severity: 'high',
                    message: t('quality_warning.duplicate_category', {
                        count: itemsInCategory.length,
                        category: catLabel
                    }) || `⚠️ ${itemsInCategory.length}× ${catLabel} selected — AI will try to stack them`
                }]
            });
        }
    }

    // Dress + top/bottom conflict
    const hasDress = items.some(i => i.category === 'dress');
    const hasTopOrBottom = items.some(i => i.category === 'top' || i.category === 'bottom');
    if (hasDress && hasTopOrBottom) {
        const dressItem = items.find(i => i.category === 'dress');
        allWarnings.push({
            item: dressItem,
            warnings: [{
                type: 'combo_dress_conflict',
                severity: 'medium',
                message: t('quality_warning.combo_dress_conflict') || '⚠️ Dress covers full body — top/bottom will be skipped by AI'
            }]
        });
    }

    // STEP 2c: Detect on-model items for transfer mode choice
    const onModelItems = items.filter(i =>
        i.imageType === 'worn' || i.imageType === 'lifestyle' ||
        allWarnings.some(w => w.item === i && w.warnings.some(ww => ww.type === 'on_model_image'))
    );
    const hasOnModelItems = onModelItems.length > 0 && !onModelItems[0].transferMode;

    // STEP 3: Always show unified confirmation dialog
    // Includes: gem cost + quality warnings (if any) + transfer mode (if on-model)
    const gemCost = options.gemCost || 1;
    const currentBalance = options.currentBalance || 0;

    return new Promise((resolve) => {
        showUnifiedTryOnDialog({
            allWarnings,
            gemCost,
            currentBalance,
            onModelItems: hasOnModelItems ? onModelItems : [],
            items,
        }, resolve);
    });
}

// ==========================================
// IMAGE ANALYSIS UTILITIES
// ==========================================

/**
 * loadImageForValidation - Load ảnh vào Image element để lấy dimensions
 * Trả về null nếu không load được (timeout 5s)
 */
function loadImageForValidation(imageUrl) {
    return new Promise((resolve) => {
        if (!imageUrl) { resolve(null); return; }

        const img = new Image();
        const timeoutId = setTimeout(() => {
            img.src = '';
            resolve(null);
        }, 5000);

        // Cho phép vẽ canvas nếu server hỗ trợ CORS
        if (imageUrl.startsWith('http')) {
            img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
            clearTimeout(timeoutId);
            resolve({
                img,
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };

        img.onerror = () => {
            clearTimeout(timeoutId);
            // Retry không có crossOrigin (nhiều server chặn CORS)
            if (img.crossOrigin && imageUrl.startsWith('http')) {
                const img2 = new Image();
                const timeout2 = setTimeout(() => resolve(null), 3000);
                img2.onload = () => {
                    clearTimeout(timeout2);
                    resolve({
                        img: img2,
                        width: img2.naturalWidth,
                        height: img2.naturalHeight
                    });
                };
                img2.onerror = () => { clearTimeout(timeout2); resolve(null); };
                img2.src = imageUrl;
            } else {
                resolve(null);
            }
        };

        img.src = imageUrl;
    });
}

/**
 * analyzeImageSharpness - Phân tích độ nét và tính chất ảnh bằng Canvas
 *
 * Sử dụng Laplacian variance để đo sharpness:
 * - Variance thấp → ảnh mờ hoặc ít chi tiết
 * - Kết hợp với edge density để phát hiện gần cảnh (zoom sát)
 *
 * Input: img (Image element đã load), width, height
 * Output: { isBlurry: boolean, isPartialGarment: boolean, variance: number }
 */
function analyzeImageSharpness(img, width, height) {
    // STEP 1: Scale ảnh xuống để xử lý nhanh (max 200px chiều dài nhất)
    const maxDim = 200;
    const scale = Math.min(maxDim / width, maxDim / height, 1);
    const sw = Math.round(width * scale);
    const sh = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, sw, sh);

    // STEP 2: Lấy grayscale pixel data
    const imageData = ctx.getImageData(0, 0, sw, sh);
    const pixels = imageData.data;
    const gray = new Float32Array(sw * sh);

    for (let i = 0; i < sw * sh; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // STEP 3: Laplacian filter (3x3 kernel: [0,1,0; 1,-4,1; 0,1,0])
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    let edgeCount = 0;
    const edgeThreshold = 30;

    for (let y = 1; y < sh - 1; y++) {
        for (let x = 1; x < sw - 1; x++) {
            const idx = y * sw + x;
            const lap = gray[idx - sw] + gray[idx + sw] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
            sum += lap;
            sumSq += lap * lap;
            count++;
            if (Math.abs(lap) > edgeThreshold) edgeCount++;
        }
    }

    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    const edgeDensity = edgeCount / count;

    // STEP 4: Color uniformity analysis
    // Ảnh zoom sát vải thường có std deviation màu rất thấp (đồng màu)
    const colorStats = analyzeColorUniformity(pixels, sw * sh);

    // STEP 5: Phân tích kết quả
    // Blur threshold: variance < 80 → mờ (tuned empirically)
    const isBlurry = variance < 80 && width >= 200 && height >= 200;

    // Partial garment detection — multi-signal approach:
    // Signal 1: Low edge density (ít cạnh phân tán = plain fabric hoặc zoom sát)
    // Signal 2: Low color std deviation (đồng màu = zoom vào 1 vùng vải)
    // Signal 3: Low entropy (ít thông tin visual = ảnh đơn điệu)
    const isLargeEnough = width * height > 90000; // > 300x300
    const hasLowEdgeDensity = edgeDensity < 0.08; // Nâng từ 0.05 → 0.08
    const hasLowColorVariance = colorStats.stdDev < 25;
    const hasLowEntropy = colorStats.entropy < 5.5;

    // Kết hợp signals: cần ≥ 2 signals + isLargeEnough
    const partialSignals = [hasLowEdgeDensity, hasLowColorVariance, hasLowEntropy].filter(Boolean).length;
    const isPartialGarment = isLargeEnough && partialSignals >= 2 && variance < 300;

    // STEP 6: Multi-person + text/watermark detection
    const advancedDetection = detectMultiplePeopleAndOverlay(imageData, sw, sh);

    return {
        isBlurry, isPartialGarment,
        variance: Math.round(variance), edgeDensity,
        colorStdDev: Math.round(colorStats.stdDev),
        entropy: Math.round(colorStats.entropy * 100) / 100,
        partialSignals,
        multiplePeople: advancedDetection.multiplePeople,
        onModel: advancedDetection.onModel,
        hasTextOverlay: advancedDetection.hasTextOverlay,
        skinRegions: advancedDetection.skinRegions,
    };
}

/**
 * analyzeColorUniformity - Tính std deviation và entropy của pixel colors
 *
 * Ảnh zoom sát vải: std deviation thấp (< 25), entropy thấp (< 5.5)
 * Ảnh full garment: std deviation cao hơn (viền, pattern, nền), entropy cao hơn
 *
 * Input: pixels (Uint8ClampedArray RGBA), pixelCount
 * Output: { stdDev: number, entropy: number }
 */
function analyzeColorUniformity(pixels, pixelCount) {
    // STEP 1: Tính mean RGB
    let sumR = 0, sumG = 0, sumB = 0;
    for (let i = 0; i < pixelCount; i++) {
        sumR += pixels[i * 4];
        sumG += pixels[i * 4 + 1];
        sumB += pixels[i * 4 + 2];
    }
    const meanR = sumR / pixelCount;
    const meanG = sumG / pixelCount;
    const meanB = sumB / pixelCount;

    // STEP 2: Tính std deviation (combined across RGB channels)
    let sumSqDiff = 0;
    for (let i = 0; i < pixelCount; i++) {
        const dr = pixels[i * 4] - meanR;
        const dg = pixels[i * 4 + 1] - meanG;
        const db = pixels[i * 4 + 2] - meanB;
        sumSqDiff += (dr * dr + dg * dg + db * db) / 3;
    }
    const stdDev = Math.sqrt(sumSqDiff / pixelCount);

    // STEP 3: Tính entropy (Shannon entropy trên grayscale histogram)
    // Histogram 64 bins (quantize 256 → 64 để giảm noise)
    const bins = 64;
    const histogram = new Uint32Array(bins);
    for (let i = 0; i < pixelCount; i++) {
        const gray = Math.round(0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]);
        const bin = Math.min(Math.floor(gray / (256 / bins)), bins - 1);
        histogram[bin]++;
    }

    let entropy = 0;
    for (let i = 0; i < bins; i++) {
        if (histogram[i] > 0) {
            const p = histogram[i] / pixelCount;
            entropy -= p * Math.log2(p);
        }
    }

    return { stdDev, entropy };
}

/**
 * detectMultiplePeopleAndOverlay - Phát hiện ảnh có nhiều người và text/watermark
 *
 * Multi-person detection:
 * - Quét pixel theo HSL → tìm vùng skin-tone (H: 10-40, S: 20-70%, L: 30-75%)
 * - Flood-fill để tìm connected regions
 * - Nếu có ≥ 2 regions lớn rời rạc → nhiều người
 * - Nếu có 1 region skin-tone ở top-center → on-model image
 *
 * Text/Watermark detection:
 * - Quét vùng bottom 25% (nơi watermark hay xuất hiện)
 * - Đếm high-contrast horizontal edge transitions
 * - Nhiều transitions nhỏ liên tục theo hàng ngang = pattern chữ
 *
 * Input: imageData (ImageData), width, height (đã scale)
 * Output: { multiplePeople, onModel, hasTextOverlay, skinRegions }
 */
function detectMultiplePeopleAndOverlay(imageData, width, height) {
    const pixels = imageData.data;
    const totalPixels = width * height;

    // STEP 1: Skin-tone detection using HSL color space
    const skinMap = new Uint8Array(totalPixels); // 1 = skin-like, 0 = not
    let totalSkinPixels = 0;

    for (let i = 0; i < totalPixels; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];

        // Convert RGB to HSL
        const rn = r / 255, gn = g / 255, bn = b / 255;
        const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
        const l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
            else if (max === gn) h = ((bn - rn) / d + 2) * 60;
            else h = ((rn - gn) / d + 4) * 60;
        }

        // Skin-tone range: H 0-50°, S 15-75%, L 25-80%
        // Covers diverse skin tones from very light to dark
        const isSkin = (h >= 0 && h <= 50) &&
            (s >= 0.15 && s <= 0.75) &&
            (l >= 0.25 && l <= 0.80);

        if (isSkin) {
            skinMap[i] = 1;
            totalSkinPixels++;
        }
    }

    // STEP 2: Connected component labeling (simplified flood-fill)
    // Tìm các vùng skin-tone liên tục rời rạc
    const labels = new Int16Array(totalPixels); // 0 = unlabeled
    let currentLabel = 0;
    const regionSizes = []; // regionSizes[label-1] = pixel count
    const regionCentroids = []; // { cx, cy } for each region

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (skinMap[idx] === 1 && labels[idx] === 0) {
                currentLabel++;
                let regionSize = 0;
                let sumX = 0, sumY = 0;

                // BFS flood-fill
                const queue = [idx];
                labels[idx] = currentLabel;

                while (queue.length > 0) {
                    const cur = queue.shift();
                    regionSize++;
                    const cx = cur % width;
                    const cy = Math.floor(cur / width);
                    sumX += cx;
                    sumY += cy;

                    // 4-connected neighbors
                    const neighbors = [
                        cy > 0 ? cur - width : -1,
                        cy < height - 1 ? cur + width : -1,
                        cx > 0 ? cur - 1 : -1,
                        cx < width - 1 ? cur + 1 : -1,
                    ];
                    for (const n of neighbors) {
                        if (n >= 0 && skinMap[n] === 1 && labels[n] === 0) {
                            labels[n] = currentLabel;
                            queue.push(n);
                        }
                    }
                }

                regionSizes.push(regionSize);
                regionCentroids.push({
                    cx: sumX / regionSize,
                    cy: sumY / regionSize,
                });
            }
        }
    }

    // STEP 3: Analyze skin regions
    // Significant region = > 2% of image area (filters out noise)
    const minRegionSize = totalPixels * 0.02;
    const significantRegions = regionSizes
        .map((size, i) => ({ size, centroid: regionCentroids[i], index: i }))
        .filter(r => r.size > minRegionSize);

    const skinRatio = totalSkinPixels / totalPixels;
    const multiplePeople = significantRegions.length >= 2;

    // On-model detection: 1 significant skin region in top 40% of image
    const hasTopSkinRegion = significantRegions.some(r =>
        r.centroid.cy < height * 0.4
    );
    // On-model = has skin in upper area + reasonable skin ratio (8-50%)
    const onModel = hasTopSkinRegion && skinRatio >= 0.08 && skinRatio <= 0.50;

    // STEP 4: Text/Watermark detection in bottom 25% of image
    // Text creates many short horizontal high-contrast transitions
    const bottomStartY = Math.floor(height * 0.75);
    let textLikeTransitions = 0;
    let bottomPixelCount = 0;
    const contrastThreshold = 40; // Minimum brightness change to count as transition

    for (let y = bottomStartY; y < height; y++) {
        let transitionsInRow = 0;
        for (let x = 1; x < width; x++) {
            const idx1 = (y * width + x - 1);
            const idx2 = (y * width + x);
            const gray1 = 0.299 * pixels[idx1 * 4] + 0.587 * pixels[idx1 * 4 + 1] + 0.114 * pixels[idx1 * 4 + 2];
            const gray2 = 0.299 * pixels[idx2 * 4] + 0.587 * pixels[idx2 * 4 + 1] + 0.114 * pixels[idx2 * 4 + 2];

            if (Math.abs(gray1 - gray2) > contrastThreshold) {
                transitionsInRow++;
            }
        }
        // Text lines typically have > 10% of width as transitions
        if (transitionsInRow > width * 0.10) {
            textLikeTransitions++;
        }
        bottomPixelCount++;
    }

    // Has text overlay if > 20% of bottom rows have text-like patterns
    const hasTextOverlay = bottomPixelCount > 0 &&
        (textLikeTransitions / bottomPixelCount) > 0.20;

    return {
        multiplePeople,
        onModel,
        hasTextOverlay,
        skinRegions: significantRegions.length,
    };
}

// ==========================================
// UI: WARNING BANNER
// ==========================================

/**
 * showImageQualityWarning - Hiện banner cảnh báo chất lượng ảnh (dismissible)
 *
 * Input: warnings[] — mảng { type, severity, message }
 *        imageUrl — URL ảnh để tracking dismiss
 */
function showImageQualityWarning(warnings, imageUrl) {
    // Remove existing warning banner
    const existing = document.querySelector('.image-quality-warning');
    if (existing) existing.remove();

    const highWarnings = warnings.filter(w => w.severity === 'high');
    const medWarnings = warnings.filter(w => w.severity === 'medium');
    const isHigh = highWarnings.length > 0;

    const banner = document.createElement('div');
    banner.className = `image-quality-warning ${isHigh ? 'severity-high' : 'severity-medium'}`;

    const messagesHtml = warnings.map(w => `<span class="qw-item">${w.message}</span>`).join('');

    banner.innerHTML = `
        <div class="qw-content">
            <span class="qw-icon">${isHigh ? '⚠️' : '💡'}</span>
            <div class="qw-messages">${messagesHtml}</div>
        </div>
        <div class="qw-actions">
            <button class="qw-dismiss-btn" title="${t('quality_warning.false_positive') || 'Lọc sai? Bỏ qua'}">
                ${t('quality_warning.ignore') || 'Bỏ qua'}
            </button>
            <button class="qw-close-btn" title="${t('close') || 'Đóng'}">×</button>
        </div>
    `;

    // Event: dismiss (mark URL as false positive)
    banner.querySelector('.qw-dismiss-btn').addEventListener('click', () => {
        state._dismissedQualityWarnings.add(imageUrl);
        banner.remove();
        showToast(t('quality_warning.dismissed') || '✓ Đã bỏ qua cảnh báo cho ảnh này', 'info');
    });

    // Event: close (just hide, no tracking)
    banner.querySelector('.qw-close-btn').addEventListener('click', () => {
        banner.remove();
    });

    // Auto-hide after 8 seconds for medium warnings
    if (!isHigh) {
        setTimeout(() => banner.remove(), 8000);
    }

    // Insert banner below clothing image container
    const clothingContainer = document.getElementById('clothing-image-container');
    if (clothingContainer && clothingContainer.parentElement) {
        clothingContainer.parentElement.insertBefore(banner, clothingContainer.nextSibling);
    } else {
        document.body.appendChild(banner);
    }
}


// ==========================================
// UNIFIED TRY-ON CONFIRMATION DIALOG
// ==========================================

/**
 * showUnifiedTryOnDialog - 1 dialog duy nhất trước try-on
 * Gồm: gem cost + quality warnings + outfit transfer mode
 *
 * Input:  { allWarnings, gemCost, currentBalance, onModelItems, items }
 * Output: resolve({ proceed, warnings })
 */
function showUnifiedTryOnDialog({ allWarnings, gemCost, currentBalance, onModelItems, items }, resolve) {
    const existing = document.querySelector('.unified-tryon-dialog');
    if (existing) existing.remove();

    const remainingBalance = currentBalance - gemCost;
    const isLowBalance = remainingBalance <= 2;
    const hasWarnings = allWarnings.length > 0;
    const hasOnModel = onModelItems && onModelItems.length > 0;

    // Build warnings HTML
    let warningsHtml = '';
    if (hasWarnings) {
        const warningItems = allWarnings.flatMap(w =>
            w.warnings.map(ww =>
                `<li style="font-size:12px;color:var(--color-foreground-secondary,#888);padding:3px 0;list-style:none">
                    <span style="color:${ww.severity === 'high' ? '#f44336' : '#f59e0b'}">●</span> ${ww.message}
                </li>`
            )
        ).join('');
        warningsHtml = `
            <div style="background:rgba(245,158,11,0.08);border-radius:10px;padding:8px 12px;margin-top:8px">
                <div style="font-size:11px;font-weight:600;color:#d97706;margin-bottom:4px">⚠️ ${t('quality_warning.dialog_title') || 'Lưu ý'}</div>
                <ul style="margin:0;padding:0">${warningItems}</ul>
            </div>
        `;
    }

    // Build transfer mode HTML
    let transferHtml = '';
    if (hasOnModel) {
        const catLabel = (typeof getCategoryLabel === 'function')
            ? getCategoryLabel(onModelItems[0].category)
            : onModelItems[0].category;
        transferHtml = `
            <div style="background:rgba(141,110,99,0.08);border-radius:10px;padding:10px 12px;margin-top:8px">
                <div style="font-size:11px;font-weight:600;color:#8d6e63;margin-bottom:6px">📸 ${t('quality_warning.outfit_transfer_title') || 'Ảnh có người mặc đồ'}</div>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;font-size:12px;color:var(--color-foreground,#4a4a4a)">
                    <input type="radio" name="transfer_mode" value="full_outfit" style="accent-color:#8d6e63" />
                    ${t('quality_warning.outfit_transfer_full') || '🔄 Chuyển toàn bộ outfit'}
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;font-size:12px;color:var(--color-foreground,#4a4a4a)">
                    <input type="radio" name="transfer_mode" value="single_item" checked style="accent-color:#8d6e63" />
                    ${t('quality_warning.outfit_transfer_single', { category: catLabel }) || '👕 Chỉ lấy 1 món'}
                </label>
            </div>
        `;
    }

    const overlay = document.createElement('div');
    overlay.className = 'unified-tryon-dialog fitly-confirm-backdrop';
    overlay.innerHTML = `
        <div class="fitly-confirm-dialog type-tryon" role="dialog" aria-modal="true">
            <span class="fitly-confirm-sparkle" style="top:10px;right:18px;animation-delay:0s">✦</span>
            <span class="fitly-confirm-sparkle" style="top:20px;left:14px;animation-delay:0.8s;font-size:10px">✧</span>
            <span class="fitly-confirm-sparkle" style="bottom:50px;right:12px;animation-delay:1.5s;font-size:10px">✦</span>
            <div class="fitly-confirm-icon-wrap type-tryon">✨</div>
            <div class="fitly-confirm-title">${t('tryon_confirm_title') || 'Thử đồ ngay?'}</div>
            <div class="fitly-confirm-gem-badge">
                💎 ${gemCost} gem
            </div>
            <div style="font-size:12px;color:var(--color-foreground-secondary,#888);margin:4px 0">
                ${currentBalance} → <span style="color:${isLowBalance ? '#f44336' : '#4caf50'};font-weight:600">${remainingBalance}</span> gems
                ${isLowBalance ? '<span style="font-size:10px;color:#f44336"> (⚠️ sắp hết)</span>' : ''}
            </div>
            ${warningsHtml}
            ${transferHtml}
            <div class="fitly-confirm-buttons" style="margin-top:14px">
                <button class="fitly-confirm-btn fitly-confirm-btn-cancel" data-action="cancel">${t('close') || 'Để sau'}</button>
                <button class="fitly-confirm-btn fitly-confirm-btn-confirm type-tryon" data-action="proceed">${t('tryon_confirm_btn') || '✨ Thử ngay'}</button>
            </div>
        </div>
    `;

    // Inject CSS if not already present (reuse confirm_dialog CSS)
    if (typeof injectConfirmDialogCSS === 'function') injectConfirmDialogCSS();

    document.body.appendChild(overlay);

    const dialogEl = overlay.querySelector('.fitly-confirm-dialog');
    function closeDialog(result) {
        overlay.classList.add('closing');
        dialogEl?.classList.add('closing');
        setTimeout(() => { overlay.remove(); resolve(result); }, 200);
    }

    overlay.querySelector('[data-action="proceed"]').addEventListener('click', () => {
        // Apply transfer mode choice if on-model items exist
        if (hasOnModel) {
            const selected = overlay.querySelector('input[name="transfer_mode"]:checked');
            const mode = selected?.value || 'single_item';
            onModelItems.forEach(item => { item.transferMode = mode; });
        }
        // Dismiss all quality warning URLs
        allWarnings.forEach(w => {
            if (w.item?.imageUrl) state._dismissedQualityWarnings.add(w.item.imageUrl);
        });
        closeDialog({ proceed: true, warnings: allWarnings });
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        closeDialog({ proceed: false, warnings: allWarnings });
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDialog({ proceed: false, warnings: allWarnings });
    });

    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', handleEsc);
            closeDialog({ proceed: false, warnings: allWarnings });
        }
    };
    document.addEventListener('keydown', handleEsc);

    // Focus cancel by default
    setTimeout(() => overlay.querySelector('[data-action="cancel"]')?.focus(), 50);
}

// ==========================================
// EXPOSE TO WINDOW
// ==========================================
window.quickValidateClothingImage = quickValidateClothingImage;
window.deepValidateBeforeTryOn = deepValidateBeforeTryOn;
window.showImageQualityWarning = showImageQualityWarning;
window.showUnifiedTryOnDialog = showUnifiedTryOnDialog;
