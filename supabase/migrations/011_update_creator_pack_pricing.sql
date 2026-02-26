-- ============================================================================
-- Migration: 011_update_creator_pack_pricing
-- Purpose: Cập nhật Creator Pack từ 500 gems/$17.99 lên 800 gems/$19.99
-- Date: 2026-02-22
-- ============================================================================

-- Step 1: Update Creator Pack pricing
UPDATE gem_packages
SET 
    gems = 800,
    price_usd = 19.99,
    price_vnd = 464000  -- Approximate: 19.99 * 23,200 VND/USD
WHERE name = 'Creator Pack';

-- Step 2: Verify update
SELECT 
    name,
    gems,
    price_vnd,
    price_usd,
    gateway_provider,
    gateway_price_id
FROM gem_packages
ORDER BY gems ASC;

-- Expected result:
-- Starter Pack:  50 gems  - $2.99
-- Popular Pack:  120 gems - $5.99
-- Style Pack:    250 gems - $9.99
-- Creator Pack:  800 gems - $19.99 (UPDATED)

-- Step 3: Add comment
COMMENT ON TABLE gem_packages IS 'Gem packages for purchase via Polar.sh - Updated Creator Pack to 800 gems/$19.99 on 2026-02-22';
