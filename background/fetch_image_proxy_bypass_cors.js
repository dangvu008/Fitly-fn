/**
 * File: fetch_image_proxy_bypass_cors.js
 * Purpose: Tương tác với ảnh qua Proxy service_worker (chạy dưới dạng extension background) để không bị chặn bởi CORS web source.
 * Layer: Application
 * * Data Contract:
 * - Input: Dữ liệu tải ảnh { imageUrl }
 * - Output: Dữ liệu ảnh trả về base64 ({ dataUrl } hoặc throw Error)
 */

export async function handleFetchImage(data) {
    if (!data?.imageUrl) {
        return { success: false, error: 'imageUrl is required' };
    }
    const url = data.imageUrl;
    if (!url.startsWith('http')) {
        return { success: false, error: 'Only http(s) URLs supported' };
    }
    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'image/*',
            },
        });
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }
        const blob = await response.blob();

        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binary);
        const mimeType = blob.type || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;
        return { success: true, dataUrl };
    } catch (error) {
        console.warn('[Fitly] FETCH_IMAGE proxy error:', url, error.message);
        return { success: false, error: error.message };
    }
}
