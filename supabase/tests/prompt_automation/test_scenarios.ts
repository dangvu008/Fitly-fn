/**
 * File: test_scenarios.ts
 * Purpose: Define all test scenarios for automated Gemini prompt testing
 *
 * Covers all 32 scenarios from PromptBuilder:
 *   Group 1 (#1-#11): Single items
 *   Group 2 (#12-#17): Outfit combos
 *   Group 3 (#18-#25): User image variants
 *   Group 4 (#26-#32): Product image variants
 *
 * Each scenario defines:
 *   - Input context (SceneContext, UserIntent, clothing items)
 *   - Expected prompt blocks that MUST appear
 *   - Expected prompt blocks that MUST NOT appear
 *   - Quality assertions on the generated prompt
 */

import type {
    SceneContext,
    UserIntent,
    ClothingCategory,
    OutfitMode,
    ImageAnalysis,
    ClothingItemAnalysis,
} from '../../functions/lib/prompt_engine/types.ts'

// =============================================
// TEST SCENARIO DEFINITION
// =============================================

export interface PromptTestScenario {
    id: string
    name: string
    group: 'single_item' | 'outfit_combo' | 'user_image_variant' | 'product_image_variant'
    description: string

    // Inputs
    userIntent: UserIntent
    sceneContext: SceneContext
    clothingItems: ClothingItemAnalysis[]

    // Assertions on DynamicPromptBuilder output
    expectedBlocks: string[]       // Block IDs that MUST be activated
    forbiddenBlocks: string[]      // Block IDs that MUST NOT be activated
    requiredPhrases: string[]      // Phrases that MUST appear in final prompt
    forbiddenPhrases: string[]     // Phrases that MUST NOT appear in final prompt

    // Quality checks
    minPromptLength: number
    maxPromptLength: number
    mustContainNegativePrompt: boolean
}

// =============================================
// DEFAULT CONTEXTS (reusable baselines)
// =============================================

const DEFAULT_SCENE: SceneContext = {
    hasMultiplePeople: false,
    hasMirrors: false,
    lighting: 'studio_cool',
    isHalfBody: false,
    isAngledPose: false,
    isSitting: false,
    isWearingBulkyClothes: false,
    isLowQuality: false,
    garmentComplexity: 'normal',
    needsTextPreservation: false,
    needsTransparencyPreservation: false,
    hasWatermark: false,
    isCroppedProduct: false,
    hasMultipleVariants: false,
}

function makeItem(
    type: ClothingCategory,
    subType: string,
    color: string = 'black',
    pattern: 'solid' | 'striped' | 'plaid' | 'floral' | 'graphic_print' = 'solid',
    material: string = 'cotton',
): ClothingItemAnalysis {
    return {
        type,
        sub_type: subType,
        color_primary: color,
        color_secondary: null,
        pattern,
        material_appearance: material,
        key_details: '',
        visibility: 'full',
        confidence: 'high',
    }
}

// =============================================
// GROUP 1: SINGLE ITEMS (#1-#11)
// =============================================

