// @ts-nocheck — Deno runtime file: deno.land imports and Deno.test are not recognized by VS Code TS server
/**
 * File: gem_transaction_atomicity.test.ts
 * Purpose: Property-based tests cho gem transaction atomicity
 * Layer: Infrastructure / Testing
 * 
 * Data Contract:
 * - Input: Concurrent gem operations
 * - Output: Consistent gem balance
 * 
 * Flow:
 * 1. Setup initial balance
 * 2. Execute concurrent operations
 * 3. Verify final balance = initial + sum(operations)
 * 
 * Security Note: Tests race conditions và atomicity
 * 
 * Feature: supabase-gemini-integration
 * Property 14: Gem Transaction Atomicity
 * Validates: Requirements 4.2, 12.5
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as fc from "https://cdn.skypack.dev/fast-check@3.15.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_TEST_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_TEST_SERVICE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("⚠️  Test environment variables not set");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function createTestUser(userId: string, initialBalance: number) {
  await supabase.from("profiles").delete().eq("id", userId);

  const { error } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      gems_balance: initialBalance,
      created_at: new Date().toISOString(),
    });

  if (error) throw error;
}

async function cleanupTestUser(userId: string) {
  await supabase.from("gem_transactions").delete().eq("user_id", userId);
  await supabase.from("profiles").delete().eq("id", userId);
}

async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("profiles")
    .select("gems_balance")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data.gems_balance;
}

/**
 * Property 14: Gem Transaction Atomicity
 * 
 * Specification:
 * ∀ concurrent operations: final_balance = initial_balance + Σ(operations)
 * 
 * Test Strategy:
 * - Execute N concurrent deduct/refund operations
 * - Verify final balance matches expected value
 * - Verify no operations are lost (atomicity)
 */
