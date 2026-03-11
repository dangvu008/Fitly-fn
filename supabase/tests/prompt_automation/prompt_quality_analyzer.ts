// @ts-nocheck — Deno runtime file
/**
 * File: prompt_quality_analyzer.ts
 * Purpose: Static analysis of prompt quality — no API calls needed
 *
 * Analyzes generated prompts for:
 * 1. Anti-collage rule strength
 * 2. Garment extraction clarity
 * 3. Identity preservation emphasis
 * 4. Instruction redundancy (helpful repetition vs noise)
 * 5. Known failure pattern coverage
 * 6. Prompt token efficiency
 *
 * Run: deno run --allow-read supabase/tests/prompt_automation/prompt_quality_analyzer.ts
 */

import { DynamicPromptBuilder } from "../../functions/lib/prompt_engine/PromptBuilder.ts"
import { BASE_PROMPT, CLOTHING_ACTION_MANDATE, GARMENT_REPLACEMENT_RULE } from "../../functions/lib/prompt_engine/prompts/base.ts"
import { ALL_SCENARIOS } from "./test_scenarios.ts"

// =============================================
// QUALITY DIMENSIONS
// =============================================

interface QualityDimension {
    name: string
    score: number        // 0-100
    maxScore: number
    issues: string[]
    suggestions: string[]
}

interface PromptQualityReport {
    promptSource: string
    promptLength: number
    estimatedTokens: number
    dimensions: QualityDimension[]
    overallScore: number
    overallGrade: 'A' | 'B' | 'C' | 'D' | 'F'
    criticalIssues: string[]
    improvementSuggestions: string[]
}

// =============================================
// KNOWN FAILURE PATTERNS
// (Common issues seen in Gemini try-on outputs)
// =============================================

const KNOWN_FAILURE_PATTERNS = [
    {
        id: 'COLLAGE_OUTPUT',
        description: 'AI generates side-by-side / before-after collage instead of single image',
        severity: 'critical',
        preventionKeywords: ['collage', 'side-by-side', 'before/after', 'split-screen', 'ONE person', 'EXACTLY ONE'],
        minOccurrences: 3,  // At least 3 mentions needed for strong prevention
    },
    {
        id: 'MODEL_IDENTITY_LEAK',
        description: 'Clothing model face/body leaks into output instead of target person',
        severity: 'critical',
        preventionKeywords: ['IGNORE', 'model', 'extract', 'garment only', 'NOT your target', 'ERASE'],
        minOccurrences: 2,
    },
    {
        id: 'NO_CLOTHING_CHANGE',
        description: 'AI outputs person in original clothing unchanged',
        severity: 'critical',
        preventionKeywords: ['REMOVE', 'REPLACE', 'DIFFERENT clothing', 'CHANGE', 'VERIFY'],
        minOccurrences: 3,
    },
    {
        id: 'FACE_SWAP',
        description: 'Output face does not match target person',
        severity: 'high',
        preventionKeywords: ['face', 'PIXEL-IDENTICAL', 'identity', 'same person', 'FACE VERIFICATION'],
        minOccurrences: 2,
    },
    {
        id: 'FABRIC_HALLUCINATION',
        description: 'AI invents different fabric texture than source garment',
        severity: 'medium',
        preventionKeywords: ['fabric', 'texture', 'material', 'EXACT', 'denim', 'silk', 'cotton'],
        minOccurrences: 1,
    },
    {
        id: 'BACKGROUND_CHANGED',
        description: 'Background differs from original person photo',
        severity: 'medium',
        preventionKeywords: ['background', 'unchanged', 'PRESERVATION', 'same scene'],
        minOccurrences: 1,
    },
    {
        id: 'MULTI_PERSON_OUTPUT',
        description: 'Output contains more than one person',
        severity: 'critical',
        preventionKeywords: ['ONE person', 'single', 'EXACTLY ONE', 'only one person'],
        minOccurrences: 2,
    },
]

// =============================================
// ANALYZER FUNCTIONS
// =============================================

function estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4)
}

function countOccurrences(text: string, keyword: string): number {
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    return (text.match(regex) || []).length
}

function analyzeAntiCollage(prompt: string): QualityDimension {
    const issues: string[] = []
    const suggestions: string[] = []
    let score = 0

    const antiCollageTerms = [
        'collage', 'side-by-side', 'split-screen', 'before/after',
        'ONE person', 'EXACTLY ONE', 'single', 'FORBIDDEN',
        'two people', 'multi-panel',
    ]

    let foundCount = 0
    for (const term of antiCollageTerms) {
        const count = countOccurrences(prompt, term)
        if (count > 0) foundCount++
    }

    score = Math.min(100, Math.round(foundCount / antiCollageTerms.length * 100))

    if (foundCount < 3) {
        issues.push(`Only ${foundCount} anti-collage terms found. Minimum 3 needed for reliable prevention.`)
        suggestions.push('Add explicit anti-collage rules with ❌ FORBIDDEN markers')
    }
    if (!prompt.includes('EXACTLY ONE')) {
        issues.push('Missing "EXACTLY ONE" person requirement')
        suggestions.push('Add explicit "output MUST contain EXACTLY ONE person" rule')
    }
    if (!prompt.includes('FORBIDDEN')) {
        issues.push('No FORBIDDEN markers for collage patterns')
        suggestions.push('Use ❌ FORBIDDEN: prefix for each banned output type')
    }

    return { name: 'Anti-Collage Strength', score, maxScore: 100, issues, suggestions }
}

