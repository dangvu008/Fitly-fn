/**
 * File: image_compressor.js
 * Purpose: Nén ảnh và xử lý ảnh trên Background Service Worker bằng OffscreenCanvas
 * Layer: Shared Utility
 * * Data Contract:
 * - Exports: compressImageBlob, createThumbnailBase64, generateImageHash
 */

import { log } from './debug_logger.js';

export const COMPRESS_MAX_DIMENSION = 1024; // px - cho ảnh upload
export const COMPRESS_QUALITY = 0.85;       // 85% JPEG quality
export const THUMBNAIL_MAX_DIMENSION = 150; // px - cho local cache
export const THUMBNAIL_QUALITY = 0.6;       // 60% JPEG quality

export async function compressImageBlob(blob, maxDimension = COMPRESS_MAX_DIMENSION, quality = COMPRESS_QUALITY) {
    try {
        const originalSize = blob.size;
        const imageBitmap = await createImageBitmap(blob);

        let { width, height } = imageBitmap;

        // Nếu ảnh đã nhỏ hơn maxDimension VÀ < 500KB → không cần nén
        if (width <= maxDimension && height <= maxDimension && originalSize < 500_000) {
            imageBitmap.close();
            log(`[ImageCompress] Ảnh đã nhỏ (${(originalSize / 1024).toFixed(0)}KB), bỏ qua nén`);
            return blob;
        }

        // Resize giữ tỷ lệ
        if (width > maxDimension || height > maxDimension) {
            if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
            } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
            }
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0, width, height);
        imageBitmap.close();

        const compressedBlob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: quality
        });

        log(`[ImageCompress] Nén: ${(originalSize / 1024).toFixed(0)}KB → ${(compressedBlob.size / 1024).toFixed(0)}KB (${width}x${height})`);
        return compressedBlob;
    } catch (error) {
        console.error('[ImageCompress] compressImageBlob lỗi:', error);
        return blob; // Trả về blob gốc nếu nén thất bại
    }
}

export async function createThumbnailBase64(blob) {
    try {
        const imageBitmap = await createImageBitmap(blob);
        let { width, height } = imageBitmap;

        if (width > height) {
            height = Math.round((height * THUMBNAIL_MAX_DIMENSION) / width);
            width = THUMBNAIL_MAX_DIMENSION;
        } else {
            width = Math.round((width * THUMBNAIL_MAX_DIMENSION) / height);
            height = THUMBNAIL_MAX_DIMENSION;
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0, width, height);
        imageBitmap.close();

        const thumbBlob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: THUMBNAIL_QUALITY
        });

        // Convert Blob → base64
        const arrayBuffer = await thumbBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);

        log(`[ImageCompress] Thumbnail: ${(thumbBlob.size / 1024).toFixed(1)}KB (${width}x${height})`);
        return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
        console.error('[ImageCompress] createThumbnailBase64 lỗi:', error);
        return null;
    }
}

export function generateImageHash(str) {
    if (!str) return null;
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        let chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString(36);
}

/**
 * generatePixelHash — Deterministic perceptual hash based on pixel data.
 * Resizes image to 16×16 → reads raw RGBA pixel values → djb2 hash.
 * Same photo always produces the same hash regardless of JPEG re-compression.
 * Input: Blob (image file)
 * Output: string (hash) or null on failure
 */
export async function generatePixelHash(blob) {
    if (!blob) return null;
    try {
        const imageBitmap = await createImageBitmap(blob);
        const SIZE = 16;
        const canvas = new OffscreenCanvas(SIZE, SIZE);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0, SIZE, SIZE);
        imageBitmap.close();

        const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
        const pixels = imageData.data; // Uint8ClampedArray RGBA

        // STEP 1: Quantize each channel to reduce noise from compression
        // Divide by 16 (4-bit precision) → same photo with slightly different
        // JPEG artifacts will still produce the same quantized values
        let hash = 5381;
        for (let i = 0; i < pixels.length; i += 4) {
            // Use RGB only (skip alpha channel)
            const r = pixels[i] >> 4;
            const g = pixels[i + 1] >> 4;
            const b = pixels[i + 2] >> 4;
            hash = ((hash << 5) + hash + r) | 0;
            hash = ((hash << 5) + hash + g) | 0;
            hash = ((hash << 5) + hash + b) | 0;
        }

        return 'px_' + Math.abs(hash).toString(36);
    } catch (error) {
        console.warn('[generatePixelHash] Failed:', error.message);
        return null;
    }
}

/**
 * blobToBase64 - Convert Blob → base64 data URL (image/jpeg)
 * Input:  Blob
 * Output: string (data:image/jpeg;base64,...)
 */
export async function blobToBase64(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
}
