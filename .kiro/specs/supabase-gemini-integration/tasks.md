# Implementation Plan: Supabase Backend Integration với Gemini AI Try-On

## Overview

Implementation plan này chia thành 4 phases chính:
1. **Supabase Setup**: Database schema, Storage buckets, Secrets configuration
2. **Edge Functions Development**: Core backend logic (TypeScript/Deno)
3. **Extension Integration**: Update Chrome Extension để connect với Supabase
4. **Testing & Deployment**: Property tests, integration tests, và deployment

Mỗi task được thiết kế để build incrementally, với checkpoints để validate progress.

**Tech Stack:**
- Backend: Supabase Edge Functions (TypeScript/Deno)
- Database: PostgreSQL với Row Level Security
- Storage: Supabase Storage với signed URLs
- AI: Gemini Flash via Replicate API
- Frontend: Chrome Extension (JavaScript/TypeScript)
- Testing: Deno Test, fast-check (property-based testing)

## Tasks

- [x] 1. Supabase Project Setup và Database Schema
  - Tạo Supabase project mới hoặc sử dụng project hiện có
  - Configure project settings: enable RLS, set up auth providers
  - _Requirements: 1.1, 1.4_

  - [x] 1.1 Tạo database schema với 5 bảng chính
    - Chạy migration file `001_initial_schema.sql`
    - Tạo tables: profiles, user_models, wardrobe_items, tryon_history, gem_transactions
    - Thêm constraints: CHECK gems_balance >= 0, CHECK category IN (...)
    - Tạo indexes cho performance: user_id, created_at, category
    - _Requirements: 4.3, 12.1_

  - [x] 1.2 Write property test for database constraints
    - **Property 15: Gem Balance Non-Negativity Invariant**
    - Test: Attempt to set gems_balance < 0 should fail
    - **Validates: Requirements 4.3**

  - [x] 1.3 Tạo database functions cho gem operations
    - Implement `deduct_gems_atomic(user_id, amount, tryon_id)`
    - Implement `refund_gems_atomic(user_id, amount, tryon_id)`
    - Sử dụng row-level locking để tránh race conditions
    - _Requirements: 4.2, 12.5_

  - [x]* 1.4 Write property test for gem transaction atomicity
    - **Property 14: Gem Transaction Atomicity**
    - Test: Concurrent gem operations should maintain consistency
    - **Validates: Requirements 4.2, 12.5**

  - [x] 1.5 Implement Row Level Security policies
    - Chạy migration file `003_rls_policies.sql`
    - Enable RLS trên tất cả tables
    - Tạo policies: users can only view/modify their own data
    - _Requirements: 4.4, 6.3, 8.5_

  - [x]* 1.6 Write property test for data isolation
    - **Property 28: Data Isolation via RLS**
    - Test: User A cannot access User B's data
    - **Validates: Requirements 4.4, 6.3, 8.5**

- [x] 2. Supabase Storage Setup
  - [x] 2.1 Tạo Storage bucket "users" với folder structure
    - Create bucket với public = false
    - Setup folder structure: users/{user_id}/models/, wardrobe/, results/
    - _Requirements: 6.1_

  - [x] 2.2 Configure Storage RLS policies
    - Chạy migration file `004_storage_policies.sql`
    - Users can only upload/read/delete files trong folder của mình
    - _Requirements: 6.3_

  - [ ]* 2.3 Write property test for storage path structure
    - **Property 25: Storage Path Structure Compliance**
    - Test: All uploaded files follow users/{user_id}/{type}/ pattern
    - **Validates: Requirements 6.1**

- [x] 3. Configure Supabase Secrets
  - [x] 3.1 Add Replicate API key to Supabase Secrets
    - Navigate to Project Settings > Edge Functions > Secrets
    - Add secret: `REPLICATE_API_KEY = <YOUR_REPLICATE_API_KEY>`
    - Verify secret is accessible in Edge Functions via `Deno.env.get()`
    - _Requirements: 7.1, 7.2_

- [x] 4. Checkpoint - Database và Storage Setup Complete
  - Verify tất cả tables được tạo thành công
  - Verify RLS policies hoạt động (test với 2 users khác nhau)
  - Verify Storage bucket và policies hoạt động
  - Verify Secrets được configure đúng

