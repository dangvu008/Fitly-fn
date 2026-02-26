/**
 * File: user_model_manager.js
 * Purpose: Quản lý các ảnh người mẫu tuỳ chỉnh (User Models)
 * Layer: Application / Feature
 * Data Contract:
 * - Exports: handleGetUserModels, handleAddUserModel, handleDeleteUserModel, handleSetDefaultModel, handleGetDefaultModel, handleSaveModelImage, handleGetModelImage
 * Fix Log:
 * - [Fix 2] Removed duplicate generateImageHash, use generateImageHash from image_compressor.js
 * - [Fix 3] Cleanup orphan model_image key on delete/reset default
 * - [Fix 1] Fixed race condition: now correctly writes mergedModels (not models) to storage
 */

import { isDemoMode, getAuthToken } from './auth_state_manager.js';
import { demoState, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL as SUPABASE_URL } from './ENVIRONMENT_CONFIG.js';
import { compressImageBlob, createThumbnailBase64, generateImageHash, generatePixelHash, blobToBase64, COMPRESS_MAX_DIMENSION, COMPRESS_QUALITY } from './image_compressor.js';
import { log } from './debug_logger.js';

const MAX_USER_MODELS = 10;

/**
 * Normalize URL để so sánh dedup: bỏ query params, trailing slashes, lowercase
 */
function normalizeModelUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    try {
        const u = new URL(url);
        // Keep only origin + pathname, strip query params & hash
        return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
    } catch {
        return url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    }
}

