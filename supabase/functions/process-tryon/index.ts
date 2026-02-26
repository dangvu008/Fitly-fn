/**
 * File: process-tryon/index.ts
 * Purpose: Virtual try-on sử dụng Replicate API với model google/gemini-2.5-flash-image
 * Layer: Application
 */

// @ts-nocheck

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REPLICATE_API_BASE = 'https://api.replicate.com/v1'
const REPLICATE_MODEL = 'google/gemini-2.5-flash-image'

interface ReplicateInput {
  prompt: string
  image?: string
  images?: string[]
  image_input?: string[]
}

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string | string[] | null
  error?: string
  urls?: { get: string }
}

async function createReplicatePrediction(
  apiKey: string,
  input: ReplicateInput
): Promise<ReplicatePrediction> {
  const response = await fetch(`${REPLICATE_API_BASE}/models/${REPLICATE_MODEL}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait=60',
    },
    body: JSON.stringify({ input }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Replicate API error ${response.status}: ${errorText}`)
  }
  return response.json()
}

async function pollReplicatePrediction(
  apiKey: string,
  predictionId: string,
  maxWaitMs = 180000,
  intervalMs = 3000
): Promise<ReplicatePrediction> {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!response.ok) throw new Error(`Poll error ${response.status}: ${await response.text()}`)
    const prediction: ReplicatePrediction = await response.json()
    if (prediction.status === 'succeeded') return prediction
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Prediction ${prediction.status}: ${prediction.error || 'Unknown error'}`)
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error('Replicate prediction timeout sau 180 giây')
}

function extractResultUrl(output: string | string[] | null | undefined): string {
  if (!output) throw new Error('Replicate không trả về output')
  if (typeof output === 'string') return output
  if (Array.isArray(output) && output.length > 0) return output[0]
  throw new Error('Replicate output format không hợp lệ')
}

// =============================================
// CACHE KEY HELPER
// =============================================

async function generateCacheKey(
  modelImageData: string,
  clothingImagesData: string[],
  quality: string
): Promise<string> {
  const content = [
    modelImageData.slice(0, 500),
    ...clothingImagesData.map(img => img.slice(0, 500)),
    quality
  ].join('|')
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

// =============================================
// STORAGE HELPERS
// =============================================

async function uploadBase64ToStorage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  base64Data: string,
  _folder: string,
  mimeType = 'image/jpeg'
): Promise<string> {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const bytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))
  const ext = mimeType.includes('png') ? 'png' : 'jpg'
  const filename = `${crypto.randomUUID()}.${ext}`
  const path = `${userId}/temp-inputs/${filename}`
  const { error } = await supabase.storage
    .from('user-models')
    .upload(path, bytes, { contentType: mimeType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data: { publicUrl } } = supabase.storage.from('user-models').getPublicUrl(path)
  return publicUrl
}

async function uploadUrlToStorage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  imageUrl: string,
  _folder: string
): Promise<string> {
  const imgResponse = await fetch(imageUrl)
  if (!imgResponse.ok) throw new Error(`Không fetch được ảnh: ${imageUrl}`)
  const contentType = imgResponse.headers.get('content-type') || 'image/jpeg'
  const bytes = new Uint8Array(await imgResponse.arrayBuffer())
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const filename = `${crypto.randomUUID()}.${ext}`
  const path = `${userId}/${filename}`
  const { error } = await supabase.storage
    .from('tryon-results')
    .upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data: { publicUrl } } = supabase.storage.from('tryon-results').getPublicUrl(path)
  return publicUrl
}

// =============================================
// PROMPT BUILDER
// =============================================

interface ClothingItem {
  category: string
  name?: string
  image_type?: string
  color?: string
  material?: string
  is_primary?: boolean
  sub_category?: string
  transfer_mode?: 'full_outfit' | 'single_item'  // User choice for on-model images
}

interface ResolvedClothingItem extends ClothingItem {
  z_layer: number
  interaction: {
    tucked?: 'in' | 'out' | 'half'
    open?: boolean
    rolled_sleeves?: boolean
    collar?: 'up' | 'down' | 'open'
  }
  visibility_hint: string
  conflict_warning?: string
}

interface PromptBuilderInput {
  systemPrompt: string
  quality: string
  clothingItems: ResolvedClothingItem[]
  totalImages: number
}

const Z_LAYER_MAP: Record<string, number> = {
  underwear: 0, bottom: 1, top: 2, dress: 3, outerwear: 4, shoes: 5, accessories: 6,
}

const FORMAL_TOPS = new Set(['shirt', 'button-down', 'blouse', 'dress-shirt', 'polo'])
const CASUAL_TOPS = new Set(['t-shirt', 'tee', 'tank-top', 'crop-top', 'hoodie', 'sweatshirt'])
const FORMAL_BOTTOMS = new Set(['trousers', 'dress-pants', 'slacks', 'pencil-skirt', 'midi-skirt'])
const OPEN_OUTERWEAR = new Set(['blazer', 'cardigan', 'vest', 'denim-jacket', 'bomber'])
const CLOSED_OUTERWEAR = new Set(['coat', 'trench', 'parka', 'puffer', 'raincoat'])
const SINGLE_ITEM_CATEGORIES = new Set(['top', 'bottom', 'dress'])

function resolveLayerOrder(items: ClothingItem[]): ResolvedClothingItem[] {
  // STEP 1: Assign z_layer
  const resolved: ResolvedClothingItem[] = items.map(item => ({
    ...item,
    z_layer: Z_LAYER_MAP[item.category] ?? 6,
    interaction: {},
    visibility_hint: '',
  }))

  // STEP 2: Detect dress vs top/bottom conflict
  const hasDress = resolved.some(i => i.category === 'dress')
  const hasTop = resolved.some(i => i.category === 'top')
  const hasBottom = resolved.some(i => i.category === 'bottom')

  if (hasDress && (hasTop || hasBottom)) {
    const dressItem = resolved.find(i => i.category === 'dress')!
    resolved.forEach(i => {
      if ((i.category === 'top' || i.category === 'bottom') && !i.is_primary) {
        i.conflict_warning = `Skipped: "${i.name || i.category}" conflicts with dress "${dressItem.name || 'dress'}". Dress covers full torso.`
      }
      if (i.category === 'dress' && !i.is_primary && (hasTop || hasBottom)) {
        const primaryTopOrBottom = resolved.find(r => (r.category === 'top' || r.category === 'bottom') && r.is_primary)
        if (primaryTopOrBottom) {
          i.conflict_warning = `Skipped: dress conflicts with primary item "${primaryTopOrBottom.name || primaryTopOrBottom.category}".`
        }
      }
    })
  }

  // STEP 2b: Detect duplicate items in same single-item category
  for (const cat of SINGLE_ITEM_CATEGORIES) {
    const itemsInCategory = resolved.filter(i => i.category === cat && !i.conflict_warning)
    if (itemsInCategory.length > 1) {
      const primaryItem = itemsInCategory.find(i => i.is_primary) || itemsInCategory[0]
      itemsInCategory.forEach(item => {
        if (item !== primaryItem && !item.conflict_warning) {
          item.conflict_warning = `Skipped: duplicate "${item.name || item.category}" — only 1 ${cat} allowed. Keeping primary "${primaryItem.name || primaryItem.category}".`
        }
      })
      console.log(`[resolveLayerOrder] ⚠️ Duplicate ${cat}: ${itemsInCategory.length} items → keeping "${primaryItem.name || primaryItem.category}", skipping ${itemsInCategory.length - 1}`)
    }
  }

  const activeItems = resolved.filter(i => !i.conflict_warning)

  // STEP 3: Infer interaction states
  const activeTop = activeItems.find(i => i.category === 'top')
  const activeBottom = activeItems.find(i => i.category === 'bottom')
  const activeOuterwear = activeItems.find(i => i.category === 'outerwear')
  const activeDress = activeItems.find(i => i.category === 'dress')

  if (activeTop && activeBottom) {
    const sub = (activeTop.sub_category || activeTop.name || '').toLowerCase()
    const isFormalTop = FORMAL_TOPS.has(sub) || /shirt|blouse|button|polo/i.test(sub)
    const bottomSub = (activeBottom.sub_category || activeBottom.name || '').toLowerCase()
    const isFormalBottom = FORMAL_BOTTOMS.has(bottomSub) || /trouser|slack|dress.?pant|pencil/i.test(bottomSub)
    if (isFormalTop && isFormalBottom) activeTop.interaction.tucked = 'in'
    else if (isFormalTop && !isFormalBottom) activeTop.interaction.tucked = 'half'
    else activeTop.interaction.tucked = 'out'
  }

  if (activeOuterwear) {
    const sub = (activeOuterwear.sub_category || activeOuterwear.name || '').toLowerCase()
    const isClosedType = CLOSED_OUTERWEAR.has(sub) || /coat|trench|parka|puffer|rain/i.test(sub)
    activeOuterwear.interaction.open = isClosedType ? false : true
  }

  // STEP 4: Build visibility hints
  activeItems.forEach(item => {
    if (item.category === 'top' && activeOuterwear) {
      item.visibility_hint = activeOuterwear.interaction.open
        ? `Visible through open ${activeOuterwear.name || 'outerwear'}: chest area, collar above lapels, and cuffs past sleeves`
        : `Mostly hidden under closed ${activeOuterwear.name || 'outerwear'}: only collar and possibly cuffs visible`
    } else if (item.category === 'dress' && activeOuterwear) {
      item.visibility_hint = activeOuterwear.interaction.open
        ? `Visible through open ${activeOuterwear.name || 'outerwear'}: full front of dress visible below lapels`
        : `Partially hidden: only neckline and hem below outerwear visible`
    } else if (item.category === 'outerwear') {
      const innerLabel = activeTop?.name || activeDress?.name || 'inner layer'
      item.visibility_hint = item.interaction.open
        ? `Open/unbuttoned — ${innerLabel} visible underneath`
        : `Closed/buttoned — covers most of ${innerLabel}`
    } else if (item.category === 'bottom') {
      if (activeTop?.interaction.tucked === 'in') item.visibility_hint = 'Waistband visible with shirt tucked in'
      else if (activeTop?.interaction.tucked === 'out') item.visibility_hint = 'Upper portion partially covered by untucked top'
      else item.visibility_hint = 'Visible from waist down'
    } else if (item.category === 'shoes') {
      const bottomLabel = activeBottom?.name || activeDress?.name || ''
      item.visibility_hint = bottomLabel ? `Visible below ${bottomLabel}` : 'Visible on feet'
    } else if (item.category === 'accessories') {
      item.visibility_hint = 'Layered on top of all clothing'
    } else {
      item.visibility_hint = 'Fully visible'
    }
  })

  activeItems.sort((a, b) => a.z_layer - b.z_layer)
  return resolved
}

function buildLayeringPromptSection(items: ResolvedClothingItem[]): string {
  const activeItems = items.filter(i => !i.conflict_warning)
  const conflictedItems = items.filter(i => i.conflict_warning)
  const primaryItem = activeItems.find(i => i.is_primary) || activeItems[0]
  if (activeItems.length <= 1) return ''

  const lines: string[] = []
  lines.push(`PRIMARY GARMENT (MUST be the most visible and prominent in output):`)
  lines.push(`→ "${primaryItem.name || primaryItem.category}" (${primaryItem.category}) — This is the item the user specifically wants to see.`)
  lines.push(``)
  lines.push(`LAYERING ORDER (from innermost to outermost):`)
  activeItems.forEach((item, idx) => {
    const label = item.name || item.category
    const isPrimary = item === primaryItem ? ' ⭐ PRIMARY' : ''
    const tuckHint = item.interaction.tucked ? ` — ${item.interaction.tucked === 'in' ? 'TUCKED INTO pants/skirt' : item.interaction.tucked === 'half' ? 'HALF-TUCKED' : 'UNTUCKED'}` : ''
    const openHint = item.interaction.open !== undefined ? ` — ${item.interaction.open ? 'OPEN/UNBUTTONED' : 'CLOSED/BUTTONED'}` : ''
    lines.push(`  Layer ${idx + 1}: "${label}" (${item.category})${isPrimary}${tuckHint}${openHint}`)
  })
  lines.push(``)
  lines.push(`VISIBILITY RULES:`)
  activeItems.forEach(item => {
    if (item.visibility_hint) lines.push(`• ${item.name || item.category}: ${item.visibility_hint}`)
  })
  lines.push(``)

  const hasInteractions = activeItems.some(i => i.interaction.tucked || i.interaction.open !== undefined)
  if (hasInteractions) {
    lines.push(`CLOTHING INTERACTIONS:`)
    activeItems.forEach(item => {
      if (item.interaction.tucked === 'in') lines.push(`• "${item.name || item.category}" is tucked into waistband`)
      else if (item.interaction.tucked === 'out') lines.push(`• "${item.name || item.category}" hangs loose over waistband`)
      else if (item.interaction.tucked === 'half') lines.push(`• "${item.name || item.category}" is half-tucked — front in, back out`)
      if (item.interaction.open === true) lines.push(`• "${item.name || item.category}" is open/unbuttoned — inner layer visible`)
      else if (item.interaction.open === false) lines.push(`• "${item.name || item.category}" is closed/buttoned`)
    })
    lines.push(``)
  }

  if (conflictedItems.length > 0) {
    lines.push(`SKIPPED ITEMS (conflicts):`)
    conflictedItems.forEach(item => lines.push(`• ${item.conflict_warning}`))
    lines.push(``)
  }
  return lines.join('\n')
}

/**
 * Build FULL OUTFIT TRANSFER prompt — khi user muốn lấy toàn bộ outfit
 * từ ảnh có người mặc và transfer sang model của họ.
 */
function buildFullOutfitTransferPrompt(systemPrompt: string, quality: string): string {
  const lines: string[] = []
  lines.push(`TASK: You are a virtual dressing room performing a FULL OUTFIT TRANSFER.`)
  lines.push(`Image 1 = THE PERSON (your model — preserve their face, body, hair, skin tone, pose exactly).`)
  lines.push(`Image 2 = SOURCE OUTFIT (another person wearing the outfit you must transfer).`)
  lines.push(``)
  lines.push(`⚠️ CRITICAL OBJECTIVE: Copy the ENTIRE OUTFIT from Image 2's person onto Image 1's person.`)
  lines.push(`This means: every visible clothing item (top, bottom, shoes, accessories, outerwear) must be transferred as a complete look.`)
  lines.push(``)
  lines.push(`STEP 1 — ANALYZE Image 2's outfit in detail:`)
  lines.push(`For EACH visible clothing item, identify and memorize:`)
  lines.push(`  a) Item type and exact length (where does each hem fall?)`)
  lines.push(`  b) Silhouette and fit (tight, loose, A-line, oversized?)`)
  lines.push(`  c) Neckline and sleeve style`)
  lines.push(`  d) Exact colors, patterns, pattern scale and placement`)
  lines.push(`  e) Fabric appearance (sheer, matte, shiny, textured?)`)
  lines.push(`  f) Construction details (buttons, zippers, seams, pockets, embellishments)`)
  lines.push(`  g) How items interact (tucked in, layered, belted?)`)
  lines.push(``)
  lines.push(`STEP 2 — TRANSFER onto Image 1's person:`)
  lines.push(`1. IDENTITY: Image 1's person ONLY — same face, body shape, skin tone, hair. Do NOT use Image 2's person's face/body/hair.`)
  lines.push(`2. OUTFIT: Apply ALL items identified in Step 1 to Image 1's person.`)
  lines.push(`3. FIT: Adapt naturally to Image 1's body shape — correct draping, proportions, perspective.`)
  lines.push(`4. POSE: Keep Image 1's pose. Adjust outfit fit to match this pose, not Image 2's pose.`)
  lines.push(`5. BACKGROUND: Keep Image 1's background unchanged.`)
  lines.push(`6. LIGHTING: Match Image 1's lighting and shadows.`)
  lines.push(`7. IGNORE: Any text, watermarks, or overlays on Image 2.`)
  lines.push(``)
  lines.push(`STEP 3 — VERIFY before outputting:`)
  lines.push(`  ✓ Every garment attribute from Step 1 is preserved (length, silhouette, colors, details)?`)
  lines.push(`  ✓ It is Image 1's person (face, hair, skin)?`)
  lines.push(`  ✓ Background unchanged from Image 1?`)
  lines.push(`If ANY attribute differs, fix it.`)
  lines.push(``)
  if (quality === 'hd') {
    lines.push(`QUALITY: Ultra HD photorealistic. Maximum fabric detail, zero AI artifacts.`)
  } else {
    lines.push(`QUALITY: Photorealistic, clean edges, natural appearance.`)
  }
  lines.push(``)
  lines.push(`⚠️ OUTPUT: Image 1's person wearing Image 2's complete outfit with ALL garment attributes preserved.`)
  if (systemPrompt?.trim()) {
    lines.push(``)
    lines.push(`ADDITIONAL RULES: ${systemPrompt.trim()}`)
  }
  return lines.join('\n')
}

