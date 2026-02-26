/**
 * File: rate_limiter.ts
 * Purpose: Rate limiting middleware để giới hạn số requests per user per minute
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: { userId: string, limit: number, windowMs: number }
 * - Output: { allowed: boolean, remaining: number, resetAt: Date }
 * 
 * Flow:
 * 1. Get request history của user từ in-memory store
 * 2. Filter requests trong time window (last N milliseconds)
 * 3. Check xem số requests có vượt limit không
 * 4. If allowed, add request vào history
 * 5. Return result với remaining count
 * 
 * Security Note: In-memory store sẽ reset khi Edge Function restart
 * Để persistent rate limiting, cần dùng Redis hoặc database
 */

interface RateLimitRecord {
  userId: string
  timestamps: number[] // Array of request timestamps
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number // Seconds until next allowed request
}

/**
 * In-memory store cho rate limit tracking
 * Key: userId, Value: array of timestamps
 */
const rateLimitStore = new Map<string, number[]>()

/**
 * Cleanup old entries để tránh memory leak
 * Chạy mỗi 5 phút
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
let lastCleanup = Date.now()

function cleanupOldEntries(windowMs: number): void {
  const now = Date.now()
  
  // Only cleanup every CLEANUP_INTERVAL_MS
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return
  }
  
  const cutoff = now - windowMs
  
  for (const [userId, timestamps] of rateLimitStore.entries()) {
    const validTimestamps = timestamps.filter((ts) => ts > cutoff)
    
    if (validTimestamps.length === 0) {
      rateLimitStore.delete(userId)
    } else {
      rateLimitStore.set(userId, validTimestamps)
    }
  }
  
  lastCleanup = now
}

/**
 * Check rate limit cho user
 * 
 * @param userId - User ID cần check
 * @param limit - Số requests tối đa trong window (default: 10)
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns Rate limit result
 * 
 * @example
 * const result = await checkRateLimit(userId, 10, 60000)
 * if (!result.allowed) {
 *   return new Response('Too many requests', { status: 429 })
 * }
 */
export function checkRateLimit(
  userId: string,
  limit: number = 10,
  windowMs: number = 60000 // 1 minute
): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs
  
  // Cleanup old entries periodically
  cleanupOldEntries(windowMs)
  
  // Get user's request history
  let timestamps = rateLimitStore.get(userId) || []
  
  // Filter timestamps trong window
  timestamps = timestamps.filter((ts) => ts > cutoff)
  
  // Check limit
  const allowed = timestamps.length < limit
  const remaining = Math.max(0, limit - timestamps.length)
  
  // Calculate reset time (oldest timestamp + window)
  let resetAt: Date
  if (timestamps.length > 0) {
    const oldestTimestamp = Math.min(...timestamps)
    resetAt = new Date(oldestTimestamp + windowMs)
  } else {
    resetAt = new Date(now + windowMs)
  }
  
  // Calculate retry after (seconds)
  let retryAfter: number | undefined
  if (!allowed && timestamps.length > 0) {
    const oldestTimestamp = Math.min(...timestamps)
    retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000)
  }
  
  // If allowed, add current timestamp
  if (allowed) {
    timestamps.push(now)
    rateLimitStore.set(userId, timestamps)
  }
  
  return {
    allowed,
    remaining: allowed ? remaining - 1 : 0,
    resetAt,
    retryAfter,
  }
}

/**
 * Reset rate limit cho user (dùng cho testing hoặc admin override)
 */
export function resetRateLimit(userId: string): void {
  rateLimitStore.delete(userId)
}

/**
 * Get current rate limit status cho user (không consume request)
 */
export function getRateLimitStatus(
  userId: string,
  limit: number = 10,
  windowMs: number = 60000
): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs
  
  const timestamps = (rateLimitStore.get(userId) || []).filter((ts) => ts > cutoff)
  
  const allowed = timestamps.length < limit
  const remaining = Math.max(0, limit - timestamps.length)
  
  let resetAt: Date
  if (timestamps.length > 0) {
    const oldestTimestamp = Math.min(...timestamps)
    resetAt = new Date(oldestTimestamp + windowMs)
  } else {
    resetAt = new Date(now + windowMs)
  }
  
  let retryAfter: number | undefined
  if (!allowed && timestamps.length > 0) {
    const oldestTimestamp = Math.min(...timestamps)
    retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000)
  }
  
  return {
    allowed,
    remaining,
    resetAt,
    retryAfter,
  }
}

/**
 * Create rate limit response headers
 * Theo chuẩn RateLimit headers (draft RFC)
 */
export function createRateLimitHeaders(result: RateLimitResult, limit: number): Headers {
  const headers = new Headers()
  
  headers.set('X-RateLimit-Limit', limit.toString())
  headers.set('X-RateLimit-Remaining', result.remaining.toString())
  headers.set('X-RateLimit-Reset', result.resetAt.toISOString())
  
  if (result.retryAfter !== undefined) {
    headers.set('Retry-After', result.retryAfter.toString())
  }
  
  return headers
}
