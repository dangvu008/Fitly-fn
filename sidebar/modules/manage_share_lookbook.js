/**
 * File: manage_share_lookbook.js
 * Purpose: Quản lý màn hình chia sẻ Lookbook — outfit swap, editable text, social share, canvas export
 * Layer: Presentation + Application
 *
 * Input: state.results, state.selectedResultIds, DOM elements trong share-lookbook-section
 * Output: Share lookbook UI hoàn chỉnh — social share, download PNG, outfit picker
 *
 * Flow:
 * 1. openShareLookbook() → populate images + show section
 * 2. renderLookbookImages(selectedResults) → render outfit cards + Change overlay
 * 3. openOutfitPicker(slotIndex) → show picker grid
 * 4. selectOutfitForSlot(slotIndex, result) → swap outfit image
 * 5. handleSocialShare(platform) → Web Share API / clipboard
 * 6. downloadLookbookCard() → canvas export → PNG blob → download
 * 7. setupShareLookbookEvents() → bind all event listeners
 */

// ==========================================
// STATE
// ==========================================
let lookbookSlots = []; // Array of result objects currently in lookbook slots
let activePickerSlot = null; // Which slot index is picking

// ==========================================
// OPEN / CLOSE
// ==========================================

function openShareLookbook() {
    const section = document.getElementById('share-lookbook-section');
    const container = document.getElementById('lookbook-images');
    if (!section || !container) return;

    // STEP 1: Determine which results to show
    let selectedResults = [];
    if (state.selectedResultIds?.length > 0) {
        selectedResults = state.results.filter(r => state.selectedResultIds.includes(r.id));
    } else if (state.currentResultId) {
        const current = state.results.find(r => r.id === state.currentResultId);
        if (current) selectedResults = [current];
    }

    // Fallback: take latest results
    if (selectedResults.length === 0 && state.results.length > 0) {
        selectedResults = state.results.slice(0, Math.min(2, state.results.length));
    }

    if (selectedResults.length === 0) {
        showToast(t('lookbook.no_results_for_share') || 'Thử đồ trước để có outfit chia sẻ!', 'warning');
        return;
    }

    // STEP 2: Store in slots and render
    lookbookSlots = selectedResults.map(r => ({ ...r }));
    renderLookbookImages();

    // STEP 3: Reset caption to default if empty
    const caption = document.getElementById('lookbook-caption');
    if (caption && !caption.textContent.trim()) {
        caption.textContent = t('lookbook.vote_prompt') || 'Help me choose the perfect fit! ✨';
    }

    // STEP 4: Show section, hide main
    section.classList.remove('hidden');
    document.getElementById('main-content')?.classList.add('hidden');
    document.getElementById('inline-result-section')?.classList.add('hidden');

    // Close picker if open
    closeOutfitPicker();
}

function closeShareLookbook() {
    const section = document.getElementById('share-lookbook-section');
    if (section) section.classList.add('hidden');
    document.getElementById('main-content')?.classList.remove('hidden');
    lookbookSlots = [];
    activePickerSlot = null;
    closeOutfitPicker();
}

// ==========================================
// RENDER LOOKBOOK IMAGES
// ==========================================

function renderLookbookImages() {
    const container = document.getElementById('lookbook-images');
    if (!container) return;

    container.innerHTML = lookbookSlots.map((result, index) => {
        const label = `OPTION ${String.fromCharCode(65 + index)}`;
        return `
            <div class="lookbook-image-wrapper" data-slot="${index}">
                <img src="${result.imageUrl}" class="lookbook-image" alt="Outfit ${label}" 
                     onerror="if(window.fixBrokenImage) fixBrokenImage(this)">
                <div class="lookbook-option-label">${label}</div>
                <button class="lookbook-change-btn" data-slot="${index}" 
                        title="${t('lookbook.change_outfit') || 'Change'}">
                    <span class="material-symbols-outlined">swap_horiz</span>
                    <span>${t('lookbook.change_outfit') || 'Change'}</span>
                </button>
            </div>
        `;
    }).join('');

    // Bind change buttons
    container.querySelectorAll('.lookbook-change-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const slotIndex = parseInt(btn.dataset.slot);
            openOutfitPicker(slotIndex);
        });
    });
}

// ==========================================
// OUTFIT PICKER
// ==========================================

