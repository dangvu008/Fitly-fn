/**
 * File: 009_migrate_stripe_to_polar.sql
 * Purpose: Migrate payment gateway từ Stripe sang Polar.sh
 * Layer: Database
 * 
 * Data Contract:
 * - Rename stripe_price_id → gateway_price_id (generic name)
 * - Add gateway_provider column (stripe/polar)
 * - Update gem_transactions để support Polar transaction IDs
 * 
 * Flow:
 * 1. Rename column stripe_price_id → gateway_price_id
 * 2. Add gateway_provider column
 * 3. Update gem_transactions: stripe_payment_id → gateway_transaction_id
 * 4. Add gateway_provider to gem_transactions
 * 5. Update comments
 */

-- ============================================================================
-- STEP 1: UPDATE GEM_PACKAGES TABLE
-- ============================================================================

-- Rename stripe_price_id → gateway_price_id (generic name cho cả Stripe và Polar)
ALTER TABLE gem_packages 
  RENAME COLUMN stripe_price_id TO gateway_price_id;

-- Add gateway_provider column (stripe/polar/paypal...)
ALTER TABLE gem_packages 
  ADD COLUMN IF NOT EXISTS gateway_provider TEXT DEFAULT 'polar' 
  CHECK (gateway_provider IN ('stripe', 'polar', 'paypal', 'momo'));

-- Update comments
COMMENT ON COLUMN gem_packages.gateway_price_id IS 'Price ID từ payment gateway (Polar Product ID, Stripe Price ID, etc.)';
COMMENT ON COLUMN gem_packages.gateway_provider IS 'Payment gateway provider: polar/stripe/paypal/momo';

-- ============================================================================
-- STEP 2: UPDATE GEM_TRANSACTIONS TABLE
-- ============================================================================

-- Rename stripe_payment_id → gateway_transaction_id
ALTER TABLE gem_transactions 
  RENAME COLUMN stripe_payment_id TO gateway_transaction_id;

-- Add gateway_provider column
ALTER TABLE gem_transactions 
  ADD COLUMN IF NOT EXISTS gateway_provider TEXT DEFAULT 'polar'
  CHECK (gateway_provider IN ('stripe', 'polar', 'paypal', 'momo', 'manual'));

-- Update comments
COMMENT ON COLUMN gem_transactions.gateway_transaction_id IS 'Transaction ID từ payment gateway (Polar Order ID, Stripe Payment Intent, etc.)';
COMMENT ON COLUMN gem_transactions.gateway_provider IS 'Payment gateway provider: polar/stripe/paypal/momo/manual';

-- ============================================================================
-- STEP 3: UPDATE EXISTING DATA (nếu có)
-- ============================================================================

-- Set gateway_provider = 'stripe' cho các records cũ có gateway_price_id
UPDATE gem_packages 
SET gateway_provider = 'stripe' 
WHERE gateway_price_id IS NOT NULL 
  AND gateway_price_id LIKE 'price_%';  -- Stripe price IDs start with 'price_'

-- Set gateway_provider = 'stripe' cho các transactions cũ
UPDATE gem_transactions 
SET gateway_provider = 'stripe' 
WHERE gateway_transaction_id IS NOT NULL 
  AND gateway_transaction_id LIKE 'pi_%';  -- Stripe payment intents start with 'pi_'

-- ============================================================================
-- VERIFICATION QUERY (Comment - để test sau khi migrate)
-- ============================================================================
-- SELECT 
--   name, 
--   gems, 
--   price_vnd, 
--   gateway_price_id, 
--   gateway_provider 
-- FROM gem_packages;
--
-- SELECT 
--   type, 
--   amount, 
--   gateway_transaction_id, 
--   gateway_provider,
--   created_at 
-- FROM gem_transactions 
-- ORDER BY created_at DESC 
-- LIMIT 10;
