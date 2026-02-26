-- ============================================================================
-- Migration: 010_update_gem_packages_usd_pricing
-- Purpose: Update gem packages với giá USD và gems mới
-- Date: 2026-02-20
-- ============================================================================

-- Step 1: Add price_usd column
ALTER TABLE gem_packages 
ADD COLUMN IF NOT EXISTS price_usd DECIMAL(10,2);

-- Step 2: Clear existing packages (if any)
DELETE FROM gem_packages;

-- Step 3: Insert new gem packages với giá USD
INSERT INTO gem_packages (id, name, gems, price_vnd, price_usd, gateway_provider, display_order, created_at) VALUES
(
    gen_random_uuid(),
    'Starter Pack',
    50,
    69000,  -- Approximate VND (1 USD ≈ 23,000 VND)
    2.99,
    'polar',
    1,
    NOW()
),
(
    gen_random_uuid(),
    'Popular Pack',
    120,
    139000,
    5.99,
    'polar',
    2,
    NOW()
),
(
    gen_random_uuid(),
    'Style Pack',
    250,
    232000,
    9.99,
    'polar',
    3,
    NOW()
),
(
    gen_random_uuid(),
    'Creator Pack',
    500,
    418000,
    17.99,
    'polar',
    4,
    NOW()
);

-- Step 4: Verify insertion
SELECT 
    name,
    gems,
    price_vnd,
    price_usd,
    gateway_provider,
    gateway_price_id,
    display_order
FROM gem_packages
ORDER BY display_order;

-- Expected result: 4 packages with NULL gateway_price_id (will be updated after creating products on Polar)

-- Step 5: Add comment
COMMENT ON COLUMN gem_packages.price_usd IS 'Price in USD for international payments via Polar.sh';
COMMENT ON COLUMN gem_packages.price_vnd IS 'Price in VND for Vietnamese customers (approximate conversion)';