const GROUP_1_SCENARIOS: PromptTestScenario[] = [
    {
        id: 'S01_SINGLE_TOP',
        name: '#1 Single Top',
        group: 'single_item',
        description: 'Try on a single top garment',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('top', 't-shirt', 'white', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'CORE_OUTPUT_FORMAT', 'CORE_GARMENT_FIDELITY', 'SINGLE_ITEM_PRESERVE_REST', 'FIT_INTENTION'],
        forbiddenBlocks: ['OUTERWEAR_KEEP_INNER', 'SHOES_FOCUS', 'HAT_FOCUS', 'DRESS_PHYSICS', 'MULTIPLE_PEOPLE_GUARD'],
        requiredPhrases: ['Virtual Try-On', 'PIXEL-IDENTICAL', 'GARMENT FIDELITY', 'SINGLE ITEM MODE'],
        forbiddenPhrases: ['OUTERWEAR RULE', 'SHOES:', 'HAT/CAP:'],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S02_SINGLE_BOTTOM',
        name: '#2 Single Bottom',
        group: 'single_item',
        description: 'Try on a single bottom garment (jeans)',
        userIntent: { categories: ['bottom'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('bottom', 'skinny-jeans', 'blue', 'solid', 'denim')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'FIT_INTENTION'],
        forbiddenBlocks: ['OUTERWEAR_KEEP_INNER', 'DRESS_PHYSICS'],
        requiredPhrases: ['SINGLE ITEM MODE', 'PIXEL-IDENTICAL'],
        forbiddenPhrases: ['OUTERWEAR RULE'],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S03_SINGLE_DRESS',
        name: '#3 Single Dress',
        group: 'single_item',
        description: 'Try on a dress',
        userIntent: { categories: ['dress'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('dress', 'slip-dress', 'red', 'solid', 'silk')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'DRESS_PHYSICS', 'FIT_INTENTION'],
        forbiddenBlocks: ['OUTERWEAR_KEEP_INNER'],
        requiredPhrases: ['DRESS/JUMPSUIT', 'SINGLE ITEM MODE'],
        forbiddenPhrases: ['OUTERWEAR RULE'],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S04_SINGLE_OUTERWEAR',
        name: '#4 Single Outerwear',
        group: 'single_item',
        description: 'Try on outerwear only (no inner top replacement)',
        userIntent: { categories: ['outerwear'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('outerwear', 'blazer', 'navy', 'solid', 'wool')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'OUTERWEAR_KEEP_INNER', 'FIT_INTENTION'],
        forbiddenBlocks: ['DRESS_PHYSICS', 'SHOES_FOCUS'],
        requiredPhrases: ['OUTERWEAR RULE', 'Do NOT remove the inner top', 'SINGLE ITEM MODE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S05_SINGLE_SHOES',
        name: '#5 Single Shoes',
        group: 'single_item',
        description: 'Try on shoes only',
        userIntent: { categories: ['shoes'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('shoes', 'sneakers', 'white', 'solid', 'leather')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'SHOES_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['OUTERWEAR_KEEP_INNER', 'DRESS_PHYSICS'],
        requiredPhrases: ['SHOES:', 'SINGLE ITEM MODE'],
        forbiddenPhrases: ['OUTERWEAR RULE'],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S06_SINGLE_HAT',
        name: '#6 Single Hat',
        group: 'single_item',
        description: 'Try on a hat/cap',
        userIntent: { categories: ['hat'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('hat', 'bucket-hat', 'beige', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'HAT_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SHOES_FOCUS', 'DRESS_PHYSICS'],
        requiredPhrases: ['HAT/CAP:', 'SINGLE ITEM MODE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S07_SINGLE_EYEWEAR',
        name: '#7 Single Eyewear',
        group: 'single_item',
        description: 'Try on glasses/sunglasses',
        userIntent: { categories: ['eyewear'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('eyewear', 'aviator-sunglasses', 'gold', 'solid', 'other')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'EYEWEAR_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SHOES_FOCUS', 'DRESS_PHYSICS', 'OUTERWEAR_KEEP_INNER'],
        requiredPhrases: ['EYEWEAR:', 'nose bridge', 'SINGLE ITEM MODE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S08_SINGLE_BAG',
        name: '#8 Single Bag',
        group: 'single_item',
        description: 'Try on a bag/backpack',
        userIntent: { categories: ['bag'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('bag', 'crossbody-bag', 'brown', 'solid', 'leather')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'BAG_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SHOES_FOCUS', 'DRESS_PHYSICS'],
        requiredPhrases: ['BAG/BACKPACK:', 'SINGLE ITEM MODE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S09_SINGLE_JEWELRY',
        name: '#9 Single Jewelry',
        group: 'single_item',
        description: 'Try on jewelry (necklace)',
        userIntent: { categories: ['jewelry'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('jewelry', 'pendant-necklace', 'gold', 'solid', 'other')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'JEWELRY_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SHOES_FOCUS', 'DRESS_PHYSICS'],
        requiredPhrases: ['JEWELRY/WATCH:', 'TINY items', 'SINGLE ITEM MODE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S10_SINGLE_SCARF',
        name: '#10 Single Scarf',
        group: 'single_item',
        description: 'Try on a scarf',
        userIntent: { categories: ['scarf'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('scarf', 'wool-scarf', 'burgundy', 'plaid', 'wool')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'SCARF_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SHOES_FOCUS', 'DRESS_PHYSICS'],
        requiredPhrases: ['SCARF:', 'SINGLE ITEM MODE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S11_SINGLE_BELT',
        name: '#11 Single Belt',
        group: 'single_item',
        description: 'Try on a belt',
        userIntent: { categories: ['belt'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('belt', 'leather-belt', 'brown', 'solid', 'leather')],
        expectedBlocks: ['CORE_IDENTITY', 'SINGLE_ITEM_PRESERVE_REST', 'BELT_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SHOES_FOCUS', 'DRESS_PHYSICS'],
        requiredPhrases: ['BELT:', 'waistline', 'SINGLE ITEM MODE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
]

// =============================================
// GROUP 2: OUTFIT COMBOS (#12-#17)
// =============================================

const GROUP_2_SCENARIOS: PromptTestScenario[] = [
    {
        id: 'S12_COMBO_TOP_BOTTOM',
        name: '#12 Top + Bottom combo',
        group: 'outfit_combo',
        description: 'Try on top and bottom together',
        userIntent: { categories: ['top', 'bottom'], outfitMode: 'combo_top_bottom', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [
            makeItem('top', 'polo-shirt', 'white', 'solid', 'cotton'),
            makeItem('bottom', 'chinos', 'khaki', 'solid', 'cotton'),
        ],
        expectedBlocks: ['CORE_IDENTITY', 'COMBO_COLOR_BOUNDARY', 'COMBO_FABRIC_PHYSICS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SINGLE_ITEM_PRESERVE_REST', 'SHOES_FOCUS'],
        requiredPhrases: ['MULTI-ITEM COLOR BOUNDARY', 'FABRIC PHYSICS'],
        forbiddenPhrases: ['SINGLE ITEM MODE'],
        minPromptLength: 600,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S13_FULL_OUTFIT',
        name: '#13 Full Outfit',
        group: 'outfit_combo',
        description: 'Full outfit with top, bottom, shoes',
        userIntent: { categories: ['top', 'bottom', 'shoes'], outfitMode: 'full_outfit', quality: 'hd' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [
            makeItem('top', 'blazer', 'charcoal', 'solid', 'wool'),
            makeItem('bottom', 'dress-pants', 'charcoal', 'solid', 'wool'),
            makeItem('shoes', 'oxford-shoes', 'black', 'solid', 'leather'),
        ],
        expectedBlocks: ['CORE_IDENTITY', 'COMBO_COLOR_BOUNDARY', 'COMBO_FABRIC_PHYSICS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SINGLE_ITEM_PRESERVE_REST'],
        requiredPhrases: ['Ultra HD', 'FABRIC PHYSICS'],
        forbiddenPhrases: ['SINGLE ITEM MODE'],
        minPromptLength: 600,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S14_OUTFIT_ACCESSORIES',
        name: '#14 Outfit + Accessories',
        group: 'outfit_combo',
        description: 'Top + bottom + hat',
        userIntent: { categories: ['top', 'bottom', 'hat'], outfitMode: 'outfit_accessory', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [
            makeItem('top', 'casual-shirt', 'blue', 'plaid', 'cotton'),
            makeItem('bottom', 'jeans', 'blue', 'solid', 'denim'),
            makeItem('hat', 'baseball-cap', 'black', 'solid', 'cotton'),
        ],
        expectedBlocks: ['CORE_IDENTITY', 'COMBO_COLOR_BOUNDARY', 'HAT_FOCUS', 'FIT_INTENTION'],
        forbiddenBlocks: ['SINGLE_ITEM_PRESERVE_REST'],
        requiredPhrases: ['HAT/CAP:'],
        forbiddenPhrases: ['SINGLE ITEM MODE'],
        minPromptLength: 600,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S15_LAYERING',
        name: '#15 Layering (top + outerwear)',
        group: 'outfit_combo',
        description: 'Layered outfit with inner top and outerwear',
        userIntent: { categories: ['top', 'outerwear'], outfitMode: 'layering', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [
            makeItem('top', 'turtle-neck', 'cream', 'solid', 'knit'),
            makeItem('outerwear', 'trench-coat', 'camel', 'solid', 'cotton'),
        ],
        expectedBlocks: ['CORE_IDENTITY', 'COMBO_COLOR_BOUNDARY', 'LAYERING_DEPTH', 'FIT_INTENTION'],
        forbiddenBlocks: ['SINGLE_ITEM_PRESERVE_REST'],
        requiredPhrases: ['LAYERING DEPTH', 'inner and outer layers'],
        forbiddenPhrases: ['SINGLE ITEM MODE'],
        minPromptLength: 600,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S16_DRESS_OUTERWEAR',
        name: '#16 Dress + Outerwear',
        group: 'outfit_combo',
        description: 'Dress with jacket layered on top',
        userIntent: { categories: ['dress', 'outerwear'], outfitMode: 'dress_outerwear', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [
            makeItem('dress', 'midi-dress', 'black', 'solid', 'silk'),
            makeItem('outerwear', 'denim-jacket', 'blue', 'solid', 'denim'),
        ],
        expectedBlocks: ['CORE_IDENTITY', 'COMBO_COLOR_BOUNDARY', 'DRESS_PHYSICS', 'LAYERING_DEPTH', 'FIT_INTENTION'],
        forbiddenBlocks: ['SINGLE_ITEM_PRESERVE_REST'],
        requiredPhrases: ['DRESS/JUMPSUIT', 'LAYERING DEPTH'],
        forbiddenPhrases: ['SINGLE ITEM MODE'],
        minPromptLength: 600,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S17_SWAP_SINGLE',
        name: '#17 Swap Single Item in Outfit',
        group: 'outfit_combo',
        description: 'Swap only the top while keeping rest of outfit',
        userIntent: { categories: ['top', 'bottom'], outfitMode: 'swap_single', quality: 'standard' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [
            makeItem('top', 'henley-shirt', 'olive', 'solid', 'cotton'),
            makeItem('bottom', 'cargo-pants', 'black', 'solid', 'cotton'),
        ],
        expectedBlocks: ['CORE_IDENTITY', 'SWAP_SINGLE_ITEM', 'COMBO_COLOR_BOUNDARY', 'FIT_INTENTION'],
        forbiddenBlocks: ['SINGLE_ITEM_PRESERVE_REST'],
        requiredPhrases: ['SWAP MODE'],
        forbiddenPhrases: ['SINGLE ITEM MODE'],
        minPromptLength: 600,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
]

// =============================================
// GROUP 3: USER IMAGE VARIANTS (#18-#25)
// =============================================

const GROUP_3_SCENARIOS: PromptTestScenario[] = [
    {
        id: 'S18_HALF_BODY',
        name: '#18 Half Body Image',
        group: 'user_image_variant',
        description: 'User photo shows only upper body',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, isHalfBody: true },
        clothingItems: [makeItem('top', 'hoodie', 'gray', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'HALF_BODY_LIMIT', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['SITTING_POSE', 'MULTIPLE_PEOPLE_GUARD'],
        requiredPhrases: ['HALF-BODY IMAGE', 'Only the upper body'],
        forbiddenPhrases: ['SITTING POSE'],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S19_ANGLED_POSE',
        name: '#19 Angled Pose',
        group: 'user_image_variant',
        description: 'User photo with angled body pose',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, isAngledPose: true },
        clothingItems: [makeItem('top', 'blouse', 'pink', 'floral', 'chiffon')],
        expectedBlocks: ['CORE_IDENTITY', 'ANGLED_POSE', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['HALF_BODY_LIMIT', 'SITTING_POSE'],
        requiredPhrases: ['ANGLED/ROTATED POSE', 'foreshortening'],
        forbiddenPhrases: ['HALF-BODY IMAGE'],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S20_SITTING_POSE',
        name: '#20 Sitting Pose',
        group: 'user_image_variant',
        description: 'User is seated',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, isSitting: true },
        clothingItems: [makeItem('top', 'button-down-shirt', 'white', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'SITTING_POSE', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['ANGLED_POSE', 'HALF_BODY_LIMIT'],
        requiredPhrases: ['SITTING POSE', 'seated'],
        forbiddenPhrases: ['HALF-BODY IMAGE'],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S21_BULKY_CLOTHES',
        name: '#21 Bulky Existing Clothes',
        group: 'user_image_variant',
        description: 'User wearing thick/oversized clothes that need mental removal',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, isWearingBulkyClothes: true },
        clothingItems: [makeItem('top', 'tank-top', 'white', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'BULKY_CLOTHES_REMOVAL', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['SITTING_POSE'],
        requiredPhrases: ['EXISTING BULKY CLOTHING', 'mentally remove'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S22_MULTIPLE_PEOPLE',
        name: '#22 Multiple People in Image',
        group: 'user_image_variant',
        description: 'Photo contains more than one person',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, hasMultiplePeople: true },
        clothingItems: [makeItem('top', 'v-neck-tee', 'black', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'MULTIPLE_PEOPLE_GUARD', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['SITTING_POSE'],
        requiredPhrases: ['MULTIPLE PEOPLE DETECTED', 'primary subject'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S23_LOW_QUALITY',
        name: '#23 Low Quality Source Image',
        group: 'user_image_variant',
        description: 'User photo has low resolution or poor lighting',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, isLowQuality: true },
        clothingItems: [makeItem('top', 'crop-top', 'yellow', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'LOW_QUALITY_IMAGE', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: [],
        requiredPhrases: ['LOW QUALITY SOURCE'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S24_MIRROR_IMAGE',
        name: '#24 Mirror in Image',
        group: 'user_image_variant',
        description: 'Photo contains a mirror reflection',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, hasMirrors: true },
        clothingItems: [makeItem('top', 'sweater', 'green', 'solid', 'knit')],
        expectedBlocks: ['CORE_IDENTITY', 'MIRROR_REFLECTION', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: [],
        requiredPhrases: ['MIRROR DETECTED', 'reflection'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S25_HARSH_LIGHTING',
        name: '#25 Harsh Lighting',
        group: 'user_image_variant',
        description: 'Photo with harsh flash lighting',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, lighting: 'flash' },
        clothingItems: [makeItem('top', 'polo-shirt', 'navy', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'HARSH_LIGHTING', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['COMPLEX_BACKGROUND'],
        requiredPhrases: ['HARSH LIGHTING', 'hard shadows'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
]

// =============================================
// GROUP 4: PRODUCT IMAGE VARIANTS (#26-#32)
// =============================================

const GROUP_4_SCENARIOS: PromptTestScenario[] = [
    {
        id: 'S26_WATERMARK',
        name: '#26 Watermark on Product Image',
        group: 'product_image_variant',
        description: 'Product image has watermarks/logos',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, hasWatermark: true },
        clothingItems: [makeItem('top', 'casual-shirt', 'white', 'striped', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'WATERMARK_IGNORE', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['CROPPED_PRODUCT'],
        requiredPhrases: ['WATERMARK/LOGO OVERLAY', 'IGNORE and remove'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S27_CROPPED_PRODUCT',
        name: '#27 Cropped Product Image',
        group: 'product_image_variant',
        description: 'Product image is partially cropped',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, isCroppedProduct: true },
        clothingItems: [makeItem('top', 'cardigan', 'gray', 'solid', 'knit')],
        expectedBlocks: ['CORE_IDENTITY', 'CROPPED_PRODUCT', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: ['WATERMARK_IGNORE'],
        requiredPhrases: ['CROPPED PRODUCT IMAGE', 'infer the missing portions'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S28_MULTI_VARIANT',
        name: '#28 Multi-Variant Product Image',
        group: 'product_image_variant',
        description: 'Product image shows multiple color variants',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, hasMultipleVariants: true },
        clothingItems: [makeItem('top', 'basic-tee', 'black', 'solid', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'MULTI_VARIANT', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: [],
        requiredPhrases: ['MULTIPLE VARIANTS', 'most prominent'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S29_TEXT_ON_GARMENT',
        name: '#29 Text/Logo on Garment',
        group: 'product_image_variant',
        description: 'Garment has text or logos that must be preserved',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, needsTextPreservation: true },
        clothingItems: [makeItem('top', 'graphic-tee', 'white', 'graphic_print', 'cotton')],
        expectedBlocks: ['CORE_IDENTITY', 'TEXT_PRESERVATION', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: [],
        requiredPhrases: ['TEXT/LOGO ON GARMENT', 'same font, same size'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S30_SHEER_MATERIAL',
        name: '#30 Sheer/Transparent Fabric',
        group: 'product_image_variant',
        description: 'Garment has transparent or sheer fabric',
        userIntent: { categories: ['top'], outfitMode: 'single_item', quality: 'standard' },
        sceneContext: { ...DEFAULT_SCENE, needsTransparencyPreservation: true },
        clothingItems: [makeItem('top', 'lace-blouse', 'white', 'other', 'chiffon')],
        expectedBlocks: ['CORE_IDENTITY', 'SHEER_MATERIAL', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: [],
        requiredPhrases: ['SHEER/TRANSPARENT FABRIC', 'transparency'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S31_COMPLEX_COMBO',
        name: '#31 Complex: Multiple contexts combined',
        group: 'product_image_variant',
        description: 'Multiple challenging conditions at once',
        userIntent: { categories: ['top', 'bottom'], outfitMode: 'combo_top_bottom', quality: 'hd' },
        sceneContext: { ...DEFAULT_SCENE, hasWatermark: true, isAngledPose: true, hasMultiplePeople: true },
        clothingItems: [
            makeItem('top', 'graphic-tee', 'black', 'graphic_print', 'cotton'),
            makeItem('bottom', 'shorts', 'blue', 'solid', 'denim'),
        ],
        expectedBlocks: ['CORE_IDENTITY', 'WATERMARK_IGNORE', 'ANGLED_POSE', 'MULTIPLE_PEOPLE_GUARD', 'COMBO_COLOR_BOUNDARY'],
        forbiddenBlocks: ['SINGLE_ITEM_PRESERVE_REST'],
        requiredPhrases: ['WATERMARK/LOGO OVERLAY', 'ANGLED/ROTATED POSE', 'MULTIPLE PEOPLE DETECTED', 'Ultra HD'],
        forbiddenPhrases: ['SINGLE ITEM MODE'],
        minPromptLength: 800,
        maxPromptLength: 6000,
        mustContainNegativePrompt: true,
    },
    {
        id: 'S32_HD_QUALITY',
        name: '#32 HD Quality Mode',
        group: 'product_image_variant',
        description: 'HD quality setting verification',
        userIntent: { categories: ['dress'], outfitMode: 'single_item', quality: 'hd' },
        sceneContext: DEFAULT_SCENE,
        clothingItems: [makeItem('dress', 'evening-gown', 'red', 'solid', 'silk')],
        expectedBlocks: ['CORE_IDENTITY', 'DRESS_PHYSICS', 'SINGLE_ITEM_PRESERVE_REST'],
        forbiddenBlocks: [],
        requiredPhrases: ['Ultra HD', 'Maximum fabric detail'],
        forbiddenPhrases: [],
        minPromptLength: 500,
        maxPromptLength: 5000,
        mustContainNegativePrompt: true,
    },
]

// =============================================
// EXPORT ALL SCENARIOS
// =============================================

export const ALL_SCENARIOS: PromptTestScenario[] = [
    ...GROUP_1_SCENARIOS,
    ...GROUP_2_SCENARIOS,
    ...GROUP_3_SCENARIOS,
    ...GROUP_4_SCENARIOS,
]

export function getScenariosByGroup(group: PromptTestScenario['group']): PromptTestScenario[] {
    return ALL_SCENARIOS.filter(s => s.group === group)
}

export function getScenarioById(id: string): PromptTestScenario | undefined {
    return ALL_SCENARIOS.find(s => s.id === id)
}
