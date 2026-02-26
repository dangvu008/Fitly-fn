# Property-Based Testing - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Prerequisites

```bash
# Install Deno (if not installed)
curl -fsSL https://deno.land/install.sh | sh

# Verify installation
deno --version
```

### 2. Setup Test Database

**IMPORTANT**: Tạo một Supabase project riêng cho testing, KHÔNG dùng production!

```bash
# Login to Supabase
npx supabase login

# Create new test project (hoặc dùng existing test project)
# Lấy URL và keys từ Project Settings > API
```

### 3. Configure Environment

```bash
# Export environment variables
export SUPABASE_TEST_URL="https://xxxxx.supabase.co"
export SUPABASE_TEST_SERVICE_KEY="eyJhbGc..."
export SUPABASE_TEST_ANON_KEY="eyJhbGc..."

# Verify
echo $SUPABASE_TEST_URL
```

### 4. Run Migrations

```bash
cd supabase

# Apply migrations to test database
psql $DATABASE_URL -f migrations/001_initial_schema.sql
psql $DATABASE_URL -f migrations/002_create_functions.sql
psql $DATABASE_URL -f migrations/003_rls_policies.sql
psql $DATABASE_URL -f migrations/004_storage_setup.sql

# Or use Supabase CLI
npx supabase db push
```

### 5. Run Tests

```bash
cd tests

# Run all tests
./run_tests.sh --all

# Or run with Deno directly
deno test --allow-net --allow-env
```

## 📊 Expected Output

```
╔════════════════════════════════════════════════╗
║  Supabase Property-Based Test Suite          ║
╚════════════════════════════════════════════════╝

🔍 Checking environment variables...
✅ Environment variables OK

📦 Running ALL tests...

🧪 Running Database Constraints...
running 3 tests from database_constraints.test.ts:
Property 15: Gem Balance Non-Negativity Invariant ... ok (2.5s)
Property 15b: Gem Balance Boundary ... ok (0.8s)
Property 15c: Wardrobe Category Constraint ... ok (1.2s)
✅ Database Constraints passed

🧪 Running Gem Transaction Atomicity...
running 3 tests from gem_transaction_atomicity.test.ts:
Property 14: Concurrent Deductions ... ok (3.2s)
Property 14b: Mixed Deduct/Refund ... ok (2.1s)
Property 14c: Transaction Logging ... ok (0.5s)
✅ Gem Transaction Atomicity passed

🧪 Running RLS Data Isolation...
running 4 tests from rls_data_isolation.test.ts:
Property 28a: RLS Profiles Isolation ... ok (0.6s)
Property 28b: RLS Wardrobe Isolation ... ok (0.7s)
Property 28c: RLS History Isolation ... ok (0.8s)
Property 28d: RLS Random User Pairs ... ok (1.5s)
✅ RLS Data Isolation passed

🧪 Running Image Validation...
running 8 tests from image_validation.test.ts:
Property 5a: Valid JPEG Accepted ... ok (1.8s)
Property 5b: Valid PNG Accepted ... ok (1.9s)
Property 5c: Oversized Rejected ... ok (1.2s)
Property 5d: Invalid Format Rejected ... ok (2.1s)
Property 5e: Boundary 10MB ... ok (0.3s)
Property 5f: Data URL Prefix ... ok (1.0s)
Property 5g: File Extension Mapping ... ok (0.1s)
Property 5h: Malformed Base64 Rejected ... ok (1.1s)
✅ Image Validation passed

🧪 Running Try-On Preconditions...
running 8 tests from tryon_preconditions.test.ts:
Property 17a: Insufficient Gems Rejected ... ok (2.3s)
Property 17b: Sufficient Gems Accepted ... ok (2.4s)
Property 17c: Gem Cost Varies by Quality ... ok (0.4s)
Property 17d: Boundary Exact Gem Amount ... ok (0.2s)
Property 22a: More Than 5 Items Rejected ... ok (1.8s)
Property 22b: 1-5 Items Accepted ... ok (1.9s)
Property 22c: Zero Items Rejected ... ok (0.1s)
Property 22d: Boundary Exactly 5 Items ... ok (0.1s)
✅ Try-On Preconditions passed

🧪 Running Storage-Database Consistency...
running 4 tests from storage_database_consistency.test.ts:
Property 7a: Upload Creates Both Storage File and DB Record ... ok (3.2s)
Property 7b: Delete Removes Both Storage File and DB Record ... ok (2.8s)
Property 7c: DB Failure Triggers Storage Cleanup ... ok (0.9s)
Property 7d: User Isolation - Cannot Access Other User's Files ... ok (1.5s)
✅ Storage-Database Consistency passed

╔════════════════════════════════════════════════╗
║  ✅ All Tests Passed!                         ║
╚════════════════════════════════════════════════╝
⏱️  Total time: 28s
```

## 🔧 Common Issues

