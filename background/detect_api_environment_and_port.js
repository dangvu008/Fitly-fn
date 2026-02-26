/**
 * File: detect_api_environment_and_port.js
 * Purpose: Tìm port server khả dụng (đối với môi trường dev local) để đảm bảo kết nối API chính xác
 * Layer: Infrastructure (Network)
 * * Data Contract:
 * - Output: getApiBaseUrl trả về string
 * * Flow: Ping thử lần lượt port 3000 -> 3004, port nào trả về 200 thì chọn.
 */

import { log } from './debug_logger.js';

let detectedPort = 3000;

export async function detectServerPort() {
    const ports = [3000, 3001, 3002, 3003, 3004];

    for (const port of ports) {
        try {
            const response = await fetch(`http://localhost:${port}/api/health`, {
                method: 'HEAD',
                timeout: 2000
            });

            if (response.status === 200) {
                detectedPort = port;
                log(`[Fitly] Server detected on port ${port}`);
                return port;
            }
        } catch (error) {
            continue;
        }
    }

    log('[Fitly] No server found on ports 3000-3004');
    return 3000;
}

export function getApiBaseUrl() {
    return `http://localhost:${detectedPort}`;
}
