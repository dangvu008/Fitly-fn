/**
 * File: lib/image_resizer.ts
 * Purpose: Resize image to max 1024px while maintaining aspect ratio
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: { buffer: Uint8Array, mimeType: string }
 * - Output: { resizedBuffer: Uint8Array, width: number, height: number }
 * 
 * Flow:
 * 1. Decode image to get dimensions
 * 2. Calculate new dimensions (max 1024px, maintain aspect ratio)
 * 3. Resize image using imagescript
 * 4. Encode back to original format
 * 
 * Security Note: Validate dimensions before processing
 */

// Import imagescript for image processing
// Note: Using npm: specifier for Deno to import from npm
import { Image } from 'npm:imagescript@1.3.0'

const MAX_DIMENSION = 1024

interface ResizeInput {
  buffer: Uint8Array
  mimeType: string
}

interface ResizeOutput {
  resizedBuffer: Uint8Array
  width: number
  height: number
}

/**
 * Calculate new dimensions maintaining aspect ratio
 */
function calculateNewDimensions(
  originalWidth: number,
  originalHeight: number
): { width: number; height: number } {
  // Nếu cả 2 dimensions đều <= MAX_DIMENSION, giữ nguyên
  if (originalWidth <= MAX_DIMENSION && originalHeight <= MAX_DIMENSION) {
    return { width: originalWidth, height: originalHeight }
  }
  
  // Tính scale factor dựa trên dimension lớn hơn
  const scaleFactor = Math.min(
    MAX_DIMENSION / originalWidth,
    MAX_DIMENSION / originalHeight
  )
  
  return {
    width: Math.round(originalWidth * scaleFactor),
    height: Math.round(originalHeight * scaleFactor)
  }
}

/**
 * Resize image to max 1024px
 */
export async function resizeImage(input: ResizeInput): Promise<ResizeOutput> {
  try {
    // Decode image
    let image: Image
    
    if (input.mimeType === 'image/jpeg') {
      image = await Image.decode(input.buffer)
    } else if (input.mimeType === 'image/png') {
      image = await Image.decode(input.buffer)
    } else {
      throw new Error(`Unsupported MIME type: ${input.mimeType}`)
    }
    
    const originalWidth = image.width
    const originalHeight = image.height
    
    // Calculate new dimensions
    const { width, height } = calculateNewDimensions(originalWidth, originalHeight)
    
    // Resize nếu cần
    if (width !== originalWidth || height !== originalHeight) {
      image = image.resize(width, height)
    }
    
    // Encode back to original format
    let resizedBuffer: Uint8Array
    
    if (input.mimeType === 'image/jpeg') {
      resizedBuffer = await image.encodeJPEG(90) // Quality 90%
    } else {
      resizedBuffer = await image.encodePNG()
    }
    
    return {
      resizedBuffer,
      width,
      height
    }
    
  } catch (error) {
    throw new Error(`Failed to resize image: ${error.message}`)
  }
}
