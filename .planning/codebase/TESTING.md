# Testing

## Frontend Tests (Extension)

### Framework
- **Vitest** v1.2.0 with **jsdom** environment
- Config: `vitest.config.js` (timeout: 30s, setup: `tests/setup.js`)
- Run: `npm test` or `npm run test:watch`

### Setup (`tests/setup.js`)
- Mocks `chrome.storage.local` (get/set/remove)
- Mocks `chrome.runtime.sendMessage`
- Provides helpers: `setMockToken()`, `getMockTokenTTL()`, `resetMockStorage()`
- Simulates Supabase client token management

### Test Files
| File | Purpose |
|------|---------|
| `token_expiration_during_tryon.test.js` | Bug exploration: session timeout during long try-on |
| `token_refresh_preservation.test.js` | Regression: auth token refresh behavior |
| `callEdgeFunction_integration.test.js` | API integration with Edge Functions |
| `force_refresh_token_ttl_check.test.js` | Token TTL threshold validation |

### Coverage
- Focused on auth/token management edge cases
- No UI component tests
- No content script tests

## Backend Tests (Supabase Edge Functions)

### Framework
- **Deno** built-in test runner
- Config: `supabase/tests/deno.json`
- Types: `supabase/tests/types.d.ts`, `supabase/tests/deno.d.ts`

### Test Files (16+)
| File | Category |
|------|----------|
| `auth_required.test.ts` | Auth enforcement |
| `gem_deduction.test.ts` | Quota management |
| `gem_balance_display.test.ts` | Balance queries |
| `gem_transaction_atomicity.test.ts` | Transaction safety |
| `tryon_preconditions.test.ts` | Input validation |
| `tryon_failure_refund.test.ts` | Error recovery |
| `tryon_state_transition.test.ts` | Job state machine |
| `image_resize.test.ts` | Image compression |
| `image_validation.test.ts` | Format/size validation |
| `prompt_completeness.test.ts` | AI prompt quality |
| `prompt_category.test.ts` | Category detection |
| `quality_mapping.test.ts` | Quality tier mapping |
| `rate_limiting.test.ts` | API rate limits |
| `retry_backoff.test.ts` | Retry logic |
| `rls_data_isolation.test.ts` | Row-level security |
| `database_constraints.test.ts` | Schema integrity |
| `storage_database_consistency.test.ts` | Storage/DB sync |
| `filename_uniqueness.test.ts` | File path dedup |
| `error_sanitization.test.ts` | Error response safety |

## Gaps
- No end-to-end tests
- No content script integration tests
- No sidebar UI tests
- Frontend test coverage limited to auth/token edge cases
