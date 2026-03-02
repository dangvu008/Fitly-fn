# Conventions

## File Naming
- **snake_case** for all JavaScript files (e.g., `auth_state_manager.js`, `process_tryon.js`)
- **UPPER_SNAKE_CASE** for config files (e.g., `ENVIRONMENT_CONFIG.js`)
- **kebab-case** for Supabase function directories (e.g., `process-tryon/`, `get-gems-balance/`)

## Code Style

### Background Scripts (ES Modules)
```javascript
import { dependency } from './module.js';
export async function handleSomething() { ... }
```

### Content Scripts (IIFE)
```javascript
(function() {
    'use strict';
    if (typeof window.__fitlyModuleLoaded !== 'undefined') return;
    window.__fitlyModuleLoaded = true;
    // ... implementation
})();
```

### JSDoc Headers
Every file has a structured header:
```javascript
/**
 * File: filename.js
 * Purpose: Description
 * Layer: Content Script / Application / Infrastructure
 * Data Contract:
 * - Input: ...
 * - Output: ...
 */
```

## Language & Comments
- **Vietnamese** comments throughout codebase (primary developer language)
- **English** for function names, variable names, JSDoc tags
- Code comments mix Vietnamese explanations with English technical terms

## Patterns
- **Message-based communication** — all cross-context communication via `chrome.runtime.sendMessage`
- **Centralized routing** — single `message_routing.js` switch dispatches all message types
- **Guard clauses** — multiple execution prevention via `window.__fitly*` flags in content scripts
- **Async/await** — consistently used for all async operations
- **Error handling** — try/catch with `console.error` logging, graceful fallbacks
- **Feature flags** — `ENVIRONMENT_CONFIG.js` controls demo mode, feature toggles

## Module Architecture
- Sidebar uses **19 separate module files** in `sidebar/modules/`
- Each module exports specific functions (no default exports)
- Main `sidebar.js` imports and orchestrates modules
- Background follows similar pattern with specialized handler files

## Constants
- `UPPER_SNAKE_CASE` for constants
- Exported from module files (e.g., `COMPRESS_MAX_DIMENSION`, `MAX_USER_MODELS`)
- Environment config centralized in `ENVIRONMENT_CONFIG.js`
