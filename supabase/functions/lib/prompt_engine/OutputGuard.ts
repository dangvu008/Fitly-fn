/**
 * File: prompt_engine/OutputGuard.ts
 * Purpose: Detect when AI returns an unprocessed input image instead of a real try-on result
 * Layer: Application (Validation)
 * Domain: Try-On → [output quality check]
 *
 * Data Contract:
 * - Input:  result image URL + input image URLs (model + clothing) + optional replicateApiKey
 * - Output: { passed: boolean, reason?: string, suspectedMatch?: string }
 *
 * Strategy:
 * 1. URL comparison (fastest)
 * 2. Image file size comparison
 * 3. Pixel hash (first bytes) comparison
 * 4. Vision-based clothing change detection (Gemini — if API key provided)
 *
 * Edge Cases:
 * - Network error fetching images → pass through (don't block user)
 * - Result URL same domain as input → extra suspicious
 * - Vision API error → pass through (don't block user)
 */

export interface OutputGuardResult {
    passed: boolean
    reason?: string
    suspectedMatch?: 'model_image' | 'clothing_image' | 'clothing_not_changed' | 'collage_detected' | 'model_identity_leaked'
    matchedUrl?: string
    confidence: number // 0-1, how confident we are this is a duplicate
}

/**
 * Check if the AI output is just a copy of one of the input images,
 * or if the clothing was not actually changed.
 * Uses URL comparison + image size comparison + pixel hash as fast pre-checks,
 * then optional vision-based clothing change detection.
 */
