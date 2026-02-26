/**
 * File: auth_state_manager.js
 * Purpose: Quản lý trạng thái xác thực — Supabase client là SINGLE SOURCE OF TRUTH
 * Layer: Infrastructure (Auth)
 *
 * ARCHITECTURE NOTE (v4 — SW-Safe Auth):
 * - Supabase client (config.js) là nguồn duy nhất cho token.
 * - autoRefreshToken: FALSE — SW ephemeral, timer bị mất khi Chrome kills SW.
 *   Nếu SW bị kill giữa chừng auto-refresh → token family bị revoke → session wipe.
 * - Manual refresh CHỈ khi cần: forceRefreshToken() trước expensive ops.
 * - Storage rescue fallback: khi refreshSession() fail "Auth session missing",
 *   đọc session trực tiếp từ chrome.storage.local → setSession() → retry.
 * - Legacy keys (auth_token, refresh_token, expires_at) ĐÃ BỊ LOẠI BỎ.
 * - Tất cả module đọc token qua getAuthToken() → supabase.auth.getSession().
 *
 * Data Contract:
 * - Exports: isDemoMode, isDemoModeSync, isGuestMode, getAuthToken,
 *   updateCachedAuthState, checkAndRefreshToken, makeAuthenticatedRequest,
 *   forceRefreshToken, refreshAuthToken, restoreSupabaseSession
 */

import { supabase } from '../extension/config.js';
import { DEMO_MODE_OVERRIDE } from './ENVIRONMENT_CONFIG.js';

let _cachedAuthState = null;

// Refresh mutex — prevents concurrent refresh calls from racing
let _refreshPromise = null;

// Clock skew tolerance: accept tokens that appear "expired" by up to 60s.
// Handles cases where system clock is slightly ahead of server time.
const CLOCK_SKEW_TOLERANCE_S = 60;

/**
 * restoreSupabaseSession() — Đảm bảo Supabase client có session khi SW restart.
 *
 * Với autoRefreshToken: true và ChromeStorageAdapter, Supabase client
 * TỰ ĐỘNG restore session từ storage khi getSession() được gọi.
 * Function này chỉ verify và log.
 */
export async function restoreSupabaseSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.warn('[restoreSupabaseSession] ⚠️ getSession error:', error.message);
            return false;
        }

        if (session?.access_token) {
            const ttl = session.expires_at
                ? Math.floor((session.expires_at * 1000 - Date.now()) / 1000)
                : 'N/A';
            console.log('[restoreSupabaseSession] ✅ Session found, TTL:', ttl, 's');
            return true;
        }

        console.log('[restoreSupabaseSession] No session found — user not logged in');
        return false;
    } catch (err) {
        console.error('[restoreSupabaseSession] ❌ Exception:', err.message);
        return false;
    }
}


export async function isDemoMode() {
    if (DEMO_MODE_OVERRIDE) return true;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
            if (expiresAtMs > Date.now()) return false;

            // Token expired → try refresh
            const refreshed = await getAuthToken();
            if (refreshed) return false;
        }
    } catch (error) {
        console.warn('[Fitly] Error checking auth state:', error);
    }

    return true;
}

export function isDemoModeSync() {
    if (DEMO_MODE_OVERRIDE) return true;
    return _cachedAuthState === null ? true : !_cachedAuthState;
}

/**
 * isGuestMode: Trả về true nếu user THỰC SỰ chưa đăng nhập (không có auth token),
 * và DEMO_MODE_OVERRIDE = false.
 */
export async function isGuestMode() {
    if (DEMO_MODE_OVERRIDE) return false;
    const token = await getAuthToken();
    return !token;
}

export async function updateCachedAuthState() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        _cachedAuthState = !!(session?.access_token);
    } catch (error) {
        _cachedAuthState = false;
    }
}

/**
 * getAuthToken() — Lấy access token từ Supabase client.
 * Supabase client tự handle refresh qua autoRefreshToken: true.
 * Includes CLOCK_SKEW_TOLERANCE_S to handle system clock ahead of server.
 */
export async function getAuthToken() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.warn('[getAuthToken] getSession error:', error.message);
            return null;
        }

        if (!session?.access_token) {
            return null;
        }

        const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
        const ttl = Math.floor((expiresAtMs - Date.now()) / 1000);

        // Token expiring within tolerance window OR already expired → proactive refresh
        // This prevents sending nearly-expired tokens that the server will reject
        if (ttl <= CLOCK_SKEW_TOLERANCE_S) {
            console.log('[getAuthToken] Token near expiry or expired (TTL:', ttl, 's), attempting refresh...');
            const freshToken = await refreshAuthToken();
            if (freshToken) {
                return freshToken;
            }
            // Refresh failed — if token is not yet expired, return it as last resort
            if (ttl > 0) {
                console.warn('[getAuthToken] Refresh failed, returning current token (TTL:', ttl, 's)');
                return session.access_token;
            }
            // Token expired AND refresh failed → return null
            console.error('[getAuthToken] Token expired and refresh failed');
            return null;
        }

        return session.access_token;
    } catch (err) {
        console.error('[getAuthToken] Exception:', err.message);
        return null;
    }
}

/**
 * refreshAuthToken() — Refresh qua supabase.auth.refreshSession().
 * Mutex pattern tránh concurrent refresh race.
 */