async function uploadModelImageToStorage(dataUrl, userId, modelId, imageHash = null) {
    try {
        if (!dataUrl || !dataUrl.startsWith('data:')) {
            log('[uploadModelImageToStorage] Not a data URL, skipping upload');
            return { publicUrl: dataUrl, thumbnail: null };
        }

        const response = await fetch(dataUrl);
        const originalBlob = await response.blob();
        log(`[uploadModelImageToStorage] Ảnh gốc: ${(originalBlob.size / 1024).toFixed(0)}KB`);

        const compressedBlob = await compressImageBlob(originalBlob, COMPRESS_MAX_DIMENSION, COMPRESS_QUALITY);
        const thumbnail = await createThumbnailBase64(originalBlob);

        // FIX DUPLICATE: Dùng hash-based filename thay vì UUID ngẫu nhiên
        // Cùng ảnh → cùng hash → cùng path → Storage upsert KHÔNG tạo file mới
        // → URL giống nhau → DB dedup check sẽ catch được → tránh duplicate rows
        const safeHash = imageHash
            ? String(imageHash).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
            : modelId;
        const filePath = `${userId}/${safeHash}.jpg`;

        const accessToken = await getAuthToken();

        if (!accessToken) {
            console.warn('[uploadModelImageToStorage] No auth token, cannot upload to Storage');
            return null;
        }

        const uploadResponse = await fetch(
            `${SUPABASE_URL}/storage/v1/object/user-models/${filePath}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'image/jpeg',
                    'x-upsert': 'true',
                },
                body: compressedBlob,
            }
        );

        if (!uploadResponse.ok) {
            const errText = await uploadResponse.text();
            console.error('[uploadModelImageToStorage] Upload failed:', uploadResponse.status, errText);
            return null;
        }

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/user-models/${filePath}`;
        log('[uploadModelImageToStorage] Uploaded (nén) successfully:', publicUrl);
        return { publicUrl, thumbnail };
    } catch (error) {
        console.error('[uploadModelImageToStorage] Error:', error);
        return null;
    }
}


export async function handleGetUserModels() {
    try {
        const storage = await chrome.storage.local.get(['user_models', 'default_model_id']);
        let models = storage.user_models || [];
        let defaultModelId = storage.default_model_id || null;

        // STEP: Dedup local models bằng normalized URL + hash
        const uniqueModels = [];
        const seenNormUrls = new Set();
        const seenHashes = new Set();

        for (const model of models) {
            if (!model || !model.url) continue;
            const normUrl = normalizeModelUrl(model.url);
            const hash = model.hash || null;
            const pxHash = model.pixelHash || null;

            // Skip nếu URL đã seen, hash đã seen, hoặc pixelHash đã seen
            if (seenNormUrls.has(normUrl)) continue;
            if (hash && seenHashes.has(hash)) continue;
            if (pxHash && seenHashes.has(pxHash)) continue;

            seenNormUrls.add(normUrl);
            if (hash) seenHashes.add(hash);
            if (pxHash) seenHashes.add(pxHash);
            uniqueModels.push(model);
        }

        models = uniqueModels;

        if (uniqueModels.length < (storage.user_models || []).length) {
            await chrome.storage.local.set({ user_models: uniqueModels });
        }


        const demoMode = await isDemoMode();
        if (!demoMode) {
            try {
                const currentToken = await getAuthToken();
                const userData = await chrome.storage.local.get(['user']);

                // P2 FIX: Fetch public + user models in parallel
                const [publicModels, userModels] = await Promise.all([
                    fetch(
                        `${SUPABASE_URL}/rest/v1/user_models?user_id=is.null&select=id,image_url,label,gender,display_order,created_at&order=display_order.asc,created_at.asc`,
                        { headers: { 'apikey': SUPABASE_AUTH_KEY } }
                    ).then(r => r.ok ? r.json() : []).catch(() => []),
                    currentToken && userData.user?.id
                        ? fetch(
                            `${SUPABASE_URL}/rest/v1/user_models?user_id=eq.${userData.user.id}&select=id,image_url,label,source,is_default,created_at&order=is_default.desc,created_at.desc&limit=20`,
                            { headers: { 'Authorization': `Bearer ${currentToken}`, 'apikey': SUPABASE_AUTH_KEY } }
                        ).then(r => r.ok ? r.json() : []).catch(() => [])
                        : Promise.resolve([]),
                ]);

                const cloudModels = [...userModels, ...publicModels];

                // CLEANUP: Delete duplicate rows in DB (same storage file, different DB rows)
                // This handles existing duplicates created before the hash-based filename fix
                if (userModels.length > 1 && currentToken && userData.user?.id) {
                    try {
                        // Group user models by storage key (filename without path prefix & extension)
                        const userModelsByStorageKey = new Map();
                        for (const m of userModels) {
                            if (!m.image_url) continue;
                            // Extract stable part: last segment of path before query
                            const urlPath = m.image_url.split('?')[0];
                            const storageKey = urlPath.split('/').pop() || m.image_url;
                            if (!userModelsByStorageKey.has(storageKey)) {
                                userModelsByStorageKey.set(storageKey, []);
                            }
                            userModelsByStorageKey.get(storageKey).push(m);
                        }

                        // For each group with duplicates, keep oldest, delete the rest async
                        const rowsToDelete = [];
                        userModelsByStorageKey.forEach((group) => {
                            if (group.length <= 1) return;
                            // Sort by created_at ascending → oldest first
                            group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                            // Keep [0], delete the rest
                            rowsToDelete.push(...group.slice(1));
                        });

                        if (rowsToDelete.length > 0) {
                            log('[handleGetUserModels] Cleaning up', rowsToDelete.length, 'duplicate DB rows...');
                            // Fire-and-forget async delete — không block UI
                            Promise.all(rowsToDelete.map(row =>
                                fetch(`${SUPABASE_URL}/rest/v1/user_models?id=eq.${row.id}`, {
                                    method: 'DELETE',
                                    headers: {
                                        'Authorization': `Bearer ${currentToken}`,
                                        'apikey': SUPABASE_AUTH_KEY
                                    }
                                }).catch(e => console.warn('[Cleanup] Failed to delete duplicate row:', row.id, e.message))
                            )).then(() => log('[handleGetUserModels] Duplicate cleanup done.'));
                        }
                    } catch (cleanupErr) {
                        // Non-critical: cleanup failure is harmless
                        console.warn('[handleGetUserModels] Duplicate cleanup error (non-critical):', cleanupErr.message);
                    }
                }


                if (cloudModels.length > 0) {
                    const mappedModels = cloudModels
                        .filter(m => m && m.image_url && !m.image_url.startsWith('data:'))
                        .map(m => ({
                            id: m.id,
                            url: m.image_url,
                            imageUrl: m.image_url,
                            label: m.label,
                            source: m.source,
                            isDefault: m.is_default,
                            createdAt: m.created_at
                        }));

                    // Dedup cloud models bằng normalized URL + hash
                    const uniqueCloudModels = [];
                    const cloudSeenNormUrls = new Set();
                    const cloudSeenHashes = new Set();

                    for (const model of mappedModels) {
                        const normUrl = normalizeModelUrl(model.url);
                        const localMatch = models.find(m => m.id === model.id && m.hash);
                        if (localMatch) {
                            model.hash = localMatch.hash;
                        }
                        const hash = model.hash || null;

                        // Skip nếu normalized URL hoặc hash đã tồn tại
                        if (cloudSeenNormUrls.has(normUrl)) continue;
                        if (hash && cloudSeenHashes.has(hash)) continue;

                        cloudSeenNormUrls.add(normUrl);
                        if (hash) cloudSeenHashes.add(hash);
                        uniqueCloudModels.push(model);
                    }

                    // Build lookup sets cho cloud models (dùng normalized URL + hash)
                    const cloudModelIds = new Set(uniqueCloudModels.map(m => m.id));
                    const cloudNormUrls = new Set();
                    const cloudHashes = new Set();
                    uniqueCloudModels.forEach(m => {
                        if (m.url) cloudNormUrls.add(normalizeModelUrl(m.url));
                        if (m.imageUrl) cloudNormUrls.add(normalizeModelUrl(m.imageUrl));
                        if (m.hash) cloudHashes.add(m.hash);
                    });

                    // Filter local models: chỉ giữ nếu chưa có trên cloud (by ID, URL, hoặc hash)
                    const localRetainedModels = models.filter(m => {
                        if (cloudModelIds.has(m.id)) return false;

                        const localNormUrl = normalizeModelUrl(m.url || m.imageUrl);
                        if (localNormUrl && cloudNormUrls.has(localNormUrl)) return false;

                        // Check hash collision: cùng ảnh nhưng khác URL
                        if (m.hash && cloudHashes.has(m.hash)) return false;

                        return (m.url || m.imageUrl)?.startsWith('data:') ||
                            (Date.now() - (m.createdAt || 0) < 60000);
                    });

                    let mergedModels = [...localRetainedModels, ...uniqueCloudModels];

                    // Final dedup bằng normalized URL + hash
                    const finalSeenNormUrls = new Set();
                    const finalSeenHashes = new Set();
                    mergedModels = mergedModels.filter(m => {
                        const url = m.url || m.imageUrl;
                        if (!url) return false;
                        const normUrl = normalizeModelUrl(url);
                        const hash = m.hash || null;

                        if (finalSeenNormUrls.has(normUrl)) return false;
                        if (hash && finalSeenHashes.has(hash)) return false;

                        finalSeenNormUrls.add(normUrl);
                        if (hash) finalSeenHashes.add(hash);
                        return true;
                    });

                    mergedModels.sort((a, b) => {
                        if (a.isDefault && !b.isDefault) return -1;
                        if (!a.isDefault && b.isDefault) return 1;

                        const timeA = (typeof a.createdAt === 'string') ? new Date(a.createdAt).getTime() : (a.createdAt || 0);
                        const timeB = (typeof b.createdAt === 'string') ? new Date(b.createdAt).getTime() : (b.createdAt || 0);
                        return timeB - timeA;
                    });

                    // FIX 1: Use mergedModels (not models) to slice — prevents race condition
                    if (mergedModels.length > 0) {
                        models = mergedModels.slice(0, MAX_USER_MODELS);
                    }

                    const defaultModel = cloudModels.find(m => m.is_default);
                    if (defaultModel) {
                        defaultModelId = defaultModel.id;
                    } else if (!defaultModelId && models.length > 0) {
                        defaultModelId = models[0].id;
                    }

                    // FIX 1: Write `models` + sync model_image key để loadModelImage() luôn có data
                    if (models.length > 0) {
                        const storageUpdate = { user_models: models, default_model_id: defaultModelId };

                        // Sync model_image: đảm bảo ảnh default luôn có sẵn cho sidebar
                        if (defaultModelId) {
                            const defaultMdl = models.find(m => m.id === defaultModelId);
                            if (defaultMdl) {
                                storageUpdate.model_image = defaultMdl.url || defaultMdl.imageUrl;
                            }
                        } else if (models.length > 0) {
                            storageUpdate.model_image = models[0].url || models[0].imageUrl;
                        }

                        await chrome.storage.local.set(storageUpdate);
                    }
                }
            } catch (error) {
                console.warn('[Fitly] Failed to fetch models from cloud, using local:', error);
            }
        }

        let thumbnails = {};
        try {
            const thumbStore = await chrome.storage.local.get('model_thumbnails');
            thumbnails = thumbStore.model_thumbnails || {};
        } catch (thumbLoadErr) {
            // Non-critical: thumbnails are just a cache optimization
            console.warn('[handleGetUserModels] Thumbnail cache load failed:', thumbLoadErr.message);
        }

        return {
            success: true,
            models,
            defaultModelId,
            thumbnails
        };
    } catch (error) {
        console.error('[SW:ModelLoad] Error in handleGetUserModels:', error);
        return {
            success: false,
            error: error.message,
            models: [],
            defaultModelId: null
        };
    }
}

export async function handleAddUserModel(data) {
    if (!data.imageUrl) {
        return { success: false, error: 'Image URL is required' };
    }

    const storageData = await chrome.storage.local.get(['user_models', 'default_model_id']);
    let models = storageData.user_models || [];

    // STEP 0: Compute pixel-based hash (deterministic, compression-invariant)
    // This hash is based on actual pixel data, not the base64 string,
    // so the same photo always produces the same hash even after re-compression.
    let pixelHash = null;
    const stringHash = data.originalHash || generateImageHash(data.imageUrl);
    if (data.imageUrl.startsWith('data:')) {
        try {
            const resp = await fetch(data.imageUrl);
            const origBlob = await resp.blob();
            pixelHash = await generatePixelHash(origBlob);
            log('[Fitly] Pixel hash computed:', pixelHash);
        } catch (hashErr) {
            console.warn('[handleAddUserModel] Pixel hash failed, using string hash:', hashErr.message);
        }
    }
    const imageHash = pixelHash || stringHash;

    // STEP 1: Check local cache dedup (URL + pixel hash + string hash)
    const localExists = models.find(m =>
        m.url === data.imageUrl || m.imageUrl === data.imageUrl ||
        (m.hash && m.hash === imageHash) ||
        (pixelHash && m.pixelHash && m.pixelHash === pixelHash)
    );
    if (localExists) {
        log('[Fitly] Model already exists in local cache, skipping:', localExists.id);
        return { success: true, model: localExists, message: 'Already exists' };
    }

    const modelId = crypto.randomUUID();

    let imageUrlToSave = data.imageUrl;
    let thumbnailData = null;
    const demoMode = await isDemoMode();
    if (!demoMode && data.imageUrl.startsWith('data:')) {
        const currentToken = await getAuthToken();
        const userData = await chrome.storage.local.get(['user']);
        const userId = userData.user?.id;
        if (userId) {
            const uploadResult = await uploadModelImageToStorage(data.imageUrl, userId, modelId, imageHash);
            if (uploadResult && uploadResult.publicUrl) {
                imageUrlToSave = uploadResult.publicUrl;
                thumbnailData = uploadResult.thumbnail;
                log('[Fitly] Model image uploaded (nén) to Storage:', imageUrlToSave);

                // STEP 2: DB dedup check — prevents duplicate rows when local storage cleared
                // Same image uploaded again gets a new modelId but same Storage path (upsert:true)
                // so the actual file is the same. Check if DB already has this URL.
                try {
                    const encodedUrl = encodeURIComponent(imageUrlToSave);
                    const dbCheck = await fetch(
                        `${SUPABASE_URL}/rest/v1/user_models?user_id=eq.${userId}&image_url=eq.${encodedUrl}&select=id,image_url,is_default,created_at&limit=1`,
                        { headers: { 'Authorization': `Bearer ${currentToken}`, 'apikey': SUPABASE_AUTH_KEY } }
                    );
                    if (dbCheck.ok) {
                        const existing = await dbCheck.json();
                        if (existing && existing.length > 0) {
                            log('[Fitly] Image already in DB (same Storage URL), reusing row:', existing[0].id);
                            const existingModel = {
                                id: existing[0].id,
                                url: existing[0].image_url,
                                imageUrl: existing[0].image_url,
                                hash: imageHash,
                                source: 'upload',
                                isDefault: existing[0].is_default,
                                createdAt: existing[0].created_at || Date.now()
                            };
                            // Sync back to local cache so next call doesn't miss it
                            const seenIds = new Set();
                            const mergedModels = [existingModel, ...models].filter(m => {
                                if (seenIds.has(m.id)) return false;
                                seenIds.add(m.id);
                                return true;
                            }).slice(0, MAX_USER_MODELS);
                            await chrome.storage.local.set({ user_models: mergedModels });
                            return { success: true, model: existingModel, message: 'Reused existing DB row' };
                        }
                    }
                } catch (dbCheckErr) {
                    // Non-critical: continue with normal insert if DB check fails
                    console.warn('[handleAddUserModel] DB dedup check failed (non-critical):', dbCheckErr.message);
                }

            } else {
                console.warn('[Fitly] Storage upload failed, nén ảnh rồi lưu local');
                try {
                    const resp = await fetch(data.imageUrl);
                    const origBlob = await resp.blob();
                    const compBlob = await compressImageBlob(origBlob, COMPRESS_MAX_DIMENSION, COMPRESS_QUALITY);
                    imageUrlToSave = await blobToBase64(compBlob);
                    thumbnailData = await createThumbnailBase64(origBlob);
                } catch (compErr) {
                    console.error('[Fitly] Nén local thất bại, giữ nguyên:', compErr);
                }
            }
        }
    } else if (data.imageUrl.startsWith('data:')) {
        try {
            const resp = await fetch(data.imageUrl);
            const origBlob = await resp.blob();
            const compBlob = await compressImageBlob(origBlob, COMPRESS_MAX_DIMENSION, COMPRESS_QUALITY);
            imageUrlToSave = await blobToBase64(compBlob);
            thumbnailData = await createThumbnailBase64(origBlob);
        } catch (compressErr) {
            console.warn('[handleAddUserModel] Demo compression failed, keeping original:', compressErr.message);
        }
    }

    const newModel = {
        id: modelId,
        url: imageUrlToSave,
        imageUrl: imageUrlToSave,
        hash: imageHash,
        pixelHash: pixelHash,
        label: data.label || 'Ảnh ' + (models.length + 1),
        source: data.source || 'upload',
        createdAt: Date.now(),
    };

    models.unshift(newModel);
    models = models.slice(0, MAX_USER_MODELS);
    await chrome.storage.local.set({ user_models: models });

    if (thumbnailData) {
        try {
            const thumbStore = await chrome.storage.local.get('model_thumbnails');
            const thumbnails = thumbStore.model_thumbnails || {};
            thumbnails[modelId] = thumbnailData;
            const keys = Object.keys(thumbnails);
            if (keys.length > MAX_USER_MODELS) {
                const removeKeys = keys.slice(0, keys.length - MAX_USER_MODELS);
                removeKeys.forEach(k => delete thumbnails[k]);
            }
            await chrome.storage.local.set({ model_thumbnails: thumbnails });
            log(`[Fitly] Thumbnail cached cho model ${modelId}`);
        } catch (thumbErr) {
            console.warn('[Fitly] Lưu thumbnail cache thất bại:', thumbErr);
        }
    }

    const isFirst = models.length === 1 || !storageData.default_model_id;
    if (isFirst) {
        await chrome.storage.local.set({ default_model_id: newModel.id });
    }

    const result = { success: true, model: newModel };

    if (!demoMode && !imageUrlToSave.startsWith('data:')) {
        try {
            const uploadToken = await getAuthToken();
            const uploadUserData = await chrome.storage.local.get(['user']);
            if (uploadToken && uploadUserData.user?.id) {
                const apiResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_models`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${uploadToken}`,
                        'apikey': SUPABASE_AUTH_KEY,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates',
                    },
                    body: JSON.stringify({
                        id: newModel.id,
                        user_id: uploadUserData.user.id,
                        image_url: imageUrlToSave,
                        label: newModel.label,
                        source: newModel.source,
                        is_default: isFirst,
                    }),
                });
            }
        } catch (error) {
            console.warn('[Fitly] Failed to sync model metadata:', error);
        }
    }

    return result;
}

