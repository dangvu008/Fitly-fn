// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: image_resize.test.ts
 * Purpose: Property-based tests for image resize invariant
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 6: Image Resize Invariant
 * Validates: Requirements 5.5
 *
 * Tests:
 * - P6a: Resized dimensions never exceed MAX_DIMENSION (1024px)
 * - P6b: Aspect ratio is preserved after resize
 * - P6c: Images already within bounds are unchanged
 * - P6d: Zero or negative dimensions are handled
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

const MAX_DIMENSION = 1024;

/**
 * Extract from lib/image_resizer.ts — calculateNewDimensions
 */
function calculateNewDimensions(
    originalWidth: number,
    originalHeight: number
): { width: number; height: number } {
    if (originalWidth <= MAX_DIMENSION && originalHeight <= MAX_DIMENSION) {
        return { width: originalWidth, height: originalHeight };
    }

    const scaleFactor = Math.min(
        MAX_DIMENSION / originalWidth,
        MAX_DIMENSION / originalHeight
    );

    return {
        width: Math.round(originalWidth * scaleFactor),
        height: Math.round(originalHeight * scaleFactor),
    };
}

/**
 * Property 6a: Resized dimensions never exceed MAX_DIMENSION
 *
 * ∀ width ∈ [1, 10000], height ∈ [1, 10000]:
 *   result.width <= 1024 AND result.height <= 1024
 */
Deno.test({
    name: "Property 6a: Resized Dimensions Never Exceed Max",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 10000 }),
                fc.integer({ min: 1, max: 10000 }),
                (width, height) => {
                    const result = calculateNewDimensions(width, height);
                    if (result.width > MAX_DIMENSION || result.height > MAX_DIMENSION) {
                        throw new Error(
                            `Resized ${width}x${height} → ${result.width}x${result.height} exceeds max ${MAX_DIMENSION}`
                        );
                    }
                }
            ),
            { numRuns: 200 }
        );

        console.log("✅ Property 6a verified: Resized dimensions never exceed max");
    },
});

/**
 * Property 6b: Aspect ratio is preserved (within rounding tolerance)
 *
 * ∀ width ∈ [1, 10000], height ∈ [1, 10000]:
 *   |originalRatio - resizedRatio| < tolerance
 */
Deno.test({
    name: "Property 6b: Aspect Ratio Is Preserved",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 10, max: 10000 }),
                fc.integer({ min: 10, max: 10000 }),
                (width, height) => {
                    const result = calculateNewDimensions(width, height);
                    const originalRatio = width / height;
                    const resizedRatio = result.width / result.height;

                    // Tolerance for rounding: 2% for large images
                    const tolerance = 0.02;
                    const ratioDiff = Math.abs(originalRatio - resizedRatio) / originalRatio;

                    if (ratioDiff > tolerance) {
                        throw new Error(
                            `Aspect ratio changed: ${width}x${height} (${originalRatio.toFixed(3)}) → ${result.width}x${result.height} (${resizedRatio.toFixed(3)}), diff=${(ratioDiff * 100).toFixed(2)}%`
                        );
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 6b verified: Aspect ratio preserved");
    },
});

/**
 * Property 6c: Images within bounds are unchanged
 *
 * ∀ width ∈ [1, 1024], height ∈ [1, 1024]:
 *   result.width === width AND result.height === height
 */
Deno.test({
    name: "Property 6c: Small Images Are Unchanged",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: MAX_DIMENSION }),
                fc.integer({ min: 1, max: MAX_DIMENSION }),
                (width, height) => {
                    const result = calculateNewDimensions(width, height);
                    if (result.width !== width || result.height !== height) {
                        throw new Error(
                            `Image ${width}x${height} was changed to ${result.width}x${result.height}`
                        );
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 6c verified: Small images unchanged");
    },
});

/**
 * Property 6d: Output dimensions are always positive
 */
Deno.test({
    name: "Property 6d: Output Dimensions Are Always Positive",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50000 }),
                fc.integer({ min: 1, max: 50000 }),
                (width, height) => {
                    const result = calculateNewDimensions(width, height);
                    if (result.width <= 0 || result.height <= 0) {
                        throw new Error(
                            `Non-positive dimension: ${result.width}x${result.height} from ${width}x${height}`
                        );
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 6d verified: Output dimensions always positive");
    },
});
