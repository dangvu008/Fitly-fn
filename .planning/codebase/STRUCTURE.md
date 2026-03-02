# Project Structure

```
Fitly-fn/
├── manifest.json              # Chrome Extension MV3 config
├── package.json               # npm dependencies & scripts
├── vitest.config.js           # Test configuration
├── service_worker.js          # SW entry point (session restore, init)
├── auth_callback.html/js      # OAuth callback handler
├── generate_extension_key.sh  # Dev utility
│
├── background/                # Service Worker modules (ES modules)
│   ├── ENVIRONMENT_CONFIG.js  # Feature flags, Supabase keys, mock data
│   ├── auth_state_manager.js  # Token refresh, demo/guest mode
│   ├── auth_handlers.js       # Login/signup/logout handlers
│   ├── auth_email.js          # Email auth flow
│   ├── auth_social.js         # Google OAuth flow
│   ├── message_routing.js     # Central message dispatcher (30+ types)
│   ├── session_ready_gate.js  # Gate messages until session restored
│   ├── context_menus.js       # Right-click menu setup
│   ├── process_tryon.js       # Try-on execution (calls Edge Function)
│   ├── wardrobe_manager.js    # Clothing CRUD
│   ├── outfit_manager.js      # Outfit CRUD + soft delete
│   ├── user_model_manager.js  # Model photo management + dedup
│   ├── recent_clothing_manager.js
│   ├── cloud_sync.js          # Cross-device sync
│   ├── payment_handlers.js    # Gem purchase status
│   ├── image_compressor.js    # Image optimization
│   ├── settings_manager.js    # User preferences
│   ├── i18n_manager.js        # Language management
│   ├── debug_logger.js        # Debug logging utility
│   ├── fetch_image_proxy_bypass_cors.js
│   └── detect_api_environment_and_port.js
│
├── content_scripts/           # Page injection (IIFE pattern)
│   ├── detect_fashion_page.js    # Fashion site detection (7-layer)
│   ├── detect_clothing_image.js  # Clothing image scoring
│   ├── inject_image_hover_button.js  # Try-on/wardrobe hover buttons
│   ├── inject_sidebar.js        # Sidebar panel injection
│   ├── google_login_overlay.js  # Google login modal
│   ├── auth_listener.js         # Web app auth bridge
│   └── sidebar.css              # Sidebar styles
│
├── sidebar/                   # Main UI panel
│   ├── index.html             # Sidebar entry point
│   ├── sidebar.js             # Main sidebar controller
│   ├── sidebar.css            # Sidebar styles
│   ├── wardrobe_manager.js    # Client-side wardrobe logic
│   ├── gems_service.js        # Gem balance service
│   ├── history_manager.js     # Try-on history
│   ├── gallery_helpers.js     # Gallery utility functions
│   ├── image_cache_db.js      # IndexedDB image cache
│   └── modules/               # 19 feature modules
│       ├── state_and_config.js
│       ├── manage_auth_and_profile.js
│       ├── handle_tryon_processing.js
│       ├── manage_user_models.js
│       ├── manage_wardrobe_page.js
│       ├── manage_selected_clothing_items.js
│       ├── handle_result_actions.js
│       ├── manage_all_outfits_page.js
│       ├── compare_outfit_side_by_side.js
│       ├── manage_gems_and_language_panel.js
│       ├── purchase_gems_handler.js
│       ├── manage_share_lookbook.js
│       ├── render_gallery_and_results.js
│       ├── validate_clothing_image_quality.js
│       ├── setup_event_listeners_and_drag_drop.js
│       ├── handle_add_wardrobe_modal.js
│       ├── manage_help_page.js
│       ├── image_lightbox.js
│       └── confirm_dialog.js
│
├── popup/                     # Extension popup
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   └── result-popup.html
│
├── extension/                 # Shared config
│   └── config.js              # Supabase client singleton + ChromeStorageAdapter
│
├── lib/                       # Shared libraries
│   ├── i18n.js                # Translation engine
│   └── locales/               # 9 language files
│       ├── en.js, vi.js       # Full translations (~600 keys)
│       └── ja.js, ko.js, zh.js, th.js, id.js, es.js, fr.js  # Partial (~116 keys)
│
├── supabase/                  # Backend
│   ├── config.toml            # Supabase local config
│   ├── functions/             # Edge Functions (Deno/TypeScript)
│   │   ├── deno.json
│   │   ├── process-tryon/index.ts
│   │   ├── get-tryon-status/index.ts
│   │   ├── upload-image/index.ts
│   │   ├── add-wardrobe-with-quota/index.ts
│   │   ├── get-gems-balance/index.ts
│   │   ├── get-user-profile/index.ts
│   │   ├── create-polar-checkout/index.ts
│   │   ├── polar-webhook/index.ts
│   │   └── lib/               # Shared function libraries
│   │       ├── replicate_client.ts
│   │       ├── image_resizer.ts
│   │       ├── image_validator.ts
│   │       ├── storage_uploader.ts
│   │       ├── rate_limiter.ts
│   │       ├── retry_helper.ts
│   │       ├── error_handler.ts
│   │       ├── construct_gemini_prompt.ts
│   │       └── prompt_engine/
│   │           ├── PromptBuilder.ts
│   │           └── types.ts
│   ├── migrations/            # Database schema
│   └── tests/                 # Backend integration tests (Deno)
│       └── 16+ test files
│
├── tests/                     # Frontend tests (Vitest)
│   ├── setup.js
│   └── 4 test files
│
├── icons/                     # Extension icons
└── assets/                    # Visual assets
```
