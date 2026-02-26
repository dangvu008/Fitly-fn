/**
 * File: message_routing.js
 * Purpose: Routing tất cả các message từ Frontend đến các Handler tương ứng
 * Layer: Infrastructure / Framework
 * * Data Contract:
 * - Exports: handleMessage, setupMessageRouting
 */

import { FEATURES, SUPABASE_AUTH_URL } from './ENVIRONMENT_CONFIG.js';
import { handleGetAuthState, handleEnableGuestMode, handleEmailLogin, handleEmailRegister, handleSocialLogin, handleStoreAuthToken, handleGoogleSignIn, handleAuthSuccess, handleLogout } from './auth_handlers.js';
import { forceRefreshToken } from './auth_state_manager.js';
// MV3 race fix: session must be restored before processing messages
import { sessionReady } from './session_ready_gate.js';
import { handleFetchImage } from './fetch_image_proxy_bypass_cors.js';
import { handleAddToWardrobe, handleGetWardrobe } from './wardrobe_manager.js';
// NOTE: handleContextTryonImage, handleContextAddWardrobe are now handled
// directly in service_worker.js to bypass sessionReady gate (see FIX comment there).
import { handleGetRecentClothing, handleSaveRecentClothing, handleDeleteRecentClothing, handleSaveClothingToWardrobe, handleDeleteWardrobeItem } from './recent_clothing_manager.js';
import { handleProcessTryOn, handleRefundGems } from './process_tryon.js';
import { handleEditImage } from './process_edit.js';
import { handleSaveOutfit, handleGetOutfits, handleGetTryonHistory, handleDeleteOutfit, handleGetDeletedOutfits, handleRestoreOutfit, handlePermanentDeleteOutfit } from './outfit_manager.js';
import { handleGetUserModels, handleAddUserModel, handleDeleteUserModel, handleSetDefaultModel, handleGetDefaultModel, handleSaveModelImage, handleGetModelImage, handleGetSampleModels, handleGetSampleClothing } from './user_model_manager.js';
import { handleUpdateSettings, handleGetSettings } from './settings_manager.js';
import { syncToCloud, syncFromCloud } from './cloud_sync.js';

import { handleCheckPaymentStatus, handleGetGemsBalance } from './payment_handlers.js';

function getApiBaseUrl() {
    return FEATURES.USE_LOCAL_API ? 'http://localhost:54321' : SUPABASE_AUTH_URL;
}

