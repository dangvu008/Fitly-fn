# Polar.sh Products Creation Guide

## Gem Packs to Create

Tạo 4 products sau trên Polar.sh Dashboard:

### 1. Starter Pack
- **Name**: `Starter Pack - 50 Gems`
- **Description**: `Perfect for trying out Fitly's virtual try-on feature`
- **Type**: One-time purchase
- **Price**: `$2.99 USD`
- **Metadata**:
  - Key: `gems`
  - Value: `50`

### 2. Popular Pack (Best Value)
- **Name**: `Popular Pack - 120 Gems`
- **Description**: `Most popular choice! Get 20% more gems`
- **Type**: One-time purchase
- **Price**: `$5.99 USD`
- **Metadata**:
  - Key: `gems`
  - Value: `120`

### 3. Style Pack (Great Value)
- **Name**: `Style Pack - 250 Gems`
- **Description**: `Great value for fashion enthusiasts`
- **Type**: One-time purchase
- **Price**: `$9.99 USD`
- **Metadata**:
  - Key: `gems`
  - Value: `250`

### 4. Creator Pack (Best Value)
- **Name**: `Creator Pack - 500 Gems`
- **Description**: `Best value! Lowest cost per gem for content creators`
- **Type**: One-time purchase
- **Price**: `$17.99 USD`
- **Metadata**:
  - Key: `gems`
  - Value: `500`

## Step-by-Step Instructions

### For Each Product:

1. **Navigate to**: https://polar.sh/dashboard/aivon/products/new

2. **Fill Product Information**:
   - Name: (Copy from above)
   - Description: (Optional, copy from above)

3. **Set Pricing**:
   - Select: "One-time purchase" (should be default)
   - Pricing Model: "Fixed price"
   - Amount: (Enter price from above, e.g., `2.99`)
   - Currency: USD (should be default)

4. **Add Metadata** (Important for backend):
   - Click "Add Metadata"
   - Key: `gems`
   - Value: (Enter gems amount, e.g., `50`)
   - This metadata will be used by webhook to know how many gems to add

5. **Customer Portal Settings**:
   - Visibility: "Public" (default)
   - This allows customers to see the product in the portal

6. **Click "Create Product"**

7. **After Creation**:
   - Copy the **Price ID** (format: `price_xxx...`)
   - Save it for database update later

## After Creating All Products

### Collect Price IDs

Create a table like this:

| Product Name | Gems | Price | Price ID |
|-------------|------|-------|----------|
| Starter Pack | 50 | $2.99 | `price_xxx_starter` |
| Popular Pack | 120 | $5.99 | `price_xxx_popular` |
| Style Pack | 250 | $9.99 | `price_xxx_style` |
| Creator Pack | 500 | $17.99 | `price_xxx_creator` |

### Update Database

Use the SQL script `supabase/update_polar_price_ids.sql` and replace the Price IDs:

```sql
-- Starter Pack
UPDATE gem_packages 
SET 
    gateway_price_id = 'YOUR_ACTUAL_PRICE_ID_HERE',
    gateway_provider = 'polar',
    price_vnd = 69000  -- Approximate VND equivalent
WHERE gems = 50;

-- Popular Pack
UPDATE gem_packages 
SET 
    gateway_price_id = 'YOUR_ACTUAL_PRICE_ID_HERE',
    gateway_provider = 'polar',
    price_vnd = 139000
WHERE gems = 120;

-- Style Pack
UPDATE gem_packages 
SET 
    gateway_price_id = 'YOUR_ACTUAL_PRICE_ID_HERE',
    gateway_provider = 'polar',
    price_vnd = 232000
WHERE gems = 250;

-- Creator Pack
UPDATE gem_packages 
SET 
    gateway_price_id = 'YOUR_ACTUAL_PRICE_ID_HERE',
    gateway_provider = 'polar',
    price_vnd = 418000
WHERE gems = 500;
```

## Value Proposition

| Pack | Price | Gems | Cost per Gem | Savings |
|------|-------|------|--------------|---------|
| Starter | $2.99 | 50 | $0.0598 | - |
| Popular | $5.99 | 120 | $0.0499 | 17% |
| Style | $9.99 | 250 | $0.0400 | 33% |
| Creator | $17.99 | 500 | $0.0360 | 40% |

## Tips

1. **Enable Sandbox Mode** first for testing
2. **Add clear descriptions** to help customers understand value
3. **Use metadata** to store gems amount (critical for webhook)
4. **Test checkout flow** before going live
5. **Monitor webhook logs** to ensure gems are added correctly

## Next Steps

After creating products:
1. ✅ Copy all Price IDs
2. ✅ Update database with Price IDs
3. ✅ Test checkout flow (sandbox mode)
4. ✅ Verify gems are added after payment
5. ✅ Switch to production mode
