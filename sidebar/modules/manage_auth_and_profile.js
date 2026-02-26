/**
 * File: manage_auth_and_profile.js
 * Purpose: Xác thực người dùng, hiển thị auth/main/loading sections, profile menu
 * Layer: Application
 *
 * Input: Messages từ service worker (GET_AUTH_STATE, LOGOUT, SOCIAL_LOGIN)
 * Output: Cập nhật state.user, state.profile, state.gemsBalance; điều hướng UI sections
 *
 * Flow:
 * 1. checkAuthState → gọi service worker → update state → showMainContent/showAuthSection
 * 2. showSidebarLoading / hideSidebarLoading / showAuthSection / showMainContent
 * 3. updateUI → sync toàn bộ DOM với state
 * 4. toggleProfileMenu / updateProfileMenuContent → dropdown profile
 * 5. setupAuthStateListener → lắng nghe storage changes
 */

function showSidebarLoading() {
    elements.sidebarLoadingSection?.classList.remove('hidden');
    elements.authSection?.classList.add('hidden');
    elements.mainContent?.classList.add('hidden');
}

function hideSidebarLoading() {
    elements.sidebarLoadingSection?.classList.add('hidden');
}

function showAuthSection() {
    hideSidebarLoading();
    elements.authSection?.classList.remove('hidden');
    elements.mainContent?.classList.add('hidden');
}

function showMainContent() {
    hideSidebarLoading();
    elements.authSection?.classList.add('hidden');
    elements.mainContent?.classList.remove('hidden');
}

function showDemoBanner() {
    const demoBanner = document.getElementById('demo-banner');
    if (demoBanner) demoBanner.classList.remove('hidden');
}

function hideDemoBanner() {
    const demoBanner = document.getElementById('demo-banner');
    if (demoBanner) demoBanner.classList.add('hidden');
}

async function checkAuthState() {
    const _ts = new Date().toISOString();
    console.log('[DEBUG-SIDEBAR-AUTH] ========== checkAuthState START ==========');
    console.log('[DEBUG-SIDEBAR-AUTH] Timestamp:', _ts);
    console.log('[DEBUG-SIDEBAR-AUTH] state.authenticated (before):', state.authenticated);

    // STEP 0: Proactive — yêu cầu background refresh token nếu gần hết hạn
    try {
        await chrome.runtime.sendMessage({ type: 'ENSURE_FRESH_TOKEN' });
        console.log('[DEBUG-SIDEBAR-AUTH] ENSURE_FRESH_TOKEN sent OK');
    } catch (ensureErr) {
        console.warn('[DEBUG-SIDEBAR-AUTH] ENSURE_FRESH_TOKEN failed:', ensureErr.message);
    }

    try {
        console.log('[DEBUG-SIDEBAR-AUTH] Sending GET_AUTH_STATE...');
        const sendStart = Date.now();
        const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
        const sendTime = Date.now() - sendStart;
        console.log('[DEBUG-SIDEBAR-AUTH] GET_AUTH_STATE response in', sendTime, 'ms');
        console.log('[DEBUG-SIDEBAR-AUTH] response.success:', response?.success);
        console.log('[DEBUG-SIDEBAR-AUTH] response.authenticated:', response?.authenticated);
        console.log('[DEBUG-SIDEBAR-AUTH] response.user?.id:', response?.user?.id || 'N/A');
        console.log('[DEBUG-SIDEBAR-AUTH] response.gemsBalance:', response?.gemsBalance);
        console.log('[DEBUG-SIDEBAR-AUTH] response.offline:', response?.offline || false);

        if (response?.success && response.authenticated) {
            const wasUnauthenticated = !state.authenticated;
            console.log('[DEBUG-SIDEBAR-AUTH] ✅ Authenticated! wasUnauthenticated:', wasUnauthenticated);
            state.authenticated = true;
            state.user = response.user;
            state.profile = response.profile;
            state.gemsBalance = response.gemsBalance || response.profile?.gems_balance || 0;
            updateUI();
            showMainContent();

            // FIX: Sau khi login, reload models từ cloud để đồng bộ ảnh toàn thân mặc định.
            const noModelLoaded = !state.modelImage && state.userModels.length === 0;
            if (wasUnauthenticated || noModelLoaded) {
                console.log('[DEBUG-SIDEBAR-AUTH] Reloading user data from cloud...');
                if (typeof window.loadUserModels === 'function') {
                    await window.loadUserModels();
                    if (typeof window.loadModelImage === 'function') {
                        await window.loadModelImage();
                    }
                }
                if (typeof window.loadRecentClothing === 'function') {
                    window.loadRecentClothing().catch(() => { });
                }
                if (typeof window.initMixMatchToggle === 'function') {
                    window.initMixMatchToggle();
                }
                if (typeof window.renderCreatedOutfitsList === 'function') {
                    window.renderCreatedOutfitsList();
                }
                if (typeof window.loadResults === 'function') {
                    window.loadResults().catch(() => { });
                }
                console.log('[DEBUG-SIDEBAR-AUTH] Cloud data reload done');
            }
        } else {
            console.log('[DEBUG-SIDEBAR-AUTH] ❌ Not authenticated — showing auth section');
            console.log('[DEBUG-SIDEBAR-AUTH] Full response:', JSON.stringify(response));
            state.authenticated = false;
            state.user = null;
            state.profile = null;
            state.gemsBalance = 0;
            state.userModels = [];
            state.modelImage = null;
            state.selectedModelId = null;
            state.defaultModelId = null;
            state.clothingImage = null;
            state.selectedItems = [];
            state.recentClothing = [];
            state.results = [];
            state.nextResultId = 1;
            state.resultImage = null;
            state.hiddenOutfitIds = [];
            updateUI();
            showAuthSection();
            // Hide data-dependent sections to prevent stale views
            const outfitsSection = document.getElementById('created-outfits-list-section');
            if (outfitsSection) outfitsSection.classList.add('hidden');
            const outfitsList = document.getElementById('created-outfits-list');
            if (outfitsList) outfitsList.innerHTML = '';
            const modelsGrid = document.getElementById('user-models-grid');
            if (modelsGrid) modelsGrid.innerHTML = '';
            const quickCarousel = document.getElementById('quick-wardrobe-carousel');
            if (quickCarousel) {
                quickCarousel.innerHTML = '';
                // Also hide entire container (parent has title "Lịch sử item đã thử")
                const carouselContainer = quickCarousel.closest('.quick-wardrobe-carousel-container');
                if (carouselContainer) carouselContainer.classList.add('hidden');
            }
            const resultSection = document.getElementById('inline-result-section');
            if (resultSection) resultSection.classList.add('hidden');
            if (typeof updateGalleryUI === 'function') updateGalleryUI();
        }
    } catch (error) {
        console.error('[DEBUG-SIDEBAR-AUTH] ❌ checkAuthState EXCEPTION:', error);
        console.error('[DEBUG-SIDEBAR-AUTH] Error name:', error.name, '| message:', error.message);
        console.error('[DEBUG-SIDEBAR-AUTH] Stack:', error.stack);
        showAuthSection();
    }
    console.log('[DEBUG-SIDEBAR-AUTH] ========== checkAuthState END ==========');
}

