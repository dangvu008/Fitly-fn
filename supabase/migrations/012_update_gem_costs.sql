-- ============================================================================
-- Migration: 012_update_gem_costs
-- Purpose: Cập nhật gem costs cho các tính năng (try-on: 5 gems, add wardrobe: 1 gem)
-- Date: 2026-02-22
-- ============================================================================

-- Step 1: Create gem_costs configuration table
CREATE TABLE IF NOT EXISTS gem_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name TEXT NOT NULL UNIQUE,
    gem_cost INTEGER NOT NULL CHECK (gem_cost > 0),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Insert gem costs for features
INSERT INTO gem_costs (feature_name, gem_cost, description) VALUES
('tryon', 5, 'Virtual try-on - Generate image with AI'),
('add_wardrobe', 1, 'Add item to wardrobe - AI categorization'),
('edit_result', 3, 'Edit try-on result with AI')
ON CONFLICT (feature_name) DO UPDATE SET
    gem_cost = EXCLUDED.gem_cost,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Step 3: Add RLS policies for gem_costs (public read)
ALTER TABLE gem_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read gem costs"
    ON gem_costs FOR SELECT
    USING (true);

-- Step 4: Create function to get gem cost by feature
CREATE OR REPLACE FUNCTION get_gem_cost(p_feature_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cost INTEGER;
BEGIN
    SELECT gem_cost INTO v_cost
    FROM gem_costs
    WHERE feature_name = p_feature_name
      AND is_active = true;
    
    IF v_cost IS NULL THEN
        RAISE EXCEPTION 'Feature % not found or inactive', p_feature_name;
    END IF;
    
    RETURN v_cost;
END;
$$;

-- Step 5: Verify setup
SELECT 
    feature_name,
    gem_cost,
    description,
    is_active
FROM gem_costs
ORDER BY gem_cost DESC;

-- Expected result:
-- tryon:        5 gems
-- edit_result:  3 gems
-- add_wardrobe: 1 gem

-- Step 6: Add comments
COMMENT ON TABLE gem_costs IS 'Configuration table for gem costs per feature';
COMMENT ON COLUMN gem_costs.feature_name IS 'Unique identifier for feature (tryon, add_wardrobe, edit_result)';
COMMENT ON COLUMN gem_costs.gem_cost IS 'Number of gems required for this feature';
COMMENT ON FUNCTION get_gem_cost IS 'Get gem cost for a specific feature';
