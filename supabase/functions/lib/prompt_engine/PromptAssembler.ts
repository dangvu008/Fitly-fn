/**
 * File: prompt_engine/PromptAssembler.ts
 * Purpose: TẦNG 2 — Ghép BASE_PROMPT + template + modules thành prompt hoàn chỉnh
 * Layer: Application
 */

import type { ImageAnalysis, PassConfig, ClothingItemAnalysis, MultiItemPass, ItemAnalysis } from './types.ts'
import { BASE_PROMPT, GARMENT_REPLACEMENT_RULE, OUTERWEAR_WEARING_RULE, CLOTHING_ACTION_MANDATE } from './prompts/base.ts'
import { CORE_TEMPLATES } from './prompts/core_templates.ts'
import { ITEM_MODULES } from './prompts/item_modules.ts'
import { NOISE_MODULES } from './prompts/noise_modules.ts'
import { SOURCE_MODULES } from './prompts/source_modules.ts'
import { PERSON_MODULES } from './prompts/person_modules.ts'
import { MULTI_ITEM_BASE_RULES, MULTI_ITEM_TEMPLATES, ACCESSORY_PLACEMENT } from './prompts/multi_item_prompts.ts'
import { TUCK_STYLES, INTERACTION_MODULES, ADVANCED_STYLING } from './prompts/styling_modules.ts'
import { CORE_STYLES, NICHE_STYLES, CONTEXT_MODULES } from './prompts/style_modules.ts'
import { PRESERVATION_MODULES } from './prompts/preservation_modules.ts'

// =============================================
// ALL MODULES REGISTRY
// =============================================

const ALL_MODULES: Record<string, string> = {
    ...ITEM_MODULES,
    ...NOISE_MODULES,
    ...SOURCE_MODULES,
    ...PERSON_MODULES,
    ...TUCK_STYLES,
    ...INTERACTION_MODULES,
    ...ADVANCED_STYLING,
    ...CORE_STYLES,
    ...NICHE_STYLES,
    ...CONTEXT_MODULES,
    ...PRESERVATION_MODULES,
}

// =============================================
// PROMPT ASSEMBLER
// =============================================

export class PromptAssembler {
    private analysis: ImageAnalysis

    constructor(analysis: ImageAnalysis) {
        this.analysis = analysis
    }

    /**
     * Ghép prompt hoàn chỉnh cho 1 pass
     */
    assemble(pass: PassConfig, step?: number, totalSteps?: number): string {
        const parts: string[] = []

        // 1. BASE PROMPT (luôn đứng đầu)
        parts.push(BASE_PROMPT)

        // 1.1. CLOTHING ACTION MANDATE — always inject after base prompt
        // Forces AI to treat clothing swap as PRIMARY action, not passive render
        parts.push(CLOTHING_ACTION_MANDATE)

        // 1.5. Garment replacement rule — khi thay top/bottom/dress
        const replacingMainGarments = pass.modules.some(m =>
            ['ITEM_TOP', 'ITEM_BOTTOM', 'ITEM_DRESS'].includes(m)
        )
        const isOuterwearPass = pass.modules.includes('ITEM_OUTERWEAR')
        const isSingleOuterwear = isOuterwearPass && !replacingMainGarments
        if (replacingMainGarments && !isOuterwearPass) {
            parts.push(GARMENT_REPLACEMENT_RULE)
        }

        // 1.55. Outerwear wearing rule — khi outerwear là item chính (single pass)
        // Bắt buộc AI phải MẶC outerwear lên người, không được cầm/khoác
        if (isSingleOuterwear) {
            parts.push(OUTERWEAR_WEARING_RULE)
        }

        // 1.6. Preservation modules — protect untargeted body areas
        const preservationModules = this.getPreservationModules(pass.modules)
        for (const mod of preservationModules) {
            if (PRESERVATION_MODULES[mod]) {
                parts.push(PRESERVATION_MODULES[mod])
            }
        }

        // 2. Core template
        const templateText = CORE_TEMPLATES[pass.template]
        if (templateText) {
            parts.push(this.fillVariables(templateText, pass.items, step, totalSteps))
        }

        // 3. Tất cả modules (noise + source + person + item)
        for (const moduleName of pass.modules) {
            const moduleText = ALL_MODULES[moduleName]
            if (moduleText) {
                parts.push(this.fillVariables(moduleText, pass.items, step, totalSteps))
            }
        }

        const finalPrompt = parts.join('\n\n')
        console.log(`[PromptAssembler] Assembled prompt: ${finalPrompt.length} chars, modules: ${pass.modules.join(', ')}`)
        return finalPrompt
    }

    /**
     * Replace {variables} trong prompt text với giá trị thực
     */
    private fillVariables(
        text: string,
        overrideItems?: ClothingItemAnalysis[],
        step?: number,
        totalSteps?: number
    ): string {
        const items = overrideItems || this.analysis.image_a_product.clothing_items

        // Build mô tả items
        const itemDescriptions = items.map(item => {
            let desc = `- ${item.type}: ${item.sub_type} (${item.color_primary}`
            if (item.color_secondary) desc += ` + ${item.color_secondary}`
            desc += `, ${item.pattern}, ${item.material_appearance})`
            if (item.key_details) desc += ` — details: ${item.key_details}`
            return desc
        }).join('\n')

        const firstItem = items[0]

        const bodyAreaMap: Record<string, string> = {
            top: 'upper body',
            bottom: 'lower body',
            dress: 'entire body',
            jumpsuit: 'entire body',
            outerwear: 'upper body (add outerwear layer)',
            shoes: 'footwear',
            hat: 'headwear',
            eyewear: 'eyewear',
            bag: 'bag/accessory',
            belt: 'belt',
            scarf: 'neckwear',
            jewelry: 'jewelry',
            watch: 'wrist accessory',
        }

        const replacements: Record<string, string> = {
            '{item_description}': itemDescriptions || 'clothing item from IMAGE_A',
            '{item_type}': firstItem?.type || 'clothing',
            '{body_area}': bodyAreaMap[firstItem?.type || ''] || 'clothing',
            '{step_number}': String(step || 1),
            '{total_steps}': String(totalSteps || 1),
        }

        let result = text
        for (const [key, value] of Object.entries(replacements)) {
            result = result.replaceAll(key, value)
        }

        return result
    }

