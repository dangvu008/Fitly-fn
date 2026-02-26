// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: tryon_failure_refund.test.ts
 * Purpose: Property-based tests cho try-on failure refund consistency
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 21: Try-On Failure Refund Consistency
 * Validates: Requirements 5.5, 10.1, 10.2, 10.3
 *
 * Tests:
 * - P21a: Server errors (5xx) always trigger refund
 * - P21b: Client errors (4xx) never trigger refund
 * - P21c: Refund amount equals deducted amount
 * - P21d: Error classification is deterministic
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

import { ErrorType } from "../functions/lib/error_handler.ts";

/**
 * Error config (extracted from error_handler.ts for unit testing)
 */
const ERROR_REFUND_MAP: Record<string, { shouldRefund: boolean; statusCode: number }> = {
    [ErrorType.INSUFFICIENT_GEMS]: { shouldRefund: false, statusCode: 400 },
    [ErrorType.INVALID_IMAGE]: { shouldRefund: false, statusCode: 400 },
    [ErrorType.INVALID_REQUEST]: { shouldRefund: false, statusCode: 400 },
    [ErrorType.UNAUTHORIZED]: { shouldRefund: false, statusCode: 401 },
    [ErrorType.RATE_LIMIT_EXCEEDED]: { shouldRefund: false, statusCode: 429 },
    [ErrorType.TOO_MANY_ITEMS]: { shouldRefund: false, statusCode: 400 },
    [ErrorType.STORAGE_ERROR]: { shouldRefund: true, statusCode: 500 },
    [ErrorType.DATABASE_ERROR]: { shouldRefund: true, statusCode: 500 },
    [ErrorType.REPLICATE_TIMEOUT]: { shouldRefund: true, statusCode: 504 },
    [ErrorType.REPLICATE_ERROR]: { shouldRefund: true, statusCode: 500 },
    [ErrorType.INTERNAL_ERROR]: { shouldRefund: true, statusCode: 500 },
};

/**
 * Simulate refund calculation
 */
function calculateRefund(
    errorType: ErrorType,
    gemsUsed: number
): { shouldRefund: boolean; refundAmount: number } {
    const config = ERROR_REFUND_MAP[errorType];
    if (!config) {
        return { shouldRefund: true, refundAmount: gemsUsed }; // Default: refund on unknown
    }
    return {
        shouldRefund: config.shouldRefund,
        refundAmount: config.shouldRefund ? gemsUsed : 0,
    };
}

/**
 * Property 21a: All server errors (5xx type) trigger 100% refund
 */
Deno.test({
    name: "Property 21a: Server Errors Always Trigger Refund",
    fn: () => {
        const serverErrors = [
            ErrorType.STORAGE_ERROR,
            ErrorType.DATABASE_ERROR,
            ErrorType.REPLICATE_TIMEOUT,
            ErrorType.REPLICATE_ERROR,
            ErrorType.INTERNAL_ERROR,
        ];

        fc.assert(
            fc.property(
                fc.constantFrom(...serverErrors),
                fc.integer({ min: 1, max: 10 }),
                (errorType, gemsUsed) => {
                    const result = calculateRefund(errorType, gemsUsed);

                    if (!result.shouldRefund) {
                        throw new Error(
                            `Server error ${errorType} should trigger refund`
                        );
                    }

                    if (result.refundAmount !== gemsUsed) {
                        throw new Error(
                            `Refund should be 100% (${gemsUsed}), got ${result.refundAmount}`
                        );
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 21a verified: Server errors always trigger refund");
    },
});

/**
 * Property 21b: Client errors (4xx type) never trigger refund
 */
Deno.test({
    name: "Property 21b: Client Errors Never Trigger Refund",
    fn: () => {
        const clientErrors = [
            ErrorType.INSUFFICIENT_GEMS,
            ErrorType.INVALID_IMAGE,
            ErrorType.INVALID_REQUEST,
            ErrorType.UNAUTHORIZED,
            ErrorType.RATE_LIMIT_EXCEEDED,
            ErrorType.TOO_MANY_ITEMS,
        ];

        fc.assert(
            fc.property(
                fc.constantFrom(...clientErrors),
                fc.integer({ min: 1, max: 10 }),
                (errorType, gemsUsed) => {
                    const result = calculateRefund(errorType, gemsUsed);

                    if (result.shouldRefund) {
                        throw new Error(
                            `Client error ${errorType} should NOT trigger refund`
                        );
                    }

                    if (result.refundAmount !== 0) {
                        throw new Error(
                            `Refund amount for client error should be 0, got ${result.refundAmount}`
                        );
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 21b verified: Client errors never trigger refund");
    },
});

/**
 * Property 21c: Refund amount always equals full deducted amount (no partial refunds)
 *
 * ∀ errorType where shouldRefund = true, ∀ gemsUsed ∈ [1, 100]:
 *   refundAmount === gemsUsed (100% refund)
 */
Deno.test({
    name: "Property 21c: Refund Is Always 100% Of Deducted Amount",
    fn: () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...Object.values(ErrorType)),
                fc.integer({ min: 1, max: 100 }),
                (errorType, gemsUsed) => {
                    const result = calculateRefund(errorType, gemsUsed);

                    if (result.shouldRefund) {
                        if (result.refundAmount !== gemsUsed) {
                            throw new Error(
                                `Partial refund detected: deducted ${gemsUsed}, refund ${result.refundAmount}`
                            );
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );

        console.log("✅ Property 21c verified: Refund is always 100%");
    },
});

/**
 * Property 21d: Error classification is deterministic (same input → same output)
 */
Deno.test({
    name: "Property 21d: Error Classification Is Deterministic",
    fn: () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...Object.values(ErrorType)),
                fc.integer({ min: 1, max: 10 }),
                (errorType, gemsUsed) => {
                    const result1 = calculateRefund(errorType, gemsUsed);
                    const result2 = calculateRefund(errorType, gemsUsed);

                    assertEquals(
                        result1.shouldRefund,
                        result2.shouldRefund,
                        `Determinism failed for ${errorType}: shouldRefund differs`
                    );
                    assertEquals(
                        result1.refundAmount,
                        result2.refundAmount,
                        `Determinism failed for ${errorType}: refundAmount differs`
                    );
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 21d verified: Error classification is deterministic");
    },
});
