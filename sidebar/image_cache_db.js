/**
 * File: image_cache_db.js
 * Purpose: IndexedDB module để cache ảnh quần áo/phụ kiện locally
 * Layer: Infrastructure
 *
 * Data Contract:
 * - Input: image key (string), image URL hoặc data URL
 * - Output: base64 data URL string hoặc null
 *
 * Flow:
 * 1. Mở/tạo IndexedDB 'fitly_image_cache'
 * 2. Store 'images' chứa { key, data, cachedAt, sizeBytes }
 * 3. cacheImage() fetch qua background (tránh CORS) → base64 → lưu IDB
 * 4. getCachedImage() trả về base64 hoặc null
 * 5. Auto cleanup ảnh > 30 ngày
 * 6. Quota limit 50MB — evict oldest khi đầy
 *
 * Fix Log:
 * - [Fix 6] imageUrlToBase64 now proxies fetch through background SW to avoid CORS
 * - [Fix 7] Added MAX_CACHE_SIZE_BYTES quota + evictOldestImages LRU cleanup
 */

const IMAGE_CACHE_DB_NAME = 'fitly_image_cache';
const IMAGE_CACHE_STORE = 'images';
const IMAGE_CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // FIX 7: 50MB quota

let _dbInstance = null;

/**
 * Mở hoặc tạo IndexedDB instance
 */
