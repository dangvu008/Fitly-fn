/**
 * File: payment_handlers.js
 * Purpose: Xử lý trạng thái thanh toán và số dư Gems
 * Layer: Application / Feature
 * * Data Contract:
 * - Exports: handleCheckPaymentStatus, handleGetGemsBalance
 */

import { isGuestMode } from './auth_handlers.js';
import { getAuthToken } from './auth_state_manager.js';
import { demoState, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';

export async function handleGetGemsBalance() {
    const guestMode = await isGuestMode();

    if (guestMode) {
        const data = await chrome.storage.local.get('guest_gems_balance');
        return { success: true, balance: data.guest_gems_balance ?? 3 };
    }

    try {
        const accessToken = await getAuthToken();
        if (!accessToken) {
            return { success: false, error: 'Not authenticated', balance: 0 };
        }

        const userData = await chrome.storage.local.get(['user']);
        const userId = userData.user?.id;

        if (!userId) return { success: false, error: 'No user ID', balance: 0 };

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=gems_balance`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_AUTH_KEY,
                }
            }
        );

        if (!response.ok) return { success: false, balance: 0 };
        const data = await response.json();
        const balance = data[0]?.gems_balance ?? 0;
        demoState.gemsBalance = balance;
        return { success: true, balance };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function handleCheckPaymentStatus() {
    try {
        const result = await handleGetGemsBalance();
        if (result.success) {
            demoState.gemsBalance = result.balance;
            return { success: true, balance: result.balance };
        }
        return result;
    } catch (error) {
        console.error('[Fitly] Check payment status error:', error);
        return { success: false, error: error.message };
    }
}
