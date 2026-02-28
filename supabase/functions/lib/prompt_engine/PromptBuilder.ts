/**
 * File: prompt_engine/PromptBuilder.ts
 * Purpose: Assembles dynamic prompts from modular PromptBlocks based on SceneContext.
 * Layer: Application
 * Domain: Try-On Prompt Generation
 *
 * Covers all 32 scenarios across 4 groups:
 *   Nhóm 1 (#1-#11): Single items — top, bottom, dress, outerwear, shoes, hat, eyewear, bag, jewelry, scarf, belt
 *   Nhóm 2 (#12-#17): Outfit combos — top+bottom, full outfit, +accessories, layering, dress+outerwear, swap single
 *   Nhóm 3 (#18-#25): User image variants — full body, half body, angled, sitting, bulky clothes, multi-person, complex bg, low quality
 *   Nhóm 4 (#26-#32): Product image variants — flatlay, mannequin, worn, single angle, multi-variant, cropped, watermark
 */

import { SceneContext, UserIntent, PromptBlock, PromptGenerationResult, ClothingCategory, OutfitMode } from './types.ts'

// =============================================
// PROMPT BLOCK REGISTRY — Tất cả rules có thể ghép
// =============================================

const PROMPT_BLOCKS: PromptBlock[] = [

    // ── CORE DIRECTIVES (luôn active) ──────────────────────────────────

    {
        id: 'CORE_IDENTITY',
        category: 'CORE_DIRECTIVE',
        priority: 100,
        content: `OUTPUT = EXACTLY ONE person from Image 1. Their FACE, BODY, HAIR, SKIN TONE, and POSE must remain PIXEL-IDENTICAL. Do NOT alter, beautify, age, or swap any body feature.`,
    },
    {
        id: 'CORE_OUTPUT_FORMAT',
        category: 'CORE_DIRECTIVE',
        priority: 99,
        content: `Output a SINGLE clean photo. No collage, no side-by-side, no before/after, no text, no labels, no watermarks, no borders. Only one person visible.`,
    },
    {
        id: 'CORE_GARMENT_FIDELITY',
        category: 'CORE_DIRECTIVE',
        priority: 98,
        content: `GARMENT FIDELITY: Preserve the EXACT colors, patterns, pattern scale, silhouette, length, hemline, fabric texture, and construction details (buttons, zippers, pockets, seams, embellishments) from the source garment image(s).`,
    },

    // ── NHÓM 1: Garment-Specific Rules (#1-#11) ───────────────────────

    {
        id: 'SINGLE_ITEM_PRESERVE_REST',
        category: 'GARMENT_SPECIFIC',
        priority: 92,
        content: `SINGLE ITEM MODE: Only ONE garment category is being changed. Keep ALL other existing clothing on the person in Image 1 EXACTLY unchanged — same color, style, fit, wrinkles. Do NOT invent or modify any clothing the user did not provide.`,
        condition: (_: SceneContext, __: ClothingCategory[], mode: OutfitMode) => mode === 'single_item',
    },
    {
        id: 'OUTERWEAR_KEEP_INNER',
        category: 'GARMENT_SPECIFIC',
        priority: 85,
        content: `OUTERWEAR RULE: The outerwear (jacket/coat/cardigan) should be worn OVER the person's existing inner clothing visible in Image 1. Show clear depth separation — inner layer casts natural shadow inside the open outerwear. Do NOT remove the inner top.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('outerwear') && !cats.includes('top'),
    },
    {
        id: 'SHOES_FOCUS',
        category: 'GARMENT_SPECIFIC',
        priority: 80,
        content: `SHOES: Replace ONLY the footwear. Preserve exact pant-hem interaction: wide pants break over shoe top, skinny pants tuck into boots. Show shoe details (sole, laces, texture) accurately. Keep leg and ankle proportions identical.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('shoes') && cats.length === 1,
    },
    {
        id: 'HAT_FOCUS',
        category: 'GARMENT_SPECIFIC',
        priority: 80,
        content: `HAT/CAP: Place the hat naturally on the person's head. Maintain hair visible below/around the hat. Preserve the hat's exact shape, brim angle, and any logos/patches. Cast a realistic shadow from the brim onto the face if applicable.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('hat'),
    },
    {
        id: 'EYEWEAR_FOCUS',
        category: 'GARMENT_SPECIFIC',
        priority: 80,
        content: `EYEWEAR: Place glasses/sunglasses precisely on the nose bridge and ears. Maintain exact frame shape, lens tint, and reflections. Do NOT distort eye area or change facial proportions. Ensure temples sit naturally over the ears and hair.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('eyewear'),
    },
    {
        id: 'BAG_FOCUS',
        category: 'GARMENT_SPECIFIC',
        priority: 78,
        content: `BAG/BACKPACK: Position naturally — handheld bags in hand, shoulder bags on shoulder, crossbody across torso, backpacks on back. Preserve strap length, buckles, hardware details. The bag must interact with the body (strap over shoulder creates fabric pull, hand grips handle).`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('bag'),
    },
    {
        id: 'JEWELRY_FOCUS',
        category: 'GARMENT_SPECIFIC',
        priority: 90,
        content: `JEWELRY/WATCH: Pay EXTREME attention to fine details — exact gemstone shape, metal color (gold/silver/rose-gold), chain link style, watch face design. Necklaces drape on collarbone, earrings hang from earlobes, rings sit on fingers, bracelets on wrists. Preserve shininess and light reflections. These are TINY items — do NOT enlarge or distort them.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('jewelry'),
    },
    {
        id: 'SCARF_FOCUS',
        category: 'GARMENT_SPECIFIC',
        priority: 78,
        content: `SCARF: Drape naturally around the neck with realistic fabric folds and gravity. Preserve exact pattern, fringe, and material (wool, silk, cotton). Show how it interacts with the collar of any shirt/jacket underneath.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('scarf'),
    },
    {
        id: 'BELT_FOCUS',
        category: 'GARMENT_SPECIFIC',
        priority: 78,
        content: `BELT: The belt MUST physically wrap around the outermost garment at the natural waistline. Show realistic cinching/bunching of fabric under the belt. Preserve buckle design, leather texture, and belt width accurately.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('belt'),
    },
    {
        id: 'DRESS_PHYSICS',
        category: 'GARMENT_SPECIFIC',
        priority: 85,
        content: `DRESS/JUMPSUIT: Precisely replicate the skirt length, volume, and hem shape. Allow gravity to drape the fabric naturally according to the model's pose. Maintain the exact neckline shape and sleeve style. For jumpsuits — show natural waist definition and leg draping.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.includes('dress'),
    },

    // ── NHÓM 2: Outfit Combination Rules (#12-#17) ────────────────────

    {
        id: 'COMBO_COLOR_BOUNDARY',
        category: 'PHYSICS_INTERACTION',
        priority: 88,
        content: `MULTI-ITEM COLOR BOUNDARY: Maintain STRICT visual boundaries between different garments. Prevent any texture, pattern, or color bleeding between items. Each garment must have its own distinct edge where it meets another.`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.length > 1,
    },
    {
        id: 'COMBO_FABRIC_PHYSICS',
        category: 'PHYSICS_INTERACTION',
        priority: 86,
        content: `FABRIC PHYSICS: Apply natural draping with material-specific behavior — denim is stiff, silk flows, wool has weight, cotton creases. Each garment reacts to gravity and body movement independently. Add realistic wrinkles at joints (elbows, knees, waist).`,
        condition: (_: SceneContext, cats: ClothingCategory[]) => cats.length > 1,
    },
    {
        id: 'SWAP_SINGLE_ITEM',
        category: 'GARMENT_SPECIFIC',
        priority: 91,
        content: `SWAP MODE: The user is replacing ONLY the specified item(s). ALL other clothing currently worn by the person in Image 1 MUST remain EXACTLY as-is — same color, same style, same wrinkles, same position. Do NOT change or "improve" any unswapped items.`,
        condition: (_: SceneContext, __: ClothingCategory[], mode: OutfitMode) => mode === 'swap_single',
    },
    {
        id: 'LAYERING_DEPTH',
        category: 'PHYSICS_INTERACTION',
        priority: 87,
        content: `LAYERING DEPTH: Clearly distinguish depth between inner and outer layers. Inner layer visible at collar, cuffs, and through any opening. Outer layer sits on top with its own shadow. Fabric thickness must be visible at overlapping edges.`,
        condition: (_: SceneContext, __: ClothingCategory[], mode: OutfitMode) => mode === 'layering' || mode === 'dress_outerwear',
    },
    {
        id: 'FIT_INTENTION',
        category: 'STYLE_CONSTRAINT',
        priority: 84,
        content: `FIT INTENTION: Strictly respect the intended silhouette from the source garment. If the source shows oversized/baggy/drop-shoulder, preserve those exaggerated proportions. If fitted/slim, keep it fitted. Do NOT normalize all garments to a generic fit.`,
        condition: () => true, // Luôn hữu ích
    },

    // ── NHÓM 3: User Image Variant Rules (#18-#25) ────────────────────

    {
        id: 'MULTIPLE_PEOPLE_GUARD',
        category: 'ENVIRONMENT_CONTROL',
        priority: 95,
        content: `MULTIPLE PEOPLE DETECTED: Image 1 contains more than one person. Focus ONLY on the primary subject (largest, most centered, most forward-facing person). Treat all other people as background scenery — do NOT dress them, do NOT alter their faces, do NOT let them influence the output.`,
        condition: (ctx: SceneContext) => ctx.hasMultiplePeople,
    },
    {
        id: 'HALF_BODY_LIMIT',
        category: 'POSE_ADAPTATION',
        priority: 88,
        content: `HALF-BODY IMAGE: Only the upper body is visible. Apply clothing ONLY to the visible portion. Do NOT attempt to generate or extend the lower body. If trying shoes/bottom items — this is NOT possible with this image; apply only what the visible area supports.`,
        condition: (ctx: SceneContext) => ctx.isHalfBody,
    },
    {
        id: 'ANGLED_POSE',
        category: 'POSE_ADAPTATION',
        priority: 82,
        content: `ANGLED/ROTATED POSE: The person is not facing the camera straight-on. Warp the garment to match the exact body angle and perspective. Show proper foreshortening — the side closer to the camera appears larger. Ensure seams, buttons, and patterns follow the body's curvature accurately.`,
        condition: (ctx: SceneContext) => ctx.isAngledPose,
    },
    {
        id: 'SITTING_POSE',
        category: 'POSE_ADAPTATION',
        priority: 82,
        content: `SITTING POSE: The person is seated. Garments must bunch and compress naturally at the waist and hip crease. Pant legs follow bent knee angles. Skirts/dresses fan out or drape over the thighs and seat. Do NOT show clothing as if the person were standing.`,
        condition: (ctx: SceneContext) => ctx.isSitting,
    },
    {
        id: 'BULKY_CLOTHES_REMOVAL',
        category: 'POSE_ADAPTATION',
        priority: 85,
        content: `EXISTING BULKY CLOTHING: The person in Image 1 is wearing thick/oversized clothes. You MUST mentally remove their current clothing to reveal the natural body shape underneath, then apply the new garment to the true body proportions — NOT on top of the bulky layer.`,
        condition: (ctx: SceneContext) => ctx.isWearingBulkyClothes,
    },
    {
        id: 'LOW_QUALITY_IMAGE',
        category: 'IMAGE_QUALITY',
        priority: 75,
        content: `LOW QUALITY SOURCE: Image 1 has low resolution or poor lighting. Maintain the output quality at the SAME level as the source — do NOT upscale the person's face/body to HD while keeping a blurry background (this creates uncanny valley). Match the grain and noise level consistently.`,
        condition: (ctx: SceneContext) => ctx.isLowQuality,
    },
    {
        id: 'MIRROR_REFLECTION',
        category: 'ENVIRONMENT_CONTROL',
        priority: 78,
        content: `MIRROR DETECTED: Image 1 contains a mirror reflection. Ensure the new clothing appears correctly in BOTH the real person and the mirror reflection. The reflection must obey physics (mirrored horizontally, slightly shifted perspective).`,
        condition: (ctx: SceneContext) => ctx.hasMirrors,
    },
    {
        id: 'HARSH_LIGHTING',
        category: 'ENVIRONMENT_CONTROL',
        priority: 76,
        content: `HARSH LIGHTING: Image 1 has strong directional light with hard shadows. Re-light the new garments to seamlessly match — same shadow direction, same contrast ratio, same color temperature. Add corresponding cast shadows on the clothing surfaces.`,
        condition: (ctx: SceneContext) => ctx.lighting === 'flash',
    },
    {
        id: 'COMPLEX_BACKGROUND',
        category: 'ENVIRONMENT_CONTROL',
        priority: 72,
        content: `COMPLEX BACKGROUND: Keep Image 1's background COMPLETELY unchanged. Do NOT simplify, blur, or alter any background elements. The person-to-background edge must remain seamless with no halo artifacts.`,
        condition: (ctx: SceneContext) => ctx.lighting === 'natural_outdoor', // Outdoor thường = complex background
    },

    // ── NHÓM 4: Product Image Variant Rules (#26-#32) ─────────────────

    {
        id: 'WATERMARK_IGNORE',
        category: 'STYLE_CONSTRAINT',
        priority: 88,
        content: `WATERMARK/LOGO OVERLAY: The garment source image has watermarks or store logos overlaid. Completely IGNORE and remove these overlays — reconstruct the garment fabric underneath. Do NOT transfer any watermark text onto the final output.`,
        condition: (ctx: SceneContext) => ctx.hasWatermark,
    },
    {
        id: 'CROPPED_PRODUCT',
        category: 'STYLE_CONSTRAINT',
        priority: 82,
        content: `CROPPED PRODUCT IMAGE: The garment source image is partially cut off (cropped). Intelligently infer the missing portions based on the visible garment style — extend hems, complete sleeves, or fill in the bottom naturally. Maintain consistent pattern/texture in the inferred areas.`,
        condition: (ctx: SceneContext) => ctx.isCroppedProduct,
    },
    {
        id: 'MULTI_VARIANT',
        category: 'STYLE_CONSTRAINT',
        priority: 80,
        content: `MULTIPLE VARIANTS: The garment source image shows the same item in multiple colors/variants. Use ONLY the most prominent/centered/largest variant. If a specific color was indicated in the item description, match that color.`,
        condition: (ctx: SceneContext) => ctx.hasMultipleVariants,
    },
    {
        id: 'MANNEQUIN_EXTRACTION',
        category: 'STYLE_CONSTRAINT',
        priority: 79,
        content: `MANNEQUIN IMAGE: The garment is displayed on a mannequin/dress form. Extract ONLY the fabric and design — completely discard any mannequin parts (plastic neck, arms, torso form). Apply the garment with natural human-body draping, not the rigid mannequin shape.`,
        condition: () => false, // Activated dynamically by image_type metadata
    },

    // ── NEGATIVE PROMPT (luôn kèm) ────────────────────────────────────

    {
        id: 'TEXT_PRESERVATION',
        category: 'STYLE_CONSTRAINT',
        priority: 90,
        content: `TEXT/LOGO ON GARMENT: Preserve all text, logos, and graphics on the clothing EXACTLY as written — same font, same size, same position. Do NOT distort, mirror, invent, or misspell any text elements.`,
        condition: (ctx: SceneContext) => ctx.needsTextPreservation,
    },
    {
        id: 'SHEER_MATERIAL',
        category: 'PHYSICS_INTERACTION',
        priority: 77,
        content: `SHEER/TRANSPARENT FABRIC: Maintain fabric transparency (sheer, mesh, lace, organza). The model's skin should be naturally visible through sheer areas with correct opacity levels.`,
        condition: (ctx: SceneContext) => ctx.needsTransparencyPreservation,
    },
]