function buildTryOnPrompt(input: PromptBuilderInput): string {
  const { systemPrompt, quality, clothingItems, totalImages } = input
  const lines: string[] = []

  lines.push(`TASK: You are a virtual dressing room. You MUST change the clothes on the person in Image 1.`)
  lines.push(`The person in Image 1 is currently wearing certain clothes. You MUST REMOVE those clothes and REPLACE them with the garment(s) shown in the other image(s).`)
  lines.push(`The output MUST show the SAME person wearing DIFFERENT clothes. If the output looks identical to Image 1, you have FAILED.`)
  lines.push(``)
  lines.push(`⚠️ MANDATORY: The output image MUST be visibly DIFFERENT from Image 1.`)
  lines.push(``)
  lines.push(`WHILE CHANGING CLOTHES, PRESERVE THE PERSON's IDENTITY:`)
  lines.push(`• Face: Keep the same face, expression, skin tone.`)
  lines.push(`• Body: Same body shape, pose, proportions.`)
  lines.push(`• Hair: Same hairstyle and color.`)
  lines.push(`• Background: Keep the same scene and lighting.`)
  lines.push(`• Do NOT use the face/body of any person from the clothing images.`)
  lines.push(``)

  const activeItems = clothingItems.filter(i => !i.conflict_warning)
  lines.push(`IMAGES PROVIDED:`)
  lines.push(`• Image 1 = THE PERSON`)

  const isWornType = (t?: string) => t === 'worn' || t === 'lifestyle'
  const hasWornItems = activeItems.some(i => isWornType(i.image_type))
  const hasCleanItems = activeItems.some(i => !isWornType(i.image_type))

  activeItems.forEach((item, idx) => {
    const imageNum = idx + 2
    const label = item.name || item.category
    const colorHint = item.color ? `, ${item.color}` : ''
    const primaryTag = item.is_primary ? ' ⭐ PRIMARY' : ''
    const worn = isWornType(item.image_type)
    if (worn) {
      lines.push(`• Image ${imageNum} = GARMENT TO EXTRACT: "${label}" (${item.category}${colorHint})${primaryTag} — WORN BY ANOTHER PERSON. IGNORE model, EXTRACT garment only.`)
    } else {
      lines.push(`• Image ${imageNum} = GARMENT TO APPLY: "${label}" (${item.category}${colorHint})${primaryTag} — CLEAN image (${describeClothingImageType(item.image_type)}).`)
    }
  })
  lines.push(``)

  if (hasWornItems || hasCleanItems) {
    lines.push(`GARMENT SOURCE HANDLING:`)
    if (hasWornItems) {
      lines.push(`🔹 WORN-BY-MODEL: IGNORE the model completely. EXTRACT garment only. Use fit as reference.`)
      lines.push(``)
    }
    if (hasCleanItems) {
      lines.push(`🔹 CLEAN IMAGES: Take garment AS-IS. Fit with realistic draping onto Image 1's person.`)
      lines.push(``)
    }
  }

  // Phase 1: ANALYZE
  lines.push(`STEP 1 — ANALYZE EACH GARMENT (do this BEFORE applying):`)
  lines.push(`For each garment image, carefully study and memorize:`)
  lines.push(`  a) TYPE & LENGTH: What is it? Where does the hem fall? (e.g., floor-length maxi skirt, cropped jacket, ankle-length pants, knee-length dress)`)
  lines.push(`  b) SILHOUETTE & FIT: A-line, fitted, oversized, straight, flared, bodycon, relaxed?`)
  lines.push(`  c) NECKLINE: V-neck, round, turtleneck, off-shoulder, halter, square, boat, collar?`)
  lines.push(`  d) SLEEVES: Long, short, 3/4, sleeveless, cap, puff, bishop, rolled? Where do they end?`)
  lines.push(`  e) COLORS & PATTERN: Exact colors, pattern type (solid, striped, floral, tie-dye, plaid), pattern scale/placement`)
  lines.push(`  f) FABRIC & TEXTURE: Sheer, opaque, flowy, structured, ribbed, denim, silk, knit?`)
  lines.push(`  g) CONSTRUCTION: Buttons (count them), zippers, seams, pleats, ruffles, pockets, waistband type, closures`)
  lines.push(`  h) UNIQUE FEATURES: Embroidery, cutouts, slits, asymmetry, layering, ties, bows, logos`)
  lines.push(``)

  // Phase 2: APPLY
  lines.push(`STEP 2 — APPLY GARMENT(S) TO PERSON:`)
  lines.push(`1. Remove the person's current clothing completely.`)
  lines.push(`2. Dress the person in the new garment(s), preserving EVERY attribute from Step 1.`)
  lines.push(`3. Fit naturally to the person's body — add realistic wrinkles, draping, gravity effects.`)
  lines.push(`4. Match the scene's lighting and shadows on the new clothing.`)
  lines.push(`5. IGNORE any text, watermarks, or background from garment images.`)
  lines.push(``)

  // Phase 3: VERIFY
  lines.push(`STEP 3 — VERIFY (mandatory check before outputting):`)
  lines.push(`Compare your output against Step 1. Ask yourself:`)
  lines.push(`  ✓ Does each garment reach the SAME length as the source? (maxi must stay maxi, cropped must stay cropped)`)
  lines.push(`  ✓ Is the silhouette/shape identical? (A-line stays A-line, not straight)`)
  lines.push(`  ✓ Are sleeves the same type and length?`)
  lines.push(`  ✓ Is the neckline correct?`)
  lines.push(`  ✓ Are ALL colors, patterns, and their placement accurate?`)
  lines.push(`  ✓ Are construction details (buttons, zippers, seams) present and correct?`)
  lines.push(`  ✓ Is it still the SAME person (face, hair, skin, body)?`)
  lines.push(`If ANY attribute differs from the source garment, FIX IT before outputting.`)
  lines.push(``)

  if (activeItems.length > 1) {
    const layeringSection = buildLayeringPromptSection(clothingItems)
    if (layeringSection) lines.push(layeringSection)
  }

  if (quality === 'hd') {
    lines.push(`QUALITY: Ultra HD photorealistic. Maximum fabric detail, zero AI artifacts.`)
  } else {
    lines.push(`QUALITY: Photorealistic, clean edges, natural appearance.`)
  }
  lines.push(``)
  lines.push(`⚠️ OUTPUT: The result image showing the SAME person wearing the NEW garment(s) with ALL attributes preserved.`)
  if (systemPrompt?.trim()) {
    lines.push(``)
    lines.push(`ADDITIONAL RULES: ${systemPrompt.trim()}`)
  }
  return lines.join('\n')
}