function updateUI() {
    // Auth visibility
    if (!state.authenticated && !elements.mainContent?.classList.contains('hidden')) {
        // guest mode oke
    }

    // Gems display
    if (elements.gemsCount) elements.gemsCount.textContent = state.gemsBalance;
    if (elements.gemsDisplay) {
        elements.gemsDisplay.style.display = (state.authenticated || state.gemsBalance > 0) ? '' : 'none';
    }

    // Profile button
    if (elements.profileBtn) {
        const avatarUrl = state.profile?.avatar_url;
        const displayName = state.profile?.full_name || state.user?.email || 'G';
        const initial = displayName.charAt(0).toUpperCase();
        if (state.authenticated && avatarUrl) {
            elements.profileBtn.innerHTML = `<div class="profile-avatar-container"><img class="avatar-img" src="${avatarUrl}" alt="Avatar" data-avatar-fallback="true"><div class="avatar-fallback" style="display:none;">${initial}</div></div>`;
            const avatarImg = elements.profileBtn.querySelector('img[data-avatar-fallback]');
            if (avatarImg) {
                avatarImg.addEventListener('error', function () {
                    this.style.display = 'none';
                    if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
                }, { once: true });
            }
        } else if (state.authenticated) {
            elements.profileBtn.innerHTML = `<div class="profile-avatar-container"><div class="avatar-fallback">${initial}</div></div>`;
        } else {
            elements.profileBtn.innerHTML = `<div class="profile-avatar-container"><div class="avatar-fallback" style="background:#e5e7eb;color:#9ca3af;"><span class="material-symbols-outlined" style="font-size:18px;">person</span></div></div>`;
        }
    }

    // Model image
    console.log('[UpdateUI] model section check:', {
        hasModelImageEl: !!elements.modelImage,
        hasPlaceholderEl: !!elements.modelPlaceholder,
        hasContainerEl: !!elements.modelImageContainer,
        stateModelImage: state.modelImage ? (state.modelImage.slice(0, 50) + '...') : 'null'
    });
    if (elements.modelImage && elements.modelPlaceholder && elements.modelImageContainer) {
        if (state.modelImage) {
            // Reset CORS-fix flags khi src thay đổi (cùng pattern với clothing image)
            const modelSrcChanged = elements.modelImage.src !== state.modelImage;
            if (modelSrcChanged) {
                delete elements.modelImage.dataset.errorBound;
                delete elements.modelImage.dataset.fixed;
            }
            elements.modelImage.src = state.modelImage;
            elements.modelImage.setAttribute('referrerpolicy', 'no-referrer');
            elements.modelImage.classList.remove('hidden');
            elements.modelPlaceholder.classList.add('hidden');
            elements.modelImageContainer.classList.add('has-image');
            renderMainImageActions();
            console.log('[UpdateUI] ✅ Model image rendered. src length =', state.modelImage.length);
            // Error handler cho ảnh model — re-attach khi src thay đổi
            if (!elements.modelImage.dataset.errorBound) {
                elements.modelImage.dataset.errorBound = 'true';
                elements.modelImage.addEventListener('error', function () {
                    console.error('[UpdateUI] ❌ Model image FAILED to load! src =', this.src?.slice(0, 80));
                    if (window.fixBrokenImage) fixBrokenImage(this);
                }, { once: true });
            }
        } else {
            elements.modelImage.classList.add('hidden');
            elements.modelPlaceholder.classList.remove('hidden');
            elements.modelImageContainer.classList.remove('has-image');
            removeMainImageActions();
            console.log('[UpdateUI] ℹ️ No model image - showing placeholder');
        }
    } else {
        console.warn('[UpdateUI] ⚠️ Model image elements NOT FOUND in DOM!', {
            modelImage: elements.modelImage,
            placeholder: elements.modelPlaceholder,
            container: elements.modelImageContainer
        });
    }

    // Clothing / selected items display
    renderSelectedBubbles();

    // Clothing image (legacy)
    if (elements.clothingImage && elements.clothingPlaceholder && elements.clothingImageContainer) {
        const clearBtn = document.getElementById('clear-clothing-selection-btn');
        if (state.clothingImage) {
            // Reset CORS-fix flags khi src thay đổi để error handler có thể fire lại
            // Bug cũ: errorBound + { once: true } khiến ảnh mới fail CORS nhưng không có handler
            const srcChanged = elements.clothingImage.src !== state.clothingImage;
            if (srcChanged) {
                delete elements.clothingImage.dataset.errorBound;
                delete elements.clothingImage.dataset.fixed;
            }
            elements.clothingImage.src = state.clothingImage;
            elements.clothingImage.setAttribute('referrerpolicy', 'no-referrer');
            elements.clothingImage.classList.remove('hidden');
            elements.clothingPlaceholder.classList.add('hidden');
            if (clearBtn) clearBtn.classList.remove('hidden');
            // Error handler cho ảnh clothing — re-attach mỗi khi src thay đổi
            if (!elements.clothingImage.dataset.errorBound) {
                elements.clothingImage.dataset.errorBound = 'true';
                elements.clothingImage.addEventListener('error', function () {
                    if (window.fixBrokenImage) fixBrokenImage(this);
                }, { once: true });
            }
        } else {
            elements.clothingImage.classList.add('hidden');
            elements.clothingPlaceholder.classList.remove('hidden');
            if (clearBtn) clearBtn.classList.add('hidden');
        }
    }

    // Try-on button state
    if (elements.tryOnBtn) {
        const hasModel = !!state.modelImage;
        const hasClothing = state.selectedItems.length > 0;
        const hasGems = state.gemsBalance >= GEM_COST_STANDARD;
        const triesRemaining = Math.floor(state.gemsBalance / GEM_COST_STANDARD);

        elements.tryOnBtn.disabled = !hasModel || !hasClothing || !hasGems || state.isProcessing;

        if (state.isProcessing) {
            elements.tryOnBtn.innerHTML = `<span class="btn-spinner"></span> ${t('processing')}...`;
        } else if (!hasModel || !hasClothing) {
            elements.tryOnBtn.innerHTML = `✨ ${t('try_on_button.try_now')} <span class="gem-cost">(${triesRemaining} ${t('tries_remaining')})</span>`;
        } else if (!hasGems) {
            elements.tryOnBtn.innerHTML = `💎 ${t('try_on_button.not_enough_gems')}`;
        } else {
            elements.tryOnBtn.innerHTML = `✨ ${t('try_on_button.try_now')} <span class="gem-cost">(${triesRemaining} ${t('tries_remaining')})</span>`;
        }
    }

    // Result section
    if (elements.resultCount) {
        elements.resultCount.textContent = `${state.results.length} ${t('results').toLowerCase()}`;
    }

    // Demo/guest banner
    if (!state.authenticated && state.gemsBalance > 0) {
        showDemoBanner();
    } else {
        hideDemoBanner();
    }
}

