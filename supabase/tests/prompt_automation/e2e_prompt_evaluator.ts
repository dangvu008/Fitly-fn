/**
 * File: e2e_prompt_evaluator.ts
 * Purpose: End-to-end automated prompt testing against Gemini API
 *
 * This tool:
 * 1. Takes sample images (model + clothing)
 * 2. Generates prompts using the current prompt engine
 * 3. Sends to Gemini via Replicate API
 * 4. Validates the output using OutputGuard + vision checks
 * 5. Scores results and logs them for A/B comparison
 *
 * Usage:
 *   REPLICATE_API_KEY=xxx deno run --allow-all supabase/tests/prompt_automation/e2e_prompt_evaluator.ts
 *
 * Environment variables:
 *   REPLICATE_API_KEY  — Required. Your Replicate API key.
 *   TEST_MODEL_IMAGE   — Optional. URL to a test model/person image.
 *   TEST_CLOTHING_IMAGE — Optional. URL to a test clothing image (on-model preferred).
 *   PROMPT_VARIANT      — Optional. "current" (default) or "experimental" to test a new prompt.
 */

// =============================================
// TYPES
// =============================================

interface EvalTestCase {
    id: string
    name: string
    description: string
    modelImageUrl: string
    clothingImageUrl: string
    clothingType: string
    imageType: 'worn' | 'flatlay' | 'product' | 'mannequin'
    expectedOutcome: string
}

interface EvalResult {
    testCaseId: string
    promptVariant: string
    promptLength: number
    apiCallSuccess: boolean
    apiCallTimeMs: number
    resultImageUrl?: string

    // Quality scores (from vision validation)
    collageDetected: boolean
    clothingChanged: boolean
    identityPreserved: boolean
    overallScore: number  // 0-100

    // Raw validation details
    outputGuardPassed: boolean
    outputGuardReason?: string
    visionCheckDetails?: Record<string, unknown>

    error?: string
    timestamp: string
}

interface EvalReport {
    runId: string
    timestamp: string
    promptVariant: string
    totalTests: number
    passedTests: number
    failedTests: number
    avgScore: number
    avgApiTimeMs: number
    collageRate: number     // % of outputs that were collages
    clothingChangeRate: number  // % that actually changed clothing
    identityPreservationRate: number
    results: EvalResult[]
}

// =============================================
// REPLICATE API HELPERS
// =============================================

const REPLICATE_MODEL = 'google/gemini-2.5-flash-image'
const REPLICATE_TEXT_MODEL = 'google/gemini-2.5-flash-preview'

async function callGeminiImage(
    apiKey: string,
    prompt: string,
    imageUrls: string[],
    maxWaitMs = 180000,
): Promise<{ resultUrl: string; timeMs: number }> {
    const start = Date.now()
    const response = await fetch(
        `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait=60',
            },
            body: JSON.stringify({
                input: { prompt, image_input: imageUrls },
            }),
        },
    )

    if (!response.ok) {
        throw new Error(`Replicate API error ${response.status}: ${await response.text()}`)
    }

    let prediction = await response.json()

    if (prediction.status !== 'succeeded' && prediction.urls?.get) {
        const pollStart = Date.now()
        while (Date.now() - pollStart < maxWaitMs) {
            const res = await fetch(prediction.urls.get, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            })
            prediction = await res.json()
            if (prediction.status === 'succeeded') break
            if (prediction.status === 'failed' || prediction.status === 'canceled') {
                throw new Error(`Prediction ${prediction.status}: ${prediction.error}`)
            }
            await new Promise(r => setTimeout(r, 3000))
        }
    }

    const output = prediction.output
    const resultUrl = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : ''
    if (!resultUrl) throw new Error('No output URL from Replicate')

    return { resultUrl, timeMs: Date.now() - start }
}

async function callGeminiVision(
    apiKey: string,
    prompt: string,
    imageUrls: string[],
): Promise<string> {
    const response = await fetch(
        `https://api.replicate.com/v1/models/${REPLICATE_TEXT_MODEL}/predictions`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait=30',
            },
            body: JSON.stringify({
                input: { prompt, image_input: imageUrls },
            }),
        },
    )

    if (!response.ok) throw new Error(`Vision API error: ${response.status}`)

    let prediction = await response.json()
    if (prediction.status !== 'succeeded' && prediction.urls?.get) {
        const pollStart = Date.now()
        while (Date.now() - pollStart < 30000) {
            const res = await fetch(prediction.urls.get, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            })
            prediction = await res.json()
            if (prediction.status === 'succeeded') break
            if (prediction.status === 'failed') throw new Error(`Vision failed: ${prediction.error}`)
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    return typeof prediction.output === 'string' ? prediction.output : prediction.output?.[0] || ''
}