// =============================================
// DYNAMIC PROMPT BUILDER
// =============================================

export class DynamicPromptBuilder {
    private blocks: PromptBlock[] = []
    private intent: UserIntent
    private context: SceneContext

    constructor(intent: UserIntent, context: SceneContext) {
        this.intent = intent
        this.context = context
    }

    /**
     * Fetch rules từ Database hoặc dùng defaults
     */
    public async loadBlocks(fetchFromDb: boolean = false): Promise<void> {
        // V2: fetchFromDb → query Supabase 'prompt_templates' table
        this.blocks = [...PROMPT_BLOCKS]
    }

    /**
     * Inject thêm block từ bên ngoài (VD: FeedbackLoop correction blocks)
     */
    public injectBlock(block: PromptBlock): void {
        this.blocks.push(block)
    }

    /**
     * Lọc và chọn các rules cần thiết dựa trên SceneContext + UserIntent
     */
    private selectRelevantBlocks(): PromptBlock[] {
        const selected: PromptBlock[] = []

        for (const block of this.blocks) {
            // Core directives luôn included
            if (block.category === 'CORE_DIRECTIVE') {
                selected.push(block)
                continue
            }

            // Nếu block có condition → evaluate
            if (block.condition) {
                if (block.condition(this.context, this.intent.categories, this.intent.outfitMode)) {
                    selected.push(block)
                }
            }
            // Block không có condition = luôn included (legacy)
            else if (!block.condition) {
                selected.push(block)
            }
        }

        // Sort by priority (giảm dần — cái quan trọng đặt trước)
        return selected.sort((a, b) => b.priority - a.priority)
    }