// ==========================================
// OVERLAY HELPERS
// ==========================================

let loadingMessageInterval = null;
let loadingMessageIndex = 0;

function showLoading(show, text = null) {
    state.isProcessing = show;
    if (elements.loadingOverlay) elements.loadingOverlay.classList.toggle('hidden', !show);

    if (show) {
        if (text && elements.loadingText) {
            elements.loadingText.textContent = text;
            if (loadingMessageInterval) { clearInterval(loadingMessageInterval); loadingMessageInterval = null; }
        } else {
            loadingMessageIndex = 0;
            updateLoadingMessage();
            loadingMessageInterval = setInterval(() => { loadingMessageIndex++; updateLoadingMessage(); }, 2500);
        }
        const tipElement = document.getElementById('loading-tip');
        if (tipElement) tipElement.textContent = '💡 ' + t('loading_tip');
    } else {
        if (loadingMessageInterval) { clearInterval(loadingMessageInterval); loadingMessageInterval = null; }
    }
    updateUI();
}

function updateLoadingMessage() {
    if (elements.loadingText) {
        const { getLoadingMessage, LOADING_MESSAGES } = window.i18nHelpers || {};
        if (getLoadingMessage) {
            elements.loadingText.textContent = getLoadingMessage(loadingMessageIndex, state.locale);
        } else {
            const fallback = ['Đang tìm phong cách hoàn hảo... ✨', 'AI stylist đang làm phép... 🪄', 'Sắp xong rồi, đẹp lắm! 💫'];
            elements.loadingText.textContent = fallback[loadingMessageIndex % fallback.length];
        }
    }
}

function updateProgress(percent) {
    if (elements.loadingProgressBar) elements.loadingProgressBar.style.width = `${percent}%`;
    const progressText = document.getElementById('loading-progress-text');
    if (progressText) progressText.textContent = percent > 0 ? `${Math.round(percent)}%` : '...';
}

function showErrorOverlay(show, message = null) {
    if (elements.errorOverlay) {
        elements.errorOverlay.classList.toggle('hidden', !show);
        if (show && message && elements.errorMessageText) elements.errorMessageText.textContent = message;
    }
}

function showSuccessOverlay(show, message = null) {
    if (elements.successOverlay) {
        elements.successOverlay.classList.toggle('hidden', !show);
        if (show && message && elements.successMessageText) elements.successMessageText.textContent = message;
    }
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    const delay = (type === 'warning' || type === 'error') ? 5000 : 3000;
    setTimeout(() => toast.remove(), delay);
}

// ==========================================
// EMAIL AUTH (Đăng nhập / Đăng ký thủ công)
// ==========================================

/**
 * handleEmailLoginSubmit - Đọc form, validate, gọi service worker EMAIL_LOGIN
 * Flow: validate → setLoading → sendMessage → update state → showMainContent
 */
async function handleEmailLoginSubmit() {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    // Validate client-side trước
    if (!email || !password) {
        showToast('Vui lòng nhập email và mật khẩu.', 'error');
        return;
    }

    // Loading state
    const originalText = submitBtn?.textContent;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang đăng nhập...'; }

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'EMAIL_LOGIN',
            data: { email, password },
        });

        if (response?.success) {
            state.authenticated = true;
            state.user = response.user;
            state.profile = response.profile;
            state.gemsBalance = response.gemsBalance || response.profile?.gems_balance || 0;
            updateUI();
            showMainContent();
            showToast('Đăng nhập thành công! 🎉', 'success');
            // Clear form
            if (emailInput) emailInput.value = '';
            if (passwordInput) passwordInput.value = '';
        } else {
            showToast(response?.error || 'Đăng nhập thất bại.', 'error');
        }
    } catch (error) {
        console.error('[Fitly] Login submit error:', error);
        showToast('Lỗi kết nối. Vui lòng thử lại.', 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
    }
}

/**
 * handleEmailRegisterSubmit - Đọc form, validate, gọi service worker EMAIL_REGISTER
 * Flow: validate (gồm confirm password) → setLoading → sendMessage → hiện thông báo
 */
async function handleEmailRegisterSubmit() {
    const nameInput = document.getElementById('register-name');
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm-password');
    const submitBtn = document.getElementById('register-submit-btn');

    const fullName = nameInput?.value?.trim();
    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;
    const confirmPassword = confirmInput?.value;

    // Validate client-side
    if (!email || !password) {
        showToast('Vui lòng nhập email và mật khẩu.', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('Mật khẩu phải có ít nhất 6 ký tự.', 'error');
        return;
    }
    if (password !== confirmPassword) {
        showToast('Mật khẩu xác nhận không khớp.', 'error');
        confirmInput?.focus();
        return;
    }

    // Loading state
    const originalText = submitBtn?.textContent;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang đăng ký...'; }

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'EMAIL_REGISTER',
            data: { email, password, fullName },
        });

        if (response?.success) {
            if (response.authenticated) {
                // Auto-confirmed → user đã được đăng nhập trực tiếp
                state.authenticated = true;
                state.user = response.user;
                state.profile = response.profile;
                state.gemsBalance = response.gemsBalance || response.profile?.gems_balance || 0;
                updateUI();
                showMainContent();
                showToast('Tạo tài khoản thành công! 🎉', 'success');
            } else if (response.needsVerification) {
                // Yêu cầu xác nhận email → hiện thông báo, chuyển sang tab login
                showToast('✉️ Vui lòng kiểm tra email để xác nhận tài khoản!', 'success');
                // Chuyển sang tab đăng nhập
                document.querySelector('.auth-tab[data-tab="login"]')?.click();
                // Pre-fill email
                const loginEmail = document.getElementById('login-email');
                if (loginEmail) loginEmail.value = email;
            } else {
                // Fallback: check auth state
                await checkAuthState();
                showToast('Tạo tài khoản thành công! 🎉', 'success');
            }
            // Clear form
            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (confirmInput) confirmInput.value = '';
        } else {
            showToast(response?.error || 'Đăng ký thất bại.', 'error');
        }
    } catch (error) {
        console.error('[Fitly] Register submit error:', error);
        showToast('Lỗi kết nối. Vui lòng thử lại.', 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
    }
}

