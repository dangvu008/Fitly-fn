/**
 * File: retry_helper.ts
 * Purpose: Exponential backoff retry logic cho network errors
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: { fn: async function, maxRetries: number, baseDelay: number }
 * - Output: Result của function hoặc throw error sau max retries
 * 
 * Flow:
 * 1. Try execute function
 * 2. If success, return result
 * 3. If error và chưa hết retries, wait với exponential delay
 * 4. Retry với delay tăng dần: baseDelay * 2^attempt
 * 5. Sau maxRetries, throw error cuối cùng
 * 
 * Security Note: Không có sensitive data, chỉ retry logic
 */

export interface RetryOptions {
  maxRetries?: number // Default: 3
  baseDelay?: number // Default: 1000ms
  maxDelay?: number // Default: 30000ms (30s)
  shouldRetry?: (error: Error) => boolean // Custom retry condition
}

/**
 * Default retry condition: retry trên network errors
 */
function defaultShouldRetry(error: Error): boolean {
  const retryableErrors = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'NetworkError',
    'FetchError',
    'TimeoutError',
  ]
  
  const errorMessage = error.message || error.toString()
  return retryableErrors.some((msg) => errorMessage.includes(msg))
}

/**
 * Calculate delay với exponential backoff
 * Delay = baseDelay * 2^attempt, capped at maxDelay
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const delay = baseDelay * Math.pow(2, attempt)
  return Math.min(delay, maxDelay)
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry function với exponential backoff
 * 
 * @param fn - Async function cần retry
 * @param options - Retry options
 * @returns Result của function
 * @throws Error sau khi hết retries
 * 
 * @example
 * const result = await retryWithBackoff(
 *   async () => await fetch('https://api.example.com'),
 *   { maxRetries: 3, baseDelay: 1000 }
 * )
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = defaultShouldRetry,
  } = options
  
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Nếu đã hết retries, throw error
      if (attempt === maxRetries) {
        throw lastError
      }
      
      // Check xem có nên retry không
      if (!shouldRetry(lastError)) {
        throw lastError
      }
      
      // Calculate delay và sleep
      const delay = calculateDelay(attempt, baseDelay, maxDelay)
      console.log(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms. Error: ${lastError.message}`
      )
      await sleep(delay)
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Retry failed with unknown error')
}

/**
 * Retry với timeout
 * Combine retry logic với timeout để tránh hang forever
 * 
 * @param fn - Async function cần retry
 * @param timeoutMs - Timeout cho mỗi attempt (ms)
 * @param options - Retry options
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(async () => {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('TimeoutError')), timeoutMs)
      ),
    ])
  }, options)
}

/**
 * Retry specifically cho Replicate API calls
 * Có custom retry condition cho Replicate errors
 */
export async function retryReplicateCall<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(fn, {
    maxRetries: 3,
    baseDelay: 2000, // Start với 2s cho API calls
    maxDelay: 30000,
    shouldRetry: (error: Error) => {
      // Retry trên network errors
      if (defaultShouldRetry(error)) {
        return true
      }
      
      // Retry trên 5xx server errors
      const errorMessage = error.message
      if (errorMessage.includes('500') || errorMessage.includes('502') || 
          errorMessage.includes('503') || errorMessage.includes('504')) {
        return true
      }
      
      // Retry trên rate limit (429)
      if (errorMessage.includes('429')) {
        return true
      }
      
      // KHÔNG retry trên 4xx client errors (trừ 429)
      if (errorMessage.includes('400') || errorMessage.includes('401') || 
          errorMessage.includes('403') || errorMessage.includes('404')) {
        return false
      }
      
      return false
    },
    ...options,
  })
}
