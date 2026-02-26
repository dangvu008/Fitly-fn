# Supabase Database Setup Guide

## Tổng quan

Thư mục này chứa các migration files để setup database schema cho **Fitly - Virtual Try-On** với Supabase backend.

## Cấu trúc

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql      # Tables, indexes, constraints
│   ├── 002_create_functions.sql    # Database functions cho gem operations
│   ├── 003_rls_policies.sql        # Row Level Security policies
│   └── 004_storage_setup.sql       # Storage buckets và policies
├── SECRETS_CONFIGURATION.md         # Hướng dẫn cấu hình Replicate API key
└── README.md                        # File này
```

## Database Schema

### Tables

1. **profiles** - Thông tin user và gems balance
2. **user_models** - Ảnh toàn thân người dùng (model images)
3. **wardrobe_items** - Tủ đồ cá nhân
4. **tryon_history** - Lịch sử thử đồ với AI
5. **gem_transactions** - Audit trail cho gems

### Functions

1. **deduct_gems_atomic()** - Trừ gems với atomic transaction
2. **refund_gems_atomic()** - Hoàn gems khi try-on failed
3. **add_gems_purchase()** - Thêm gems khi user mua

### Security

- **Row Level Security (RLS)** enabled trên tất cả tables
- Users chỉ có thể view/modify data của chính mình
- Auto-create profile khi user đăng ký

## Hướng dẫn Setup

### Bước 1: Truy cập Supabase Dashboard

1. Đăng nhập vào [Supabase Dashboard](https://app.supabase.com)
2. Chọn project của bạn (hoặc tạo project mới)
3. Vào **SQL Editor** từ sidebar

### Bước 2: Chạy Migration 001 - Initial Schema

1. Mở file `migrations/001_initial_schema.sql`
2. Copy toàn bộ nội dung
3. Paste vào SQL Editor
4. Click **Run** để execute

**Kết quả mong đợi:**
- 5 tables được tạo thành công
- Indexes được tạo
- Constraints được áp dụng

### Bước 3: Chạy Migration 002 - Database Functions

1. Mở file `migrations/002_create_functions.sql`
2. Copy toàn bộ nội dung
3. Paste vào SQL Editor
4. Click **Run** để execute

**Kết quả mong đợi:**
- 3 functions được tạo: `deduct_gems_atomic`, `refund_gems_atomic`, `add_gems_purchase`

### Bước 4: Chạy Migration 003 - RLS Policies

1. Mở file `migrations/003_rls_policies.sql`
2. Copy toàn bộ nội dung
3. Paste vào SQL Editor
4. Click **Run** để execute

**Kết quả mong đợi:**
- RLS enabled trên tất cả tables
- Policies được tạo
- Trigger `handle_new_user()` được tạo

### Bước 5: Verify Setup

Chạy các queries sau để verify:

```sql
-- Kiểm tra tables đã được tạo
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Kết quả mong đợi:
-- gem_transactions
-- profiles
-- tryon_history
-- user_models
-- wardrobe_items

-- Kiểm tra functions đã được tạo
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Kết quả mong đợi:
-- add_gems_purchase
-- deduct_gems_atomic
-- handle_new_user
-- refund_gems_atomic
-- update_updated_at_column

-- Kiểm tra RLS đã được enable
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Kết quả mong đợi: rowsecurity = true cho tất cả tables
```

## Test Setup

### Test 1: Tạo user và verify auto-create profile

```sql
-- Giả sử bạn đã có user trong auth.users với id = 'xxx-xxx-xxx'
-- Kiểm tra profile đã được tạo tự động
SELECT * FROM profiles WHERE id = 'xxx-xxx-xxx';

-- Kết quả mong đợi:
-- - Record tồn tại
-- - gems_balance = 0
-- - email được populate
```

### Test 2: Test gem operations

```sql
-- Thêm gems cho user (giả sử user_id = 'xxx-xxx-xxx')
SELECT add_gems_purchase('xxx-xxx-xxx', 10);

-- Kiểm tra balance
SELECT gems_balance FROM profiles WHERE id = 'xxx-xxx-xxx';
-- Kết quả: gems_balance = 10

-- Trừ gems
SELECT deduct_gems_atomic('xxx-xxx-xxx', 2, NULL);

-- Kiểm tra balance
SELECT gems_balance FROM profiles WHERE id = 'xxx-xxx-xxx';
-- Kết quả: gems_balance = 8

-- Kiểm tra transaction log
SELECT * FROM gem_transactions WHERE user_id = 'xxx-xxx-xxx' ORDER BY created_at DESC;
-- Kết quả: 2 records (purchase +10, tryon -2)
```

### Test 3: Test RLS policies

```sql
-- Đăng nhập với user A
-- Tạo wardrobe item
INSERT INTO wardrobe_items (user_id, image_url, name, category)
VALUES (auth.uid(), 'https://example.com/image.jpg', 'Test Item', 'top');

-- Query wardrobe
SELECT * FROM wardrobe_items;
-- Kết quả: Chỉ thấy items của user A

-- Đăng nhập với user B
SELECT * FROM wardrobe_items;
-- Kết quả: Chỉ thấy items của user B (không thấy items của user A)
```

## Troubleshooting

### Lỗi: "relation already exists"

**Nguyên nhân:** Tables đã được tạo trước đó

**Giải pháp:** 
- Nếu muốn reset: Drop tables và chạy lại migrations
- Nếu muốn giữ data: Skip migration đó

```sql
-- Drop tất cả tables (CẢNH BÁO: Mất hết data)
DROP TABLE IF EXISTS gem_transactions CASCADE;
DROP TABLE IF EXISTS tryon_history CASCADE;
DROP TABLE IF EXISTS wardrobe_items CASCADE;
DROP TABLE IF EXISTS user_models CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
```

### Lỗi: "function already exists"

**Giải pháp:** Sử dụng `CREATE OR REPLACE FUNCTION` (đã có trong migration files)

### Lỗi: RLS policies conflict

**Giải pháp:** Drop policies cũ trước khi tạo mới

```sql
-- Drop tất cả policies trên một table
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
-- Repeat cho các policies khác
```

## Next Steps

Sau khi setup database xong, tiếp tục với:

1. **Storage Setup** - Tạo Storage buckets và policies (Task 2)
2. **Secrets Configuration** - Add Replicate API key (Task 3)
   - 📖 Xem hướng dẫn chi tiết: [SECRETS_CONFIGURATION.md](./SECRETS_CONFIGURATION.md)
3. **Edge Functions** - Deploy Edge Functions (Tasks 5-12)
4. **Extension Integration** - Update Chrome Extension code (Tasks 14-18)

## Liên hệ

Nếu gặp vấn đề, vui lòng tham khảo:
- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- Design Document: `.kiro/specs/supabase-gemini-integration/design.md`