function openOutfitPicker(slotIndex) {
    activePickerSlot = slotIndex;
    const picker = document.getElementById('lookbook-outfit-picker');
    const grid = document.getElementById('lookbook-picker-grid');
    if (!picker || !grid) return;

    // STEP 1: Get all available results
    const availableResults = state.results.filter(r => r.imageUrl);

    if (availableResults.length === 0) {
        showToast(t('lookbook.no_results_for_share') || 'Không có outfit nào để chọn', 'warning');
        return;
    }

    // STEP 2: Render picker grid
    grid.innerHTML = availableResults.map(result => {
        const resultIdStr = String(result.id);
        const isCurrentSlot = lookbookSlots[slotIndex] && String(lookbookSlots[slotIndex].id) === resultIdStr;
        const isOtherSlot = lookbookSlots.some((s, i) => i !== slotIndex && String(s.id) === resultIdStr);
        const displayName = result.name || t('result_number', { index: result.id }) || `#${result.id}`;

        return `
            <div class="lookbook-picker-item ${isCurrentSlot ? 'selected' : ''} ${isOtherSlot ? 'used-in-other' : ''}" 
                 data-result-id="${resultIdStr}" title="${displayName}">
                <img src="${result.imageUrl}" alt="${displayName}" loading="lazy"
                     onerror="if(window.fixBrokenImage) fixBrokenImage(this)">
                ${isCurrentSlot ? '<div class="picker-badge current">✓</div>' : ''}
                ${isOtherSlot ? '<div class="picker-badge other">' + String.fromCharCode(65 + lookbookSlots.findIndex((s, i) => i !== slotIndex && String(s.id) === resultIdStr)) + '</div>' : ''}
            </div>
        `;
    }).join('');

    // STEP 3: Bind click events
    grid.querySelectorAll('.lookbook-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const resultIdStr = item.dataset.resultId;
            const result = state.results.find(r => String(r.id) === resultIdStr);
            if (result) {
                selectOutfitForSlot(activePickerSlot, result);
            }
        });
    });

    // STEP 4: Show picker with animation
    picker.classList.remove('hidden');
    picker.classList.add('picker-entering');
    requestAnimationFrame(() => {
        picker.classList.remove('picker-entering');
    });
}

function closeOutfitPicker() {
    const picker = document.getElementById('lookbook-outfit-picker');
    if (picker) picker.classList.add('hidden');
    activePickerSlot = null;
}

function selectOutfitForSlot(slotIndex, result) {
    if (slotIndex < 0 || slotIndex >= lookbookSlots.length) return;

    // STEP 1: Update slot
    lookbookSlots[slotIndex] = { ...result };

    // STEP 2: Re-render images
    renderLookbookImages();

    // STEP 3: Close picker
    closeOutfitPicker();

    // STEP 4: Toast feedback
    const label = String.fromCharCode(65 + slotIndex);
    showToast(`Option ${label} ${t('lookbook.changed') || 'updated'} ✨`, 'success');
}

// ==========================================
// SOCIAL SHARE
// ==========================================

async function handleSocialShare(platform) {
    // STEP 1: Generate shareable content
    const caption = document.getElementById('lookbook-caption')?.textContent?.trim() || '';
    const shareText = caption || t('lookbook.vote_prompt') || 'Help me choose the perfect outfit! ✨';

    try {
        switch (platform) {
            case 'instagram': {
                // Instagram: download image, prompt user to share on Story
                await downloadLookbookAsImage();
                showToast(t('lookbook.share_instagram') || 'Image saved! Open Instagram to share on Story 📸', 'success');
                break;
            }
            case 'twitter': {
                // X/Twitter: open tweet composer with text
                const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + '\n\n#FitlyTryOn #OOTD')}`;
                window.open(tweetUrl, '_blank');
                showToast(t('lookbook.share_x') || 'Opening X...', 'success');
                break;
            }
            case 'telegram': {
                // Telegram: try Web Share API with file
                if (navigator.share) {
                    const blob = await generateLookbookBlob();
                    if (blob) {
                        const file = new File([blob], 'my-lookbook.png', { type: 'image/png' });
                        await navigator.share({
                            title: 'Fitly Lookbook',
                            text: shareText,
                            files: [file]
                        });
                        showToast(t('shared_success') || '✅ Shared!', 'success');
                        return;
                    }
                }
                // Fallback: Telegram share link
                const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent('https://fitly.app')}&text=${encodeURIComponent(shareText)}`;
                window.open(telegramUrl, '_blank');
                showToast(t('lookbook.share_telegram') || 'Opening Telegram...', 'success');
                break;
            }
            case 'more': {
                // Web Share API
                if (navigator.share) {
                    const blob = await generateLookbookBlob();
                    const shareData = {
                        title: 'Fitly Lookbook',
                        text: shareText,
                    };
                    if (blob) {
                        shareData.files = [new File([blob], 'my-lookbook.png', { type: 'image/png' })];
                    }
                    await navigator.share(shareData);
                    showToast(t('shared_success') || '✅ Shared!', 'success');
                } else {
                    // Fallback: copy text
                    await navigator.clipboard.writeText(shareText);
                    showToast(t('link_copied') || '📋 Copied!', 'success');
                }
                break;
            }
            default:
                break;
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.warn('[Lookbook] Share error:', error.message);
            showToast(t('cannot_share') || 'Cannot share', 'error');
        }
    }
}

