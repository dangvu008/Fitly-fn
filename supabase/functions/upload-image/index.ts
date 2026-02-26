/**
 * File: upload-image/index.ts
 * Purpose: Upload và resize image to Supabase Storage
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: { image: base64, bucket_type: 'models'|'wardrobe'|'results' }
 * - Output: { url: string, size: number, path: string }
 * 
 * Flow:
 * 1. Validate JWT token → extract user_id
 * 2. Decode base64 → validate type (jpg/png) & size (<10MB)
 * 3. Resize image to max 1024px
 * 4. Generate unique filename (UUID)
 * 5. Upload to Storage: users/{user_id}/{bucket_type}/{uuid}.jpg
 * 6. Generate signed URL (1 hour expiration)
 * 7. Return URL + metadata
 * 
 * Security Note: Validate file size before processing, check auth token
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateImage, getFileExtension } from '../lib/image_validator.ts'
import { resizeImage } from '../lib/image_resizer.ts'
import { uploadToStorage } from '../lib/storage_uploader.ts'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UploadImageRequest {
  image: string // base64 encoded
  bucket_type: 'models' | 'wardrobe' | 'results'
}

interface UploadImageResponse {
  url: string
  size: number
  path: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validate JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify JWT và extract user_id
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    // 2. Parse request body
    const body: UploadImageRequest = await req.json()
    
    if (!body.image || !body.bucket_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: image, bucket_type' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Validate bucket_type
    const validBucketTypes = ['models', 'wardrobe', 'results']
    if (!validBucketTypes.includes(body.bucket_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid bucket_type. Must be one of: ${validBucketTypes.join(', ')}` }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // 3. Validate image (type và size)
    const validationResult = validateImage(body.image)
    
    if (!validationResult.valid) {
      return new Response(
        JSON.stringify({ error: validationResult.error }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // 4. Resize image to max 1024px
    const resizeResult = await resizeImage({
      buffer: validationResult.buffer!,
      mimeType: validationResult.mimeType!
    })

    // 5. Upload to Storage
    const uploadResult = await uploadToStorage(supabase, {
      buffer: resizeResult.resizedBuffer,
      userId: user.id,
      bucketType: body.bucket_type,
      fileExtension: getFileExtension(validationResult.mimeType!),
      mimeType: validationResult.mimeType!
    })

    // 6. Return response
    const response: UploadImageResponse = {
      url: uploadResult.url,
      size: uploadResult.size,
      path: uploadResult.path
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Upload image error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
