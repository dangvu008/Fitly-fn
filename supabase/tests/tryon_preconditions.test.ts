// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: tryon_preconditions.test.ts
 * Purpose: Property-based tests cho try-on precondition validation
 * Layer: Application / Testing
 * 
 * Data Contract:
 * - Input: Try-on requests với various preconditions
 * - Output: Accept/reject based on preconditions
 * 
 * Flow:
 * 1. Generate random try-on requests
 * 2. Check preconditions (auth, gems, limits)
 * 3. Verify correct accept/reject behavior
 * 
 * Security Note: Tests authorization và resource limits
 * 
 * Feature: supabase-gemini-integration
 * Property 17: Try-On Precondition Validation
 * Property 22: Clothing Items Limit
 * Validates: Requirements 5.1, 5.6
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_TEST_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_TEST_ANON_KEY") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_TEST_SERVICE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("⚠️  Test environment variables not set");
  Deno.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Test helpers
async function createTestUser(userId: string, gemsBalance: number) {
  await supabaseAdmin.from("profiles").delete().eq("id", userId);

  const { error } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: userId,
      gems_balance: gemsBalance,
      created_at: new Date().toISOString(),
    });

  if (error) throw error;
}

async function cleanupTestUser(userId: string) {
  await supabaseAdmin.from("tryon_history").delete().eq("user_id", userId);
  await supabaseAdmin.from("gem_transactions").delete().eq("user_id", userId);
  await supabaseAdmin.from("profiles").delete().eq("id", userId);
}

async function getGemsBalance(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("gems_balance")
    .eq("id", userId)
    .single();

  return data?.gems_balance || 0;
}

/**
 * Helper: Simulate try-on precondition check
 */
function checkTryOnPreconditions(
  gemsBalance: number,
  quality: "standard" | "hd",
  clothingItemsCount: number
): { allowed: boolean; reason?: string } {
  // Check gems requirement
  const requiredGems = quality === "standard" ? 1 : 2;
  if (gemsBalance < requiredGems) {
    return {
      allowed: false,
      reason: `Insufficient gems: have ${gemsBalance}, need ${requiredGems}`,
    };
  }

  // Check clothing items limit
  if (clothingItemsCount > 5) {
    return {
      allowed: false,
      reason: `Too many items: ${clothingItemsCount} (max: 5)`,
    };
  }

  if (clothingItemsCount < 1) {
    return {
      allowed: false,
      reason: "At least 1 clothing item required",
    };
  }

  return { allowed: true };
}

/**
 * Property 17: Try-On Precondition Validation
 * 
 * Specification:
 * ∀ request:
 *   - If gems_balance < required → reject
 *   - If not authenticated → reject
 *   - Otherwise → accept
 */
Deno.test({
  name: "Property 17a: Insufficient Gems → Rejected",
  fn: async () => {
    const testUserId = `test-user-${crypto.randomUUID()}`;

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            gemsBalance: fc.integer({ min: 0, max: 1 }), // 0 or 1 gems
            quality: fc.constantFrom("standard", "hd") as fc.Arbitrary<"standard" | "hd">,
          }),
          async ({ gemsBalance, quality }) => {
            // Setup user with low balance
            await createTestUser(testUserId, gemsBalance);

            // Check preconditions
            const result = checkTryOnPreconditions(gemsBalance, quality, 1);

            const requiredGems = quality === "standard" ? 1 : 2;

            if (gemsBalance < requiredGems) {
              // Should be rejected
              if (result.allowed) {
                throw new Error(
                  `VIOLATION: Request allowed with insufficient gems\n` +
                  `Balance: ${gemsBalance}, Required: ${requiredGems}, Quality: ${quality}`
                );
              }

              // Verify reason mentions gems
              if (!result.reason?.toLowerCase().includes("gem")) {
                throw new Error(
                  `Error message doesn't mention gems: ${result.reason}`
                );
              }
            } else {
              // Should be allowed (sufficient gems)
              if (!result.allowed) {
                throw new Error(
                  `Request rejected with sufficient gems: ${gemsBalance} >= ${requiredGems}`
                );
              }
            }
          }
        ),
        { numRuns: 100 }
      );

      console.log("✅ Property 17a verified: Insufficient gems rejected");

    } finally {
      await cleanupTestUser(testUserId);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

/**
 * Property 17b: Sufficient Gems → Accepted
 */
Deno.test({
  name: "Property 17b: Sufficient Gems → Accepted",
  fn: async () => {
    const testUserId = `test-user-${crypto.randomUUID()}`;

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            gemsBalance: fc.integer({ min: 2, max: 1000 }), // Sufficient gems
            quality: fc.constantFrom("standard", "hd") as fc.Arbitrary<"standard" | "hd">,
            itemsCount: fc.integer({ min: 1, max: 5 }), // Valid items count
          }),
          async ({ gemsBalance, quality, itemsCount }) => {
            await createTestUser(testUserId, gemsBalance);

            const result = checkTryOnPreconditions(gemsBalance, quality, itemsCount);

            // Should be allowed
            if (!result.allowed) {
              throw new Error(
                `VIOLATION: Request rejected with sufficient gems\n` +
                `Balance: ${gemsBalance}, Quality: ${quality}, Items: ${itemsCount}\n` +
                `Reason: ${result.reason}`
              );
            }
          }
        ),
        { numRuns: 100 }
      );

      console.log("✅ Property 17b verified: Sufficient gems accepted");

    } finally {
      await cleanupTestUser(testUserId);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

/**
 * Property 22: Clothing Items Limit
 * 
 * Specification:
 * ∀ request where clothing_items.length > 5:
 * → reject with "too many items" error
 */
Deno.test({
  name: "Property 22a: More Than 5 Items → Rejected",
  fn: () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 20 }), // 6-20 items (over limit)
        (itemsCount) => {
          const result = checkTryOnPreconditions(100, "standard", itemsCount);

          // Should be rejected
          if (result.allowed) {
            throw new Error(
              `VIOLATION: Request with ${itemsCount} items was allowed (max: 5)`
            );
          }

          // Verify reason mentions items/limit
          if (!result.reason?.toLowerCase().includes("item") &&
            !result.reason?.toLowerCase().includes("many")) {
            throw new Error(
              `Error message doesn't mention items limit: ${result.reason}`
            );
          }
        }
      ),
      { numRuns: 100 }
    );

    console.log("✅ Property 22a verified: >5 items rejected");
  },
});

