/**
 * File: manage_help_page.js
 * Purpose: Handle Help page open/close and FAQ accordion interactions
 * Layer: UI Module
 * Dependencies: state_and_config.js, i18n.js
 */

// =====================================================
// HELP PAGE — OPEN / CLOSE
// =====================================================

/**
 * Open the Help section overlay
 */
function openHelpPage() {
    const helpSection = document.getElementById('help-section');
    if (!helpSection) return;

    helpSection.classList.remove('hidden');
    // Hide profile dropdown if open
    if (typeof hideProfileMenu === 'function') hideProfileMenu();
}

/**
 * Close the Help section overlay
 */
function closeHelpPage() {
    const helpSection = document.getElementById('help-section');
    if (!helpSection) return;

    helpSection.classList.add('hidden');
}

// =====================================================
// FAQ ACCORDION
// =====================================================

/**
 * Toggle a FAQ item open/closed
 * @param {HTMLElement} questionEl - The clicked question element
 */
function toggleFaqItem(questionEl) {
    const faqItem = questionEl.closest('.help-faq-item');
    if (!faqItem) return;

    const isOpen = faqItem.classList.contains('open');

    // STEP 1: Close all other FAQ items (accordion behavior)
    document.querySelectorAll('.help-faq-item.open').forEach(item => {
        if (item !== faqItem) {
            item.classList.remove('open');
        }
    });

    // STEP 2: Toggle the clicked item
    faqItem.classList.toggle('open', !isOpen);
}

// =====================================================
// COPY EMAIL TO CLIPBOARD
// =====================================================

/**
 * Copy support email to clipboard and show a toast
 */
function copySupportEmail() {
    const email = 'support@fitly.app';
    navigator.clipboard.writeText(email).then(() => {
        if (typeof showToast === 'function') {
            const locale = window.currentLocale || 'vi';
            showToast(t('help_page.email_copied', locale), 'success');
        }
    }).catch(() => {
        if (typeof showToast === 'function') {
            showToast('Cannot copy', 'error');
        }
    });
}

// =====================================================
// INIT EVENT LISTENERS
// =====================================================

(function initHelpPage() {
    // STEP 1: Close button
    document.getElementById('close-help-btn')?.addEventListener('click', closeHelpPage);

    // STEP 2: FAQ accordion — delegate clicks
    document.getElementById('help-faq-list')?.addEventListener('click', (e) => {
        const question = e.target.closest('.help-faq-question');
        if (question) toggleFaqItem(question);
    });

    // STEP 3: Copy email button
    document.getElementById('help-copy-email-btn')?.addEventListener('click', copySupportEmail);
})();