// ==========================================
// COPY LINK
// ==========================================

function handleCopyLookbookLink() {
    // Generate a pseudo-link for now (future: real share URL)
    const shareId = Math.random().toString(36).substring(2, 8);
    const shareUrl = `https://fitly.app/share/${shareId}`;

    // Update the displayed URL
    const linkUrlEl = document.querySelector('.link-url');
    if (linkUrlEl) linkUrlEl.textContent = `fitly.app/share/${shareId}...`;

    navigator.clipboard.writeText(shareUrl)
        .then(() => showToast(t('link_copied') || '📋 Link copied!', 'success'))
        .catch(() => showToast(t('cannot_copy') || 'Cannot copy', 'error'));
}

// ==========================================
// CANVAS EXPORT — Download Lookbook as PNG
// ==========================================

async function generateLookbookBlob() {
    const card = document.getElementById('lookbook-card');
    if (!card) return null;

    try {
        // STEP 1: Create canvas
        const canvas = document.createElement('canvas');
        const scale = 2; // Retina quality
        const cardWidth = 400;
        const cardPadding = 40;

        // STEP 2: Load all images first
        const images = [];
        for (const slot of lookbookSlots) {
            const img = await loadImageAsync(slot.imageUrl);
            images.push(img);
        }

        // STEP 3: Calculate dimensions
        const imageHeight = 260;
        const captionText = document.getElementById('lookbook-caption')?.textContent?.trim() || '';
        const subcaptionText = document.getElementById('lookbook-subcaption')?.textContent?.trim() || '';
        const brandText = document.getElementById('lookbook-brand')?.textContent?.trim() || 'FITLY STYLIST';
        const totalHeight = 60 + imageHeight + 40 + 80 + 60 + 80; // brand + images + gap + caption + subcap + reactions

        canvas.width = cardWidth * scale;
        canvas.height = totalHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // STEP 4: Background
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, 0, 0, cardWidth, totalHeight, 0);
        ctx.fill();

        // STEP 5: Brand text
        ctx.fillStyle = '#d7ccc8';
        ctx.font = '600 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '2px';
        ctx.fillText(brandText.toUpperCase(), cardWidth / 2, 35);

        // STEP 6: Draw images
        const imgGap = 12;
        const imgStartY = 50;
        const imgWidth = images.length > 1
            ? (cardWidth - cardPadding * 2 - imgGap) / images.length
            : cardWidth - cardPadding * 2;

        images.forEach((img, i) => {
            const x = cardPadding + i * (imgWidth + imgGap);
            const aspectRatio = img.naturalWidth / img.naturalHeight;
            const drawHeight = imageHeight;
            const drawWidth = imgWidth;

            // Clip to rounded rect
            ctx.save();
            roundRect(ctx, x, imgStartY, drawWidth, drawHeight, 4);
            ctx.clip();
            // Cover fit
            const srcAspect = img.naturalWidth / img.naturalHeight;
            const dstAspect = drawWidth / drawHeight;
            let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
            if (srcAspect > dstAspect) {
                sw = img.naturalHeight * dstAspect;
                sx = (img.naturalWidth - sw) / 2;
            } else {
                sh = img.naturalWidth / dstAspect;
                sy = (img.naturalHeight - sh) / 2;
            }
            ctx.drawImage(img, sx, sy, sw, sh, x, imgStartY, drawWidth, drawHeight);

            // Option label
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            roundRect(ctx, x + 10, imgStartY + drawHeight - 32, 80, 22, 2);
            ctx.fill();
            ctx.fillStyle = '#5d4037';
            ctx.font = '600 9px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`OPTION ${String.fromCharCode(65 + i)}`, x + 16, imgStartY + drawHeight - 16);

            ctx.restore();
        });

        // STEP 7: Divider
        const dividerY = imgStartY + imageHeight + 24;
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(cardWidth / 2 - 20, dividerY, 40, 1);

        // STEP 8: Caption
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'italic 20px "Playfair Display", serif';
        ctx.textAlign = 'center';
        wrapText(ctx, captionText, cardWidth / 2, dividerY + 30, cardWidth - 60, 26);

        // STEP 9: Subcaption
        if (subcaptionText) {
            ctx.fillStyle = '#9fa8da';
            ctx.font = '700 9px sans-serif';
            ctx.fillText(subcaptionText.toUpperCase(), cardWidth / 2, dividerY + 80);
        }

        // STEP 10: Convert to blob
        return new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png', 1.0);
        });
    } catch (error) {
        console.error('[Lookbook] Canvas export error:', error);
        return null;
    }
}

