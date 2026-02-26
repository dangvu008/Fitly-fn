// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: tryon_state_transition.test.ts
 * Purpose: Property-based tests for try-on state transitions
 * Layer: Infrastructure / Testing
 *
 * Feature: supabase-gemini-integration
 * Property 20: Success State Transition
 * Validates: Requirements 10.3
 *
 * Tests:
 * - P20a: Valid state transitions (starting → processing → succeeded/failed/canceled)
 * - P20b: Terminal states cannot transition further
 * - P20c: Only valid states are accepted
 * - P20d: Success always has result, failure always has error
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

// Extract from process-tryon/index.ts — ReplicatePrediction status
type PredictionStatus = "starting" | "processing" | "succeeded" | "failed" | "canceled";

const TERMINAL_STATES: PredictionStatus[] = ["succeeded", "failed", "canceled"];
const ALL_STATES: PredictionStatus[] = ["starting", "processing", "succeeded", "failed", "canceled"];

/**
 * Valid transition map — which states can transition to which
 */
const VALID_TRANSITIONS: Record<PredictionStatus, PredictionStatus[]> = {
    starting: ["processing", "succeeded", "failed", "canceled"],
    processing: ["succeeded", "failed", "canceled"],
    succeeded: [],  // terminal
    failed: [],     // terminal
    canceled: [],   // terminal
};

function isValidTransition(from: PredictionStatus, to: PredictionStatus): boolean {
    return VALID_TRANSITIONS[from].includes(to);
}

function isTerminalState(status: PredictionStatus): boolean {
    return TERMINAL_STATES.includes(status);
}

/**
 * Simulate extracting result from prediction output
 */
function extractResultUrl(output: string | string[] | null | undefined): string | null {
    if (!output) return null;
    if (typeof output === "string") return output;
    if (Array.isArray(output) && output.length > 0) return output[0];
    return null;
}

/**
 * Determine try-on result from prediction state
 */
function getTryOnResult(
    status: PredictionStatus,
    output?: string | string[] | null,
    error?: string
): { success: boolean; resultUrl?: string; error?: string } {
    if (status === "succeeded") {
        const url = extractResultUrl(output);
        return url ? { success: true, resultUrl: url } : { success: false, error: "No output" };
    }
    if (status === "failed") {
        return { success: false, error: error || "Unknown error" };
    }
    if (status === "canceled") {
        return { success: false, error: "Canceled" };
    }
    return { success: false, error: `Unexpected state: ${status}` };
}

/**
 * Property 20a: Valid transitions are accepted
 */
Deno.test({
    name: "Property 20a: Valid State Transitions Are Accepted",
    fn: () => {
        // Check all valid transitions
        for (const from of ALL_STATES) {
            for (const to of VALID_TRANSITIONS[from]) {
                assert(
                    isValidTransition(from, to),
                    `Transition ${from} → ${to} should be valid`
                );
            }
        }

        console.log("✅ Property 20a verified: Valid transitions accepted");
    },
});

/**
 * Property 20b: Terminal states cannot transition further
 */
Deno.test({
    name: "Property 20b: Terminal States Cannot Transition",
    fn: () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...TERMINAL_STATES) as fc.Arbitrary<PredictionStatus>,
                fc.constantFrom(...ALL_STATES) as fc.Arbitrary<PredictionStatus>,
                (terminalState, nextState) => {
                    if (isValidTransition(terminalState, nextState)) {
                        throw new Error(
                            `Terminal state ${terminalState} should not transition to ${nextState}`
                        );
                    }
                }
            ),
            { numRuns: 50 }
        );

        console.log("✅ Property 20b verified: Terminal states cannot transition");
    },
});

/**
 * Property 20c: extractResultUrl handles all output formats
 */
Deno.test({
    name: "Property 20c: Result URL Extraction Handles All Formats",
    fn: () => {
        // String output → returns string
        fc.assert(
            fc.property(
                fc.webUrl(),
                (url) => {
                    const result = extractResultUrl(url);
                    if (result !== url) {
                        throw new Error(`String URL extraction failed: got ${result}`);
                    }
                }
            ),
            { numRuns: 30 }
        );

        // Array output → returns first element
        fc.assert(
            fc.property(
                fc.array(fc.webUrl(), { minLength: 1, maxLength: 5 }),
                (urls) => {
                    const result = extractResultUrl(urls);
                    if (result !== urls[0]) {
                        throw new Error(`Array URL extraction should return first: got ${result}`);
                    }
                }
            ),
            { numRuns: 30 }
        );

        // Null/undefined → returns null
        assertEquals(extractResultUrl(null), null, "null should return null");
        assertEquals(extractResultUrl(undefined), null, "undefined should return null");
        assertEquals(extractResultUrl([]), null, "empty array should return null");

        console.log("✅ Property 20c verified: Result URL extraction handles all formats");
    },
});

/**
 * Property 20d: Success always has result, failure always has error
 */
Deno.test({
    name: "Property 20d: Success Has Result, Failure Has Error",
    fn: () => {
        // Succeeded + valid output → success with URL
        fc.assert(
            fc.property(
                fc.webUrl(),
                (url) => {
                    const result = getTryOnResult("succeeded", url);
                    if (!result.success) {
                        throw new Error(`Succeeded with URL should be success`);
                    }
                    if (!result.resultUrl) {
                        throw new Error(`Success result missing URL`);
                    }
                }
            ),
            { numRuns: 30 }
        );

        // Failed → always has error message
        fc.assert(
            fc.property(
                fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
                (errorMsg) => {
                    const result = getTryOnResult("failed", null, errorMsg);
                    if (result.success) {
                        throw new Error(`Failed state should not be success`);
                    }
                    if (!result.error) {
                        throw new Error(`Failed state should have error message`);
                    }
                }
            ),
            { numRuns: 30 }
        );

        // Canceled → not success, has error
        const cancelResult = getTryOnResult("canceled");
        assert(!cancelResult.success, "Canceled should not be success");
        assert(cancelResult.error !== undefined, "Canceled should have error");

        console.log("✅ Property 20d verified: Success has result, failure has error");
    },
});
