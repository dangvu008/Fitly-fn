/**
 * File: 010_saved_outfits_source_tracking.sql
 * Purpose: Thêm cột source_type và source_url vào bảng saved_outfits
 * Layer: Database
 *
 * Business Context:
 * Cho phép user lưu ảnh người mẫu toàn thân từ web vào "Outfit vừa tạo"
 * như là inspiration, phân biệt với AI-generated outfits.
 *
 * - source_type = 'tryon'    → outfit từ virtual try-on AI (mặc định)
 * - source_type = 'external' → outfit từ web (ảnh người mẫu / lookbook)
 * - source_url               → URL trang web nguồn (nullable)
 *
 * NOTE: Migration này đã được apply trực tiếp qua Supabase Dashboard.
 * File này chỉ dùng cho documentation và version control.
 */

-- Tạo bảng saved_outfits nếu chưa tồn tại
CREATE TABLE IF NOT EXISTS public.saved_outfits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT,
    result_image_url TEXT NOT NULL,
    clothing_image_url TEXT,
    model_image_url TEXT,
    tryon_history_id UUID REFERENCES tryon_history(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL DEFAULT 'tryon'
        CHECK (source_type IN ('tryon', 'external')),
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Thêm cột source_type nếu chưa tồn tại (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'saved_outfits' AND column_name = 'source_type'
    ) THEN
        ALTER TABLE public.saved_outfits
            ADD COLUMN source_type TEXT NOT NULL DEFAULT 'tryon'
                CHECK (source_type IN ('tryon', 'external'));
    END IF;
END $$;

-- Thêm cột source_url nếu chưa tồn tại (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'saved_outfits' AND column_name = 'source_url'
    ) THEN
        ALTER TABLE public.saved_outfits
            ADD COLUMN source_url TEXT;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_outfits_user_id
    ON public.saved_outfits(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_outfits_source_type
    ON public.saved_outfits(user_id, source_type);

-- RLS: Cho phép user chỉ đọc/ghi outfits của chính mình
ALTER TABLE public.saved_outfits ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own outfits"
    ON public.saved_outfits FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own outfits"
    ON public.saved_outfits FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own outfits"
    ON public.saved_outfits FOR DELETE
    USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.saved_outfits IS 'Outfits đã lưu, bao gồm AI-generated và external web outfits';
COMMENT ON COLUMN public.saved_outfits.source_type IS 'Nguồn gốc: tryon (AI virtual try-on) | external (lưu từ web)';
COMMENT ON COLUMN public.saved_outfits.source_url IS 'URL trang web nguồn khi source_type = external';
