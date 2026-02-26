-- ============================================================================
-- Migration: 014_add_wardrobe_quota_tracking
-- Purpose: Thêm logic tracking wardrobe quota (10 items free, sau đó tính phí)
-- Strategy: Hybrid approach - Balance UX với cost recovery
-- Date: 2026-02-22
-- ============================================================================

-- Step 1: Add wardrobe_items_count column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wardrobe_items_count INTEGER DEFAULT 0 CHECK (wardrobe_items_count >= 0);

-- Step 2: Create function to get remaining free wardrobe slots
CREATE OR REPLACE FUNCTION get_free_wardrobe_slots(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_count INTEGER;
    v_free_limit INTEGER := 10;
    v_remaining INTEGER;
BEGIN
    -- Get current wardrobe items count
    SELECT wardrobe_items_count INTO v_current_count
    FROM profiles
    WHERE id = p_user_id;
    
    IF v_current_count IS NULL THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;
    
    -- Calculate remaining free slots
    v_remaining := GREATEST(0, v_free_limit - v_current_count);
    
    RETURN v_remaining;
END;
$$;

-- Step 3: Create function to check if wardrobe add requires gems
CREATE OR REPLACE FUNCTION requires_gems_for_wardrobe(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_free_slots INTEGER;
BEGIN
    v_free_slots := get_free_wardrobe_slots(p_user_id);
    
    -- If no free slots remaining, requires gems
    RETURN (v_free_slots = 0);
END;
$$;

-- Step 4: Initialize wardrobe_items_count for existing users
UPDATE profiles
SET wardrobe_items_count = (
    SELECT COUNT(*)
    FROM wardrobe_items wi
    WHERE wi.user_id = profiles.id
)
WHERE wardrobe_items_count = 0;

-- Step 5: Create trigger to auto-increment wardrobe_items_count
CREATE OR REPLACE FUNCTION increment_wardrobe_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Increment count when new item added
    UPDATE profiles
    SET wardrobe_items_count = wardrobe_items_count + 1,
        updated_at = NOW()
    WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_increment_wardrobe_count
AFTER INSERT ON wardrobe_items
FOR EACH ROW
EXECUTE FUNCTION increment_wardrobe_count();

-- Step 6: Create trigger to auto-decrement wardrobe_items_count
CREATE OR REPLACE FUNCTION decrement_wardrobe_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Decrement count when item deleted
    UPDATE profiles
    SET wardrobe_items_count = GREATEST(0, wardrobe_items_count - 1),
        updated_at = NOW()
    WHERE id = OLD.user_id;
    
    RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_decrement_wardrobe_count
AFTER DELETE ON wardrobe_items
FOR EACH ROW
EXECUTE FUNCTION decrement_wardrobe_count();

-- Step 7: Add helpful view for monitoring
CREATE OR REPLACE VIEW wardrobe_quota_status AS
SELECT 
    p.id as user_id,
    p.email,
    p.wardrobe_items_count,
    get_free_wardrobe_slots(p.id) as free_slots_remaining,
    requires_gems_for_wardrobe(p.id) as requires_gems,
    CASE 
        WHEN p.wardrobe_items_count < 10 THEN 'FREE_TIER'
        ELSE 'PAID_TIER'
    END as tier_status
FROM profiles p
WHERE p.wardrobe_items_count > 0
ORDER BY p.wardrobe_items_count DESC;

-- Step 8: Verify setup
SELECT 
    user_id,
    email,
    wardrobe_items_count,
    free_slots_remaining,
    requires_gems,
    tier_status
FROM wardrobe_quota_status
LIMIT 10;

-- Step 9: Add comments
COMMENT ON COLUMN profiles.wardrobe_items_count IS 'Total number of items in user wardrobe (for quota tracking)';
COMMENT ON FUNCTION get_free_wardrobe_slots IS 'Returns number of free wardrobe slots remaining (max 10)';
COMMENT ON FUNCTION requires_gems_for_wardrobe IS 'Returns true if user needs to pay gems to add wardrobe item';
COMMENT ON VIEW wardrobe_quota_status IS 'Monitor wardrobe quota usage across users';

