/**
 * File: extension/config.js
 * Purpose: Cấu hình Supabase client cho Chrome Extension
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: None (configuration constants)
 * - Output: Supabase client instance và helper functions
 * 
 * Flow:
 * 1. Initialize Supabase client với project URL và anon key
 * 2. Provide helper functions cho authentication
 * 3. Export client instance để sử dụng trong Extension
 * 
 * Security Note:
 * - Sử dụng ANON key (public), KHÔNG dùng service_role key
 * - RLS policies bảo vệ data access
 * - Session token stored trong localStorage
 */

// ============================================================================
// CONFIGURATION - REPLACE WITH YOUR SUPABASE PROJECT VALUES
// ============================================================================

/**
 * Supabase Project URL
 * Format: https://[project-id].supabase.co
 * 
 * Cách lấy:
 * 1. Vào Supabase Dashboard
 * 2. Chọn project của bạn
 * 3. Settings > API > Project URL
 */
const SUPABASE_URL = 'https://lluidqwmyxuonvmcansp.supabase.co'

/**
 * Supabase Anon Key (Public Key)
 * Format: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * 
 * Cách lấy:
 * 1. Vào Supabase Dashboard
 * 2. Chọn project của bạn
 * 3. Settings > API > Project API keys > anon public
 * 
 * CRITICAL: Sử dụng "anon" key, KHÔNG dùng "service_role" key
 */
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWlkcXdteXh1b252bWNhbnNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5ODkxNjMsImV4cCI6MjA4NDU2NTE2M30.mXg9_pJ4igSn4LeVwcvT4tlEMoRFY54nSdNbEnzp734'

// ============================================================================
// SUPABASE CLIENT INITIALIZATION
// ============================================================================

/**
 * Import Supabase client library
 * Bundled locally to avoid CSP issues with remote code
 */
import { createClient } from '../lib/supabase.min.js'

/**
 * Custom Storage Adapter for Chrome Extension
 * Sử dụng chrome.storage.local thay vì localStorage
 */
const ChromeStorageAdapter = {
  getItem: async (key) => {
    try {
      const result = await chrome.storage.local.get([key])
      return result[key] || null
    } catch (e) {
      console.error('StorageAdapter getItem error:', e)
      return null
    }
  },
  setItem: async (key, value) => {
    try {
      await chrome.storage.local.set({ [key]: value })
    } catch (e) {
      console.error('StorageAdapter setItem error:', e)
    }
  },
  removeItem: async (key) => {
    try {
      await chrome.storage.local.remove([key])
    } catch (e) {
      console.error('StorageAdapter removeItem error:', e)
    }
  }
}

/**
 * Singleton Supabase client instance
 * Được sử dụng trong toàn bộ Extension
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session trong storage
    persistSession: true,
    // Storage adapter cho Chrome Extension
    storage: ChromeStorageAdapter,
    // ❌ DISABLED: Service Worker là ephemeral — Chrome kills SW bất kỳ lúc nào (~30s idle).
    // autoRefreshToken tạo internal timer, nhưng khi SW bị kill giữa chừng refresh:
    // 1. Server đã rotate refresh token (token cũ → invalid)
    // 2. SW không nhận token mới (đã bị kill)
    // 3. Khi SW restart → session cũ có refresh token đã invalid
    // 4. refreshSession() fail → Supabase wipe session khỏi memory + storage
    // 5. Mọi call tiếp theo → "Auth session missing!"
    // FIX: Dùng manual refresh (forceRefreshToken()) chỉ khi thực sự cần (trước try-on, API call).
    autoRefreshToken: false,
    // Detect session từ URL (cho OAuth flows)
    detectSessionInUrl: true,
    // Storage key prefix
    storageKey: 'fitly-auth-token'
  }
})

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Lấy JWT access token của user hiện tại
 * 
 * @returns {Promise<string|null>} Access token hoặc null nếu chưa login
 * 
 * Usage:
 * const token = await getAuthToken()
 * if (!token) {
 *   // User chưa login, redirect to login
 * }
 */
