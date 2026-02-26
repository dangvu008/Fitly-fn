/**
 * File: get-tryon-status/index.ts
 * Purpose: Poll status của try-on processing và handle completion/failure
 * Layer: Application
 * 
 * Data Contract:
 * - Input: { tryon_id: UUID } (via URL param)
 * - Output: { status: string, result_url?: string, gems_remaining: number, error?: string }
 * 
 * Flow:
 * 1. Validate JWT token và extract user_id
 * 2. Get tryon_id từ URL params
 * 3. Query tryon_history record (RLS ensures user owns it)
 * 4. If status = 'processing', check Replicate prediction status
 * 5. If Replicate succeeded, download result và upload to Storage
 * 6. Update tryon_history với result_url và status = 'completed'
 * 7. If Replicate failed/timeout, refund gems và set status = 'failed'
 * 8. Return current status và result (nếu có)
 * 
 * Security Note:
 * - RLS policy ensures user can only query their own try-ons
 * - Validate auth token
 * - Handle timeout (>60s) với refund
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  getPredictionStatus, 
  cancelPrediction,
  extractOutputUrl,
  type PredictionResponse 
} from '../lib/replicate_client.ts'
import { 
  handleTryOnError, 
  createErrorResponse 
} from '../lib/error_handler.ts'
import { retryReplicateCall } from '../lib/retry_helper.ts'

interface GetStatusResponse {
  status: 'processing' | 'completed' | 'failed'
  result_url?: string
  gems_remaining: number
  error_message?: string
  created_at: string
  completed_at?: string
}

/**
 * CORS headers
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Timeout threshold: 60 seconds
 */
