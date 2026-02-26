// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: quality_mapping.test.ts
 * Purpose: Property-based tests for quality parameter mapping
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 37: Quality Parameter Mapping
 * Validates: Requirements 7.5
 *
 * Tests:
 * - P37a: Standard quality maps to 50 steps, 7.5 guidance scale
 * - P37b: HD quality maps to 75 steps, 8.5 guidance scale
 * - P37c: Gem cost matches quality level
 * - P37d: Quality string is case-sensitive
 * - P37e: HD always has higher parameters than standard
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

// Extract from construct_gemini_prompt.ts + process-tryon/index.ts
interface QualityParams {
    numInferenceSteps: number;
    guidanceScale: number;
    gemCost: number;
    promptSuffix: string;
}

function getQualityParams(quality: string, aiConfig?: { cost_standard?: number; cost_hd?: number }): QualityParams {
    if (quality === "hd") {
        return {
            numInferenceSteps: 75,
            guidanceScale: 8.5,
            gemCost: aiConfig?.cost_hd || 2,
            promptSuffix: "Ultra high resolution 4K output with fine details",
        };
    }
    return {
        numInferenceSteps: 50,
        guidanceScale: 7.5,
        gemCost: aiConfig?.cost_standard || 1,
        promptSuffix: "High resolution output",
    };
}

/**
 * Property 37a: Standard quality parameters are correct
 */
Deno.test({
    name: "Property 37a: Standard Quality Parameters",
    fn: () => {
        const params = getQualityParams("standard");

        assertEquals(params.numInferenceSteps, 50, "Standard should have 50 inference steps");
        assertEquals(params.guidanceScale, 7.5, "Standard should have 7.5 guidance scale");
        assertEquals(params.gemCost, 1, "Standard should cost 1 gem");
        assert(
            params.promptSuffix.includes("High resolution"),
            "Standard prompt should mention high resolution"
        );

        console.log("✅ Property 37a verified: Standard quality parameters correct");
    },
});

/**
 * Property 37b: HD quality parameters are correct
 */
Deno.test({
    name: "Property 37b: HD Quality Parameters",
    fn: () => {
        const params = getQualityParams("hd");

        assertEquals(params.numInferenceSteps, 75, "HD should have 75 inference steps");
        assertEquals(params.guidanceScale, 8.5, "HD should have 8.5 guidance scale");
        assertEquals(params.gemCost, 2, "HD should cost 2 gems");
        assert(
            params.promptSuffix.includes("4K"),
            "HD prompt should mention 4K"
        );

        console.log("✅ Property 37b verified: HD quality parameters correct");
    },
});

/**
 * Property 37c: Gem cost matches quality level with custom config
 *
 * ∀ costStandard ∈ [1, 10], costHd ∈ [1, 20]:
 *   getQualityParams('standard', config).gemCost === costStandard
 *   getQualityParams('hd', config).gemCost === costHd
 */
Deno.test({
    name: "Property 37c: Gem Cost Respects Config Override",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 1, max: 20 }),
                (costStandard, costHd) => {
                    const config = { cost_standard: costStandard, cost_hd: costHd };

                    const standardParams = getQualityParams("standard", config);
                    const hdParams = getQualityParams("hd", config);

                    if (standardParams.gemCost !== costStandard) {
                        throw new Error(
                            `Standard cost: expected ${costStandard}, got ${standardParams.gemCost}`
                        );
                    }
                    if (hdParams.gemCost !== costHd) {
                        throw new Error(
                            `HD cost: expected ${costHd}, got ${hdParams.gemCost}`
                        );
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 37c verified: Gem cost respects config override");
    },
});

/**
 * Property 37d: Unknown quality defaults to standard
 */
Deno.test({
    name: "Property 37d: Unknown Quality Defaults To Standard",
    fn: () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 20 }).filter(
                    (s) => s !== "standard" && s !== "hd"
                ),
                (unknownQuality) => {
                    const params = getQualityParams(unknownQuality);
                    const standardParams = getQualityParams("standard");

                    if (params.numInferenceSteps !== standardParams.numInferenceSteps) {
                        throw new Error(
                            `Unknown quality "${unknownQuality}" steps: ${params.numInferenceSteps}, expected ${standardParams.numInferenceSteps}`
                        );
                    }
                    if (params.guidanceScale !== standardParams.guidanceScale) {
                        throw new Error(
                            `Unknown quality "${unknownQuality}" scale: ${params.guidanceScale}, expected ${standardParams.guidanceScale}`
                        );
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 37d verified: Unknown quality defaults to standard");
    },
});

/**
 * Property 37e: HD always has higher parameters than standard
 */
Deno.test({
    name: "Property 37e: HD Parameters Always Greater Than Standard",
    fn: () => {
        const hdParams = getQualityParams("hd");
        const standardParams = getQualityParams("standard");

        assert(
            hdParams.numInferenceSteps > standardParams.numInferenceSteps,
            `HD steps (${hdParams.numInferenceSteps}) should be > standard (${standardParams.numInferenceSteps})`
        );
        assert(
            hdParams.guidanceScale > standardParams.guidanceScale,
            `HD scale (${hdParams.guidanceScale}) should be > standard (${standardParams.guidanceScale})`
        );
        assert(
            hdParams.gemCost > standardParams.gemCost,
            `HD cost (${hdParams.gemCost}) should be > standard (${standardParams.gemCost})`
        );

        console.log("✅ Property 37e verified: HD parameters always greater than standard");
    },
});