// ==========================================
// SOCIAL LOGIN
// ==========================================

async function handleSocialLogin(provider) {
    try {
        showToast(t('opening_login', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) }), 'info');
        const response = await chrome.runtime.sendMessage({ type: 'SOCIAL_LOGIN', data: { provider } });
        if (response?.success) {
            await checkAuthState();
            showToast(t('login_success'), 'success');
        } else {
            showToast(response?.error || t('login_error'), 'error');
        }
    } catch (error) {
        console.error('[Fitly] Social login error:', error);
        showToast(t('login_error'), 'error');
    }
}

async function handleLogout() {
    if (!confirm('Bạn có chắc chắn muốn đăng xuất?')) return;
    showLoading(true, 'Đang đăng xuất...');
    try {
        const response = await chrome.runtime.sendMessage({ type: 'LOGOUT' });
        if (response?.success) {
            state.authenticated = false;
            state.user = null;
            state.profile = null;
            state.gemsBalance = 0;
            // Clear results để tránh leak data giữa các user
            state.results = [];
            state.nextResultId = 1;
            state.resultImage = null;
            // Clear all user-specific data to prevent stale views
            state.modelImage = null;
            state.clothingImage = null;
            state.selectedItems = [];
            state.userModels = [];
            state.defaultModelId = null;
            state.selectedModelId = null;
            state.recentClothing = [];
            state.hiddenOutfitIds = [];
            state.showHiddenOutfits = false;
            try {
                await chrome.storage.local.remove('fitly_results');
            } catch (_) { /* ignore storage error */ }
            showAuthSection();
            updateUI();
            updateGalleryUI();
            // Hide created outfits section and clear its content
            const outfitsSection = document.getElementById('created-outfits-list-section');
            if (outfitsSection) outfitsSection.classList.add('hidden');
            const outfitsList = document.getElementById('created-outfits-list');
            if (outfitsList) outfitsList.innerHTML = '';
            // Clear user models grid
            const modelsGrid = document.getElementById('user-models-grid');
            if (modelsGrid) modelsGrid.innerHTML = '';
            // Clear quick wardrobe carousel
            const quickCarousel = document.getElementById('quick-wardrobe-carousel');
            if (quickCarousel) quickCarousel.innerHTML = '';
            // Clear inline result section
            const resultSection = document.getElementById('inline-result-section');
            if (resultSection) resultSection.classList.add('hidden');
            showToast('Đã đăng xuất thành công', 'info');
        } else {
            showToast(response?.error || 'Lỗi khi đăng xuất', 'error');
        }
    } catch (error) {
        showToast('Lỗi khi đăng xuất', 'error');
    } finally {
        showLoading(false);
        document.getElementById('profile-menu')?.classList.add('hidden');
    }
}

// ==========================================
// PROFILE MENU
// ==========================================

function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    const gemsPanel = document.getElementById('gems-panel');
    const languagePanel = document.getElementById('language-panel');
    if (!menu) return;

    if (gemsPanel && !gemsPanel.classList.contains('hidden')) hideGemsPanel();
    if (languagePanel && !languagePanel.classList.contains('hidden')) hideLanguagePanel();

    if (menu.classList.contains('hidden')) {
        updateProfileMenuContent();
        menu.classList.remove('hidden');
        setTimeout(() => document.addEventListener('click', closeProfileMenuOnOutsideClick), 10);
    } else {
        hideProfileMenu();
    }
}

function closeProfileMenuOnOutsideClick(e) {
    const menu = document.getElementById('profile-menu');
    if (menu && !menu.contains(e.target) && !elements.profileBtn?.contains(e.target)) {
        menu.classList.add('hidden');
        document.removeEventListener('click', closeProfileMenuOnOutsideClick);
    }
}

function hideProfileMenu() {
    document.getElementById('profile-menu')?.classList.add('hidden');
    document.removeEventListener('click', closeProfileMenuOnOutsideClick);
}

async function updateProfileMenuContent() {
    const avatar = document.getElementById('menu-avatar');
    const username = document.getElementById('menu-username');
    const email = document.getElementById('menu-email');
    const cacheSize = document.getElementById('menu-cache-size');
    const currentLangCode = document.getElementById('current-lang-code');

    const avatarUrl = state.profile?.avatar_url;
    const displayName = state.profile?.full_name || state.user?.email || 'Guest';
    const initial = displayName.charAt(0).toUpperCase();

    if (avatar) {
        if (state.authenticated && avatarUrl) {
            avatar.innerHTML = `<img src="${avatarUrl}" alt="Avatar" data-avatar-fallback="true"><div style="display:none;">${initial}</div>`;
            avatar.querySelector('img[data-avatar-fallback]')?.addEventListener('error', function () {
                this.style.display = 'none';
                if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
            }, { once: true });
        } else {
            avatar.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${state.authenticated ? 'linear-gradient(135deg,#f97316,#ec4899)' : '#eee'};color:${state.authenticated ? 'white' : '#999'};">${state.authenticated ? initial : '<span class="material-symbols-outlined">person</span>'}</div>`;
        }
    }

    if (username) username.textContent = state.authenticated ? (state.profile?.full_name || state.user?.email?.split('@')[0]) : t('guest');
    if (email) {
        const userEmail = state.user?.email || '';
        email.textContent = state.authenticated ? (userEmail.includes('@') ? userEmail.split('@')[0] + '@fitly.ai' : userEmail) : t('not_signed_in');
    }

    const langFlags = { vi: '🇻🇳', en: '🇺🇸', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳', th: '🇹🇭', id: '🇮🇩' };
    if (currentLangCode) { currentLangCode.textContent = langFlags[state.locale] || state.locale.toUpperCase(); currentLangCode.style.fontSize = '20px'; }

    document.querySelectorAll('.auth-only').forEach(el => {
        el.style.display = state.authenticated ? 'flex' : 'none';
    });
    document.querySelectorAll('.guest-only').forEach(el => {
        el.style.display = state.authenticated ? 'none' : 'flex';
    });

    if (cacheSize && window.imageCache && state.authenticated) {
        try {
            const stats = await window.imageCache.getCacheStats();
            cacheSize.textContent = `${stats.totalSizeMB} MB`;
        } catch (e) { cacheSize.textContent = '0 MB'; }
    }
}

function initProfileMenuEvents() {
    document.getElementById('menu-language')?.addEventListener('click', () => { toggleLanguagePanel(); hideProfileMenu(); });
    document.getElementById('menu-webapp')?.addEventListener('click', () => { chrome.tabs.create({ url: 'http://localhost:3000' }); hideProfileMenu(); });
    document.getElementById('menu-wardrobe')?.addEventListener('click', () => { openWardrobe(); hideProfileMenu(); });
    document.getElementById('menu-cache-settings')?.addEventListener('click', async () => {
        if (!window.imageCache) return;
        const stats = await window.imageCache.getCacheStats();
        if (confirm(t('cache_info', { count: stats.count, size: stats.totalSizeMB }))) {
            await window.imageCache.clearAllCachedImages();
            showToast(t('cache_cleared'), 'success');
            updateProfileMenuContent();
        }
        hideProfileMenu();
    });
    document.getElementById('menu-help')?.addEventListener('click', () => { if (typeof openHelpPage === 'function') openHelpPage(); hideProfileMenu(); });
    document.getElementById('menu-credits')?.addEventListener('click', () => { toggleGemsPanel(); hideProfileMenu(); });
    document.getElementById('menu-logout')?.addEventListener('click', async () => {
        hideProfileMenu();
        await handleLogout();
    });
    document.getElementById('menu-login')?.addEventListener('click', () => { hideProfileMenu(); showAuthSection(); });
}

function setupAuthStateListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        // Monitor Supabase ChromeStorageAdapter key (fitly-auth-token)
        // Legacy auth_token key is no longer written
        if (changes['fitly-auth-token']) {
            const { oldValue: oldSession, newValue: newSession } = changes['fitly-auth-token'];
            console.log('[DEBUG-SIDEBAR-STORAGE] fitly-auth-token changed at', new Date().toISOString());

            // Parse to check if access_token changed
            const oldToken = typeof oldSession === 'string' ? JSON.parse(oldSession)?.access_token : oldSession?.access_token;
            const newToken = typeof newSession === 'string' ? JSON.parse(newSession)?.access_token : newSession?.access_token;

            console.log('[DEBUG-SIDEBAR-STORAGE] oldToken:', oldToken ? `exists (${oldToken.substring(0, 20)}...)` : 'NULL');
            console.log('[DEBUG-SIDEBAR-STORAGE] newToken:', newToken ? `exists (${newToken.substring(0, 20)}...)` : 'NULL');
            console.log('[DEBUG-SIDEBAR-STORAGE] state.tryonProcessing:', state.tryonProcessing);

            // Guard: token removed during try-on processing → defer to AUTH_EXPIRED handler
            if (oldToken && !newToken && state.tryonProcessing) {
                console.log('[DEBUG-SIDEBAR-STORAGE] ⚠️ session REMOVED during try-on — deferring');
                return;
            }
            if ((!oldToken && newToken) || (oldToken && !newToken)) {
                console.log('[DEBUG-SIDEBAR-STORAGE] Token state changed — rechecking auth...');
                checkAuthState();
            }
        }
    });
}