export async function guardOutput(
    resultImageUrl: string,
    modelImageUrl: string,
    clothingImageUrls: string[],
    replicateApiKey?: string,
): Promise<OutputGuardResult> {
    const pass: OutputGuardResult = { passed: true, confidence: 0 }

    try {
        // ═══ CHECK 1: URL-level match (fastest) ═══
        // If result URL literally matches an input URL → definitely not processed
        const normalizeUrl = (url: string) => {
            try {
                const u = new URL(url)
                // Remove query params like cache busters, tokens
                return u.origin + u.pathname
            } catch { return url }
        }

        const resultNorm = normalizeUrl(resultImageUrl)

        if (normalizeUrl(modelImageUrl) === resultNorm) {
            console.warn('[OutputGuard] ❌ Result URL matches model image URL exactly!')
            return {
                passed: false,
                reason: 'AI returned the original person photo unchanged',
                suspectedMatch: 'model_image',
                matchedUrl: modelImageUrl,
                confidence: 1.0,
            }
        }

        for (const clothingUrl of clothingImageUrls) {
            if (normalizeUrl(clothingUrl) === resultNorm) {
                console.warn('[OutputGuard] ❌ Result URL matches clothing image URL exactly!')
                return {
                    passed: false,
                    reason: 'AI returned the original clothing photo unchanged',
                    suspectedMatch: 'clothing_image',
                    matchedUrl: clothingUrl,
                    confidence: 1.0,
                }
            }
        }

        // ═══ CHECK 2: Image size comparison ═══
        // Download headers only (Content-Length) to compare file sizes
        // If result has IDENTICAL file size to any input → very suspicious
        const getContentLength = async (url: string): Promise<number | null> => {
            try {
                const resp = await fetch(url, { method: 'HEAD' })
                const cl = resp.headers.get('content-length')
                return cl ? parseInt(cl, 10) : null
            } catch { return null }
        }

        const [resultSize, modelSize, ...clothingSizes] = await Promise.all([
            getContentLength(resultImageUrl),
            getContentLength(modelImageUrl),
            ...clothingImageUrls.map(url => getContentLength(url)),
        ])

        if (resultSize && resultSize > 0) {
            // Exact size match with model image
            if (modelSize && resultSize === modelSize) {
                console.warn(`[OutputGuard] ⚠️ Result size (${resultSize}) matches model image size exactly`)
                return {
                    passed: false,
                    reason: 'AI returned an image identical in size to the person photo — likely unprocessed',
                    suspectedMatch: 'model_image',
                    matchedUrl: modelImageUrl,
                    confidence: 0.85,
                }
            }

            // Exact size match with any clothing image
            for (let i = 0; i < clothingSizes.length; i++) {
                if (clothingSizes[i] && resultSize === clothingSizes[i]) {
                    console.warn(`[OutputGuard] ⚠️ Result size (${resultSize}) matches clothing image[${i}] size exactly`)
                    return {
                        passed: false,
                        reason: 'AI returned an image identical in size to the clothing photo — likely unprocessed',
                        suspectedMatch: 'clothing_image',
                        matchedUrl: clothingImageUrls[i],
                        confidence: 0.85,
                    }
                }
            }

            // Size very close (within 1%) to any input → suspicious but not conclusive
            const isNearSize = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) < 0.01
            if (modelSize && isNearSize(resultSize, modelSize)) {
                console.warn(`[OutputGuard] ⚠️ Result size (${resultSize}) very close to model image (${modelSize})`)
                // Don't fail, but log for monitoring
            }
            for (let i = 0; i < clothingSizes.length; i++) {
                if (clothingSizes[i] && isNearSize(resultSize, clothingSizes[i]!)) {
                    console.warn(`[OutputGuard] ⚠️ Result size (${resultSize}) very close to clothing[${i}] (${clothingSizes[i]})`)
                }
            }
        }

        // ═══ CHECK 3: Pixel hash comparison ═══
        // Download small portions of result + inputs and compare raw bytes
        // This catches cases where URLs differ but content is identical
        const getFirstBytes = async (url: string, bytes = 4096): Promise<Uint8Array | null> => {
            try {
                const resp = await fetch(url, {
                    headers: { 'Range': `bytes=0-${bytes - 1}` },
                })
                // Some servers don't support Range → fall back to full download
                const buffer = await resp.arrayBuffer()
                return new Uint8Array(buffer.slice(0, bytes))
            } catch { return null }
        }

        const [resultBytes, modelBytes, ...clothingBytes] = await Promise.all([
            getFirstBytes(resultImageUrl),
            getFirstBytes(modelImageUrl),
            ...clothingImageUrls.map(url => getFirstBytes(url)),
        ])

        if (resultBytes) {
            const bytesMatch = (a: Uint8Array, b: Uint8Array | null): boolean => {
                if (!b) return false
                if (a.length !== b.length) return false
                for (let i = 0; i < a.length; i++) {
                    if (a[i] !== b[i]) return false
                }
                return true
            }

            if (bytesMatch(resultBytes, modelBytes)) {
                console.warn('[OutputGuard] ❌ Result pixel data matches model image!')
                return {
                    passed: false,
                    reason: 'AI returned the original person photo (byte-identical)',
                    suspectedMatch: 'model_image',
                    matchedUrl: modelImageUrl,
                    confidence: 0.95,
                }
            }

            for (let i = 0; i < clothingBytes.length; i++) {
                if (bytesMatch(resultBytes, clothingBytes[i])) {
                    console.warn(`[OutputGuard] ❌ Result pixel data matches clothing image[${i}]!`)
                    return {
                        passed: false,
                        reason: 'AI returned the original clothing photo (byte-identical)',
                        suspectedMatch: 'clothing_image',
                        matchedUrl: clothingImageUrls[i],
                        confidence: 0.95,
                    }
                }
            }
        }

        // ═══ CHECK 4: Vision-based clothing change detection ═══
        // Uses Gemini Vision to semantically verify clothing was actually changed.
        // Only runs when all byte-level checks pass AND API key is provided.
        if (replicateApiKey) {
            try {
                console.log('[OutputGuard] 🔍 CHECK 4: Vision-based clothing change detection...')
                const visionResult = await checkClothingChanged(
                    resultImageUrl,
                    modelImageUrl,
                    replicateApiKey,
                )
                if (!visionResult.changed) {
                    console.warn(`[OutputGuard] ❌ Vision check: clothing NOT changed! Reason: ${visionResult.reason}`)
                    return {
                        passed: false,
                        reason: `AI generated image but clothing was not changed: ${visionResult.reason}`,
                        suspectedMatch: 'clothing_not_changed',
                        confidence: visionResult.confidence,
                    }
                }
                console.log(`[OutputGuard] ✅ Vision check: clothing changed (confidence: ${visionResult.confidence})`)
            } catch (visionError) {
                // Vision check errors should NEVER block the user
                console.warn('[OutputGuard] ⚠️ Vision check error (passing through):', visionError)
            }

            // ═══ CHECK 5: Collage / dual-person detection ═══
            // Detects when AI outputs a side-by-side, collage, or shows
            // the clothing model next to the target person.
            try {
                console.log('[OutputGuard] 🔍 CHECK 5: Collage/dual-person detection...')
                const collageResult = await checkForCollageOrDualPerson(
                    resultImageUrl,
                    replicateApiKey,
                )
                if (collageResult.isCollage) {
                    console.warn(`[OutputGuard] ❌ Collage/dual-person detected! Reason: ${collageResult.reason}`)
                    return {
                        passed: false,
                        reason: `AI generated a collage or multi-person image instead of a single try-on result: ${collageResult.reason}`,
                        suspectedMatch: 'collage_detected',
                        confidence: collageResult.confidence,
                    }
                }
                console.log(`[OutputGuard] ✅ Single-person output confirmed (confidence: ${collageResult.confidence})`)
            } catch (collageError) {
                console.warn('[OutputGuard] ⚠️ Collage check error (passing through):', collageError)
            }
        }

        console.log('[OutputGuard] ✅ Output appears to be a genuinely processed image')
        return pass

    } catch (error) {
        // OutputGuard errors should NEVER block the user
        console.error('[OutputGuard] Error during check (passing through):', error)
        return pass
    }
}

/**
 * Use Gemini Vision (text-only, low cost) to check if the person's
 * clothing actually changed between the original (model) image and the result.
 */