function analyzeGarmentExtraction(prompt: string): QualityDimension {
    const issues: string[] = []
    const suggestions: string[] = []
    let score = 0

    const extractionTerms = [
        'extract', 'garment only', 'IGNORE', 'model',
        'NOT your target', 'strip', 'ERASE',
        'clothing model', 'fabric', 'design', 'pattern',
    ]

    let foundCount = 0
    for (const term of extractionTerms) {
        if (prompt.toLowerCase().includes(term.toLowerCase())) foundCount++
    }

    score = Math.min(100, Math.round(foundCount / extractionTerms.length * 100))

    if (!prompt.includes('EXTRACT') && !prompt.includes('extract')) {
        issues.push('Missing explicit EXTRACT instruction for garment')
        suggestions.push('Add clear "EXTRACT the garment from the model" instruction')
    }
    if (!prompt.includes('NOT your target') && !prompt.includes('not your target')) {
        issues.push('Missing "NOT your target" clarification for clothing model')
        suggestions.push('Explicitly state the clothing model person is NOT the target')
    }

    return { name: 'Garment Extraction Clarity', score, maxScore: 100, issues, suggestions }
}

function analyzeIdentityPreservation(prompt: string): QualityDimension {
    const issues: string[] = []
    const suggestions: string[] = []
    let score = 0

    const identityTerms = [
        'face', 'identity', 'PIXEL-IDENTICAL', 'same person',
        'skin tone', 'hair', 'body shape', 'expression',
        'PRESERVE', 'from Image 1 ONLY',
    ]

    let foundCount = 0
    for (const term of identityTerms) {
        if (prompt.includes(term)) foundCount++
    }

    score = Math.min(100, Math.round(foundCount / identityTerms.length * 100))

    if (!prompt.includes('Image 1') && !prompt.includes('IMAGE_B')) {
        issues.push('Target person not clearly identified by image number')
        suggestions.push('Reference "Image 1" or "IMAGE_B" consistently as the identity source')
    }
    if (!prompt.includes('VERIFY') && !prompt.includes('verify')) {
        issues.push('No verification step for identity preservation')
        suggestions.push('Add a verification step: "Check output face matches Image 1"')
    }

    return { name: 'Identity Preservation', score, maxScore: 100, issues, suggestions }
}

function analyzeFailurePatternCoverage(prompt: string): QualityDimension {
    const issues: string[] = []
    const suggestions: string[] = []
    let coveredPatterns = 0

    for (const pattern of KNOWN_FAILURE_PATTERNS) {
        let keywordsFound = 0
        for (const kw of pattern.preventionKeywords) {
            if (countOccurrences(prompt, kw) > 0) keywordsFound++
        }

        if (keywordsFound >= pattern.minOccurrences) {
            coveredPatterns++
        } else {
            const severity = pattern.severity === 'critical' ? '🔴' : pattern.severity === 'high' ? '🟡' : '⚪'
            issues.push(`${severity} ${pattern.id}: Only ${keywordsFound}/${pattern.minOccurrences} prevention keywords found`)
            suggestions.push(`Strengthen prevention for "${pattern.description}" — add keywords: ${pattern.preventionKeywords.filter(kw => !prompt.toLowerCase().includes(kw.toLowerCase())).join(', ')}`)
        }
    }

    const score = Math.round(coveredPatterns / KNOWN_FAILURE_PATTERNS.length * 100)

    return { name: 'Failure Pattern Coverage', score, maxScore: 100, issues, suggestions }
}

function analyzeTokenEfficiency(prompt: string): QualityDimension {
    const issues: string[] = []
    const suggestions: string[] = []
    const tokens = estimateTokens(prompt)

    // Sweet spot: 500-2000 tokens for best Gemini performance
    let score = 100
    if (tokens < 300) {
        score = 40
        issues.push(`Prompt too short (${tokens} tokens) — may lack critical instructions`)
        suggestions.push('Expand prompt to at least 500 tokens for comprehensive instructions')
    } else if (tokens > 3000) {
        score = 60
        issues.push(`Prompt very long (${tokens} tokens) — may dilute key instructions`)
        suggestions.push('Consider condensing less critical instructions to keep focus on key rules')
    } else if (tokens > 2000) {
        score = 80
        issues.push(`Prompt moderately long (${tokens} tokens) — close to diminishing returns`)
    }

    // Check for excessive repetition
    const sentences = prompt.split(/[.\n]/).filter(s => s.trim().length > 20)
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()))
    const repetitionRate = 1 - uniqueSentences.size / Math.max(sentences.length, 1)
    if (repetitionRate > 0.2) {
        score -= 10
        issues.push(`High repetition rate (${Math.round(repetitionRate * 100)}%) — consider deduplicating`)
    }

    return { name: 'Token Efficiency', score, maxScore: 100, issues, suggestions }
}

