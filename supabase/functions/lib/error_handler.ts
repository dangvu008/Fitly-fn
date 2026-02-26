/**
 * File: error_handler.ts
 * Purpose: Centralized error handling và gem refund logic
 * Layer: Application
 * 
 * Data Contract:
 * - Input: { error: Error, context: ErrorContext }
 * - Output: { errorType: string, message: string, shouldRefund: boolean, statusCode: number }
 * 
 * Flow:
 * 1. Classify error type (network, validation, AI, database, etc.)
 * 2. Map internal error to user-friendly message
 * 3. Determine nếu cần refund gems
 * 4. Log error details cho debugging
 * 5. Return sanitized error response
 * 
 * Security Note: KHÔNG expose internal error details (stack traces, DB errors, API keys)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export enum ErrorType {
  // Client errors (4xx) - không refund
  INSUFFICIENT_GEMS = 'INSUFFICIENT_GEMS',
  INVALID_IMAGE = 'INVALID_IMAGE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_ITEMS = 'TOO_MANY_ITEMS',
  
  // Server errors (5xx) - có refund
  STORAGE_ERROR = 'STORAGE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REPLICATE_TIMEOUT = 'REPLICATE_TIMEOUT',
  REPLICATE_ERROR = 'REPLICATE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ErrorContext {
  userId?: string
  tryonId?: string
  gemsUsed?: number
  operation?: string
}

export interface ErrorResponse {
  errorType: ErrorType
  message: string // Internal message cho logging
  userMessage: string // User-friendly message
  shouldRefund: boolean
  statusCode: number
}

/**
 * Error mapping configuration
 */
const ERROR_CONFIG: Record<ErrorType, Omit<ErrorResponse, 'message'>> = {
  [ErrorType.INSUFFICIENT_GEMS]: {
    errorType: ErrorType.INSUFFICIENT_GEMS,
    userMessage: 'Bạn không đủ Gem để thực hiện try-on. Vui lòng mua thêm Gem.',
    shouldRefund: false,
    statusCode: 400,
  },
  [ErrorType.INVALID_IMAGE]: {
    errorType: ErrorType.INVALID_IMAGE,
    userMessage: 'Ảnh không hợp lệ. Vui lòng upload ảnh JPG/PNG dưới 10MB.',
    shouldRefund: false,
    statusCode: 400,
  },
  [ErrorType.INVALID_REQUEST]: {
    errorType: ErrorType.INVALID_REQUEST,
    userMessage: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại thông tin.',
    shouldRefund: false,
    statusCode: 400,
  },
  [ErrorType.UNAUTHORIZED]: {
    errorType: ErrorType.UNAUTHORIZED,
    userMessage: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    shouldRefund: false,
    statusCode: 401,
  },
  [ErrorType.RATE_LIMIT_EXCEEDED]: {
    errorType: ErrorType.RATE_LIMIT_EXCEEDED,
    userMessage: 'Bạn đã thực hiện quá nhiều requests. Vui lòng thử lại sau.',
    shouldRefund: false,
    statusCode: 429,
  },
  [ErrorType.TOO_MANY_ITEMS]: {
    errorType: ErrorType.TOO_MANY_ITEMS,
    userMessage: 'Tối đa 5 items quần áo cho mỗi lần try-on.',
    shouldRefund: false,
    statusCode: 400,
  },
  [ErrorType.STORAGE_ERROR]: {
    errorType: ErrorType.STORAGE_ERROR,
    userMessage: 'Lỗi upload ảnh. Gem đã được hoàn lại. Vui lòng thử lại.',
    shouldRefund: true,
    statusCode: 500,
  },
  [ErrorType.DATABASE_ERROR]: {
    errorType: ErrorType.DATABASE_ERROR,
    userMessage: 'Lỗi hệ thống. Gem đã được hoàn lại. Vui lòng thử lại sau.',
    shouldRefund: true,
    statusCode: 500,
  },
  [ErrorType.REPLICATE_TIMEOUT]: {
    errorType: ErrorType.REPLICATE_TIMEOUT,
    userMessage: 'Xử lý AI bị timeout. Gem đã được hoàn lại. Vui lòng thử lại.',
    shouldRefund: true,
    statusCode: 504,
  },
  [ErrorType.REPLICATE_ERROR]: {
    errorType: ErrorType.REPLICATE_ERROR,
    userMessage: 'AI xử lý gặp lỗi. Gem đã được hoàn lại. Vui lòng thử lại với ảnh khác.',
    shouldRefund: true,
    statusCode: 500,
  },
  [ErrorType.INTERNAL_ERROR]: {
    errorType: ErrorType.INTERNAL_ERROR,
    userMessage: 'Lỗi hệ thống. Gem đã được hoàn lại. Vui lòng thử lại sau.',
    shouldRefund: true,
    statusCode: 500,
  },
}

