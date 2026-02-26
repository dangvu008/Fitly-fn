/**
 * File: process_edit.js
 * Purpose: Xử lý edit ảnh kết quả try-on qua Edge Function process-tryon (edit_mode=true)
 * Layer: Application / Feature
 * Data Contract:
 * - Input:  { imageUrl: string, editRequest: string }
 * - Output: { success: boolean, resultImage?: string, gemsUsed?: number, gemsRemaining?: number, error?: string }
 * Flow: Auth → Guest/Demo check → callEditEdge → retry on 401 → return result
 */

import { supabase } from '../extension/config.js';
import { isDemoMode, getAuthToken, refreshAuthToken } from './auth_state_manager.js';
import { demoState, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';
import { isGuestMode } from './auth_handlers.js';

/**
 * callEditEdge — Helper tránh duplicate fetch code giữa first-try và retry
 * Input:  token (JWT string), imageUrl, editRequest
 * Output: Response object từ Edge Function
 */
async function callEditEdge(token, imageUrl, editRequest) {
    return fetch(`${SUPABASE_URL}/functions/v1/process-tryon`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_AUTH_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model_image: imageUrl,
            edit_mode: true,
            edit_prompt: editRequest.trim(),
        }),
    });
}

export async function handleEditImage(data) {
    const { imageUrl, editRequest } = data || {};

    if (!imageUrl) return { success: false, error: 'Thiếu ảnh gốc để chỉnh sửa' };
    if (!editRequest || editRequest.trim().length === 0) return { success: false, error: 'Vui lòng nhập yêu cầu chỉnh sửa' };

    const guestMode = await isGuestMode();
    const demoMode = await isDemoMode();

    // Demo / Guest mode: mock response sau 1.5-2.5s
    if (demoMode || guestMode) {
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

        let currentBalance = demoState.gemsBalance;
        if (guestMode) {
            const storageData = await chrome.storage.local.get('guest_gems_balance');
            currentBalance = storageData.guest_gems_balance ?? demoState.gemsBalance;
        }

        const gemCost = 5;
        if (currentBalance < gemCost) {
            return { success: false, error: 'Không đủ gems để chỉnh sửa ảnh.' };
        }

        const newBalance = currentBalance - gemCost;
        demoState.gemsBalance = newBalance;
        if (guestMode) {
            await chrome.storage.local.set({ guest_gems_balance: newBalance });
        }

        return {
            success: true,
            resultImage: imageUrl,
            gemsUsed: gemCost,
            gemsRemaining: newBalance,
        };
    }

    try {
        // STEP 1: Resolve access token via Supabase client (single source of truth)
        let accessToken = await getAuthToken();

        if (!accessToken) {
            return { success: false, error: 'Chưa đăng nhập. Vui lòng đăng nhập để chỉnh sửa ảnh.' };
        }

        // STEP 2: Gọi Edge Function
        const response = await callEditEdge(accessToken, imageUrl, editRequest);

        // STEP 3: Nếu 401/403 → thử refresh token và retry
        if (response.status === 401 || response.status === 403) {
            const newToken = await refreshAuthToken();
            if (newToken) {
                const retryResp = await callEditEdge(newToken, imageUrl, editRequest);
                if (retryResp.ok) {
                    const retryResult = await retryResp.json();
                    if (retryResult.gems_remaining !== undefined) {
                        demoState.gemsBalance = retryResult.gems_remaining;
                        chrome.runtime.sendMessage({ type: 'GEMS_BALANCE_UPDATED', balance: retryResult.gems_remaining }).catch(() => { });
                    }
                    return {
                        success: true,
                        resultImage: retryResult.result_image_url,
                        gemsUsed: retryResult.gems_used,
                        gemsRemaining: retryResult.gems_remaining,
                    };
                }
            }
            return { success: false, error: 'Phiên đăng nhập hết hạn. Vui lòng thử lại.' };
        }

        if (!response.ok) {
            const errorResult = await response.json().catch(() => ({}));
            return {
                success: false,
                error: errorResult.message || errorResult.error || `Lỗi chỉnh sửa ảnh (${response.status})`,
            };
        }

        // STEP 4: Xử lý response thành công
        const result = await response.json();

        if (result.gems_remaining !== undefined) {
            demoState.gemsBalance = result.gems_remaining;
            chrome.runtime.sendMessage({ type: 'GEMS_BALANCE_UPDATED', balance: result.gems_remaining }).catch(() => { });
        }

        return {
            success: true,
            resultImage: result.result_image_url,
            gemsUsed: result.gems_used,
            gemsRemaining: result.gems_remaining,
        };

    } catch (error) {
        console.error('[Fitly] Edit image exception:', error);
        return { success: false, error: 'Lỗi hệ thống khi chỉnh sửa ảnh. Vui lòng thử lại.' };
    }
}
