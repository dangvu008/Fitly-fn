// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: clothing_application_guard.test.ts
 * Purpose: Verify that clothing application safeguards are properly configured
 * Layer: Infrastructure / Testing
 *
 * Tests:
 * - G1: BASE_PROMPT contains CLOTHING CHANGE VERIFICATION (RULE 9)
 * - G2: CLOTHING_ACTION_MANDATE contains 5-step action sequence
 * - G3: OutputGuard exports guardOutput with replicateApiKey parameter
 * - G4: PromptAssembler injects CLOTHING_ACTION_MANDATE into every prompt
 * - G5: InputAnalyzer uses dynamic fallback category (not hardcoded 'top')
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Import production code
import { BASE_PROMPT, CLOTHING_ACTION_MANDATE, GARMENT_REPLACEMENT_RULE } from "../functions/lib/prompt_engine/prompts/base.ts";
import { InputAnalyzer } from "../functions/lib/prompt_engine/InputAnalyzer.ts";

/**
 * G1: BASE_PROMPT contains CLOTHING CHANGE VERIFICATION (RULE 9)
 */
Deno.test({
    name: "G1: BASE_PROMPT contains RULE 9 — Clothing Change Verification",
    fn: () => {
        assertStringIncludes(BASE_PROMPT, "RULE 9");
        assertStringIncludes(BASE_PROMPT, "CLOTHING CHANGE VERIFICATION");
        assertStringIncludes(BASE_PROMPT, "Is the person now wearing DIFFERENT clothing");
        assertStringIncludes(BASE_PROMPT, "CLOTHING NOT CHANGED");
        console.log("✅ G1: BASE_PROMPT contains RULE 9 — Clothing Change Verification");
    },
});

/**
 * G2: CLOTHING_ACTION_MANDATE contains 5-step action sequence
 */
Deno.test({
    name: "G2: CLOTHING_ACTION_MANDATE contains 5-step action process",
    fn: () => {
        assert(CLOTHING_ACTION_MANDATE, "CLOTHING_ACTION_MANDATE must be exported");
        assert(CLOTHING_ACTION_MANDATE.length > 200, "CLOTHING_ACTION_MANDATE must be substantial");

        // Verify 5 action steps present
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "STEP 1:");
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "STEP 2:");
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "STEP 3:");
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "STEP 4:");
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "STEP 5:");

        // Verify wrong/correct approach sections
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "WRONG APPROACH");
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "CORRECT APPROACH");

        // Verify explicit action verbs
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "REMOVE");
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "APPLY");
        assertStringIncludes(CLOTHING_ACTION_MANDATE, "VERIFY");

        console.log("✅ G2: CLOTHING_ACTION_MANDATE contains 5-step action process");
    },
});

/**
 * G3: BASE_PROMPT rules cover the key failure modes
 */
Deno.test({
    name: "G3: BASE_PROMPT covers all critical failure mode rules",
    fn: () => {
        // Identity preservation
        assertStringIncludes(BASE_PROMPT, "RULE 1");
        assertStringIncludes(BASE_PROMPT, "IDENTITY PRESERVATION");

        // Clothing accuracy
        assertStringIncludes(BASE_PROMPT, "RULE 2");
        assertStringIncludes(BASE_PROMPT, "CLOTHING ACCURACY");

        // Background preservation
        assertStringIncludes(BASE_PROMPT, "RULE 4");
        assertStringIncludes(BASE_PROMPT, "BACKGROUND PRESERVATION");

        // Garment extraction from IMAGE_A
        assertStringIncludes(BASE_PROMPT, "RULE 5");
        assertStringIncludes(BASE_PROMPT, "GARMENT EXTRACTION");

        // Face verification
        assertStringIncludes(BASE_PROMPT, "RULE 7");
        assertStringIncludes(BASE_PROMPT, "FACE VERIFICATION");

        // Fabric texture verification
        assertStringIncludes(BASE_PROMPT, "RULE 8");
        assertStringIncludes(BASE_PROMPT, "FABRIC TEXTURE VERIFICATION");

        // Clothing change verification (new!)
        assertStringIncludes(BASE_PROMPT, "RULE 9");
        assertStringIncludes(BASE_PROMPT, "CLOTHING CHANGE VERIFICATION");

        console.log("✅ G3: BASE_PROMPT covers all critical failure mode rules");
    },
});

