/**
 * File: 002_create_functions.sql
 * Purpose: Tạo database functions cho gem operations với atomic transactions
 * Layer: Database
 * 
 * Data Contract:
 * - deduct_gems_atomic: Trừ gems và log transaction
 * - refund_gems_atomic: Hoàn gems và log transaction
 * 
 * Flow:
 * 1. Lock row trong profiles table (FOR UPDATE)
 * 2. Validate balance đủ hay không
 * 3. Update gems_balance
 * 4. Insert record vào gem_transactions
 * 5. Return new balance
 * 
 * Security Note: Sử dụng row-level locking để tránh race conditions
 */

-- ============================================================================
-- FUNCTION: deduct_gems_atomic
-- ============================================================================
-- Trừ gems từ user balance và log transaction
-- Sử dụng row-level locking để đảm bảo atomicity
CREATE OR REPLACE FUNCTION deduct_gems_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_tryon_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Validate input
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount phải lớn hơn 0';
  END IF;

  -- Lock row để tránh race condition
  -- FOR UPDATE sẽ lock row cho đến khi transaction commit
  SELECT gems_balance INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Kiểm tra user có tồn tại không
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User không tồn tại: %', p_user_id;
  END IF;

  -- Kiểm tra balance đủ hay không
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Không đủ gems. Hiện tại: %, Cần: %', v_current_balance, p_amount;
  END IF;

  -- Tính balance mới
  v_new_balance := v_current_balance - p_amount;

  -- Update gems_balance
  UPDATE profiles
  SET gems_balance = v_new_balance,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Log transaction vào gem_transactions
  -- FIX: Dùng type='used' vì constraint chỉ cho phép 'purchase','used','refund','bonus'
  -- 'tryon' không tồn tại trong constraint và gây lỗi khi insert
  INSERT INTO gem_transactions (
    user_id,
    amount,
    type,
    description,
    created_at
  ) VALUES (
    p_user_id,
    -p_amount, -- Số âm để biểu thị trừ gems
    'used',
    CASE WHEN p_tryon_id IS NOT NULL THEN 'Virtual try-on: ' || p_tryon_id::text ELSE 'Virtual try-on' END,
    NOW()
  );

  -- Return balance mới
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: refund_gems_atomic
-- ============================================================================
-- Hoàn gems cho user khi try-on failed và log transaction
-- Sử dụng row-level locking để đảm bảo atomicity
CREATE OR REPLACE FUNCTION refund_gems_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_tryon_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Validate input
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount phải lớn hơn 0';
  END IF;

  -- Lock row để tránh race condition
  SELECT gems_balance INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Kiểm tra user có tồn tại không
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User không tồn tại: %', p_user_id;
  END IF;

  -- Tính balance mới
  v_new_balance := v_current_balance + p_amount;

  -- Update gems_balance
  UPDATE profiles
  SET gems_balance = v_new_balance,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Log transaction vào gem_transactions
  INSERT INTO gem_transactions (
    user_id,
    amount,
    type,
    description,
    created_at
  ) VALUES (
    p_user_id,
    p_amount, -- Số dương để biểu thị cộng gems
    'refund',
    CASE WHEN p_tryon_id IS NOT NULL THEN 'Hoàn gems try-on: ' || p_tryon_id::text ELSE 'Hoàn gems try-on' END,
    NOW()
  );

  -- Return balance mới
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: add_gems_purchase
-- ============================================================================
-- Thêm gems khi user mua (purchase)
-- Helper function cho future gem purchase feature
CREATE OR REPLACE FUNCTION add_gems_purchase(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Validate input
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount phải lớn hơn 0';
  END IF;

  -- Lock row
  SELECT gems_balance INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User không tồn tại: %', p_user_id;
  END IF;

  -- Tính balance mới
  v_new_balance := v_current_balance + p_amount;

  -- Update gems_balance
  UPDATE profiles
  SET gems_balance = v_new_balance,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO gem_transactions (
    user_id,
    amount,
    type,
    tryon_id,
    created_at
  ) VALUES (
    p_user_id,
    p_amount,
    'purchase',
    NULL, -- Không liên quan đến try-on
    NOW()
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION deduct_gems_atomic IS 'Trừ gems atomic với row-level locking, dùng cho try-on';
COMMENT ON FUNCTION refund_gems_atomic IS 'Hoàn gems atomic khi try-on failed';
COMMENT ON FUNCTION add_gems_purchase IS 'Thêm gems khi user mua (purchase)';
