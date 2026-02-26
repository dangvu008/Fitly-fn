/**
 * File: sidebar/wardrobe_manager.js
 * Purpose: Quản lý wardrobe (tủ đồ cá nhân) của user
 * Layer: Application
 * 
 * Data Contract:
 * - Input: { imageFile: File, name: string, category: string, sourceUrl?: string }
 * - Output: { items: WardrobeItem[], totalCount: number }
 * 
 * Flow:
 * 1. Upload ảnh quần áo lên Storage
 * 2. Tạo record trong wardrobe_items table
 * 3. Query wardrobe theo category filter
 * 4. Delete item (xóa cả Storage và DB record)
 * 
 * Security Note:
 * - RLS policies đảm bảo user chỉ truy cập wardrobe của mình
 * - Validate category thuộc allowed list
 */

import { supabase, getAuthToken } from '../extension/config.js'

// ============================================================================
// CONSTANTS
// ============================================================================

const ALLOWED_CATEGORIES = ['top', 'bottom', 'dress', 'shoes', 'accessories']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_WARDROBE_ITEMS = 50 // Limit query results

// ============================================================================
// SAVE TO WARDROBE
// ============================================================================

/**
 * Save clothing item to wardrobe
 * 
 * @param {File} imageFile - Ảnh quần áo
 * @param {string} name - Tên item (optional)
 * @param {string} category - Category: top/bottom/dress/shoes/accessories
 * @param {string} sourceUrl - URL nguồn nếu scrape từ website (optional)
 * @returns {Promise<{success: boolean, item?: WardrobeItem, error?: string}>}
 * 
 * WardrobeItem format:
 * {
 *   id: string,
 *   user_id: string,
 *   image_url: string,
 *   name: string,
 *   category: string,
 *   source_url: string,
 *   created_at: string
 * }
 */
export async function saveToWardrobe(imageFile, name, category, sourceUrl = null) {
  try {
    // Step 1: Validate authentication
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập để lưu vào tủ đồ.'
      }
    }
    
    // Step 2: Validate inputs
    const validation = validateWardrobeInput(imageFile, category)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      }
    }
    
    // Step 3: Upload image to Storage
    const uploadResult = await uploadWardrobeImage(imageFile, token)
    if (!uploadResult.success) {
      return uploadResult
    }
    
    // Step 4: Create database record
    const { data, error } = await supabase
      .from('wardrobe_items')
      .insert({
        image_url: uploadResult.imageUrl,
        name: name || 'Untitled',
        category: category,
        source_url: sourceUrl
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating wardrobe record:', error)
      
      // Cleanup: Delete uploaded image
      await deleteStorageFile(uploadResult.storagePath)
      
      return {
        success: false,
        error: 'Không thể lưu item vào tủ đồ. Vui lòng thử lại.'
      }
    }
    
    return {
      success: true,
      item: data
    }
    
  } catch (error) {
    console.error('Exception in saveToWardrobe:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.'
    }
  }
}

// ============================================================================
// GET WARDROBE
// ============================================================================

/**
 * Get wardrobe items với optional category filter
 * 
 * @param {string|null} category - Filter by category (optional)
 * @returns {Promise<{success: boolean, items?: WardrobeItem[], totalCount?: number, error?: string}>}
 */
export async function getWardrobe(category = null) {
  try {
    // Validate authentication
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập để xem tủ đồ.'
      }
    }
    
    // Validate category if provided
    if (category && !ALLOWED_CATEGORIES.includes(category)) {
      return {
        success: false,
        error: `Category không hợp lệ. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`
      }
    }
    
    // Build query
    let query = supabase
      .from('wardrobe_items')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(MAX_WARDROBE_ITEMS)
    
    // Apply category filter if provided
    if (category) {
      query = query.eq('category', category)
    }
    
    // Execute query
    const { data, error, count } = await query
    
    if (error) {
      console.error('Error fetching wardrobe:', error)
      return {
        success: false,
        error: 'Không thể tải tủ đồ. Vui lòng thử lại.'
      }
    }
    
    return {
      success: true,
      items: data || [],
      totalCount: count || 0
    }
    
  } catch (error) {
    console.error('Exception in getWardrobe:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.'
    }
  }
}

