/**
 * File: sidebar.js
 * Purpose: Orchestrator chính - khởi tạo và kết nối tất cả modules
 * Layer: Application
 *
 * Input: Tất cả modules được load qua script tags trong index.html
 * Output: Extension sidebar hoạt động đầy đủ
 *
 * Flow:
 * 1. init() → async orchestrate khởi tạo tất cả modules
 * 2. loadLanguagePreference() → apply locale preference
 * 3. initProfileMenuEvents() → bind profile dropdown events
 * 4. renderCreatedOutfitsList() → hiển thị outfits ban đầu
 *
 * IMPORTANT: File này KHÔNG chứa business logic.
 * Mọi logic đã được tách vào thư mục modules/
 */

// ==========================================
// INIT ORCHESTRATOR
// ==========================================

async function init() {
    // Hiển thị loading ngay lập tức
    showSidebarLoading();

    // Race: auth check vs 5s timeout
    const authCheckPromise = checkAuthState();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 5000));
    const result = await Promise.race([authCheckPromise, timeoutPromise]);

    if (result === 'TIMEOUT') {
        console.warn('[Fitly] Auth check timed out, showing auth section');
        hideSidebarLoading();
        showAuthSection();
    }

    // FIX: await authCheckPromise (không phải race result) để đảm bảo auth_token có sẵn
    // trước khi loadUserModels() gọi API Supabase. Nếu auth done rồi thì resolve ngay.
    await authCheckPromise.catch(() => { }); // không bao giờ reject, chỉ đảm bảo auth settle

    // Khởi tạo các modules
    initWardrobe();
    await loadUserModels();
    await loadModelImage();
    await checkPendingImage();
    await loadHiddenClothingIds(); // Load hidden state before rendering clothing
    await loadRecentClothing();
    await loadSelectedItems();
    await checkPendingClothingImage();
    await loadResults();

    // Setup UI interactions
    setupEventListeners();
    setupInfiniteScroll();
    initCategoryTabs();
    initMixMatchToggle();
    initTooltipSystem();
    setupMainImageClickHandler();
    initAddWardrobeModal();
    listenForMessages();
    listenForStorageChanges();
    setupAuthStateListener();

    // Add initialization for the new compare slider
    if (window.initializeCompareSlider) {
        window.initializeCompareSlider();
    }

    // Cleanup expired image cache
    if (window.imageCache) {
        window.imageCache.cleanupExpiredCache();
    }

    // CSP-compliant: error handlers cho static images
    document.querySelectorAll('img.social-icon-img').forEach(img => {
        img.addEventListener('error', function () {
            this.style.display = 'none';
        }, { once: true });
    });

    // Render danh sách outfits đã tạo — SAU khi auth đã done
    // để GET_OUTFITS có auth token và fetch từ Supabase thay vì fallback local
    renderCreatedOutfitsList();

    console.log('[Fitly] Sidebar initialized successfully with modular architecture');
}

// ==========================================
// START APPLICATION
// ==========================================

// Khởi tạo ứng dụng
init();

// Load ngôn ngữ preference
loadLanguagePreference();

// Khởi tạo profile menu events
initProfileMenuEvents();
