/**
 * File: image_lightbox.js
 * Purpose: Lightbox phóng to ảnh kết quả try-on với zoom, pan, và keyboard controls
 * Layer: UI / Presentation
 *
 * Input: Image URL từ inline result section
 * Output: Fullscreen lightbox overlay với zoom/pan/download
 *
 * Flow:
 * 1. Click ảnh result hoặc nút zoom → openLightbox()
 * 2. Scroll/pinch → zoom in/out (1x → 5x)
 * 3. Drag khi đã zoom → pan ảnh
 * 4. Esc / click backdrop / nút close → closeLightbox()
 *
 * Controls: Zoom In (+) · Zoom Out (-) · Fit Screen · Download · Close (Esc)
 * Supported: Mouse wheel zoom · Touch pinch zoom · Drag-to-pan · Keyboard shortcuts
 */

(function () {
    // STEP 1: DOM references
    const overlay = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-image');
    const zoomLevelEl = document.getElementById('lightbox-zoom-level');
    const closeBtn = document.getElementById('lightbox-close');
    const zoomInBtn = document.getElementById('lightbox-zoom-in');
    const zoomOutBtn = document.getElementById('lightbox-zoom-out');
    const resetBtn = document.getElementById('lightbox-reset');
    const downloadBtn = document.getElementById('lightbox-download');
    const content = overlay?.querySelector('.lightbox-content');

    if (!overlay || !lightboxImg) return;

    // STEP 2: Zoom state
    let currentScale = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let lastPanX = 0;
    let lastPanY = 0;

    const MIN_SCALE = 0.5;
    const MAX_SCALE = 5;
    const ZOOM_STEP = 0.3;

    // STEP 3: Open lightbox
    function openLightbox(imageSrc) {
        if (!imageSrc) return;
        lightboxImg.src = imageSrc;
        currentScale = 1;
        panX = 0;
        panY = 0;
        applyTransform();
        overlay.classList.remove('hidden', 'closing');
        document.body.style.overflow = 'hidden';
    }

    // STEP 4: Close lightbox with animation
    function closeLightbox() {
        overlay.classList.add('closing');
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('closing');
            document.body.style.overflow = '';
            lightboxImg.src = '';
        }, 200);
    }

    // STEP 5: Apply zoom + pan transform
    function applyTransform() {
        lightboxImg.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale})`;
        zoomLevelEl.textContent = `${Math.round(currentScale * 100)}%`;
    }

    // STEP 6: Zoom functions
    function zoomIn() {
        currentScale = Math.min(MAX_SCALE, currentScale + ZOOM_STEP);
        applyTransform();
    }

    function zoomOut() {
        currentScale = Math.max(MIN_SCALE, currentScale - ZOOM_STEP);
        // Reset pan if zoomed out to fit
        if (currentScale <= 1) { panX = 0; panY = 0; }
        applyTransform();
    }

    function resetZoom() {
        currentScale = 1;
        panX = 0;
        panY = 0;
        applyTransform();
    }

    // STEP 7: Mouse wheel zoom (centered on cursor)
    content?.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale + delta));

        // Zoom toward cursor position
        const rect = lightboxImg.getBoundingClientRect();
        const offsetX = e.clientX - rect.left - rect.width / 2;
        const offsetY = e.clientY - rect.top - rect.height / 2;
        const scaleFactor = newScale / currentScale;

        panX = panX - offsetX * (scaleFactor - 1);
        panY = panY - offsetY * (scaleFactor - 1);
        currentScale = newScale;

        if (currentScale <= 1) { panX = 0; panY = 0; }
        applyTransform();
    }, { passive: false });

    // STEP 8: Mouse drag to pan (only when zoomed > 1x)
    content?.addEventListener('mousedown', (e) => {
        if (e.target === lightboxImg && currentScale > 1) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            lastPanX = panX;
            lastPanY = panY;
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panX = lastPanX + (e.clientX - dragStartX);
        panY = lastPanY + (e.clientY - dragStartY);
        applyTransform();
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // STEP 9: Touch support (pinch-to-zoom + drag)
    let touchStartDist = 0;
    let touchStartScale = 1;
    let touchStartPanX = 0;
    let touchStartPanY = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    content?.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch start
            touchStartDist = getTouchDistance(e.touches);
            touchStartScale = currentScale;
            e.preventDefault();
        } else if (e.touches.length === 1 && currentScale > 1) {
            // Single touch drag start
            isDragging = true;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartPanX = panX;
            touchStartPanY = panY;
        }
    }, { passive: false });

    content?.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom
            const dist = getTouchDistance(e.touches);
            const scale = touchStartScale * (dist / touchStartDist);
            currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
            if (currentScale <= 1) { panX = 0; panY = 0; }
            applyTransform();
            e.preventDefault();
        } else if (e.touches.length === 1 && isDragging) {
            // Single touch pan
            panX = touchStartPanX + (e.touches[0].clientX - touchStartX);
            panY = touchStartPanY + (e.touches[0].clientY - touchStartY);
            applyTransform();
            e.preventDefault();
        }
    }, { passive: false });

    content?.addEventListener('touchend', () => {
        isDragging = false;
        touchStartDist = 0;
    });

    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // STEP 10: Double-click to toggle zoom
    content?.addEventListener('dblclick', (e) => {
        if (currentScale > 1) {
            resetZoom();
        } else {
            // Zoom to 2.5x centered on click
            currentScale = 2.5;
            const rect = lightboxImg.getBoundingClientRect();
            const offsetX = e.clientX - rect.left - rect.width / 2;
            const offsetY = e.clientY - rect.top - rect.height / 2;
            panX = -offsetX * 1.5;
            panY = -offsetY * 1.5;
            applyTransform();
        }
    });

    // STEP 11: Button event listeners
    closeBtn?.addEventListener('click', closeLightbox);
    zoomInBtn?.addEventListener('click', zoomIn);
    zoomOutBtn?.addEventListener('click', zoomOut);
    resetBtn?.addEventListener('click', resetZoom);

    // Click backdrop to close
    overlay.querySelector('.lightbox-backdrop')?.addEventListener('click', closeLightbox);

    // Download button
    downloadBtn?.addEventListener('click', async () => {
        const src = lightboxImg.src;
        if (!src) return;
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fitly-tryon-${Date.now()}.png`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            const link = document.createElement('a');
            link.href = src;
            link.download = `fitly-tryon-${Date.now()}.png`;
            link.click();
        }
    });

    // STEP 12: Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (overlay.classList.contains('hidden')) return;

        switch (e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case '+':
            case '=':
                zoomIn();
                break;
            case '-':
                zoomOut();
                break;
            case '0':
                resetZoom();
                break;
        }
    });

    // STEP 13: Triggers — click ảnh result hoặc nút zoom
    const resultZoomTrigger = document.getElementById('result-zoom-trigger');
    resultZoomTrigger?.addEventListener('click', (e) => {
        const resultImg = document.getElementById('inline-result-image');
        if (resultImg?.src && resultImg.src !== window.location.href) {
            openLightbox(resultImg.src);
        }
    });

    const zoomBtn = document.getElementById('result-zoom-btn');
    zoomBtn?.addEventListener('click', () => {
        const resultImg = document.getElementById('inline-result-image');
        if (resultImg?.src && resultImg.src !== window.location.href) {
            openLightbox(resultImg.src);
        }
    });

    // STEP 14: Expose ra window cho gallery/history cũng có thể dùng
    window.openImageLightbox = openLightbox;
    window.closeLightbox = closeLightbox;
})();
