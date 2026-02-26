# Session Timeout During Try-On Processing - Bugfix Design

## Overview

Bug này xảy ra khi JWT token hết hạn trong quá trình xử lý try-on (15-180 giây), dẫn đến lỗi 401 Unauthorized và user bị logout không cần thiết. Nguyên nhân chính là `supabase_service.js` không kiểm tra token expiry trước khi gọi Edge Function, và không có cơ chế retry khi token expire giữa chừng.

Giải pháp: Thêm cơ chế **proactive token refresh** trước mỗi API call quan trọng, và **retry logic** khi gặp 401 để tự động refresh token và thử lại request.

## Glossary

- **Bug_Condition (C)**: Token hết hạn trong quá trình gọi Edge Function (đặc biệt là `process-tryon`)
- **Property (P)**: API call phải tự động refresh token và retry khi gặp 401, không logout user
- **Preservation**: Các API call khác (không phải Edge Function) và flow logout thủ công phải hoạt động như cũ
- **JWT Token**: Access token từ Supabase Auth, có thời hạn 1 giờ (3600s)
- **Refresh Token**: Token dùng để lấy access token mới khi hết hạn
- **Edge Function**: Supabase serverless function (process-tryon, upload-image, get-gems-balance...)
- **TTL (Time To Live)**: Thời gian còn lại trước khi token hết hạn

## Bug Details

### Fault Condition

Bug xảy ra khi user thực hiện try-on với token sắp hết hạn (TTL < 180s). Quá trình xử lý try-on mất 15-180 giây, trong thời gian này token có thể expire, dẫn đến Edge Function trả về 401 Unauthorized.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { apiCall: EdgeFunctionCall, tokenTTL: number }
  OUTPUT: boolean
  
  RETURN input.apiCall.functionName IN ['process-tryon', 'upload-image', 'get-tryon-status']
         AND input.tokenTTL < input.apiCall.estimatedDuration
         AND NOT tokenRefreshedBeforeCall
