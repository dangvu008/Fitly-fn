# CLAUDE.md — Fitly Chrome Extension

This file provides comprehensive guidance for AI assistants working on the Fitly codebase.

## Project Overview

**Fitly** is a Chrome Extension (Manifest V3) that enables AI-powered virtual try-on directly in the browser. Users right-click on clothing images and see themselves wearing them. The extension uses Supabase for backend, Gemini Flash via Replicate for AI processing, and a gem-based economy via Polar for payments.

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                  Chrome Extension MV3                  │
├──────────────┬────────────────┬───────────────────────┤
│  Content     │  Service       │  Sidebar / Popup       │
│  Scripts     │  Worker (SW)   │  (UI Panels)           │
│  (injected   │  (background/  │  (sidebar/index.html   │
│  into pages) │  service_      │   popup/popup.html)    │
│              │  worker.js)    │                        │
└──────┬───────┴───────┬────────┴───────────┬────────────┘
       │ sendMessage    │ sendMessage         │ sendMessage
       └───────────────▼─────────────────────┘
              Background Message Router
              (background/message_routing.js)
                        │
              ┌─────────▼──────────┐
              │   Supabase Backend  │
              │  - Auth             │
              │  - PostgreSQL DB    │
              │  - Storage          │
              │  - Edge Functions   │
              └────────────────────┘
```

## Directory Structure

```
Fitly-fn/
├── manifest.json              # MV3 Chrome Extension manifest
├── service_worker.js          # Main SW entry point
├── background/                # Service Worker modules (23 files)
│   ├── message_routing.js     # Central message router (40+ message types)
│   ├── auth_handlers.js       # Authentication operations
│   ├── auth_state_manager.js  # Token lifecycle management
│   ├── session_ready_gate.js  # MV3 race condition fix
│   ├── process_tryon.js       # Virtual try-on handler
│   ├── wardrobe_manager.js    # Wardrobe CRUD
│   ├── outfit_manager.js      # Outfit management
│   ├── user_model_manager.js  # User model images
│   ├── payment_handlers.js    # Gem purchases via Polar
│   ├── cloud_sync.js          # Auto-sync to Supabase
│   ├── settings_manager.js    # User settings
│   └── ENVIRONMENT_CONFIG.js  # Feature flags and constants
├── content_scripts/           # Injected into web pages
│   ├── inject_sidebar.js      # Opens sidebar panel
│   ├── detect_clothing_image.js # AI clothing detection
│   ├── detect_fashion_page.js # Fashion site detection
│   ├── inject_image_hover_button.js # Try-on hover button
│   ├── google_login_overlay.js # Auth overlay
│   └── auth_listener.js       # Auth state listener (fitly.app only)
├── sidebar/                   # Main UI (side panel)
│   ├── index.html             # Sidebar HTML (1537 lines)
│   ├── sidebar.js             # Sidebar orchestrator
│   ├── sidebar.css            # Sidebar styles
│   └── modules/               # 19 feature modules
│       ├── manage_wardrobe_page.js
│       ├── manage_models_page.js
│       ├── manage_outfits_page.js
│       ├── manage_history_page.js
│       └── ... (15 more modules)
├── popup/                     # Extension toolbar popup
│   ├── popup.html
│   └── popup.js
├── lib/                       # Shared utilities
│   ├── supabase_service.js    # All Supabase API calls
│   ├── i18n.js                # Internationalization
│   ├── icons.js               # Icon utilities
│   └── locales/               # 9 language files (en, vi, ja, ko, zh, th, id, es, fr)
├── extension/
│   └── config.js              # Supabase client with ChromeStorageAdapter
├── supabase/
│   ├── functions/             # Deno Edge Functions
│   │   ├── process-tryon/     # AI try-on processing
│   │   ├── get-tryon-status/  # Poll try-on job status
│   │   ├── upload-image/      # Image upload to Storage
│   │   ├── add-wardrobe-with-quota/ # Wardrobe with limits
│   │   ├── get-gems-balance/  # User gem balance
│   │   ├── get-user-profile/  # User profile data
│   │   ├── create-polar-checkout/ # Payment checkout
│   │   └── polar-webhook/     # Polar payment webhook
│   ├── migrations/            # 15 SQL migration files
│   └── config.toml            # Supabase project config
├── tests/                     # Vitest test suite
│   ├── setup.js               # Chrome API mocks
│   └── *.test.js              # Test files
├── assets/                    # Static assets
├── icons/                     # Extension icons (16, 48, 128px)
└── .kiro/specs/               # Feature specs and design docs
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome MV3, Vanilla JavaScript (ES6+) |
| UI | HTML5, CSS3 (no framework) |
| Backend | Supabase (Auth + PostgreSQL + Storage + Edge Functions) |
| Edge Functions | Deno + TypeScript |
| AI Processing | Gemini Flash via Replicate API |
| Payments | Polar API (gem purchases) |
| Testing | Vitest + jsdom |
| i18n | Custom system, 9 languages |
| Build | esbuild (for Supabase bundle only) |

