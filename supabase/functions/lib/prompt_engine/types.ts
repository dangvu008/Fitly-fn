/**
 * File: prompt_engine/types.ts
 * Purpose: Type definitions cho Pipeline 4 Tầng — Virtual Try-On
 * Layer: Domain
 */

// =============================================
// TẦNG 0 — INPUT ANALYZER OUTPUT
// =============================================

export type ProductSourceType =
    | 'professional_ecommerce' | 'brand_lifestyle' | 'flat_lay'
    | 'mannequin' | 'ghost_mannequin' | 'model_action_pose' | 'model_sitting'
    | 'multi_angle_collage' | 'cropped_partial'
    | 'app_screenshot_shopee' | 'app_screenshot_instagram' | 'app_screenshot_tiktok' | 'app_screenshot_pinterest'
    | 'pinterest_collage' | 'livestream_frame'
    | 'in_store_hanger' | 'in_store_folded' | 'lookbook_multi_model' | 'video_frame' | 'other'

export type NoiseElement =
    | 'price_tag' | 'shopping_ui' | 'heart_icon' | 'rating_stars' | 'app_border'
    | 'username' | 'like_count' | 'share_button' | 'caption_text'
    | 'watermark' | 'brand_logo' | 'banner' | 'livestream_overlay'
    | 'multiple_images_grid' | 'none'

export type ClothingType =
    | 'top' | 'bottom' | 'dress' | 'jumpsuit' | 'outerwear'
    | 'shoes' | 'hat' | 'eyewear' | 'bag' | 'belt' | 'scarf'
    | 'jewelry' | 'watch' | 'other'

/** Alias for VisionAnalyzer compatibility */
export type ClothingCategory = ClothingType

export type PatternType =
    | 'solid' | 'striped' | 'plaid' | 'floral' | 'graphic_print'
    | 'polka_dot' | 'animal_print' | 'tie_dye' | 'ombre' | 'colorblock' | 'other'

export type OutfitType =
    | 'single_top' | 'single_bottom' | 'single_dress' | 'single_outerwear'
    | 'single_accessory' | 'full_outfit_top_bottom'
    | 'full_outfit_with_outerwear' | 'full_outfit_with_accessories'
    | 'multiple_items_need_selection'

export type PersonPhotoType =
    | 'full_body_standing' | 'full_body_natural_pose' | 'upper_body_only'
    | 'face_only' | 'mirror_selfie' | 'group_photo'
    | 'sitting' | 'lying' | 'from_above' | 'from_below'

export type PhotoIssue =
    | 'none' | 'mirror_flip' | 'phone_blocking' | 'heavy_filter'
    | 'low_resolution' | 'harsh_lighting' | 'busy_background'
    | 'person_partially_cut' | 'multiple_people' | 'holding_objects' | 'extreme_angle'

export interface ClothingItemAnalysis {
    type: ClothingType
    sub_type: string
    color_primary: string
    color_secondary: string | null
    pattern: PatternType
    material_appearance: string
    key_details: string
    visibility: 'full' | 'front_only' | 'partial_cropped' | 'obscured_by_noise'
    confidence: 'high' | 'medium' | 'low'
}

export interface ImageAnalysis {
    image_a_product: {
        source_type: ProductSourceType
        noise_elements: NoiseElement[]
        clothing_items: ClothingItemAnalysis[]
        total_outfit_type: OutfitType
        model_in_product: {
            exists: boolean
            pose: string
            body_parts_visible: string[]
        }
    }
    image_b_person: {
        photo_type: PersonPhotoType
        body_visibility: Record<string, boolean>
        current_clothing: Record<string, string | string[] | null>
        pose_details: {
            facing: string
            arms: string
            legs: string
            body_tilt: string
        }
        photo_issues: PhotoIssue[]
        objects_in_frame: string[]
    }
    compatibility_check: {
        can_try_on: boolean
        tryable_items: string[]
        not_tryable_items: string[]
        warnings: string[]
        needs_user_input: boolean
        user_question: string | null
    }
}

// =============================================
// VISION ANALYZER TYPES
// =============================================

/** Scene context inferred from user photo + product images */
export interface SceneContext {
    // User image context
    hasMultiplePeople: boolean
    hasMirrors: boolean
    lighting: 'studio_cool' | 'studio_warm' | 'natural_outdoor' | 'flash' | 'mixed' | 'low_light' | 'unknown'
    isHalfBody: boolean
    isAngledPose: boolean
    isSitting: boolean
    isWearingBulkyClothes: boolean
    isLowQuality: boolean

    // Product image context
    garmentComplexity: 'normal' | 'high'
    needsTextPreservation: boolean
    needsTransparencyPreservation: boolean
    hasWatermark: boolean
    isCroppedProduct: boolean
    hasMultipleVariants: boolean
}

/** How multiple clothing items combine into an outfit */
export type OutfitMode =
    | 'single_item'
    | 'combo_top_bottom'
    | 'full_outfit'
    | 'full_transfer'
    | 'layering'
    | 'dress_outerwear'
    | 'outfit_accessory'
    | 'swap_single'
    | 'accessories_only'

// =============================================
// TẦNG 1 — SMART ROUTER OUTPUT
// =============================================

export interface PassConfig {
    template: string
    modules: string[]
    items?: ClothingItemAnalysis[]
    note?: string
}

export interface RoutingPlan {
    strategy: 'single_pass' | 'multi_pass'
    passes: PassConfig[]
    ask_user: string | null
}