END FUNCTION
```

### Examples

**Ví dụ 1: Token expire giữa chừng try-on**
- User có token với TTL = 120 giây
- User click "Thử đồ" → gọi `process-tryon` Edge Function
- Quá trình xử lý mất 150 giây
- Sau 120 giây, token hết hạn → Edge Function trả về 401
- User bị logout và mất kết quả try-on

**Ví dụ 2: Token expire trước khi gọi API**
- User có token với TTL = 30 giây
- User click "Thử đồ" → gọi `callEdgeFunction('process-tryon')`
- `getAuthHeader()` lấy token cũ (TTL = 30s) mà không refresh
- Edge Function nhận token đã expire → trả về 401 ngay lập tức

**Ví dụ 3: Concurrent API calls với token sắp hết hạn**
- User có token với TTL = 60 giây
- User upload 3 ảnh wardrobe cùng lúc → 3 calls `upload-image` song song
- Cả 3 calls đều lấy token cũ → 1-2 calls có thể fail với 401

**Edge Case: Refresh token cũng hết hạn**
- User không dùng app trong 30 ngày → refresh token hết hạn
- User quay lại và thử try-on → refresh fail → phải logout thật

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Các API call không phải Edge Function (direct Supabase queries) phải hoạt động như cũ
- Flow logout thủ công (user click "Đăng xuất") phải hoạt động như cũ
- Token refresh tự động khi TTL < 10 phút (logic hiện tại trong `getAuthToken()`) phải giữ nguyên
- Demo mode và guest mode logic phải không bị ảnh hưởng

**Scope:**
Tất cả inputs KHÔNG liên quan đến Edge Function calls (process-tryon, upload-image, get-tryon-status) phải hoạt động như cũ. Bao gồm:
- Direct Supabase queries (`supabase.from('table').select()`)
- Chrome storage operations
- UI state updates
- Non-authenticated API calls

## Hypothesized Root Cause

Dựa trên phân tích code, các nguyên nhân chính là:

1. **Missing Proactive Refresh**: `callEdgeFunction()` trong `supabase_service.js` gọi `getAuthHeader()` mà không kiểm tra TTL trước. `getAuthHeader()` chỉ refresh khi TTL < 10 phút, nhưng Edge Function có thể mất > 10 phút để xử lý.

2. **No Retry Logic**: Khi Edge Function trả về 401, `handle_tryon_processing.js` chỉ logout user ngay lập tức, không thử refresh token và retry request.

3. **Race Condition in Concurrent Calls**: Nhiều API calls cùng lúc có thể trigger multiple refresh attempts, dẫn đến token mismatch hoặc refresh loop.

4. **Insufficient TTL Buffer**: Token với TTL = 180s vẫn được dùng cho try-on, nhưng quá trình xử lý có thể mất đến 180s → không đủ buffer.

## Correctness Properties

Property 1: Fault Condition - Token Auto-Refresh Before Edge Function

_For any_ Edge Function call (process-tryon, upload-image, get-tryon-status) where the current token TTL is less than 5 minutes (300 seconds), the fixed `callEdgeFunction()` SHALL automatically refresh the token BEFORE making the API call, ensuring the token has maximum remaining lifetime (~1 hour).

**Validates: Requirements 2.1, 2.2**

Property 2: Fault Condition - Retry on 401 with Fresh Token

_For any_ Edge Function call that receives a 401 Unauthorized response, the fixed `callEdgeFunction()` SHALL automatically refresh the token and retry the request ONCE, only logging out the user if the retry also fails with 401.

**Validates: Requirements 2.3, 2.4**

Property 3: Preservation - Non-Edge-Function Calls Unchanged

_For any_ API call that is NOT an Edge Function call (direct Supabase queries, Chrome storage, UI updates), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing token refresh logic in `getAuthHeader()` and `getAuthToken()`.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation - Manual Logout Flow Unchanged

_For any_ user-initiated logout action (click "Đăng xuất" button, explicit logout call), the fixed code SHALL produce exactly the same behavior as the original code, immediately clearing session without attempting token refresh.

**Validates: Requirements 3.3**

## Fix Implementation

### Changes Required

Giả định root cause analysis đúng, các thay đổi cần thực hiện:

**File 1**: `lib/supabase_service.js`

**Function**: `callEdgeFunction()`

**Specific Changes**:

1. **Thêm Proactive Token Refresh**:
   - Import `forceRefreshToken()` từ `background/auth_state_manager.js`
   - Gọi `forceRefreshToken()` TRƯỚC khi lấy auth header
   - Đảm bảo token có TTL tối thiểu 5 phút (300s) trước mỗi Edge Function call

2. **Thêm Retry Logic với 401**:
   - Wrap fetch call trong try-catch
   - Nếu response.status === 401:
     - Gọi `forceRefreshToken()` để lấy token mới
     - Retry request với token mới (chỉ 1 lần)
     - Nếu retry vẫn 401 → throw error để logout

3. **Thêm Timeout Protection**:
   - Set timeout cho Edge Function calls (mặc định 180s)
   - Nếu timeout → throw error với errorCode = 'TIMEOUT' (không logout)

4. **Thêm Concurrent Call Protection**:
   - Sử dụng mutex pattern từ `_refreshPromise` trong `auth_state_manager.js`
   - Đảm bảo chỉ 1 refresh call active tại 1 thời điểm

5. **Logging và Error Context**:
   - Log token TTL trước và sau refresh
   - Log retry attempts
   - Throw error với errorCode rõ ràng: 'AUTH_EXPIRED', 'TIMEOUT', 'NETWORK_ERROR'

**File 2**: `background/auth_state_manager.js`

**Function**: `forceRefreshToken()`

**Specific Changes**:

1. **Export Function**: Đảm bảo `forceRefreshToken()` được export để `supabase_service.js` có thể import

2. **Thêm TTL Check**: Trả về token hiện tại nếu TTL > 5 phút (không cần refresh)

3. **Thêm Error Handling**: Throw error rõ ràng khi refresh fail (không chỉ return null)

**File 3**: `sidebar/modules/handle_tryon_processing.js`

**Function**: `processTryOn()`

**Specific Changes**:

1. **Xử lý Error Code**: Kiểm tra `response.errorCode` thay vì keyword matching trong error message

2. **Phân biệt Error Types**:
   - `AUTH_EXPIRED` → logout user
   - `TIMEOUT` → show warning, không logout
   - `NETWORK_ERROR` → show warning, không logout
   - Other errors → show error overlay, không logout

3. **Remove False-Positive Logout**: Xóa logic logout dựa trên keyword "hết hạn" trong error message

## Testing Strategy

### Validation Approach

Testing strategy gồm 2 giai đoạn:
1. **Exploratory Testing**: Chạy tests trên UNFIXED code để surface counterexamples và confirm root cause
2. **Fix Validation**: Chạy tests trên FIXED code để verify fix hoạt động đúng và không break existing behavior

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples demonstrating the bug BEFORE implementing the fix. Confirm hoặc refute root cause analysis.

**Test Plan**: 
1. Mock token với TTL = 60s
2. Gọi `callEdgeFunction('process-tryon')` với mock Edge Function mất 120s
3. Observe: Token expire giữa chừng → 401 error
4. Verify: User bị logout không cần thiết

**Test Cases**:

1. **Token Expire During Try-On** (will fail on unfixed code):
   - Setup: Token với TTL = 120s
   - Action: Gọi `process-tryon` với mock processing time = 150s
   - Expected: 401 error sau 120s, user bị logout
   - Actual (unfixed): ✅ Fail như expected

2. **Token Expire Before API Call** (will fail on unfixed code):
   - Setup: Token với TTL = 30s
   - Action: Gọi `callEdgeFunction('process-tryon')`
   - Expected: Token không được refresh, API call fail với 401
   - Actual (unfixed): ✅ Fail như expected

3. **Concurrent Calls with Expiring Token** (may fail on unfixed code):
   - Setup: Token với TTL = 60s
   - Action: Gọi 3 `upload-image` calls song song
   - Expected: 1-2 calls có thể fail với 401
   - Actual (unfixed): ⚠️ Có thể fail hoặc pass (race condition)

4. **Refresh Token Also Expired** (should fail on both unfixed and fixed code):
   - Setup: Refresh token hết hạn (30 ngày không dùng)
   - Action: Gọi `process-tryon`
   - Expected: Refresh fail → logout user (đúng behavior)
   - Actual: ✅ Logout như expected (không phải bug)

**Expected Counterexamples**:
- Token với TTL < 180s không được refresh trước Edge Function call
- 401 error không trigger retry với fresh token
- User bị logout ngay lập tức khi gặp 401, không phân biệt error type

### Fix Checking

**Goal**: Verify rằng với mọi input thuộc bug condition, fixed function hoạt động đúng.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := callEdgeFunction_fixed(input.functionName, input.body)
  ASSERT result.success = true OR result.errorCode != 'AUTH_EXPIRED'
  ASSERT user_not_logged_out
END FOR
```