async function loadModelImage() {
    try {
        // Không ghi đè nếu loadUserModels() đã set default model trước đó
        if (state.modelImage) return;

        // Đọc đúng key snake_case — service worker lưu 'model_image'
        const result = await chrome.storage.local.get(['model_image']);
        let needsRenderGrid = false;

        if (result.model_image) {
            state.modelImage = result.model_image;
            // Cố gắng tìm id tương ứng trong userModels để set selectedModelId và action buttons đầy đủ
            if (state.userModels && state.userModels.length > 0) {
                const model = state.userModels.find(m => m.url === state.modelImage || m.imageUrl === state.modelImage);
                if (model) {
                    state.selectedModelId = model.id;
                    needsRenderGrid = true;
                }
            }
            updateUI();
        } else if (state.userModels && state.userModels.length > 0) {
            // Tự động load model mới nhất nếu không có cache và không có default
            state.modelImage = state.userModels[0].url || state.userModels[0].imageUrl;
            state.selectedModelId = state.userModels[0].id;
            updateUI();
            needsRenderGrid = true;
        }

        if (needsRenderGrid && typeof window.renderUserModels === 'function') {
            window.renderUserModels();
        }
    } catch (error) {
        console.error('Failed to load model image:', error);
    }
}

async function checkPendingImage() {
    try {
        const result = await chrome.storage.local.get(['pendingModelImage']);
        if (result.pendingModelImage) {
            state.modelImage = result.pendingModelImage;
            await chrome.storage.local.remove('pendingModelImage');
            updateUI();
            showToast(t('photo_added_success'), 'success');
        }
    } catch (error) {
        console.error('[Fitly] Failed to check pending image:', error);
    }
}

async function saveResults() {
    try {
        // Chỉ lưu metadata nhỏ (URL), không lưu base64 image data
        // để tránh vượt quota chrome.storage.local (5MB)
        const compactResults = state.results.slice(0, 50).map(r => ({
            id: r.id,
            name: r.name,
            imageUrl: (r.imageUrl && !r.imageUrl.startsWith('data:')) ? r.imageUrl : null,
            timestamp: r.timestamp,
            sourceUrl: r.sourceUrl
        })).filter(r => r.imageUrl); // Bỏ qua entries không có URL
        await chrome.storage.local.set({ 'fitly_results': compactResults });
    } catch (error) {
        if (error.message?.includes('QuotaBytes') || error.message?.includes('QUOTA_BYTES')) {
            console.warn('[Fitly] Storage quota exceeded saving results, trimming...');
            try {
                const trimmed = state.results.slice(0, 20).map(r => ({
                    id: r.id,
                    name: r.name,
                    imageUrl: (r.imageUrl && !r.imageUrl.startsWith('data:')) ? r.imageUrl : null,
                    timestamp: r.timestamp,
                    sourceUrl: r.sourceUrl
                })).filter(r => r.imageUrl);
                await chrome.storage.local.set({ 'fitly_results': trimmed });
            } catch (_) {
                console.error('[Fitly] Cannot save results - storage full');
            }
        } else {
            console.error('Failed to save results:', error);
        }
    }
}

async function loadResults() {
    try {
        // Ưu tiên load từ Supabase DB (persist across sessions + devices)
        if (state.authenticated) {
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'GET_TRYON_HISTORY',
                    data: { limit: 50 }
                });
                if (response?.success && response.history?.length > 0) {
                    // Filter out locally-deleted tryon results (tombstone set)
                    // to prevent deleted outfits from resurrecting via tryon_history
                    let deletedIds = new Set();
                    try {
                        const deletedStore = await chrome.storage.local.get(['fitly_deleted_outfit_ids']);
                        deletedIds = new Set(deletedStore.fitly_deleted_outfit_ids || []);
                    } catch (_) { /* ignore */ }

                    state.results = response.history
                        .filter(h => !deletedIds.has(String(h.id)))
                        .map((h, i) => ({
                            id: h.id || `db-${i + 1}`,
                            name: null,
                            imageUrl: h.result_image_url,
                            clothingUrl: null,
                            modelUrl: null,
                            timestamp: new Date(h.created_at).getTime(),
                            sourceUrl: null
                        }));
                    state.nextResultId = state.results.length + 1;
                    updateGalleryUI();
                    console.log('[Fitly] Loaded', state.results.length, 'results from Supabase DB');
                    return;
                }
            } catch (dbError) {
                console.warn('[Fitly] Failed to load from DB, falling back to local cache:', dbError);
            }
        }

        // Fallback: local cache
        const data = await chrome.storage.local.get(['fitly_results']);
        if (data.fitly_results?.length > 0) {
            state.results = data.fitly_results;
            state.nextResultId = Math.max(...state.results.map(r => r.id || 0), 0) + 1;
            updateGalleryUI();
            console.log('[Fitly] Loaded', state.results.length, 'results from local cache');
        }
    } catch (error) {
        console.error('Failed to load results:', error);
    }
}

