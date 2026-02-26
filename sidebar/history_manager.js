/**
 * File: sidebar/history_manager.js
 * Purpose: Quản lý lịch sử try-on của user
 * Layer: Application
 * 
 * Data Contract:
 * - Input: { status?: string, page?: number, limit?: number }
 * - Output: { items: TryOnHistoryItem[], totalCount: number, hasMore: boolean }
 * 
 * Flow:
 * 1. Query tryon_history table với filters
 * 2. Sort by created_at DESC (newest first)
 * 3. Implement pagination (100 items per page)
 * 4. Return history items với metadata
 * 
 * Security Note:
 * - RLS policies đảm bảo user chỉ xem history của mình
 * - Validate status filter thuộc allowed list
 */

import { supabase, getAuthToken } from '../extension/config.js'

// ============================================================================
// CONSTANTS
// ============================================================================

const ALLOWED_STATUSES = ['processing', 'completed', 'failed']
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 100

// ============================================================================
// GET HISTORY
// ============================================================================

/**
 * Get try-on history với optional filters và pagination
 * 
 * @param {object} options - Query options
 * @param {string} options.status - Filter by status: processing/completed/failed (optional)
 * @param {number} options.page - Page number (1-indexed, default: 1)
 * @param {number} options.limit - Items per page (default: 100, max: 100)
 * @returns {Promise<{success: boolean, items?: TryOnHistoryItem[], totalCount?: number, hasMore?: boolean, error?: string}>}
 * 
 * TryOnHistoryItem format:
 * {
 *   id: string,
 *   user_id: string,
 *   model_image_url: string,
 *   clothing_image_urls: string[], // JSONB array
 *   result_image_url: string,
 *   gems_used: number,
 *   quality: 'standard' | 'hd',
 *   status: 'processing' | 'completed' | 'failed',
 *   error_message: string,
 *   created_at: string,
 *   completed_at: string
 * }
 */
export async function getHistory(options = {}) {
  try {
    // Validate authentication
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập để xem lịch sử.'
      }
    }
    
    // Parse options
    const {
      status = null,
      page = 1,
      limit = DEFAULT_PAGE_SIZE
    } = options
    
    // Validate options
    const validation = validateHistoryOptions(status, page, limit)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      }
    }
    
    // Calculate pagination
    const pageSize = Math.min(limit, MAX_PAGE_SIZE)
    const offset = (page - 1) * pageSize
    
    // Build query
    let query = supabase
      .from('tryon_history')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    
    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status)
    }
    
    // Execute query
    const { data, error, count } = await query
    
    if (error) {
      console.error('Error fetching history:', error)
      return {
        success: false,
        error: 'Không thể tải lịch sử. Vui lòng thử lại.'
      }
    }
    
    // Calculate hasMore
    const totalCount = count || 0
    const hasMore = (offset + pageSize) < totalCount
    
    return {
      success: true,
      items: data || [],
      totalCount: totalCount,
      currentPage: page,
      pageSize: pageSize,
      hasMore: hasMore
    }
    
  } catch (error) {
    console.error('Exception in getHistory:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.'
    }
  }
}

/**
 * Get single history item by ID
 * 
 * @param {string} historyId - Try-on history ID
 * @returns {Promise<{success: boolean, item?: TryOnHistoryItem, error?: string}>}
 */
