/**
 * File: session_ready_gate.js
 * Purpose: Promise gate để tránh MV3 race condition — message handler chờ session restore xong.
 * Layer: Infrastructure
 *
 * ARCHITECTURE NOTE:
 * Trong MV3, Service Worker là ephemeral. Khi SW restart:
 * 1. Module code chạy lại → Supabase client được tạo mới (in-memory session = null)
 * 2. Message listener đăng ký SYNC → sẵn sàng nhận message ngay
 * 3. Session restore (từ ChromeStorageAdapter) là ASYNC → chưa xong
 * 4. Message đến giữa bước 2 và 3 → getSession() null → auth fail
 *
 * Fix: sessionReady promise — resolve SAU KHI restoreSupabaseSession() hoàn tất.
 * Message handler await sessionReady trước khi xử lý.
 *
 * Tách ra file riêng để tránh circular dependency:
 * service_worker.js → message_routing.js → session_ready_gate.js (←OK)
 * service_worker.js → session_ready_gate.js (←OK)
 */

let _resolve;
export const sessionReady = new Promise(resolve => { _resolve = resolve; });

export function markSessionReady() {
    _resolve();
}
