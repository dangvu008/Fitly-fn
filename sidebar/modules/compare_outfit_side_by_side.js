/**
 * File: compare_outfit_side_by_side.js
 * Purpose: Logic so sánh 2 outfit kết quả try-on side-by-side
 * Layer: Domain
 *
 * Data Contract:
 * - Input: state.results (array kết quả try-on), state.currentResultId
 * - Output: UI so sánh 2 outfit, cho phép user chọn winner
 *
 * Flow:
 * 1. openCompareView() → mở section compare, tự động gán slot A = current, slot B = previous
 * 2. setCompareSlot(slot, resultId) → cập nhật ảnh cho slot được chọn
 * 3. handleCompareSlider(value) → overlay clip effect
 * 4. swapCompareSlots() → đổi vị trí A ↔ B
 * 5. selectWinner(slot) → user chọn outfit ưa thích, hiện toast
 * 6. closeCompareView() → đóng section, quay lại main
 */

// ==========================================
// STATE
// ==========================================
let compareSlotA = null; // { id, imageUrl, name }
let compareSlotB = null;
let activePickSlot = null; // 'A' or 'B' — slot đang chờ user chọn

// ==========================================
// OPEN / CLOSE
// ==========================================

function openCompareView() {
    if (state.results.length < 2) {
        showToast(t('need_two_results') || 'Cần ít nhất 2 kết quả để so sánh', 'warning');
        return;
    }

    // Tự động gán: slot A = result đang xem, slot B = result kế tiếp
    const currentIdx = state.results.findIndex(r => r.id === state.currentResultId);
    const idxA = currentIdx >= 0 ? currentIdx : 0;
    const idxB = idxA === 0 ? 1 : 0;

    compareSlotA = { ...state.results[idxA] };
    compareSlotB = { ...state.results[idxB] };

    renderCompareSlots();
    renderCompareResultsPicker();

    // Show section, hide others
    document.getElementById('compare-outfit-section')?.classList.remove('hidden');
    $('main-content')?.classList.add('hidden');
    $('inline-result-section')?.classList.add('hidden');

    // Reset slider
    const slider = document.getElementById('compare-slider');
    if (slider) slider.value = 50;
    applySliderClip(50);
}

function closeCompareView() {
    document.getElementById('compare-outfit-section')?.classList.add('hidden');
    $('main-content')?.classList.remove('hidden');
    compareSlotA = null;
    compareSlotB = null;
    activePickSlot = null;
}

// ==========================================
// RENDER
// ==========================================

function renderCompareSlots() {
    const imgA = document.getElementById('compare-img-a');
    const imgB = document.getElementById('compare-img-b');
    const phA = document.getElementById('compare-placeholder-a');
    const phB = document.getElementById('compare-placeholder-b');

    if (compareSlotA && compareSlotA.imageUrl) {
        if (imgA) { imgA.src = compareSlotA.imageUrl; imgA.style.display = 'block'; }
        if (phA) phA.style.display = 'none';
    } else {
        if (imgA) imgA.style.display = 'none';
        if (phA) phA.style.display = 'flex';
    }

    if (compareSlotB && compareSlotB.imageUrl) {
        if (imgB) { imgB.src = compareSlotB.imageUrl; imgB.style.display = 'block'; }
        if (phB) phB.style.display = 'none';
    } else {
        if (imgB) imgB.style.display = 'none';
        if (phB) phB.style.display = 'flex';
    }
}

