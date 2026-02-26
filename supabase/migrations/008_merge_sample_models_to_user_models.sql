/**
 * File: 008_merge_sample_models_to_user_models.sql
 * Purpose: Merge bảng sample_models vào user_models với user_id IS NULL cho public models
 * Layer: Database
 * 
 * Data Contract:
 * - Migrate data từ sample_models sang user_models (user_id = NULL)
 * - Update user_models schema để support public models
 * - Drop bảng sample_models
 * - Update RLS policies
 * 
 * Flow:
 * 1. Alter user_models: user_id nullable, thêm gender, display_order
 * 2. Migrate data từ sample_models → user_models
 * 3. Drop bảng sample_models
 * 4. Update RLS policies cho phép đọc public models
 * 5. Create index cho public models
 */

-- ============================================================================
-- STEP 1: ALTER USER_MODELS TABLE
-- ============================================================================
-- Cho phép user_id NULL (public models)
ALTER TABLE user_models 
  ALTER COLUMN user_id DROP NOT NULL;

-- Thêm columns từ sample_models
ALTER TABLE user_models 
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'female',
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Update comment
COMMENT ON TABLE user_models IS 'Ảnh toàn thân người dùng và ảnh mẫu công khai (user_id IS NULL)';
COMMENT ON COLUMN user_models.user_id IS 'NULL = public model, NOT NULL = user private model';
COMMENT ON COLUMN user_models.gender IS 'Giới tính: male/female/unisex (chỉ dùng cho public models)';
COMMENT ON COLUMN user_models.display_order IS 'Thứ tự hiển thị (chỉ dùng cho public models)';

-- ============================================================================
-- STEP 2: MIGRATE DATA FROM SAMPLE_MODELS TO USER_MODELS
-- ============================================================================
-- Copy tất cả data từ sample_models sang user_models với user_id = NULL
INSERT INTO user_models (id, user_id, image_url, label, is_default, gender, display_order, created_at)
SELECT 
  id,
  NULL as user_id,  -- Public models không thuộc user nào
  image_url,
  label,
  false as is_default,  -- Public models không thể là default
  gender,
  display_order,
  created_at
FROM sample_models
ON CONFLICT (id) DO NOTHING;  -- Skip nếu đã tồn tại

-- ============================================================================
-- STEP 3: DROP SAMPLE_MODELS TABLE
-- ============================================================================
DROP TABLE IF EXISTS sample_models CASCADE;

-- ============================================================================
-- STEP 4: UPDATE RLS POLICIES
-- ============================================================================
-- Drop policy cũ nếu có
DROP POLICY IF EXISTS "Users can view their own models" ON user_models;
DROP POLICY IF EXISTS "Users can insert their own models" ON user_models;
DROP POLICY IF EXISTS "Users can update their own models" ON user_models;
DROP POLICY IF EXISTS "Users can delete their own models" ON user_models;

-- Policy mới: Cho phép đọc public models (user_id IS NULL) + own models
CREATE POLICY "Users can view public and own models"
  ON user_models FOR SELECT
  USING (
    user_id IS NULL  -- Public models: ai cũng đọc được
    OR 
    user_id = auth.uid()  -- Private models: chỉ owner đọc được
  );

-- Policy: Chỉ user mới insert được models của mình (KHÔNG cho insert public models)
CREATE POLICY "Users can insert their own models"
  ON user_models FOR INSERT
  WITH CHECK (
    user_id = auth.uid()  -- Chỉ insert với user_id = chính mình
  );

-- Policy: Chỉ user mới update được models của mình (KHÔNG cho update public models)
CREATE POLICY "Users can update their own models"
  ON user_models FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Chỉ user mới delete được models của mình (KHÔNG cho delete public models)
CREATE POLICY "Users can delete their own models"
  ON user_models FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- STEP 5: CREATE INDEXES
-- ============================================================================
-- Index cho public models (user_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_user_models_public 
  ON user_models(display_order, created_at) 
  WHERE user_id IS NULL;

-- Index cho gender filter (public models)
CREATE INDEX IF NOT EXISTS idx_user_models_gender 
  ON user_models(gender) 
  WHERE user_id IS NULL;

-- ============================================================================
-- VERIFICATION QUERY (Comment - để test sau khi migrate)
-- ============================================================================
-- SELECT 
--   COUNT(*) FILTER (WHERE user_id IS NULL) as public_models_count,
--   COUNT(*) FILTER (WHERE user_id IS NOT NULL) as user_models_count
-- FROM user_models;
