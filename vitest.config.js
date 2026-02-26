/**
 * File: vitest.config.js
 * Purpose: Cấu hình Vitest cho Chrome Extension testing
 * Layer: Testing Infrastructure
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['tests/**/*.test.js'], // Chỉ chạy tests trong thư mục tests/
    exclude: ['supabase/tests/**/*'], // Exclude Deno tests
  },
})
