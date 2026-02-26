/**
 * File: 001_initial_schema.sql
 * Purpose: Tạo database schema ban đầu cho Supabase Gemini Integration
 * Layer: Database
 * 
 * Data Contract:
 * - Tạo 5 bảng chính: profiles, user_models, wardrobe_items, tryon_history, gem_transactions
 * - Áp dụng constraints: gems_balance >= 0, category validation
 * - Tạo indexes cho performance optimization
 * 
 * Flow:
 * 1. Tạo bảng profiles (extends auth.users)
 * 2. Tạo bảng user_models (ảnh toàn thân người dùng)
 * 3. Tạo bảng wardrobe_items (tủ đồ cá nhân)
 * 4. Tạo bảng tryon_history (lịch sử thử đồ)
 * 5. Tạo bảng gem_transactions (lịch sử giao dịch gems)
 * 6. Tạo indexes cho các trường thường query
 * 
 * Security Note: RLS sẽ được enable trong migration 003
 */

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
-- Mở rộng auth.users với thông tin bổ sung và gems balance
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  gems_balance INTEGER NOT NULL DEFAULT 0 CHECK (gems_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index cho profiles
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);

-- Trigger để tự động update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- USER_MODELS TABLE
-- ============================================================================
-- Lưu trữ ảnh toàn thân của người dùng (model images)
CREATE TABLE IF NOT EXISTS user_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes cho user_models
CREATE INDEX IF NOT EXISTS idx_user_models_user_id ON user_models(user_id);
CREATE INDEX IF NOT EXISTS idx_user_models_default 
  ON user_models(user_id, is_default) 
  WHERE is_default = TRUE;

-- ============================================================================
-- WARDROBE_ITEMS TABLE
-- ============================================================================
-- Lưu trữ các item quần áo trong tủ đồ cá nhân
CREATE TABLE IF NOT EXISTS wardrobe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  name TEXT,
  category TEXT NOT NULL CHECK (
    category IN ('top', 'bottom', 'dress', 'shoes', 'accessories')
  ),
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes cho wardrobe_items
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_category 
  ON wardrobe_items(user_id, category);
CREATE INDEX IF NOT EXISTS idx_wardrobe_created 
  ON wardrobe_items(user_id, created_at DESC);

-- ============================================================================
-- TRYON_HISTORY TABLE
-- ============================================================================
-- Lưu trữ lịch sử các lần thử đồ
CREATE TABLE IF NOT EXISTS tryon_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_image_url TEXT NOT NULL,
  clothing_image_urls JSONB NOT NULL,
  result_image_url TEXT,
  gems_used INTEGER NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('standard', 'hd')),
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  replicate_prediction_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes cho tryon_history
CREATE INDEX IF NOT EXISTS idx_tryon_user_status 
  ON tryon_history(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tryon_user_created 
  ON tryon_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tryon_prediction 
  ON tryon_history(replicate_prediction_id) 
  WHERE replicate_prediction_id IS NOT NULL;

-- ============================================================================
-- GEM_TRANSACTIONS TABLE
-- ============================================================================
-- Lưu trữ lịch sử giao dịch gems (audit trail)
CREATE TABLE IF NOT EXISTS gem_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'tryon', 'refund')),
  tryon_id UUID REFERENCES tryon_history(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes cho gem_transactions
CREATE INDEX IF NOT EXISTS idx_gem_trans_user 
  ON gem_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gem_trans_tryon 
  ON gem_transactions(tryon_id) 
  WHERE tryon_id IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE profiles IS 'Thông tin profile người dùng và gems balance';
COMMENT ON TABLE user_models IS 'Ảnh toàn thân người dùng dùng làm base cho try-on';
COMMENT ON TABLE wardrobe_items IS 'Tủ đồ cá nhân lưu trữ các item quần áo';
COMMENT ON TABLE tryon_history IS 'Lịch sử các lần thử đồ với AI';
COMMENT ON TABLE gem_transactions IS 'Audit trail cho mọi thay đổi gems balance';

COMMENT ON COLUMN profiles.gems_balance IS 'Số dư gems hiện tại (không được âm)';
COMMENT ON COLUMN user_models.is_default IS 'Ảnh mặc định được dùng cho try-on';
COMMENT ON COLUMN wardrobe_items.category IS 'Loại quần áo: top/bottom/dress/shoes/accessories';
COMMENT ON COLUMN tryon_history.status IS 'Trạng thái: processing/completed/failed';
COMMENT ON COLUMN gem_transactions.type IS 'Loại giao dịch: purchase/tryon/refund';
