/**
 * File: tests/setup.js
 * Purpose: Mock Chrome Extension APIs + Supabase client cho testing
 * Layer: Testing Infrastructure
 *
 * ARCHITECTURE NOTE:
 * Mock supabase.auth mirrors the production architecture where
 * Supabase client is the single source of truth for token state.
 * Both chrome.storage.local and supabase.auth read from mockStorage.
 */

import { vi } from 'vitest'

// Mock Chrome Storage API
const mockStorage = new Map()

// Mock supabase auth state (separate from storage for more control)
let _mockSupabaseRefreshResult = null

global.chrome = {
  storage: {
    local: {
      get: vi.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorage.get(keys) })
        }
        if (Array.isArray(keys)) {
          const result = {}
          keys.forEach(key => {
            if (mockStorage.has(key)) {
              result[key] = mockStorage.get(key)
            }
          })
          return Promise.resolve(result)
        }
        // Get all
        const result = {}
        mockStorage.forEach((value, key) => {
          result[key] = value
        })
        return Promise.resolve(result)
      }),
      set: vi.fn((items) => {
        Object.entries(items).forEach(([key, value]) => {
          mockStorage.set(key, value)
        })
        return Promise.resolve()
      }),
      remove: vi.fn((keys) => {
        const keyArray = Array.isArray(keys) ? keys : [keys]
        keyArray.forEach(key => mockStorage.delete(key))
        return Promise.resolve()
      }),
      clear: vi.fn(() => {
        mockStorage.clear()
        return Promise.resolve()
      })
    }
  },
  runtime: {
    sendMessage: vi.fn()
  }
}

// Mock Supabase client — single source of truth for auth
const mockSupabase = {
  auth: {
    getSession: vi.fn(async () => {
      const token = mockStorage.get('auth_token')
      const refreshToken = mockStorage.get('refresh_token')
      const expiresAt = mockStorage.get('expires_at')

      if (!token) return { data: { session: null }, error: null }

      const expiresAtSec = expiresAt ? Math.floor(expiresAt / 1000) : 0
      return {
        data: {
          session: {
            access_token: token,
            refresh_token: refreshToken,
            expires_at: expiresAtSec,
            user: { id: 'test-user' }
          }
        },
        error: null
      }
    }),
    refreshSession: vi.fn(async () => {
      // Use custom result if set, otherwise simulate successful refresh
      if (_mockSupabaseRefreshResult) {
        const result = _mockSupabaseRefreshResult
        // Also update storage to match (simulating Supabase client behavior)
        if (result.data?.session?.access_token) {
          const expiresAtMs = Date.now() + (result.data.session.expires_in || 3600) * 1000
          mockStorage.set('auth_token', result.data.session.access_token)
          if (result.data.session.refresh_token) {
            mockStorage.set('refresh_token', result.data.session.refresh_token)
          }
          mockStorage.set('expires_at', expiresAtMs)
        }
        return result
      }
      // Default: successful refresh
      const newToken = 'refreshed-supabase-token'
      const expiresAtMs = Date.now() + 3600 * 1000
      mockStorage.set('auth_token', newToken)
      mockStorage.set('expires_at', expiresAtMs)
      return {
        data: {
          session: {
            access_token: newToken,
            refresh_token: mockStorage.get('refresh_token') || 'mock-refresh-token',
            expires_at: Math.floor(expiresAtMs / 1000),
            user: { id: 'test-user' }
          }
        },
        error: null
      }
    }),
    setSession: vi.fn(async ({ access_token, refresh_token }) => {
      if (access_token) mockStorage.set('auth_token', access_token)
      if (refresh_token) mockStorage.set('refresh_token', refresh_token)
      return { data: { session: { access_token, refresh_token } }, error: null }
    })
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseKey: 'test-anon-key'
}

// Export mock supabase for vi.mock
vi.mock('../extension/config.js', () => ({
  supabase: mockSupabase
}))

// Helper để reset mock storage giữa các tests
global.resetMockStorage = () => {
  mockStorage.clear()
  _mockSupabaseRefreshResult = null
  mockSupabase.auth.getSession.mockClear()
  mockSupabase.auth.refreshSession.mockClear()
  mockSupabase.auth.setSession.mockClear()
}

// Helper để set token với TTL cụ thể
global.setMockToken = (ttlSeconds) => {
  const now = Date.now()
  const expiresAt = now + (ttlSeconds * 1000)
  mockStorage.set('auth_token', 'mock-jwt-token')
  mockStorage.set('refresh_token', 'mock-refresh-token')
  mockStorage.set('expires_at', expiresAt)
}

// Helper để get token TTL
global.getMockTokenTTL = () => {
  const expiresAt = mockStorage.get('expires_at')
  if (!expiresAt) return null
  return Math.floor((expiresAt - Date.now()) / 1000)
}

// Helper to configure supabase.auth.refreshSession() mock result
global.setMockRefreshResult = (result) => {
  _mockSupabaseRefreshResult = result
}

// Helper to get mock supabase for direct assertions
global.getMockSupabase = () => mockSupabase

