import { SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';
import { log } from './debug_logger.js';
import { fetchProfileFromSupabase } from './auth_handlers.js';
import { supabase } from '../extension/config.js';

// ============================================================================
// URL PARSING HELPERS
// ============================================================================

/**
 * Parse session tokens từ OAuth callback URL hash fragment
 *
 * @param {string} url - Full callback URL (https://<ext>.chromiumapp.org/#access_token=...&...)
 * @returns {object|null} Session object hoặc null
 *
 * Flow:
 * 1. Tách hash fragment từ URL
 * 2. Parse URLSearchParams
 * 3. Extract access_token, refresh_token, expires_in, expires_at, token_type
 */
function parseSessionFromUrl(url) {
    try {
        // Hash fragment bắt đầu sau '#'
        const hashIndex = url.indexOf('#');
        if (hashIndex === -1) {
            // Thử parse từ query params (một số flow dùng ? thay vì #)
            const queryIndex = url.indexOf('?');
            if (queryIndex === -1) return null;
            const params = new URLSearchParams(url.substring(queryIndex + 1));
            return extractSessionParams(params);
        }

        const params = new URLSearchParams(url.substring(hashIndex + 1));
        return extractSessionParams(params);
    } catch (err) {
        console.error('[Fitly] parseSessionFromUrl error:', err);
        return null;
    }
}

/**
 * Extract session params từ URLSearchParams
 */
function extractSessionParams(params) {
    const accessToken = params.get('access_token');
    if (!accessToken) return null;

    return {
        access_token: accessToken,
        refresh_token: params.get('refresh_token') || null,
        expires_in: params.get('expires_in') || '3600',
        expires_at: params.get('expires_at') || null,
        token_type: params.get('token_type') || 'bearer',
        provider_token: params.get('provider_token') || null,
    };
}

// ============================================================================
// FINALIZE SESSION
// ============================================================================

/**
 * Finalize social login: sync to Supabase client, fetch profile, notify sidebar
 */
async function finalizeSocialLoginSession(session) {
    try {
        // STEP 1: Set session in Supabase client (single source of truth)
        if (session.access_token && session.refresh_token) {
            try {
                await supabase.auth.setSession({
                    access_token: session.access_token,
                    refresh_token: session.refresh_token,
                });
            } catch (e) {
                console.warn('[finalizeSocialLoginSession] setSession failed:', e.message);
            }
        }

        // STEP 2: Store non-auth user data
        await chrome.storage.local.set({
            user: session.user,
            cached_user: session.user,
        });

        // Clear guest mode nếu có
        await chrome.storage.local.remove(['guest_mode', 'guest_gems_balance']);

        // STEP 3: Fetch profile từ Supabase
        const profileData = await fetchProfileFromSupabase(session.access_token);

        // STEP 4: Notify tất cả tabs để sidebar refresh
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'AUTH_STATE_CHANGED' }).catch(() => { });
            });
        });

        log('[Fitly] Social login finalized for:', session.user?.email);

        return {
            success: true,
            authenticated: true,
            user: session.user,
            profile: profileData?.profile || { email: session.user?.email, gems_balance: 0 },
            gemsBalance: profileData?.profile?.gems_balance || 0,
        };
    } catch (error) {
        console.error('[Fitly] finalizeSocialLoginSession error:', error);
        return { success: false, error: 'Lỗi khi hoàn tất đăng nhập: ' + error.message };
    }
}

// ============================================================================
// SOCIAL LOGIN HANDLER
// ============================================================================

/**
 * handleSocialLogin - Xử lý đăng nhập qua Google/Facebook OAuth
 *
 * Input: { provider: 'google' | 'facebook' }
 * Output: { success, user, profile, gemsBalance } hoặc { success: false, error }
 *
 * Flow:
 * 1. Validate provider
 * 2. Gọi Supabase OAuth để lấy redirect URL
 * 3. Mở popup window dùng chrome.identity.launchWebAuthFlow()
 * 4. Parse tokens từ callback URL hash fragment
 * 5. Sync token về legacy keys (auth_token, refresh_token, expires_at)
 * 6. Fetch profile từ Supabase
 * 7. Broadcast AUTH_STATE_CHANGED để sidebar refresh
 */