// =============================================
// TẦNG 3 — VALIDATOR OUTPUT
// =============================================

export interface ValidationResult {
    face_identity: { score: number; issues: string }
    body_preservation: { score: number; issues: string }
    clothing_color_match: { score: number; issues: string }
    clothing_design_match: { score: number; issues: string }
    physical_realism: { score: number; issues: string }
    edge_quality: { score: number; issues: string }
    background_preserved: { score: number; issues: string }
    lighting_consistency: { score: number; issues: string }
    overall_score: number
    pass: boolean
    critical_failure: 'face_changed' | 'wrong_clothing' | 'major_artifact' | 'none'
    retry_instruction: string | null
}

// =============================================
// PIPELINE I/O
// =============================================

export interface PipelineResult {
    image: string | null       // URL of result image
    message: string
    status: 'success' | 'need_input' | 'impossible' | 'error'
    warning?: string
    appliedModules?: string[]
    validationScore?: number
    processingTimeMs?: number
}

// =============================================
// MULTI-ITEM MIX & MATCH TYPES
// =============================================

export type SourceLighting =
    | 'studio_cool' | 'studio_warm' | 'natural_outdoor'
    | 'flash' | 'mixed' | 'low_light' | 'unknown'

export type ConflictType =
    | 'same_slot' | 'incompatible_style' | 'physical_impossible'

export type ConflictResolution =
    | 'ask_user' | 'auto_layer' | 'auto_pick_first' | 'auto_pick_primary'

/** Analysis of a single item image in multi-item context */
export interface ItemAnalysis {
    imageIndex: number
    category: ClothingType
    subType: string
    layerLevel: number
    colorPrimary: string
    pattern: PatternType
    materialAppearance: string
    keyDetails: string
    sourceLighting: SourceLighting
    extractionDifficulty: 'easy' | 'moderate' | 'hard'
}

/** Conflict between two items */
export interface ConflictInfo {
    itemA: number          // imageIndex
    itemB: number          // imageIndex
    conflictType: ConflictType
    description: string
    resolution: ConflictResolution
}

/** How two items interact when worn together */
export interface InteractionRule {
    between: [number, number]  // imageIndexes
    rule: string
    styling: string
}

/** Plan for ordering items and dividing into passes */
export interface MultiItemOutfitPlan {
    conflicts: ConflictInfo[]
    layerOrder: Array<{ imageIndex: number; layer: string; level: number }>
    interactions: InteractionRule[]
    itemsToKeep: string[]     // Slots to keep from user's current clothing
    itemsToReplace: string[]  // Slots to replace
    recommendedPasses: number
    passPlan: Array<{ pass: number; items: number[]; description: string }>
    lightingReference: 'person_photo'
    overallFeasibility: 'high' | 'medium' | 'low'
    warnings: string[]
}

/** Full output of MultiItemAnalyzer */
export interface MultiItemAnalysis {
    person: {
        photoType: PersonPhotoType
        currentClothing: Record<string, string | null>
        bodyVisibleParts: string[]
        photoIssues: PhotoIssue[]
    }
    items: ItemAnalysis[]
    outfitPlan: MultiItemOutfitPlan
    needsUserInput: boolean
    userQuestions: Array<{
        text: string
        options: string[]
    }>
}

/** One pass in sequential multi-item execution */
export interface MultiItemPass {
    passNumber: number
    label: string
    itemIndexes: number[]          // Which items (by imageIndex) to apply
    template: string               // Prompt template key
    inputSource: 'ORIGINAL' | 'PREVIOUS_OUTPUT'
    preserveSlots?: string[]       // Slots to keep unchanged (hybrid mode)
    interactionRules?: InteractionRule[]
}

/** User question to resolve a conflict */
export interface UserQuestion {
    text: string
    options: string[]
    relatedItemIndexes: number[]
}

/** Extended validation for multi-item outfits */
export interface MultiItemValidationResult extends ValidationResult {
    outfitHarmony: {
        lightingConsistency: { score: number; issues: string }
        proportionCorrectness: { score: number; issues: string }
        layerCorrectness: { score: number; issues: string }
        interactionCorrectness: { score: number; issues: string }
        overallCohesion: { score: number; issues: string }
        preservedItems: { score: number; issues: string }
    }
}

/** Result of multi-item pipeline execution */
export interface MultiItemPipelineResult extends PipelineResult {
    passesExecuted?: number
    totalPasses?: number
    conflictsResolved?: number
    userQuestions?: UserQuestion[]
}

// =============================================
// PROMPT BUILDER TYPES
// =============================================

export interface UserIntent {
    categories: ClothingCategory[]
    outfitMode: OutfitMode
    quality: 'standard' | 'hd'
}

export type PromptBlockCategory =
    | 'CORE_DIRECTIVE' | 'GARMENT_SPECIFIC' | 'PHYSICS_INTERACTION'
    | 'STYLE_CONSTRAINT' | 'ENVIRONMENT_CONTROL' | 'POSE_ADAPTATION'
    | 'IMAGE_QUALITY' | 'NEGATIVE_CORRECTION'

export interface PromptBlock {
    id: string
    category: PromptBlockCategory
    priority: number
    content: string
    condition?: (ctx: SceneContext, cats: ClothingCategory[], mode: OutfitMode) => boolean
}

export interface PromptGenerationResult {
    finalPrompt: string
    negativePrompt: string
    appliedBlocks: string[]
    metadata: {
        inferenceSteps: number
        guidanceScale: number
    }
}