### Issue 1: "Test environment variables not set"

**Solution:**
```bash
export SUPABASE_TEST_URL="https://xxxxx.supabase.co"
export SUPABASE_TEST_SERVICE_KEY="your-service-key"
```

### Issue 2: "relation does not exist"

**Solution:** Migrations chưa chạy
```bash
cd supabase
psql $DATABASE_URL -f migrations/001_initial_schema.sql
# ... run all migrations
```

### Issue 3: Tests chạy chậm

**Solution:** Giảm iterations
```typescript
// Trong test file, sửa:
{ numRuns: 100 }  // Giảm xuống 20-30 cho testing nhanh
```

### Issue 4: "permission denied"

**Solution:** Dùng service key (bypass RLS)
```bash
export SUPABASE_TEST_SERVICE_KEY="eyJhbGc..."  # Service role key, not anon key
```

## 📝 Test Categories

### 1. Database Tests (Fast - ~7s)
```bash
./run_tests.sh --db
```
- Constraints
- Atomicity
- RLS

### 2. Image Tests (Medium - ~10s)
```bash
./run_tests.sh --image
```
- Validation
- Size limits
- Format detection

### 3. Business Logic Tests (Fast - ~11s)
```bash
deno test --allow-net --allow-env tryon_preconditions.test.ts
```
- Preconditions
- Gem costs
- Item limits

### 4. Storage-Database Consistency Tests (Medium - ~9s)
```bash
deno test --allow-net --allow-env storage_database_consistency.test.ts
```
- Upload creates both storage + DB
- Delete removes both
- Cleanup on DB failure
- User isolation

## 🎯 Quick Commands

```bash
# Run all tests
./run_tests.sh --all

# Run with verbose output
./run_tests.sh --all --verbose

# Run with coverage report
./run_tests.sh --all --coverage

# Run specific test file
deno test --allow-net --allow-env database_constraints.test.ts

# Run single test by name
deno test --allow-net --allow-env --filter "Property 15" database_constraints.test.ts

# Watch mode (re-run on file change)
deno test --allow-net --allow-env --watch
```

## 📚 Understanding Property Tests

### What is Property-Based Testing?

Thay vì viết:
```typescript
// Example-based test
test("add function", () => {
  assertEquals(add(2, 3), 5);
  assertEquals(add(0, 0), 0);
  assertEquals(add(-1, 1), 0);
});
```

Property-based testing viết:
```typescript
// Property test
fc.assert(
  fc.property(
    fc.integer(), fc.integer(),
    (a, b) => {
      // Property: addition is commutative
      assertEquals(add(a, b), add(b, a));
    }
  ),
  { numRuns: 100 }  // Test với 100 random inputs
);
```

### Benefits

1. **More Coverage**: 100 random inputs vs 3 manual examples
2. **Find Edge Cases**: Discovers bugs you didn't think of
3. **Specification**: Properties document expected behavior
4. **Regression**: Same properties work as code evolves

### Example from Our Tests

```typescript
// Property 15: Gem balance can never be negative
fc.assert(
  fc.property(
    fc.integer({ min: -1000, max: -1 }),  // Generate negative numbers
    async (negativeBalance) => {
      // Try to set balance to negative
      const { error } = await updateBalance(negativeBalance);
      
      // Property: This should ALWAYS fail
      if (!error) {
        throw new Error("VIOLATION: Negative balance accepted!");
      }
    }
  ),
  { numRuns: 100 }
);
```

## 🚦 CI/CD Integration

### GitHub Actions

```yaml
name: Property Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      
      - name: Run Tests
        env:
          SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_TEST_SERVICE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_KEY }}
        run: |
          cd supabase/tests
          ./run_tests.sh --all
```

## 📖 Further Reading

- [fast-check Documentation](https://github.com/dubzzz/fast-check)
- [Property-Based Testing Guide](https://fsharpforfunandprofit.com/posts/property-based-testing/)
- [Deno Testing](https://deno.land/manual/testing)
- [Supabase Testing Best Practices](https://supabase.com/docs/guides/testing)

## 💡 Tips

1. **Start Small**: Run individual test files first
2. **Check Logs**: Verbose mode shows detailed output
3. **Iterate**: Adjust numRuns based on speed/coverage tradeoff
4. **Isolate**: Each test creates/cleans up its own data
5. **Seed**: Use fixed random seed for reproducible failures

## ✅ Checklist

- [ ] Deno installed
- [ ] Test database created (separate from production!)
- [ ] Environment variables exported
- [ ] Migrations applied
- [ ] Tests run successfully
- [ ] All tests passing

## 🆘 Need Help?

1. Check `TESTING_SUMMARY.md` for detailed coverage
2. Check `README.md` for setup instructions
3. Review test files for examples
4. Check Supabase logs for database errors

---

**Ready to test?** Run `./run_tests.sh --all` and watch the magic happen! ✨