/**
 * checkPendingClothingImage - Kiểm tra ảnh quần áo đang chờ từ right-click context menu
 * 
 * Input: chrome.storage.session pending_clothing_image (set bởi service_worker khi user right-click)
 * Output: Thêm item vào selectedItems nếu có ảnh pending
 * 
 * Flow:
 * 1. Gửi GET_PENDING_IMAGE → service worker
 * 2. Service worker đọc chrome.storage.session và xoá pending data
 * 3. Nếu có imageUrl → gọi toggleClothingSelection để thêm vào danh sách
 */
async function checkPendingClothingImage() {
    try {
        const result = await chrome.runtime.sendMessage({ type: 'GET_PENDING_IMAGE' });
        if (result?.imageUrl) {
            console.log('[Fitly] Found pending clothing image from context menu:', result.imageUrl.substring(0, 60) + '...');

            // DEDUP GUARD: Tránh double-add khi CAPTURE_IMAGE đã xử lý cùng URL trước đó
            // (CAPTURE_IMAGE và SHOW_PENDING_CLOTHING → checkPendingClothingImage đều deliver cùng image)
            const alreadySelected = state.selectedItems.some(i => i.imageUrl === result.imageUrl);
            if (alreadySelected) {
                console.log('[Fitly] checkPendingClothingImage: item already selected, skipping toggle (dedup guard)');
                return;
            }

            // Kiểm tra nếu CAPTURE_IMAGE vừa xử lý URL này (trong vòng 5 giây)
            const capturedRecently = state._lastCapturedUrl === result.imageUrl
                && (Date.now() - (state._lastCapturedAt || 0)) < 5000;
            if (capturedRecently) {
                console.log('[Fitly] checkPendingClothingImage: CAPTURE_IMAGE already handled this URL, skipping (dedup guard)');
                return;
            }

            toggleClothingSelection({
                id: `capture-${Date.now()}`,
                imageUrl: result.imageUrl,
                name: getCategoryLabel(state.selectedCategory) || t('captured_item'),
                category: state.selectedCategory,
                sourceUrl: result.sourceUrl || null
            });
        }
    } catch (error) {
        console.error('[Fitly] Failed to check pending clothing image:', error);
    }
}

function listenForMessages() {
    chrome.runtime.onMessage.addListener((message) => {
        switch (message.type) {
            // CAPTURE_IMAGE: Gửi bởi context_menus.js qua chrome.tabs.sendMessage
            // khi user click hover button hoặc context menu khi sidebar đã mở sẵn
            case 'CAPTURE_IMAGE':
                if (message.imageUrl) {
                    console.log('[Fitly] CAPTURE_IMAGE received:', message.imageUrl.substring(0, 60));

                    // DEDUP GUARD: Tránh race condition với SHOW_PENDING_CLOTHING
                    // Cả hai kênh (CAPTURE_IMAGE + SHOW_PENDING_CLOTHING) có thể deliver cùng image
                    // Nếu item đã được select rồi → skip để không toggle → deselect nhầm
                    const alreadySelected = state.selectedItems.some(i => i.imageUrl === message.imageUrl);
                    if (alreadySelected) {
                        console.log('[Fitly] CAPTURE_IMAGE skipped - item already selected (dedup guard)');
                        break;
                    }

                    // Track URL vừa capture để SHOW_PENDING_CLOTHING biết mà skip
                    state._lastCapturedUrl = message.imageUrl;
                    state._lastCapturedAt = Date.now();

                    const captureId = `capture-${Date.now()}`;
                    const captureName = getCategoryLabel(state.selectedCategory) || t('captured_item');
                    toggleClothingSelection({
                        id: captureId,
                        imageUrl: message.imageUrl,
                        name: captureName,
                        category: state.selectedCategory,
                        sourceUrl: message.sourceUrl || null
                    });
                    // Lưu vào recent clothing history để hiển thị lại sau này
                    chrome.runtime.sendMessage({
                        type: 'SAVE_RECENT_CLOTHING',
                        data: {
                            id: captureId,
                            imageUrl: message.imageUrl,
                            sourceUrl: message.sourceUrl || null,
                            category: state.selectedCategory,
                            name: captureName,
                        }
                    }).catch(() => { });
                }
                break;
            case 'IMAGE_SELECTED': {
                // Guard: chỉ thêm nếu chưa có trong selectedItems
                const alreadySelectedImg = state.selectedItems.some(i => i.imageUrl === message.imageUrl);
                if (!alreadySelectedImg) {
                    toggleClothingSelection({
                        id: `capture-${Date.now()}`,
                        imageUrl: message.imageUrl,
                        name: getCategoryLabel(state.selectedCategory) || t('captured_item'),
                        category: state.selectedCategory,
                        sourceUrl: message.sourceUrl || null
                    });
                }
                break;
            }
            case 'AUTH_STATE_CHANGED':
                console.log('[DEBUG-SIDEBAR-MSG] AUTH_STATE_CHANGED received at', new Date().toISOString());
                console.log('[DEBUG-SIDEBAR-MSG] state.authenticated before re-check:', state.authenticated);
                checkAuthState();
                break;
            case 'TOKEN_REFRESHED':
                console.log('[DEBUG-SIDEBAR-MSG] TOKEN_REFRESHED at', new Date().toISOString(), '| token:', message.token ? 'EXISTS' : 'NULL');
                break;
            case 'TOKEN_REFRESH_FAILED':
                console.error('[DEBUG-SIDEBAR-MSG] ❌ TOKEN_REFRESH_FAILED at', new Date().toISOString());
                console.error('[DEBUG-SIDEBAR-MSG] state.tryonProcessing:', state.tryonProcessing);
                console.error('[DEBUG-SIDEBAR-MSG] state.authenticated:', state.authenticated);
                // Guard: không force-logout nếu try-on đang processing
                // Proactive refresh có thể fail tạm thời khi token vừa được rotate
                if (state.tryonProcessing) {
                    console.log('[DEBUG-SIDEBAR-MSG] TOKEN_REFRESH_FAILED suppressed — try-on in progress');
                    break;
                }
                showToast(t('session_expired_please_login'), 'error');
                setTimeout(checkAuthState, 2000);
                break;
            case 'POPUP_CLOSED':
                state.activePopups = state.activePopups.filter(id => id !== message.id);
                renderResultThumbnails();
                break;
            case 'POPUP_OPENED':
                if (!state.activePopups.includes(message.id)) state.activePopups.push(message.id);
                renderResultThumbnails();
                break;
            case 'SAVE_RESULT_OUTFIT':
                saveResultOutfit(message.data);
                break;
            case 'RESULT_RENAMED':
                const resultToRename = state.results.find(r => r.id === message.id);
                if (resultToRename) { resultToRename.name = message.name; renderResultThumbnails(); }
                break;
            case 'WARDROBE_UPDATED':
                console.log('[Fitly] Wardrobe updated, refreshing...');
                loadRecentClothing().then(() => {
                    if (typeof renderWardrobeGrid === 'function') renderWardrobeGrid();
                });
                break;
            case 'SHOW_WARDROBE_CATEGORY_MODAL':
                // Nhận signal từ background: user vừa chọn "Thêm vào tủ đồ" từ context menu
                // STEP 1: Auth guard — phải đăng nhập mới được thêm vào tủ đồ
                (async () => {
                    try {
                        if (!state.authenticated) {
                            // Chưa đăng nhập → xóa pending item và chuyển đến màn đăng nhập
                            await chrome.storage.session.remove(['pending_wardrobe_item']).catch(() => { });
                            showToast('🔐 Vui lòng đăng nhập để thêm vào tủ đồ', 'warning');
                            showAuthSection();
                            return;
                        }

                        // STEP 2: Đã đăng nhập → lấy pending item và mở modal
                        const session = await chrome.storage.session.get(['pending_wardrobe_item']);
                        if (session.pending_wardrobe_item && typeof openAddWardrobeModal === 'function') {
                            openAddWardrobeModal(session.pending_wardrobe_item);
                            // Xóa pending item sau khi đã lấy
                            await chrome.storage.session.remove(['pending_wardrobe_item']);
                        }
                    } catch (e) {
                        console.error('[Fitly] Failed to open wardrobe modal:', e);
                    }
                })();
                break;
            case 'SHOW_PENDING_CLOTHING':
                // Nhận signal từ background: user vừa click chọn ảnh quần áo từ trang web
                // Sidebar đọc pending_clothing_image từ session storage và thêm vào selectedItems
                checkPendingClothingImage().catch(e => {
                    console.error('[Fitly] Failed to check pending clothing from SHOW_PENDING_CLOTHING:', e);
                });
                break;
        }
    });
}

function listenForStorageChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.selectedItems?.newValue) {
            state.selectedItems = changes.selectedItems.newValue;
            updateUI();
        }
    });
}

// ==========================================
// EMAIL AUTH SUBMIT HANDLERS
// ==========================================

/**
 * handleEmailLoginSubmit — Đọc form login, gửi EMAIL_LOGIN đến background, xử lý response
 * Called by: setup_event_listeners_and_drag_drop.js (click + Enter key)
 */
async function handleEmailLoginSubmit() {
    console.log('[DEBUG-SIDEBAR-LOGIN] ========== handleEmailLoginSubmit START ==========');
    console.log('[DEBUG-SIDEBAR-LOGIN] Timestamp:', new Date().toISOString());
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');

    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';

    // STEP 1: Client-side validation
    if (!email || !password) {
        showToast(t('enter_email_password') || 'Vui lòng nhập email và mật khẩu', 'error');
        return;
    }

    // STEP 2: Loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Đang đăng nhập...';
    }

    try {
        // STEP 3: Gọi background handler
        console.log('[DEBUG-SIDEBAR-LOGIN] Sending EMAIL_LOGIN for:', email);
        const loginStart = Date.now();
        const response = await chrome.runtime.sendMessage({
            type: 'EMAIL_LOGIN',
            data: { email, password },
        });
        const loginTime = Date.now() - loginStart;
        console.log('[DEBUG-SIDEBAR-LOGIN] EMAIL_LOGIN response in', loginTime, 'ms');
        console.log('[DEBUG-SIDEBAR-LOGIN] response.success:', response?.success);

        if (response?.success) {
            // STEP 4a: Thành công → reload auth state để chuyển vào main
            console.log('[DEBUG-SIDEBAR-LOGIN] ✅ Login success, calling checkAuthState...');
            showToast(t('login_success') || 'Đăng nhập thành công!', 'success');
            await checkAuthState();
            console.log('[DEBUG-SIDEBAR-LOGIN] checkAuthState after login complete');
        } else {
            // STEP 4b: Thất bại → hiện toast lỗi từ background
            console.error('[DEBUG-SIDEBAR-LOGIN] ❌ Login failed:', response?.error);
            showToast(response?.error || t('login_failed') || 'Đăng nhập thất bại', 'error');
            passwordInput?.select();
        }
    } catch (err) {
        console.error('[DEBUG-SIDEBAR-LOGIN] ❌ Exception:', err.message);
        console.error('[DEBUG-SIDEBAR-LOGIN] Stack:', err.stack);
        showToast(t('auth_network_error') || 'Lỗi kết nối. Vui lòng thử lại.', 'error');
    } finally {
        // STEP 5: Restore button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t('login_btn') || 'Đăng nhập';
        }
        console.log('[DEBUG-SIDEBAR-LOGIN] ========== handleEmailLoginSubmit END ==========');
    }
}

/**
 * handleEmailRegisterSubmit — Đọc form register, validate, gửi EMAIL_REGISTER, xử lý response
 * Called by: setup_event_listeners_and_drag_drop.js (click + Enter key)
 */
