/**
 * File: process_tryon.js
 * Purpose: Xử lý logic AI Virtual Try-On (gửi ảnh model và clothing lên Supabase Edge Function) 
 * Layer: Application / Feature
 * * Data Contract:
 * - Exports: handleProcessTryOn, handleRefundGems
 */

import { supabase } from '../extension/config.js';
import { isDemoMode, getAuthToken, refreshAuthToken, forceRefreshToken, backupSessionForLongOp } from './auth_state_manager.js';
import { MOCK_TRYON_RESULTS, demoState, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';
import { handleAddUserModel } from './user_model_manager.js';
import { handleSaveRecentClothing } from './recent_clothing_manager.js';
import { compressImageBlob, blobToBase64, COMPRESS_MAX_DIMENSION, COMPRESS_QUALITY } from './image_compressor.js';
import { isGuestMode } from './auth_handlers.js';
import { log } from './debug_logger.js';




async function uploadTryonResultToStorage(tempUrl, userId, tryonId) {
    try {
        const response = await fetch(tempUrl);
        const blob = await response.blob();

        const fileExt = tempUrl.split('.').pop().split('?')[0] || 'jpg';
        const fileName = `${userId}/${tryonId}.${fileExt}`;

        const { error: uploadError } = await supabase
            .storage
            .from('tryon-results')
            .upload(fileName, blob, {
                contentType: blob.type,
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase
            .storage
            .from('tryon-results')
            .getPublicUrl(fileName);

        let thumbnailBase64 = null;
        try {
            const { createThumbnailBase64 } = await import('./image_compressor.js');
            thumbnailBase64 = await createThumbnailBase64(blob);
        } catch (thumbErr) {
            console.warn('[uploadTryonResult] Thumbnail creation failed (non-blocking):', thumbErr.message);
        }

        return { publicUrl, thumbnail: thumbnailBase64 };
    } catch (error) {
        console.error('[Fitly] Error uploading tryon result to storage:', error);
        return null;
    }
}

export async function handleProcessTryOn(data) {
    console.log('[DEBUG-BG-TRYON] ========== handleProcessTryOn START ==========');
    console.log('[DEBUG-BG-TRYON] Timestamp:', new Date().toISOString());

    // DEBUG: Log Supabase session state
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const ttl = session?.expires_at ? Math.floor((session.expires_at * 1000 - Date.now()) / 1000) : 'N/A';
        console.log('[DEBUG-BG-TRYON] 💾 Supabase session:', session ? `exists (TTL: ${ttl}s)` : 'NULL');
    } catch (storageErr) {
        console.error('[DEBUG-BG-TRYON] ❌ Cannot check session:', storageErr);
    }

    const guestMode = await isGuestMode();
    const demoMode = await isDemoMode();
    console.log('[DEBUG-BG-TRYON] guestMode:', guestMode, '| demoMode:', demoMode);
    if (demoMode || guestMode || data.use_mock) {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

        let currentBalance = demoState.gemsBalance;
        if (guestMode) {
            const storageData = await chrome.storage.local.get('guest_gems_balance');
            currentBalance = storageData.guest_gems_balance ?? demoState.gemsBalance;
        }

        const gemCost = data.quality === 'hd' ? 10 : 5;
        if (currentBalance < gemCost) {
            return {
                success: false,
                error: 'Không đủ gems. Đăng nhập để mua thêm gems!'
            };
        }

        const newBalance = currentBalance - gemCost;
        demoState.gemsBalance = newBalance;

        if (guestMode) {
            await chrome.storage.local.set({ guest_gems_balance: newBalance });
        }

        if (data.person_image && !data.person_image.startsWith('data:')) {
            await handleAddUserModel({
                imageUrl: data.person_image,
                source: 'tryon',
                label: 'Ảnh thử đồ'
            });
        }

        await handleSaveRecentClothing({
            imageUrl: data.clothing_image,
            sourceUrl: data.source_url,
            name: data.clothing_name
        });

        const resultUrl = MOCK_TRYON_RESULTS[Math.floor(Math.random() * MOCK_TRYON_RESULTS.length)];

        return {
            success: true,
            result_image_url: resultUrl,
            tryon_id: 'tryon-' + Date.now(),
            gems_used: gemCost,
            provider_used: data.use_mock ? 'mock-dev' : (guestMode ? 'guest-demo' : 'demo'),
            gems_remaining: newBalance,
        };
    }

    // STEP 1: SW keep-alive — prevent Chrome from killing SW during long processing
    // 15s interval with dual-API ping for maximum reliability
    let keepAliveTick = 0;
    const keepAliveInterval = setInterval(() => {
        keepAliveTick++;
        chrome.runtime.getPlatformInfo().catch(() => { });
        // Alternate with getManifest() every other tick as fallback
        if (keepAliveTick % 2 === 0) {
            try { chrome.runtime.getManifest(); } catch (_) { }
        }
    }, 15000);



    try {
        // STEP 2: Force refresh token to get maximum TTL (~1 hour)
        // forceRefreshToken() now uses supabase.auth.refreshSession() internally
        // so Supabase client stays in sync — no need for separate fallback chain
        console.log('[DEBUG-BG-TRYON] STEP 2: Calling forceRefreshToken()...');
        let accessToken;
        try {
            accessToken = await forceRefreshToken();
            console.log('[DEBUG-BG-TRYON] forceRefreshToken result:', accessToken ? `token exists (${accessToken.substring(0, 30)}...)` : 'NULL');
            // Backup session before long operation — protects against SW restart mid-process
            if (accessToken) await backupSessionForLongOp();
        } catch (forceRefreshErr) {
            console.error('[DEBUG-BG-TRYON] ❌ forceRefreshToken threw error:', forceRefreshErr);
            console.error('[DEBUG-BG-TRYON] errorCode:', forceRefreshErr.errorCode);
            // Fallback: try getting existing session from Supabase client
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token) {
                    const sessionTTL = session.expires_at
                        ? Math.floor((session.expires_at * 1000 - Date.now()) / 1000)
                        : 0;
                    if (sessionTTL > 0) {
                        accessToken = session.access_token;
                        console.log('[DEBUG-BG-TRYON] ✅ Fallback: got token from Supabase session, TTL:', sessionTTL, 's');
                    }
                }
            } catch (_) { /* exhausted */ }
        }

        if (!accessToken) {
            console.error('[DEBUG-BG-TRYON] ❌ NO TOKEN after all refresh attempts — returning error');
            log('[handleProcessTryOn] ❌ No token after all refresh attempts');
            return { success: false, error: 'Chưa đăng nhập. Vui lòng đăng nhập để sử dụng AI try-on.' };
        }

        // DEBUG: decode JWT để kiểm tra token có valid không trước khi gửi
        try {
            const parts = accessToken.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                const expMs = (payload.exp || 0) * 1000;
                const diffSec = Math.floor((expMs - Date.now()) / 1000);
                log('[handleProcessTryOn] 🔑 Token to send: sub=' + payload.sub + ', role=' + payload.role + ', TTL=' + diffSec + 's, expired=' + (diffSec <= 0));
            }
        } catch (_) { }

        let clothingImages = [];
        if (data.clothing_images && Array.isArray(data.clothing_images)) {
            clothingImages = data.clothing_images;
        } else if (data.clothing_image) {
            clothingImages = [{
                image: data.clothing_image,
                category: data.clothing_category || 'top',
                name: data.clothing_name || 'Item',
                image_type: data.image_type || 'unknown'
            }];
        }

        const compressedClothing = await Promise.all(clothingImages.map(async (item) => {
            if (item.image && item.image.startsWith('data:') && item.image.length > 500_000) {
                try {
                    const resp = await fetch(item.image);
                    const blob = await resp.blob();
                    const compressedBlob = await compressImageBlob(blob, COMPRESS_MAX_DIMENSION, COMPRESS_QUALITY);
                    return { ...item, image: await blobToBase64(compressedBlob) };
                } catch (compErr) {
                    return item;
                }
            }
            return item;
        }));

        let modelImage = data.model_image || data.person_image;
        if (modelImage && modelImage.startsWith('data:') && modelImage.length > 500_000) {
            try {
                const resp = await fetch(modelImage);
                const blob = await resp.blob();
                const compressedBlob = await compressImageBlob(blob, COMPRESS_MAX_DIMENSION, COMPRESS_QUALITY);
                modelImage = await blobToBase64(compressedBlob);
            } catch (compressErr) {
                console.warn('[handleProcessTryOn] Model image compression failed, using original:', compressErr.message);
            }
        }

        // STEP 5: Helper — gọi Edge Function với token + timeout 5 phút
        const EDGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
        const callTryOnEdge = (token) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);

            return fetch(`${SUPABASE_URL}/functions/v1/process-tryon`, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model_image: modelImage,
                    clothing_images: compressedClothing,
                    quality: data.quality || 'standard',
                }),
            }).finally(() => clearTimeout(timeoutId));
        };

        // STEP 6: Gọi lần đầu
        console.log('[DEBUG-BG-TRYON] STEP 6: Calling Edge Function (first attempt)...');
        console.log('[DEBUG-BG-TRYON] Edge Function URL:', `${SUPABASE_URL}/functions/v1/process-tryon`);
        const edgeCallStart = Date.now();
        let response;
        try {
            response = await callTryOnEdge(accessToken);
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                return {
                    success: false,
                    error: 'Xử lý ảnh quá lâu (timeout). Vui lòng thử lại.',
                    errorCode: 'TIMEOUT'
                };
            }
            throw fetchErr; // Re-throw network errors to outer catch
        }
        const edgeCallTime = Date.now() - edgeCallStart;
        console.log('[DEBUG-BG-TRYON] Edge Function responded in', edgeCallTime, 'ms, status:', response.status);
        log('[handleProcessTryOn] First call status:', response.status);

        // STEP 7: Nếu 401/403 → force refresh token và retry 1 lần
        if (!response.ok && (response.status === 401 || response.status === 403)) {
            const errBody = await response.clone().json().catch(() => ({}));
            console.error('[DEBUG-BG-TRYON] ❌ Got', response.status, 'from Edge Function!');
            console.error('[DEBUG-BG-TRYON] Error body:', JSON.stringify(errBody));
            console.error('[DEBUG-BG-TRYON] Đang force refresh token để retry...');
            log('[handleProcessTryOn] ❌ Got', response.status, '| body:', JSON.stringify(errBody));
            log('[handleProcessTryOn] Force refreshing token for retry...');
            let retryRefreshErr = null;
            let newAccessToken;
            try {
                newAccessToken = await forceRefreshToken(true);
                console.log('[DEBUG-BG-TRYON] Force refresh for retry result:', newAccessToken ? 'GOT TOKEN' : 'NULL');
            } catch (refreshErr) {
                console.error('[DEBUG-BG-TRYON] ❌ forceRefreshToken threw on retry:', refreshErr);
                retryRefreshErr = refreshErr;
                newAccessToken = null;
            }

            if (!newAccessToken) {
                // Refresh thất bại — KHÔNG xóa tokens (user có thể re-login và retry)
                console.error('[DEBUG-BG-TRYON] 🔴 REFRESH FAILED on retry — returning AUTH_EXPIRED (tokens preserved)');
                console.error('[DEBUG-BG-TRYON] retryRefreshErr:', retryRefreshErr?.message || 'returned null');
                return {
                    success: false,
                    error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
                    errorCode: 'AUTH_EXPIRED'
                };
            }

            log('[handleProcessTryOn] Token refreshed, retrying call...');
            try {
                response = await callTryOnEdge(newAccessToken);
            } catch (retryFetchErr) {
                if (retryFetchErr.name === 'AbortError') {
                    return {
                        success: false,
                        error: 'Xử lý ảnh quá lâu (timeout). Vui lòng thử lại.',
                        errorCode: 'TIMEOUT'
                    };
                }
                throw retryFetchErr;
            }
            log('[handleProcessTryOn] Retry call status:', response.status);

            if (!response.ok) {
                // Retry vẫn fail → KHÔNG xóa tokens, chỉ trả AUTH_EXPIRED
                if (response.status === 401 || response.status === 403) {
                    const retryBody = await response.json().catch(() => ({}));
                    console.error('[DEBUG-BG-TRYON] 🔴 RETRY also got', response.status, '— returning AUTH_EXPIRED');
                    console.error('[DEBUG-BG-TRYON] Retry error body:', JSON.stringify(retryBody));
                    log('[handleProcessTryOn] Retry auth failed, body:', retryBody);
                    // Clear stale session — double 401 means token is irrecoverably invalid
                    try {
                        await supabase.auth.signOut({ scope: 'local' });
                        console.log('[DEBUG-BG-TRYON] Cleared stale session after double 401');
                    } catch (_) { /* ignore */ }
                    return {
                        success: false,
                        error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
                        errorCode: 'AUTH_EXPIRED'
                    };
                }
                // Non-auth error on retry — fall through to STEP 8
            }
        }

        // STEP 8: Xử lý các lỗi khác (non-auth)
        if (!response.ok) {
            const errorResult = await response.json().catch(() => ({}));
            return {
                success: false,
                error: errorResult.message || errorResult.error || `Lỗi AI try-on (${response.status})`,
            };
        }

        const result = await response.json();

        // STEP 9: Lưu clothing vào recent history
        if (clothingImages.length > 0) {
            await handleSaveRecentClothing({
                imageUrl: clothingImages[0].image,
                sourceUrl: data.source_url || '',
                name: clothingImages[0].name
            });
        }

        // STEP 10: Update gems balance cho sidebar
        if (result.gems_remaining !== undefined) {
            demoState.gemsBalance = result.gems_remaining;
            chrome.runtime.sendMessage({
                type: 'GEMS_BALANCE_UPDATED',
                balance: result.gems_remaining
            }).catch(() => { });
        }

        // STEP 11: Async upload kết quả lên Supabase Storage (không block UI)
        const tryonId = result.tryon_id;
        const tempUrl = result.result_image_url;

        if (tryonId && tempUrl && tempUrl.startsWith('http')) {
            setTimeout(async () => {
                try {
                    const currentToken = await getAuthToken();
                    const userData = await chrome.storage.local.get(['user']);
                    const userId = userData.user?.id;
                    if (!userId || !currentToken) return;

                    const uploadData = await uploadTryonResultToStorage(tempUrl, userId, tryonId);
                    if (!uploadData?.publicUrl) return;

                    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/tryon_history?id=eq.${tryonId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${currentToken}`,
                            'apikey': SUPABASE_AUTH_KEY,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ result_image_url: uploadData.publicUrl })
                    });

                    if (updateResponse.ok) {
                        if (uploadData.thumbnail) {
                            const thumbStore = await chrome.storage.local.get('tryon_thumbnails');
                            const thumbnails = thumbStore.tryon_thumbnails || {};
                            thumbnails[tryonId] = uploadData.thumbnail;
                            const keys = Object.keys(thumbnails);
                            if (keys.length > 20) keys.slice(0, keys.length - 20).forEach(k => delete thumbnails[k]);
                            await chrome.storage.local.set({ tryon_thumbnails: thumbnails });
                        }
                    } else {
                        console.warn('[Fitly] Lỗi update permanent URL trong DB:', await updateResponse.text());
                    }
                } catch (err) {
                    console.error('[Fitly] Upload tryon result (async) error:', err);
                }
            }, 100);
        }

        return {
            success: true,
            result_image_url: result.result_image_url,
            result_image: result.result_image,
            tryon_id: result.tryon_id,
            gems_used: result.gems_used,
            gems_remaining: result.gems_remaining,
            cached: result.cached || false,
        };
    } catch (error) {
        console.error('[Fitly] Edge Function connection error:', error);
        if (error.name === 'AbortError') {
            return { success: false, error: 'Xử lý ảnh quá lâu. Vui lòng thử lại.', errorCode: 'TIMEOUT' };
        }
        return { success: false, error: 'Lỗi kết nối AI service. Vui lòng kiểm tra mạng.', errorCode: 'NETWORK_ERROR' };
    } finally {
        clearInterval(keepAliveInterval);
    }
}


export async function handleRefundGems(data) {
    const guestMode = await isGuestMode();
    const demoMode = await isDemoMode();
    const refundAmount = data.amount || 1;

    log('[Fitly] Processing gem refund:', data.reason, 'Amount:', refundAmount);

    if (demoMode || guestMode) {
        let currentBalance = demoState.gemsBalance;
        if (guestMode) {
            const storageData = await chrome.storage.local.get('guest_gems_balance');
            currentBalance = storageData.guest_gems_balance ?? demoState.gemsBalance;
        }

        const newBalance = currentBalance + refundAmount;
        demoState.gemsBalance = newBalance;

        if (guestMode) {
            await chrome.storage.local.set({ guest_gems_balance: newBalance });
        }

        chrome.runtime.sendMessage({
            type: 'GEMS_BALANCE_UPDATED',
            balance: newBalance
        }).catch(() => { });

        return { success: true, gems_remaining: newBalance };
    }

    try {
        const token = await getAuthToken();
        if (!token) return { success: false, error: 'Unauthorized' };

        const tokenData = await chrome.storage.local.get(['user']);
        const userId = tokenData.user?.id;
        if (!userId) return { success: false, error: 'User missing' };

        const refundResponse = await fetch(`${SUPABASE_URL}/functions/v1/refund-gems`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': SUPABASE_AUTH_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                amount: refundAmount,
                reason: data.reason || 'Image validation failed',
                provider: data.provider || 'unknown'
            }),
        });

        if (!refundResponse.ok) {
            console.error('[Fitly] DB Refund failed:', await refundResponse.text());
            return { success: false, error: 'Refund request failed' };
        }

        const result = await refundResponse.json();

        if (result.gems_remaining !== undefined) {
            demoState.gemsBalance = result.gems_remaining;
            chrome.runtime.sendMessage({
                type: 'GEMS_BALANCE_UPDATED',
                balance: result.gems_remaining
            }).catch(() => { });
        }

        return { success: true, gems_remaining: result.gems_remaining };
    } catch (error) {
        console.error('[Fitly] handleRefundGems error:', error);
        return { success: false, error: error.message };
    }
}
