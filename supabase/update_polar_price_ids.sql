-- ============================================================================
-- File: update_polar_price_ids.sql
-- Purpose: Update gem_packages với Price IDs từ Polar.sh
-- Usage: Thay thế PRICE_ID_XXX bằng Price IDs thật từ Polar Dashboard
-- ============================================================================

-- Step 1: Verify current gem_packages
SELECT 
    id,
    name,
    gems,
    price_vnd,
    gateway_price_id,
    gateway_provider
FROM gem_packages
ORDER BY price_vnd;

-- Step 2: Update Price IDs từ Polar.sh
-- Lấy Price IDs từ Polar Dashboard > Products > [Product Name] > Price ID

-- Starter Pack (50 Gems - 50,000 VND)
UPDATE gem_packages 
SET 
    gateway_price_id = 'PRICE_ID_STARTER_PACK',  -- Thay bằng Price ID thật
    gateway_provider = 'polar'
WHERE name = 'Starter Pack' OR gems = 50;

-- Popular Pack (120 Gems - 100,000 VND)
UPDATE gem_packages 
SET 
    gateway_price_id = 'PRICE_ID_POPULAR_PACK',  -- Thay bằng Price ID thật
    gateway_provider = 'polar'
WHERE name = 'Popular Pack' OR gems = 120;

-- Pro Pack (300 Gems - 200,000 VND)
UPDATE gem_packages 
SET 
    gateway_price_id = 'PRICE_ID_PRO_PACK',  -- Thay bằng Price ID thật
    gateway_provider = 'polar'
WHERE name = 'Pro Pack' OR gems = 300;

-- Ultimate Pack (800 Gems - 500,000 VND)
UPDATE gem_packages 
SET 
    gateway_price_id = 'PRICE_ID_ULTIMATE_PACK',  -- Thay bằng Price ID thật
    gateway_provider = 'polar'
WHERE name = 'Ultimate Pack' OR gems = 800;

-- Step 3: Verify updates
SELECT 
    id,
    name,
    gems,
    price_vnd,
    gateway_price_id,
    gateway_provider
FROM gem_packages
ORDER BY price_vnd;

-- Step 4: Check if all packages have Price IDs
SELECT 
    COUNT(*) as total_packages,
    COUNT(gateway_price_id) as packages_with_price_id,
    COUNT(*) - COUNT(gateway_price_id) as packages_missing_price_id
FROM gem_packages;

-- Expected result: packages_missing_price_id = 0