**Test Cases**:

1. **Proactive Refresh Works**:
   - Setup: Token với TTL = 120s
   - Action: Gọi `callEdgeFunction('process-tryon')`
   - Expected: Token được refresh trước API call, TTL = ~3600s
   - Verify: API call thành công, không có 401 error

2. **Retry on 401 Works**:
   - Setup: Mock Edge Function trả về 401 lần đầu, 200 lần thứ 2
   - Action: Gọi `callEdgeFunction('process-tryon')`
   - Expected: Retry với fresh token, API call thành công
   - Verify: 2 fetch calls, lần 2 thành công

3. **Timeout Không Logout**:
   - Setup: Mock Edge Function timeout sau 180s
   - Action: Gọi `callEdgeFunction('process-tryon')`
   - Expected: Throw error với errorCode = 'TIMEOUT', user không bị logout
   - Verify: User vẫn authenticated, có thể retry

4. **Concurrent Calls Không Race**:
   - Setup: Token với TTL = 60s
   - Action: Gọi 5 Edge Function calls song song
   - Expected: Chỉ 1 refresh call, tất cả calls dùng token mới
   - Verify: Không có 401 error, không có multiple refresh calls

### Preservation Checking

**Goal**: Verify rằng với mọi input KHÔNG thuộc bug condition, fixed function hoạt động giống original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT callEdgeFunction_original(input) = callEdgeFunction_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing recommended vì:
- Tự động generate nhiều test cases cho non-Edge-Function calls
- Catch edge cases mà manual tests có thể miss
- Đảm bảo không break existing behavior

**Test Plan**: 
1. Observe behavior trên UNFIXED code cho direct Supabase queries
2. Write property-based tests capturing behavior đó
3. Run tests trên FIXED code để verify preservation

**Test Cases**:

1. **Direct Supabase Queries Unchanged**:
   - Setup: Token với TTL = 5 phút (không cần refresh)
   - Action: Gọi `supabase.from('profiles').select()`
   - Expected: Không có proactive refresh, query thành công như cũ
   - Verify: Behavior giống unfixed code

2. **Manual Logout Unchanged**:
   - Setup: User click "Đăng xuất"
   - Action: Gọi `chrome.runtime.sendMessage({ type: 'LOGOUT' })`
   - Expected: Logout ngay lập tức, không refresh token
   - Verify: Session cleared, user redirected to login

3. **Token Refresh < 10 Min Unchanged**:
   - Setup: Token với TTL = 8 phút
   - Action: Gọi `getAuthToken()`
   - Expected: Token được refresh như logic cũ (proactive refresh)
   - Verify: Behavior giống unfixed code

4. **Demo Mode Unchanged**:
   - Setup: `DEMO_MODE_OVERRIDE = true`
   - Action: Gọi `isDemoMode()`
   - Expected: Return true, không check token
   - Verify: Behavior giống unfixed code

### Unit Tests

- Test `callEdgeFunction()` với mock token TTL = 60s → verify proactive refresh
- Test `callEdgeFunction()` với mock 401 response → verify retry logic
- Test `forceRefreshToken()` với token TTL > 5 phút → verify không refresh
- Test error handling với các errorCode khác nhau

### Property-Based Tests

- Generate random token TTL values (0-3600s) và verify proactive refresh chỉ trigger khi TTL < 300s
- Generate random Edge Function names và verify retry logic hoạt động cho tất cả
- Generate random error responses và verify errorCode được set đúng

### Integration Tests

- Test full try-on flow với token sắp hết hạn → verify không có 401 error
- Test concurrent try-on + upload + get-balance → verify không có race condition
- Test try-on với refresh token hết hạn → verify logout đúng cách