async function checkClothingChanged(
    resultImageUrl: string,
    modelImageUrl: string,
    replicateApiKey: string,
): Promise<{ changed: boolean; reason: string; confidence: number }> {
    const prompt = `You are a clothing comparison expert. You will receive TWO images:
- IMAGE 1 (first): The RESULT image after virtual try-on processing
- IMAGE 2 (second): The ORIGINAL person photo BEFORE try-on

Your task: Compare the clothing the person is wearing in both images.

Answer ONLY with a valid JSON object:
{
  "clothing_changed": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation"
}

Rules:
- If the person is wearing DIFFERENT clothing (different color, pattern, style, or garment type) → clothing_changed: true
- If the person is wearing the SAME or nearly identical clothing → clothing_changed: false
- Focus on the main garment (top/dress/outerwear), not minor accessories
- Ignore background, lighting, or pose differences
- A confidence of 0.9+ means you are very certain`

    const response = await fetch(
        'https://api.replicate.com/v1/models/google/gemini-2.5-flash-preview/predictions',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${replicateApiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait=30',
            },
            body: JSON.stringify({
                input: {
                    prompt,
                    image_input: [resultImageUrl, modelImageUrl],
                },
            }),
        }
    )

    if (!response.ok) {
        throw new Error(`Vision API error ${response.status}: ${await response.text()}`)
    }

    const prediction = await response.json()
    let output = prediction.output

    // Poll if not done yet
    if (prediction.status !== 'succeeded' && prediction.urls?.get) {
        const maxWait = 30000
        const start = Date.now()
        while (Date.now() - start < maxWait) {
            const res = await fetch(prediction.urls.get, {
                headers: { 'Authorization': `Bearer ${replicateApiKey}` },
            })
            const data = await res.json()
            if (data.status === 'succeeded') {
                output = typeof data.output === 'string' ? data.output : data.output?.[0] || ''
                break
            }
            if (data.status === 'failed' || data.status === 'canceled') {
                throw new Error(`Vision prediction ${data.status}: ${data.error}`)
            }
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    // Parse JSON from output
    const outputText = typeof output === 'string' ? output : output?.[0] || ''
    const jsonMatch = outputText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
        throw new Error('Cannot parse vision check output')
    }

    const result = JSON.parse(jsonMatch[0])
    return {
        changed: result.clothing_changed === true,
        reason: result.reason || 'unknown',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
    }
}

/**
 * Use Gemini Vision to detect if the output image is a collage,
 * side-by-side comparison, or contains multiple people (common AI failure).
 */
async function checkForCollageOrDualPerson(
    resultImageUrl: string,
    replicateApiKey: string,
): Promise<{ isCollage: boolean; reason: string; confidence: number }> {
    const prompt = `You are an image composition analyzer. Analyze this SINGLE image and determine:

1. How many distinct people are visible in this image?
2. Is this image a collage, side-by-side comparison, split-screen, or before/after layout?
3. Does the image show the same scene from one camera angle, or multiple compositions stitched together?

Answer ONLY with a valid JSON object:
{
  "person_count": <number>,
  "is_collage": true or false,
  "is_side_by_side": true or false,
  "has_split_layout": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation"
}

Rules:
- Count ALL visible people (even partially visible ones)
- A collage means multiple separate photos combined into one image
- Side-by-side means two or more photos placed next to each other horizontally or vertically
- A normal photo with one person in a mirror reflection counts as 1 person (not collage)
- A group photo is NOT a collage — it's one photo with multiple people
- Focus on whether the image looks like an AI tried to show comparison/before-after
- confidence 0.9+ means you are very certain`

    const response = await fetch(
        'https://api.replicate.com/v1/models/google/gemini-2.5-flash-preview/predictions',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${replicateApiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait=30',
            },
            body: JSON.stringify({
                input: {
                    prompt,
                    image_input: [resultImageUrl],
                },
            }),
        }
    )

    if (!response.ok) {
        throw new Error(`Vision API error ${response.status}: ${await response.text()}`)
    }

    const prediction = await response.json()
    let output = prediction.output

    if (prediction.status !== 'succeeded' && prediction.urls?.get) {
        const maxWait = 30000
        const start = Date.now()
        while (Date.now() - start < maxWait) {
            const res = await fetch(prediction.urls.get, {
                headers: { 'Authorization': `Bearer ${replicateApiKey}` },
            })
            const data = await res.json()
            if (data.status === 'succeeded') {
                output = typeof data.output === 'string' ? data.output : data.output?.[0] || ''
                break
            }
            if (data.status === 'failed' || data.status === 'canceled') {
                throw new Error(`Vision prediction ${data.status}: ${data.error}`)
            }
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    const outputText = typeof output === 'string' ? output : output?.[0] || ''
    const jsonMatch = outputText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
        throw new Error('Cannot parse collage check output')
    }

    const result = JSON.parse(jsonMatch[0])
    const personCount = typeof result.person_count === 'number' ? result.person_count : 1
    const isCollage = result.is_collage === true || result.is_side_by_side === true || result.has_split_layout === true
    const hasTooManyPeople = personCount >= 2 && isCollage

    return {
        isCollage: isCollage || hasTooManyPeople,
        reason: result.reason || (hasTooManyPeople ? `Detected ${personCount} people in collage layout` : 'unknown'),
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
    }
}
