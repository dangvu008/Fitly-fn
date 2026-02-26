/**
 * File: debug_logger.js
 * Purpose: Centralized logging utility — wraps console.* behind a debug flag
 * Layer: Infrastructure (Utility)
 *
 * Usage:
 *   import { log, warn, error } from './debug_logger.js';
 *   log('[Module]', 'message', data);  // Only logs when DEBUG_LOGGING is true
 *   warn('[Module]', 'message');        // Always logs (warnings are important)
 *   error('[Module]', 'message', err);  // Always logs (errors are critical)
 */

const DEBUG_LOGGING = true; // ⚠️ TEMPORARY: Set true for debugging session expiry — revert to false when done

export function log(...args) {
    if (DEBUG_LOGGING) {
        console.log(...args);
    }
}

export function warn(...args) {
    console.warn(...args);
}

export function error(...args) {
    console.error(...args);
}