- [x] 5. Implement Edge Function: upload-image
  - [x] 5.1 Create function scaffold và dependencies
    - Tạo file `supabase/functions/upload-image/index.ts`
    - Import dependencies: @supabase/supabase-js, image processing library
    - Setup CORS headers
    - _Requirements: 2.2_

  - [x] 5.2 Implement image validation logic
    - Validate file type (jpg/png only)
    - Validate file size (max 10MB)
    - Decode base64 input
    - _Requirements: 2.1, 7.6_

  - [x]* 5.3 Write property test for image validation
    - **Property 5: Image Upload Validation**
    - Test: Only jpg/png <= 10MB are accepted
    - **Validates: Requirements 2.1, 7.6**

  - [x] 5.4 Implement image resize logic
    - Resize image to max 1024px (maintain aspect ratio)
    - Use sharp library hoặc Deno-compatible alternative
    - _Requirements: 2.2_

  - [x]* 5.5 Write property test for image resize
    - **Property 6: Image Resize Invariant**
    - Test: After resize, max(width, height) <= 1024
    - **Validates: Requirements 2.2**

  - [x] 5.6 Implement upload to Storage
    - Generate unique filename với UUID
    - Determine storage path based on bucket type (models/wardrobe/results)
    - Upload to Supabase Storage
    - Return signed URL với 1 hour expiration
    - _Requirements: 6.2, 6.4_

  - [x]* 5.7 Write property test for filename uniqueness
    - **Property 26: Filename Uniqueness**
    - Test: Two uploads generate different filenames
    - **Validates: Requirements 6.2**

- [x] 6. Implement Edge Function: get-gems-balance
  - [x] 6.1 Create function để query gems balance
    - Tạo file `supabase/functions/get-gems-balance/index.ts`
    - Validate JWT token
    - Query profiles.gems_balance cho user hiện tại
    - Return { gems_balance: number }
    - _Requirements: 4.1_

  - [x]* 6.2 Write property test for balance consistency
    - **Property 13: Gem Balance Display Consistency**
    - Test: Returned balance matches database value
    - **Validates: Requirements 4.1**

- [x] 7. Implement Gemini Prompt Engineering Module
  - [x] 7.1 Create prompt construction helper
    - Tạo file `supabase/functions/lib/construct_gemini_prompt.ts`
    - Implement `constructGeminiPrompt(modelAnalysis, clothingItems, quality)`
    - Sort clothing items by category priority
    - Build dynamic prompt với preservation instructions
    - _Requirements: 9.3, 9.4, 9.5_

  - [x]* 7.2 Write property test for prompt completeness
    - **Property 35: Prompt Preservation Instructions**
    - Test: Generated prompt contains face/hair/body preservation instructions
    - **Validates: Requirements 9.3, 9.4**

  - [x]* 7.3 Write property test for category hierarchy
    - **Property 36: Prompt Category Hierarchy**
    - Test: Items ordered by dress > top+bottom > shoes > accessories
    - **Validates: Requirements 9.5**

  - [x] 7.4 Implement quality parameter mapping
    - Map standard → default parameters
    - Map HD → higher resolution + more inference steps
    - _Requirements: 9.6_

  - [x]* 7.5 Write property test for quality mapping
    - **Property 37: Prompt Quality Parameter Mapping**
    - Test: Different parameters for standard vs HD
    - **Validates: Requirements 9.6**

- [x] 8. Implement Replicate API Client
  - [x] 8.1 Create Replicate client wrapper
    - Tạo file `supabase/functions/lib/replicate_client.ts`
    - Implement `createPrediction(prompt, modelImageUrl, clothingUrls)`
    - Implement `getPredictionStatus(predictionId)`
    - Get API key từ `Deno.env.get('REPLICATE_API_KEY')`
    - _Requirements: 7.2_

  - [x] 8.2 Implement retry logic với exponential backoff
    - Tạo file `supabase/functions/lib/retry_helper.ts`
    - Implement `retryWithBackoff(fn, maxRetries, baseDelay)`
    - Delays: 1s, 2s, 4s, 8s
    - _Requirements: 10.6_

  - [x]* 8.3 Write property test for retry backoff
    - **Property 40: Retry Exponential Backoff**
    - Test: Retry delays increase exponentially
    - **Validates: Requirements 10.6**

