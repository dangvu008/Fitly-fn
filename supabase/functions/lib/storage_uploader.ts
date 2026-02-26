/**
 * File: lib/storage_uploader.ts
 * Purpose: Upload image to Supabase Storage và generate signed URL
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: { buffer: Uint8Array, userId: string, bucketType: string, fileExtension: string }
 * - Output: { url: string, path: string, size: number }
 * 
 * Flow:
 * 1. Generate unique filename (UUID)
 * 2. Construct storage path: users/{userId}/{bucketType}/{uuid}.{ext}
 * 3. Upload to Supabase Storage bucket 'users'
 * 4. Generate signed URL with 1 hour expiration
 * 5. Return URL và metadata
 * 
 * Security Note: Path structure enforces user isolation
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface UploadInput {
  buffer: Uint8Array
  userId: string
  bucketType: 'models' | 'wardrobe' | 'results'
  fileExtension: string
  mimeType: string
}

interface UploadOutput {
  url: string
  path: string
  size: number
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * Upload image to Supabase Storage
 */
export async function uploadToStorage(
  supabase: SupabaseClient,
  input: UploadInput
): Promise<UploadOutput> {
  try {
    // Generate unique filename
    const filename = `${generateUUID()}.${input.fileExtension}`
    
    // Construct storage path: users/{userId}/{bucketType}/{filename}
    const storagePath = `users/${input.userId}/${input.bucketType}/${filename}`
    
    // Upload to Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('users')
      .upload(storagePath, input.buffer, {
        contentType: input.mimeType,
        upsert: false // Không overwrite nếu file đã tồn tại
      })
    
    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }
    
    // Generate signed URL với 1 hour expiration
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('users')
      .createSignedUrl(storagePath, 3600) // 3600 seconds = 1 hour
    
    if (signedUrlError) {
      throw new Error(`Failed to generate signed URL: ${signedUrlError.message}`)
    }
    
    return {
      url: signedUrlData.signedUrl,
      path: storagePath,
      size: input.buffer.length
    }
    
  } catch (error) {
    throw new Error(`Upload to storage failed: ${error.message}`)
  }
}
