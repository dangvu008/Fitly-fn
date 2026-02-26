/**
 * File: auth_handlers.js
 * Purpose: Xử lý đăng nhập, đăng xuất, lưu trữ token, và refresh token
 * Layer: Application / Feature
 * * Data Contract:
 * - Exports: handleStoreAuthToken, handleGoogleSignIn, handleAuthSuccess, handleLogout, proactiveTokenRefresh, startProactiveRefreshTimer, stopProactiveRefreshTimer
 */

import { updateCachedAuthState, refreshAuthToken } from './auth_state_manager.js';
import { getT } from './i18n_manager.js';
import { demoState, MOCK_WARDROBE, MOCK_OUTFITS, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';
import { startAutoSync, stopAutoSync, syncFromCloud } from './cloud_sync.js';
import { getAuthToken } from './auth_state_manager.js';
import { supabase } from '../extension/config.js';
import { log } from './debug_logger.js';


export async function fetchProfileFromSupabase(accessToken) {
    try {
        const tokenData = await chrome.storage.local.get('user');
        const userId = tokenData.user?.id;

        if (!userId) return null;

        const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'apikey': SUPABASE_AUTH_KEY,
            }
        });

        if (response.ok) {
            const data = await response.json();
            return { profile: data[0] };
        }
    } catch (error) {
        console.error('[auth_handlers] fetchProfileFromSupabase error:', error);
    }
    return null;
}

export async function handleStoreAuthToken(payload) {
    if (payload.authenticated) {
        // STEP 1: Set session in Supabase client (single source of truth)
        if (payload.access_token && payload.refresh_token) {
            try {
                await supabase.auth.setSession({
                    access_token: payload.access_token,
                    refresh_token: payload.refresh_token,
                });
            } catch (e) {
                console.warn('[handleStoreAuthToken] setSession failed:', e.message);
            }
        }

        // STEP 2: Store user info (non-auth data)
        await chrome.storage.local.set({
            user: payload.user,
            cached_user: payload.user,
        });

        await chrome.storage.local.remove(['guest_mode', 'guest_gems_balance']);
        await updateCachedAuthState();

        try {
            const profileData = await fetchProfileFromSupabase(payload.access_token);
            if (profileData?.profile) {
                await chrome.storage.local.set({ cached_profile: profileData.profile });
                demoState.gemsBalance = profileData.profile.gems_balance || 0;
            }
        } catch (error) {
            console.warn('[Fitly] Could not fetch profile:', error.message);
        }

        startAutoSync();

        chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', authenticated: true })
            .catch(() => { });

        return { success: true };
    } else {
        return await handleLogout();
    }
}

