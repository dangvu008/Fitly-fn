
function openGallery() {
    // Delegate to All Outfits page (new full-screen grid view)
    if (window.openAllOutfits) {
        openAllOutfits();
        return;
    }
    // Fallback: old behavior
    const gallerySection = document.getElementById('result-section');
    if (gallerySection) {
        gallerySection.classList.remove('hidden');
        updateGalleryUI();
    }
}

function closeGallery() {
    const gallerySection = document.getElementById('result-section');
    if (gallerySection) {
        gallerySection.classList.add('hidden');
    }
}

/**
 * fetchImageViaBackground - Fetch ảnh qua service worker proxy (bypass CORS)
 * Service worker có host_permissions: <all_urls> nên fetch được mọi URL
 * 
 * Input: imageUrl (string)
 * Output: base64 data URL hoặc null
 *
 * Flow:
 * 1. Gọi FETCH_IMAGE message tới service worker
 * 2. Service worker fetch ảnh, convert sang base64
 * 3. Trả về data URL để set vào img.src
 * 4. Fallback: thử fetch trực tiếp nếu service worker fail
 */
async function fetchImageViaBackground(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('http')) return null;

    // Ưu tiên: proxy qua service worker (bypass CORS hoàn toàn)
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'FETCH_IMAGE',
            data: { imageUrl }
        });
        if (response?.success && response.dataUrl) {
            return response.dataUrl;
        }
    } catch (swError) {
        console.warn('[Fitly] Service worker proxy failed:', swError.message);
    }

    // Fallback: thử fetch trực tiếp (chỉ work cho CORS-friendly URLs)
    try {
        const response = await fetch(imageUrl, {
            mode: 'cors',
            referrerPolicy: 'no-referrer',
        });
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('[Fitly] Direct fetch also failed:', imageUrl, error.message);
        return null;
    }
}

/**
 * fixBrokenImage - Retry loading ảnh bị broken
 * Gán cho window.onerror handler hoặc gọi sau khi render
 *
 * Flow:
 * 1. Check ID -> Thử load tryon_thumbnails từ chrome.storage (ưu tiên)
 * 2. Gọi fetchImageViaBackground (service worker proxy) xử lý lỗi CORS
 * 3. Set img.src = data URL nếu tải cục bộ thành công
 */
async function fixBrokenImage(imgElement) {
    if (!imgElement || imgElement.dataset.fixed) return;
    imgElement.dataset.fixed = 'true';

    // Retry 1: Thử load fallback thumbnail cho tryon results
    const resultId = imgElement.dataset.id ||
        imgElement.closest('.gallery-card')?.dataset?.id ||
        imgElement.closest('.horizontal-outfit-card')?.dataset?.id;

    if (resultId) {
        try {
            const thumbStore = await chrome.storage.local.get('tryon_thumbnails');
            const thumb = thumbStore.tryon_thumbnails?.[resultId];
            if (thumb && imgElement.src !== thumb) {
                imgElement.src = thumb;
                imgElement.style.opacity = '1';
                // Reset fixed để cho phép retry tiếp nếu thumbnail bị lỗi (hiếm khi xảy ra vì là base64)
                imgElement.dataset.fixed = 'false';
                return;
            }
        } catch (_thumbErr) {
            // Non-critical: thumbnail fallback is best-effort
        }
    }

    const originalSrc = imgElement.src;
    if (!originalSrc || !originalSrc.startsWith('http')) return;

    // Show loading state
    imgElement.style.opacity = '0.5';

    fetchImageViaBackground(originalSrc).then(dataUrl => {
        if (dataUrl) {
            imgElement.src = dataUrl;
            imgElement.style.opacity = '1';
        } else {
            imgElement.style.opacity = '0.3';
        }
    }).catch(() => {
        imgElement.style.opacity = '0.3';
    });
}

// Expose helpers
window.fetchImageViaBackground = fetchImageViaBackground;
window.fixBrokenImage = fixBrokenImage;