## Development Workflow

### Setting Up Locally

```bash
# Install dependencies
npm install

# Load extension in Chrome:
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select this directory
# No build step required — vanilla JS runs directly
```

### Rebuilding the Supabase Vendor Bundle

Only needed if `@supabase/supabase-js` version changes:

```bash
npm run build:vendor
# Generates lib/supabase.min.js (gitignored)
```

### Supabase Local Development

```bash
supabase start           # Start local Supabase
supabase functions serve # Run edge functions locally
supabase db reset        # Reset database with migrations
```

Set `USE_LOCAL_API: true` in `background/ENVIRONMENT_CONFIG.js` to use localhost.

### Running Tests

```bash
npm test                 # Run all tests once
npm run test:watch       # Watch mode

# Run specific test file
npx vitest run tests/token_expiration_during_tryon.test.js
npx vitest run --reporter=verbose
```

### Deploying Edge Functions

```bash
supabase functions deploy process-tryon
supabase functions deploy get-tryon-status
# etc.
```

## Key Patterns and Conventions

### Message-Based Communication

All communication between extension components uses Chrome's message passing:

```javascript
// Sending a message (from content script or sidebar)
const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });

// Handling messages (in message_routing.js)
case 'GET_AUTH_STATE':
    return await handleGetAuthState();
```

Message types are `SCREAMING_SNAKE_CASE` strings. All 40+ types are defined in `background/message_routing.js`. When adding new functionality, add a new message type there.

### Session Ready Gate (Critical MV3 Pattern)

The Service Worker is ephemeral — it can be killed and restarted at any time. When it restarts, messages can arrive before the Supabase session is restored from `chrome.storage`. The `sessionReady` promise in `background/session_ready_gate.js` must be awaited before processing any message:

```javascript
// Always await this at the start of message handlers
await sessionReady;
```

Do not bypass this gate unless you have a specific documented reason (see CONTEXT_TRYON_IMAGE exception in `service_worker.js`).

### Token Management

Token refresh uses a mutex pattern to prevent race conditions during concurrent API calls:

- `background/auth_state_manager.js` — `forceRefreshToken()` with mutex
- `lib/supabase_service.js` — `ensureFreshToken()` called before each Edge Function call
- Proactive refresh threshold: 15 minutes (`TOKEN_REFRESH_THRESHOLD = 900`)
- `autoRefreshToken: false` in Supabase client config (SW can't auto-refresh reliably)

### Supabase Service Layer

All Supabase calls go through `lib/supabase_service.js`. Never call Supabase directly from UI code. The pattern:

```javascript
// lib/supabase_service.js
export async function callEdgeFunction(functionName, payload) {
    await ensureFreshToken();           // Proactive refresh
    const authHeader = await getAuthHeader();
    // ... fetch with auth header
}
```

### File Headers

Every JS file should start with a header block:

```javascript
/**
 * File: filename.js
 * Purpose: What this file does
 * Layer: Infrastructure | Application | Business Logic
 *
 * Data Contract:
 * - Exports: functionA, functionB
 * - Input: description
 * - Output: description
 */
```

### Naming Conventions

- **Functions/Variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Message types**: `SCREAMING_SNAKE_CASE` strings
- **Files**: `snake_case.js`
- **CSS classes**: `kebab-case`
- **File naming pattern**: Action-Verb-Noun-Condition (e.g., `process_tryon.js`, `inject_sidebar.js`)

### Code Organization Principles

- Files should be ≤300 lines (micro-files principle)
- Single responsibility per file
- Background modules: one domain per file
- Sidebar modules: one feature page per module
- No shared mutable state between modules — use chrome.storage

### Feature Flags

Control features in `background/ENVIRONMENT_CONFIG.js`:

```javascript
export const DEMO_MODE_OVERRIDE = false; // bypass auth for dev
export const FEATURES = {
    SYNC_TO_CLOUD: true,
    OFFLINE_FALLBACK: true,
    AUTO_SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
    USE_LOCAL_API: false,               // use localhost:54321
};
```

## Database Schema

**Tables** (all with RLS enabled):
- `profiles` — user info + gems_balance
- `user_models` — full-body model images
- `wardrobe_items` — personal wardrobe
- `tryon_history` — AI try-on results
- `gem_transactions` — audit trail for gems

**Key Database Functions**:
- `deduct_gems_atomic()` — atomic gem deduction
- `refund_gems_atomic()` — refund on failure
- `add_gems_purchase()` — add gems after payment

**Security**: All tables use Row Level Security. Users can only access their own data.

## Internationalization

The i18n system supports 9 languages: `en`, `vi`, `ja`, `ko`, `zh`, `th`, `id`, `es`, `fr`.

- Locale files: `lib/locales/{lang}.js`
- i18n system: `lib/i18n.js`
- All locale files are loaded as content scripts in `manifest.json`
- Use `i18n.t('key')` to get translated strings

When adding new UI strings, add the key to all 9 locale files.

## Testing Guidelines

### Test Structure

Tests use Vitest + jsdom and mock the Chrome Extension APIs via `tests/setup.js`.

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMockStorage, setMockToken } from './setup.js';