function renderCompareResultsPicker() {
    const grid = document.getElementById('compare-results-grid');
    if (!grid) return;

    grid.innerHTML = state.results.map((result, idx) => {
        const resultIdStr = String(result.id);
        const isSlotA = compareSlotA && String(compareSlotA.id) === resultIdStr;
        const isSlotB = compareSlotB && String(compareSlotB.id) === resultIdStr;
        const selectedClass = isSlotA ? 'selected-a' : (isSlotB ? 'selected-b' : '');
        const label = isSlotA ? 'A' : (isSlotB ? 'B' : '');
        const displayName = result.name || (t('result_number', { index: idx + 1 }) || `#${idx + 1}`);

        return `
            <div class="compare-picker-item ${selectedClass}" data-result-id="${resultIdStr}" title="${displayName}">
                <img src="${result.imageUrl}" alt="${displayName}" loading="lazy" />
                ${label ? `<div class="compare-picker-badge">${label}</div>` : ''}
            </div>
        `;
    }).join('');

    // Event listeners
    grid.querySelectorAll('.compare-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const resultIdStr = item.dataset.resultId;
            const result = state.results.find(r => String(r.id) === resultIdStr);
            if (!result) return;

            // Logic: nếu đã là A thì bỏ, nếu đã là B thì bỏ, nếu chưa gán thì gán vào slot trống
            if (compareSlotA && String(compareSlotA.id) === resultIdStr) {
                return;
            }
            if (compareSlotB && String(compareSlotB.id) === resultIdStr) {
                return;
            }

            // Gán vào slot: ưu tiên thay B, trừ khi A đang trống
            if (!compareSlotA || !compareSlotA.imageUrl) {
                compareSlotA = { ...result };
            } else {
                compareSlotB = { ...result };
            }

            renderCompareSlots();
            renderCompareResultsPicker();
        });
    });
}

// ==========================================
// SLIDER — Overlay Clip Effect
// ==========================================

function applySliderClip(value) {
    const slotA = document.getElementById('compare-slot-a');
    const slotB = document.getElementById('compare-slot-b');
    if (!slotA || !slotB) return;

    // Value 0 = chỉ thấy B, 100 = chỉ thấy A
    // A chiếm value%, B chiếm (100-value)%
    slotA.style.flex = `0 0 ${value}%`;
    slotB.style.flex = `0 0 ${100 - value}%`;
}

// ==========================================
// SWAP
// ==========================================

function swapCompareSlots() {
    const temp = compareSlotA;
    compareSlotA = compareSlotB;
    compareSlotB = temp;
    renderCompareSlots();
    renderCompareResultsPicker();
    showToast(t('slots_swapped') || 'Đã đổi vị trí', 'success');
}

// ==========================================
// SELECT WINNER
// ==========================================

function selectCompareWinner(slot) {
    const winner = slot === 'A' ? compareSlotA : compareSlotB;
    if (!winner) return;

    const displayName = winner.name || (t('result_number', { index: winner.id }) || `Outfit #${winner.id}`);
    showToast(`🏆 ${displayName} ${t('is_your_pick') || 'là lựa chọn của bạn!'}`, 'success');

    // Highlight winner slot
    const slots = document.querySelectorAll('.compare-slot');
    slots.forEach(s => s.classList.remove('winner'));
    const winnerSlot = document.querySelector(`.compare-slot[data-slot="${slot}"]`);
    if (winnerSlot) {
        winnerSlot.classList.add('winner');
        setTimeout(() => winnerSlot.classList.remove('winner'), 3000);
    }
}

// ==========================================
// EVENT BINDINGS (tự setup khi load)
// ==========================================

function setupCompareEvents() {
    document.getElementById('close-compare-btn')?.addEventListener('click', closeCompareView);
    document.getElementById('compare-swap-btn')?.addEventListener('click', swapCompareSlots);

    document.getElementById('compare-slider')?.addEventListener('input', (e) => {
        applySliderClip(parseInt(e.target.value));
    });

    document.querySelectorAll('.compare-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectCompareWinner(btn.dataset.slot);
        });
    });

    // Click vào placeholder để mở picker
    document.getElementById('compare-placeholder-a')?.addEventListener('click', () => {
        activePickSlot = 'A';
        showToast(t('pick_outfit_for_slot') || 'Chọn outfit cho slot A ở danh sách bên dưới', 'info');
    });
    document.getElementById('compare-placeholder-b')?.addEventListener('click', () => {
        activePickSlot = 'B';
        showToast(t('pick_outfit_for_slot') || 'Chọn outfit cho slot B ở danh sách bên dưới', 'info');
    });
}

// Init khi DOM ready
setupCompareEvents();

// ==========================================
// EXPOSE
// ==========================================
window.openCompareView = openCompareView;
window.closeCompareView = closeCompareView;
window.swapCompareSlots = swapCompareSlots;
window.selectCompareWinner = selectCompareWinner;