export async function handleDeleteUserModel(data) {
    if (!data.modelId) {
        return { success: false, error: 'Model ID is required' };
    }

    const storage = await chrome.storage.local.get(['user_models', 'default_model_id', 'model_image']);
    let models = storage.user_models || [];

    const modelToDelete = models.find(m => m.id === data.modelId);

    models = models.filter(m => m.id !== data.modelId);
    await chrome.storage.local.set({ user_models: models });

    // FIX 3: Clean up orphan model_image key if deleted model was the active one
    const deletedUrl = modelToDelete?.url || modelToDelete?.imageUrl;
    if (deletedUrl && storage.model_image === deletedUrl) {
        const nextModel = models[0];
        if (nextModel) {
            await chrome.storage.local.set({ model_image: nextModel.url || nextModel.imageUrl });
            log('[Fitly] model_image updated to next available model after delete');
        } else {
            await chrome.storage.local.remove('model_image');
            log('[Fitly] model_image cleared (no remaining models)');
        }
    }

    try {
        const thumbStore = await chrome.storage.local.get('model_thumbnails');
        const thumbnails = thumbStore.model_thumbnails || {};
        if (thumbnails[data.modelId]) {
            delete thumbnails[data.modelId];
            await chrome.storage.local.set({ model_thumbnails: thumbnails });
        }
    } catch (thumbCleanErr) {
        // Non-critical: orphan thumbnail entry is harmless
        console.warn('[handleDeleteUserModel] Thumbnail cleanup failed:', thumbCleanErr.message);
    }

    const demoMode = await isDemoMode();
    if (!demoMode && modelToDelete) {
        try {
            const deleteToken = await getAuthToken();
            const deleteUserData = await chrome.storage.local.get(['user']);
            const userId = deleteUserData.user?.id;

            if (userId && deleteToken) {
                await fetch(`${SUPABASE_URL}/rest/v1/user_models?id=eq.${data.modelId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${deleteToken}`,
                        'apikey': SUPABASE_AUTH_KEY
                    }
                });

                if (modelToDelete.url && modelToDelete.url.includes('/storage/v1/object/public/user-models/')) {
                    const filePath = `${userId}/${data.modelId}.jpg`;
                    await fetch(`${SUPABASE_URL}/storage/v1/object/user-models/${filePath}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${deleteToken}`,
                            'apikey': SUPABASE_AUTH_KEY
                        }
                    });
                    log(`[Fitly] Deleted remote model ${data.modelId} from Supabase DB & Storage.`);
                } else {
                    log(`[Fitly] Deleted remote model ${data.modelId} from Supabase DB (No external static file found).`);
                }
            }
        } catch (err) {
            console.warn('[Fitly] Failed to delete user model from Supabase:', err);
        }
    }

    if (storage.default_model_id === data.modelId) {
        const newDefaultId = models.length > 0 ? models[0].id : null;
        await chrome.storage.local.set({ default_model_id: newDefaultId });
    }

    return { success: true };
}

