/**
 * File: settings_manager.js
 * Purpose: Quản lý thiết lập của ứng dụng (Settings)
 * Layer: Application / Feature
 * * Data Contract:
 * - Exports: handleUpdateSettings, handleGetSettings
 */

export async function handleUpdateSettings(data) {
    try {
        const updates = {};

        if (data.language) {
            updates.extension_locale = data.language;
        }
        if (data.theme) {
            updates.extension_theme = data.theme;
        }
        if (data.qualityPreference) {
            updates.extension_quality = data.qualityPreference;
        }

        await chrome.storage.local.set(updates);

        return { success: true };
    } catch (error) {
        console.error('[Fitly] Update settings error:', error);
        return { success: false, error: error.message };
    }
}

export async function handleGetSettings() {
    try {
        const storage = await chrome.storage.local.get([
            'extension_locale',
            'extension_theme',
            'extension_quality',
        ]);

        return {
            success: true,
            settings: {
                language: storage.extension_locale || 'vi',
                theme: storage.extension_theme || 'dark',
                qualityPreference: storage.extension_quality || 'standard',
            },
        };
    } catch (error) {
        console.error('[Fitly] Get settings error:', error);
        return { success: false, error: error.message };
    }
}