export async function handleGoogleSignIn() {
    console.log('[DEBUG-AUTH-LOGIN] handleGoogleSignIn called');
    try {
        const redirectUrl = chrome.identity.getRedirectURL();

        const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
            `&redirect_to=${encodeURIComponent(redirectUrl)}` +
            `&access_type=offline` +
            `&prompt=consent` +
            `&query_params=${encodeURIComponent('access_type=offline&prompt=consent')}`;

        const responseUrl = await new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow(
                { url: oauthUrl, interactive: true },
                (callbackUrl) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (!callbackUrl) {
                        reject(new Error('Không nhận được callback URL'));
                    } else {
                        resolve(callbackUrl);
                    }
                }
            );
        });

        const urlObj = new URL(responseUrl);
        const hashParams = new URLSearchParams(urlObj.hash.replace('#', ''));
        const queryParams = new URLSearchParams(urlObj.search);

        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
        const expiresIn = parseInt(hashParams.get('expires_in') || queryParams.get('expires_in') || '3600');
        console.log('[DEBUG-AUTH-LOGIN] OAuth callback parsed:');
        console.log('[DEBUG-AUTH-LOGIN]   accessToken:', accessToken ? `exists (${accessToken.substring(0, 30)}...)` : 'NULL');
        console.log('[DEBUG-AUTH-LOGIN]   refreshToken:', refreshToken ? `exists (${refreshToken.substring(0, 20)}...)` : '⚠️ NULL — THIẾU REFRESH TOKEN!');
        console.log('[DEBUG-AUTH-LOGIN]   expiresIn:', expiresIn, 's');

        if (!accessToken) {
            const code = hashParams.get('code') || queryParams.get('code');
            if (code) {
                const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_AUTH_KEY,
                    },
                    body: JSON.stringify({ auth_code: code, redirect_to: redirectUrl })
                });
                if (!resp.ok) {
                    const errText = await resp.text();
                    throw new Error(`Token exchange failed: ${errText}`);
                }
                const sessionData = await resp.json();
                if (sessionData.access_token) {
                    await _saveOAuthSession(sessionData, SUPABASE_URL, SUPABASE_AUTH_KEY);
                    return { success: true };
                }
            }
            throw new Error('Không tìm thấy access_token trong OAuth response');
        }

        const expiresAt = (Date.now() / 1000 + expiresIn) * 1000;
        console.log('[DEBUG-AUTH-LOGIN] Saving token to storage...');
        console.log('[DEBUG-AUTH-LOGIN]   expiresAt:', expiresAt, '| TTL:', expiresIn, 's');
        console.log('[DEBUG-AUTH-LOGIN]   refresh_token being saved:', refreshToken ? 'YES' : '❌ NO — sẽ ko refresh được sau này!');

        // GUARD: OAuth có thể không trả refresh_token (khi prompt=consent fail)
        if (!refreshToken) {
            console.warn('[DEBUG-AUTH-LOGIN] ⚠️ Missing refresh_token from OAuth!');
            // Fallback: check existing session
            try {
                const { data: { session: existingSession } } = await supabase.auth.getSession();
                if (existingSession?.refresh_token) {
                    refreshToken = existingSession.refresh_token;
                    console.log('[DEBUG-AUTH-LOGIN] ✅ Got refresh_token from existing Supabase session');
                }
            } catch (e) {
                console.warn('[DEBUG-AUTH-LOGIN] Supabase session fallback failed:', e.message);
            }
            if (!refreshToken) {
                console.error('[DEBUG-AUTH-LOGIN] ❌ CRITICAL: No refresh_token available!');
            }
        }

        // CRITICAL: Sync OAuth tokens INTO Supabase client — single source of truth
        try {
            const { error: setErr } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });
            if (setErr) {
                console.warn('[DEBUG-AUTH-LOGIN] supabase.auth.setSession error:', setErr.message);
            } else {
                console.log('[DEBUG-AUTH-LOGIN] ✅ Synced OAuth tokens into Supabase client');
            }
        } catch (e) {
            console.warn('[DEBUG-AUTH-LOGIN] setSession exception:', e.message);
        }

        // Store non-auth user data only
        const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'apikey': SUPABASE_AUTH_KEY,
            }
        });
        if (userResp.ok) {
            const userData = await userResp.json();
            await chrome.storage.local.set({ user: userData });
        }

        await updateCachedAuthState();
        startAutoSync();

        setTimeout(() => syncFromCloud(), 1000);

        chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', authenticated: true })
            .catch(() => { });

        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'AUTH_STATE_CHANGED', authenticated: true }).catch(() => { });
            });
        });

        return { success: true };

    } catch (error) {
        console.error('[Fitly] Google Sign In exception:', error);
        if (error.message?.includes('canceled') || error.message?.includes('closed')) {
            return { success: false, error: 'Bạn đã đóng cửa sổ đăng nhập' };
        }
        return {
            success: false,
            error: 'Đã xảy ra lỗi khi đăng nhập với Google: ' + error.message
        };
    }
}