export async function handleSetDefaultModel(data) {
    const modelId = data.modelId || null;

    await chrome.storage.local.set({ default_model_id: modelId });

    if (modelId) {
        const storage = await chrome.storage.local.get('user_models');
        const models = storage.user_models || [];
        const model = models.find(m => m.id === modelId);

        if (model) {
            // FIX 3: Keep model_image in sync with the selected default model
            const imageUrl = model.url || model.imageUrl;
            if (imageUrl) {
                await chrome.storage.local.set({ model_image: imageUrl });
            }
        }
    } else {
        // FIX 3: Clear model_image when default is explicitly unset
        await chrome.storage.local.remove('model_image');
        log('[Fitly] model_image cleared (no default model set)');
    }

    const demoMode = await isDemoMode();
    if (!demoMode) {
        try {
            const defaultToken = await getAuthToken();
            const defaultUserData = await chrome.storage.local.get(['user']);
            if (defaultToken && defaultUserData.user?.id) {
                const headers = {
                    'Authorization': `Bearer ${defaultToken}`,
                    'apikey': SUPABASE_AUTH_KEY,
                    'Content-Type': 'application/json',
                };
                // P3 FIX: Run both PATCH requests in parallel
                const requests = [
                    fetch(`${SUPABASE_URL}/rest/v1/user_models?user_id=eq.${defaultUserData.user.id}`, {
                        method: 'PATCH', headers,
                        body: JSON.stringify({ is_default: false })
                    }),
                ];
                if (modelId) {
                    requests.push(
                        fetch(`${SUPABASE_URL}/rest/v1/user_models?id=eq.${modelId}`, {
                            method: 'PATCH', headers,
                            body: JSON.stringify({ is_default: true })
                        })
                    );
                }
                await Promise.all(requests);
            }
        } catch (error) {
            console.warn('[Fitly] Failed to update default model on DB:', error);
        }
    }

    return { success: true };
}

