// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: rate_limiting.test.ts
 * Purpose: Property-based tests cho rate limiting enforcement
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 29: Rate Limiting Enforcement
 * Validates: Requirements 7.3
 *
 * Tests:
 * - P29a: First N requests within limit are allowed
 * - P29b: Request exceeding limit is rejected
 * - P29c: Requests from different users are independent
 * - P29d: Rate limit resets after window expires
 * - P29e: Remaining count decreases correctly
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

import {
    checkRateLimit,
    resetRateLimit,
    getRateLimitStatus,
} from "../functions/lib/rate_limiter.ts";

/**
 * Property 29a: First N requests within limit are always allowed
 *
 * ∀ userId, limit ∈ [1, 20]:
 *   The first `limit` calls to checkRateLimit return allowed = true
 */
Deno.test({
    name: "Property 29a: First N Requests Within Limit Are Allowed",
    fn: () => {
        fc.assert(
            fc.property(
                fc.uuid(),
                fc.integer({ min: 1, max: 20 }),
                (userId, limit) => {
                    // STEP 1: Reset state for this user
                    resetRateLimit(userId);

                    // STEP 2: Make `limit` requests — all should be allowed
                    for (let i = 0; i < limit; i++) {
                        const result = checkRateLimit(userId, limit, 60000);
                        if (!result.allowed) {
                            throw new Error(
                                `Request ${i + 1}/${limit} was rejected. Expected allowed.`
                            );
                        }
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 29a verified: First N requests allowed");
    },
});

/**
 * Property 29b: Request limit+1 is always rejected
 *
 * ∀ userId, limit ∈ [1, 15]:
 *   After `limit` allowed requests, the next request returns allowed = false
 */
Deno.test({
    name: "Property 29b: Request Exceeding Limit Is Rejected",
    fn: () => {
        fc.assert(
            fc.property(
                fc.uuid(),
                fc.integer({ min: 1, max: 15 }),
                (userId, limit) => {
                    // STEP 1: Reset
                    resetRateLimit(userId);

                    // STEP 2: Exhaust the limit
                    for (let i = 0; i < limit; i++) {
                        checkRateLimit(userId, limit, 60000);
                    }

                    // STEP 3: Next request should be rejected
                    const result = checkRateLimit(userId, limit, 60000);
                    if (result.allowed) {
                        throw new Error(
                            `Request ${limit + 1} was allowed but should have been rejected (limit: ${limit})`
                        );
                    }

                    // STEP 4: Remaining should be 0
                    if (result.remaining !== 0) {
                        throw new Error(
                            `Remaining should be 0 when rejected, got ${result.remaining}`
                        );
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 29b verified: Exceeding limit is rejected");
    },
});

/**
 * Property 29c: Rate limits are independent per user
 *
 * User A exhausting their limit should NOT affect User B
 */
Deno.test({
    name: "Property 29c: Rate Limits Are Independent Per User",
    fn: () => {
        fc.assert(
            fc.property(
                fc.uuid(),
                fc.uuid(),
                (userA, userB) => {
                    // Skip if same UUID (extremely unlikely but possible)
                    if (userA === userB) return;

                    const limit = 5;

                    // STEP 1: Reset both
                    resetRateLimit(userA);
                    resetRateLimit(userB);

                    // STEP 2: Exhaust User A's limit
                    for (let i = 0; i < limit; i++) {
                        checkRateLimit(userA, limit, 60000);
                    }

                    // STEP 3: User A should be blocked
                    const resultA = checkRateLimit(userA, limit, 60000);
                    assertEquals(resultA.allowed, false, "User A should be blocked");

                    // STEP 4: User B should still be allowed
                    const resultB = checkRateLimit(userB, limit, 60000);
                    assertEquals(resultB.allowed, true, "User B should NOT be affected by User A");
                }
            ),
            { numRuns: 30 }
        );

        console.log("✅ Property 29c verified: Rate limits are independent per user");
    },
});

/**
 * Property 29d: Rate limit resets after window expires
 */
Deno.test({
    name: "Property 29d: Rate Limit Resets After Window Expires",
    fn: async () => {
        const userId = "test-window-reset";
        const limit = 3;
        const windowMs = 200; // Very short window for testing

        // STEP 1: Reset
        resetRateLimit(userId);

        // STEP 2: Exhaust limit
        for (let i = 0; i < limit; i++) {
            checkRateLimit(userId, limit, windowMs);
        }

        // STEP 3: Should be blocked now
        const blockedResult = checkRateLimit(userId, limit, windowMs);
        assertEquals(blockedResult.allowed, false, "Should be blocked after exhausting limit");

        // STEP 4: Wait for window to expire
        await new Promise((resolve) => setTimeout(resolve, windowMs + 50));

        // STEP 5: Should be allowed again
        const allowedResult = checkRateLimit(userId, limit, windowMs);
        assertEquals(allowedResult.allowed, true, "Should be allowed after window reset");

        console.log("✅ Property 29d verified: Rate limit resets after window");
    },
});

/**
 * Property 29e: Remaining count decreases monotonically
 */
Deno.test({
    name: "Property 29e: Remaining Count Decreases Correctly",
    fn: () => {
        const userId = "test-remaining-count";
        const limit = 10;

        resetRateLimit(userId);

        let prevRemaining = limit;

        for (let i = 0; i < limit; i++) {
            const result = checkRateLimit(userId, limit, 60000);

            // Remaining should decrease (or stay at 0)
            if (result.remaining > prevRemaining) {
                throw new Error(
                    `Remaining increased from ${prevRemaining} to ${result.remaining} on request ${i + 1}`
                );
            }
            prevRemaining = result.remaining;
        }

        console.log("✅ Property 29e verified: Remaining count decreases correctly");
    },
});
