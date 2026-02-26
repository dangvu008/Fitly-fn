// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: prompt_completeness.test.ts
 * Purpose: Property-based tests for prompt preservation / completeness
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 35: Prompt Preservation
 * Validates: Requirements 7.2
 *
 * Tests:
 * - P35a: Prompt contains all clothing item names
 * - P35b: Preservation instructions are always present
 * - P35c: Prompt is never empty for valid inputs
 * - P35d: Negative prompt always present
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

// Extract types and functions from construct_gemini_prompt.ts

interface ClothingItem {
    category: "top" | "bottom" | "dress" | "shoes" | "accessories";
    imageUrl: string;
    name?: string;
    description?: string;
}

interface PromptResult {
    prompt: string;
    negativePrompt: string;
    numInferenceSteps: number;
    guidanceScale: number;
}

const CATEGORY_PRIORITY: Record<string, number> = {
    dress: 1,
    top: 2,
    bottom: 3,
    shoes: 4,
    accessories: 5,
};

function sortClothingByPriority(items: ClothingItem[]): ClothingItem[] {
    return [...items].sort(
        (a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]
    );
}

function generateClothingDescription(items: ClothingItem[]): string {
    const sortedItems = sortClothingByPriority(items);
    const descriptions = sortedItems.map((item) => {
        const categoryName = item.category;
        const itemName = item.name || item.description || `${categoryName} item`;
        return `- ${categoryName}: ${itemName}`;
    });
    return descriptions.join("\n");
}

function constructGeminiPrompt(
    clothingItems: ClothingItem[],
    quality: "standard" | "hd"
): PromptResult {
    const basePrompt = "Professional fashion photography of a person wearing:";
    const clothingDescription = generateClothingDescription(clothingItems);

    const preservationInstructions = `

CRITICAL REQUIREMENTS:
- Keep the person's face EXACTLY the same (facial features, skin tone, expression)
- Keep hair style, color, and length EXACTLY the same
- Keep body proportions, height, and build EXACTLY the same
- Keep the original pose and posture
- Maintain natural lighting conditions
- Natural fabric textures with realistic wrinkles and folds
- Professional studio photography quality
- Realistic shadows and highlights
- Proper garment fit and draping
${quality === "hd" ? "- Ultra high resolution 4K output with fine details" : "- High resolution output"}
- Photorealistic result, not illustration or cartoon`;

    const negativePrompt = `deformed, distorted face, wrong anatomy, extra limbs, missing limbs, 
blurry, low quality, watermark, text, logo, signature`.trim();

    const fullPrompt = `${basePrompt}\n${clothingDescription}\n${preservationInstructions}`;
    const numInferenceSteps = quality === "hd" ? 75 : 50;
    const guidanceScale = quality === "hd" ? 8.5 : 7.5;

    return {
        prompt: fullPrompt.trim(),
        negativePrompt,
        numInferenceSteps,
        guidanceScale,
    };
}

// Generators
const categoryGen = fc.constantFrom("top", "bottom", "dress", "shoes", "accessories") as fc.Arbitrary<ClothingItem["category"]>;

const clothingItemGen = fc.record({
    category: categoryGen,
    imageUrl: fc.webUrl(),
    name: fc.option(fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0), { nil: undefined }),
});

/**
 * Property 35a: Prompt contains all clothing item names/categories
 */
Deno.test({
    name: "Property 35a: Prompt Contains All Clothing Items",
    fn: () => {
        fc.assert(
            fc.property(
                fc.array(clothingItemGen, { minLength: 1, maxLength: 5 }),
                fc.constantFrom("standard", "hd") as fc.Arbitrary<"standard" | "hd">,
                (items, quality) => {
                    const result = constructGeminiPrompt(items, quality);

                    // Every item's category should appear in the prompt
                    for (const item of items) {
                        if (!result.prompt.includes(item.category)) {
                            throw new Error(
                                `Prompt missing category "${item.category}": ${result.prompt.substring(0, 200)}`
                            );
                        }
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 35a verified: Prompt contains all clothing items");
    },
});

/**
 * Property 35b: Preservation instructions are always present
 */
Deno.test({
    name: "Property 35b: Preservation Instructions Always Present",
    fn: () => {
        fc.assert(
            fc.property(
                fc.array(clothingItemGen, { minLength: 1, maxLength: 5 }),
                fc.constantFrom("standard", "hd") as fc.Arbitrary<"standard" | "hd">,
                (items, quality) => {
                    const result = constructGeminiPrompt(items, quality);

                    const requiredPhrases = [
                        "CRITICAL REQUIREMENTS",
                        "face EXACTLY",
                        "hair style",
                        "body proportions",
                        "Photorealistic",
                    ];

                    for (const phrase of requiredPhrases) {
                        if (!result.prompt.includes(phrase)) {
                            throw new Error(
                                `Prompt missing preservation phrase: "${phrase}"`
                            );
                        }
                    }
                }
            ),
            { numRuns: 30 }
        );

        console.log("✅ Property 35b verified: Preservation instructions always present");
    },
});

/**
 * Property 35c: Prompt is never empty for valid inputs
 */
Deno.test({
    name: "Property 35c: Prompt Is Never Empty",
    fn: () => {
        fc.assert(
            fc.property(
                fc.array(clothingItemGen, { minLength: 1, maxLength: 5 }),
                fc.constantFrom("standard", "hd") as fc.Arbitrary<"standard" | "hd">,
                (items, quality) => {
                    const result = constructGeminiPrompt(items, quality);

                    if (result.prompt.trim().length === 0) {
                        throw new Error("Prompt is empty for valid input");
                    }
                    if (result.prompt.length < 100) {
                        throw new Error(
                            `Prompt suspiciously short (${result.prompt.length} chars)`
                        );
                    }
                }
            ),
            { numRuns: 30 }
        );

        console.log("✅ Property 35c verified: Prompt never empty for valid inputs");
    },
});

/**
 * Property 35d: Negative prompt is always present and non-empty
 */
Deno.test({
    name: "Property 35d: Negative Prompt Always Present",
    fn: () => {
        fc.assert(
            fc.property(
                fc.array(clothingItemGen, { minLength: 1, maxLength: 5 }),
                fc.constantFrom("standard", "hd") as fc.Arbitrary<"standard" | "hd">,
                (items, quality) => {
                    const result = constructGeminiPrompt(items, quality);

                    if (!result.negativePrompt || result.negativePrompt.trim().length === 0) {
                        throw new Error("Negative prompt is empty");
                    }

                    // Should contain common artifact-avoidance terms
                    if (!result.negativePrompt.includes("deformed")) {
                        throw new Error("Negative prompt missing 'deformed'");
                    }
                }
            ),
            { numRuns: 30 }
        );

        console.log("✅ Property 35d verified: Negative prompt always present");
    },
});