async function downloadLookbookAsImage() {
    showToast(t('preparing_lookbook') || 'Preparing lookbook...', 'info');

    const blob = await generateLookbookBlob();
    if (!blob) {
        // Fallback: download first image directly
        const firstImg = lookbookSlots[0]?.imageUrl;
        if (firstImg) {
            const link = document.createElement('a');
            link.href = firstImg;
            link.download = 'my-lookbook.png';
            link.click();
        }
        return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fitly-lookbook-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(t('lookbook.download_success') || 'Lookbook saved! 📸', 'success');
}

// ==========================================
// CANVAS HELPERS
// ==========================================

function loadImageAsync(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            // Retry without crossOrigin
            const img2 = new Image();
            img2.onload = () => resolve(img2);
            img2.onerror = reject;
            img2.src = src;
        };
        img.src = src;
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line !== '') {
            ctx.fillText(line.trim(), x, currentY);
            line = word + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, currentY);
}

// ==========================================
// REACTION BUTTONS
// ==========================================

function handleReactionClick(btn) {
    // Toggle active state
    btn.classList.toggle('reaction-active');

    // Micro-animation
    btn.style.transform = 'scale(1.3)';
    setTimeout(() => {
        btn.style.transform = '';
    }, 200);
}

// ==========================================
// EVENT SETUP
// ==========================================

function setupShareLookbookEvents() {
    // Close button
    document.getElementById('close-share-btn')?.addEventListener('click', closeShareLookbook);

    // Share button (from gallery)
    document.getElementById('share-friends-btn')?.addEventListener('click', openShareLookbook);

    // Social share buttons
    document.querySelectorAll('.social-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.dataset.platform;
            if (platform) handleSocialShare(platform);
        });
    });

    // Copy link
    document.getElementById('copy-link-btn')?.addEventListener('click', handleCopyLookbookLink);

    // Download button
    document.getElementById('download-final-btn')?.addEventListener('click', downloadLookbookAsImage);

    // Reaction buttons
    document.querySelectorAll('.reaction-circle').forEach(btn => {
        btn.addEventListener('click', () => handleReactionClick(btn));
    });

    // Close picker when clicking outside
    document.getElementById('lookbook-outfit-picker')?.addEventListener('click', (e) => {
        if (e.target.id === 'lookbook-outfit-picker') {
            closeOutfitPicker();
        }
    });
}

// Init after DOM ready
setupShareLookbookEvents();

// ==========================================
// EXPOSE
// ==========================================
window.openShareLookbook = openShareLookbook;
window.closeShareLookbook = closeShareLookbook;
window.closeOutfitPicker = closeOutfitPicker;
window.openOutfitPicker = openOutfitPicker;
window.downloadLookbookCard = downloadLookbookAsImage; // Override legacy
