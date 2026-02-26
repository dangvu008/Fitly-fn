/**
 * File: auth_email.js
 * Purpose: Xử lý đăng nhập và đăng ký qua email + password (Supabase REST API)
 * Layer: Application / Feature
 *
 * Data Contract:
 * - Exports: handleEmailLogin, handleEmailRegister
 *
 * Dependencies:
 * - fetchProfileFromSupabase (from auth_handlers.js)
 * - getT (from i18n_manager.js)
 * - SUPABASE_URL, SUPABASE_AUTH_KEY (from ENVIRONMENT_CONFIG.js)
 */

import { getT } from './i18n_manager.js';
import { SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';
import { log } from './debug_logger.js';
import { fetchProfileFromSupabase } from './auth_handlers.js';
import { supabase } from '../extension/config.js';

/**
 * checkEmailOAuthProvider - Đoán OAuth provider dựa trên email domain
 *
 * Input: email string
 * Output: tên provider ('Google', 'Facebook') hoặc null
 *
 * Note: Không thể query auth.identities bằng anon key (RLS chặn),
 * nên dùng heuristic đơn giản. Khi function này được gọi,
 * nghĩa là email ĐÃ TỒN TẠI trong hệ thống (identities=[] hoặc already registered).
 */
async function checkEmailOAuthProvider(email) {
    if (!email) return null;
    const lowerEmail = email.toLowerCase();

    // Gmail domain → rất có thể đã đăng nhập Google OAuth
    if (lowerEmail.endsWith('@gmail.com') || lowerEmail.endsWith('@googlemail.com')) {
        return 'Google';
    }

    // Không xác định được provider cụ thể, nhưng email đã tồn tại
    // → trả null để hiện thông báo generic
    return null;
}

/**
 * handleEmailLogin - Đăng nhập bằng email + password qua Supabase REST API
 * Input: { email, password }
 * Output: { success, user, profile } hoặc { success: false, error }
 */
export async function handleEmailLogin({ email, password } = {}) {
    console.log('[DEBUG-BG-EMAIL-LOGIN] ========== handleEmailLogin START ==========');
    console.log('[DEBUG-BG-EMAIL-LOGIN] Timestamp:', new Date().toISOString());
    console.log('[DEBUG-BG-EMAIL-LOGIN] email:', email);
    try {
        // STEP 1: Validate input
        if (!email || !password) {
            console.log('[DEBUG-BG-EMAIL-LOGIN] Validation failed: missing email or password');
            return { success: false, error: await getT('enter_email_password') };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[DEBUG-BG-EMAIL-LOGIN] Validation failed: invalid email format');
            return { success: false, error: await getT('invalid_email') };
        }

        // STEP 2: Gọi Supabase Auth REST API
        console.log('[DEBUG-BG-EMAIL-LOGIN] Calling Supabase Auth REST API...');
        const apiStart = Date.now();
        const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_AUTH_KEY,
            },
            body: JSON.stringify({ email, password }),
        });
        const apiTime = Date.now() - apiStart;
        console.log('[DEBUG-BG-EMAIL-LOGIN] API response in', apiTime, 'ms | status:', response.status);

        const data = await response.json();

        // STEP 3: Handle errors
        if (!response.ok || data.error) {
            const errMsg = data.error_description || data.msg || data.error || 'Đăng nhập thất bại.';
            const errCode = data.error_code || data.code || '';
            console.error('[DEBUG-BG-EMAIL-LOGIN] ❌ Login failed:', { errCode, errMsg, status: response.status });
            // Map lỗi Supabase sang tiếng Việt
            if (errMsg.includes('Invalid login credentials') || errCode === 'invalid_credentials') {
                const oauthHint = await checkEmailOAuthProvider(email);
                if (oauthHint) {
                    return { success: false, error: await getT('email_exists_oauth', { provider: oauthHint }) };
                }
                return { success: false, error: await getT('wrong_email_password') };
            }
            if (errMsg.includes('Email not confirmed') || errCode === 'email_not_confirmed') {
                return { success: false, error: await getT('confirm_email_first') };
            }
            if (errCode === 'email_address_invalid' || errMsg.includes('is invalid')) {
                return { success: false, error: await getT('invalid_email_format') };
            }
            if (errCode === 'over_request_rate_limit' || errMsg.includes('Too many requests')) {
                return { success: false, error: await getT('rate_limit_error') };
            }
            return { success: false, error: errMsg };
        }

        // STEP 4: Lưu user data (non-auth) vào chrome.storage.local
        // NOTE: KHÔNG ghi fitly-auth-token trực tiếp — Supabase client là single writer
        // qua ChromeStorageAdapter. Manual write gây dual-write conflict → session corrupt khi SW restart.
        const expiresAtMs = data.expires_at ? data.expires_at * 1000 : Date.now() + 3600000;
        const ttl = Math.floor((expiresAtMs - Date.now()) / 1000);
        console.log('[DEBUG-BG-EMAIL-LOGIN] ✅ Login success! user:', data.user?.id, '| TTL:', ttl, 's');
        await chrome.storage.local.set({ user: data.user });
        console.log('[DEBUG-BG-EMAIL-LOGIN] User data saved');

        // STEP 4b: Đồng bộ session vào Supabase client in-memory state.
        // CRITICAL: Nếu không gọi setSession(), Supabase client sẽ không biết về session mới.
        // Mọi lần gọi refreshSession() tiếp theo sẽ fail với "Auth session missing!"
        console.log('[DEBUG-BG-EMAIL-LOGIN] Calling supabase.auth.setSession()...');
        try {
            const { error: setErr } = await supabase.auth.setSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
            });
            if (setErr) {
                console.warn('[DEBUG-BG-EMAIL-LOGIN] setSession warning:', setErr.message);
            } else {
                console.log('[DEBUG-BG-EMAIL-LOGIN] ✅ Supabase client session set successfully');
            }
        } catch (setErr) {
            console.warn('[DEBUG-BG-EMAIL-LOGIN] setSession exception (non-fatal):', setErr.message);
        }

        // STEP 5: Đồng bộ profile
        console.log('[DEBUG-BG-EMAIL-LOGIN] Fetching profile from Supabase...');
        const profileData = await fetchProfileFromSupabase(data.access_token);
        console.log('[DEBUG-BG-EMAIL-LOGIN] Profile result:', profileData ? 'GOT PROFILE' : 'NO PROFILE');
        console.log('[DEBUG-BG-EMAIL-LOGIN] gems_balance:', profileData?.profile?.gems_balance || 0);

        log('[Fitly] Email login success:', data.user?.email);
        console.log('[DEBUG-BG-EMAIL-LOGIN] ========== handleEmailLogin END (success) ==========');
        return {
            success: true,
            authenticated: true,
            user: data.user,
            profile: profileData?.profile || { email: data.user?.email, gems_balance: 0 },
            gemsBalance: profileData?.profile?.gems_balance || 0,
        };
    } catch (error) {
        console.error('[DEBUG-BG-EMAIL-LOGIN] ❌ Exception:', error.message);
        console.error('[DEBUG-BG-EMAIL-LOGIN] Stack:', error.stack);
        console.log('[DEBUG-BG-EMAIL-LOGIN] ========== handleEmailLogin END (error) ==========');
        return { success: false, error: await getT('auth_network_error') };
    }
}