// =============================================
// VISION-BASED VALIDATORS
// =============================================

async function validateCollage(
    apiKey: string,
    resultUrl: string,
): Promise<{ isCollage: boolean; personCount: number; confidence: number; reason: string }> {
    const prompt = `Analyze this image. Count the number of distinct people and detect if it's a collage.
Answer ONLY with valid JSON:
{
  "person_count": <number>,
  "is_collage": true/false,
  "is_side_by_side": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`

    const output = await callGeminiVision(apiKey, prompt, [resultUrl])
    const match = output.match(/\{[\s\S]*\}/)
    if (!match) return { isCollage: false, personCount: 1, confidence: 0.5, reason: 'parse_error' }

    const result = JSON.parse(match[0])
    return {
        isCollage: result.is_collage === true || result.is_side_by_side === true,
        personCount: result.person_count || 1,
        confidence: result.confidence || 0.5,
        reason: result.reason || '',
    }
}

async function validateClothingChange(
    apiKey: string,
    resultUrl: string,
    originalUrl: string,
): Promise<{ changed: boolean; confidence: number; reason: string }> {
    const prompt = `Compare clothing in these two images.
Image 1 = RESULT (after processing), Image 2 = ORIGINAL (before processing).
Answer ONLY with valid JSON:
{
  "clothing_changed": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`

    const output = await callGeminiVision(apiKey, prompt, [resultUrl, originalUrl])
    const match = output.match(/\{[\s\S]*\}/)
    if (!match) return { changed: true, confidence: 0.5, reason: 'parse_error' }

    const result = JSON.parse(match[0])
    return {
        changed: result.clothing_changed !== false,
        confidence: result.confidence || 0.5,
        reason: result.reason || '',
    }
}

async function validateIdentityPreservation(
    apiKey: string,
    resultUrl: string,
    originalUrl: string,
): Promise<{ preserved: boolean; confidence: number; reason: string }> {
    const prompt = `Compare the FACE and IDENTITY of the person in these two images.
Image 1 = RESULT, Image 2 = ORIGINAL.
Is it the SAME person? Check: face shape, eyes, nose, mouth, skin tone, hair.
Answer ONLY with valid JSON:
{
  "same_person": true/false,
  "face_match_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "issues": "brief explanation of any identity differences"
}`

    const output = await callGeminiVision(apiKey, prompt, [resultUrl, originalUrl])
    const match = output.match(/\{[\s\S]*\}/)
    if (!match) return { preserved: true, confidence: 0.5, reason: 'parse_error' }

    const result = JSON.parse(match[0])
    return {
        preserved: result.same_person !== false && (result.face_match_score || 0.7) >= 0.6,
        confidence: result.confidence || 0.5,
        reason: result.issues || '',
    }
}

// =============================================
// PROMPT BUILDER (mirrors process-tryon/index.ts buildTryOnPrompt)
// =============================================