- [x] 9. Implement Edge Function: process-tryon (Main Logic)
  - [x] 9.1 Create function scaffold
    - Tạo file `supabase/functions/process-tryon/index.ts`
    - Setup CORS, auth validation
    - Parse request body: { model_image, clothing_images[], quality }
    - _Requirements: 5.1_

  - [x] 9.2 Implement precondition validation
    - Validate JWT token
    - Check gems_balance >= required amount (1 for standard, 2 for HD)
    - Validate clothing_images.length <= 5
    - _Requirements: 5.1, 5.6_

  - [x]* 9.3 Write property test for precondition validation
    - **Property 17: Try-On Precondition Validation**
    - Test: Requests rejected if auth invalid or gems insufficient
    - **Validates: Requirements 5.1**

  - [x]* 9.4 Write property test for items limit
    - **Property 22: Clothing Items Limit**
    - Test: Requests with > 5 items rejected
    - **Validates: Requirements 5.6**

  - [x] 9.5 Implement gem deduction logic
    - Call `deduct_gems_atomic(user_id, amount, null)` trước khi process
    - Amount = 1 for standard, 2 for HD
    - _Requirements: 5.2_

  - [x]* 9.6 Write property test for gem deduction
    - **Property 18: Gem Deduction Correctness**
    - Test: Correct amount deducted based on quality
    - **Validates: Requirements 5.2**

  - [x] 9.7 Implement image upload flow
    - Upload model_image to Storage (call upload-image function)
    - Upload each clothing_image to Storage
    - Store URLs for Replicate API call
    - _Requirements: 5.3_

  - [ ]* 9.8 Write property test for upload ordering
    - **Property 19: Image Upload Ordering**
    - Test: Images uploaded before AI call
    - **Validates: Requirements 5.3**

  - [x] 9.9 Create tryon_history record với status = processing
    - Insert record với: user_id, model_image_url, clothing_image_urls (JSONB), gems_used, quality, status = 'processing'
    - Return tryon_id to client
    - _Requirements: 5.7_

  - [ ]* 9.10 Write property test for initial state
    - **Property 23: Try-On Initial State**
    - Test: New try-on starts with status = processing
    - **Validates: Requirements 5.7**

  - [x] 9.11 Implement Gemini API call
    - Construct prompt using `constructGeminiPrompt()`
    - Call `createPrediction()` với prompt và image URLs
    - Store replicate_prediction_id trong tryon_history
    - _Requirements: 5.8_

  - [ ]* 9.12 Write property test for prompt construction
    - **Property 24: Prompt Dynamic Construction**
    - Test: Prompt includes all clothing items with categories
    - **Validates: Requirements 5.8**

  - [x] 9.13 Return response to client
    - Return { tryon_id, status: 'processing', gems_remaining }
    - Client sẽ poll status sau đó
    - _Requirements: 5.7_

- [x] 10. Implement Edge Function: get-tryon-status
  - [x] 10.1 Create function để poll try-on status
    - Tạo file `supabase/functions/get-tryon-status/index.ts`
    - Validate JWT token
    - Query tryon_history by tryon_id (RLS ensures user owns record)
    - _Requirements: 8.1_

  - [x] 10.2 Implement Replicate status polling
    - If status = 'processing', call `getPredictionStatus(replicate_prediction_id)`
    - If Replicate status = 'succeeded', download result image
    - Upload result to Storage, update tryon_history với result_image_url, status = 'completed'
    - _Requirements: 5.4_

  - [x]* 10.3 Write property test for success state transition
    - **Property 20: Try-On Success State Transition**
    - Test: Successful AI response updates status to completed
    - **Validates: Requirements 5.4**

  - [x] 10.3 Implement error handling và refund logic
    - If Replicate status = 'failed', call `refund_gems_atomic()`
    - Update tryon_history: status = 'failed', error_message
    - If timeout (>60s), cancel prediction và refund
    - _Requirements: 5.5, 10.1, 10.2_

  - [x]* 10.4 Write property test for failure refund
    - **Property 21: Try-On Failure Refund Consistency**
    - Test: Failed try-ons refund 100% gems
    - **Validates: Requirements 5.5, 10.1, 10.2, 10.3**

  - [x] 10.5 Return status response
    - Return { status, result_url?, gems_remaining, error? }
    - _Requirements: 5.4, 5.5_

- [x] 11. Implement Rate Limiting Middleware
  - [x] 11.1 Create rate limiter helper
    - Tạo file `supabase/functions/lib/rate_limiter.ts`
    - Track requests per user per minute (use in-memory Map hoặc Redis)
    - Limit: 10 requests/minute
    - _Requirements: 7.3_

  - [x] 11.2 Apply rate limiter to process-tryon function
    - Check rate limit trước khi process request
    - Return 429 Too Many Requests nếu vượt limit
    - _Requirements: 7.3_

  - [x]* 11.3 Write property test for rate limiting
    - **Property 29: Rate Limiting Enforcement**
    - Test: 11th request in 1 minute is rejected
    - **Validates: Requirements 7.3**

