/**
 * File: handle_tryon_processing.js
 * Purpose: Xử lý luồng try-on - validate ảnh, gọi backend, cập nhật gems
 * Layer: Application
 *
 * Input: state.modelImage, state.selectedItems, state.gemsBalance
 * Output: Kết quả try-on thêm vào state.results, gems balance giảm
 *
 * Flow:
 * 1. processTryOn → validate inputs → gọi PROCESS_TRYON
 * 2. validateTryOnResult → check ảnh hợp lệ trước khi trừ gems
 * 3. validateImageUrl → load test image với timeout
 * 4. Nếu ảnh lỗi → refund gems tự động
 */

async function validateImageUrl(imageUrl, timeout = 20000) {
    if (!imageUrl || typeof imageUrl !== 'string') {
        return { valid: false, error: 'URL ảnh không hợp lệ' };
    }

    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
        return { valid: false, error: 'URL ảnh phải bắt đầu bằng http://, https:// hoặc data:' };
    }

    return new Promise((resolve) => {
        const img = new Image();
        let resolved = false;

        const timeoutId = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                img.src = '';
                resolve({ valid: false, error: 'Timeout: Ảnh tải quá lâu' });
            }
        }, timeout);

        img.onload = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                    resolve({ valid: false, error: 'Ảnh không có kích thước hợp lệ' });
                } else {
                    resolve({ valid: true, width: img.naturalWidth, height: img.naturalHeight });
                }
            }
        };

        img.onerror = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                resolve({ valid: false, error: 'Không thể tải ảnh - URL có thể bị hỏng hoặc bị chặn' });
            }
        };

        // NOTE: KHÔNG set img.crossOrigin = 'anonymous' — sẽ break validation
        // nếu server không gửi CORS header đúng (vd: Replicate URLs)
        img.src = imageUrl;
    });
}

async function validateTryOnResult(resultImageUrl, modelImageUrl) {
    // STEP 1: Try validation lần đầu (20s timeout)
    let validation = await validateImageUrl(resultImageUrl);
    if (validation.valid) {
        // STEP 1b: Check if result URL is identical to model image URL
        // This catches the case where AI returned the input image unchanged
        if (modelImageUrl && resultImageUrl === modelImageUrl) {
            console.error('[validateTryOnResult] Result URL is identical to model image URL — AI failed to apply clothing');
            return { valid: false, error: 'AI không thay đổi được trang phục. Hãy thử lại hoặc dùng ảnh quần áo khác.' };
        }
        return { valid: true };
    }

    // STEP 2: Retry lần 2 nếu timeout — Replicate CDN đôi khi chậm lần đầu
    console.warn('[validateTryOnResult] First attempt failed:', validation.error, '— retrying...');
    await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
    validation = await validateImageUrl(resultImageUrl, 30000); // 30s timeout for retry
    if (validation.valid) {
        if (modelImageUrl && resultImageUrl === modelImageUrl) {
            console.error('[validateTryOnResult] Result URL is identical to model image URL — AI failed to apply clothing');
            return { valid: false, error: 'AI không thay đổi được trang phục. Hãy thử lại hoặc dùng ảnh quần áo khác.' };
        }
        return { valid: true };
    }

    return { valid: false, error: `Ảnh kết quả lỗi: ${validation.error}. Gems sẽ không bị trừ.` };
}