function openCacheDB() {
    if (_dbInstance) return Promise.resolve(_dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IMAGE_CACHE_DB_NAME, IMAGE_CACHE_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(IMAGE_CACHE_STORE)) {
                const store = db.createObjectStore(IMAGE_CACHE_STORE, { keyPath: 'key' });
                store.createIndex('cachedAt', 'cachedAt', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            _dbInstance = event.target.result;
            resolve(_dbInstance);
        };

        request.onerror = (event) => {
            console.error('[Fitly Cache] DB open error:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Proxy fetch image URL qua Background Service Worker để tránh CORS
 * Background SW dùng cross-origin permissions từ manifest — sidebar thì không.
 *
 * FIX 6: Replaces direct fetch() with a message-based proxy through the SW.
 * Handles: HTTP URLs, data: URLs, blob: URLs
 */
async function imageUrlToBase64(imageUrl) {
    // Đã là data URL → trả về ngay
    if (imageUrl.startsWith('data:')) {
        return imageUrl;
    }

    try {
        // FIX 6: Route through background SW to bypass CORS restrictions
        const result = await chrome.runtime.sendMessage({
            type: 'FETCH_IMAGE_FOR_CACHE',
            imageUrl: imageUrl,
        });

        if (result && result.success && result.base64) {
            return result.base64;
        }

        console.warn('[Fitly Cache] Background proxy returned no data for:', imageUrl, result?.error);
        return null;
    } catch (error) {
        // Fallback: nếu background không hỗ trợ message này, thử fetch trực tiếp
        console.warn('[Fitly Cache] Background proxy unavailable, falling back to direct fetch:', error.message);
        try {
            const response = await fetch(imageUrl, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (fetchErr) {
            console.warn('[Fitly Cache] Direct fetch also failed:', imageUrl, fetchErr.message);
            return null;
        }
    }
}

/**
 * FIX 7: Evict oldest images khi cache vượt quota
 */
async function evictOldestImages(db, requiredBytes) {
    const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(IMAGE_CACHE_STORE);
    const index = store.index('cachedAt');

    // Get all records sorted by oldest first
    const allRecords = await new Promise((resolve) => {
        const req = index.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });

    let freedBytes = 0;
    let evictedCount = 0;

    for (const record of allRecords) {
        if (freedBytes >= requiredBytes) break;
        store.delete(record.key);
        freedBytes += record.sizeBytes || 0;
        evictedCount++;
    }

    if (evictedCount > 0) {
        console.log(`[Fitly Cache] Evicted ${evictedCount} old images to free ${Math.round(freedBytes / 1024)}KB`);
    }
}

/**
 * Cache ảnh vào IndexedDB
 * @param {string} key - Unique key (VD: 'clothing-123456')
 * @param {string} imageUrl - URL hoặc data URL của ảnh
 * @returns {string|null} base64 data URL nếu thành công
 */
async function cacheImage(key, imageUrl) {
    try {
        const base64 = await imageUrlToBase64(imageUrl);
        if (!base64) return null;

        const db = await openCacheDB();

        // FIX 7: Check quota before writing
        const stats = await getCacheStats();
        const newSizeBytes = base64.length;
        if (stats.totalSizeBytes + newSizeBytes > MAX_CACHE_SIZE_BYTES) {
            const toFree = (stats.totalSizeBytes + newSizeBytes) - MAX_CACHE_SIZE_BYTES;
            await evictOldestImages(db, toFree);
        }

        const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
        const store = tx.objectStore(IMAGE_CACHE_STORE);

        const record = {
            key: key,
            data: base64,
            originalUrl: imageUrl,
            cachedAt: Date.now(),
            sizeBytes: base64.length,
        };

        await new Promise((resolve, reject) => {
            const request = store.put(record);
            request.onsuccess = resolve;
            request.onerror = reject;
        });

        console.log('[Fitly Cache] Cached image:', key, `(${Math.round(base64.length / 1024)}KB)`);
        return base64;
    } catch (error) {
        console.warn('[Fitly Cache] Cache failed for:', key, error.message);
        return null;
    }
}

/**
 * Lấy ảnh đã cache từ IndexedDB
 * @param {string} key - Unique key
 * @returns {string|null} base64 data URL hoặc null
 */
async function getCachedImage(key) {
    try {
        const db = await openCacheDB();
        const tx = db.transaction(IMAGE_CACHE_STORE, 'readonly');
        const store = tx.objectStore(IMAGE_CACHE_STORE);

        return new Promise((resolve) => {
            const request = store.get(key);
            request.onsuccess = () => {
                const record = request.result;
                if (!record) {
                    resolve(null);
                    return;
                }

                // Check hết hạn
                if (Date.now() - record.cachedAt > MAX_CACHE_AGE_MS) {
                    removeCachedImage(key); // Xóa ảnh hết hạn
                    resolve(null);
                    return;
                }

                resolve(record.data);
            };
            request.onerror = () => resolve(null);
        });
    } catch (error) {
        console.warn('[Fitly Cache] Get failed for:', key, error.message);
        return null;
    }
}

/**
 * Xóa ảnh khỏi cache
 */
async function removeCachedImage(key) {
    try {
        const db = await openCacheDB();
        const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
        tx.objectStore(IMAGE_CACHE_STORE).delete(key);
    } catch (error) {
        console.warn('[Fitly Cache] Remove failed:', key, error.message);
    }
}

/**
 * Xóa toàn bộ cache
 */
async function clearAllCachedImages() {
    try {
        const db = await openCacheDB();
        const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
        tx.objectStore(IMAGE_CACHE_STORE).clear();
        console.log('[Fitly Cache] All images cleared');
    } catch (error) {
        console.warn('[Fitly Cache] Clear failed:', error.message);
    }
}

/**
 * Dọn dẹp cache cũ (hết hạn)
 */
async function cleanupExpiredCache() {
    try {
        const db = await openCacheDB();
        const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
        const store = tx.objectStore(IMAGE_CACHE_STORE);
        const index = store.index('cachedAt');
        const cutoff = Date.now() - MAX_CACHE_AGE_MS;

        const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
        let removedCount = 0;

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                removedCount++;
                cursor.continue();
            } else if (removedCount > 0) {
                console.log('[Fitly Cache] Cleaned up', removedCount, 'expired images');
            }
        };
    } catch (error) {
        console.warn('[Fitly Cache] Cleanup failed:', error.message);
    }
}

/**
 * Lấy thống kê cache (bao gồm totalSizeBytes để kiểm tra quota)
 */
async function getCacheStats() {
    try {
        const db = await openCacheDB();
        const tx = db.transaction(IMAGE_CACHE_STORE, 'readonly');
        const store = tx.objectStore(IMAGE_CACHE_STORE);

        return new Promise((resolve) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const records = request.result || [];
                const totalSizeBytes = records.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
                resolve({
                    count: records.length,
                    totalSizeBytes: totalSizeBytes, // FIX 7: expose raw bytes for quota check
                    totalSizeMB: Math.round(totalSizeBytes / 1024 / 1024 * 100) / 100,
                    maxSizeMB: Math.round(MAX_CACHE_SIZE_BYTES / 1024 / 1024),
                    usagePercent: Math.round(totalSizeBytes / MAX_CACHE_SIZE_BYTES * 100),
                });
            };
            request.onerror = () => resolve({ count: 0, totalSizeBytes: 0, totalSizeMB: 0 });
        });
    } catch (error) {
        return { count: 0, totalSizeBytes: 0, totalSizeMB: 0 };
    }
}

// Expose globally
window.imageCache = {
    cacheImage,
    getCachedImage,
    removeCachedImage,
    clearAllCachedImages,
    cleanupExpiredCache,
    getCacheStats,
};
