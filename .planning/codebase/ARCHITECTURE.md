# Architecture

## Overview
Fitly follows a Chrome Extension MV3 architecture with a Service Worker hub, content script injection pipeline, and a modular sidebar UI. Backend processing uses Supabase Edge Functions for AI-powered virtual try-on.

## Layers

### 1. Service Worker (Hub)
**Entry:** `service_worker.js` → initializes session, sets up context menus, imports all handlers.

**Message Routing:** `background/message_routing.js` — central dispatcher using a switch statement for 30+ message types. All chrome.runtime.onMessage traffic flows through here.

**Key Pattern:** Session Ready Gate (`session_ready_gate.js`) — queues messages until Supabase session is restored from chrome.storage.local on SW startup.

### 2. Content Script Pipeline
Sequential detection and injection:
1. `detect_fashion_page.js` — 7-layer detection (domain whitelist → marketplace paths → platform fingerprinting → meta/title keywords → JSON-LD → URL patterns → exclusions)
2. `detect_clothing_image.js` — image scoring (dimensions → aspect ratio → URL patterns → alt text → container context)
3. `inject_image_hover_button.js` — overlays "Try On" / "Add to Wardrobe" buttons on detected clothing images
4. `inject_sidebar.js` — sidebar panel UI injection
5. `google_login_overlay.js` — Google auth modal when needed

All content scripts use IIFE pattern (no ES modules in content script context).

### 3. Sidebar Panel (UI)
**Entry:** `sidebar/index.html` → `sidebar/sidebar.js`

**Architecture:** Modular — 19 feature modules in `sidebar/modules/`. Each module exports functions consumed by the main sidebar controller.

**State Management:** `sidebar/modules/state_and_config.js` — centralized state object. No framework, vanilla JS DOM manipulation.

**Communication:** `chrome.runtime.sendMessage()` to Service Worker for all data operations.

### 4. Popup
**Entry:** `popup/popup.html` → `popup/popup.js`

Lightweight — shows auth status, quick actions (open sidebar, select image, view wardrobe), gem balance.

### 5. Supabase Edge Functions (Backend)
**Runtime:** Deno (TypeScript)

**Key Flow — Virtual Try-On:**
```
Client → process-tryon Edge Function
  → validate inputs (image_validator.ts)
  → resize images (image_resizer.ts)
  → upload to Storage (storage_uploader.ts)
  → build prompt (PromptBuilder.ts)
  → call Replicate API (replicate_client.ts)
  → poll for result
  → store result in DB + Storage
  → deduct gems
  → return result URL
```

**Shared Libraries:** `supabase/functions/lib/` — reusable utilities (rate limiting, retry, error handling, image processing).

## Data Flow

```
Web Page → Content Scripts (detect fashion/clothing) → Hover Buttons
    ↓ user clicks
Service Worker (message routing) → Auth check → Edge Function call
    ↓ result
Sidebar Panel (display result) ← chrome.runtime.sendMessage
```

## Auth Flow
1. User clicks login → `auth_social.js` opens Google OAuth popup
2. Supabase handles OAuth → redirects to `auth_callback.html`
3. Session stored in `chrome.storage.local` (key: `fitly-auth-token`)
4. `auth_state_manager.js` manages token refresh (manual, auto-refresh disabled due to SW restart)
5. Token TTL checked before API calls (< 10 min → force refresh)

## Storage Architecture
- **chrome.storage.local** — session tokens, user preferences, cached data
- **IndexedDB** (`sidebar/image_cache_db.js`) — image blob caching
- **Supabase Storage** — persistent cloud storage (user-models, tryon-results, wardrobe-images)
- **Supabase PostgreSQL** — structured data (profiles, wardrobe, outfits, history, jobs)
