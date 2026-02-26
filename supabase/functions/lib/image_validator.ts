/**
 * File: lib/image_validator.ts
 * Purpose: Validate image type và size trước khi xử lý
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: base64 string
 * - Output: { valid: boolean, error?: string, buffer?: Uint8Array, mimeType?: string }
 * 
 * Flow:
 * 1. Decode base64 string
 * 2. Detect MIME type từ magic bytes
 * 3. Validate type (jpg/png only)
 * 4. Validate size (<= 10MB)
 * 
 * Security Note: Check magic bytes, không tin vào file extension
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

interface ValidationResult {
  valid: boolean
  error?: string
  buffer?: Uint8Array
  mimeType?: string
}

/**
 * Detect MIME type từ magic bytes (file signature)
 */
function detectMimeType(buffer: Uint8Array): string | null {
  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg'
  }
  
  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return 'image/png'
  }
  
  return null
}

/**
 * Validate image từ base64 string
 */
export function validateImage(base64Image: string): ValidationResult {
  try {
    // Remove data URL prefix nếu có (data:image/jpeg;base64,...)
    const base64Data = base64Image.includes(',') 
      ? base64Image.split(',')[1] 
      : base64Image
    
    // Decode base64 to binary
    const binaryString = atob(base64Data)
    const buffer = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      buffer[i] = binaryString.charCodeAt(i)
    }
    
    // Validate size
    if (buffer.length > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum 10MB`
      }
    }
    
    // Detect MIME type từ magic bytes
    const mimeType = detectMimeType(buffer)
    
    if (!mimeType) {
      return {
        valid: false,
        error: 'Invalid image format. Only JPEG and PNG are supported.'
      }
    }
    
    return {
      valid: true,
      buffer,
      mimeType
    }
    
  } catch (error) {
    return {
      valid: false,
      error: `Failed to decode image: ${error.message}`
    }
  }
}

/**
 * Get file extension từ MIME type
 */
export function getFileExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    default:
      return 'bin'
  }
}
