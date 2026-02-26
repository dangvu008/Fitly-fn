/**
 * File: lib/supabase_service.js
 * Purpose: Tập trung tất cả Supabase calls cho extension (thay thế localhost API)
 * Layer: Infrastructure
 *
 * Input: User JWT từ chrome.storage.local
 * Output: Data objects từ Supabase (profiles, wardrobe, outfits, etc.)
 *
 * Flow:
 * 1. getAuthHeader() - lấy JWT từ storage
 * 2. callEdgeFunction() - gọi Supabase Edge Function với auth
 * 3. callSupabaseRPC() - gọi Postgres function trực tiếp
 * 4. Các helper function cho từng domain
 *
 * Security Note: JWT được lưu trong chrome.storage.local, không expose
 */

// Import Supabase client đã bundle
import { supabase } from '../extension/config.js'
import { forceRefreshToken } from '../background/auth_state_manager.js'

const SUPABASE_URL = supabase.supabaseUrl
const EDGE_FUNCTION_TIMEOUT = 180000 // 180 seconds
const TOKEN_REFRESH_THRESHOLD = 900 // 15 minutes in seconds (match forceRefreshToken threshold)

// Mutex để tránh concurrent refresh calls
let _edgeFunctionRefreshPromise = null

/**
 * Lấy Authorization header từ session hiện tại
 */
async function getAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
        throw new Error('NOT_AUTHENTICATED')
    }
    return `Bearer ${session.access_token}`
}

/**
 * Tính TTL (Time To Live) của token hiện tại
 */
async function getTokenTTL() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.expires_at) return null

    const expiresAtMs = session.expires_at * 1000
    const ttlSeconds = Math.floor((expiresAtMs - Date.now()) / 1000)
    return ttlSeconds
}

/**
 * Proactive token refresh nếu TTL < threshold
 * Sử dụng mutex để tránh concurrent refresh calls
 */
async function ensureFreshToken() {
    // STEP 1: Check token TTL
    const ttl = await getTokenTTL()
    console.log('[callEdgeFunction] Current token TTL:', ttl, 'seconds')

    if (ttl === null || ttl < TOKEN_REFRESH_THRESHOLD) {
        console.log('[callEdgeFunction] Token TTL < 5 minutes, refreshing...')

        // STEP 2: Mutex pattern - nếu đã có refresh in-flight, chờ nó
        if (_edgeFunctionRefreshPromise) {
            console.log('[callEdgeFunction] Refresh already in progress, waiting...')
            try {
                await _edgeFunctionRefreshPromise
                const newTTL = await getTokenTTL()
                console.log('[callEdgeFunction] ✅ Token refreshed by concurrent call, new TTL:', newTTL, 'seconds')
                return
            } catch (error) {
                console.error('[callEdgeFunction] Concurrent refresh failed:', error)
                throw error
            }
        }

        // STEP 3: Acquire mutex - this is the only active refresh
        _edgeFunctionRefreshPromise = forceRefreshToken()
        try {
            const freshToken = await _edgeFunctionRefreshPromise
            if (!freshToken) {
                const error = new Error('Token refresh failed')
                error.errorCode = 'AUTH_EXPIRED'
                throw error
            }

            const newTTL = await getTokenTTL()
            console.log('[callEdgeFunction] ✅ Token refreshed successfully, new TTL:', newTTL, 'seconds')
        } finally {
            _edgeFunctionRefreshPromise = null
        }
    } else {
        console.log('[callEdgeFunction] Token TTL sufficient (>= 5 minutes), no refresh needed')
    }
}

/**
 * Gọi Supabase Edge Function với proactive token refresh và retry logic
 */