export async function handleSocialLogin({ provider } = {}) {
    // STEP 1: Validate provider
    const SUPPORTED_PROVIDERS = ['google', 'facebook'];
    if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
        return { success: false, error: `Provider không hợp lệ: ${provider}. Chỉ hỗ trợ google, facebook.` };
    }

    log(`[Fitly] SOCIAL_LOGIN handler: ${provider}`);

    try {
        // STEP 2: Build OAuth URL cho Supabase authorize endpoint
        const extensionId = chrome.runtime.id;
        const redirectTo = `https://${extensionId}.chromiumapp.org/`;

        // URL trực tiếp đến Supabase authorize - launchWebAuthFlow sẽ tự follow redirects
        const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}&access_type=offline&prompt=consent`;

        log(`[Fitly] OAuth URL: ${authUrl}`);
        log(`[Fitly] Redirect to: ${redirectTo}`);

        // STEP 3: Sử dụng chrome.identity.launchWebAuthFlow()
        // API này xử lý chính xác domain .chromiumapp.org và capture redirect URL
        const resultUrl = await new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow(
                {
                    url: authUrl,
                    interactive: true
                },
                (callbackUrl) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(callbackUrl);
                }
            );
        });

        if (!resultUrl) {
            return { success: false, error: 'Không nhận được phản hồi từ Google.' };
        }

        log('[Fitly] OAuth callback URL received:', resultUrl.substring(0, 100) + '...');

        // STEP 4: Parse tokens từ URL hash fragment
        // Supabase redirect URL format: https://<ext>.chromiumapp.org/#access_token=...&refresh_token=...&...
        const session = parseSessionFromUrl(resultUrl);

        if (!session || !session.access_token) {
            console.error('[Fitly] Could not parse session from URL:', resultUrl);
            return { success: false, error: 'Không thể lấy session từ phản hồi đăng nhập.' };
        }

        // STEP 5: Build session object cho finalizeSocialLoginSession
        // NOTE: KHÔNG ghi fitly-auth-token trực tiếp — Supabase client là single writer
        // qua ChromeStorageAdapter. finalizeSocialLoginSession() → setSession() xử lý.
        const sessionForStorage = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            token_type: session.token_type || 'bearer',
            expires_in: parseInt(session.expires_in) || 3600,
            expires_at: session.expires_at
                ? parseInt(session.expires_at)
                : Math.floor(Date.now() / 1000) + (parseInt(session.expires_in) || 3600),
            user: null, // Sẽ được fetch sau
        };

        // STEP 6: Fetch user info từ Supabase bằng access_token
        try {
            const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': SUPABASE_AUTH_KEY,
                },
            });
            if (userResponse.ok) {
                const userData = await userResponse.json();
                sessionForStorage.user = userData;
            }
        } catch (userErr) {
            console.warn('[Fitly] Could not fetch user info:', userErr);
        }

        // STEP 7: Finalize: sync legacy keys, fetch profile, notify sidebar
        return await finalizeSocialLoginSession(sessionForStorage);

    } catch (error) {
        console.error(`[Fitly] handleSocialLogin error (${provider}):`, error);

        // Map các lỗi phổ biến từ launchWebAuthFlow
        if (error.message?.includes('User cancelled') || error.message?.includes('user denied') || error.message?.includes('The user did not approve')) {
            return { success: false, error: 'Bạn đã hủy đăng nhập.' };
        }
        if (error.message?.includes('Authorization page could not be loaded')) {
            return { success: false, error: 'Không thể tải trang đăng nhập. Vui lòng kiểm tra internet.' };
        }

        return { success: false, error: `Không thể kết nối đến ${provider}. Vui lòng thử lại.` };
    }
}
