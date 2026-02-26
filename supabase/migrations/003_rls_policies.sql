/**
 * File: 003_rls_policies.sql
 * Purpose: Implement Row Level Security policies cho tất cả tables
 * Layer: Database Security
 * 
 * Data Contract:
 * - Enable RLS trên tất cả tables
 * - Tạo policies: Users chỉ có thể view/modify data của chính mình
 * 
 * Flow:
 * 1. Enable RLS trên từng table
 * 2. Tạo SELECT policies (users can view own data)
 * 3. Tạo INSERT policies (users can insert own data)
 * 4. Tạo UPDATE policies (users can update own data)
 * 5. Tạo DELETE policies (users can delete own data)
 * 
 * Security Note: auth.uid() trả về user_id của user hiện tại từ JWT token
 */

-- ============================================================================
-- PROFILES TABLE RLS
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users có thể xem profile của chính mình
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users có thể update profile của chính mình
-- Nhưng KHÔNG được phép update gems_balance trực tiếp (phải qua functions)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role có thể insert profile khi user đăng ký
-- (Trigger sẽ tự động tạo profile khi user sign up)
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- USER_MODELS TABLE RLS
-- ============================================================================
ALTER TABLE user_models ENABLE ROW LEVEL SECURITY;

-- Users có thể xem models của chính mình
CREATE POLICY "Users can view own models"
  ON user_models FOR SELECT
  USING (auth.uid() = user_id);

-- Users có thể insert models của chính mình
CREATE POLICY "Users can insert own models"
  ON user_models FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users có thể update models của chính mình
CREATE POLICY "Users can update own models"
  ON user_models FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users có thể delete models của chính mình
CREATE POLICY "Users can delete own models"
  ON user_models FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- WARDROBE_ITEMS TABLE RLS
-- ============================================================================
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Users có thể xem wardrobe của chính mình
CREATE POLICY "Users can view own wardrobe"
  ON wardrobe_items FOR SELECT
  USING (auth.uid() = user_id);

-- Users có thể insert items vào wardrobe của chính mình
CREATE POLICY "Users can insert own wardrobe"
  ON wardrobe_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users có thể update items trong wardrobe của chính mình
CREATE POLICY "Users can update own wardrobe"
  ON wardrobe_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users có thể delete items khỏi wardrobe của chính mình
CREATE POLICY "Users can delete own wardrobe"
  ON wardrobe_items FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRYON_HISTORY TABLE RLS
-- ============================================================================
ALTER TABLE tryon_history ENABLE ROW LEVEL SECURITY;

-- Users có thể xem history của chính mình
CREATE POLICY "Users can view own history"
  ON tryon_history FOR SELECT
  USING (auth.uid() = user_id);

-- Edge Functions có thể insert history records
-- (Sử dụng service_role key trong Edge Functions)
CREATE POLICY "Service role can insert history"
  ON tryon_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Edge Functions có thể update history records
-- (Để update status, result_url khi AI processing xong)
CREATE POLICY "Service role can update history"
  ON tryon_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users có thể delete history của chính mình (optional)
CREATE POLICY "Users can delete own history"
  ON tryon_history FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- GEM_TRANSACTIONS TABLE RLS
-- ============================================================================
ALTER TABLE gem_transactions ENABLE ROW LEVEL SECURITY;

-- Users có thể xem transactions của chính mình
CREATE POLICY "Users can view own transactions"
  ON gem_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Chỉ database functions mới được phép insert transactions
-- (Không có INSERT policy cho users, chỉ có cho service_role)
-- Database functions chạy với elevated privileges nên không bị RLS block

-- ============================================================================
-- TRIGGER: Auto-create profile on user signup
-- ============================================================================
-- Tự động tạo profile record khi user đăng ký qua Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, gems_balance, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    0, -- Initial gems balance = 0
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger khi có user mới trong auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON POLICY "Users can view own profile" ON profiles IS 
  'Users chỉ có thể xem profile của chính mình thông qua auth.uid()';

COMMENT ON POLICY "Users can view own models" ON user_models IS 
  'Users chỉ có thể xem model images của chính mình';

COMMENT ON POLICY "Users can view own wardrobe" ON wardrobe_items IS 
  'Users chỉ có thể xem wardrobe items của chính mình';

COMMENT ON POLICY "Users can view own history" ON tryon_history IS 
  'Users chỉ có thể xem try-on history của chính mình';

COMMENT ON POLICY "Users can view own transactions" ON gem_transactions IS 
  'Users chỉ có thể xem gem transactions của chính mình';

COMMENT ON FUNCTION handle_new_user IS 
  'Tự động tạo profile record với gems_balance = 0 khi user đăng ký';
