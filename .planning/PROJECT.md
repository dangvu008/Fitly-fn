# PROJECT

## Name
Fitly - Virtual Try-On Chrome Extension

## Core Value
Enable users to virtually try on clothing directly from any e-commerce website, making online fashion shopping more confident and fun.

## Description
Fitly is a Chrome extension (Manifest V3) that detects fashion pages and clothing images across e-commerce sites, allowing users to overlay clothing onto their own photos using AI-powered virtual try-on. It features a sidebar panel UI, wardrobe management, outfit saving, and a gem-based payment system.

## Target Users
- Online shoppers who want to preview how clothing looks before purchasing
- Fashion enthusiasts browsing multiple e-commerce sites
- Users who want to save and compare outfits across different stores

## Key Decisions
- **Vanilla JS** — no framework (React, Vue, etc.) to keep extension lightweight and avoid CSP issues
- **Supabase** — chosen for auth, database, storage, and edge functions (all-in-one backend)
- **Replicate API** with Google Gemini 2.5 Flash Image model — AI try-on engine
- **Polar.sh** — payment processing for gem purchases
- **Gem-based economy** — virtual currency for try-on operations
- **MV3 Service Worker** — Chrome's required architecture (ephemeral, no persistent background page)
- **Content script IIFE pattern** — no ES module support in content script context
- **Custom i18n** — built-in translation system supporting 9 languages
- **IndexedDB caching** — image blob caching for performance

## Constraints
- Chrome Extension Manifest V3 limitations (Service Worker ephemeral nature, CSP restrictions)
- No persistent background page — must restore session from storage on every SW startup
- Content scripts cannot use ES modules — must use IIFE pattern
- Supabase client bundled locally (esbuild) to avoid CDN/CSP issues
- Cross-origin image fetching requires proxy bypass (CORS)