describe('Feature Name', () => {
    beforeEach(() => {
        resetMockStorage();
        vi.clearAllMocks();
    });

    it('should do something', async () => {
        setMockToken(300); // Token with 5-minute TTL
        // ... test code
    });
});
```

### Test Helpers (from `tests/setup.js`)

- `setMockToken(ttlSeconds)` — set a mock auth token with given TTL
- `getMockTokenTTL()` — get remaining TTL of mock token
- `resetMockStorage()` — clear all mock chrome.storage data

### Test Categories

1. **Bug Exploration Tests** — confirm bugs before fixing (test expected to fail)
2. **Preservation Tests** — ensure existing correct behaviors don't regress
3. **Integration Tests** — test full message flows

## Edge Functions

Edge Functions are in `supabase/functions/*/index.ts` and run on Deno.

| Function | Purpose |
|----------|---------|
| `process-tryon` | Submit try-on job to Replicate/Gemini |
| `get-tryon-status` | Poll job status |
| `upload-image` | Upload to Supabase Storage |
| `add-wardrobe-with-quota` | Add item with quota enforcement |
| `get-gems-balance` | Fetch user's gem count |
| `get-user-profile` | Get profile data |
| `create-polar-checkout` | Create Polar payment session |
| `polar-webhook` | Handle Polar webhook events |

All edge functions:
- Validate JWT from `Authorization` header
- Use `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never exposed to client)
- Return `{ success: boolean, data?: ..., error?: string }`

## Storage Architecture

### Chrome Storage

- `chrome.storage.local` — persistent: session, wardrobe cache, preferences
- `chrome.storage.session` — ephemeral: pending images, popup state

### Supabase Storage Buckets

- `model-images` — user full-body photos
- `wardrobe-images` — clothing item photos
- `tryon-results` — AI-generated try-on images

## Auth Flow

1. User clicks "Sign in with Google"
2. `handleGoogleSignIn()` → `chrome.identity.launchWebAuthFlow()`
3. OAuth callback → `auth_callback.html` → stores tokens
4. `ChromeStorageAdapter` persists Supabase session to `chrome.storage.local`
5. SW restores session on restart via `sessionReady` gate

### Demo Mode

When `DEMO_MODE_OVERRIDE = true` or no user is logged in, the extension runs in demo mode with mock data. No API calls are made in demo mode.

## Common Pitfalls

1. **SW Ephemeral State**: Never store in-memory state in service_worker.js that needs to persist. Use `chrome.storage.local`.

2. **Token Auto-Refresh Disabled**: The Supabase client has `autoRefreshToken: false`. Always call `ensureFreshToken()` before API calls through the service layer.

3. **CORS in Sidebar**: The sidebar runs as a side panel, not a content script with full host permissions. Proxy image fetches through the SW using `FETCH_IMAGE_FOR_CACHE` message type.

4. **Session Gate Bypass**: Only bypass `sessionReady` gate for messages that must respond before auth is restored. Document any bypass clearly.

5. **Concurrent Refresh**: Multiple callers refreshing tokens simultaneously. Always use the mutex in `auth_state_manager.js` — don't call `supabase.auth.refreshSession()` directly.

## Related Documentation

- `lib/AUTH_README.md` — detailed authentication guide
- `background/README.md` — service worker architecture
- `tests/README.md` — testing guide with examples
- `supabase/README.md` — database setup and schema
- `supabase/POLAR_SETUP_GUIDE.md` — payment integration
- `.kiro/specs/supabase-gemini-integration/design.md` — system architecture spec
- `.kiro/specs/session-timeout-during-tryon-processing/` — session timeout bug fix spec
