/**
 * File: icons.js
 * Purpose: Centralized SVG icon definitions matching Fitly web app design system
 * 
 * Style Guide (matching lucide-react):
 * - viewBox: "0 0 24 24"
 * - fill: "none"
 * - stroke: "currentColor"
 * - stroke-width: "2"
 * - stroke-linecap: "round"
 * - stroke-linejoin: "round"
 */

// Icon template helper
function createIcon(pathData, viewBox = '0 0 24 24') {
  return `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathData}</svg>`;
}

// Fitly brand icon (matching FitlyLogo.tsx)
const FITLY_LOGO = `
<svg viewBox="0 0 32 32" fill="none">
  <defs>
    <linearGradient id="fitly-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#fitly-gradient)"/>
  <g transform="translate(16, 17) scale(0.6) translate(-16, -16)">
    <path d="M10 12 L10 26 L22 26 L22 12" fill="white"/>
    <path d="M12 8 L16 11 L20 8 L22 12 L16 13.5 L10 12 L12 8 Z" fill="white"/>
    <path d="M10 12 L6 14 L8 20 L10 18" fill="white"/>
    <path d="M22 12 L26 14 L24 20 L22 18" fill="white"/>
  </g>
</svg>`;

// Icon definitions (matching lucide-react icons used in web app)
const ICONS = {
  // User/Profile icon
  user: createIcon(`
    <circle cx="12" cy="8" r="4"/>
    <path d="M20 21a8 8 0 00-16 0"/>
  `),

  // T-shirt/Clothing icon
  shirt: createIcon(`
    <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z"/>
  `),

  // Image icon
  image: createIcon(`
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <path d="M21 15l-5-5L5 21"/>
  `),

  // Sidebar/Panel icon
  panelLeft: createIcon(`
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
  `),

  // Layers/Stack icon (for results)
  layers: createIcon(`
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  `),

  // Sparkles/Magic icon
  sparkles: createIcon(`
    <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3z"/>
    <path d="M19 14l.5 2.5L22 17.5l-2.5.5-.5 2.5-.5-2.5L16 17.5l2.5-.5.5-2.5z"/>
  `),

  // Heart icon
  heart: createIcon(`
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  `),

  // X/Close icon
  x: createIcon(`
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  `),

  // Download icon
  download: createIcon(`
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  `),

  // Copy icon
  copy: createIcon(`
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  `),

  // Share icon
  share: createIcon(`
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  `),

  // External link icon
  externalLink: createIcon(`
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  `),

  // Trash icon
  trash: createIcon(`
    <path d="M3 6h18"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
  `),

  // Plus icon
  plus: createIcon(`
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  `),

  // Upload icon
  upload: createIcon(`
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  `),

  // Check icon
  check: createIcon(`
    <polyline points="20 6 9 17 4 12"/>
  `),

  // Star icon
  star: createIcon(`
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  `),

  // Clock/History icon
  clock: createIcon(`
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  `),

  // Settings icon
  settings: createIcon(`
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  `),

  // Gem icon
  gem: createIcon(`
    <path d="M6 3h12l4 6-10 13L2 9z"/>
    <path d="M11 3L8 9l4 13 4-13-3-6"/>
    <path d="M2 9h20"/>
  `),

  // Zap/Lightning icon  
  zap: createIcon(`
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  `),

  // Crown icon
  crown: createIcon(`
    <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
  `),

  // Menu/Hamburger icon
  menu: createIcon(`
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  `),

  // Maximize icon
  maximize: createIcon(`
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
  `),

  // Minimize icon
  minimize: createIcon(`
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
  `),

  // Refresh/Rotate icon
  refreshCw: createIcon(`
    <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
  `),

  // Arrow left
  arrowLeft: createIcon(`
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  `),

  // Arrow right
  arrowRight: createIcon(`
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  `),

  // Chevron down
  chevronDown: createIcon(`
    <polyline points="6 9 12 15 18 9"/>
  `),

  // Chevron up
  chevronUp: createIcon(`
    <polyline points="18 15 12 9 6 15"/>
  `),

  // Link icon
  link: createIcon(`
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  `),

  // Globe icon  
  globe: createIcon(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  `),

  // Camera icon
  camera: createIcon(`
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  `),

  // Info icon
  info: createIcon(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  `),

  // Warning/Alert icon
  alertTriangle: createIcon(`
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  `),

  // Fitly logo (brand)
  fitlyLogo: FITLY_LOGO
};

// Export for use in extension
if (typeof window !== 'undefined') {
  window.FitlyIcons = ICONS;
}

// Helper function to render icon
function renderIcon(iconName, size = 24, className = '') {
  const icon = ICONS[iconName];
  if (!icon) {
    console.warn(`Icon "${iconName}" not found`);
    return '';
  }
  
  // For fitlyLogo, return as-is (it has its own dimensions)
  if (iconName === 'fitlyLogo') {
    return icon;
  }
  
  // Add size and class attributes
  return icon
    .replace('viewBox=', `width="${size}" height="${size}" class="${className}" viewBox=`)
    .trim();
}

// Make renderIcon available globally
if (typeof window !== 'undefined') {
  window.renderIcon = renderIcon;
}