async function _saveOAuthSession(sessionData, supabaseUrl, anonKey) {
    // Set session in Supabase client (single source of truth)
    if (sessionData.access_token && sessionData.refresh_token) {
        try {
            await supabase.auth.setSession({
                access_token: sessionData.access_token,
                refresh_token: sessionData.refresh_token,
            });
        } catch (e) {
            console.warn('[_saveOAuthSession] setSession failed:', e.message);
        }
    }

    // Fetch and cache user info for non-auth purposes
    if (!sessionData.user && sessionData.access_token) {
        try {
            const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
                headers: {
                    'Authorization': `Bearer ${sessionData.access_token}`,
                    'apikey': anonKey,
                }
            });
            if (r.ok) {
                const u = await r.json();
                await chrome.storage.local.set({ user: u });
            }
        } catch (fetchErr) {
            console.warn('[_saveOAuthSession] Could not fetch user info:', fetchErr.message);
        }
    } else if (sessionData.user) {
        await chrome.storage.local.set({ user: sessionData.user });
    }
}

export async function handleAuthSuccess(session) {
    console.log('[DEBUG-AUTH-LOGIN] handleAuthSuccess called');
    log('[Fitly] Auth success received from popup');

    if (!session || !session.access_token) {
        console.error('[Fitly] Invalid session data');
        return { success: false, error: 'Invalid session' };
    }

    try {
        // STEP 1: Sync session INTO Supabase client — single source of truth
        try {
            await supabase.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
            });
            console.log('[DEBUG-AUTH-LOGIN] ✅ Synced session into Supabase client');
        } catch (e) {
            console.warn('[DEBUG-AUTH-LOGIN] setSession failed (non-blocking):', e.message);
        }

        // STEP 2: Store non-auth user data
        await chrome.storage.local.set({
            user: session.user,
            cached_user: session.user,
        });

        await updateCachedAuthState();

        try {
            const profileData = await fetchProfileFromSupabase(session.access_token);
            if (profileData?.profile) {
                await chrome.storage.local.set({ cached_profile: profileData.profile });
                demoState.gemsBalance = profileData.profile.gems_balance || 0;
            }
        } catch (profileErr) {
            console.warn('[handleAuthSuccess] Profile fetch failed (non-blocking):', profileErr.message);
        }

        startAutoSync();

        setTimeout(() => syncFromCloud(), 1000);

        chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', authenticated: true })
            .catch(() => { });

        return { success: true };
    } catch (error) {
        console.error('[Fitly] Auth success handling error:', error);
        return { success: false, error: error.message };
    }
}

export async function handleLogout() {
    stopProactiveRefreshTimer();

    // Get current token from Supabase BEFORE clearing
    let currentToken = null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        currentToken = session?.access_token;
    } catch (_) { }

    // Sign out from Supabase client (clears ChromeStorageAdapter)
    try {
        await supabase.auth.signOut();
    } catch (e) {
        console.warn('[handleLogout] signOut error:', e.message);
    }

    // Clean up all auth-related + cached data from chrome.storage
    const allData = await chrome.storage.local.get(null);
    const supabaseKeys = Object.keys(allData).filter(k => k.startsWith('sb-'));

    await chrome.storage.local.remove([
        // Legacy keys (may still exist from old versions)
        'auth_token',
        'refresh_token',
        'expires_at',
        'fitly_auth_session',
        'fitly_auth_user',
        // Supabase native key
        'fitly-auth-token',
        // User data
        'user',
        'cached_user',
        'cached_profile',
        'demo_wardrobe',
        'recent_clothing',
        'user_models',
        'default_model_id',
        'model_image',
        ...supabaseKeys,
    ]);

    // Revoke server-side session (requires Bearer token)
    try {
        const headers = { 'apikey': SUPABASE_AUTH_KEY };
        if (currentToken) {
            headers['Authorization'] = `Bearer ${currentToken}`;
        }
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers,
        });
    } catch (logoutErr) {
        console.warn('[handleLogout] Server-side logout failed (non-blocking):', logoutErr.message);
    }

    Object.assign(demoState, {
        gemsBalance: 50,
        wardrobe: [...MOCK_WARDROBE],
        outfits: [...MOCK_OUTFITS],
        modelImage: null,
        recentClothing: [],
        userModels: [],
        defaultModelId: null,
    });

    stopAutoSync();

    // Broadcast logout to all extension pages (sidebar, popup) and content scripts
    chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', authenticated: false })
        .catch(() => { });
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'AUTH_STATE_CHANGED', authenticated: false }).catch(() => { });
        });
    });

    return { success: true };
}

