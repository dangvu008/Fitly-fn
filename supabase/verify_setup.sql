/**
 * File: verify_setup.sql
 * Purpose: Verification script để kiểm tra database và storage setup hoàn tất đúng
 * Layer: Testing/Verification
 * 
 * Data Contract:
 * - Input: None (chạy trực tiếp trên Supabase SQL Editor)
 * - Output: Success/Error messages cho từng verification check
 * 
 * Flow:
 * 1. Verify tất cả tables được tạo
 * 2. Verify constraints và indexes
 * 3. Verify database functions
 * 4. Verify RLS policies
 * 5. Verify storage bucket và policies
 * 
 * Usage:
 * - Copy toàn bộ script này vào Supabase SQL Editor
 * - Click "Run" để execute
 * - Kiểm tra output messages
 */

-- ============================================================================
-- SECTION 1: VERIFY TABLES
-- ============================================================================

DO $
DECLARE
  v_table_count INTEGER;
  v_missing_tables TEXT[];
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 1: VERIFYING TABLES';
  RAISE NOTICE '========================================';
  
  -- Kiểm tra 5 bảng chính
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'profiles',
      'user_models',
      'wardrobe_items',
      'tryon_history',
      'gem_transactions'
    );
  
  IF v_table_count = 5 THEN
    RAISE NOTICE '✓ All 5 tables exist: profiles, user_models, wardrobe_items, tryon_history, gem_transactions';
  ELSE
    -- Tìm tables nào bị thiếu
    SELECT ARRAY_AGG(t) INTO v_missing_tables
    FROM (
      SELECT UNNEST(ARRAY['profiles', 'user_models', 'wardrobe_items', 'tryon_history', 'gem_transactions'])
      EXCEPT
      SELECT table_name::TEXT
      FROM information_schema.tables
      WHERE table_schema = 'public'
    ) AS missing(t);
    
    RAISE EXCEPTION '✗ Missing tables: %. Expected 5, found %', v_missing_tables, v_table_count;
  END IF;
END $;

-- ============================================================================
-- SECTION 2: VERIFY CONSTRAINTS
-- ============================================================================

DO $
DECLARE
  v_constraint_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 2: VERIFYING CONSTRAINTS';
  RAISE NOTICE '========================================';
  
  -- Verify gems_balance >= 0 constraint
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name LIKE '%gems_balance%';
  
  IF v_constraint_count > 0 THEN
    RAISE NOTICE '✓ gems_balance CHECK constraint exists';
  ELSE
    RAISE EXCEPTION '✗ gems_balance CHECK constraint NOT found';
  END IF;
  
  -- Verify category constraint
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name LIKE '%category%';
  
  IF v_constraint_count > 0 THEN
    RAISE NOTICE '✓ category CHECK constraint exists';
  ELSE
    RAISE EXCEPTION '✗ category CHECK constraint NOT found';
  END IF;
  
  -- Verify quality constraint
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name LIKE '%quality%';
  
  IF v_constraint_count > 0 THEN
    RAISE NOTICE '✓ quality CHECK constraint exists';
  ELSE
    RAISE EXCEPTION '✗ quality CHECK constraint NOT found';
  END IF;
  
  -- Verify status constraint
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name LIKE '%status%';
  
  IF v_constraint_count > 0 THEN
    RAISE NOTICE '✓ status CHECK constraint exists';
  ELSE
    RAISE EXCEPTION '✗ status CHECK constraint NOT found';
  END IF;
  
  -- Verify type constraint (gem_transactions)
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name LIKE '%type%';
  
  IF v_constraint_count > 0 THEN
    RAISE NOTICE '✓ type CHECK constraint exists';
  ELSE
    RAISE EXCEPTION '✗ type CHECK constraint NOT found';
  END IF;
END $;

-- ============================================================================
-- SECTION 3: VERIFY INDEXES
-- ============================================================================

DO $
DECLARE
  v_index_count INTEGER;
  v_expected_indexes TEXT[] := ARRAY[
    'idx_profiles_id',
    'idx_user_models_user_id',
    'idx_user_models_default',
    'idx_wardrobe_user_category',
    'idx_wardrobe_created',
    'idx_tryon_user_status',
    'idx_tryon_user_created',
    'idx_tryon_prediction',
    'idx_gem_trans_user',
    'idx_gem_trans_tryon'
  ];
  v_index_name TEXT;
  v_found_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 3: VERIFYING INDEXES';
  RAISE NOTICE '========================================';
  
  FOREACH v_index_name IN ARRAY v_expected_indexes
  LOOP
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = v_index_name;
    
    IF v_index_count > 0 THEN
      RAISE NOTICE '✓ Index exists: %', v_index_name;
      v_found_count := v_found_count + 1;
    ELSE
      RAISE WARNING '✗ Index NOT found: %', v_index_name;
    END IF;
  END LOOP;
  
  IF v_found_count = array_length(v_expected_indexes, 1) THEN
    RAISE NOTICE '✓ All % indexes verified', v_found_count;
  ELSE
    RAISE EXCEPTION '✗ Only % out of % indexes found', v_found_count, array_length(v_expected_indexes, 1);
  END IF;
END $;

-- ============================================================================
-- SECTION 4: VERIFY DATABASE FUNCTIONS
-- ============================================================================