// =============================================
// MAIN ANALYZER
// =============================================

function analyzePrompt(prompt: string, source: string = 'unknown'): PromptQualityReport {
    const dimensions = [
        analyzeAntiCollage(prompt),
        analyzeGarmentExtraction(prompt),
        analyzeIdentityPreservation(prompt),
        analyzeFailurePatternCoverage(prompt),
        analyzeTokenEfficiency(prompt),
    ]

    const overallScore = Math.round(
        dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
    )

    const gradeMap: Array<[number, 'A' | 'B' | 'C' | 'D' | 'F']> = [
        [90, 'A'], [80, 'B'], [70, 'C'], [60, 'D'], [0, 'F'],
    ]
    const overallGrade = gradeMap.find(([min]) => overallScore >= min)?.[1] || 'F'

    const criticalIssues = dimensions
        .flatMap(d => d.issues)
        .filter(i => i.includes('🔴') || i.includes('critical') || i.includes('Missing'))

    const improvementSuggestions = dimensions
        .flatMap(d => d.suggestions)
        .filter((s, i, arr) => arr.indexOf(s) === i) // deduplicate

    return {
        promptSource: source,
        promptLength: prompt.length,
        estimatedTokens: estimateTokens(prompt),
        dimensions,
        overallScore,
        overallGrade,
        criticalIssues,
        improvementSuggestions,
    }
}

function printReport(report: PromptQualityReport): void {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`PROMPT QUALITY REPORT: ${report.promptSource}`)
    console.log(`${'═'.repeat(60)}`)
    console.log(`Length: ${report.promptLength} chars (~${report.estimatedTokens} tokens)`)
    console.log(`Overall: ${report.overallScore}/100 (Grade: ${report.overallGrade})`)
    console.log(``)

    for (const dim of report.dimensions) {
        const bar = '█'.repeat(Math.round(dim.score / 5)) + '░'.repeat(20 - Math.round(dim.score / 5))
        console.log(`  ${dim.name.padEnd(30)} [${bar}] ${dim.score}/${dim.maxScore}`)
        for (const issue of dim.issues) {
            console.log(`    ⚠ ${issue}`)
        }
    }

    if (report.criticalIssues.length > 0) {
        console.log(`\n🔴 CRITICAL ISSUES:`)
        report.criticalIssues.forEach(i => console.log(`  • ${i}`))
    }

    if (report.improvementSuggestions.length > 0) {
        console.log(`\n💡 IMPROVEMENT SUGGESTIONS:`)
        report.improvementSuggestions.forEach(s => console.log(`  → ${s}`))
    }

    console.log(`${'═'.repeat(60)}\n`)
}

// =============================================
// CLI ENTRY: Analyze all prompt sources
// =============================================

if (import.meta.main) {
    console.log('=== PROMPT QUALITY ANALYSIS ===\n')

    // 1. Analyze BASE_PROMPT
    printReport(analyzePrompt(BASE_PROMPT, 'BASE_PROMPT (base.ts)'))

    // 2. Analyze CLOTHING_ACTION_MANDATE
    printReport(analyzePrompt(CLOTHING_ACTION_MANDATE, 'CLOTHING_ACTION_MANDATE'))

    // 3. Analyze DynamicPromptBuilder output for key scenarios
    const keyScenarios = ALL_SCENARIOS.filter(s =>
        ['S01_SINGLE_TOP', 'S04_SINGLE_OUTERWEAR', 'S12_COMBO_TOP_BOTTOM', 'S22_MULTIPLE_PEOPLE', 'S26_WATERMARK'].includes(s.id)
    )

    for (const scenario of keyScenarios) {
        const builder = new DynamicPromptBuilder(scenario.userIntent, scenario.sceneContext)
        await builder.loadBlocks(false)
        const result = builder.build()
        printReport(analyzePrompt(result.finalPrompt, `DynamicPromptBuilder → ${scenario.id} ${scenario.name}`))
    }

    // Summary
    console.log('\n=== ANALYSIS COMPLETE ===')
    console.log('Run E2E tests with real images to validate actual Gemini output quality.')
    console.log('Usage: REPLICATE_API_KEY=xxx TEST_MODEL_IMAGE=url TEST_CLOTHING_IMAGE=url deno run --allow-all e2e_prompt_evaluator.ts')
}

// Export for programmatic use
export { analyzePrompt, printReport, KNOWN_FAILURE_PATTERNS }
export type { PromptQualityReport, QualityDimension }