export async function getAuthToken() {
  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('Error getting auth session:', error)
      return null
    }

    return data.session?.access_token ?? null
  } catch (err) {
    console.error('Exception getting auth token:', err)
    return null
  }
}

/**
 * Lấy thông tin user hiện tại
 * 
 * @returns {Promise<object|null>} User object hoặc null nếu chưa login
 * 
 * User object format:
 * {
 *   id: 'uuid',
 *   email: 'user@example.com',
 *   user_metadata: { ... }
 * }
 */
export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      console.error('Error getting current user:', error)
      return null
    }

    return data.user
  } catch (err) {
    console.error('Exception getting current user:', err)
    return null
  }
}

/**
 * Kiểm tra user đã login hay chưa
 * 
 * @returns {Promise<boolean>} true nếu đã login, false nếu chưa
 */
export async function isAuthenticated() {
  const token = await getAuthToken()
  return token !== null
}

/**
 * Login với email và password
 * 
 * @param {string} email - Email của user
 * @param {string} password - Password của user
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 * 
 * Usage:
 * const result = await login('user@example.com', 'password123')
 * if (result.success) {
 *   console.log('Logged in:', result.user)
 * } else {
 *   console.error('Login failed:', result.error)
 * }
 */
export async function login(email, password) {
  try {
    // Validate email format
    if (!isValidEmail(email)) {
      return {
        success: false,
        error: 'Email không hợp lệ. Vui lòng nhập đúng định dạng email.'
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return {
        success: false,
        error: mapAuthError(error.message)
      }
    }

    return {
      success: true,
      user: data.user
    }
  } catch (err) {
    console.error('Exception during login:', err)
    return {
      success: false,
      error: 'Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.'
    }
  }
}

/**
 * Signup với email và password
 * 
 * @param {string} email - Email của user
 * @param {string} password - Password của user
 * @param {object} metadata - Optional user metadata (full_name, etc.)
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 * 
 * Usage:
 * const result = await signup('user@example.com', 'password123', {
 *   full_name: 'John Doe'
 * })
 */
export async function signup(email, password, metadata = {}) {
  try {
    // Validate email format
    if (!isValidEmail(email)) {
      return {
        success: false,
        error: 'Email không hợp lệ. Vui lòng nhập đúng định dạng email.'
      }
    }

    // Validate password strength
    if (password.length < 6) {
      return {
        success: false,
        error: 'Password phải có ít nhất 6 ký tự.'
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    })

    if (error) {
      return {
        success: false,
        error: mapAuthError(error.message)
      }
    }

    // Note: Supabase có thể yêu cầu email confirmation
    // Check data.user.confirmed_at để biết user đã confirm chưa

    return {
      success: true,
      user: data.user,
      needsConfirmation: !data.user?.confirmed_at
    }
  } catch (err) {
    console.error('Exception during signup:', err)
    return {
      success: false,
      error: 'Đã xảy ra lỗi khi đăng ký. Vui lòng thử lại.'
    }
  }
}

/**
 * Logout user hiện tại
 * 
 * @returns {Promise<{success: boolean, error?: string}>}
 * 
 * Usage:
 * const result = await logout()
 * if (result.success) {
 *   // Redirect to login page
 * }
 */
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      return {
        success: false,
        error: 'Đã xảy ra lỗi khi đăng xuất. Vui lòng thử lại.'
      }
    }

    // Clear any cached data
    clearLocalCache()

    return {
      success: true
    }
  } catch (err) {
    console.error('Exception during logout:', err)
    return {
      success: false,
      error: 'Đã xảy ra lỗi khi đăng xuất. Vui lòng thử lại.'
    }
  }
}

/**
 * Refresh session token
 * Tự động được gọi bởi Supabase client khi token gần hết hạn
 * 
 * @returns {Promise<{success: boolean, session?: object, error?: string}>}
 */
