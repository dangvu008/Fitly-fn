/**
 * File: construct_gemini_prompt.ts
 * Purpose: Xây dựng prompt động cho Gemini Flash AI dựa trên clothing items và quality
 * Layer: Domain
 * 
 * Data Contract:
 * - Input: { clothingItems: ClothingItem[], quality: 'standard' | 'hd' }
 * - Output: { prompt: string, negativePrompt: string }
 * 
 * Flow:
 * 1. Sort clothing items theo category priority (dress > top > bottom > shoes > accessories)
 * 2. Build base prompt với professional photography instructions
 * 3. Add clothing descriptions cho từng item
 * 4. Add preservation instructions (giữ nguyên face, hair, body)
 * 5. Apply quality-specific parameters
 * 6. Build negative prompt để tránh artifacts
 * 
 * Security Note: Không có sensitive data, chỉ xử lý metadata của clothing items
 */

export interface ClothingItem {
  category: 'top' | 'bottom' | 'dress' | 'shoes' | 'accessories'
  imageUrl: string
  name?: string
  description?: string
}

export interface PromptResult {
  prompt: string
  negativePrompt: string
  numInferenceSteps: number
  guidanceScale: number
}

/**
 * Category priority cho việc sắp xếp clothing items
 * Dress có priority cao nhất vì nó che cả top và bottom
 */
const CATEGORY_PRIORITY: Record<string, number> = {
  dress: 1,
  top: 2,
  bottom: 3,
  shoes: 4,
  accessories: 5,
}

/**
 * Sort clothing items theo category priority
 */
function sortClothingByPriority(items: ClothingItem[]): ClothingItem[] {
  return [...items].sort((a, b) => {
    return CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]
  })
}

/**
 * Generate clothing description text từ items
 */
function generateClothingDescription(items: ClothingItem[]): string {
  const sortedItems = sortClothingByPriority(items)
  
  const descriptions = sortedItems.map((item) => {
    const categoryName = item.category
    const itemName = item.name || item.description || `${categoryName} item`
    return `- ${categoryName}: ${itemName}`
  })
  
  return descriptions.join('\n')
}

/**
 * Construct prompt chính cho Gemini Flash
 * 
 * @param clothingItems - Danh sách clothing items để thử
 * @param quality - Quality level: 'standard' hoặc 'hd'
 * @returns Prompt object với prompt, negativePrompt và parameters
 */
export function constructGeminiPrompt(
  clothingItems: ClothingItem[],
  quality: 'standard' | 'hd'
): PromptResult {
  
  // Base prompt
  const basePrompt = 'Professional fashion photography of a person wearing:'
  
  // Clothing descriptions
  const clothingDescription = generateClothingDescription(clothingItems)
  
  // Preservation instructions - CRITICAL để giữ nguyên đặc điểm người dùng
  const preservationInstructions = `

CRITICAL REQUIREMENTS:
- Keep the person's face EXACTLY the same (facial features, skin tone, expression)
- Keep hair style, color, and length EXACTLY the same
- Keep body proportions, height, and build EXACTLY the same
- Keep the original pose and posture
- Maintain natural lighting conditions
- Natural fabric textures with realistic wrinkles and folds
- Professional studio photography quality
- Realistic shadows and highlights
- Proper garment fit and draping
${quality === 'hd' ? '- Ultra high resolution 4K output with fine details' : '- High resolution output'}
- Photorealistic result, not illustration or cartoon`
  
  // Negative prompt để tránh artifacts
  const negativePrompt = `
deformed, distorted face, wrong anatomy, extra limbs, missing limbs, 
blurry, low quality, watermark, text, logo, signature, 
unrealistic proportions, cartoon, anime, illustration, drawing,
different person, face swap, age change, gender change,
duplicate body parts, floating objects, disconnected limbs,
bad hands, mutated hands, poorly drawn hands,
bad proportions, gross proportions, malformed limbs,
fused fingers, too many fingers, long neck,
ugly, duplicate, morbid, mutilated, out of frame,
extra fingers, mutated hands, poorly drawn face,
mutation, deformed, bad anatomy, bad proportions,
cloned face, disfigured, missing arms, missing legs,
extra arms, extra legs, malformed limbs
`.trim()
  
  // Combine full prompt
  const fullPrompt = `${basePrompt}\n${clothingDescription}\n${preservationInstructions}`
  
  // Quality-specific parameters
  const numInferenceSteps = quality === 'hd' ? 75 : 50
  const guidanceScale = quality === 'hd' ? 8.5 : 7.5
  
  return {
    prompt: fullPrompt.trim(),
    negativePrompt,
    numInferenceSteps,
    guidanceScale,
  }
}

/**
 * Validate clothing items trước khi construct prompt
 */
export function validateClothingItems(items: ClothingItem[]): {
  valid: boolean
  error?: string
} {
  if (!items || items.length === 0) {
    return { valid: false, error: 'Clothing items array is empty' }
  }
  
  if (items.length > 5) {
    return { valid: false, error: 'Maximum 5 clothing items allowed' }
  }
  
  const validCategories = ['top', 'bottom', 'dress', 'shoes', 'accessories']
  for (const item of items) {
    if (!validCategories.includes(item.category)) {
      return { valid: false, error: `Invalid category: ${item.category}` }
    }
    
    if (!item.imageUrl) {
      return { valid: false, error: 'All items must have imageUrl' }
    }
  }
  
  return { valid: true }
}