function buildTestPrompt(
    clothingType: string,
    imageType: string,
    quality: 'standard' | 'hd' = 'standard',
): string {
    const isWorn = imageType === 'worn' || imageType === 'lifestyle'
    const lines: string[] = []

    lines.push(`TASK: You are a virtual dressing room. You MUST change the clothes on the person in Image 1.`)
    lines.push(`The person in Image 1 is currently wearing certain clothes. You MUST REMOVE those clothes and REPLACE them with the garment(s) shown in the other image(s).`)
    lines.push(`The output MUST show the SAME person wearing DIFFERENT clothes. If the output looks identical to Image 1, you have FAILED.`)
    lines.push(``)
    lines.push(`═══════════════════════════════════════════`)
    lines.push(`🚫 ANTI-COLLAGE RULE (ABSOLUTE — VIOLATION = INSTANT FAIL):`)
    lines.push(`═══════════════════════════════════════════`)
    lines.push(`The output MUST contain EXACTLY ONE person. Not two, not a group.`)
    lines.push(`❌ FORBIDDEN: Side-by-side comparison of two people`)
    lines.push(`❌ FORBIDDEN: Before-and-after collage`)
    lines.push(`❌ FORBIDDEN: Split-screen or any multi-panel layout`)
    lines.push(`❌ FORBIDDEN: Showing the clothing model next to or behind the target person`)
    lines.push(`❌ FORBIDDEN: Any composition with more than one person visible`)
    lines.push(`✅ REQUIRED: A single clean photo of ONE person (the person from Image 1) wearing new clothes`)
    lines.push(`If your output contains two people or any collage layout → you have COMPLETELY FAILED → start over.`)
    lines.push(``)

    if (isWorn) {
        lines.push(`═══════════════════════════════════════════`)
        lines.push(`🔒 GARMENT EXTRACTION RULE (CRITICAL):`)
        lines.push(`═══════════════════════════════════════════`)
        lines.push(`Image 2 shows ANOTHER PERSON wearing the garment. That person is NOT your target.`)
        lines.push(`1. MENTALLY STRIP the garment off that person.`)
        lines.push(`2. Transfer ONLY the fabric/design/pattern — NOT the person's body, face, hair, or skin.`)
        lines.push(`3. RE-FIT the garment onto Image 1's person.`)
        lines.push(`4. NEVER copy-paste the clothing model into the output.`)
        lines.push(`5. NEVER show the clothing model alongside the target person.`)
        lines.push(``)
    }

    lines.push(`WHILE CHANGING CLOTHES, PRESERVE THE PERSON's IDENTITY:`)
    lines.push(`• Face: Keep the same face, expression, skin tone — from Image 1 ONLY.`)
    lines.push(`• Body: Same body shape, pose, proportions — from Image 1 ONLY.`)
    lines.push(`• Hair: Same hairstyle and color — from Image 1 ONLY.`)
    lines.push(`• Background: Keep the same scene and lighting — from Image 1 ONLY.`)
    lines.push(``)

    lines.push(`IMAGES PROVIDED:`)
    lines.push(`• Image 1 = THE PERSON (your target)`)
    if (isWorn) {
        lines.push(`• Image 2 = GARMENT SOURCE: "${clothingType}" — WORN BY ANOTHER PERSON. EXTRACT garment ONLY.`)
    } else {
        lines.push(`• Image 2 = GARMENT TO APPLY: "${clothingType}" — clean ${imageType} image.`)
    }
    lines.push(``)

    lines.push(`STEP 1 — ANALYZE the garment: type, color, pattern, fabric, construction details.`)
    lines.push(`STEP 2 — REMOVE current clothing, APPLY new garment with realistic draping.`)
    lines.push(`STEP 3 — VERIFY: Same person? Different clothing? ONE person only? No collage?`)
    lines.push(``)

    if (quality === 'hd') {
        lines.push(`QUALITY: Ultra HD photorealistic. Maximum fabric detail, zero AI artifacts.`)
    } else {
        lines.push(`QUALITY: Photorealistic, clean edges, natural appearance.`)
    }
    lines.push(``)
    lines.push(`⚠️ OUTPUT: Single photo of Image 1's person wearing new garment. EXACTLY ONE person. No collage.`)

    return lines.join('\n')
}

// =============================================
// MAIN EVALUATOR
// =============================================