- [x] 12. Implement Error Handling Module
  - [x] 12.1 Create centralized error handler
    - Tạo file `supabase/functions/lib/error_handler.ts`
    - Map internal errors to user-friendly messages
    - Implement `handleTryOnError(error, userId, tryonId, gemsUsed)`
    - _Requirements: 7.7, 10.4_

  - [x]* 12.2 Write property test for error sanitization
    - **Property 31: Error Message Sanitization**
    - Test: Error responses don't expose internal details
    - **Validates: Requirements 7.7**

  - [ ]* 12.3 Write property test for error logging
    - **Property 39: Error Logging Completeness**
    - Test: Errors logged in tryon_history with status = failed
    - **Validates: Requirements 10.4**

- [x] 13. Checkpoint - Edge Functions Complete
  - Deploy all Edge Functions to Supabase
  - Test với Postman/curl: upload-image, get-gems-balance, process-tryon, get-tryon-status
  - Verify rate limiting hoạt động
  - Verify error handling và refund logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Update Chrome Extension: Supabase Client Setup
  - [x] 14.1 Install Supabase client library
    - Run `npm install @supabase/supabase-js`
    - Create `extension/lib/supabase_client.ts`
    - Initialize Supabase client với project URL và anon key
    - _Requirements: 11.2_

  - [x] 14.2 Implement authentication helpers
    - Create `getAuthToken()` helper
    - Update login/logout flows để sử dụng Supabase Auth
    - _Requirements: 1.1, 1.3_

  - [ ]* 14.3 Write property test for login session
    - **Property 1: Login Session Persistence**
    - Test: Valid login stores session token
    - **Validates: Requirements 1.1**

  - [ ]* 14.4 Write property test for logout cleanup
    - **Property 2: Logout Cleanup Completeness**
    - Test: Logout clears all auth data
    - **Validates: Requirements 1.3**

- [x] 15. Update Chrome Extension: Try-On Service
  - [x] 15.1 Create try-on service module
    - Create `extension/services/tryon_service.ts`
    - Implement `processTryOn(modelImageFile, clothingImages, quality)`
    - Convert files to base64
    - Call Edge Function `process-tryon`
    - _Requirements: 5.1_

  - [x] 15.2 Implement status polling logic
    - Poll `get-tryon-status` every 3 seconds
    - Continue until status != 'processing'
    - Update UI với loading indicator
    - _Requirements: 11.4_

  - [ ]* 15.3 Write property test for polling interval
    - **Property 41: Polling Interval Consistency**
    - Test: Status polled every 3 seconds
    - **Validates: Requirements 11.4**

  - [x] 15.3 Implement offline mode handling
    - Cache last known gems_balance
    - Display cached value when offline
    - Show offline warning banner
    - _Requirements: 11.6_

  - [ ]* 15.4 Write property test for offline caching
    - **Property 42: Offline Mode Caching**
    - Test: Cached balance used when offline
    - **Validates: Requirements 11.6**

- [x] 16. Update Chrome Extension: UI Integration
  - [x] 16.1 Update API_BASE_URL configuration
    - Replace localhost URL với Supabase project URL
    - Update all API calls để sử dụng Supabase endpoints
    - _Requirements: 11.1_

  - [x] 16.2 Implement loading states
    - Show progress indicator during try-on processing
    - Display estimated time (10-30s)
    - Show current status (uploading, processing, downloading)
    - _Requirements: 11.3_

  - [x] 16.3 Update gems balance display
    - Fetch balance on Extension load
    - Update balance after each try-on
    - Show low balance warning
    - _Requirements: 4.1_

  - [x] 16.4 Implement error UI
    - Display user-friendly error messages
    - Show retry button for network errors
    - Handle insufficient gems error
    - _Requirements: 10.5, 11.7_

- [x] 17. Implement Wardrobe Management Features
  - [x] 17.1 Create wardrobe service
    - Create `extension/services/wardrobe_service.ts`
    - Implement `saveToWardrobe(imageFile, name, category, sourceUrl)`
    - Implement `getWardrobe(category?)`
    - Implement `deleteFromWardrobe(itemId)`
    - _Requirements: 3.1, 3.3, 3.4_

  - [ ]* 17.2 Write property test for wardrobe filter
    - **Property 11: Wardrobe Query Filter Correctness**
    - Test: Category filter returns only matching items
    - **Validates: Requirements 3.4**

  - [x] 17.3 Write property test for storage-database consistency
    - **Property 7: Storage-Database Consistency**
    - Test: Upload creates both storage file and DB record
    - **Validates: Requirements 2.3, 3.1, 3.3**

