/**
 * File: 007_fix_sync_logs_rls.sql
 * Purpose: Fix RLS policies cho bảng sync_logs
 * Layer: Database Security
 * 
 * Data Contract:
 * - Thêm policies cho sync_logs table
 * - Users có thể view/insert sync logs của chính mình
 * 
 * Flow:
 * 1. Tạo SELECT policy (users can view own logs)
 * 2. Tạo INSERT policy (users can insert own logs)
 * 
 * Security Note: 
 * - Bảng sync_logs đã có RLS enabled nhưng thiếu policies
 * - Điều này khiến mọi operations đều bị block (403 Forbidden)
 */

-- ============================================================================
-- SYNC_LOGS TABLE RLS POLICIES
-- ============================================================================

-- Users có thể xem sync logs của chính mình
CREATE POLICY "Users can view own sync logs"
  ON sync_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users có thể insert sync logs của chính mình
CREATE POLICY "Users can insert own sync logs"
  ON sync_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Users can view own sync logs" ON sync_logs IS 
  'Users chỉ có thể xem sync logs của chính mình';

COMMENT ON POLICY "Users can insert own sync logs" ON sync_logs IS 
  'Users chỉ có thể insert sync logs của chính mình';