async function callEdgeFunction(functionName, body = null, method = 'POST') {
    // STEP 1: Proactive token refresh nếu TTL < 5 phút
    try {
        await ensureFreshToken()
    } catch (error) {
        console.error('[callEdgeFunction] Token refresh failed:', error)
        // Nếu refresh fail → throw error với errorCode
        if (error.errorCode === 'AUTH_EXPIRED') {
            throw error
        }
        // Nếu lỗi khác → wrap với errorCode
        const wrappedError = new Error(error.message || 'Token refresh failed')
        wrappedError.errorCode = 'AUTH_EXPIRED'
        throw wrappedError
    }

    // STEP 2: Prepare request
    const authHeader = await getAuthHeader()
    const headers = {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'apikey': supabase.supabaseKey
    }

    const options = { method, headers }
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body)
    }

    const url = `${SUPABASE_URL}/functions/v1/${functionName}`

    // STEP 3: Call Edge Function với timeout protection
    let response
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT)

        response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)

    } catch (error) {
        // Timeout error
        if (error.name === 'AbortError') {
            console.error('[callEdgeFunction] Timeout after', EDGE_FUNCTION_TIMEOUT / 1000, 'seconds')
            const timeoutError = new Error(`Edge Function ${functionName} timeout after ${EDGE_FUNCTION_TIMEOUT / 1000}s`)
            timeoutError.errorCode = 'TIMEOUT'
            throw timeoutError
        }

        // Network error
        console.error('[callEdgeFunction] Network error:', error)
        const networkError = new Error(error.message || 'Network error')
        networkError.errorCode = 'NETWORK_ERROR'
        throw networkError
    }

    // STEP 4: Handle 401 với retry logic
    if (response.status === 401) {
        console.warn('[callEdgeFunction] Received 401, attempting token refresh and retry...')

        try {
            // Force refresh token
            const freshToken = await forceRefreshToken()
            if (!freshToken) {
                const error = new Error('Token refresh failed after 401')
                error.errorCode = 'AUTH_EXPIRED'
                throw error
            }

            console.log('[callEdgeFunction] Token refreshed, retrying request...')

            // Retry request với fresh token
            const retryAuthHeader = await getAuthHeader()
            const retryHeaders = {
                'Authorization': retryAuthHeader,
                'Content-Type': 'application/json',
                'apikey': supabase.supabaseKey
            }

            const retryOptions = { method, headers: retryHeaders }
            if (body && method !== 'GET') {
                retryOptions.body = JSON.stringify(body)
            }

            const retryController = new AbortController()
            const retryTimeoutId = setTimeout(() => retryController.abort(), EDGE_FUNCTION_TIMEOUT)

            response = await fetch(url, { ...retryOptions, signal: retryController.signal })
            clearTimeout(retryTimeoutId)

            // Nếu retry vẫn 401 → token thực sự hết hạn
            if (response.status === 401) {
                console.error('[callEdgeFunction] Retry also returned 401, token expired')
                const error = new Error('Authentication expired, please login again')
                error.errorCode = 'AUTH_EXPIRED'
                throw error
            }

            console.log('[callEdgeFunction] ✅ Retry successful')

        } catch (error) {
            // Retry failed
            if (error.errorCode === 'AUTH_EXPIRED') {
                throw error
            }

            // Timeout trong retry
            if (error.name === 'AbortError') {
                const timeoutError = new Error(`Edge Function ${functionName} timeout on retry`)
                timeoutError.errorCode = 'TIMEOUT'
                throw timeoutError
            }

            // Network error trong retry
            const networkError = new Error(error.message || 'Network error on retry')
            networkError.errorCode = 'NETWORK_ERROR'
            throw networkError
        }
    }

    // STEP 5: Handle response
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        const error = new Error(errorData.error || errorData.message || `Edge function ${functionName} failed`)

        // Set errorCode based on status
        if (response.status >= 500) {
            error.errorCode = 'SERVER_ERROR'
        } else if (response.status === 429) {
            error.errorCode = 'RATE_LIMIT'
        } else {
            error.errorCode = 'API_ERROR'
        }

        throw error
    }

    return response.json()
}

// =============================================
// USER PROFILE
// =============================================

/**
 * Lấy profile đầy đủ của user (gems, models, info)
 */
export async function getUserProfile() {
    try {
        return await callEdgeFunction('get-user-profile', null, 'GET')
    } catch (error) {
        console.error('[SupabaseService] getUserProfile error:', error)
        throw error
    }
}

/**
 * Lấy gems balance của user
 */
export async function getGemsBalance() {
    try {
        const { data: session } = await supabase.auth.getSession()
        if (!session.session) throw new Error('NOT_AUTHENTICATED')

        const { data, error } = await supabase
            .from('profiles')
            .select('gems_balance')
            .eq('id', session.session.user.id)
            .single()

        if (error) throw error
        return { gems_balance: data?.gems_balance ?? 0 }
    } catch (error) {
        console.error('[SupabaseService] getGemsBalance error:', error)
        throw error
    }
}

/**
 * Cập nhật model image chính của user
 */
export async function updateUserModelImage(imageUrl) {
    try {
        const { data: session } = await supabase.auth.getSession()
        if (!session.session) throw new Error('NOT_AUTHENTICATED')

        const { error } = await supabase
            .from('profiles')
            .update({ model_image_url: imageUrl })
            .eq('id', session.session.user.id)

        if (error) throw error
        return { success: true }
    } catch (error) {
        console.error('[SupabaseService] updateUserModelImage error:', error)
        throw error
    }
}

// =============================================
// USER MODELS
// =============================================

/**
 * Lấy danh sách ảnh model của user
 */
export async function getUserModels() {
    try {
        const { data, error } = await supabase
            .from('user_models')
            .select('id, image_url, is_default, source, created_at')
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) throw error
        return { models: data || [] }
    } catch (error) {
        console.error('[SupabaseService] getUserModels error:', error)
        return { models: [] }
    }
}

/**
 * Thêm ảnh model mới cho user
 */