export async function getHistoryItem(historyId) {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    const { data, error } = await supabase
      .from('tryon_history')
      .select('*')
      .eq('id', historyId)
      .single()
    
    if (error) {
      console.error('Error fetching history item:', error)
      return {
        success: false,
        error: 'Không tìm thấy history item.'
      }
    }
    
    return {
      success: true,
      item: data
    }
    
  } catch (error) {
    console.error('Exception in getHistoryItem:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

// ============================================================================
// HISTORY STATISTICS
// ============================================================================

/**
 * Get history statistics (counts by status)
 * 
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 * 
 * Stats format:
 * {
 *   total: number,
 *   completed: number,
 *   processing: number,
 *   failed: number
 * }
 */
export async function getHistoryStats() {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    // Get counts for each status
    const [totalResult, completedResult, processingResult, failedResult] = await Promise.all([
      supabase.from('tryon_history').select('*', { count: 'exact', head: true }),
      supabase.from('tryon_history').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('tryon_history').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('tryon_history').select('*', { count: 'exact', head: true }).eq('status', 'failed')
    ])
    
    return {
      success: true,
      stats: {
        total: totalResult.count || 0,
        completed: completedResult.count || 0,
        processing: processingResult.count || 0,
        failed: failedResult.count || 0
      }
    }
    
  } catch (error) {
    console.error('Exception in getHistoryStats:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

/**
 * Get total gems spent
 * 
 * @returns {Promise<{success: boolean, totalGemsSpent?: number, error?: string}>}
 */
export async function getTotalGemsSpent() {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    // Query all completed try-ons và sum gems_used
    const { data, error } = await supabase
      .from('tryon_history')
      .select('gems_used')
      .eq('status', 'completed')
    
    if (error) {
      console.error('Error calculating gems spent:', error)
      return {
        success: false,
        error: 'Không thể tính tổng gems.'
      }
    }
    
    const totalGemsSpent = data.reduce((sum, item) => sum + item.gems_used, 0)
    
    return {
      success: true,
      totalGemsSpent: totalGemsSpent
    }
    
  } catch (error) {
    console.error('Exception in getTotalGemsSpent:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

// ============================================================================
// DELETE HISTORY
// ============================================================================

/**
 * Delete history item
 * Note: Chỉ xóa DB record, không xóa images trong Storage
 * 
 * @param {string} historyId - Try-on history ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteHistoryItem(historyId) {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    const { error } = await supabase
      .from('tryon_history')
      .delete()
      .eq('id', historyId)
    
    if (error) {
      console.error('Error deleting history item:', error)
      return {
        success: false,
        error: 'Không thể xóa history item.'
      }
    }
    
    return {
      success: true
    }
    
  } catch (error) {
    console.error('Exception in deleteHistoryItem:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

/**
 * Clear all history (delete all records)
 * DANGEROUS: Không thể undo
 * 
 * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>}
 */
export async function clearAllHistory() {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    // Get current user ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: 'Không thể xác định user.'
      }
    }
    
    // Delete all history for current user
    const { data, error } = await supabase
      .from('tryon_history')
      .delete()
      .eq('user_id', user.id)
      .select()
    
    if (error) {
      console.error('Error clearing history:', error)
      return {
        success: false,
        error: 'Không thể xóa history.'
      }
    }
    
    return {
      success: true,
      deletedCount: data?.length || 0
    }
    
  } catch (error) {
    console.error('Exception in clearAllHistory:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate history query options
 * 
 * @param {string|null} status
 * @param {number} page
 * @param {number} limit
 * @returns {{valid: boolean, error?: string}}
 */
function validateHistoryOptions(status, page, limit) {
  // Validate status
  if (status && !ALLOWED_STATUSES.includes(status)) {
    return {
      valid: false,
      error: `Status không hợp lệ. Allowed: ${ALLOWED_STATUSES.join(', ')}`
    }
  }
  
  // Validate page
  if (page < 1) {
    return {
      valid: false,
      error: 'Page phải >= 1.'
    }
  }
  
  // Validate limit
  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    return {
      valid: false,
      error: `Limit phải từ 1 đến ${MAX_PAGE_SIZE}.`
    }
  }
  
  return { valid: true }
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Get status display name (Vietnamese)
 * 
 * @param {string} status - Status code
 * @returns {string} Display name
 */
export function getStatusDisplayName(status) {
  const displayNames = {
    'processing': 'Đang xử lý',
    'completed': 'Hoàn thành',
    'failed': 'Thất bại'
  }
  
  return displayNames[status] || status
}

/**
 * Get status color for UI
 * 
 * @param {string} status - Status code
 * @returns {string} Color code (hex)
 */
export function getStatusColor(status) {
  const colors = {
    'processing': '#FFA500', // Orange
    'completed': '#4CAF50',  // Green
    'failed': '#F44336'      // Red
  }
  
  return colors[status] || '#999999'
}

/**
 * Get status icon (emoji)
 * 
 * @param {string} status - Status code
 * @returns {string} Emoji icon
 */
export function getStatusIcon(status) {
  const icons = {
    'processing': '⏳',
    'completed': '✅',
    'failed': '❌'
  }
  
  return icons[status] || '❓'
}

/**
 * Get quality display name (Vietnamese)
 * 
 * @param {string} quality - Quality code
 * @returns {string} Display name
 */
export function getQualityDisplayName(quality) {
  const displayNames = {
    'standard': 'Tiêu chuẩn',
    'hd': 'HD'
  }
  
  return displayNames[quality] || quality
}

/**
 * Format timestamp to readable date
 * 
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted date (e.g., "15/03/2024 14:30")
 */
export function formatTimestamp(timestamp) {
  try {
    const date = new Date(timestamp)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch (error) {
    return timestamp
  }
}

/**
 * Calculate processing duration
 * 
 * @param {string} createdAt - Created timestamp
 * @param {string} completedAt - Completed timestamp
 * @returns {string} Duration string (e.g., "15 giây", "2 phút")
 */
export function calculateDuration(createdAt, completedAt) {
  try {
    if (!completedAt) return 'N/A'
    
    const start = new Date(createdAt)
    const end = new Date(completedAt)
    const durationMs = end - start
    const durationSeconds = Math.floor(durationMs / 1000)
    
    if (durationSeconds < 60) {
      return `${durationSeconds} giây`
    } else {
      const minutes = Math.floor(durationSeconds / 60)
      const seconds = durationSeconds % 60
      return `${minutes} phút ${seconds} giây`
    }
  } catch (error) {
    return 'N/A'
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getHistory,
  getHistoryItem,
  getHistoryStats,
  getTotalGemsSpent,
  deleteHistoryItem,
  clearAllHistory,
  getStatusDisplayName,
  getStatusColor,
  getStatusIcon,
  getQualityDisplayName,
  formatTimestamp,
  calculateDuration
}