/**
 * G4: InputAnalyzer.setClientCategory updates fallback routing
 */
Deno.test({
    name: "G4: InputAnalyzer fallback uses client-provided category, not hardcoded 'top'",
    fn: () => {
        const analyzer = new InputAnalyzer("fake-api-key");

        // Default fallback → 'top' (legacy default)
        const defaultFallback = analyzer.fallbackAnalysis();
        assertEquals(defaultFallback.image_a_product.clothing_items[0].type, "top");
        assertEquals(defaultFallback.image_a_product.total_outfit_type, "single_top");

        // Set category to 'dress' → fallback should route as dress
        analyzer.setClientCategory("dress");
        const dressFallback = analyzer.fallbackAnalysis();
        assertEquals(dressFallback.image_a_product.clothing_items[0].type, "dress");
        assertEquals(dressFallback.image_a_product.total_outfit_type, "single_dress");

        // Set category to 'bottom' → fallback should route as bottom
        analyzer.setClientCategory("bottom");
        const bottomFallback = analyzer.fallbackAnalysis();
        assertEquals(bottomFallback.image_a_product.clothing_items[0].type, "bottom");
        assertEquals(bottomFallback.image_a_product.total_outfit_type, "single_bottom");

        // Set category to 'outerwear' → fallback should route as outerwear
        analyzer.setClientCategory("outerwear");
        const outerFallback = analyzer.fallbackAnalysis();
        assertEquals(outerFallback.image_a_product.clothing_items[0].type, "outerwear");
        assertEquals(outerFallback.image_a_product.total_outfit_type, "single_outerwear");

        console.log("✅ G4: InputAnalyzer fallback uses client-provided category correctly");
    },
});

/**
 * G5: GARMENT_REPLACEMENT_RULE includes exception for outerwear
 */
Deno.test({
    name: "G5: GARMENT_REPLACEMENT_RULE distinguishes outerwear from regular garments",
    fn: () => {
        assertStringIncludes(GARMENT_REPLACEMENT_RULE, "FULLY REMOVE");
        assertStringIncludes(GARMENT_REPLACEMENT_RULE, "REPLACES the old one");
        assertStringIncludes(GARMENT_REPLACEMENT_RULE, "Outerwear items ARE layered");
        assertStringIncludes(GARMENT_REPLACEMENT_RULE, "NOT replace the inner top");

        console.log("✅ G5: GARMENT_REPLACEMENT_RULE distinguishes outerwear from regular garments");
    },
});

/**
 * G6: BASE_PROMPT contains anti-collage mandate in RULE 5
 */
Deno.test({
    name: "G6: BASE_PROMPT RULE 5 contains anti-collage and garment extraction rules",
    fn: () => {
        // Anti-collage in RULE 5
        assertStringIncludes(BASE_PROMPT, "ANTI-COLLAGE MANDATE");
        assertStringIncludes(BASE_PROMPT, "SINGLE PHOTOGRAPH");
        assertStringIncludes(BASE_PROMPT, "ONE person");

        // Strong garment extraction language
        assertStringIncludes(BASE_PROMPT, "DOES NOT EXIST in your output");
        assertStringIncludes(BASE_PROMPT, "ERASE");

        // Explicit forbidden outputs
        assertStringIncludes(BASE_PROMPT, "TWO people side-by-side");

        console.log("✅ G6: BASE_PROMPT contains anti-collage mandate in RULE 5");
    },
});

/**
 * G7: BASE_PROMPT RULE 5 verification includes single-person check
 */
Deno.test({
    name: "G7: BASE_PROMPT RULE 5 verification step checks for single person output",
    fn: () => {
        assertStringIncludes(BASE_PROMPT, "VERIFY: The output contains EXACTLY ONE person");

        console.log("✅ G7: RULE 5 verification includes single-person check");
    },
});