export async function refreshAuthToken(_refreshToken) {
    // STEP 1: If a refresh is already in-flight, wait for it
    if (_refreshPromise) {
        try {
            return await _refreshPromise;
        } catch {
            return null;
        }
    }

    // STEP 2: Acquire mutex
    _refreshPromise = _doRefresh();
    try {
        return await _refreshPromise;
    } finally {
        _refreshPromise = null;
    }
}

/**
 * Core refresh logic — supabase.auth.refreshSession() with storage rescue fallback.
 *
 * Khi SW bị kill giữa chừng auto-refresh, token family có thể bị revoke.
 * Supabase client wipe session khỏi memory → refreshSession() fail "Auth session missing".
 * Fallback: đọc session trực tiếp từ chrome.storage.local → setSession() → retry.
 */
async function _doRefresh() {
    // ATTEMPT 1: Normal Supabase refresh
    try {
        const { data, error } = await supabase.auth.refreshSession();

        if (!error && data.session?.access_token) {
            const ttl = data.session.expires_at
                ? Math.floor((data.session.expires_at * 1000 - Date.now()) / 1000)
                : 'N/A';
            console.log('[_doRefresh] ✅ Refreshed, new TTL:', ttl, 's');
            return data.session.access_token;
        }

        console.warn('[_doRefresh] ⚠️ Primary refresh failed:', error?.message);
    } catch (primaryErr) {
        console.error('[_doRefresh] ❌ Primary refresh exception:', primaryErr);
    }

    // ATTEMPT 2: Storage rescue — session may exist in storage but not in memory
    // This happens when SW restarts or when Supabase internally wipes in-memory session
    try {
        const stored = await chrome.storage.local.get('fitly-auth-token');
        const raw = stored['fitly-auth-token'];
        if (!raw) {
            console.warn('[_doRefresh] ❌ No session in storage — user needs to re-login');
            return null;
        }

        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed?.refresh_token) {
            console.warn('[_doRefresh] ❌ Session in storage has no refresh_token');
            return null;
        }

        console.log('[_doRefresh] 🔄 Rescue: restoring session from chrome.storage.local...');
        const { error: setErr } = await supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
        });

        if (setErr) {
            console.error('[_doRefresh] ❌ setSession rescue failed:', setErr.message);
            return null;
        }

        // Retry refresh with restored session
        const { data: retryData, error: retryErr } = await supabase.auth.refreshSession();
        if (!retryErr && retryData.session?.access_token) {
            const ttl = retryData.session.expires_at
                ? Math.floor((retryData.session.expires_at * 1000 - Date.now()) / 1000)
                : 'N/A';
            console.log('[_doRefresh] ✅ Rescue refresh succeeded! New TTL:', ttl, 's');
            return retryData.session.access_token;
        }

        console.error('[_doRefresh] ❌ Rescue refresh also failed:', retryErr?.message);
    } catch (rescueErr) {
        console.error('[_doRefresh] ❌ Rescue exception:', rescueErr);
    }

    return null;
}

/**
 * forceRefreshToken() — Force refresh trước expensive operations.
 * Nếu TTL >= 15 phút → trả token hiện tại (đủ fresh).
 * @param {boolean} bypassTTL - Nếu true, BỎ QUA TTL check và force refresh luôn (dùng khi call API bị 401/403)
 */
export async function forceRefreshToken(bypassTTL = false) {
    if (!bypassTTL) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
                const ttl = Math.floor((expiresAtMs - Date.now()) / 1000);

                // TTL >= 15 min → no need to refresh
                if (ttl >= 900) {
                    return session.access_token;
                }
            }
        } catch (e) {
            console.warn('[forceRefreshToken] getSession error:', e.message);
        }
    }

    // TTL < 15 min or no session → force refresh
    const freshToken = await refreshAuthToken();
    if (freshToken) return freshToken;

    // Refresh failed — try fallback to current token if still valid (with clock skew tolerance)
    try {
        const { data: { session: fallbackSession } } = await supabase.auth.getSession();
        if (fallbackSession?.access_token) {
            const fallbackTTL = fallbackSession.expires_at
                ? Math.floor((fallbackSession.expires_at * 1000 - Date.now()) / 1000)
                : 0;
            if (fallbackTTL > 0) {
                console.warn('[forceRefreshToken] Refresh failed but current token still valid (TTL:', fallbackTTL, 's)');
                return fallbackSession.access_token;
            }
        }
    } catch (_) { }

    // All failed
    console.error('[forceRefreshToken] ❌ ALL FAILED — no valid token');
    const error = new Error('Token refresh failed: all refresh attempts failed');
    error.errorCode = 'REFRESH_FAILED';
    throw error;
}

export async function checkAndRefreshToken() {
    try {
        await getAuthToken();
    } catch (error) {
        console.error('[checkAndRefreshToken] Error:', error);
    }
}

export async function makeAuthenticatedRequest(url, options = {}) {
    const token = await getAuthToken();
    if (!token) throw new Error('Unauthorized');

    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (response.status === 401) {
        const newToken = await refreshAuthToken();
        if (newToken) {
            return await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${newToken}`,
                    'Content-Type': 'application/json',
                },
            });
        }
    }

    return response;
}