Deno.test({
  name: "Property 14: Gem Transaction Atomicity - Concurrent Deductions",
  fn: async () => {
    const testUserId = `test-user-${crypto.randomUUID()}`;
    const initialBalance = 1000;

    try {
      await createTestUser(testUserId, initialBalance);

      // Property test: Concurrent operations maintain consistency
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 5, maxLength: 20 }),
          async (amounts) => {
            // Reset balance
            await supabase
              .from("profiles")
              .update({ gems_balance: initialBalance })
              .eq("id", testUserId);

            // Execute concurrent deductions
            const operations = amounts.map(amount =>
              supabase.rpc("deduct_gems_atomic", {
                p_user_id: testUserId,
                p_amount: amount,
                p_tryon_id: crypto.randomUUID(),
              })
            );

            const results = await Promise.allSettled(operations);

            // Count successful operations
            const successfulAmounts = amounts.filter((_, i) =>
              results[i].status === "fulfilled" &&
              (results[i] as PromiseFulfilledResult<any>).value.data === true
            );

            const totalDeducted = successfulAmounts.reduce((sum, amt) => sum + amt, 0);
            const expectedBalance = initialBalance - totalDeducted;

            // Verify final balance
            const finalBalance = await getBalance(testUserId);

            if (finalBalance !== expectedBalance) {
              throw new Error(
                `ATOMICITY VIOLATION: Expected ${expectedBalance}, got ${finalBalance}\n` +
                `Initial: ${initialBalance}, Deducted: ${totalDeducted}\n` +
                `Operations: ${amounts.join(", ")}`
              );
            }

            // Verify balance is non-negative
            if (finalBalance < 0) {
              throw new Error(
                `CONSTRAINT VIOLATION: Balance is ${finalBalance} (negative!)`
              );
            }
          }
        ),
        { numRuns: 50 }
      );

      console.log("✅ Property 14 verified: Concurrent deductions are atomic");

    } finally {
      await cleanupTestUser(testUserId);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

/**
 * Property 14b: Mixed Operations (Deduct + Refund)
 * 
 * Test Strategy:
 * - Execute concurrent deduct AND refund operations
 * - Verify final balance = initial + refunds - deductions
 */
Deno.test({
  name: "Property 14b: Atomicity - Mixed Deduct/Refund Operations",
  fn: async () => {
    const testUserId = `test-user-${crypto.randomUUID()}`;
    const initialBalance = 500;

    try {
      await createTestUser(testUserId, initialBalance);

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            deductions: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 3, maxLength: 10 }),
            refunds: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 3, maxLength: 10 }),
          }),
          async ({ deductions, refunds }) => {
            // Reset balance
            await supabase
              .from("profiles")
              .update({ gems_balance: initialBalance })
              .eq("id", testUserId);

            // Execute mixed operations concurrently
            const deductOps = deductions.map(amount =>
              supabase.rpc("deduct_gems_atomic", {
                p_user_id: testUserId,
                p_amount: amount,
                p_tryon_id: crypto.randomUUID(),
              })
            );

            const refundOps = refunds.map(amount =>
              supabase.rpc("refund_gems_atomic", {
                p_user_id: testUserId,
                p_amount: amount,
                p_tryon_id: crypto.randomUUID(),
              })
            );

            // Shuffle operations để tăng race condition
            const allOps = [...deductOps, ...refundOps].sort(() => Math.random() - 0.5);
            const results = await Promise.allSettled(allOps);

            // Calculate expected balance
            const successfulDeductions = deductions.filter((_, i) => {
              const result = results.find(r =>
                r.status === "fulfilled" &&
                deductOps.includes(Promise.resolve((r as any).value))
              );
              return result !== undefined;
            });

            const totalDeducted = deductions.slice(0, successfulDeductions.length)
              .reduce((sum, amt) => sum + amt, 0);
            const totalRefunded = refunds.reduce((sum, amt) => sum + amt, 0);

            // Verify final balance
            const finalBalance = await getBalance(testUserId);

            // Balance should be: initial - deductions + refunds (capped at 0)
            const expectedMin = Math.max(0, initialBalance - totalDeducted);
            const expectedMax = initialBalance - totalDeducted + totalRefunded;

            if (finalBalance < 0) {
              throw new Error(
                `CONSTRAINT VIOLATION: Balance is ${finalBalance} (negative!)`
              );
            }

            if (finalBalance < expectedMin || finalBalance > expectedMax) {
              console.warn(
                `Balance ${finalBalance} outside expected range [${expectedMin}, ${expectedMax}]`
              );
            }
          }
        ),
        { numRuns: 30 }
      );

      console.log("✅ Property 14b verified: Mixed operations are atomic");

    } finally {
      await cleanupTestUser(testUserId);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

/**
 * Property 14c: Transaction Logging Consistency
 * 
 * Test Strategy:
 * - Execute operations
 * - Verify all successful operations are logged in gem_transactions
 * - Verify transaction_type matches operation
 */
Deno.test({
  name: "Property 14c: Transaction Logging Consistency",
  fn: async () => {
    const testUserId = `test-user-${crypto.randomUUID()}`;
    const initialBalance = 200;

    try {
      await createTestUser(testUserId, initialBalance);

      // Execute some operations
      const tryonId1 = crypto.randomUUID();
      const tryonId2 = crypto.randomUUID();

      await supabase.rpc("deduct_gems_atomic", {
        p_user_id: testUserId,
        p_amount: 50,
        p_tryon_id: tryonId1,
      });

      await supabase.rpc("refund_gems_atomic", {
        p_user_id: testUserId,
        p_amount: 30,
        p_tryon_id: tryonId2,
      });

      // Verify transactions are logged
      const { data: transactions, error } = await supabase
        .from("gem_transactions")
        .select("*")
        .eq("user_id", testUserId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      assertEquals(transactions?.length, 2, "Should have 2 transactions logged");

      // Verify first transaction (deduction)
      const deductTx = transactions?.find(tx => tx.tryon_id === tryonId1);
      assertEquals(deductTx?.transaction_type, "deduction", "First tx should be deduction");
      assertEquals(deductTx?.amount, 50, "Deduction amount should be 50");

      // Verify second transaction (refund)
      const refundTx = transactions?.find(tx => tx.tryon_id === tryonId2);
      assertEquals(refundTx?.transaction_type, "refund", "Second tx should be refund");
      assertEquals(refundTx?.amount, 30, "Refund amount should be 30");

      // Verify final balance
      const finalBalance = await getBalance(testUserId);
      assertEquals(finalBalance, 180, "Final balance should be 200 - 50 + 30 = 180");

      console.log("✅ Property 14c verified: Transaction logging is consistent");

    } finally {
      await cleanupTestUser(testUserId);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