export async function handleMessage(message, sender) {
    // MV3 Race Fix: Chờ session restore xong trước khi xử lý message.
    // Khi SW restart, message có thể đến trước khi Supabase client restore session
    // từ ChromeStorageAdapter → getSession() null → tất cả auth operations fail.
    await sessionReady;
    try {
        switch (message.type) {
            case 'GET_SERVER_URL':
                return { url: getApiBaseUrl() };
            case 'GET_AUTH_STATE':
                return await handleGetAuthState();
            case 'ENABLE_GUEST_MODE':
                return await handleEnableGuestMode();
            case 'STORE_AUTH_TOKEN':
                return await handleStoreAuthToken(message.payload);
            case 'AUTH_SUCCESS':
                return await handleAuthSuccess(message.session);
            case 'GOOGLE_SIGN_IN':
                return await handleGoogleSignIn();
            case 'SOCIAL_LOGIN':
                return await handleSocialLogin(message.data);
            case 'LOGOUT':
                return await handleLogout();
            case 'PROCESS_TRYON':
                return await handleProcessTryOn(message.data);
            case 'ADD_TO_WARDROBE':
                return await handleAddToWardrobe(message.data);
            case 'GET_WARDROBE':
                return await handleGetWardrobe(message.data);
            case 'GET_GEMS_BALANCE':
                return await handleGetGemsBalance();
            // CONTEXT_TRYON_IMAGE and CONTEXT_ADD_WARDROBE are now handled
            // directly in service_worker.js — bypasses sessionReady gate for faster response
            case 'SAVE_OUTFIT':
                return await handleSaveOutfit(message.data);
            case 'GET_OUTFITS':
                return await handleGetOutfits(message.data);
            case 'DELETE_OUTFIT':
                return await handleDeleteOutfit(message.data);
            case 'GET_DELETED_OUTFITS':
                return await handleGetDeletedOutfits(message.data);
            case 'RESTORE_OUTFIT':
                return await handleRestoreOutfit(message.data);
            case 'PERMANENT_DELETE_OUTFIT':
                return await handlePermanentDeleteOutfit(message.data);
            case 'IMAGE_SELECTED':
                await chrome.storage.session.set({
                    pending_clothing_image: message.imageUrl
                });
                return { success: true };
            case 'GET_PENDING_IMAGE':
                const data = await chrome.storage.session.get(['pending_clothing_image', 'pending_source_url']);
                if (data.pending_clothing_image) {
                    await chrome.storage.session.remove(['pending_clothing_image', 'pending_source_url']);
                    return {
                        imageUrl: data.pending_clothing_image,
                        sourceUrl: data.pending_source_url
                    };
                }
                return { imageUrl: null };
            case 'SAVE_MODEL_IMAGE':
                return await handleSaveModelImage(message.data);
            case 'GET_MODEL_IMAGE':
                return await handleGetModelImage();
            case 'GET_RECENT_CLOTHING':
                return await handleGetRecentClothing();
            case 'SAVE_RECENT_CLOTHING':
                return await handleSaveRecentClothing(message.data);
            case 'DELETE_RECENT_CLOTHING':
                return await handleDeleteRecentClothing(message.data);
            case 'DELETE_WARDROBE_ITEM':
                return await handleDeleteWardrobeItem(message.data);
            case 'SAVE_CLOTHING_TO_WARDROBE':
                return await handleSaveClothingToWardrobe(message.data);
            case 'SAVE_TO_WARDROBE':
                return await handleAddToWardrobe({
                    image_url: message.data?.imageUrl,
                    name: message.data?.name || 'Saved Result',
                    category: message.data?.type === 'tryon_result' ? 'outfit' : 'other',
                    source_url: message.data?.sourceUrl || '',
                });
            case 'GET_USER_MODELS':
                return await handleGetUserModels();
            case 'ADD_USER_MODEL':
                return await handleAddUserModel(message.data);
            case 'DELETE_USER_MODEL':
                return await handleDeleteUserModel(message.data);
            case 'SET_DEFAULT_MODEL':
                return await handleSetDefaultModel(message.data);
            case 'GET_DEFAULT_MODEL':
                return await handleGetDefaultModel();
            case 'GET_SAMPLE_MODELS':
                return handleGetSampleModels();
            case 'GET_SAMPLE_CLOTHING':
                return handleGetSampleClothing();
            case 'SYNC_TO_CLOUD':
                return await syncToCloud();
            case 'SYNC_FROM_CLOUD':
                return await syncFromCloud();
            case 'GET_SYNC_STATUS':
                const lastSync = await chrome.storage.local.get('last_sync');
                return {
                    success: true,
                    lastSync: lastSync.last_sync || null,
                    autoSyncEnabled: FEATURES.SYNC_TO_CLOUD,
                };
            case 'UPDATE_SETTINGS':
                return await handleUpdateSettings(message.data);
            case 'GET_SETTINGS':
                return await handleGetSettings();
            case 'CHECK_PAYMENT_STATUS':
                return await handleCheckPaymentStatus();
            case 'REFUND_GEMS':
                return await handleRefundGems(message.data);
            case 'EMAIL_LOGIN':
                return await handleEmailLogin(message.data);
            case 'EMAIL_REGISTER':
                return await handleEmailRegister(message.data);
            case 'GET_TRYON_HISTORY':
                return await handleGetTryonHistory(message.data);
            case 'FETCH_IMAGE_FOR_CACHE': {
                // FIX 6: Proxy image fetch through background SW to bypass sidebar CORS restrictions
                // Background has host permissions from manifest, sidebar content script does not.
                try {
                    const imgUrl = message.imageUrl;
                    if (!imgUrl || imgUrl.startsWith('data:')) {
                        return { success: false, error: 'Invalid URL for cache proxy' };
                    }
                    const imgResponse = await fetch(imgUrl);
                    if (!imgResponse.ok) {
                        return { success: false, error: `HTTP ${imgResponse.status}` };
                    }
                    const blob = await imgResponse.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    let binary = '';
                    const chunkSize = 8192;
                    for (let i = 0; i < bytes.length; i += chunkSize) {
                        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                    }
                    const mime = blob.type || 'image/jpeg';
                    const base64 = `data:${mime};base64,${btoa(binary)}`;
                    return { success: true, base64 };
                } catch (fetchErr) {
                    console.warn('[SW] FETCH_IMAGE_FOR_CACHE failed:', fetchErr.message);
                    return { success: false, error: fetchErr.message };
                }
            }
            case 'FETCH_IMAGE':
                return await handleFetchImage(message.data);
            case 'EDIT_IMAGE':
                return await handleEditImage(message.data);
            case 'ENSURE_FRESH_TOKEN': {
                // Sidebar yêu cầu refresh token trước khi retry hoặc khi sidebar mở
                try {
                    const freshToken = await forceRefreshToken();
                    return { success: !!freshToken, token: freshToken ? 'exists' : null };
                } catch (refreshErr) {
                    console.warn('[SW] ENSURE_FRESH_TOKEN failed:', refreshErr.message);
                    return { success: false, error: refreshErr.message, errorCode: refreshErr.errorCode || 'REFRESH_FAILED' };
                }
            }
            default:
                console.warn(`[Fitly SW] Unknown message type: ${message.type}`);
                return { success: false, error: 'Unknown message type' };
        }
    } catch (error) {
        console.error(`[SW Handler Error] ${message.type}:`, error);
        return { success: false, error: error.message };
    }
}