/**
 * Get single wardrobe item by ID
 * 
 * @param {string} itemId - Wardrobe item ID
 * @returns {Promise<{success: boolean, item?: WardrobeItem, error?: string}>}
 */
export async function getWardrobeItem(itemId) {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('*')
      .eq('id', itemId)
      .single()
    
    if (error) {
      console.error('Error fetching wardrobe item:', error)
      return {
        success: false,
        error: 'Không tìm thấy item.'
      }
    }
    
    return {
      success: true,
      item: data
    }
    
  } catch (error) {
    console.error('Exception in getWardrobeItem:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

// ============================================================================
// DELETE FROM WARDROBE
// ============================================================================

/**
 * Delete item from wardrobe (xóa cả Storage và DB record)
 * 
 * @param {string} itemId - Wardrobe item ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteFromWardrobe(itemId) {
  try {
    // Validate authentication
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập để xóa item.'
      }
    }
    
    // Step 1: Get item để lấy image_url
    const itemResult = await getWardrobeItem(itemId)
    if (!itemResult.success) {
      return itemResult
    }
    
    const item = itemResult.item
    
    // Step 2: Delete from database
    const { error: dbError } = await supabase
      .from('wardrobe_items')
      .delete()
      .eq('id', itemId)
    
    if (dbError) {
      console.error('Error deleting wardrobe record:', dbError)
      return {
        success: false,
        error: 'Không thể xóa item. Vui lòng thử lại.'
      }
    }
    
    // Step 3: Delete from Storage
    // Extract storage path from image_url
    const storagePath = extractStoragePath(item.image_url)
    if (storagePath) {
      await deleteStorageFile(storagePath)
    }
    
    return {
      success: true
    }
    
  } catch (error) {
    console.error('Exception in deleteFromWardrobe:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.'
    }
  }
}

// ============================================================================
// UPDATE WARDROBE ITEM
// ============================================================================

/**
 * Update wardrobe item (name, category)
 * 
 * @param {string} itemId - Wardrobe item ID
 * @param {object} updates - Fields to update { name?, category? }
 * @returns {Promise<{success: boolean, item?: WardrobeItem, error?: string}>}
 */
export async function updateWardrobeItem(itemId, updates) {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        error: 'Bạn cần đăng nhập.'
      }
    }
    
    // Validate category if provided
    if (updates.category && !ALLOWED_CATEGORIES.includes(updates.category)) {
      return {
        success: false,
        error: `Category không hợp lệ. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`
      }
    }
    
    const { data, error } = await supabase
      .from('wardrobe_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating wardrobe item:', error)
      return {
        success: false,
        error: 'Không thể cập nhật item.'
      }
    }
    
    return {
      success: true,
      item: data
    }
    
  } catch (error) {
    console.error('Exception in updateWardrobeItem:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi.'
    }
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate wardrobe input
 * 
 * @param {File} imageFile
 * @param {string} category
 * @returns {{valid: boolean, error?: string}}
 */
function validateWardrobeInput(imageFile, category) {
  // Validate image file
  if (!imageFile) {
    return { valid: false, error: 'Vui lòng chọn ảnh quần áo.' }
  }
  
  if (!ALLOWED_FILE_TYPES.includes(imageFile.type)) {
    return { valid: false, error: 'Ảnh phải là file JPG hoặc PNG.' }
  }
  
  if (imageFile.size > MAX_FILE_SIZE) {
    const sizeMB = (imageFile.size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `Ảnh quá lớn (${sizeMB}MB). Kích thước tối đa là 10MB.`
    }
  }
  
  // Validate category
  if (!category) {
    return { valid: false, error: 'Vui lòng chọn category.' }
  }
  
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return {
      valid: false,
      error: `Category không hợp lệ. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`
    }
  }
  
  return { valid: true }
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Upload wardrobe image to Storage
 * 
 * @param {File} imageFile
 * @param {string} token - JWT token
 * @returns {Promise<{success: boolean, imageUrl?: string, storagePath?: string, error?: string}>}
 */
async function uploadWardrobeImage(imageFile, token) {
  try {
    // Convert file to base64
    const base64 = await fileToBase64(imageFile)
    
    // Call upload-image Edge Function
    const { data, error } = await supabase.functions.invoke('upload-image', {
      body: {
        image: base64,
        bucket: 'users',
        path: 'wardrobe'
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    
    if (error) {
      console.error('Error uploading wardrobe image:', error)
      return {
        success: false,
        error: 'Không thể upload ảnh. Vui lòng thử lại.'
      }
    }
    
    return {
      success: true,
      imageUrl: data.url,
      storagePath: data.path
    }
    
  } catch (error) {
    console.error('Exception uploading wardrobe image:', error)
    return {
      success: false,
      error: 'Đã xảy ra lỗi khi upload ảnh.'
    }
  }
}

/**
 * Delete file from Storage
 * 
 * @param {string} storagePath - Path trong Storage bucket
 * @returns {Promise<boolean>} true nếu xóa thành công
 */
async function deleteStorageFile(storagePath) {
  try {
    const { error } = await supabase.storage
      .from('users')
      .remove([storagePath])
    
    if (error) {
      console.error('Error deleting storage file:', error)
      return false
    }
    
    return true
    
  } catch (error) {
    console.error('Exception deleting storage file:', error)
    return false
  }
}

/**
 * Extract storage path from image URL
 * 
 * @param {string} imageUrl - Full image URL
 * @returns {string|null} Storage path hoặc null nếu không parse được
 * 
 * Example:
 * Input: https://[project].supabase.co/storage/v1/object/public/users/abc/wardrobe/xyz.jpg
 * Output: abc/wardrobe/xyz.jpg
 */
function extractStoragePath(imageUrl) {
  try {
    const url = new URL(imageUrl)
    const pathParts = url.pathname.split('/storage/v1/object/public/users/')
    if (pathParts.length > 1) {
      return pathParts[1]
    }
    return null
  } catch (error) {
    console.error('Error extracting storage path:', error)
    return null
  }
}

/**
 * Convert File to base64 string
 * 
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Không thể đọc file.'))
    reader.readAsDataURL(file)
  })
}

// ============================================================================
// CATEGORY HELPERS
// ============================================================================

/**
 * Get all allowed categories
 * 
 * @returns {string[]} Array of category strings
 */
export function getAllowedCategories() {
  return [...ALLOWED_CATEGORIES]
}

/**
 * Get category display name (Vietnamese)
 * 
 * @param {string} category - Category code
 * @returns {string} Display name
 */
export function getCategoryDisplayName(category) {
  const displayNames = {
    'top': 'Áo',
    'bottom': 'Quần',
    'dress': 'Váy/Đầm',
    'shoes': 'Giày',
    'accessories': 'Phụ kiện'
  }
  
  return displayNames[category] || category
}

/**
 * Get category icon (emoji)
 * 
 * @param {string} category - Category code
 * @returns {string} Emoji icon
 */
export function getCategoryIcon(category) {
  const icons = {
    'top': '👕',
    'bottom': '👖',
    'dress': '👗',
    'shoes': '👟',
    'accessories': '👜'
  }
  
  return icons[category] || '📦'
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  saveToWardrobe,
  getWardrobe,
  getWardrobeItem,
  deleteFromWardrobe,
  updateWardrobeItem,
  getAllowedCategories,
  getCategoryDisplayName,
  getCategoryIcon
}
