/**
 * File: confirm_dialog.js
 * Purpose: Cute animated confirmation dialog — thay thế window.confirm() native
 * Layer: Presentation
 *
 * Input:  showConfirmDialog({ type, title, message, confirmText, cancelText, icon, gemCost })
 * Output: Promise<boolean> — true nếu user xác nhận, false nếu hủy
 *
 * Types:
 *   'delete'   → màu đỏ, icon 🗑️
 *   'tryon'    → màu tím/gradient, icon ✨
 *   'warning'  → màu cam, icon ⚠️
 *
 * Flow: inject HTML → animate in → await Promise → animate out → resolve
 * Edge Cases: ESC to cancel, backdrop click to cancel, auto-cleanup on resolve
 */

/**
 * Inject CSS một lần duy nhất vào document
 */
function injectConfirmDialogCSS() {
    if (document.getElementById('fitly-confirm-dialog-style')) return;

    const style = document.createElement('style');
    style.id = 'fitly-confirm-dialog-style';
    style.textContent = `
        /* ===== FITLY CONFIRM DIALOG ===== */
        .fitly-confirm-backdrop {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.55);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            animation: fitly-backdrop-in 0.2s ease-out;
        }

        .fitly-confirm-backdrop.closing {
            animation: fitly-backdrop-out 0.2s ease-in forwards;
        }

        @keyframes fitly-backdrop-in {
            from { opacity: 0; }
            to   { opacity: 1; }
        }

        @keyframes fitly-backdrop-out {
            from { opacity: 1; }
            to   { opacity: 0; }
        }

        /* ===== DIALOG BOX ===== */
        .fitly-confirm-dialog {
            background: var(--color-card, #ffffff);
            border: 1px solid var(--color-border-dark, #e7e5e4);
            border-radius: 20px;
            padding: 28px 24px 24px;
            width: 280px;
            max-width: 90vw;
            text-align: center;
            box-shadow: 0 12px 40px rgba(0,0,0,0.08), 0 4px 16px rgba(141,110,99,0.1);
            animation: fitly-dialog-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: relative;
            overflow: hidden;
        }

        .fitly-confirm-dialog.closing {
            animation: fitly-dialog-out 0.18s ease-in forwards;
        }

        @keyframes fitly-dialog-in {
            from { transform: scale(0.7) translateY(20px); opacity: 0; }
            to   { transform: scale(1) translateY(0);      opacity: 1; }
        }

        @keyframes fitly-dialog-out {
            from { transform: scale(1) translateY(0);      opacity: 1; }
            to   { transform: scale(0.85) translateY(10px); opacity: 0; }
        }

        /* ===== ICON AREA ===== */
        .fitly-confirm-icon-wrap {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            position: relative;
            animation: fitly-icon-bounce 0.4s 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }

        @keyframes fitly-icon-bounce {
            0%   { transform: scale(0.5); opacity: 0; }
            70%  { transform: scale(1.15); }
            100% { transform: scale(1); opacity: 1; }
        }

        .fitly-confirm-icon-wrap.type-delete {
            background: radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%);
            box-shadow: 0 0 0 12px rgba(239,68,68,0.04);
        }

        .fitly-confirm-icon-wrap.type-tryon {
            background: radial-gradient(circle, rgba(141,110,99,0.2) 0%, rgba(188,170,164,0.1) 100%);
            box-shadow: 0 0 0 12px rgba(141,110,99,0.06);
        }

        .fitly-confirm-icon-wrap.type-warning {
            background: radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%);
            box-shadow: 0 0 0 12px rgba(245,158,11,0.04);
        }

        /* ===== SHIMMER EFFECT (tryon type) ===== */
        .fitly-confirm-dialog.type-tryon::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: conic-gradient(from 180deg at 50% 50%, 
                rgba(141,110,99,0.06) 0deg, 
                transparent 60deg, 
                rgba(188,170,164,0.06) 120deg, 
                transparent 180deg,
                rgba(141,110,99,0.04) 240deg,
                transparent 300deg
            );
            animation: fitly-shimmer-rotate 6s linear infinite;
            pointer-events: none;
        }

        @keyframes fitly-shimmer-rotate {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }

        /* ===== TEXT ===== */
        .fitly-confirm-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--color-foreground, #4a4a4a);
            margin: 0 0 8px;
            line-height: 1.3;
        }

        .fitly-confirm-message {
            font-size: 13px;
            color: var(--color-foreground-secondary, #8d8d8d);
            margin: 0 0 6px;
            line-height: 1.5;
        }

        /* ===== GEM COST SECTION ===== */
        .fitly-confirm-gem-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            margin: 10px 0 4px;
        }

        .fitly-confirm-gem-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(141,110,99,0.1);
            border: 1px solid rgba(141,110,99,0.2);
            border-radius: 20px;
            padding: 6px 14px;
            font-size: 13px;
            font-weight: 600;
            color: #8d6e63;
            animation: fitly-gem-pulse 2s ease-in-out infinite;
        }

        .fitly-gem-before {
            font-weight: 700;
            font-size: 15px;
        }

        .fitly-gem-arrow {
            color: #bcaaa4;
            font-size: 14px;
            animation: fitly-arrow-slide 1.5s ease-in-out infinite;
        }

        @keyframes fitly-arrow-slide {
            0%, 100% { transform: translateX(0); opacity: 0.6; }
            50% { transform: translateX(2px); opacity: 1; }
        }

        .fitly-gem-after {
            font-weight: 700;
            font-size: 15px;
            color: #4caf50;
        }

        .fitly-gem-after.low {
            color: #f44336;
        }

        .fitly-gem-unit {
            font-size: 11px;
            font-weight: 500;
            opacity: 0.7;
        }

        .fitly-gem-low-warning {
            font-size: 11px;
            color: #f44336;
            font-weight: 600;
            animation: fitly-warn-blink 2s ease-in-out infinite;
        }

        @keyframes fitly-warn-blink {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
        }

        @keyframes fitly-gem-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(141,110,99,0.2); }
            50%       { box-shadow: 0 0 0 4px rgba(141,110,99,0); }
        }

        /* ===== BUTTONS ===== */
        .fitly-confirm-buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }

        .fitly-confirm-btn {
            flex: 1;
            height: 40px;
            border-radius: 12px;
            border: none;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
            position: relative;
            overflow: hidden;
            letter-spacing: 0.01em;
        }

        .fitly-confirm-btn:active {
            transform: scale(0.95);
        }

        /* Ripple effect */
        .fitly-confirm-btn::after {
            content: '';
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.04);
            opacity: 0;
            transition: opacity 0.2s;
        }

        .fitly-confirm-btn:hover::after {
            opacity: 1;
        }

        /* Cancel button */
        .fitly-confirm-btn-cancel {
            background: var(--color-background-secondary, #f5f0eb);
            color: var(--color-foreground, #4a4a4a);
            border: 1px solid var(--color-border-dark, #e7e5e4);
        }

        .fitly-confirm-btn-cancel:hover {
            background: var(--color-muted, #f5f0eb);
            color: var(--color-foreground, #4a4a4a);
            border-color: var(--color-primary, #bcaaa4);
        }

        /* Confirm button — delete */
        .fitly-confirm-btn-confirm.type-delete {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: #fff;
            box-shadow: 0 4px 12px rgba(239,68,68,0.25);
        }

        .fitly-confirm-btn-confirm.type-delete:hover {
            box-shadow: 0 6px 18px rgba(239,68,68,0.35);
            transform: translateY(-1px);
        }

        /* Confirm button — tryon */
        .fitly-confirm-btn-confirm.type-tryon {
            background: linear-gradient(135deg, #bcaaa4, #8d6e63);
            color: #fff;
            box-shadow: 0 4px 12px rgba(141,110,99,0.3);
        }

        .fitly-confirm-btn-confirm.type-tryon:hover {
            box-shadow: 0 6px 18px rgba(141,110,99,0.4);
            transform: translateY(-1px);
        }

        /* Confirm button — warning */
        .fitly-confirm-btn-confirm.type-warning {
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #fff;
            box-shadow: 0 4px 12px rgba(245,158,11,0.35);
        }

        /* ===== SPARKLES (tryon type decoration) ===== */
        .fitly-confirm-sparkle {
            position: absolute;
            pointer-events: none;
            font-size: 14px;
            color: #8d6e63;
            animation: fitly-sparkle-float 3s ease-in-out infinite;
            opacity: 0.5;
        }

        @keyframes fitly-sparkle-float {
            0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
            50%       { transform: translateY(-6px) rotate(15deg); opacity: 0.7; }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Main function: hiển thị dialog và trả về Promise<boolean>
 *
 * @param {Object} options
 * @param {'delete'|'tryon'|'warning'} options.type
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.icon]        - emoji icon
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {number} [options.gemCost]     - số gem cần dùng (chỉ cho type=tryon)
 * @returns {Promise<boolean>}
 */
function showConfirmDialog(options = {}) {
    injectConfirmDialogCSS();

    const {
        type = 'warning',
        title = '',
        message = '',
        icon = type === 'delete' ? '🗑️' : type === 'tryon' ? '✨' : '⚠️',
        confirmText = type === 'delete' ? 'Xóa' : 'Xác nhận',
        cancelText = 'Hủy',
        gemCost = null,
        currentBalance = null,
    } = options;

    return new Promise((resolve) => {
        // Build sparkles decoration for tryon type
        const sparklesHTML = type === 'tryon' ? `
            <span class="fitly-confirm-sparkle" style="top:10px;right:18px;animation-delay:0s">✦</span>
            <span class="fitly-confirm-sparkle" style="top:20px;left:14px;animation-delay:0.8s;font-size:10px">✧</span>
            <span class="fitly-confirm-sparkle" style="bottom:50px;right:12px;animation-delay:1.5s;font-size:10px">✦</span>
        ` : '';

        // Build gem badge — simple cost display
        const gemBadgeHTML = (type === 'tryon' && gemCost !== null) ? `
            <div class="fitly-confirm-gem-badge">
                💎 ${gemCost} gem
            </div>
        ` : '';

        const backdropEl = document.createElement('div');
        backdropEl.className = 'fitly-confirm-backdrop';
        backdropEl.innerHTML = `
            <div class="fitly-confirm-dialog type-${type}" role="dialog" aria-modal="true">
                ${sparklesHTML}
                <div class="fitly-confirm-icon-wrap type-${type}">${icon}</div>
                <div class="fitly-confirm-title">${title}</div>
                <div class="fitly-confirm-message">${message}</div>
                ${gemBadgeHTML}
                <div class="fitly-confirm-buttons">
                    <button class="fitly-confirm-btn fitly-confirm-btn-cancel" id="fitly-confirm-cancel">${cancelText}</button>
                    <button class="fitly-confirm-btn fitly-confirm-btn-confirm type-${type}" id="fitly-confirm-ok">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(backdropEl);

        // Auto-focus confirm button for keyboard accessibility
        const okBtn = backdropEl.querySelector('#fitly-confirm-ok');
        const cancelBtn = backdropEl.querySelector('#fitly-confirm-cancel');
        const dialogEl = backdropEl.querySelector('.fitly-confirm-dialog');

        // Focus cancel by default (safer UX)
        setTimeout(() => cancelBtn?.focus(), 50);

        /**
         * Close dialog with exit animation → resolve Promise
         */
        function closeDialog(result) {
            backdropEl.classList.add('closing');
            dialogEl?.classList.add('closing');
            setTimeout(() => {
                backdropEl.remove();
                resolve(result);
            }, 200);
        }

        // Button listeners
        okBtn?.addEventListener('click', () => closeDialog(true));
        cancelBtn?.addEventListener('click', () => closeDialog(false));

        // Backdrop click → cancel
        backdropEl.addEventListener('click', (e) => {
            if (e.target === backdropEl) closeDialog(false);
        });

        // ESC → cancel
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEsc);
                closeDialog(false);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

// Expose globally
window.showConfirmDialog = showConfirmDialog;
