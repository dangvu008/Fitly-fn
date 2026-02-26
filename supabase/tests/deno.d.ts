/**
 * File: deno.d.ts
 * Purpose: Type declarations cho Deno runtime trong TypeScript
 * Layer: Infrastructure / Testing
 * 
 * Data Contract:
 * - Provides Deno global types for TypeScript compiler
 * 
 * Security Note: Type declarations only, no runtime code
 */

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
  }

  export const env: Env;

  export interface TestDefinition {
    name: string;
    fn: () => void | Promise<void>;
    sanitizeResources?: boolean;
    sanitizeOps?: boolean;
  }

  export function test(t: TestDefinition): void;
  export function test(name: string, fn: () => void | Promise<void>): void;

  export function exit(code?: number): never;
}

declare const crypto: {
  randomUUID(): string;
};
