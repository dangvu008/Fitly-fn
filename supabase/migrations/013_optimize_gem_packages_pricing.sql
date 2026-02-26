-- ============================================================================
-- Migration: 013_optimize_gem_packages_pricing
-- Purpose: Optimize gem packages pricing với full cost analysis (Option C - Balanced)
-- Strategy: Good-Better-Best + Decoy Effect + Sustainable margins
-- Cost Analysis: Includes API, infrastructure, payment processing, taxes, marketing
-- Date: 2026-02-22
-- ============================================================================

-- Step 1: Clear existing packages
DELETE FROM gem_packages;

-- Step 2: Insert optimized gem packages
-- Pricing strategy: Balanced pricing với healthy profit margins (50-90%)
-- Full cost per try-on: $0.264 (API + infra + payment + tax + marketing)

INSERT INTO gem_packages (id, name, gems, price_vnd, price_usd, gateway_provider, is_popular, is_active, created_at) VALUES
-- Starter Pack: Entry point - 8 try-ons
(
    gen_random_uuid(),
    'Starter Pack',
    40,
    69000,      -- ~$2.99 * 23,000 VND/USD
    2.99,
    'polar',
    false,
    true,
    NOW()
),

-- Value Pack: SWEET SPOT - 24 try-ons (POPULAR)
(
    gen_random_uuid(),
    'Value Pack',
    120,
    185000,     -- ~$7.99 * 23,000 VND/USD
    7.99,
    'polar',
    true,       -- Highlight as POPULAR
    true,
    NOW()
),

-- Pro Pack: Power users - 60 try-ons
(
    gen_random_uuid(),
    'Pro Pack',
    300,
    394000,     -- ~$16.99 * 23,000 VND/USD
    16.99,
    'polar',
    false,
    true,
    NOW()
),

-- Ultimate Pack: Decoy/Whale - 140 try-ons
(
    gen_random_uuid(),
    'Ultimate Pack',
    700,
    811000,     -- ~$34.99 * 23,000 VND/USD
    34.99,
    'polar',
    false,
    true,
    NOW()
);

-- Step 3: Verify packages
SELECT 
    name,
    gems,
    price_vnd,
    price_usd,
    ROUND(gems::numeric / price_usd, 1) as gems_per_dollar,
    FLOOR(gems / 5) as tryon_count,
    is_popular,
    gateway_provider
FROM gem_packages
ORDER BY gems ASC;

-- Expected result:
-- Starter Pack:  40 gems  - $2.99  (13.4 gems/$) - 8 try-ons
-- Value Pack:    120 gems - $7.99  (15.0 gems/$) - 24 try-ons [POPULAR]
-- Pro Pack:      300 gems - $16.99 (17.7 gems/$) - 60 try-ons
-- Ultimate Pack: 700 gems - $34.99 (20.0 gems/$) - 140 try-ons

-- Step 4: Add cost analysis view
CREATE OR REPLACE VIEW gem_packages_cost_analysis AS
SELECT 
    name,
    gems,
    price_usd,
    ROUND(gems::numeric / price_usd, 1) as gems_per_dollar,
    FLOOR(gems / 5) as tryon_count,
    gems as add_wardrobe_count,
    -- Cost breakdown per package
    ROUND((gems / 5.0) * 0.156, 2) as direct_api_cost,
    ROUND((gems / 5.0) * 0.005, 2) as infrastructure_cost,
    ROUND(price_usd * 0.05 + 0.30, 2) as payment_processing_cost,
    ROUND(price_usd * 0.15, 2) as tax_cost,
    ROUND((gems / 5.0) * 0.050, 2) as marketing_cost_allocated,
    -- Total costs
    ROUND(
        (gems / 5.0) * 0.156 + 
        (gems / 5.0) * 0.005 + 
        (price_usd * 0.05 + 0.30) + 
        (price_usd * 0.15) + 
        (gems / 5.0) * 0.050, 
    2) as total_cost,
    -- Profit calculation
    ROUND(
        price_usd - (
            (gems / 5.0) * 0.156 + 
            (gems / 5.0) * 0.005 + 
            (price_usd * 0.05 + 0.30) + 
            (price_usd * 0.15) + 
            (gems / 5.0) * 0.050
        ), 
    2) as net_profit,
    ROUND(
        ((price_usd - (
            (gems / 5.0) * 0.156 + 
            (gems / 5.0) * 0.005 + 
            (price_usd * 0.05 + 0.30) + 
            (price_usd * 0.15) + 
            (gems / 5.0) * 0.050
        )) / (
            (gems / 5.0) * 0.156 + 
            (gems / 5.0) * 0.005 + 
            (price_usd * 0.05 + 0.30) + 
            (price_usd * 0.15) + 
            (gems / 5.0) * 0.050
        )) * 100, 
    0) as profit_margin_percent,
    is_popular,
    is_active
FROM gem_packages
WHERE is_active = true
ORDER BY gems ASC;

-- Step 5: Verify cost analysis
SELECT 
    name,
    price_usd,
    tryon_count,
    total_cost,
    net_profit,
    profit_margin_percent || '%' as margin
FROM gem_packages_cost_analysis;

-- Expected margins:
-- Starter:  ~89% margin ($1.41 profit)
-- Value:    ~51% margin ($2.71 profit)
-- Pro:      ~61% margin ($6.43 profit)
-- Ultimate: ~51% margin ($13.59 profit)

-- Step 6: Add helpful comments
COMMENT ON TABLE gem_packages IS 'Optimized gem packages using Option C - Balanced pricing with full cost analysis';
COMMENT ON VIEW gem_packages_cost_analysis IS 'Detailed cost breakdown including API, infrastructure, payment, tax, and marketing costs';

