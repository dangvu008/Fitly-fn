# Polar.sh Payment Gateway Setup Guide

## Tổng quan

Guide này hướng dẫn setup Polar.sh làm payment gateway cho Fitly extension, thay thế Stripe.

## Prerequisites

- Supabase project: `lluidqwmyxuonvmcansp` (fitly)
- Polar.sh account (https://polar.sh)
- Supabase CLI hoặc MCP tools

## Bước 1: Tạo Products & Prices trên Polar.sh

### 1.1. Đăng nhập Polar.sh Dashboard
- Truy cập: https://polar.sh/dashboard
- Đăng nhập với tài khoản của bạn

### 1.2. Tạo Products (Gem Packages)
Vào **Products** → **Create Product**, tạo các gói sau:

| Product Name | Description | Price (VND) | Gems |
|-------------|-------------|-------------|------|
| Starter Pack | 50 Gems | 50,000 | 50 |
| Popular Pack | 120 Gems (20% bonus) | 100,000 | 120 |
| Pro Pack | 300 Gems (50% bonus) | 200,000 | 300 |
| Ultimate Pack | 800 Gems (100% bonus) | 500,000 | 800 |

**Lưu ý**: 
- Chọn currency: **VND** (Vietnamese Dong)
- Chọn type: **One-time payment**
- Enable: **Sandbox mode** để test

### 1.3. Lấy Price IDs
Sau khi tạo xong, copy **Price ID** của mỗi product (format: `price_xxx...`)

## Bước 2: Lấy API Keys từ Polar.sh

### 2.1. Lấy POLAR_API_KEY
1. Vào **Settings** → **Developer** → **API Keys**
2. Click **Create API Key**
3. Name: `Fitly Production`
4. Permissions: 
   - ✅ Read products
   - ✅ Create checkouts
   - ✅ Read orders
5. Copy API Key (format: `polar_sk_xxx...`)

### 2.2. Lấy POLAR_WEBHOOK_SECRET
1. Vào **Settings** → **Webhooks**
2. Click **Create Webhook**
3. Webhook URL: `https://lluidqwmyxuonvmcansp.supabase.co/functions/v1/polar-webhook`
4. Events to subscribe:
   - ✅ `order.created`
5. Click **Create**
6. Copy **Webhook Secret** (format: `whsec_xxx...`)

**Lưu ý**: Nếu đang test local, dùng ngrok:
```bash
ngrok http 54321
# Webhook URL: https://xxx.ngrok.io/functions/v1/polar-webhook
```

## Bước 3: Update Database với Price IDs

### 3.1. Kiểm tra gem_packages hiện tại
```sql
SELECT id, name, gems, price_vnd, gateway_price_id, gateway_provider 
FROM gem_packages 
ORDER BY price_vnd;
```

### 3.2. Update Price IDs từ Polar
```sql
-- Update với Price IDs từ Polar.sh
UPDATE gem_packages 
SET 
    gateway_price_id = 'price_xxx_starter',  -- Thay bằng Price ID thật
    gateway_provider = 'polar'
WHERE name = 'Starter Pack';

UPDATE gem_packages 
SET 
    gateway_price_id = 'price_xxx_popular',
    gateway_provider = 'polar'
WHERE name = 'Popular Pack';

UPDATE gem_packages 
SET 
    gateway_price_id = 'price_xxx_pro',
    gateway_provider = 'polar'
WHERE name = 'Pro Pack';

UPDATE gem_packages 
SET 
    gateway_price_id = 'price_xxx_ultimate',
    gateway_provider = 'polar'
WHERE name = 'Ultimate Pack';
```

## Bước 4: Setup Secrets trong Supabase

### 4.1. Sử dụng Supabase Dashboard
1. Vào project: https://supabase.com/dashboard/project/lluidqwmyxuonvmcansp
2. Vào **Settings** → **Edge Functions** → **Secrets**
3. Thêm các secrets sau:

| Secret Name | Value | Description |
|------------|-------|-------------|
| `POLAR_API_KEY` | `polar_sk_xxx...` | API Key từ Polar.sh |
| `POLAR_WEBHOOK_SECRET` | `whsec_xxx...` | Webhook Secret từ Polar.sh |
| `POLAR_API_URL` | `https://api.polar.sh/v1/checkouts/custom/` | Polar API endpoint |

### 4.2. Sử dụng Supabase CLI (Alternative)
```bash
# Set secrets
supabase secrets set POLAR_API_KEY=polar_sk_xxx...
supabase secrets set POLAR_WEBHOOK_SECRET=whsec_xxx...
supabase secrets set POLAR_API_URL=https://api.polar.sh/v1/checkouts/custom/
```

### 4.3. Verify secrets
```bash
supabase secrets list
```

## Bước 5: Deploy Edge Functions

### 5.1. Deploy create-polar-checkout
```bash
cd supabase
supabase functions deploy create-polar-checkout --project-ref lluidqwmyxuonvmcansp
```

### 5.2. Deploy polar-webhook
```bash
supabase functions deploy polar-webhook --project-ref lluidqwmyxuonvmcansp --no-verify-jwt
```

**Lưu ý**: `--no-verify-jwt` vì webhook được gọi từ Polar, không có JWT token.

### 5.3. Verify deployment
```bash
supabase functions list --project-ref lluidqwmyxuonvmcansp
```

Expected output:
```
NAME                    VERSION  STATUS   VERIFY_JWT
create-polar-checkout   1        ACTIVE   true
polar-webhook           1        ACTIVE   false
```

## Bước 6: Test Payment Flow

### 6.1. Test tạo Checkout Session
```bash
curl -X POST \
  https://lluidqwmyxuonvmcansp.supabase.co/functions/v1/create-polar-checkout \
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"package_id": "UUID_OF_STARTER_PACK"}'
```

Expected response:
```json
{
  "url": "https://polar.sh/checkout/xxx..."
}
```

### 6.2. Test Webhook (Manual)
```bash
# Tạo test signature (dùng POLAR_WEBHOOK_SECRET)
curl -X POST \
  https://lluidqwmyxuonvmcansp.supabase.co/functions/v1/polar-webhook \
  -H "Content-Type: application/json" \
  -H "polar-webhook-signature: SIGNATURE_HERE" \
  -d '{
    "type": "order.created",
    "data": {
      "id": "order_test_123",
      "product_price_id": "price_xxx_starter",
      "metadata": {
        "user_id": "USER_UUID_HERE"
      }
    }
  }'
```

### 6.3. Test End-to-End (Sandbox Mode)
1. Mở extension Fitly
2. Click vào **Buy Gems**
3. Chọn gói **Starter Pack**
4. Click **Checkout**
5. Được redirect đến Polar checkout page
6. Dùng test card (Polar sandbox):
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
7. Complete payment
8. Verify gems được nạp vào account:
   ```sql
   SELECT * FROM gem_transactions 
   WHERE user_id = 'YOUR_USER_ID' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

## Bước 7: Monitoring & Debugging

### 7.1. Check Edge Function Logs
```bash
# Logs cho create-polar-checkout
supabase functions logs create-polar-checkout --project-ref lluidqwmyxuonvmcansp

# Logs cho polar-webhook
supabase functions logs polar-webhook --project-ref lluidqwmyxuonvmcansp
```

### 7.2. Check Polar Dashboard
- Vào **Orders** để xem các orders
- Vào **Webhooks** → **Logs** để xem webhook delivery status

### 7.3. Check Database
```sql
-- Check gem transactions
SELECT 
    gt.id,
    gt.user_id,
    gt.amount,
    gt.type,
    gt.description,
    gt.gateway_transaction_id,
    gt.created_at
FROM gem_transactions gt
WHERE gt.type = 'purchase'
ORDER BY gt.created_at DESC
LIMIT 10;

-- Check user gem balance
SELECT 
    u.id,
    u.email,
    u.gems_balance,
    u.updated_at
FROM users u
WHERE u.gems_balance > 0
ORDER BY u.updated_at DESC;
```

## Bước 8: Production Deployment

### 8.1. Update success_url trong create-polar-checkout
Sửa file `supabase/functions/create-polar-checkout/index.ts`:
```typescript
// TRƯỚC (localhost):
success_url: "http://localhost:3000/profile?payment=success",

// SAU (production):
success_url: "https://fitly.app/profile?payment=success",
```

### 8.2. Redeploy function
```bash
supabase functions deploy create-polar-checkout --project-ref lluidqwmyxuonvmcansp
```

### 8.3. Update Webhook URL trên Polar
1. Vào Polar Dashboard → **Webhooks**
2. Edit webhook
3. Update URL: `https://lluidqwmyxuonvmcansp.supabase.co/functions/v1/polar-webhook`
4. Save

### 8.4. Switch to Production Mode
1. Vào Polar Dashboard → **Settings** → **Developer**
2. Toggle **Sandbox Mode** → OFF
3. Tạo new API Key cho production (nếu cần)
4. Update `POLAR_API_KEY` secret trong Supabase

## Troubleshooting

### Issue 1: "Payment gateway missing configuration"
**Cause**: `POLAR_API_KEY` chưa được set hoặc sai.
**Fix**: 
```bash
supabase secrets set POLAR_API_KEY=polar_sk_xxx...
```

### Issue 2: "Invalid signature" trong webhook
**Cause**: `POLAR_WEBHOOK_SECRET` sai hoặc payload bị modify.
**Fix**: 
1. Verify secret: `supabase secrets list`
2. Re-create webhook trên Polar và lấy secret mới

### Issue 3: Gems không được nạp sau khi thanh toán
**Cause**: Webhook không được gọi hoặc có lỗi.
**Fix**:
1. Check webhook logs trên Polar Dashboard
2. Check Edge Function logs: `supabase functions logs polar-webhook`
3. Verify webhook URL đúng và accessible

### Issue 4: "Package not found" trong webhook
**Cause**: `gateway_price_id` trong database không khớp với Price ID từ Polar.
**Fix**:
```sql
-- Verify Price IDs
SELECT name, gateway_price_id FROM gem_packages;

-- Update nếu sai
UPDATE gem_packages 
SET gateway_price_id = 'CORRECT_PRICE_ID' 
WHERE name = 'PACKAGE_NAME';
```

## Security Checklist

- [ ] `POLAR_API_KEY` được set và không bị leak
- [ ] `POLAR_WEBHOOK_SECRET` được set và không bị leak
- [ ] Webhook signature verification được enable
- [ ] `polar-webhook` function có `verify_jwt = false` (vì được gọi từ Polar)
- [ ] `create-polar-checkout` function có `verify_jwt = true` (yêu cầu user auth)
- [ ] Success URL redirect về domain chính thức (không phải localhost)
- [ ] Test card chỉ hoạt động trong Sandbox mode

## Next Steps

1. ✅ Setup Polar account và tạo products
2. ✅ Lấy API keys và webhook secret
3. ✅ Update database với Price IDs
4. ✅ Set secrets trong Supabase
5. ✅ Deploy Edge Functions
6. ✅ Test payment flow (sandbox)
7. ✅ Monitor logs và verify gems được nạp
8. ✅ Switch to production mode
9. ✅ Update success URL
10. ✅ Go live!

## References

- Polar.sh Documentation: https://docs.polar.sh
- Polar.sh API Reference: https://api.polar.sh/docs
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Migration 009: `supabase/migrations/009_migrate_stripe_to_polar.sql`
