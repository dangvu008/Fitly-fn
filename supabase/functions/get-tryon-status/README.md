# Edge Function: get-tryon-status

## Mục đích

Edge Function để poll status của try-on processing. Client gọi function này mỗi 3 giây để check xem try-on đã hoàn thành chưa.

## Endpoint

```
GET /get-tryon-status/{tryon_id}
```

## Authentication

Yêu cầu JWT token trong Authorization header:
```
Authorization: Bearer <jwt_token>
```

## URL Parameters

- `tryon_id` (UUID, required): ID của try-on request (nhận từ process-tryon response)

## Response

### Processing (200)

```json
{
  "status": "processing",
  "gems_remaining": 98,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Completed (200)

```json
{
  "status": "completed",
  "result_url": "https://[project-id].supabase.co/storage/v1/object/public/users/...",
  "gems_remaining": 98,
  "created_at": "2024-01-15T10:30:00Z",
  "completed_at": "2024-01-15T10:30:45Z"
}
```

### Failed (200)

```json
{
  "status": "failed",
  "gems_remaining": 100,
  "error_message": "AI processing failed. Gems have been refunded.",
  "created_at": "2024-01-15T10:30:00Z",
  "completed_at": "2024-01-15T10:31:00Z"
}
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "UNAUTHORIZED",
  "message": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
}
```

#### 400 Bad Request
```json
{
  "error": "INVALID_REQUEST",
  "message": "Try-on record not found"
}
```

## Flow

1. Validate JWT token
2. Get tryon_id từ URL
3. Query tryon_history (RLS ensures user owns it)
4. If status = completed/failed, return immediately
5. If status = processing:
   - Check timeout (>60s) → cancel, refund, return failed
   - Poll Replicate prediction status
   - If succeeded → download result, upload to Storage, update DB, return completed
   - If failed → refund gems, update DB, return failed
   - If still processing → return processing

## Timeout Handling

- **Threshold**: 60 seconds từ khi tạo try-on
- **Action**: Cancel Replicate prediction, refund 100% gems, set status = failed

## Refund Logic

Gems được refund 100% trong các trường hợp:
- Timeout (>60s)
- Replicate API failed
- Replicate prediction failed
- Cannot download result image

## Polling Strategy

Client nên poll function này:
- **Interval**: Mỗi 3 giây
- **Stop condition**: Khi status = `completed` hoặc `failed`
- **Timeout**: Client nên stop polling sau 90 giây

## Testing

```bash
# Test với curl
curl -X GET https://[project-id].supabase.co/functions/v1/get-tryon-status/[tryon_id] \
  -H "Authorization: Bearer <jwt_token>"
```

## Dependencies

- `lib/replicate_client.ts` - Replicate API calls
- `lib/error_handler.ts` - Error handling và refund
- `lib/retry_helper.ts` - Retry logic

## Environment Variables

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `REPLICATE_API_KEY` - Replicate API key

## Security

- **RLS Policy**: User chỉ có thể query try-ons của chính mình
- **Authentication**: Mọi requests phải có valid JWT token
- **Error Sanitization**: Internal errors không được expose ra client