export async function refreshSession() {
  try {
    const { data, error } = await supabase.auth.refreshSession()

    if (error) {
      return {
        success: false,
        error: 'Không thể refresh session. Vui lòng đăng nhập lại.'
      }
    }

    return {
      success: true,
      session: data.session
    }
  } catch (err) {
    console.error('Exception refreshing session:', err)
    return {
      success: false,
      error: 'Đã xảy ra lỗi khi refresh session.'
    }
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate email format
 * 
 * @param {string} email - Email cần validate
 * @returns {boolean} true nếu email hợp lệ
 */
function isValidEmail(email) {
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Map Supabase auth errors sang user-friendly messages
 * 
 * @param {string} errorMessage - Error message từ Supabase
 * @returns {string} User-friendly error message
 */
function mapAuthError(errorMessage) {
  const errorMap = {
    'Invalid login credentials': 'Email hoặc password không đúng.',
    'Email not confirmed': 'Vui lòng xác nhận email trước khi đăng nhập.',
    'User already registered': 'Email này đã được đăng ký.',
    'Password should be at least 6 characters': 'Password phải có ít nhất 6 ký tự.',
    'Unable to validate email address': 'Email không hợp lệ.',
    'Email rate limit exceeded': 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút.'
  }

  // Tìm matching error message
  for (const [key, value] of Object.entries(errorMap)) {
    if (errorMessage.includes(key)) {
      return value
    }
  }

  // Default error message
  return 'Đã xảy ra lỗi. Vui lòng thử lại.'
}

/**
 * Clear local cache data
 * Được gọi khi logout để xóa cached data
 */
async function clearLocalCache() {
  try {
    // ✅ FIX: Dùng chrome.storage.local (localStorage KHÔNG tồn tại trong SW context)
    await chrome.storage.local.remove([
      'fitly-cached-gems-balance',
      'fitly-cached-gems-timestamp',
    ])
    console.log('Local cache cleared')
  } catch (err) {
    console.error('Error clearing local cache:', err)
  }
}

// ============================================================================
// AUTH STATE LISTENER
// ============================================================================

/**
 * Listen for auth state changes
 * Useful để update UI khi user login/logout
 * 
 * @param {function} callback - Callback function nhận (event, session)
 * @returns {object} Subscription object với unsubscribe() method
 * 
 * Usage:
 * const subscription = onAuthStateChange((event, session) => {
 *   if (event === 'SIGNED_IN') {
 *     console.log('User signed in:', session.user)
 *   } else if (event === 'SIGNED_OUT') {
 *     console.log('User signed out')
 *   }
 * })
 * 
 * // Cleanup khi không cần nữa
 * subscription.unsubscribe()
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })

  return data
}

// ============================================================================
// CONFIGURATION VALIDATION
// ============================================================================

/**
 * Validate Supabase configuration
 * Kiểm tra xem SUPABASE_URL và SUPABASE_ANON_KEY đã được set chưa
 * 
 * @returns {boolean} true nếu config hợp lệ
 */
export function validateConfig() {
  if (SUPABASE_URL === 'https://your-project-id.supabase.co') {
    console.error('❌ SUPABASE_URL chưa được cấu hình!')
    console.error('Vui lòng update SUPABASE_URL trong extension/config.js')
    return false
  }

  if (SUPABASE_ANON_KEY === 'your-anon-key-here') {
    console.error('❌ SUPABASE_ANON_KEY chưa được cấu hình!')
    console.error('Vui lòng update SUPABASE_ANON_KEY trong extension/config.js')
    return false
  }

  console.log('✅ Supabase config hợp lệ')
  return true
}

// Validate config khi module được load
if (!validateConfig()) {
  console.warn('⚠️ Extension sẽ không hoạt động cho đến khi config được cập nhật')
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  supabase,
  getAuthToken,
  getCurrentUser,
  isAuthenticated,
  login,
  signup,
  logout,
  refreshSession,
  onAuthStateChange,
  validateConfig
}
