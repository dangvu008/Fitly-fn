/**
 * File: replicate_client.ts
 * Purpose: Wrapper cho Replicate API để gọi Gemini Flash model
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: { prompt: string, negativePrompt: string, modelImageUrl: string, clothingUrls: string[], params: object }
 * - Output: { predictionId: string } hoặc { status: string, output?: string, error?: string }
 * 
 * Flow:
 * 1. Get API key từ Deno.env.get('REPLICATE_API_KEY')
 * 2. Construct request body theo Replicate API format
 * 3. POST /predictions để tạo prediction mới
 * 4. GET /predictions/{id} để poll status
 * 5. Return prediction ID hoặc status
 * 
 * Security Note: API key PHẢI lấy từ environment variable, KHÔNG hardcode
 */

export interface CreatePredictionRequest {
  prompt: string
  negativePrompt: string
  modelImageUrl: string
  clothingUrls: string[]
  numInferenceSteps: number
  guidanceScale: number
}

export interface PredictionResponse {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string | string[] // URL của result image
  error?: string
  logs?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

/**
 * Gemini Flash model version trên Replicate
 * TODO: Update với actual model version khi deploy
 */
const GEMINI_FLASH_VERSION = 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b'

/**
 * Get Replicate API key từ environment
 */
function getApiKey(): string {
  const apiKey = Deno.env.get('REPLICATE_API_KEY')
  if (!apiKey) {
    throw new Error('REPLICATE_API_KEY not configured in Supabase Secrets')
  }
  return apiKey
}

/**
 * Create prediction trên Replicate
 * 
 * @param request - Prediction request parameters
 * @returns Prediction ID để poll status sau
 */
export async function createPrediction(
  request: CreatePredictionRequest
): Promise<string> {
  const apiKey = getApiKey()
  
  const requestBody = {
    version: GEMINI_FLASH_VERSION,
    input: {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      image: request.modelImageUrl,
      // Note: Một số models có thể không support multiple clothing images
      // Trong trường hợp đó, cần concat images hoặc adjust prompt
      num_inference_steps: request.numInferenceSteps,
      guidance_scale: request.guidanceScale,
      num_outputs: 1,
    },
  }
  
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Replicate API error: ${response.status} - ${errorText}`)
  }
  
  const data: PredictionResponse = await response.json()
  return data.id
}

/**
 * Get prediction status từ Replicate
 * 
 * @param predictionId - ID của prediction cần check
 * @returns Prediction status và output (nếu completed)
 */
export async function getPredictionStatus(
  predictionId: string
): Promise<PredictionResponse> {
  const apiKey = getApiKey()
  
  const response = await fetch(
    `https://api.replicate.com/v1/predictions/${predictionId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Replicate API error: ${response.status} - ${errorText}`)
  }
  
  const data: PredictionResponse = await response.json()
  return data
}

/**
 * Cancel prediction đang chạy (dùng khi timeout)
 * 
 * @param predictionId - ID của prediction cần cancel
 */
export async function cancelPrediction(predictionId: string): Promise<void> {
  const apiKey = getApiKey()
  
  const response = await fetch(
    `https://api.replicate.com/v1/predictions/${predictionId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to cancel prediction: ${response.status} - ${errorText}`)
  }
}

/**
 * Extract output URL từ prediction response
 * Replicate có thể trả về string hoặc array of strings
 */
export function extractOutputUrl(prediction: PredictionResponse): string | null {
  if (!prediction.output) {
    return null
  }
  
  if (typeof prediction.output === 'string') {
    return prediction.output
  }
  
  if (Array.isArray(prediction.output) && prediction.output.length > 0) {
    return prediction.output[0]
  }
  
  return null
}