const TIMEOUT_THRESHOLD_MS = 60 * 1000

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validate JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('UNAUTHORIZED: Missing authorization header')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('UNAUTHORIZED: Invalid token')
    }

    const userId = user.id

    // 2. Get tryon_id từ URL
    const url = new URL(req.url)
    const tryonId = url.pathname.split('/').pop()

    if (!tryonId) {
      throw new Error('INVALID_REQUEST: Missing tryon_id')
    }

    // 3. Query tryon_history (RLS ensures user owns it)
    const { data: tryonRecord, error: queryError } = await supabase
      .from('tryon_history')
      .select('*')
      .eq('id', tryonId)
      .single()

    if (queryError || !tryonRecord) {
      throw new Error('INVALID_REQUEST: Try-on record not found')
    }

    // If already completed or failed, return immediately
    if (tryonRecord.status === 'completed' || tryonRecord.status === 'failed') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('gems_balance')
        .eq('id', userId)
        .single()

      const response: GetStatusResponse = {
        status: tryonRecord.status,
        result_url: tryonRecord.result_image_url,
        gems_remaining: profile?.gems_balance || 0,
        error_message: tryonRecord.error_message,
        created_at: tryonRecord.created_at,
        completed_at: tryonRecord.completed_at,
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Check if processing, poll Replicate status
    if (tryonRecord.status === 'processing') {
      const predictionId = tryonRecord.replicate_prediction_id

      if (!predictionId) {
        throw new Error('INTERNAL_ERROR: Missing prediction ID')
      }

      // Check timeout
      const createdAt = new Date(tryonRecord.created_at).getTime()
      const now = Date.now()
      const elapsed = now - createdAt

      if (elapsed > TIMEOUT_THRESHOLD_MS) {
        console.log(`Try-on ${tryonId} timed out after ${elapsed}ms`)

        // Cancel prediction
        try {
          await cancelPrediction(predictionId)
        } catch (cancelError) {
          console.error('Failed to cancel prediction:', cancelError)
        }

        // Refund gems
        await supabase.rpc('refund_gems_atomic', {
          p_user_id: userId,
          p_amount: tryonRecord.gems_used,
          p_tryon_id: tryonId,
        })

        // Update status to failed
        await supabase
          .from('tryon_history')
          .update({
            status: 'failed',
            error_message: 'Processing timeout after 60 seconds',
            completed_at: new Date().toISOString(),
          })
          .eq('id', tryonId)

        const { data: profile } = await supabase
          .from('profiles')
          .select('gems_balance')
          .eq('id', userId)
          .single()

        const response: GetStatusResponse = {
          status: 'failed',
          gems_remaining: profile?.gems_balance || 0,
          error_message: 'Processing timeout. Gems have been refunded.',
          created_at: tryonRecord.created_at,
          completed_at: new Date().toISOString(),
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Poll Replicate status
      let prediction: PredictionResponse
      try {
        prediction = await retryReplicateCall(async () => {
          return await getPredictionStatus(predictionId)
        })
      } catch (replicateError) {
        console.error('Failed to get prediction status:', replicateError)

        // Refund gems
        await supabase.rpc('refund_gems_atomic', {
          p_user_id: userId,
          p_amount: tryonRecord.gems_used,
          p_tryon_id: tryonId,
        })

        // Update status to failed
        await supabase
          .from('tryon_history')
          .update({
            status: 'failed',
            error_message: 'Failed to check AI processing status',
            completed_at: new Date().toISOString(),
          })
          .eq('id', tryonId)

        const errorMsg = replicateError instanceof Error ? replicateError.message : String(replicateError)
        throw new Error(`REPLICATE_ERROR: ${errorMsg}`)
      }

      // Handle prediction status
      if (prediction.status === 'succeeded') {
        console.log(`Try-on ${tryonId} succeeded`)

        // Extract output URL
        const outputUrl = extractOutputUrl(prediction)
        if (!outputUrl) {
          throw new Error('REPLICATE_ERROR: No output URL in prediction')
        }

        // Download result image và upload to Storage
        const resultUrl = await downloadAndUploadResult(
          supabase,
          userId,
          outputUrl,
          tryonId
        )

        // Update tryon_history
        await supabase
          .from('tryon_history')
          .update({
            status: 'completed',
            result_image_url: resultUrl,
            completed_at: new Date().toISOString(),
          })
          .eq('id', tryonId)

        const { data: profile } = await supabase
          .from('profiles')
          .select('gems_balance')
          .eq('id', userId)
          .single()

        const response: GetStatusResponse = {
          status: 'completed',
          result_url: resultUrl,
          gems_remaining: profile?.gems_balance || 0,
          created_at: tryonRecord.created_at,
          completed_at: new Date().toISOString(),
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
        console.log(`Try-on ${tryonId} failed: ${prediction.error}`)

        // Refund gems
        await supabase.rpc('refund_gems_atomic', {
          p_user_id: userId,
          p_amount: tryonRecord.gems_used,
          p_tryon_id: tryonId,
        })

        // Update status to failed
        await supabase
          .from('tryon_history')
          .update({
            status: 'failed',
            error_message: prediction.error || 'AI processing failed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', tryonId)

        const { data: profile } = await supabase
          .from('profiles')
          .select('gems_balance')
          .eq('id', userId)
          .single()

        const response: GetStatusResponse = {
          status: 'failed',
          gems_remaining: profile?.gems_balance || 0,
          error_message: 'AI processing failed. Gems have been refunded.',
          created_at: tryonRecord.created_at,
          completed_at: new Date().toISOString(),
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else {
        // Still processing
        const { data: profile } = await supabase
          .from('profiles')
          .select('gems_balance')
          .eq('id', userId)
          .single()

        const response: GetStatusResponse = {
          status: 'processing',
          gems_remaining: profile?.gems_balance || 0,
          created_at: tryonRecord.created_at,
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Should not reach here
    throw new Error('INTERNAL_ERROR: Invalid try-on status')

  } catch (error) {
    console.error('Get try-on status error:', error)

    const errorResponse = await handleTryOnError(error as Error, {
      operation: 'get-tryon-status',
    })

    return createErrorResponse(errorResponse)
  }
})

/**
 * Helper: Download result từ Replicate và upload to Supabase Storage
 */
async function downloadAndUploadResult(
  supabase: any,
  userId: string,
  resultUrl: string,
  tryonId: string
): Promise<string> {
  // Download image từ Replicate
  const response = await fetch(resultUrl)
  if (!response.ok) {
    throw new Error(`Failed to download result image: ${response.status}`)
  }

  const imageBlob = await response.blob()
  const imageData = new Uint8Array(await imageBlob.arrayBuffer())

  // Upload to Storage
  const filename = `${tryonId}.jpg`
  const path = `users/${userId}/results/${filename}`

  const { error: uploadError } = await supabase.storage
    .from('users')
    .upload(path, imageData, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`STORAGE_ERROR: Failed to upload result: ${uploadError.message}`)
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('users')
    .getPublicUrl(path)

  return urlData.publicUrl
}