export async function handleGetDefaultModel() {
    const storage = await chrome.storage.local.get(['user_models', 'default_model_id']);
    const models = storage.user_models || [];
    const defaultModelId = storage.default_model_id;

    if (defaultModelId) {
        const model = models.find(m => m.id === defaultModelId);
        if (model) {
            return { success: true, model };
        }
    }

    if (models.length > 0) {
        return { success: true, model: models[0] };
    }

    return { success: true, model: null };
}

export async function handleSaveModelImage(data) {
    const demoMode = await isDemoMode();
    if (demoMode) {
        demoState.modelImage = data.imageUrl;
        await chrome.storage.local.set({ model_image: data.imageUrl });
        return { success: true };
    }

    try {
        await chrome.storage.local.set({ model_image: data.imageUrl });
        return { success: true };
    } catch (error) {
        return { success: true, local: true };
    }
}

export async function handleGetModelImage() {
    const local = await chrome.storage.local.get('model_image');
    if (local.model_image) {
        return { success: true, imageUrl: local.model_image };
    }

    const demoMode = await isDemoMode();
    if (demoMode) {
        return { success: true, imageUrl: demoState.modelImage };
    }

    try {
        const modelToken = await getAuthToken();
        const modelUserData = await chrome.storage.local.get(['user']);
        if (!modelToken) return { success: true, imageUrl: null };
        const userId = modelUserData.user?.id;
        if (!userId) return { success: true, imageUrl: null };

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=avatar_url`,
            { headers: { 'Authorization': `Bearer ${modelToken}`, 'apikey': SUPABASE_AUTH_KEY } }
        );
        if (response.ok) {
            const profiles = await response.json();
            const avatarUrl = profiles[0]?.avatar_url;
            if (avatarUrl) {
                await chrome.storage.local.set({ model_image: avatarUrl });
                return { success: true, imageUrl: avatarUrl };
            }
        }
        return { success: true, imageUrl: null };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function handleGetSampleModels() {
    return {
        success: true,
        models: [
            { id: 'sample-1', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600', label: 'Mẫu 1', source: 'sample' },
            { id: 'sample-2', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600', label: 'Mẫu 2', source: 'sample' },
            { id: 'sample-3', url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600', label: 'Mẫu 3', source: 'sample' },
        ]
    };
}

export function handleGetSampleClothing() {
    return {
        success: true,
        clothing: [
            { id: 'c1', url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400', label: 'White T-Shirt' },
            { id: 'c2', url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400', label: 'Blue Jeans' },
            { id: 'c3', url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400', label: 'Denim Jacket' },
            { id: 'c4', url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400', label: 'Floral Dress' },
            { id: 'c5', url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400', label: 'Black Hoodie' },
        ]
    };
}