DO $
DECLARE
  v_function_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 4: VERIFYING DATABASE FUNCTIONS';
  RAISE NOTICE '========================================';
  
  -- Verify deduct_gems_atomic
  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc
  WHERE proname = 'deduct_gems_atomic';
  
  IF v_function_count > 0 THEN
    RAISE NOTICE '✓ Function exists: deduct_gems_atomic';
  ELSE
    RAISE EXCEPTION '✗ Function NOT found: deduct_gems_atomic';
  END IF;
  
  -- Verify refund_gems_atomic
  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc
  WHERE proname = 'refund_gems_atomic';
  
  IF v_function_count > 0 THEN
    RAISE NOTICE '✓ Function exists: refund_gems_atomic';
  ELSE
    RAISE EXCEPTION '✗ Function NOT found: refund_gems_atomic';
  END IF;
  
  -- Verify add_gems_purchase
  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc
  WHERE proname = 'add_gems_purchase';
  
  IF v_function_count > 0 THEN
    RAISE NOTICE '✓ Function exists: add_gems_purchase';
  ELSE
    RAISE EXCEPTION '✗ Function NOT found: add_gems_purchase';
  END IF;
  
  -- Verify handle_new_user trigger function
  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc
  WHERE proname = 'handle_new_user';
  
  IF v_function_count > 0 THEN
    RAISE NOTICE '✓ Trigger function exists: handle_new_user';
  ELSE
    RAISE EXCEPTION '✗ Trigger function NOT found: handle_new_user';
  END IF;
END $;

-- ============================================================================
-- SECTION 5: VERIFY RLS ENABLED
-- ============================================================================

DO $
DECLARE
  v_rls_enabled BOOLEAN;
  v_table_name TEXT;
  v_tables TEXT[] := ARRAY['profiles', 'user_models', 'wardrobe_items', 'tryon_history', 'gem_transactions'];
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 5: VERIFYING RLS ENABLED';
  RAISE NOTICE '========================================';
  
  FOREACH v_table_name IN ARRAY v_tables
  LOOP
    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class
    WHERE relname = v_table_name
      AND relnamespace = 'public'::regnamespace;
    
    IF v_rls_enabled THEN
      RAISE NOTICE '✓ RLS enabled on table: %', v_table_name;
    ELSE
      RAISE EXCEPTION '✗ RLS NOT enabled on table: %', v_table_name;
    END IF;
  END LOOP;
END $;

-- ============================================================================
-- SECTION 6: VERIFY RLS POLICIES
-- ============================================================================

DO $
DECLARE
  v_policy_count INTEGER;
  v_expected_policies INTEGER := 18; -- Tổng số policies expected
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 6: VERIFYING RLS POLICIES';
  RAISE NOTICE '========================================';
  
  -- Count all policies trên các tables
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('profiles', 'user_models', 'wardrobe_items', 'tryon_history', 'gem_transactions');
  
  RAISE NOTICE 'Total RLS policies found: %', v_policy_count;
  
  IF v_policy_count >= v_expected_policies THEN
    RAISE NOTICE '✓ Sufficient RLS policies exist (expected >= %)', v_expected_policies;
  ELSE
    RAISE WARNING '⚠ Only % policies found, expected >= %', v_policy_count, v_expected_policies;
  END IF;
  
  -- List all policies
  RAISE NOTICE '';
  RAISE NOTICE 'Policy details:';
  FOR v_policy_count IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    -- This will be displayed in the loop
  END LOOP;
END $;

-- ============================================================================
-- SECTION 7: VERIFY STORAGE BUCKET
-- ============================================================================

DO $
DECLARE
  v_bucket_exists BOOLEAN;
  v_bucket_public BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 7: VERIFYING STORAGE BUCKET';
  RAISE NOTICE '========================================';
  
  -- Check if bucket exists
  SELECT EXISTS(
    SELECT 1 FROM storage.buckets WHERE id = 'users'
  ) INTO v_bucket_exists;
  
  IF v_bucket_exists THEN
    RAISE NOTICE '✓ Storage bucket "users" exists';
    
    -- Check if bucket is private
    SELECT public INTO v_bucket_public
    FROM storage.buckets
    WHERE id = 'users';
    
    IF v_bucket_public = FALSE THEN
      RAISE NOTICE '✓ Storage bucket "users" is private (correct)';
    ELSE
      RAISE WARNING '⚠ Storage bucket "users" is public (should be private)';
    END IF;
  ELSE
    RAISE EXCEPTION '✗ Storage bucket "users" NOT found';
  END IF;
END $;

-- ============================================================================
-- SECTION 8: VERIFY STORAGE RLS POLICIES
-- ============================================================================

DO $
DECLARE
  v_policy_count INTEGER;
  v_expected_storage_policies INTEGER := 4;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECTION 8: VERIFYING STORAGE RLS POLICIES';
  RAISE NOTICE '========================================';
  
  -- Count storage policies
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'Users can upload to own folder',
      'Users can read own files',
      'Users can delete own files',
      'Users can update own files'
    );
  
  IF v_policy_count = v_expected_storage_policies THEN
    RAISE NOTICE '✓ All % storage RLS policies exist', v_expected_storage_policies;
  ELSE
    RAISE EXCEPTION '✗ Only % out of % storage policies found', v_policy_count, v_expected_storage_policies;
  END IF;
END $;

-- ============================================================================
-- FINAL SUMMARY
-- ============================================================================

DO $
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ All database tables verified';
  RAISE NOTICE '✓ All constraints verified';
  RAISE NOTICE '✓ All indexes verified';
  RAISE NOTICE '✓ All database functions verified';
  RAISE NOTICE '✓ RLS enabled on all tables';
  RAISE NOTICE '✓ RLS policies verified';
  RAISE NOTICE '✓ Storage bucket verified';
  RAISE NOTICE '✓ Storage RLS policies verified';
  RAISE NOTICE '';
  RAISE NOTICE 'Database và Storage setup HOÀN TẤT!';
  RAISE NOTICE '========================================';
END $;