async function processTryOn(event) {
    console.log('[DEBUG-TRYON] ========== BẮT ĐẦU PROCESS TRY-ON ==========');
    console.log('[DEBUG-TRYON] Timestamp:', new Date().toISOString());
    console.log('[DEBUG-TRYON] state.modelImage:', state.modelImage ? `exists (${state.modelImage.substring(0, 50)}...)` : 'NULL');
    console.log('[DEBUG-TRYON] state.selectedItems:', state.selectedItems.length, 'items');
    console.log('[DEBUG-TRYON] state.gemsBalance:', state.gemsBalance);
    console.log('[DEBUG-TRYON] state.authenticated:', state.authenticated);
    if (!state.modelImage || state.selectedItems.length === 0) {
        showToast(t('select_model_and_item'), 'error');
        return;
    }

    if (state.gemsBalance < GEM_COST_STANDARD) {
        showToast(t('error_insufficient_gems'), 'error');
        chrome.tabs.create({ url: 'http://localhost:3000/profile' });
        return;
    }

    // Unified confirmation: gem cost + quality warnings + transfer mode — 1 dialog duy nhất
    if (window.deepValidateBeforeTryOn) {
        const qualityCheck = await deepValidateBeforeTryOn(state.selectedItems, {
            gemCost: GEM_COST_STANDARD,
            currentBalance: state.gemsBalance,
        });
        if (!qualityCheck.proceed) return;
    }

    const useMock = event?.shiftKey;
    showLoading(true, useMock ? t('running_simulation') : t('processing'));
    updateProgress(10);

    state.tryonProcessing = true;
    console.log('[DEBUG-TRYON] Confirmed by user, starting processing...');
    try {

        const progressInterval = setInterval(() => {
            const current = parseInt(elements.loadingProgressBar?.style.width || '10');
            if (current < 85) updateProgress(current + Math.random() * 10);
        }, 800);

        const clothingImagesPayload = state.selectedItems.map((item, idx) => ({
            image: item.imageUrl,
            category: item.category || 'top',
            name: item.name || 'Item',
            image_type: item.imageType || 'unknown',
            is_primary: idx === 0,
            sub_category: item.subCategory || undefined,
            transfer_mode: item.transferMode || undefined // 'full_outfit' | 'single_item' | undefined
        }));

        console.log('[DEBUG-TRYON] 📤 Sending PROCESS_TRYON message to background...');
        console.log('[DEBUG-TRYON] clothingImagesPayload:', clothingImagesPayload.length, 'items');
        const sendTimestamp = Date.now();
        let response;
        try {
            response = await chrome.runtime.sendMessage({
                type: 'PROCESS_TRYON',
                data: {
                    person_image: state.modelImage,
                    clothing_images: clothingImagesPayload,
                    clothing_image: state.clothingImage,
                    source_url: state.clothingSourceUrl,
                    quality: 'standard',
                    use_mock: useMock
                }
            });
        } catch (sendErr) {
            console.error('[DEBUG-TRYON] ❌ chrome.runtime.sendMessage FAILED:', sendErr);
            console.error('[DEBUG-TRYON] Error name:', sendErr.name, '| message:', sendErr.message);
            console.error('[DEBUG-TRYON] This usually means Service Worker was killed mid-processing');
            throw sendErr;
        }
        const responseTime = Date.now() - sendTimestamp;
        console.log('[DEBUG-TRYON] 📥 Response received in', responseTime, 'ms');
        console.log('[DEBUG-TRYON] response:', JSON.stringify(response, null, 2));

        clearInterval(progressInterval);
        updateProgress(100);

        if (!response) {
            console.error('[DEBUG-TRYON] ❌ Response is null/undefined — SW có thể đã bị kill');
            showErrorOverlay(true, 'Không nhận được phản hồi từ background. Vui lòng thử lại.');
            return;
        }

        if (response.success) {
            updateProgress(95);
            if (elements.loadingText) elements.loadingText.textContent = t('checking_image');

            const imageValidation = await validateTryOnResult(response.result_image_url, state.modelImage);

            if (!imageValidation.valid) {
                console.error('[Fitly] Result image validation failed, requesting refund...');
                try {
                    const refundResponse = await chrome.runtime.sendMessage({
                        type: 'REFUND_GEMS',
                        data: {
                            reason: 'Invalid result image: ' + imageValidation.error,
                            amount: response.gems_used || GEM_COST_STANDARD,
                            tryonId: response.tryon_id
                        }
                    });
                    if (refundResponse?.success && refundResponse.newBalance !== undefined) {
                        state.gemsBalance = refundResponse.newBalance;
                    }
                } catch (refundError) {
                    console.error('[Fitly] Refund request failed:', refundError);
                }
                showErrorOverlay(true, imageValidation.error);
                updateUI();
                return;
            }

            const firstClothingUrl = state.selectedItems?.[0]?.imageUrl || state.clothingImage;
            addResult(response.result_image_url, firstClothingUrl, state.modelImage, null, response.tryon_id || null);
            state.gemsBalance -= response.gems_used || GEM_COST_STANDARD;
            await loadUserModels();
            await loadRecentClothing();
            updateUI();
        } else {
            const errorMessage = response.error || t('error_occurred');
            const errorCode = response.errorCode;
            console.error('[DEBUG-TRYON] ❌ Try-on FAILED');
            console.error('[DEBUG-TRYON] errorCode:', errorCode);
            console.error('[DEBUG-TRYON] errorMessage:', errorMessage);
            console.error('[DEBUG-TRYON] Full response:', JSON.stringify(response));

            // Xử lý error dựa trên errorCode thay vì keyword matching
            // Chỉ logout khi errorCode === 'AUTH_EXPIRED' (token thực sự hết hạn và refresh fail)

            if (errorCode === 'TIMEOUT') {
                // Timeout — Edge Function mất quá lâu, KHÔNG logout
                const timeoutMsg = 'Xử lý ảnh quá lâu. Vui lòng thử lại sau.';
                showToast(timeoutMsg, 'warning');
                showErrorOverlay(true, errorMessage || timeoutMsg);
                return;
            }

            if (errorCode === 'NETWORK_ERROR') {
                // Network error — mất kết nối, KHÔNG logout
                const networkMsg = 'Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.';
                showToast(networkMsg, 'warning');
                showErrorOverlay(true, errorMessage || networkMsg);
                return;
            }

            if (errorCode === 'UNCHANGED_RESULT') {
                // AI returned model image unchanged — gems already refunded by server
                showToast(errorMessage, 'warning');
                showErrorOverlay(true, errorMessage);
                return;
            }

            if (errorCode === 'AUTH_EXPIRED') {
                // Auth expired — token hết hạn và refresh cũng fail
                // KHÔNG auto-logout → giữ state (selectedItems, modelImage) để user retry sau khi re-login
                console.error('[DEBUG-TRYON] 🔴 AUTH_EXPIRED detected — hiện thông báo re-login (KHÔNG auto-logout)');
                console.error('[DEBUG-TRYON] Lý do: Token hết hạn + refresh thất bại');
                showAuthExpiredOverlay();
                return;
            }

            // Other errors — show error overlay, KHÔNG logout
            // Nếu có refund, backend sẽ tự động xử lý và trả về balance mới
            if (response.refunded && response.newBalance !== undefined) {
                state.gemsBalance = response.newBalance;
                updateUI();
            }

            showErrorOverlay(true, errorMessage);
        }
    } catch (error) {
        console.error('[DEBUG-TRYON] ❌ OUTER CATCH — unexpected error:', error);
        console.error('[DEBUG-TRYON] Error type:', error.constructor?.name);
        console.error('[DEBUG-TRYON] Error message:', error.message);
        console.error('[DEBUG-TRYON] Stack:', error.stack);
        showErrorOverlay(true, t('processing_error'));
    } finally {
        state.tryonProcessing = false;
        showLoading(false);
    }
}

// Expose ra window
window.validateImageUrl = validateImageUrl;
window.validateTryOnResult = validateTryOnResult;
window.processTryOn = processTryOn;