    /**
     * Build prompt cuối cùng
     */
    public build(): PromptGenerationResult {
        const selectedBlocks = this.selectRelevantBlocks()

        const lines: string[] = []

        // ── Header ──
        lines.push(`TASK: Virtual Try-On — Dress the person in Image 1 with garment(s) from other image(s).`)
        lines.push(``)

        // ── Group blocks by category for readability ──
        const coreBlocks = selectedBlocks.filter(b => b.category === 'CORE_DIRECTIVE')
        const envBlocks = selectedBlocks.filter(b => b.category === 'ENVIRONMENT_CONTROL')
        const poseBlocks = selectedBlocks.filter(b => b.category === 'POSE_ADAPTATION')
        const garmentBlocks = selectedBlocks.filter(b => b.category === 'GARMENT_SPECIFIC')
        const physicsBlocks = selectedBlocks.filter(b => b.category === 'PHYSICS_INTERACTION')
        const styleBlocks = selectedBlocks.filter(b => b.category === 'STYLE_CONSTRAINT')
        const qualityBlocks = selectedBlocks.filter(b => b.category === 'IMAGE_QUALITY')
        const correctionBlocks = selectedBlocks.filter(b => b.category === 'NEGATIVE_CORRECTION')

        if (coreBlocks.length > 0) {
            lines.push(`🔴 ABSOLUTE RULES:`)
            coreBlocks.forEach((b, i) => lines.push(`${i + 1}. ${b.content}`))
            lines.push(``)
        }

        if (envBlocks.length > 0) {
            lines.push(`🟡 ENVIRONMENT:`)
            envBlocks.forEach(b => lines.push(`• ${b.content}`))
            lines.push(``)
        }

        if (poseBlocks.length > 0) {
            lines.push(`🟡 POSE ADAPTATION:`)
            poseBlocks.forEach(b => lines.push(`• ${b.content}`))
            lines.push(``)
        }

        if (garmentBlocks.length > 0) {
            lines.push(`🟢 GARMENT RULES:`)
            garmentBlocks.forEach(b => lines.push(`• ${b.content}`))
            lines.push(``)
        }

        if (physicsBlocks.length > 0) {
            lines.push(`🟢 PHYSICS & INTERACTION:`)
            physicsBlocks.forEach(b => lines.push(`• ${b.content}`))
            lines.push(``)
        }

        if (styleBlocks.length > 0) {
            lines.push(`🔵 STYLE CONSTRAINTS:`)
            styleBlocks.forEach(b => lines.push(`• ${b.content}`))
            lines.push(``)
        }

        if (qualityBlocks.length > 0) {
            lines.push(`⚪ IMAGE QUALITY:`)
            qualityBlocks.forEach(b => lines.push(`• ${b.content}`))
            lines.push(``)
        }

        if (correctionBlocks.length > 0) {
            lines.push(`⚠️ CORRECTIONS (from previous failures):`)
            correctionBlocks.forEach(b => lines.push(`• ${b.content}`))
            lines.push(``)
        }

        // ── Quality footer ──
        lines.push(this.intent.quality === 'hd'
            ? `QUALITY: Ultra HD photorealistic. Maximum fabric detail, zero AI artifacts.`
            : `QUALITY: Photorealistic, clean edges, natural appearance.`)

        lines.push(``)
        lines.push(`OUTPUT: Single clean photo of the person from Image 1 wearing the new garment(s). Nothing else.`)

        // ── Negative prompt ──
        const negParts = [
            'deformed, distorted face, wrong anatomy, extra limbs, missing limbs',
            'blurry, low quality, watermark, text overlay, logo overlay',
            'unrealistic proportions, cartoon, anime, illustration, drawing',
            'different person, face swap, age change, gender change',
            'duplicate body parts, multiple people in output',
            'bad hands, mutated hands, fused fingers, too many fingers',
            'collage, side-by-side, split screen, before-after comparison',
        ]

        return {
            finalPrompt: lines.join('\n'),
            negativePrompt: negParts.join(', '),
            appliedBlocks: selectedBlocks.map(b => b.id),
            metadata: {
                inferenceSteps: this.intent.quality === 'hd' ? 75 : 50,
                guidanceScale: this.intent.quality === 'hd' ? 8.5 : 7.5,
            },
        }
    }
}
