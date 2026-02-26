-- ============================================================================
-- Migration: 015_add_gem_transaction_functions
-- Purpose: Tạo wrapper functions để deduct/add gems (sử dụng functions atomic có sẵn)
-- Date: 2026-02-22
-- ============================================================================

-- Function 1: Deduct gems (wrapper cho deduct_gems_atomic)
CREATE OR REPLACE FUNCTION deduct_gems(
    p_user_id UUID,
    p_amount INTEGER,
    p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance INTEGER;
BEGIN
    -- Lock row để tránh race condition
    SELECT gems_balance INTO v_current_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;
    
    -- Check balance
    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;
    
    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient gems. Current: %, Required: %', v_current_balance, p_amount;
    END IF;
    
    -- Deduct gems
    UPDATE profiles
    SET gems_balance = gems_balance - p_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Log transaction
    INSERT INTO gem_transactions (user_id, amount, type, description)
    VALUES (p_user_id, -p_amount, 'used', p_description);
END;
$$;

-- Function 2: Add gems (thêm gems - dùng cho purchase hoặc refund)
CREATE OR REPLACE FUNCTION add_gems(
    p_user_id UUID,
    p_amount INTEGER,
    p_description TEXT DEFAULT NULL,
    p_transaction_type TEXT DEFAULT 'bonus',
    p_gateway_transaction_id TEXT DEFAULT NULL,
    p_gateway_provider TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate transaction type
    IF p_transaction_type NOT IN ('purchase', 'bonus', 'refund') THEN
        RAISE EXCEPTION 'Invalid transaction type: %', p_transaction_type;
    END IF;
    
    -- Add gems
    UPDATE profiles
    SET gems_balance = gems_balance + p_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Check if update affected any rows
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;
    
    -- Log transaction
    INSERT INTO gem_transactions (
        user_id, 
        amount, 
        type, 
        description,
        gateway_transaction_id,
        gateway_provider
    )
    VALUES (
        p_user_id, 
        p_amount, 
        p_transaction_type, 
        p_description,
        p_gateway_transaction_id,
        p_gateway_provider
    );
END;
$$;

-- Function 3: Get gems balance (helper)
CREATE OR REPLACE FUNCTION get_gems_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT gems_balance INTO v_balance
    FROM profiles
    WHERE id = p_user_id;
    
    IF v_balance IS NULL THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;
    
    RETURN v_balance;
END;
$$;

-- Function 4: Check if user has enough gems
CREATE OR REPLACE FUNCTION has_enough_gems(
    p_user_id UUID,
    p_required_amount INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    v_balance := get_gems_balance(p_user_id);
    RETURN v_balance >= p_required_amount;
END;
$$;

-- Add comments
COMMENT ON FUNCTION deduct_gems IS 'Deduct gems from user balance with atomic transaction';
COMMENT ON FUNCTION add_gems IS 'Add gems to user balance (purchase/bonus/refund)';
COMMENT ON FUNCTION get_gems_balance IS 'Get current gems balance for user';
COMMENT ON FUNCTION has_enough_gems IS 'Check if user has enough gems for operation';