/**
 * handleEmailRegister - Đăng ký tài khoản mới qua Supabase REST API
 * Input: { email, password, fullName }
 * Output: { success, needsVerification } hoặc { success: false, error }
 */
export async function handleEmailRegister({ email, password, fullName } = {}) {
    try {
        // STEP 1: Validate input
        if (!email || !password) {
            return { success: false, error: await getT('enter_email_password') };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { success: false, error: await getT('invalid_email_format') };
        }

        if (password.length < 6) {
            return { success: false, error: await getT('password_too_short') };
        }

        // STEP 2: Gọi Supabase Auth REST API signup
        const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_AUTH_KEY,
            },
            body: JSON.stringify({
                email,
                password,
                data: { full_name: fullName || '' },
            }),
        });

        const data = await response.json();

        // STEP 3: Handle errors
        if (!response.ok || data.error) {
            const errMsg = data.error_description || data.msg || data.error || 'Đăng ký thất bại.';
            const errCode = data.error_code || data.code || '';

            // Map error codes/messages sang tiếng Việt thân thiện
            if (errCode === 'email_address_invalid' || errMsg.includes('is invalid')) {
                return { success: false, error: await getT('invalid_email_format') };
            }
            if (errMsg.includes('User already registered') || errMsg.includes('already been registered')) {
                const oauthHint = await checkEmailOAuthProvider(email);
                if (oauthHint) {
                    return { success: false, error: await getT('email_exists_oauth', { provider: oauthHint }) };
                }
                return { success: false, error: await getT('email_exists_login') };
            }
            if (errMsg.includes('Password should be at least') || errCode === 'weak_password') {
                return { success: false, error: await getT('password_too_short') };
            }
            if (errCode === 'over_email_send_rate_limit') {
                // User có thể đã được tạo nhưng email xác nhận không gửi được
                // → Thử đăng nhập trực tiếp luôn (auto-confirm workaround)
                console.warn('[Fitly] Email rate limit hit, attempting direct login as fallback...');
                try {
                    const loginResult = await handleEmailLogin({ email, password });
                    if (loginResult?.success) {
                        log('[Fitly] Fallback login after rate limit succeeded');
                        return loginResult;
                    }
                } catch (loginErr) {
                    console.warn('[Fitly] Fallback login failed:', loginErr);
                }
                return { success: false, error: await getT('system_busy') };
            }
            if (errCode === 'over_request_rate_limit' || errMsg.includes('Too many requests')) {
                return { success: false, error: await getT('system_busy') };
            }
            if (errCode === 'validation_failed') {
                return { success: false, error: await getT('invalid_register_info') };
            }

            console.error('[Fitly] Register API error:', { errCode, errMsg, status: response.status });
            return { success: false, error: errMsg };
        }

        // STEP 4: Kiểm tra xem cần xác nhận email không
        // Supabase trả về identities=[] nếu email đã tồn tại (ví dụ đã login Google)
        if (data.identities && data.identities.length === 0) {
            const oauthHint = await checkEmailOAuthProvider(email);
            if (oauthHint) {
                return { success: false, error: await getT('email_exists_oauth', { provider: oauthHint }) };
            }
            return { success: false, error: await getT('email_exists_login') };
        }

        // STEP 5: Nếu có access_token → Supabase auto-confirm đã bật → đăng nhập luôn
        if (data.access_token) {
            // Lưu user data only — Supabase client quản lý fitly-auth-token qua setSession()
            await chrome.storage.local.set({ user: data.user });
            // Sync session vào Supabase client để refresh hoạt động đúng
            try {
                await supabase.auth.setSession({
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                });
            } catch (_) { /* non-fatal */ }

            const profileData = await fetchProfileFromSupabase(data.access_token);
            log('[Fitly] Email register auto-confirmed, logged in:', email);
            return {
                success: true,
                needsVerification: false,
                email,
                authenticated: true,
                user: data.user,
                profile: profileData?.profile || { email: data.user?.email, gems_balance: 100 },
                gemsBalance: profileData?.profile?.gems_balance || 100,
            };
        }

        const needsVerification = !data.user?.email_confirmed_at;

        log('[Fitly] Email register success:', email, '| needsVerification:', needsVerification);

        // STEP 6: Nếu Supabase không yêu cầu xác nhận email (auto-confirm ON), lưu user data
        if (!needsVerification && data.access_token) {
            await chrome.storage.local.set({ user: data.user });
        }

        return {
            success: true,
            needsVerification,
            email,
        };
    } catch (error) {
        console.error('[Fitly] handleEmailRegister error:', error);
        return { success: false, error: await getT('auth_network_error') };
    }
}