export async function addUserModel(imageUrl, isDefault = false) {
    try {
        const { data: session } = await supabase.auth.getSession()
        if (!session.session) throw new Error('NOT_AUTHENTICATED')

        // Nếu set default, reset tất cả cái cũ
        if (isDefault) {
            await supabase
                .from('user_models')
                .update({ is_default: false })
                .eq('user_id', session.session.user.id)
        }

        const { data, error } = await supabase
            .from('user_models')
            .insert({
                user_id: session.session.user.id,
                image_url: imageUrl,
                is_default: isDefault,
                source: 'upload'
            })
            .select()
            .single()

        if (error) throw error

        // Update profile model_image_url nếu default
        if (isDefault) {
            await updateUserModelImage(imageUrl)
        }

        return { success: true, model: data }
    } catch (error) {
        console.error('[SupabaseService] addUserModel error:', error)
        throw error
    }
}

/**
 * Đặt ảnh model làm default
 */
export async function setDefaultUserModel(modelId, imageUrl) {
    try {
        const { data: session } = await supabase.auth.getSession()
        if (!session.session) throw new Error('NOT_AUTHENTICATED')

        // Reset tất cả
        await supabase
            .from('user_models')
            .update({ is_default: false })
            .eq('user_id', session.session.user.id)

        // Set default mới
        await supabase
            .from('user_models')
            .update({ is_default: true })
            .eq('id', modelId)

        // Update profile
        await updateUserModelImage(imageUrl)

        return { success: true }
    } catch (error) {
        console.error('[SupabaseService] setDefaultUserModel error:', error)
        throw error
    }
}

/**
 * Xóa ảnh model
 */
export async function deleteUserModel(modelId) {
    try {
        const { error } = await supabase
            .from('user_models')
            .delete()
            .eq('id', modelId)

        if (error) throw error
        return { success: true }
    } catch (error) {
        console.error('[SupabaseService] deleteUserModel error:', error)
        throw error
    }
}

// =============================================
// WARDROBE
// =============================================

/**
 * Lấy wardrobe items của user
 */
export async function getWardrobeItems(category = null) {
    try {
        let query = supabase
            .from('wardrobe_items')
            .select('id, image_url, name, category, source_url, created_at')
            .order('created_at', { ascending: false })
            .limit(50)

        if (category) {
            query = query.eq('category', category)
        }

        const { data, error } = await query
        if (error) throw error
        return { items: data || [] }
    } catch (error) {
        console.error('[SupabaseService] getWardrobeItems error:', error)
        return { items: [] }
    }
}

/**
 * Thêm item vào wardrobe
 */
export async function addWardrobeItem({ image_url, name, category, source_url }) {
    try {
        const { data, error } = await supabase
            .from('wardrobe_items')
            .insert({ image_url, name, category, source_url })
            .select()
            .single()

        if (error) throw error
        return { success: true, item: data }
    } catch (error) {
        console.error('[SupabaseService] addWardrobeItem error:', error)
        throw error
    }
}

/**
 * Xóa item khỏi wardrobe
 */
export async function deleteWardrobeItem(itemId) {
    try {
        const { error } = await supabase
            .from('wardrobe_items')
            .delete()
            .eq('id', itemId)

        if (error) throw error
        return { success: true }
    } catch (error) {
        console.error('[SupabaseService] deleteWardrobeItem error:', error)
        throw error
    }
}

// =============================================
// TRY-ON
// =============================================

/**
 * Gọi process-tryon Edge Function
 */
export async function processTryOn({ model_image, clothing_images, quality = 'standard' }) {
    return callEdgeFunction('process-tryon', { model_image, clothing_images, quality })
}

/**
 * Lấy lịch sử try-on
 */
export async function getTryonHistory(limit = 20) {
    try {
        const { data, error } = await supabase
            .from('tryon_history')
            .select('id, result_image_url, clothing_image_urls, gems_used, quality, status, created_at')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) throw error
        return { history: data || [] }
    } catch (error) {
        console.error('[SupabaseService] getTryonHistory error:', error)
        return { history: [] }
    }
}

/**
 * Upload ảnh lên Supabase Storage
 */
export async function uploadImageToStorage(base64Data, folder = 'wardrobe') {
    try {
        const { data: session } = await supabase.auth.getSession()
        if (!session.session) throw new Error('NOT_AUTHENTICATED')

        const userId = session.session.user.id
        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
        const bytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))
        const filename = `${crypto.randomUUID()}.jpg`
        const path = `users/${userId}/${folder}/${filename}`

        const { error } = await supabase.storage
            .from('users')
            .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })

        if (error) throw error

        const { data: urlData } = supabase.storage.from('users').getPublicUrl(path)
        return { success: true, url: urlData.publicUrl }
    } catch (error) {
        console.error('[SupabaseService] uploadImageToStorage error:', error)
        throw error
    }
}