    /**
     * Determine which preservation modules to auto-inject based on items being replaced.
     * - Replacing ONLY top → lock lower body + detect garment boundary
     * - Replacing ONLY bottom → lock upper body + detect garment boundary
     * - Replacing top + bottom or dress → only garment boundary (both areas change)
     */
    private getPreservationModules(modules: string[]): string[] {
        const hasTop = modules.includes('ITEM_TOP')
        const hasBottom = modules.includes('ITEM_BOTTOM')
        const hasDress = modules.includes('ITEM_DRESS')
        const hasOuterwear = modules.includes('ITEM_OUTERWEAR')
        const hasShoes = modules.includes('ITEM_SHOES')
        const result: string[] = []

        if (hasDress) {
            // Dress replaces everything — only need boundary detection
            result.push('GARMENT_BOUNDARY_DETECTION')
        } else if (hasTop && !hasBottom) {
            // Only replacing top → protect lower body
            result.push('LOWER_BODY_PRESERVATION')
            result.push('GARMENT_BOUNDARY_DETECTION')
        } else if (hasBottom && !hasTop) {
            // Only replacing bottom → protect upper body
            result.push('UPPER_BODY_PRESERVATION')
            result.push('GARMENT_BOUNDARY_DETECTION')
        } else if (hasTop && hasBottom) {
            // Replacing both → boundary detection only
            result.push('GARMENT_BOUNDARY_DETECTION')
        }

        // Always protect footwear unless explicitly replacing shoes
        if (!hasShoes && (hasTop || hasBottom || hasDress || hasOuterwear)) {
            result.push('FOOTWEAR_PRESERVATION')
        }

        return result
    }
}

// =============================================
// MULTI-ITEM PROMPT ASSEMBLER (standalone)
// =============================================

/**
 * Build a prompt for one multi-item pass.
 * Called by Pipeline.executeMultiItem() for each sequential pass.
 */
export function assembleMultiItemPass(
    pass: MultiItemPass,
    allItems: ItemAnalysis[],
    totalSteps: number,
): string {
    const parts: string[] = []

    // 1. Base rules (always first)
    parts.push(MULTI_ITEM_BASE_RULES)

    // 2. Template for this pass type
    const templateKey = pass.template
    let templateText = MULTI_ITEM_TEMPLATES[templateKey]
    if (!templateText) {
        // Fallback to base clothing template
        templateText = MULTI_ITEM_TEMPLATES['MULTI_ITEM_BASE_CLOTHING']
    }

    // 3. Build item descriptions for this pass
    const passItems = pass.itemIndexes.map(idx => allItems.find(i => i.imageIndex === idx)).filter(Boolean) as ItemAnalysis[]
    const itemDescriptions = passItems.map((item, i) => {
        const imageNum = i + 2 // Image 1 = person, Image 2+ = items
        return `Image ${imageNum}: ${item.subType} (${item.category}) — Color: ${item.colorPrimary}, ` +
            `Pattern: ${item.pattern}, Material: ${item.materialAppearance}. ` +
            `Key details: ${item.keyDetails || 'none'}`
    }).join('\n')

    // 4. Build interaction descriptions
    const interactionText = (pass.interactionRules || []).map(rule => {
        const itemA = allItems.find(i => i.imageIndex === rule.between[0])
        const itemB = allItems.find(i => i.imageIndex === rule.between[1])
        const labelA = itemA ? `${itemA.subType}` : `item ${rule.between[0]}`
        const labelB = itemB ? `${itemB.subType}` : `item ${rule.between[1]}`
        return `• ${labelA} ↔ ${labelB}: ${rule.rule} (styling: ${rule.styling})`
    }).join('\n') || 'No specific interactions for this pass.'

    // 5. Build preserve section (for hybrid mode)
    const preserveSection = pass.preserveSlots && pass.preserveSlots.length > 0
        ? `PRESERVE UNCHANGED: ${pass.preserveSlots.join(', ')} — these must remain pixel-identical to PERSON_IMAGE.`
        : ''

    // 6. Build accessory placement hints
    const placementSection = passItems
        .filter(item => ACCESSORY_PLACEMENT[item.category])
        .map(item => ACCESSORY_PLACEMENT[item.category])
        .join('\n')

    // 7. Build replace descriptions (what to change)
    const replaceDescriptions = passItems
        .map(item => `Replace ${item.category} with: ${item.subType} (${item.colorPrimary})`)
        .join('\n')

    // 8. Fill variables
    const replacements: Record<string, string> = {
        '{step_number}': String(pass.passNumber),
        '{total_steps}': String(totalSteps),
        '{item_descriptions}': itemDescriptions,
        '{interaction_section}': interactionText,
        '{preserve_section}': preserveSection,
        '{replace_descriptions}': replaceDescriptions,
        '{placement_section}': placementSection,
        '{styling_section}': '',
    }

    let filled = templateText
    for (const [key, value] of Object.entries(replacements)) {
        filled = filled.replaceAll(key, value)
    }

    parts.push(filled)

    const finalPrompt = parts.join('\n\n')
    console.log(`[PromptAssembler] Multi-item pass ${pass.passNumber}: ${finalPrompt.length} chars, ${passItems.length} items`)
    return finalPrompt
}