// DISABLED: Alarm-based proactive refresh không cần thiết trong SW ephemeral context.
// autoRefreshToken đã tắt (config.js), manual forceRefreshToken() được gọi trước mỗi expensive op.
// Giữ function stubs để tránh break callers (handleLogout, etc.).
export async function proactiveTokenRefresh() { /* no-op */ }
export function startProactiveRefreshTimer() { /* no-op */ }
export function stopProactiveRefreshTimer() { /* no-op */ }

// Re-export from extracted modules for backward compatibility
export { handleEmailLogin, handleEmailRegister } from './auth_email.js';
export { handleSocialLogin } from './auth_social.js';


export async function handleGetAuthState() {
    try {
        // Use Supabase client directly — single source of truth
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session?.access_token || !session?.user) {
            // No valid session OR missing user data → not authenticated
            // Check guest mode
            const guestData = await chrome.storage.local.get('guest_mode');
            if (guestData.guest_mode) {
                const gemsData = await chrome.storage.local.get('guest_gems_balance');
                return {
                    authenticated: false,
                    guestMode: true,
                    profile: { gems_balance: gemsData.guest_gems_balance ?? 3 }
                };
            }

            return { authenticated: false };
        }

        // Session valid → clear guest mode, fetch profile
        await chrome.storage.local.remove(['guest_mode', 'guest_gems_balance']);
        await chrome.storage.local.set({ user: session.user });

        const profileData = await fetchProfileFromSupabase(session.access_token);
        if (profileData) {
            startAutoSync();
            return { success: true, authenticated: true, ...profileData };
        }

        return {
            success: true,
            authenticated: true,
            user: session.user,
            profile: { email: session.user?.email || '', gems_balance: 0 }
        };

    } catch (error) {
        console.error('[Fitly] Auth check failed:', error);

        // Code crash (TypeError, ReferenceError) → KHÔNG tin cache, trả false
        // Chỉ trust cache cho lỗi network/offline thật sự
        if (error instanceof TypeError || error instanceof ReferenceError) {
            console.warn('[Fitly] Auth check crashed (code error), returning unauthenticated');
            return { authenticated: false };
        }

        // Offline fallback — cached data only
        const cached = await chrome.storage.local.get(['cached_user', 'cached_profile']);
        if (cached.cached_user) {
            return { success: true, authenticated: true, user: cached.cached_user, profile: cached.cached_profile, offline: true };
        }

        return { authenticated: false };
    }
}



// Enable guest mode - allows using extension without authentication with limited features
export async function handleEnableGuestMode() {
    try {
        // Set guest mode flag
        await chrome.storage.local.set({ guest_mode: true });

        // Initialize guest gems balance
        const GUEST_FREE_GEMS = 3;
        demoState.gemsBalance = GUEST_FREE_GEMS;
        await chrome.storage.local.set({ guest_gems_balance: GUEST_FREE_GEMS });

        log('[Fitly] Guest mode enabled with', GUEST_FREE_GEMS, 'free gems');

        return {
            success: true,
            gemsBalance: GUEST_FREE_GEMS,
            message: 'Guest mode enabled'
        };
    } catch (error) {
        console.error('Enable guest mode failed:', error);
        return { success: false, error: error.message };
    }
}

// Check if guest mode is enabled
export async function isGuestMode() {
    const data = await chrome.storage.local.get('guest_mode');
    return data.guest_mode === true;
}
