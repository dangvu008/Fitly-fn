# Concerns

## Security
- **Supabase anon key visible in source code** (`ENVIRONMENT_CONFIG.js`, `extension/config.js`) — standard for client-side Supabase usage but worth noting. RLS policies protect data.
- **No CSP meta tags** in HTML files — relies on Chrome Extension CSP from manifest
- **`<all_urls>` host permission** — broad permission, necessary for fashion site detection across all sites

## i18n Coverage Imbalance
- **en** and **vi** have ~600 translation keys (full coverage)
- **ja, ko, zh, th, id, es, fr** have only ~116 keys each (partial coverage)
- Missing translations fall back to Vietnamese (vi), not English
- Users in non-vi/en locales may see mixed language UI

## Code Quality
- **Large content scripts** — `inject_sidebar.js` is ~62KB with inline CSS-in-JS styles
- **inject_image_hover_button.js** contains ~60KB of modal styles as JavaScript strings
- **No bundler** for extension code — raw JS modules loaded directly, large individual files
- **Mixed Vietnamese/English** in codebase may hinder non-Vietnamese contributors

## Architecture
- **Service Worker ephemeral nature** — complex session management needed; manual token refresh with disabled auto-refresh is fragile
- **No error reporting service** — errors logged to console only
- **Hardcoded Supabase URL** in multiple files (not centralized via single env config)
- **Demo mode** mixed into production code via feature flags

## Testing
- **Low frontend test coverage** — only 4 tests focused on auth/token edge cases
- **No CI/CD pipeline** visible in repository
- **No linting configuration** (no ESLint, Prettier, or similar)

## Build & Deployment
- **Build script references absolute path** (`/Users/adm/Desktop/project/fitly-fn/...` in package.json build:vendor) — won't work on other machines
- **No production build pipeline** — extension loaded directly from source
- **No versioning automation** — manual version bumps in manifest.json
