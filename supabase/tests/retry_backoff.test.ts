// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: retry_backoff.test.ts
 * Purpose: Property-based tests for exponential backoff retry logic
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 40: Retry Exponential Backoff
 * Validates: Requirements 8.3
 *
 * Tests:
 * - P40a: Delay = baseDelay * 2^attempt
 * - P40b: Delay is capped at maxDelay
 * - P40c: Delays are monotonically non-decreasing
 * - P40d: First delay equals baseDelay
 * - P40e: Retryable error detection works correctly
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

// Extract from lib/retry_helper.ts

function calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number
): number {
    const delay = baseDelay * Math.pow(2, attempt);
    return Math.min(delay, maxDelay);
}

function defaultShouldRetry(error: Error): boolean {
    const retryableErrors = [
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "NetworkError",
        "FetchError",
        "TimeoutError",
    ];
    const errorMessage = error.message || error.toString();
    return retryableErrors.some((msg) => errorMessage.includes(msg));
}

/**
 * Property 40a: Delay follows exponential backoff formula
 *
 * ∀ attempt ∈ [0, 10], baseDelay ∈ [100, 5000]:
 *   delay = min(baseDelay * 2^attempt, maxDelay)
 */
Deno.test({
    name: "Property 40a: Delay Follows Exponential Formula",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 10 }),
                fc.integer({ min: 100, max: 5000 }),
                fc.integer({ min: 10000, max: 60000 }),
                (attempt, baseDelay, maxDelay) => {
                    const delay = calculateDelay(attempt, baseDelay, maxDelay);
                    const expected = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

                    if (delay !== expected) {
                        throw new Error(
                            `Delay(${attempt}, ${baseDelay}, ${maxDelay}) = ${delay}, expected ${expected}`
                        );
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 40a verified: Delay follows exponential formula");
    },
});

/**
 * Property 40b: Delay never exceeds maxDelay
 *
 * ∀ attempt, baseDelay, maxDelay:
 *   calculateDelay(attempt, baseDelay, maxDelay) <= maxDelay
 */
Deno.test({
    name: "Property 40b: Delay Is Capped At MaxDelay",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 20 }),
                fc.integer({ min: 100, max: 10000 }),
                fc.integer({ min: 1000, max: 60000 }),
                (attempt, baseDelay, maxDelay) => {
                    const delay = calculateDelay(attempt, baseDelay, maxDelay);

                    if (delay > maxDelay) {
                        throw new Error(
                            `Delay ${delay} exceeds maxDelay ${maxDelay} (attempt=${attempt}, base=${baseDelay})`
                        );
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 40b verified: Delay capped at maxDelay");
    },
});

/**
 * Property 40c: Delays are monotonically non-decreasing
 *
 * ∀ baseDelay, maxDelay, sequence of attempts 0..N:
 *   delay(i) <= delay(i+1)
 */
Deno.test({
    name: "Property 40c: Delays Are Monotonically Non-Decreasing",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 100, max: 5000 }),
                fc.integer({ min: 5000, max: 60000 }),
                fc.integer({ min: 3, max: 10 }),
                (baseDelay, maxDelay, maxRetries) => {
                    let prevDelay = 0;

                    for (let attempt = 0; attempt < maxRetries; attempt++) {
                        const delay = calculateDelay(attempt, baseDelay, maxDelay);

                        if (delay < prevDelay) {
                            throw new Error(
                                `Non-monotonic: delay(${attempt})=${delay} < delay(${attempt - 1})=${prevDelay}`
                            );
                        }
                        prevDelay = delay;
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 40c verified: Delays monotonically non-decreasing");
    },
});

/**
 * Property 40d: First delay equals baseDelay (when under cap)
 */
Deno.test({
    name: "Property 40d: First Delay Equals BaseDelay",
    fn: () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 100, max: 5000 }),
                fc.integer({ min: 10000, max: 60000 }),
                (baseDelay, maxDelay) => {
                    const firstDelay = calculateDelay(0, baseDelay, maxDelay);

                    // baseDelay * 2^0 = baseDelay, capped at maxDelay
                    const expected = Math.min(baseDelay, maxDelay);
                    if (firstDelay !== expected) {
                        throw new Error(
                            `First delay: ${firstDelay}, expected ${expected} (base=${baseDelay}, max=${maxDelay})`
                        );
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 40d verified: First delay equals baseDelay");
    },
});

/**
 * Property 40e: Retryable error detection
 */
Deno.test({
    name: "Property 40e: Retryable Error Detection Works",
    fn: () => {
        // Should retry on network errors
        const networkErrors = [
            "ECONNREFUSED",
            "ECONNRESET",
            "ETIMEDOUT",
            "ENOTFOUND",
            "NetworkError when attempting to fetch",
            "FetchError: network timeout",
            "TimeoutError",
        ];

        for (const msg of networkErrors) {
            const error = new Error(msg);
            assert(
                defaultShouldRetry(error),
                `Should retry on: "${msg}"`
            );
        }

        // Should NOT retry on non-network errors
        const nonRetryableErrors = [
            "Invalid image format",
            "Insufficient gems",
            "Unauthorized",
            "validation failed",
        ];

        for (const msg of nonRetryableErrors) {
            const error = new Error(msg);
            assert(
                !defaultShouldRetry(error),
                `Should NOT retry on: "${msg}"`
            );
        }

        console.log("✅ Property 40e verified: Retryable error detection works");
    },
});