/**
 * Classify error type từ error object
 */
function classifyError(error: Error): ErrorType {
  const errorMessage = error.message.toLowerCase()
  
  // Check specific error patterns
  if (errorMessage.includes('insufficient gems') || errorMessage.includes('not enough gems')) {
    return ErrorType.INSUFFICIENT_GEMS
  }
  
  if (errorMessage.includes('invalid image') || errorMessage.includes('invalid file')) {
    return ErrorType.INVALID_IMAGE
  }
  
  if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid token')) {
    return ErrorType.UNAUTHORIZED
  }
  
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    return ErrorType.RATE_LIMIT_EXCEEDED
  }
  
  if (errorMessage.includes('too many items') || errorMessage.includes('maximum 5')) {
    return ErrorType.TOO_MANY_ITEMS
  }
  
  if (errorMessage.includes('storage') || errorMessage.includes('upload failed')) {
    return ErrorType.STORAGE_ERROR
  }
  
  if (errorMessage.includes('database') || errorMessage.includes('postgres')) {
    return ErrorType.DATABASE_ERROR
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return ErrorType.REPLICATE_TIMEOUT
  }
  
  if (errorMessage.includes('replicate') || errorMessage.includes('prediction')) {
    return ErrorType.REPLICATE_ERROR
  }
  
  // Default to internal error
  return ErrorType.INTERNAL_ERROR
}

/**
 * Handle try-on error và refund gems nếu cần
 * 
 * @param error - Error object
 * @param context - Error context (userId, tryonId, gemsUsed)
 * @returns ErrorResponse với user-friendly message
 */
export async function handleTryOnError(
  error: Error,
  context: ErrorContext
): Promise<ErrorResponse> {
  const errorType = classifyError(error)
  const config = ERROR_CONFIG[errorType]
  
  const errorResponse: ErrorResponse = {
    ...config,
    message: error.message,
  }
  
  // Log error cho debugging (không expose ra client)
  console.error('Try-on error:', {
    errorType,
    message: error.message,
    context,
    stack: error.stack,
  })
  
  // Refund gems nếu cần
  if (config.shouldRefund && context.userId && context.tryonId && context.gemsUsed) {
    try {
      await refundGems(context.userId, context.gemsUsed, context.tryonId)
      console.log(`Refunded ${context.gemsUsed} gems to user ${context.userId}`)
    } catch (refundError) {
      console.error('Failed to refund gems:', refundError)
      // Không throw error ở đây, vì đã có error chính rồi
    }
  }
  
  return errorResponse
}

/**
 * Refund gems cho user khi try-on fails
 */
async function refundGems(
  userId: string,
  amount: number,
  tryonId: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  // Call database function để refund gems atomically
  const { error } = await supabase.rpc('refund_gems_atomic', {
    p_user_id: userId,
    p_amount: amount,
    p_tryon_id: tryonId,
  })
  
  if (error) {
    throw new Error(`Failed to refund gems: ${error.message}`)
  }
}

/**
 * Create error response object cho Edge Function
 */
export function createErrorResponse(errorResponse: ErrorResponse): Response {
  return new Response(
    JSON.stringify({
      error: errorResponse.errorType,
      message: errorResponse.userMessage,
    }),
    {
      status: errorResponse.statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}

/**
 * Validate request body và throw typed errors
 */
export function validateRequestBody(body: any, requiredFields: string[]): void {
  if (!body) {
    throw new Error('INVALID_REQUEST: Request body is empty')
  }
  
  for (const field of requiredFields) {
    if (!(field in body)) {
      throw new Error(`INVALID_REQUEST: Missing required field: ${field}`)
    }
  }
}

/**
 * Sanitize error message để không expose sensitive info
 */
export function sanitizeErrorMessage(error: Error): string {
  const message = error.message
  
  // Remove stack traces
  const sanitized = message.split('\n')[0]
  
  // Remove file paths
  return sanitized.replace(/\/[^\s]+/g, '[path]')
}
