# Integrations

## Supabase
- **Auth:** Email/Password + Google OAuth via `@supabase/supabase-js`
- **Database:** PostgreSQL with RLS policies on all tables
  - Tables: profiles, user_models, clothing_wardrobe, saved_outfits, tryon_history, tryon_jobs
- **Storage:** 3 buckets (user-models, tryon-results, wardrobe-images)
- **Edge Functions:** 8 functions (process-tryon, get-tryon-status, upload-image, add-wardrobe-with-quota, get-gems-balance, get-user-profile, create-polar-checkout, polar-webhook)
- **Client Config:** `extension/config.js` — singleton Supabase client with custom `ChromeStorageAdapter`

## Replicate API
- **Model:** `google/gemini-2.5-flash-image` for virtual try-on
- **Client:** `supabase/functions/lib/replicate_client.ts`
- **Flow:** Submit prediction → poll status → retrieve result
- **Rate Limiting:** Custom rate limiter in `supabase/functions/lib/rate_limiter.ts`
- **Retry:** Exponential backoff via `supabase/functions/lib/retry_helper.ts`

## Polar.sh (Payments)
- **Checkout:** `create-polar-checkout` Edge Function creates payment sessions
- **Webhook:** `polar-webhook` Edge Function handles payment confirmations
- **Currency:** Gem-based system (gems balance stored in profiles table)
- **Client-side:** `sidebar/modules/purchase_gems_handler.js` + `background/payment_handlers.js`

## Chrome Extension APIs
- `chrome.storage.local` — session persistence, user data, preferences
- `chrome.runtime.sendMessage` / `onMessage` — message passing (30+ types)
- `chrome.contextMenus` — right-click "Try On" and "Add to Wardrobe"
- `chrome.sidePanel` — sidebar panel API
- `chrome.notifications` — user notifications
- `chrome.windows` — popup window management
- `chrome.identity` — OAuth flow support
- `chrome.alarms` — scheduled tasks (sync, token refresh)

## Gemini Prompt Engine
- **Location:** `supabase/functions/lib/prompt_engine/`
- **PromptBuilder:** Constructs AI prompts for virtual try-on based on clothing category
- **construct_gemini_prompt.ts:** Prompt template assembly