function describeClothingImageType(imageType?: string): string {
  const typeMap: Record<string, string> = {
    flatlay: 'flat-lay photo',
    mannequin: 'mannequin/dress form photo',
    worn: 'worn by model — extract garment only',
    product: 'product photo on plain background',
    lifestyle: 'lifestyle photo — may include model',
    unknown: 'unspecified — analyze and extract appropriately',
  }
  return typeMap[imageType || 'unknown'] || typeMap['unknown']
}

// =============================================
// MAIN HANDLER
// =============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // 1. Validate JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const tokenPart = authHeader.replace('Bearer ', '')
    console.log('[process-tryon] 🔑 Auth header present, token length:', tokenPart.length)

    // Debug JWT
    try {
      const parts = tokenPart.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]))
        const expMs = (payload.exp || 0) * 1000
        const diffSec = Math.floor((expMs - Date.now()) / 1000)
        console.log('[process-tryon] 🔑 JWT sub:', payload.sub, 'role:', payload.role)
        console.log('[process-tryon] 🔑 JWT status:', diffSec > 0 ? `Valid (${diffSec}s)` : `EXPIRED ${Math.abs(diffSec)}s ago`)
      }
    } catch (_) { /* non-critical */ }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const replicateApiKey = Deno.env.get('REPLICATE_API_KEY')

    if (!replicateApiKey) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: { user }, error: authError } = await userClient.auth.getUser(tokenPart)
    if (authError || !user) {
      console.error('[process-tryon] ❌ Auth failed:', authError?.message)
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: authError?.message || 'No user found' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const userId = user.id
    console.log('[process-tryon] ✅ Auth success, userId:', userId)

    // 2. Rate limit
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    const { count: requestCount, error: countError } = await userClient
      .from('tryon_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', oneMinuteAgo)

    if (!countError && requestCount !== null && requestCount >= 5) {
      return new Response(JSON.stringify({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Bạn đã đạt giới hạn 5 lần thử/phút.',
        reset_in: '60s'
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Parse request
    const body = await req.json()
    const { model_image, clothing_images, quality = 'standard', edit_mode = false, edit_prompt } = body

    if (!model_image) {
      return new Response(JSON.stringify({ error: 'model_image là bắt buộc' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (edit_mode) {
      if (!edit_prompt?.trim()) {
        return new Response(JSON.stringify({ error: 'edit_prompt là bắt buộc khi edit_mode=true' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      if (!clothing_images?.length) {
        return new Response(JSON.stringify({ error: 'clothing_images array là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (clothing_images.length > 4) {
        return new Response(JSON.stringify({ error: 'Tối đa 4 món đồ mỗi lần thử' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // 4. Load ai_config
    const { data: aiConfig } = await userClient
      .from('ai_config')
      .select('system_prompt, cost_standard, cost_hd')
      .eq('id', 'default')
      .single()

    const systemPrompt = aiConfig?.system_prompt || ''
    const gemsRequired = edit_mode
      ? (aiConfig?.cost_standard || 1)
      : (quality === 'hd' ? (aiConfig?.cost_hd || 2) : (aiConfig?.cost_standard || 1))

    // 5. Check gems balance
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('gems_balance')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Không tìm thấy profile' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (profile.gems_balance < gemsRequired) {
      return new Response(JSON.stringify({
        error: 'INSUFFICIENT_GEMS',
        message: `Không đủ gems. Cần ${gemsRequired}, hiện có ${profile.gems_balance}.`,
        gems_balance: profile.gems_balance,
        gems_required: gemsRequired
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 6. Check cache
    let cacheKey = ''
    if (!edit_mode) {
      const clothingDataList = clothing_images.map((c: { image: string }) => c.image)
      cacheKey = await generateCacheKey(model_image, clothingDataList, quality)
      const { data: cachedResult } = await userClient
        .from('tryon_history')
        .select('id, result_image_url')
        .eq('cache_key', cacheKey)
        .eq('status', 'completed')
        .not('result_image_url', 'is', null)
        .limit(1)
        .maybeSingle()
      if (cachedResult?.result_image_url) {
        console.log('[process-tryon] Cache hit:', cacheKey)
        return new Response(JSON.stringify({
          tryon_id: cachedResult.id,
          result_image_url: cachedResult.result_image_url,
          gems_remaining: profile.gems_balance,
          gems_used: 0,
          cached: true,
          processing_time_ms: Date.now() - startTime
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // 7. Deduct gems
    const { data: newBalance, error: deductError } = await userClient.rpc('deduct_gems_atomic', {
      p_user_id: userId, p_amount: gemsRequired, p_tryon_id: null,
    })
    if (deductError) {
      return new Response(JSON.stringify({ error: 'GEM_DEDUCTION_FAILED', message: 'Lỗi trừ gems.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 8. Prepare images + prompt
    let modelImageUrl: string
    let clothingImageUrls: string[] = []
    let sortedClothing: typeof clothing_images = []
    let finalPrompt: string

    try {
      modelImageUrl = model_image.startsWith('http')
        ? model_image
        : await uploadBase64ToStorage(userClient, userId, model_image, 'temp-inputs', 'image/jpeg')

      if (edit_mode) {
        finalPrompt = `You are a photorealistic image editor. Edit the following image according to this instruction: "${edit_prompt.trim()}"

CRITICAL CONSTRAINTS:
1. FACE & IDENTITY: PIXEL-IDENTICAL face. Do NOT alter face shape, skin color, or features.
2. BODY: Same shape, pose, proportions, skin tone.
3. BACKGROUND: Completely unchanged. Same camera angle and lighting.
4. SCOPE: ONLY change what the instruction asks. Nothing else.
5. QUALITY: Photorealistic, no AI artifacts, seamless blending.`
        console.log('[process-tryon] EDIT MODE - prompt:', edit_prompt.trim().substring(0, 100))
      } else {
        // Check if any item uses full_outfit transfer mode
        const hasFullOutfitTransfer = clothing_images.some(
          (item: ClothingItem) => item.transfer_mode === 'full_outfit'
        )

        if (hasFullOutfitTransfer) {
          // === FULL OUTFIT TRANSFER MODE ===
          // Use only the first clothing image as the outfit source
          console.log('[process-tryon] 🔄 FULL OUTFIT TRANSFER MODE')
          const outfitSource = clothing_images[0]
          sortedClothing = [outfitSource]

          clothingImageUrls = await Promise.all(
            sortedClothing.map(async (item: { image: string }) => {
              return item.image.startsWith('http')
                ? item.image
                : await uploadBase64ToStorage(userClient, userId, item.image, 'temp-inputs', 'image/jpeg')
            })
          )

          finalPrompt = buildFullOutfitTransferPrompt(systemPrompt, quality)
          console.log('[process-tryon] 📝 Full outfit transfer prompt length:', finalPrompt.length)
        } else {
          // === STANDARD TRY-ON MODE ===
          const itemsWithPrimary: ClothingItem[] = clothing_images.map(
            (item: ClothingItem, idx: number) => ({
              ...item,
              is_primary: item.is_primary ?? (idx === 0),
            })
          )

          const resolvedItems = resolveLayerOrder(itemsWithPrimary)
          const activeItems = resolvedItems.filter(i => !i.conflict_warning)

          const conflicted = resolvedItems.filter(i => i.conflict_warning)
          if (conflicted.length > 0) {
            console.log('[process-tryon] ⚠️ Conflicts:')
            conflicted.forEach(i => console.log(`  - ${i.conflict_warning}`))
          }

          sortedClothing = activeItems
          clothingImageUrls = await Promise.all(
            sortedClothing.map(async (item: { image: string }) => {
              return item.image.startsWith('http')
                ? item.image
                : await uploadBase64ToStorage(userClient, userId, item.image, 'temp-inputs', 'image/jpeg')
            })
          )

          finalPrompt = buildTryOnPrompt({
            systemPrompt, quality,
            clothingItems: resolvedItems,
            totalImages: 1 + sortedClothing.length,
          })
          console.log('[process-tryon] 📝 Prompt length:', finalPrompt.length)
          console.log('[process-tryon] 📝 Active items:', activeItems.map(i => `${i.name || i.category}(z${i.z_layer})`).join(', '))
        }
      }
    } catch (uploadError) {
      await userClient.rpc('refund_gems_atomic', { p_user_id: userId, p_amount: gemsRequired, p_tryon_id: null })
      console.error('[process-tryon] Upload error:', uploadError)
      return new Response(JSON.stringify({ error: 'UPLOAD_FAILED', message: 'Lỗi upload ảnh. Gems đã hoàn lại.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 10. Call Replicate (with 1 retry for transient errors)
    const modeLabel = edit_mode ? 'EDIT' : 'TRY-ON'
    console.log(`[process-tryon] [${modeLabel}] Calling Replicate for user ${userId}...`)
    console.log(`[process-tryon] Model: ${REPLICATE_MODEL}`)
    console.log(`[process-tryon] Image URLs count: ${edit_mode ? 1 : 1 + clothingImageUrls.length}`)
    const allImageUrls = edit_mode ? [modelImageUrl] : [modelImageUrl, ...clothingImageUrls]
    // Log image URLs for debugging (truncated)
    allImageUrls.forEach((url, i) => console.log(`[process-tryon] Image[${i}]: ${url.substring(0, 80)}...`))

    let prediction: ReplicatePrediction
    const MAX_RETRIES = 1
    let lastReplicateError: unknown = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[process-tryon] ♻️ Retry attempt ${attempt}/${MAX_RETRIES}...`)
          await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2s before retry
        }
        prediction = await createReplicatePrediction(replicateApiKey, {
          prompt: finalPrompt,
          image_input: allImageUrls,
        })
        console.log(`[process-tryon] Prediction created: id=${prediction.id}, status=${prediction.status}`)
        if (prediction.status !== 'succeeded') {
          prediction = await pollReplicatePrediction(replicateApiKey, prediction.id, 180000, 3000)
        }
        console.log(`[process-tryon] ✅ Prediction succeeded: id=${prediction.id}`)
        lastReplicateError = null
        break // Success — exit retry loop
      } catch (replicateError) {
        lastReplicateError = replicateError
        const errorStr = String(replicateError)
        console.error(`[process-tryon] ❌ Replicate error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, replicateError)
        console.error(`[process-tryon] Error message: ${errorStr}`)
        // Don't retry on rate limit (429) or validation errors (422)
        if (errorStr.includes('429') || errorStr.includes('422')) {
          console.log(`[process-tryon] ⏭️ Not retrying: rate limit or validation error`)
          break
        }
      }
    }

    if (lastReplicateError) {
      await serviceClient.rpc('refund_gems_atomic', { p_user_id: userId, p_amount: gemsRequired, p_tryon_id: null })
      const errorStr = String(lastReplicateError)
      console.error('[process-tryon] 🔴 All Replicate attempts failed. Final error:', errorStr)
      let errorMsg: string
      let errorCode = 'AI_PROCESSING_FAILED'
      if (errorStr.includes('429')) {
        errorMsg = 'Hệ thống AI đang quá tải. Vui lòng thử lại sau.'
        errorCode = 'RATE_LIMITED'
      } else if (errorStr.includes('422')) {
        errorMsg = 'Ảnh không hợp lệ cho AI xử lý. Vui lòng thử ảnh khác.'
        errorCode = 'INVALID_INPUT'
      } else if (errorStr.includes('timeout') || errorStr.includes('Timeout')) {
        errorMsg = 'AI xử lý quá lâu. Vui lòng thử lại.'
        errorCode = 'AI_TIMEOUT'
      } else if (errorStr.includes('unavailable') || errorStr.includes('high demand') || errorStr.includes('503')) {
        errorMsg = 'Hệ thống AI đang bận lắm, thử lại sau chút nha~ 🙏'
        errorCode = 'SERVICE_BUSY'
      } else if (errorStr.includes('500') || errorStr.includes('Internal')) {
        errorMsg = 'AI gặp sự cố tạm thời. Gems đã được hoàn lại, thử lại sau nha~ ✨'
        errorCode = 'AI_INTERNAL_ERROR'
      } else {
        // Log full error for debugging, but show friendly message to user
        console.error('[process-tryon] Raw error detail:', errorStr)
        errorMsg = 'AI chưa xử lý được lần này. Gems đã hoàn lại, thử lại nha~ 💪'
      }
      return new Response(JSON.stringify({ error: errorCode, message: errorMsg }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 11. Extract + upload result
    const resultImageUrl_replicate = extractResultUrl(prediction.output)
    let resultImageUrl: string
    try {
      resultImageUrl = await uploadUrlToStorage(serviceClient, userId, resultImageUrl_replicate, 'results')
    } catch (storageError) {
      console.error('[process-tryon] Storage save error:', storageError)
      resultImageUrl = resultImageUrl_replicate
    }

    // 12. Save history
    const processingTime = Date.now() - startTime
    const { data: tryonRecord } = await serviceClient
      .from('tryon_history')
      .insert({
        user_id: userId,
        model_image_url: modelImageUrl,
        clothing_image_urls: edit_mode ? [] : clothingImageUrls,
        gems_used: gemsRequired,
        quality: edit_mode ? 'edit' : quality,
        status: 'completed',
        result_image_url: resultImageUrl,
        replicate_prediction_id: prediction.id,
        cache_key: cacheKey || null,
        processing_time_ms: processingTime,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    console.log(`[process-tryon] Done in ${processingTime}ms, tryon_id: ${tryonRecord?.id}`)
    return new Response(JSON.stringify({
      tryon_id: tryonRecord?.id || crypto.randomUUID(),
      result_image_url: resultImageUrl,
      gems_remaining: typeof newBalance === 'number' ? newBalance : profile.gems_balance - gemsRequired,
      gems_used: gemsRequired,
      cached: false,
      processing_time_ms: processingTime,
      provider: 'replicate',
      model: REPLICATE_MODEL,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[process-tryon] Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
