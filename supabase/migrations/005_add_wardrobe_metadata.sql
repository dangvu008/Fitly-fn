/**
 * File: 005_add_wardrobe_metadata.sql
 * Purpose: Thêm metadata fields cho wardrobe_items để tối ưu storage và caching
 * Layer: Database
 * 
 * Data Contract:
 * - Thêm storage_type: 'external' | 'supabase' | 'cached'
 * - Thêm thumbnail_cached: boolean (có thumbnail trong local storage không)
 * 
 * Flow:
 * 1. Thêm cột storage_type với default 'external'
 * 2. Thêm cột thumbnail_cached với default false
 * 3. Tạo index cho storage_type để query nhanh
 * 
 * Security Note: Không ảnh hưởng đến RLS policies
 */

-- Thêm storage_type để phân biệt nguồn lưu trữ ảnh
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS storage_type TEXT NOT NULL DEFAULT 'external'
CHECK (storage_type IN ('external', 'supabase', 'cached'));

-- Thêm thumbnail_cached để biết có thumbnail trong local storage không
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS thumbnail_cached BOOLEAN NOT NULL DEFAULT FALSE;

-- Cập nhật category constraint để thêm 'other'
ALTER TABLE wardrobe_items 
DROP CONSTRAINT IF EXISTS wardrobe_items_category_check;

ALTER TABLE wardrobe_items 
ADD CONSTRAINT wardrobe_items_category_check 
CHECK (category IN ('top', 'bottom', 'dress', 'shoes', 'accessories', 'other'));

-- Index để query theo storage_type
CREATE INDEX IF NOT EXISTS idx_wardrobe_storage_type 
  ON wardrobe_items(user_id, storage_type);

-- Comment để document
COMMENT ON COLUMN wardrobe_items.storage_type IS 
  'Nguồn lưu trữ ảnh: external (URL gốc), supabase (Supabase Storage), cached (local cache)';

COMMENT ON COLUMN wardrobe_items.thumbnail_cached IS 
  'Có thumbnail được cache trong chrome.storage.local không (để tối ưu hiển thị)';
