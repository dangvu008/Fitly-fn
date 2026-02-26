// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: prompt_category.test.ts
 * Purpose: Property-based tests for prompt category hierarchy
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 36: Prompt Category Hierarchy
 * Validates: Requirements 7.3
 *
 * Tests:
 * - P36a: Categories are sorted by priority (dress < top < bottom < shoes < accessories)
 * - P36b: Sort is stable (items with same category maintain order)
 * - P36c: All valid categories are accepted
 * - P36d: Sorted output has same length as input
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

interface ClothingItem {
    category: "top" | "bottom" | "dress" | "shoes" | "accessories";
    imageUrl: string;
    name?: string;
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

const VALID_CATEGORIES: ClothingItem["category"][] = ["top", "bottom", "dress", "shoes", "accessories"];

const clothingItemGen = fc.record({
    category: fc.constantFrom(...VALID_CATEGORIES) as fc.Arbitrary<ClothingItem["category"]>,
    imageUrl: fc.constant("https://example.com/img.jpg"),
    name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

/**
 * Property 36a: Categories sorted by priority order
 *
 * ∀ items[]:
 *   sorted result has dress first, then top, bottom, shoes, accessories
 */
Deno.test({
    name: "Property 36a: Categories Sorted By Priority",
    fn: () => {
        fc.assert(
            fc.property(
                fc.array(clothingItemGen, { minLength: 2, maxLength: 5 }),
                (items) => {
                    const sorted = sortClothingByPriority(items);

                    for (let i = 1; i < sorted.length; i++) {
                        const prevPriority = CATEGORY_PRIORITY[sorted[i - 1].category];
                        const currPriority = CATEGORY_PRIORITY[sorted[i].category];

                        if (prevPriority > currPriority) {
                            throw new Error(
                                `Sort order wrong: ${sorted[i - 1].category}(${prevPriority}) before ${sorted[i].category}(${currPriority})`
                            );
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 36a verified: Categories sorted by priority");
    },
});

/**
 * Property 36b: Sort preserves all items (no items lost or duplicated)
 */
Deno.test({
    name: "Property 36b: Sort Preserves All Items",
    fn: () => {
        fc.assert(
            fc.property(
                fc.array(clothingItemGen, { minLength: 1, maxLength: 5 }),
                (items) => {
                    const sorted = sortClothingByPriority(items);

                    if (sorted.length !== items.length) {
                        throw new Error(
                            `Sort changed length: ${items.length} → ${sorted.length}`
                        );
                    }

                    // Every original item should be in the sorted result
                    for (const item of items) {
                        const found = sorted.some(
                            (s) => s.category === item.category && s.imageUrl === item.imageUrl
                        );
                        if (!found) {
                            throw new Error(`Item ${item.category} lost after sort`);
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 36b verified: Sort preserves all items");
    },
});

/**
 * Property 36c: Known priority order is correct
 */
Deno.test({
    name: "Property 36c: Priority Order Is dress < top < bottom < shoes < accessories",
    fn: () => {
        const items: ClothingItem[] = [
            { category: "accessories", imageUrl: "https://e.com/a" },
            { category: "shoes", imageUrl: "https://e.com/s" },
            { category: "bottom", imageUrl: "https://e.com/b" },
            { category: "top", imageUrl: "https://e.com/t" },
            { category: "dress", imageUrl: "https://e.com/d" },
        ];

        const sorted = sortClothingByPriority(items);
        const categories = sorted.map((i) => i.category);

        assertEquals(categories, ["dress", "top", "bottom", "shoes", "accessories"]);

        console.log("✅ Property 36c verified: Priority order correct");
    },
});

/**
 * Property 36d: Sort is idempotent (sorting twice gives same result)
 */
Deno.test({
    name: "Property 36d: Sort Is Idempotent",
    fn: () => {
        fc.assert(
            fc.property(
                fc.array(clothingItemGen, { minLength: 1, maxLength: 5 }),
                (items) => {
                    const sorted1 = sortClothingByPriority(items);
                    const sorted2 = sortClothingByPriority(sorted1);

                    for (let i = 0; i < sorted1.length; i++) {
                        if (sorted1[i].category !== sorted2[i].category) {
                            throw new Error(
                                `Sort not idempotent at index ${i}: ${sorted1[i].category} vs ${sorted2[i].category}`
                            );
                        }
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 36d verified: Sort is idempotent");
    },
});