- [x] 18. Implement Try-On History Features
  - [x] 18.1 Create history service
    - Create `extension/services/history_service.ts`
    - Implement `getHistory(status?, page?)`
    - Implement pagination (100 items per page)
    - _Requirements: 8.1, 12.4_

  - [ ]* 18.2 Write property test for history ordering
    - **Property 32: History Query Ordering**
    - Test: Results sorted by created_at DESC
    - **Validates: Requirements 8.1**

  - [ ]* 18.3 Write property test for pagination
    - **Property 44: Pagination Correctness**
    - Test: Pages contain non-overlapping records
    - **Validates: Requirements 12.4**

  - [x] 18.2 Implement history UI
    - Display history list với thumbnails
    - Show status badges (completed/failed/processing)
    - Click to view full-size result
    - Filter by status
    - _Requirements: 8.2, 8.4_

  - [ ]* 18.4 Write property test for status filter
    - **Property 34: History Status Filter Correctness**
    - Test: Filter returns only matching status
    - **Validates: Requirements 8.4**

- [x] 19. Checkpoint - Extension Integration Complete
  - Test full try-on flow từ Extension
  - Verify authentication works
  - Verify gems deduction và refund
  - Verify wardrobe save/load
  - Verify history display
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Integration Testing
  - [ ]* 20.1 Write E2E test for complete try-on flow
    - Test: User login → upload model → select clothes → process try-on → view result
    - Verify gems deducted correctly
    - Verify result saved to history
    - _Requirements: 1.1, 2.1, 5.1, 5.2, 5.4_

  - [ ]* 20.2 Write E2E test for error scenarios
    - Test: Insufficient gems → rejected
    - Test: Invalid image → error message
    - Test: AI timeout → gems refunded
    - _Requirements: 5.1, 5.5, 10.1_

  - [ ]* 20.3 Write E2E test for wardrobe flow
    - Test: Save item → query wardrobe → delete item
    - Verify storage and database consistency
    - _Requirements: 3.1, 3.3, 3.4_

- [x] 21. Performance Optimization
  - [x] 21.1 Verify database indexes
    - Run EXPLAIN ANALYZE on common queries
    - Ensure indexes are being used (no full table scans)
    - _Requirements: 12.2_

  - [x] 21.2 Implement query result limits
    - Wardrobe queries: LIMIT 50
    - History queries: LIMIT 100
    - _Requirements: 12.3_

  - [ ]* 21.3 Write property test for query limits
    - **Property 43: Query Result Limits**
    - Test: Results never exceed specified limits
    - **Validates: Requirements 12.3**

- [x] 22. Security Audit
  - [x]* 22.1 Verify authentication on all endpoints
    - **Property 30: Authentication Required**
    - Test: Unauthenticated requests rejected with 401
    - **Validates: Requirements 7.4**

  - [ ]* 22.2 Verify RLS policies
    - **Property 28: Data Isolation via RLS**
    - Test: User A cannot access User B's data
    - _Requirements: 4.4, 6.3, 8.5_

  - [x] 22.3 Verify no hardcoded secrets
    - Code review: Search for API keys, passwords
    - Ensure all secrets loaded from environment
    - _Requirements: 7.1_

  - [x] 22.4 Verify input validation
    - Test: Invalid file types rejected
    - Test: Oversized files rejected
    - Test: Invalid categories rejected
    - _Requirements: 2.1, 3.2, 7.6_

- [x] 23. Documentation
  - [x] 23.1 Create API documentation
    - Document all Edge Function endpoints
    - Include request/response examples
    - Document error codes

  - [x] 23.2 Create deployment guide
    - Document Supabase setup steps
    - Document environment variables
    - Document Extension installation

  - [x] 23.3 Create user guide
    - How to use try-on feature
    - How to manage wardrobe
    - How to purchase gems

- [x] 24. Final Checkpoint - Production Ready
  - All unit tests passing
  - All property tests passing (100+ iterations each)
  - All integration tests passing
  - Security audit complete
  - Documentation complete
  - Ready for deployment to Chrome Web Store
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests (can be skipped for faster MVP)
- Each property test should run minimum 100 iterations
- Use fast-check library for property-based testing in TypeScript
- Database tests should run on test database, not production
- Edge Functions can be tested locally với `supabase functions serve`
- Extension can be tested locally với `chrome://extensions` developer mode

## Testing Strategy Summary

**Unit Tests:**
- Validate specific examples and edge cases
- Test error conditions
- Test individual functions in isolation

**Property Tests:**
- Validate universal properties across random inputs
- Run 100+ iterations per test
- Tag format: `Feature: supabase-gemini-integration, Property {N}: {description}`

**Integration Tests:**
- Test complete flows end-to-end
- Test interaction between components
- Test with real Supabase instance (test project)

**Security Tests:**
- Verify authentication and authorization
- Verify RLS policies
- Verify input validation
- Verify no secret leakage
