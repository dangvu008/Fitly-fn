/**
 * File: types.d.ts
 * Purpose: Type declarations cho external modules trong Deno tests
 * Layer: Infrastructure / Testing
 * 
 * Data Contract:
 * - Provides type stubs for CDN imports
 * 
 * Security Note: Type declarations only
 */

declare module "https://deno.land/std@0.208.0/assert/mod.ts" {
  export function assertEquals<T>(actual: T, expected: T, msg?: string): void;
  export function assertRejects(
    fn: () => Promise<unknown>,
    errorClass?: new (...args: any[]) => Error,
    msgIncludes?: string,
    msg?: string
  ): Promise<void>;
}

declare module "https://esm.sh/@supabase/supabase-js@2.39.0" {
  export interface SupabaseClient {
    from(table: string): any;
  }
  
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: any
  ): SupabaseClient;
}

declare module "https://cdn.skypack.dev/fast-check@3.15.0" {
  export interface Arbitrary<T> {
    filter(predicate: (value: T) => boolean): Arbitrary<T>;
  }

  export interface AsyncProperty<T> {
    // Property interface
  }

  export function integer(constraints?: {
    min?: number;
    max?: number;
  }): Arbitrary<number>;

  export function string(constraints?: {
    minLength?: number;
    maxLength?: number;
  }): Arbitrary<string>;

  export function asyncProperty<T1>(
    arb1: Arbitrary<T1>,
    predicate: (t1: T1) => Promise<void>
  ): AsyncProperty<T1>;

  export function assert(
    property: AsyncProperty<any>,
    params?: { numRuns?: number }
  ): Promise<void>;
}
