/**
 * File: sidebar/gems_service.js
 * Purpose: Quản lý gems balance và transactions
 * Layer: Application
 * 
 * Data Contract:
 * - Input: None (uses JWT token)
 * - Output: { gemsBalance: number, transactions: GemTransaction[] }
 * 
 * Flow:
 * 1. Query gems_balance từ profiles table
 * 2. Query gem_transactions history
 * 3. Cache balance locally cho offline mode
 * 4. Provide helpers để check sufficient gems
 * 
 * Security Note:
 * - RLS policies đảm bảo user chỉ xem balance của mình
 * - Balance luôn >= 0 (database constraint)
 */

import { supabase, getAuthToken } from '../extension/config.js'

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_KEY_BALANCE = 'fitly-cached-gems-balance'
const CACHE_KEY_TIMESTAMP = 'fitly-cached-gems-timestamp'
const CACHE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

// ============================================================================
// GET GEMS BALANCE
// ============================================================================

/**
 * Get current gems balance
 * 
 * @param {boolean} useCache - Sử dụng cached value nếu có (default: true)
 * @returns {Promise<{success: boolean, balance?: number, cached?: boolean, error?: string}>}
 */
export async function getGemsBalance(useCache = true) {
  try {
    // Check cache first nếu useCache = true
    if (useCache) {
      const cachedBalance = getCachedBalance()
      if (cachedBalance !== null) {
        return {
          success: true,
          balance: cachedBalance,
          cached: true
        }
      }
    }
    
    // Validate authentication
    const token = await getAuthToken()
    if (!token) {
      // Nếu offline, trả về cached value
      const cachedBalance = getCachedBalance(true) // Ignore expiry
      if (cachedBalance !== null) {
        return {
          success: true,
          balance: cachedBalance,
          cached: true,
          offline: true
        }
      }
      
      return {
        success: false,
        error: 'Bạn cần đăng nhập để xem gems balance.'
      }
    }
    
    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('get-gems-balance', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    
    if (error) {
      console.error('Error fetching gems balance:', error)
      
      // Fallback to cached value
      const cachedBalance = getCachedBalance(true)
      if (cachedBalance !== null) {
        return {
          success: true,
          balance: cachedBalance,
          cached: true,
          offline: true
        }
      }
      
      return {
        success: false,
        error: 'Không thể tải gems balance. Vui lòng thử lại.'
      }
    }
    
    const balance = data.gems_balance
    
    // Cache balance
    cacheBalance(balance)
    
    return {
      success: true,
      balance: balance,
      cached: false
    }
    
  } catch (error) {
    console.error('Exception in getGemsBalance:', error)
    
    // Fallback to cached value
    const cachedBalance = getCachedBalance(true)
    if (cachedBalance !== null) {
      return {
        success: true,
        balance: cachedBalance,
        cached: true,
        offline: true
      }
    }
    
    return {
      success: false,
      error: 'Đã xảy ra lỗi không mong muốn.'
    }
  }
}

/**
 * Refresh gems balance (force fetch from server)
 * 
 * @returns {Promise<{success: boolean, balance?: number, error?: string}>}
 */
export async function refreshGemsBalance() {
  return await getGemsBalance(false)
}

// ============================================================================
// GEM TRANSACTIONS
// ============================================================================

/**
 * Get gem transactions history
 * 
 * @param {object} options - Query options
 * @param {string} options.type - Filter by type: purchase/tryon/refund (optional)
 * @param {number} options.limit - Max items to return (default: 50)
 * @returns {Promise<{success: boolean, transactions?: GemTransaction[], error?: string}>}
 * 
 * GemTransaction format:
 * {
 *   id: string,
 *   user_id: string,
 *   amount: number,
 *   type: 'purchase' | 'tryon' | 'refund',
 *   tryon_id: string,
 *   created_at: string
 * }
 */
export async function getGemTransactions(options = {}) {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    const { type = null, limit = 50 } = options
    
    // Build query
    let query = supabase
      .from('gem_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    
    // Apply type filter if provided
    if (type) {
      query = query.eq('type', type)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching gem transactions:', error)
      return {
        success: false,
        error: 'Không thể tải lịch sử transactions.'
      }
    }
    
    return {
      success: true,
      transactions: data || []
    }
    
  } catch (error) {
    console.error('Exception in getGemTransactions:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

// ============================================================================
// BALANCE CHECKS
// ============================================================================

/**
 * Check if user có đủ gems cho một operation
 * 
 * @param {number} requiredGems - Số gems cần thiết
 * @returns {Promise<{sufficient: boolean, currentBalance?: number, shortfall?: number}>}
 */
export async function checkSufficientGems(requiredGems) {
  const result = await getGemsBalance()
  
  if (!result.success) {
    return {
      sufficient: false,
      error: result.error
    }
  }
  
  const currentBalance = result.balance
  const sufficient = currentBalance >= requiredGems
  
  return {
    sufficient: sufficient,
    currentBalance: currentBalance,
    shortfall: sufficient ? 0 : (requiredGems - currentBalance)
  }
}

/**
 * Get estimated try-ons remaining với current balance
 * 
 * @param {string} quality - 'standard' hoặc 'hd'
 * @returns {Promise<{success: boolean, remaining?: number, error?: string}>}
 */
export async function getEstimatedTryOnsRemaining(quality = 'standard') {
  const result = await getGemsBalance()
  
  if (!result.success) {
    return {
      success: false,
      error: result.error
    }
  }
  
  const gemCost = quality === 'hd' ? 2 : 1
  const remaining = Math.floor(result.balance / gemCost)
  
  return {
    success: true,
    remaining: remaining
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Get cached gems balance
 * 
 * @param {boolean} ignoreExpiry - Ignore cache expiry (default: false)
 * @returns {number|null} Cached balance hoặc null nếu không có cache
 */
function getCachedBalance(ignoreExpiry = false) {
  try {
    const cachedBalance = localStorage.getItem(CACHE_KEY_BALANCE)
    const cachedTimestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP)
    
    if (!cachedBalance || !cachedTimestamp) {
      return null
    }
    
    // Check expiry
    if (!ignoreExpiry) {
      const now = Date.now()
      const timestamp = parseInt(cachedTimestamp, 10)
      
      if (now - timestamp > CACHE_EXPIRY_MS) {
        // Cache expired
        return null
      }
    }
    
    return parseInt(cachedBalance, 10)
    
  } catch (error) {
    console.error('Error reading cached balance:', error)
    return null
  }
}

/**
 * Cache gems balance
 * 
 * @param {number} balance - Balance to cache
 */
function cacheBalance(balance) {
  try {
    localStorage.setItem(CACHE_KEY_BALANCE, balance.toString())
    localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString())
  } catch (error) {
    console.error('Error caching balance:', error)
  }
}

/**
 * Clear cached balance
 */
export function clearBalanceCache() {
  try {
    localStorage.removeItem(CACHE_KEY_BALANCE)
    localStorage.removeItem(CACHE_KEY_TIMESTAMP)
  } catch (error) {
    console.error('Error clearing balance cache:', error)
  }
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Format gems balance for display
 * 
 * @param {number} balance - Gems balance
 * @returns {string} Formatted string (e.g., "1,234 Gems")
 */
export function formatGemsBalance(balance) {
  return `${balance.toLocaleString()} Gems`
}

/**
 * Get transaction type display name (Vietnamese)
 * 
 * @param {string} type - Transaction type
 * @returns {string} Display name
 */
export function getTransactionTypeDisplayName(type) {
  const displayNames = {
    'purchase': 'Mua Gems',
    'tryon': 'Try-On',
    'refund': 'Hoàn tiền'
  }
  
  return displayNames[type] || type
}

/**
 * Get transaction type icon (emoji)
 * 
 * @param {string} type - Transaction type
 * @returns {string} Emoji icon
 */
export function getTransactionTypeIcon(type) {
  const icons = {
    'purchase': '💰',
    'tryon': '👗',
    'refund': '↩️'
  }
  
  return icons[type] || '💎'
}

/**
 * Get transaction amount color (positive = green, negative = red)
 * 
 * @param {number} amount - Transaction amount
 * @returns {string} Color code (hex)
 */
export function getTransactionAmountColor(amount) {
  return amount >= 0 ? '#4CAF50' : '#F44336'
}

/**
 * Format transaction amount with sign
 * 
 * @param {number} amount - Transaction amount
 * @param {string} type - Transaction type
 * @returns {string} Formatted amount (e.g., "+10", "-2")
 */
export function formatTransactionAmount(amount, type) {
  // Purchase và refund là positive (add gems)
  // Tryon là negative (deduct gems)
  if (type === 'tryon') {
    return `-${Math.abs(amount)}`
  } else {
    return `+${Math.abs(amount)}`
  }
}

// ============================================================================
// LOW BALANCE WARNING
// ============================================================================

/**
 * Check if balance is low (< 5 gems)
 * 
 * @param {number} balance - Current balance
 * @returns {boolean} true nếu balance thấp
 */
export function isLowBalance(balance) {
  return balance < 5
}

/**
 * Get low balance warning message
 * 
 * @param {number} balance - Current balance
 * @returns {string|null} Warning message hoặc null nếu balance OK
 */
export function getLowBalanceWarning(balance) {
  if (balance === 0) {
    return 'Bạn đã hết Gems. Vui lòng mua thêm để tiếp tục sử dụng.'
  }
  
  if (balance < 5) {
    return `Bạn chỉ còn ${balance} Gems. Hãy mua thêm để không bị gián đoạn.`
  }
  
  return null
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getGemsBalance,
  refreshGemsBalance,
  getGemTransactions,
  checkSufficientGems,
  getEstimatedTryOnsRemaining,
  clearBalanceCache,
  formatGemsBalance,
  getTransactionTypeDisplayName,
  getTransactionTypeIcon,
  getTransactionAmountColor,
  formatTransactionAmount,
  isLowBalance,
  getLowBalanceWarning
}
