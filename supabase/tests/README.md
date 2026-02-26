# Supabase Property-Based Tests

## Overview

Đây là test suite cho **supabase-gemini-integration** spec, sử dụng property-based testing để verify correctness properties.

## Test Categories

### 1. Database Constraints Tests
- **File**: `database_constraints.test.ts`
- **Properties**: 15, 15b, 15c
- **Coverage**: Gem balance non-negativity, category constraints

### 2. Gem Transaction Atomicity Tests
- **File**: `gem_transaction_atomicity.test.ts`
- **Properties**: 14, 14b, 14c
- **Coverage**: Concurrent operations, mixed deduct/refund, transaction logging

### 3. RLS Data Isolation Tests
- **File**: `rls_data_isolation.test.ts`
- **Properties**: 28a, 28b, 28c, 28d
- **Coverage**: Cross-user access prevention, profiles, wardrobe, history

### 4. Storage-Database Consistency Tests
- **File**: `storage_database_consistency.test.ts`
- **Properties**: 7a, 7b, 7c, 7d
- **Coverage**: Upload creates both storage + DB, delete removes both, cleanup on failure, user isolation

## Setup

### Prerequisites

1. **Supabase Test Project**: Tạo một Supabase project riêng cho testing (KHÔNG dùng production!)

2. **Environment Variables**: Export các biến sau:

```bash
# Supabase Test Project
export SUPABASE_TEST_URL="https://your-test-project.supabase.co"
export SUPABASE_TEST_ANON_KEY="your-anon-key"
export SUPABASE_TEST_SERVICE_KEY="your-service-role-key"
```

3. **Database Setup**: Chạy migrations trên test project:

```bash
# Từ thư mục supabase/
psql $DATABASE_URL -f migrations/001_initial_schema.sql
psql $DATABASE_URL -f migrations/002_create_functions.sql
psql $DATABASE_URL -f migrations/003_rls_policies.sql
psql $DATABASE_URL -f migrations/004_storage_setup.sql
```

### TypeScript Configuration

Test suite sử dụng Deno runtime với TypeScript. Các file cấu hình:

- **deno.json**: Compiler options cho Deno
- **deno.d.ts**: Type declarations cho Deno global APIs
- **types.d.ts**: Type stubs cho CDN imports (fast-check, supabase-js)

Các file này đảm bảo TypeScript compiler trong VS Code không báo lỗi khi làm việc với Deno-style imports.

## Running Tests

### Run All Tests

```bash
cd supabase/tests
deno test --allow-net --allow-env
```

### Run Specific Test File

```bash
# Database constraints only
deno test --allow-net --allow-env database_constraints.test.ts

# Gem atomicity only
deno test --allow-net --allow-env gem_transaction_atomicity.test.ts

# RLS isolation only
deno test --allow-net --allow-env rls_data_isolation.test.ts
```

### Run with Verbose Output

```bash
deno test --allow-net --allow-env --trace-ops
```

## Test Configuration

### Number of Iterations

Mỗi property test chạy với số lượng iterations khác nhau:
- **Database constraints**: 100 iterations
- **Gem atomicity**: 50 iterations (concurrent operations tốn thời gian)
- **RLS isolation**: 20 iterations (setup/cleanup phức tạp)

Để tăng iterations (chạy lâu hơn nhưng coverage tốt hơn):

```typescript
// Trong test file, sửa:
{ numRuns: 100 } // Tăng từ 50 lên 100
```

## Expected Results

### Success Output

```
running 3 tests from ./database_constraints.test.ts:
Property 15: Gem Balance Non-Negativity Invariant ... ok (2.5s)
Property 15b: Gem Balance Boundary ... ok (0.8s)
Property 15c: Wardrobe Category Constraint ... ok (1.2s)

✅ Property 15 verified: Gem balance non-negativity enforced
✅ Property 15b verified: Boundary case (0 allowed, -1 rejected)
✅ Property 15c verified: Category constraint enforced

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

### Failure Output

Nếu test fail, bạn sẽ thấy counterexample:

```
Property 15: Gem Balance Non-Negativity Invariant ... FAILED

Error: VIOLATION: gems_balance set to -42 (expected: constraint error)
Counterexample: { negativeBalance: -42 }

Shrunk counterexample: { negativeBalance: -1 }
```

## Troubleshooting

### Error: "Test environment variables not set"

**Solution**: Export SUPABASE_TEST_URL và SUPABASE_TEST_SERVICE_KEY

### Error: "relation does not exist"

**Solution**: Chạy migrations trên test database

### Error: "permission denied"

**Solution**: 
1. Verify RLS policies đã được enable
2. Check service key có quyền bypass RLS

### Tests chạy chậm

**Solution**:
1. Giảm `numRuns` trong test config
2. Sử dụng test database gần hơn (cùng region)
3. Chạy từng file test riêng lẻ

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Property Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      
      - name: Run Property Tests
        env:
          SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_TEST_SERVICE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_KEY }}
        run: |
          cd supabase/tests
          deno test --allow-net --allow-env
```

## Best Practices

1. **Isolation**: Mỗi test tạo và cleanup test users riêng
2. **Idempotency**: Tests có thể chạy nhiều lần mà không ảnh hưởng nhau
3. **Determinism**: Sử dụng random seed cố định khi debug
4. **Fast Feedback**: Chạy tests nhanh trước (constraints), tests chậm sau (concurrency)

## Coverage Report

| Property | Test File | Status | Iterations |
|----------|-----------|--------|------------|
| 15 | database_constraints | ✅ | 100 |
| 15b | database_constraints | ✅ | 1 |
| 15c | database_constraints | ✅ | 50 |
| 14 | gem_transaction_atomicity | ✅ | 50 |
| 14b | gem_transaction_atomicity | ✅ | 30 |
| 14c | gem_transaction_atomicity | ✅ | 1 |
| 28a | rls_data_isolation | ✅ | 1 |
| 28b | rls_data_isolation | ✅ | 1 |
| 28c | rls_data_isolation | ✅ | 1 |
| 28d | rls_data_isolation | ✅ | 20 |
| 7a | storage_database_consistency | ✅ | 20 |
| 7b | storage_database_consistency | ✅ | 20 |
| 7c | storage_database_consistency | ✅ | 1 |
| 7d | storage_database_consistency | ✅ | 1 |

## Next Steps

Sau khi tất cả tests pass:

1. ✅ Verify trên test database
2. ⏭️ Deploy migrations lên staging
3. ⏭️ Run tests trên staging
4. ⏭️ Deploy lên production

## Support

Nếu gặp vấn đề với tests, check:
1. Supabase test project có đang chạy không
2. Migrations đã apply đầy đủ chưa
3. Environment variables đã set đúng chưa
4. Network connection tới Supabase có ổn định không
