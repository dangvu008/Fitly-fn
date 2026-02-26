/**
 * File: 004_storage_setup.sql
 * Purpose: Tạo Storage bucket "users" và configure RLS policies cho file security
 * Layer: Infrastructure
 * 
 * Data Contract:
 * - Input: None (migration script)
 * - Output: Storage bucket "users" với RLS policies
 * 
 * Flow:
 * 1. Tạo bucket "users" với public = false (private)
 * 2. Enable RLS trên storage.objects
 * 3. Tạo policy cho INSERT (upload)
 * 4. Tạo policy cho SELECT (read)
 * 5. Tạo policy cho DELETE (xóa)
 * 
 * Security Note:
 * - Users chỉ có thể truy cập files trong folder users/{user_id}/
 * - Folder structure: models/, wardrobe/, results/
 * - RLS policies sử dụng auth.uid() để validate ownership
 */

-- ============================================================================
-- STORAGE BUCKET SETUP
-- ============================================================================

-- Tạo bucket "users" với cấu hình private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'users',
  'users',
  false, -- Private bucket, cần signed URLs để access
  10485760, -- 10MB limit (10 * 1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/jpg'] -- Chỉ cho phép jpg/png
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE RLS POLICIES
-- ============================================================================

-- Enable RLS trên storage.objects nếu chưa enable
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICY 1: Users có thể upload files vào folder của mình
-- ============================================================================
-- Path format: users/{user_id}/models/{filename}
--              users/{user_id}/wardrobe/{filename}
--              users/{user_id}/results/{filename}

CREATE POLICY "Users can upload to own folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'users' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- POLICY 2: Users có thể đọc files trong folder của mình
-- ============================================================================

CREATE POLICY "Users can read own files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'users' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- POLICY 3: Users có thể xóa files trong folder của mình
-- ============================================================================

CREATE POLICY "Users can delete own files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'users' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- POLICY 4: Users có thể update metadata của files trong folder của mình
-- ============================================================================

CREATE POLICY "Users can update own files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'users' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'users' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify bucket được tạo thành công
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'users') THEN
    RAISE EXCEPTION 'Storage bucket "users" was not created successfully';
  END IF;
  
  RAISE NOTICE 'Storage bucket "users" created successfully';
END $$;

-- Verify RLS policies được tạo
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'storage' 
    AND tablename = 'objects'
    AND policyname IN (
      'Users can upload to own folder',
      'Users can read own files',
      'Users can delete own files',
      'Users can update own files'
    );
  
  IF policy_count < 4 THEN
    RAISE EXCEPTION 'Not all storage RLS policies were created. Expected 4, got %', policy_count;
  END IF;
  
  RAISE NOTICE 'All 4 storage RLS policies created successfully';
END $$;

-- ============================================================================
-- NOTES
-- ============================================================================

-- Folder structure sẽ được tạo tự động khi upload files:
-- - users/{user_id}/models/     : Full-body model images
-- - users/{user_id}/wardrobe/   : Clothing item images
-- - users/{user_id}/results/    : Try-on result images

-- Để upload file, sử dụng Supabase client:
-- const { data, error } = await supabase.storage
--   .from('users')
--   .upload(`${userId}/models/${filename}`, file)

-- Để lấy signed URL (expires sau 1 giờ):
-- const { data } = await supabase.storage
--   .from('users')
--   .createSignedUrl(`${userId}/models/${filename}`, 3600)
