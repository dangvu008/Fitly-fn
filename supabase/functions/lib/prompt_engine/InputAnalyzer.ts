/**
 * File: prompt_engine/InputAnalyzer.ts
 * Purpose: TẦNG 0 — Gọi Gemini Vision (text-only) phân tích cả 2 ảnh
 * Layer: Application
 * Cost: Thấp (chỉ text generation, không image generation)
 */

import type { ImageAnalysis, ClothingType, OutfitType } from './types.ts'
import { INPUT_ANALYZER_PROMPT } from './prompts/base.ts'

/**
 * Phân tích ảnh sản phẩm + ảnh user → trả về structured JSON
 *
 * V1: Gọi Gemini Vision qua Replicate text-only endpoint
 * V2: Có thể cache kết quả phân tích cho cùng ảnh sản phẩm
 */
export class InputAnalyzer {
    private replicateApiKey: string
    private clientCategory: ClothingType = 'top' // Default fallback category

    constructor(replicateApiKey: string) {
        this.replicateApiKey = replicateApiKey
    }

    /**
     * Set the client-provided clothing category for better fallback routing.
     * Called by Pipeline when client_hints contain category info.
     */
    setClientCategory(category: string): void {
        if (category) {
            this.clientCategory = category as ClothingType
            console.log(`[InputAnalyzer] Client category hint set: ${category}`)
        }
    }

    /**
     * Phân tích cả 2 ảnh — trả về ImageAnalysis JSON
     */
    async analyze(productImageUrl: string, personImageUrl: string): Promise<ImageAnalysis> {
        console.log('[InputAnalyzer] 🔍 Analyzing images...')
        const start = Date.now()

        try {
            const response = await fetch(
                'https://api.replicate.com/v1/models/google/gemini-2.5-flash-preview/predictions',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.replicateApiKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'wait=60',
                    },
                    body: JSON.stringify({
                        input: {
                            prompt: INPUT_ANALYZER_PROMPT,
                            image_input: [productImageUrl, personImageUrl],
                        },
                    }),
                }
            )

            if (!response.ok) {
                throw new Error(`Replicate API error ${response.status}: ${await response.text()}`)
            }

            const prediction = await response.json()
            let output = prediction.output

            // Poll nếu chưa xong
            if (prediction.status !== 'succeeded' && prediction.urls?.get) {
                output = await this.pollForResult(prediction.urls.get)
            }

            // Parse JSON từ output text
            const jsonStr = this.extractJson(typeof output === 'string' ? output : output?.[0] || '')
            const analysis: ImageAnalysis = JSON.parse(jsonStr)

            console.log(`[InputAnalyzer] ✅ Done in ${Date.now() - start}ms`)
            console.log(`[InputAnalyzer] Source: ${analysis.image_a_product.source_type}`)
            console.log(`[InputAnalyzer] Outfit: ${analysis.image_a_product.total_outfit_type}`)
            console.log(`[InputAnalyzer] Person: ${analysis.image_b_person.photo_type}`)
            console.log(`[InputAnalyzer] Can try: ${analysis.compatibility_check.can_try_on}`)

            return analysis
        } catch (error) {
            console.error('[InputAnalyzer] ❌ Error:', error)
            // Fallback: trả về phân tích mặc định (đơn giản nhất)
            return this.fallbackAnalysis()
        }
    }

    private async pollForResult(url: string): Promise<string> {
        const maxWait = 60000
        const start = Date.now()
        while (Date.now() - start < maxWait) {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.replicateApiKey}` },
            })
            const data = await res.json()
            if (data.status === 'succeeded') {
                return typeof data.output === 'string' ? data.output : data.output?.[0] || ''
            }
            if (data.status === 'failed' || data.status === 'canceled') {
                throw new Error(`Prediction ${data.status}: ${data.error}`)
            }
            await new Promise(r => setTimeout(r, 2000))
        }
        throw new Error('InputAnalyzer poll timeout')
    }

    /**
     * Trích xuất JSON từ text output (có thể chứa ```json ... ``` wrapper)
     */
    private extractJson(text: string): string {
        // Thử tìm JSON block trong markdown code fence
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (fenceMatch) return fenceMatch[1].trim()

        // Thử tìm JSON object trực tiếp
        const braceMatch = text.match(/\{[\s\S]*\}/)
        if (braceMatch) return braceMatch[0]

        throw new Error('Cannot extract JSON from analyzer output')
    }

    /**
     * Fallback khi phân tích thất bại — uses client-provided category if available
     */
    fallbackAnalysis(): ImageAnalysis {
        const category = this.clientCategory || 'top'
        console.warn(`[InputAnalyzer] ⚠️ Using fallback analysis (category: ${category})`)

        // Map category to outfit type
        const outfitTypeMap: Record<string, OutfitType> = {
            top: 'single_top',
            bottom: 'single_bottom',
            dress: 'single_dress',
            jumpsuit: 'single_dress',
            outerwear: 'single_outerwear',
            shoes: 'single_accessory',
            hat: 'single_accessory',
            eyewear: 'single_accessory',
        }

        return {
            image_a_product: {
                source_type: 'professional_ecommerce',
                noise_elements: ['none'],
                clothing_items: [{
                    type: category,
                    sub_type: 'unknown',
                    color_primary: 'unknown',
                    color_secondary: null,
                    pattern: 'solid',
                    material_appearance: 'cotton',
                    key_details: '',
                    visibility: 'full',
                    confidence: 'low',
                }],
                total_outfit_type: outfitTypeMap[category] || 'single_top',
                model_in_product: {
                    exists: true,
                    pose: 'standing_front',
                    body_parts_visible: ['upper_body', 'lower_body'],
                },
            },
            image_b_person: {
                photo_type: 'full_body_standing',
                body_visibility: {
                    head_face: true, neck_shoulders: true, chest_torso: true,
                    waist_hips: true, upper_legs: true, lower_legs: true,
                    feet: true, left_arm: true, right_arm: true,
                },
                current_clothing: { top: 'unknown', bottom: 'unknown', shoes: 'unknown', outerwear: null, accessories: [] },
                pose_details: { facing: 'front', arms: 'at_sides', legs: 'together', body_tilt: 'straight' },
                photo_issues: ['none'],
                objects_in_frame: [],
            },
            compatibility_check: {
                can_try_on: true,
                tryable_items: [category],
                not_tryable_items: [],
                warnings: ['Analysis fallback used — results may be less accurate'],
                needs_user_input: false,
                user_question: null,
            },
        }
    }
}
