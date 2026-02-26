# Chrome Extension Tests

## Overview

Test suite cho Chrome Extension code (JavaScript), sử dụng Vitest với jsdom environment.

## Test Categories

### Bug Exploration Tests

**File**: `token_expiration_during_tryon.test.js`

**Purpose**: Bug condition exploration test cho session timeout bug

**Feature**: session-timeout-during-tryon-processing (Bugfix)

**Validates**: Requirements 1.1, 1.2, 1.3

**Test Cases**:

1. **Token Expire During Long Processing**
   - Scenario: Token với TTL = 120s, Edge Function mất 150s
   - Expected (unfixed): Token KHÔNG được refresh → 401 error
   - Expected (fixed): Token được refresh trước call → success

2. **Token Not Refreshed Before API Call** ✅ BUG CONFIRMED
   - Scenario: Token với TTL = 30s (< 5 phút)
   - Expected (unfixed): Token KHÔNG được refresh → 401 ngay
   - Expected (fixed): Token được refresh trước call → success
   - **Counterexample**: Token TTL 30s không được refresh, gây 401 error

3. **Concurrent Calls Race Condition** ✅ BUG CONFIRMED
   - Scenario: Token với TTL = 60s, 3 concurrent calls
   - Expected (unfixed): 1-2 calls fail với 401 (race condition)
   - Expected (fixed): Tất cả calls success (mutex refresh)
   - **Counterexample**: 1/3 calls failed do race condition

4. **Refresh Token Expired (Edge Case)**
   - Scenario: Refresh token hết hạn (30 ngày không dùng)
   - Expected: Logout user (correct behavior, không phải bug)
   - Result: ✅ PASSED (correct behavior)

### Preservation Property Tests

**File**: `token_refresh_preservation.test.js`

**Purpose**: Preservation tests để đảm bảo non-buggy behaviors không bị break sau fix

**Feature**: session-timeout-during-tryon-processing (Bugfix)

**Validates**: Requirements 3.1, 3.2, 3.3, 3.4, 3.5

**Test Properties**:

1. **Property 1: Direct Supabase Queries Không Proactive Refresh**
   - Scenario: Direct queries với token TTL > 5 phút
   - Expected: Không trigger proactive refresh, query thành công
   - Result: ✅ PASSED (baseline behavior confirmed)

2. **Property 2: Token Refresh Khi TTL < 10 Phút**
   - Scenario: getAuthToken() với token TTL < 10 phút
   - Expected: Token được refresh (existing behavior)
   - Result: ✅ PASSED (baseline behavior confirmed)

3. **Property 3: Token Không Refresh Khi TTL > 10 Phút**
   - Scenario: getAuthToken() với token TTL > 10 phút
   - Expected: Dùng token hiện tại, không refresh
   - Result: ✅ PASSED (baseline behavior confirmed)

4. **Property 4: Manual Logout Không Refresh Token**
   - Scenario: User click "Đăng xuất"
   - Expected: Clear session ngay, không refresh token
   - Result: ✅ PASSED (baseline behavior confirmed)

5. **Property 5: Demo Mode Không Check Token**
   - Scenario: isDemoMode() khi không có token
   - Expected: Return true, không check expiry
   - Result: ✅ PASSED (baseline behavior confirmed)

6. **Property 6: Demo Mode False Khi Có Token Valid**
   - Scenario: isDemoMode() khi có token còn hạn
   - Expected: Return false (user authenticated)
   - Result: ✅ PASSED (baseline behavior confirmed)

7. **Property 7: Refresh Fallback Khi Proactive Refresh Fail**
   - Scenario: Proactive refresh fail nhưng token còn valid
   - Expected: Fallback to existing token
   - Result: ✅ PASSED (baseline behavior confirmed)

8. **Property 8: Token Expired Hoàn Toàn → Return Null**
   - Scenario: Token expired và refresh fail
   - Expected: Return null
   - Result: ✅ PASSED (baseline behavior confirmed)

## Setup

### Prerequisites

1. **Node.js**: v18+ recommended
2. **npm**: v9+

### Installation

```bash
npm install
```

Dependencies:
- `vitest`: Test runner
- `@vitest/ui`: Test UI (optional)
- `jsdom`: DOM environment for testing

### Configuration

**vitest.config.js**: Vitest configuration
- Environment: jsdom (simulate browser)
- Setup file: `tests/setup.js` (Chrome API mocks)
- Test timeout: 30s
- Include: `tests/**/*.test.js`
- Exclude: `supabase/tests/**/*` (Deno tests)

**tests/setup.js**: Mock Chrome Extension APIs
- `chrome.storage.local`: In-memory storage mock
- `chrome.runtime.sendMessage`: Message passing mock
- Helper functions: `setMockToken()`, `getMockTokenTTL()`, `resetMockStorage()`

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

**Bug Exploration Tests**:
```bash
npx vitest run tests/token_expiration_during_tryon.test.js
```

**Preservation Tests**:
```bash
npx vitest run tests/token_refresh_preservation.test.js
```

### Run with Watch Mode

```bash
npm run test:watch
```

### Run Specific Test File

