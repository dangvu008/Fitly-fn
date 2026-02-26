/**
 * File: i18n_manager.js
 * Purpose: Wrapper hỗ trợ lấy translation key bất đồng bộ từ chrome.storage
 * Layer: Shared Utility
 * * Data Contract:
 * - Exports: getT (hàm trả về string dịch)
 */

export async function getT(key, vars = {}) {
    try {
        const data = await chrome.storage.local.get('extension_locale');
        return globalThis.t(key, data.extension_locale || 'vi', vars);
    } catch {
        return globalThis.t(key, 'vi', vars);
    }
}
