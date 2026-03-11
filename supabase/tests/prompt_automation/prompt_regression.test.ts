// @ts-nocheck — Deno runtime file
/**
 * File: prompt_regression.test.ts
 * Purpose: Automated regression tests for Gemini prompt generation
 *
 * Tests the DynamicPromptBuilder across all 32 scenarios to ensure:
 * 1. Correct blocks are activated for each scenario
 * 2. Forbidden blocks are NOT activated
 * 3. Required phrases appear in generated prompts
 * 4. Anti-collage rules are always present
 * 5. Garment extraction rules are present for on-model images
 * 6. Prompt length stays within bounds
 *
 * Run: deno test --allow-all supabase/tests/prompt_automation/prompt_regression.test.ts
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts"
import { DynamicPromptBuilder } from "../../functions/lib/prompt_engine/PromptBuilder.ts"
import { ALL_SCENARIOS, getScenariosByGroup } from "./test_scenarios.ts"
import type { PromptTestScenario } from "./test_scenarios.ts"

// =============================================
// HELPER: Run one scenario through DynamicPromptBuilder
// =============================================

function runScenario(scenario: PromptTestScenario) {
    const builder = new DynamicPromptBuilder(
        scenario.userIntent,
        scenario.sceneContext,
    )
    // loadBlocks is async but uses defaults synchronously
    builder.loadBlocks(false)
    return builder.build()
}

// =============================================
// TEST: Each scenario activates correct blocks
// =============================================

for (const scenario of ALL_SCENARIOS) {
    Deno.test({
        name: `[${scenario.id}] ${scenario.name}: correct blocks activated`,
        fn: async () => {
            const builder = new DynamicPromptBuilder(
                scenario.userIntent,
                scenario.sceneContext,
            )
            await builder.loadBlocks(false)
            const result = builder.build()

            // Check expected blocks are present
            for (const blockId of scenario.expectedBlocks) {
                assert(
                    result.appliedBlocks.includes(blockId),
                    `${scenario.id}: Expected block "${blockId}" was NOT activated. Active: [${result.appliedBlocks.join(', ')}]`
                )
            }

            // Check forbidden blocks are NOT present
            for (const blockId of scenario.forbiddenBlocks) {
                assert(
                    !result.appliedBlocks.includes(blockId),
                    `${scenario.id}: Forbidden block "${blockId}" WAS activated. Active: [${result.appliedBlocks.join(', ')}]`
                )
            }
        },
    })
}

// =============================================
// TEST: Each scenario prompt contains required phrases
// =============================================

for (const scenario of ALL_SCENARIOS) {
    Deno.test({
        name: `[${scenario.id}] ${scenario.name}: required phrases present`,
        fn: async () => {
            const builder = new DynamicPromptBuilder(
                scenario.userIntent,
                scenario.sceneContext,
            )
            await builder.loadBlocks(false)
            const result = builder.build()

            for (const phrase of scenario.requiredPhrases) {
                assertStringIncludes(
                    result.finalPrompt,
                    phrase,
                    `${scenario.id}: Required phrase "${phrase}" NOT found in prompt`
                )
            }

            for (const phrase of scenario.forbiddenPhrases) {
                assert(
                    !result.finalPrompt.includes(phrase),
                    `${scenario.id}: Forbidden phrase "${phrase}" found in prompt`
                )
            }
        },
    })
}

// =============================================
// TEST: Prompt length within bounds
// =============================================

for (const scenario of ALL_SCENARIOS) {
    Deno.test({
        name: `[${scenario.id}] ${scenario.name}: prompt length in bounds`,
        fn: async () => {
            const builder = new DynamicPromptBuilder(
                scenario.userIntent,
                scenario.sceneContext,
            )
            await builder.loadBlocks(false)
            const result = builder.build()

            assert(
                result.finalPrompt.length >= scenario.minPromptLength,
                `${scenario.id}: Prompt too short (${result.finalPrompt.length} < ${scenario.minPromptLength})`
            )
            assert(
                result.finalPrompt.length <= scenario.maxPromptLength,
                `${scenario.id}: Prompt too long (${result.finalPrompt.length} > ${scenario.maxPromptLength})`
            )
        },
    })
}

// =============================================
// TEST: Negative prompt always present
// =============================================

for (const scenario of ALL_SCENARIOS.filter(s => s.mustContainNegativePrompt)) {
    Deno.test({
        name: `[${scenario.id}] ${scenario.name}: negative prompt present`,
        fn: async () => {
            const builder = new DynamicPromptBuilder(
                scenario.userIntent,
                scenario.sceneContext,
            )
            await builder.loadBlocks(false)
            const result = builder.build()

            assert(
                result.negativePrompt.length > 50,
                `${scenario.id}: Negative prompt too short or missing (${result.negativePrompt.length} chars)`
            )
            assertStringIncludes(result.negativePrompt, 'deformed')
            assertStringIncludes(result.negativePrompt, 'collage')
        },
    })
}

// =============================================
// TEST: Anti-collage rules in CORE_OUTPUT_FORMAT
// =============================================

Deno.test({
    name: "GLOBAL: CORE_OUTPUT_FORMAT always includes anti-collage rules",
    fn: async () => {
        // Test with a simple scenario
        const builder = new DynamicPromptBuilder(
            { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
            {
                hasMultiplePeople: false, hasMirrors: false, lighting: 'studio_cool',
                isHalfBody: false, isAngledPose: false, isSitting: false,
                isWearingBulkyClothes: false, isLowQuality: false,
                garmentComplexity: 'normal', needsTextPreservation: false,
                needsTransparencyPreservation: false, hasWatermark: false,
                isCroppedProduct: false, hasMultipleVariants: false,
            },
        )
        await builder.loadBlocks(false)
        const result = builder.build()

        // Anti-collage keywords must be in the prompt
        const antiCollageTerms = ['collage', 'side-by-side', 'ONE person']
        for (const term of antiCollageTerms) {
            assertStringIncludes(
                result.finalPrompt,
                term,
                `Anti-collage term "${term}" missing from CORE_OUTPUT_FORMAT`
            )
        }
    },
})

// =============================================
// TEST: HD quality generates correct parameters
// =============================================

Deno.test({
    name: "GLOBAL: HD quality produces correct inference parameters",
    fn: async () => {
        const builder = new DynamicPromptBuilder(
            { categories: ['top'], outfitMode: 'single_item', quality: 'hd' },
            {
                hasMultiplePeople: false, hasMirrors: false, lighting: 'studio_cool',
                isHalfBody: false, isAngledPose: false, isSitting: false,
                isWearingBulkyClothes: false, isLowQuality: false,
                garmentComplexity: 'normal', needsTextPreservation: false,
                needsTransparencyPreservation: false, hasWatermark: false,
                isCroppedProduct: false, hasMultipleVariants: false,
            },
        )
        await builder.loadBlocks(false)
        const result = builder.build()

        assertEquals(result.metadata.inferenceSteps, 75, "HD should use 75 inference steps")
        assertEquals(result.metadata.guidanceScale, 8.5, "HD should use 8.5 guidance scale")
        assertStringIncludes(result.finalPrompt, 'Ultra HD')
    },
})

Deno.test({
    name: "GLOBAL: Standard quality produces correct inference parameters",
    fn: async () => {
        const builder = new DynamicPromptBuilder(
            { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
            {
                hasMultiplePeople: false, hasMirrors: false, lighting: 'studio_cool',
                isHalfBody: false, isAngledPose: false, isSitting: false,
                isWearingBulkyClothes: false, isLowQuality: false,
                garmentComplexity: 'normal', needsTextPreservation: false,
                needsTransparencyPreservation: false, hasWatermark: false,
                isCroppedProduct: false, hasMultipleVariants: false,
            },
        )
        await builder.loadBlocks(false)
        const result = builder.build()

        assertEquals(result.metadata.inferenceSteps, 50, "Standard should use 50 inference steps")
        assertEquals(result.metadata.guidanceScale, 7.5, "Standard should use 7.5 guidance scale")
    },
})

// =============================================
// TEST: Scenario coverage — all groups have tests
// =============================================

Deno.test({
    name: "COVERAGE: All 4 scenario groups have test cases",
    fn: () => {
        const groups = ['single_item', 'outfit_combo', 'user_image_variant', 'product_image_variant'] as const
        for (const group of groups) {
            const scenarios = getScenariosByGroup(group)
            assert(
                scenarios.length >= 3,
                `Group "${group}" has too few scenarios (${scenarios.length} < 3)`
            )
        }
        assert(ALL_SCENARIOS.length >= 30, `Total scenarios too low (${ALL_SCENARIOS.length} < 30)`)
    },
})
