-- Migration: 006_ai_config.sql
-- Purpose: Bảng lưu AI config (system prompt) do admin quản lý
-- Gemini API Key được lưu trong Supabase Secrets (không phải DB)

-- =============================================
-- 1. AI Config Table (Admin-managed prompts)
-- =============================================
CREATE TABLE IF NOT EXISTS ai_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  system_prompt TEXT NOT NULL DEFAULT '',
  gemini_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash-exp',
  cost_standard INTEGER NOT NULL DEFAULT 1,  -- Gems per standard try-on
  cost_hd INTEGER NOT NULL DEFAULT 2,         -- Gems per HD try-on
  max_clothing_items INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default system prompt
INSERT INTO ai_config (id, system_prompt, gemini_model) VALUES (
  'default',
  'You are a professional virtual fashion stylist AI. Your task is to digitally try on clothing items onto a person in the provided model photo.

STRICT RULES:
1. PRESERVE the person''s face EXACTLY - same features, skin tone, expression, age
2. PRESERVE hair style, color, and length EXACTLY (unless explicitly requested to change)
3. PRESERVE body proportions, height, and pose EXACTLY
4. Apply the provided clothing items realistically with:
   - Correct anatomical fit (clothing should follow body contours)
   - Realistic fabric draping, wrinkles, and shadows
   - Natural layering (outerwear over base layers)
   - Proper perspective matching the original photo angle
5. Maintain the original background and lighting
6. Output must be PHOTOREALISTIC - not illustration, cartoon, or CGI
7. If multiple items are provided (e.g., top + bottom + shoes), apply ALL of them simultaneously
8. Category priority for layering: dress > top > bottom > shoes > accessories

REJECTION CRITERIA (return error instead of processing):
- Input images that are NOT clothing/fashion items/accessories/shoes
- Images that appear to be AI-generated faces or inappropriate content

OUTPUT: A single photorealistic image of the same person wearing the specified clothing.',
  'gemini-2.0-flash-exp'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. User Models Table (Full-body model photos)
-- =============================================
CREATE TABLE IF NOT EXISTS user_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'upload',  -- 'upload' | 'tryon_result'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_user_models_user_id ON user_models(user_id);
CREATE INDEX IF NOT EXISTS idx_user_models_default ON user_models(user_id, is_default) WHERE is_default = TRUE;

-- RLS Policies for user_models
ALTER TABLE user_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own models" ON user_models
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own models" ON user_models
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own models" ON user_models
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own models" ON user_models
  FOR DELETE USING (auth.uid() = user_id);

-- RLS for ai_config - only readable, not writable by users
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ai_config" ON ai_config
  FOR SELECT USING (TRUE);

-- =============================================
-- 3. Try-on History: Add result_image_url column if missing
-- =============================================
ALTER TABLE tryon_history 
  ADD COLUMN IF NOT EXISTS result_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cache_key TEXT,
  ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER;

-- Index for cache lookup
CREATE INDEX IF NOT EXISTS idx_tryon_cache ON tryon_history(cache_key) WHERE cache_key IS NOT NULL;