async function runEvaluation(
    apiKey: string,
    testCases: EvalTestCase[],
    promptVariant: string = 'current',
): Promise<EvalReport> {
    const runId = crypto.randomUUID().slice(0, 8)
    const results: EvalResult[] = []

    console.log(`\n${'='.repeat(60)}`)
    console.log(`PROMPT EVALUATION RUN: ${runId}`)
    console.log(`Variant: ${promptVariant}`)
    console.log(`Test cases: ${testCases.length}`)
    console.log(`${'='.repeat(60)}\n`)

    for (const tc of testCases) {
        console.log(`\n--- [${tc.id}] ${tc.name} ---`)

        const result: EvalResult = {
            testCaseId: tc.id,
            promptVariant,
            promptLength: 0,
            apiCallSuccess: false,
            apiCallTimeMs: 0,
            collageDetected: false,
            clothingChanged: false,
            identityPreserved: false,
            overallScore: 0,
            outputGuardPassed: false,
            timestamp: new Date().toISOString(),
        }

        try {
            // 1. Build prompt
            const prompt = buildTestPrompt(tc.clothingType, tc.imageType)
            result.promptLength = prompt.length
            console.log(`  Prompt length: ${prompt.length} chars`)

            // 2. Call Gemini
            console.log(`  Calling Gemini...`)
            const { resultUrl, timeMs } = await callGeminiImage(
                apiKey,
                prompt,
                [tc.modelImageUrl, tc.clothingImageUrl],
            )
            result.apiCallSuccess = true
            result.apiCallTimeMs = timeMs
            result.resultImageUrl = resultUrl
            console.log(`  API call: ${timeMs}ms → ${resultUrl.substring(0, 80)}...`)

            // 3. Validate — collage detection
            console.log(`  Checking for collage...`)
            const collageCheck = await validateCollage(apiKey, resultUrl)
            result.collageDetected = collageCheck.isCollage
            console.log(`  Collage: ${collageCheck.isCollage ? '❌ YES' : '✅ NO'} (${collageCheck.personCount} people, conf: ${collageCheck.confidence})`)

            // 4. Validate — clothing change
            console.log(`  Checking clothing change...`)
            const clothingCheck = await validateClothingChange(apiKey, resultUrl, tc.modelImageUrl)
            result.clothingChanged = clothingCheck.changed
            console.log(`  Clothing changed: ${clothingCheck.changed ? '✅ YES' : '❌ NO'} (conf: ${clothingCheck.confidence})`)

            // 5. Validate — identity preservation
            console.log(`  Checking identity...`)
            const identityCheck = await validateIdentityPreservation(apiKey, resultUrl, tc.modelImageUrl)
            result.identityPreserved = identityCheck.preserved
            console.log(`  Identity preserved: ${identityCheck.preserved ? '✅ YES' : '❌ NO'} (conf: ${identityCheck.confidence})`)

            // 6. Calculate overall score
            let score = 0
            if (!result.collageDetected) score += 40  // No collage = 40 points
            if (result.clothingChanged) score += 30    // Clothing changed = 30 points
            if (result.identityPreserved) score += 30  // Identity kept = 30 points
            result.overallScore = score
            result.outputGuardPassed = score >= 70

            result.visionCheckDetails = {
                collage: collageCheck,
                clothing: clothingCheck,
                identity: identityCheck,
            }

            console.log(`  Overall score: ${score}/100 ${score >= 70 ? '✅ PASS' : '❌ FAIL'}`)

        } catch (error) {
            result.error = String(error)
            console.error(`  ❌ Error: ${result.error}`)
        }

        results.push(result)

        // Rate limit: wait between tests
        await new Promise(r => setTimeout(r, 2000))
    }

    // Generate report
    const passedTests = results.filter(r => r.overallScore >= 70).length
    const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
        : 0
    const avgApiTime = results.filter(r => r.apiCallSuccess).length > 0
        ? results.filter(r => r.apiCallSuccess).reduce((sum, r) => sum + r.apiCallTimeMs, 0) / results.filter(r => r.apiCallSuccess).length
        : 0

    const report: EvalReport = {
        runId,
        timestamp: new Date().toISOString(),
        promptVariant,
        totalTests: results.length,
        passedTests,
        failedTests: results.length - passedTests,
        avgScore: Math.round(avgScore * 10) / 10,
        avgApiTimeMs: Math.round(avgApiTime),
        collageRate: Math.round(results.filter(r => r.collageDetected).length / Math.max(results.length, 1) * 100),
        clothingChangeRate: Math.round(results.filter(r => r.clothingChanged).length / Math.max(results.length, 1) * 100),
        identityPreservationRate: Math.round(results.filter(r => r.identityPreserved).length / Math.max(results.length, 1) * 100),
        results,
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`)
    console.log(`EVALUATION REPORT: ${runId}`)
    console.log(`${'='.repeat(60)}`)
    console.log(`Variant:              ${report.promptVariant}`)
    console.log(`Total tests:          ${report.totalTests}`)
    console.log(`Passed:               ${report.passedTests} (${Math.round(report.passedTests / Math.max(report.totalTests, 1) * 100)}%)`)
    console.log(`Failed:               ${report.failedTests}`)
    console.log(`Avg score:            ${report.avgScore}/100`)
    console.log(`Avg API time:         ${report.avgApiTimeMs}ms`)
    console.log(`Collage rate:         ${report.collageRate}% (lower is better)`)
    console.log(`Clothing change rate: ${report.clothingChangeRate}% (higher is better)`)
    console.log(`Identity preserved:   ${report.identityPreservationRate}% (higher is better)`)
    console.log(`${'='.repeat(60)}\n`)

    return report
}

// =============================================
// DEFAULT TEST CASES (placeholder URLs — replace with real images)
// =============================================

const DEFAULT_TEST_CASES: EvalTestCase[] = [
    {
        id: 'E01',
        name: 'On-model top → standard person',
        description: 'Clothing worn by model, extract and apply to different person',
        modelImageUrl: Deno.env.get('TEST_MODEL_IMAGE') || 'PLACEHOLDER_MODEL_IMAGE_URL',
        clothingImageUrl: Deno.env.get('TEST_CLOTHING_IMAGE') || 'PLACEHOLDER_CLOTHING_IMAGE_URL',
        clothingType: 'top',
        imageType: 'worn',
        expectedOutcome: 'Single person wearing extracted garment, no collage',
    },
]

// =============================================
// CLI ENTRY POINT
// =============================================

if (import.meta.main) {
    const apiKey = Deno.env.get('REPLICATE_API_KEY')
    if (!apiKey) {
        console.error('ERROR: REPLICATE_API_KEY environment variable required')
        console.error('Usage: REPLICATE_API_KEY=xxx deno run --allow-all e2e_prompt_evaluator.ts')
        Deno.exit(1)
    }

    const modelImage = Deno.env.get('TEST_MODEL_IMAGE')
    const clothingImage = Deno.env.get('TEST_CLOTHING_IMAGE')

    if (!modelImage || !clothingImage) {
        console.error('ERROR: TEST_MODEL_IMAGE and TEST_CLOTHING_IMAGE URLs required')
        console.error('Example:')
        console.error('  TEST_MODEL_IMAGE=https://example.com/person.jpg \\')
        console.error('  TEST_CLOTHING_IMAGE=https://example.com/clothing.jpg \\')
        console.error('  REPLICATE_API_KEY=xxx deno run --allow-all e2e_prompt_evaluator.ts')
        Deno.exit(1)
    }

    const testCases: EvalTestCase[] = [
        {
            id: 'E01',
            name: 'On-model clothing extraction',
            description: 'Test garment extraction from on-model image',
            modelImageUrl: modelImage,
            clothingImageUrl: clothingImage,
            clothingType: 'top',
            imageType: 'worn',
            expectedOutcome: 'Single person, garment extracted and applied',
        },
    ]

    const variant = Deno.env.get('PROMPT_VARIANT') || 'current'
    const report = await runEvaluation(apiKey, testCases, variant)

    // Save report to file
    const reportPath = `./eval_report_${report.runId}.json`
    await Deno.writeTextFile(reportPath, JSON.stringify(report, null, 2))
    console.log(`Report saved to: ${reportPath}`)
}

// Export for programmatic use
export { runEvaluation, buildTestPrompt, validateCollage, validateClothingChange, validateIdentityPreservation }
export type { EvalTestCase, EvalResult, EvalReport }