async function handleEmailRegisterSubmit() {
    const nameInput = document.getElementById('register-name');
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm-password');
    const submitBtn = document.getElementById('register-submit-btn');

    const fullName = nameInput?.value?.trim() || '';
    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    // STEP 1: Client-side validation
    if (!email || !password) {
        showToast(t('enter_email_password') || 'Vui lòng nhập email và mật khẩu', 'error');
        return;
    }

    if (password.length < 6) {
        showToast(t('password_too_short') || 'Mật khẩu phải ít nhất 6 ký tự', 'error');
        passwordInput?.focus();
        return;
    }

    if (password !== confirmPassword) {
        showToast(t('password_mismatch') || 'Mật khẩu xác nhận không khớp', 'error');
        confirmInput?.select();
        return;
    }

    // STEP 2: Loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Đang tạo tài khoản...';
    }

    try {
        // STEP 3: Gọi background handler
        const response = await chrome.runtime.sendMessage({
            type: 'EMAIL_REGISTER',
            data: { email, password, fullName },
        });

        if (response?.success) {
            if (response.authenticated) {
                // STEP 4a: Auto-confirm → đăng nhập luôn
                showToast(t('register_success') || 'Tạo tài khoản thành công!', 'success');
                await checkAuthState();
            } else if (response.needsVerification) {
                // STEP 4b: Cần xác nhận email
                showToast(
                    t('check_email_verify') || '📧 Vui lòng kiểm tra email để xác nhận tài khoản',
                    'info'
                );
                // Chuyển sang tab login để user đăng nhập sau khi verify
                document.querySelector('.auth-tab[data-tab="login"]')?.click();
                if (emailInput?.value) {
                    const loginEmail = document.getElementById('login-email');
                    if (loginEmail) loginEmail.value = emailInput.value;
                }
            }
        } else {
            // STEP 4c: Thất bại → hiện toast lỗi
            showToast(response?.error || t('register_failed') || 'Tạo tài khoản thất bại', 'error');
        }
    } catch (err) {
        console.error('[Fitly] handleEmailRegisterSubmit error:', err);
        showToast(t('auth_network_error') || 'Lỗi kết nối. Vui lòng thử lại.', 'error');
    } finally {
        // STEP 5: Restore button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t('register_now') || 'Đăng ký ngay';
        }
    }
}

/**
 * Auth Expired Overlay — hiện dialog chuyên biệt khi session hết hạn.
 * Cung cấp nút "Đăng nhập lại" (inline Google Sign-In) + "Thử lại" (silent refresh).
 * Giữ nguyên state (selectedItems, modelImage) để user retry sau khi re-login.
 */
function showAuthExpiredOverlay() {
    console.error('[DEBUG-AUTH-EXPIRED-OVERLAY] ========== showAuthExpiredOverlay TRIGGERED ==========');
    console.error('[DEBUG-AUTH-EXPIRED-OVERLAY] Timestamp:', new Date().toISOString());
    console.error('[DEBUG-AUTH-EXPIRED-OVERLAY] state.authenticated:', state.authenticated);
    console.error('[DEBUG-AUTH-EXPIRED-OVERLAY] state.tryonProcessing:', state.tryonProcessing);
    console.error('[DEBUG-AUTH-EXPIRED-OVERLAY] state.user?.id:', state.user?.id || 'NULL');

    // STEP 1: Reuse error overlay nhưng customize nội dung
    const overlay = elements.errorOverlay;
    if (!overlay) return;

    // STEP 2: Cập nhật message text
    if (elements.errorMessageText) {
        elements.errorMessageText.textContent =
            t('session_expired_relogin') || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.';
    }

    // STEP 3: Inject nút "Đăng nhập lại" nếu chưa có
    const errorActions = overlay.querySelector('.error-actions');
    if (errorActions && !errorActions.querySelector('#auth-relogin-btn')) {
        const reloginBtn = document.createElement('button');
        reloginBtn.id = 'auth-relogin-btn';
        reloginBtn.className = 'btn btn-primary btn-sm';
        reloginBtn.innerHTML = '<span class="material-symbols-outlined">login</span> Đăng nhập lại';
        reloginBtn.addEventListener('click', async () => {
            console.log('[DEBUG-AUTH-EXPIRED-OVERLAY] Re-login button clicked at', new Date().toISOString());
            reloginBtn.disabled = true;
            reloginBtn.textContent = 'Đang đăng nhập...';
            try {
                const result = await chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_IN' });
                console.log('[DEBUG-AUTH-EXPIRED-OVERLAY] GOOGLE_SIGN_IN result:', result?.success ? 'SUCCESS' : 'FAILED');
                if (result?.success) {
                    showErrorOverlay(false);
                    showToast('✅ Đăng nhập thành công! Đang thử lại...', 'success');
                    await checkAuthState();
                    // Auto-retry try-on sau re-login
                    if (state.modelImage && (state.selectedItems?.length > 0 || state.clothingImage)) {
                        console.log('[DEBUG-AUTH-EXPIRED-OVERLAY] Auto-retrying try-on after re-login...');
                        setTimeout(() => processTryOn(), 500);
                    }
                } else {
                    console.error('[DEBUG-AUTH-EXPIRED-OVERLAY] Re-login failed:', result?.error);
                    showToast(result?.error || 'Đăng nhập thất bại', 'error');
                    reloginBtn.disabled = false;
                    reloginBtn.innerHTML = '<span class="material-symbols-outlined">login</span> Đăng nhập lại';
                }
            } catch (err) {
                console.error('[DEBUG-AUTH-EXPIRED-OVERLAY] Re-login exception:', err.message);
                showToast('Lỗi kết nối. Vui lòng thử lại.', 'error');
                reloginBtn.disabled = false;
                reloginBtn.innerHTML = '<span class="material-symbols-outlined">login</span> Đăng nhập lại';
            }
        });
        // Insert trước retry button
        errorActions.insertBefore(reloginBtn, errorActions.firstChild);
    }

    // STEP 4: Hiện overlay
    overlay.classList.remove('hidden');
}

// Expose ra window
window.showSidebarLoading = showSidebarLoading;
window.hideSidebarLoading = hideSidebarLoading;
window.showAuthSection = showAuthSection;
window.showMainContent = showMainContent;
window.checkAuthState = checkAuthState;
window.updateUI = updateUI;
window.showLoading = showLoading;
window.updateProgress = updateProgress;
window.showErrorOverlay = showErrorOverlay;
window.showSuccessOverlay = showSuccessOverlay;
window.showAuthExpiredOverlay = showAuthExpiredOverlay;
window.showToast = showToast;
window.handleSocialLogin = handleSocialLogin;
window.handleLogout = handleLogout;
window.handleEmailLoginSubmit = handleEmailLoginSubmit;
window.handleEmailRegisterSubmit = handleEmailRegisterSubmit;
window.toggleProfileMenu = toggleProfileMenu;
window.hideProfileMenu = hideProfileMenu;
window.updateProfileMenuContent = updateProfileMenuContent;
window.initProfileMenuEvents = initProfileMenuEvents;
window.setupAuthStateListener = setupAuthStateListener;
window.loadModelImage = loadModelImage;
window.checkPendingImage = checkPendingImage;
window.checkPendingClothingImage = checkPendingClothingImage;
window.saveResults = saveResults;
window.loadResults = loadResults;
window.listenForMessages = listenForMessages;
window.listenForStorageChanges = listenForStorageChanges;
// openGallery / closeGallery — defined in gallery_helpers.js (delegates to openAllOutfits)