```bash
npx vitest run tests/token_expiration_during_tryon.test.js
```

### Run with Verbose Output

```bash
npx vitest run --reporter=verbose
```

## Expected Results

### Bug Exploration Tests (UNFIXED Code)

```
✓ SHOULD FAIL: Token với TTL 120s expire trong quá trình process-tryon 150s
× SHOULD FAIL: Token với TTL 30s KHÔNG được refresh trước process-tryon
× SHOULD FAIL: Concurrent calls với token TTL 60s gây race condition
✓ SHOULD PASS: Refresh token hết hạn → logout user (correct behavior)

Test Files  1 failed (1)
Tests  2 failed | 2 passed (4)
```

**Counterexamples Found**:
- Token TTL 30s không được refresh → 401 error
- 1/3 concurrent calls failed do race condition

### Preservation Tests (UNFIXED Code - Baseline)

```
✓ Property 1: Direct Supabase queries với token TTL > 5 phút KHÔNG trigger proactive refresh
✓ Property 2: getAuthToken() refresh token khi TTL < 10 phút (existing behavior)
✓ Property 3: getAuthToken() KHÔNG refresh khi TTL > 10 phút
✓ Property 4: Manual logout clear session ngay lập tức, KHÔNG refresh token
✓ Property 5: isDemoMode() return true khi không có token, không check expiry
✓ Property 6: isDemoMode() return false khi có token còn hạn
✓ Property 7: getAuthToken() fallback to existing token khi refresh fail
✓ Property 8: getAuthToken() return null khi token expired và refresh fail

Test Files  1 passed (1)
Tests  8 passed (8)
```

**Baseline Behaviors Confirmed**:
- Direct queries không trigger proactive refresh
- Token refresh logic < 10 phút hoạt động đúng
- Manual logout không refresh token
- Demo mode logic hoạt động đúng
- Fallback behaviors hoạt động đúng

### After Fix (FIXED Code)

**Bug Exploration Tests**:
```
✓ Token với TTL 120s được refresh trước call → success
✓ Token với TTL 30s được refresh trước call → success
✓ Concurrent calls không có race condition → all success
✓ Refresh token hết hạn → logout user (correct behavior)

Test Files  1 passed (1)
Tests  4 passed (4)
```

**Preservation Tests**:
```
✓ Property 1: Direct Supabase queries với token TTL > 5 phút KHÔNG trigger proactive refresh
✓ Property 2: getAuthToken() refresh token khi TTL < 10 phút (existing behavior)
✓ Property 3: getAuthToken() KHÔNG refresh khi TTL > 10 phút
✓ Property 4: Manual logout clear session ngay lập tức, KHÔNG refresh token
✓ Property 5: isDemoMode() return true khi không có token, không check expiry
✓ Property 6: isDemoMode() return false khi có token còn hạn
✓ Property 7: getAuthToken() fallback to existing token khi refresh fail
✓ Property 8: getAuthToken() return null khi token expired và refresh fail

Test Files  1 passed (1)
Tests  8 passed (8)
```

**No Regressions**: Tất cả preservation tests vẫn PASS sau fix

## Troubleshooting

### Error: "Cannot find module 'jsdom'"

**Solution**: Install jsdom

```bash
npm install --save-dev jsdom
```

### Error: "chrome is not defined"

**Solution**: Verify `tests/setup.js` is loaded in `vitest.config.js`

```javascript
setupFiles: ['./tests/setup.js']
```

### Tests timeout

**Solution**: Increase timeout in `vitest.config.js`

```javascript
testTimeout: 60000 // 60 seconds
```

### Mock storage not working

**Solution**: Call `resetMockStorage()` in `beforeEach()` hook

```javascript
beforeEach(() => {
  resetMockStorage()
  vi.clearAllMocks()
})
```

## Test Helpers

### setMockToken(ttlSeconds)

Set mock token với TTL cụ thể

```javascript
setMockToken(120) // Token expires in 120 seconds
```

### getMockTokenTTL()

Get token TTL còn lại (seconds)

```javascript
const ttl = getMockTokenTTL() // Returns: 120
```

### resetMockStorage()

Clear tất cả mock storage data

```javascript
resetMockStorage()
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Extension Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install Dependencies
        run: npm install
      
      - name: Run Tests
        run: npm test
```

## Best Practices

1. **Isolation**: Mỗi test reset mock storage và clear mocks
2. **Determinism**: Sử dụng fixed TTL values để tests reproducible
3. **Fast Feedback**: Bug exploration tests chạy nhanh (< 1s)
4. **Clear Naming**: Test names mô tả rõ scenario và expected behavior

## Next Steps

Sau khi bug exploration tests FAIL (xác nhận bug):

1. ✅ Counterexamples documented
2. ⏭️ Implement fix theo design document
3. ⏭️ Run tests lại → expect ALL PASS
4. ⏭️ Deploy fix lên production

## Support

Nếu gặp vấn đề với tests, check:
1. Node.js version >= 18
2. Dependencies đã install đầy đủ
3. `vitest.config.js` đúng cấu hình
4. `tests/setup.js` mock Chrome APIs đúng