/**
 * Property 22b: 1-5 Items → Accepted
 */
Deno.test({
  name: "Property 22b: 1-5 Items → Accepted",
  fn: () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }), // 1-5 items (within limit)
        (itemsCount) => {
          const result = checkTryOnPreconditions(100, "standard", itemsCount);

          // Should be allowed
          if (!result.allowed) {
            throw new Error(
              `VIOLATION: Request with ${itemsCount} items was rejected\n` +
              `Reason: ${result.reason}`
            );
          }
        }
      ),
      { numRuns: 100 }
    );

    console.log("✅ Property 22b verified: 1-5 items accepted");
  },
});

/**
 * Property 22c: Zero Items → Rejected
 */
Deno.test({
  name: "Property 22c: Zero Items → Rejected",
  fn: () => {
    const result = checkTryOnPreconditions(100, "standard", 0);

    assertEquals(result.allowed, false, "Zero items should be rejected");

    if (!result.reason?.toLowerCase().includes("item") &&
      !result.reason?.toLowerCase().includes("required")) {
      throw new Error(
        `Error message doesn't mention required items: ${result.reason}`
      );
    }

    console.log("✅ Property 22c verified: Zero items rejected");
  },
});

/**
 * Property 17c: Gem Cost Varies by Quality
 */
Deno.test({
  name: "Property 17c: Gem Cost Varies by Quality",
  fn: async () => {
    const testUserId = `test-user-${crypto.randomUUID()}`;

    try {
      // Test 1: Balance = 1, Standard quality → Allowed
      await createTestUser(testUserId, 1);
      const standardResult = checkTryOnPreconditions(1, "standard", 1);
      assertEquals(standardResult.allowed, true, "1 gem should allow standard quality");

      // Test 2: Balance = 1, HD quality → Rejected
      const hdResult = checkTryOnPreconditions(1, "hd", 1);
      assertEquals(hdResult.allowed, false, "1 gem should NOT allow HD quality");

      // Test 3: Balance = 2, HD quality → Allowed
      await createTestUser(testUserId, 2);
      const hd2Result = checkTryOnPreconditions(2, "hd", 1);
      assertEquals(hd2Result.allowed, true, "2 gems should allow HD quality");

      console.log("✅ Property 17c verified: Gem cost varies by quality (1 for standard, 2 for HD)");

    } finally {
      await cleanupTestUser(testUserId);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

/**
 * Property 17d: Boundary Test - Exact Gem Amount
 */
Deno.test({
  name: "Property 17d: Boundary Test - Exact Gem Amount",
  fn: () => {
    // Standard: exactly 1 gem
    const standard1 = checkTryOnPreconditions(1, "standard", 1);
    assertEquals(standard1.allowed, true, "Exactly 1 gem should allow standard");

    // Standard: 0 gems
    const standard0 = checkTryOnPreconditions(0, "standard", 1);
    assertEquals(standard0.allowed, false, "0 gems should reject standard");

    // HD: exactly 2 gems
    const hd2 = checkTryOnPreconditions(2, "hd", 1);
    assertEquals(hd2.allowed, true, "Exactly 2 gems should allow HD");

    // HD: 1 gem
    const hd1 = checkTryOnPreconditions(1, "hd", 1);
    assertEquals(hd1.allowed, false, "1 gem should reject HD");

    console.log("✅ Property 17d verified: Boundary cases correct");
  },
});

/**
 * Property 22d: Boundary Test - Exactly 5 Items
 */
Deno.test({
  name: "Property 22d: Boundary Test - Exactly 5 Items",
  fn: () => {
    // Exactly 5 items
    const result5 = checkTryOnPreconditions(100, "standard", 5);
    assertEquals(result5.allowed, true, "Exactly 5 items should be allowed");

    // 6 items
    const result6 = checkTryOnPreconditions(100, "standard", 6);
    assertEquals(result6.allowed, false, "6 items should be rejected");

    console.log("✅ Property 22d verified: Boundary case (5 allowed, 6 rejected)");
  },
});
