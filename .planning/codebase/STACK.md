# Tech Stack

## Runtime & Platform
- **Chrome Extension** (Manifest V3) — browser extension targeting Chrome/Chromium
- **Service Worker** — background processing (ephemeral, no persistent state)
- **Content Scripts** — page injection via IIFE pattern

## Languages
- **JavaScript** (ES Modules) — extension code (background, sidebar, popup)
- **JavaScript** (IIFE) — content scripts (no module support in content script context)
- **TypeScript** — Supabase Edge Functions (Deno runtime)
- **HTML/CSS** — sidebar panel, popup, auth callback

## Backend
- **Supabase** — PostgreSQL database, Auth, Storage, Edge Functions
  - URL: `https://lluidqwmyxuonvmcansp.supabase.co`
  - Auth: Email/Password + Google OAuth
  - Storage buckets: `user-models`, `tryon-results`, `wardrobe-images`
  - Edge Functions runtime: **Deno**
- **Replicate API** — AI model execution (virtual try-on via `google/gemini-2.5-flash-image`)
- **Polar.sh** — Payment processing for gem purchases

## Key Dependencies
- `@supabase/supabase-js` v2.97.0 — Supabase client (bundled as ESM via esbuild)
- `vitest` v1.2.0 — test runner
- `jsdom` v28.1.0 — DOM simulation for tests
- `@vitest/ui` v1.2.0 — test UI

## Build Tools
- **esbuild** — bundles Supabase client (`npm run build:vendor`)
- No bundler for extension code (raw JS modules loaded directly)

## i18n
- Custom i18n system (`lib/i18n.js`)
- 9 languages: en, vi, ja, ko, zh, th, id, es, fr
- Locale files loaded as script tags in manifest
