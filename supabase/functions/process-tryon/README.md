# Edge Function: process-tryon

## Mục đích

Edge Function chính để xử lý virtual try-on requests. Function này nhận model image và clothing images, validate gems balance, deduct gems, upload images, gọi Gemini Flash AI qua Replicate, và trả về kết quả.

## Endpoint

```
POST /process-tryon
```

## Authentication

Yêu cầu JWT token trong Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Request Body

```json
{
  "model_image": "base64_encoded_image",
  "clothing_images": [
    {
      "image": "base64_encoded_image",
      "category": "top",
      "name": "Blue T-Shirt",
      "is_primary": true,
      "sub_category": "t-shirt"
    },
    {
      "image": "base64_encoded_image",
      "category": "bottom",
      "name": "Black Jeans",
      "is_primary": false,
      "sub_category": "skinny-jeans"
    }
  ],
  "quality": "standard"
}
```

### Fields

- `model_image` (string, required): Base64-encoded full-body photo của user
- `clothing_images` (array, required): Array of clothing items (1-4 items: 1 primary + up to 3 secondary)
  - `image` (string, required): Base64-encoded clothing image
  - `category` (string, required): One of: `top`, `bottom`, `dress`, `outerwear`, `shoes`, `accessories`
  - `name` (string, optional): Tên của clothing item
  - `is_primary` (boolean, optional): Item chính user muốn ưu tiên hiển thị. Default: first item = primary
  - `sub_category` (string, optional): Chi tiết hơn về loại đồ. Examples: `blazer`, `skinny-jeans`, `maxi-dress`, `t-shirt`, `trousers`
- `quality` (string, required): `standard` (1 gem) hoặc `hd` (2 gems)

### Multi-Layer Clothing

Khi gửi nhiều items, system tự động:

1. **Resolve Z-Layer Order**: Sắp xếp từ gần body nhất → ngoài cùng
2. **Detect Conflicts**: dress + top/bottom → dress wins (trừ khi top/bottom là primary)
3. **Infer Interactions**: 
   - Formal top + formal bottom → tucked in
   - Casual top → untucked
   - Blazer/cardigan → open (lộ lớp trong)
   - Coat/trench → closed

### Category Priority (Z-Layer)

| Layer | Category | Z-Index |
|-------|----------|---------|
| 0 | underwear | Innermost |
| 1 | bottom | Base |
| 2 | top | Middle |
| 3 | dress | Middle (conflicts with top+bottom) |
| 4 | outerwear | Outer |
| 5 | shoes | Bottom |
| 6 | accessories | Topmost |

## Response

### Success (200)

```json
{
  "tryon_id": "uuid",
  "result_image_url": "https://...",
  "gems_remaining": 98,
  "gems_used": 1,
  "cached": false,
  "processing_time_ms": 5000
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": "clothing_images array là bắt buộc"
}
```

#### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "detail": "JWT expired"
}
```

#### 429 Too Many Requests
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Bạn đã đạt giới hạn 5 lần thử/phút."
}
```

## Flow

1. Validate JWT token
2. Check rate limit (5 req/min)
3. Validate request body (max 4 items)
4. Check gems balance
5. Check cache
6. Deduct gems atomically
7. Load system_prompt từ ai_config
8. **Resolve layer order** — z-index, conflicts, interactions
9. Upload images to Storage
10. Build layering-aware prompt
11. Call Replicate API (google/gemini-2.5-flash-image)
12. Upload result to Storage
13. Save tryon_history record

## Testing

```bash
curl -X POST https://[project-id].supabase.co/functions/v1/process-tryon \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model_image": "base64...",
    "clothing_images": [
      {
        "image": "base64...",
        "category": "top",
        "name": "White Shirt",
        "is_primary": true,
        "sub_category": "button-down"
      },
      {
        "image": "base64...",
        "category": "bottom",
        "name": "Navy Trousers",
        "sub_category": "trousers"
      }
    ],
    "quality": "standard"
  }'
```

## Environment Variables

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `REPLICATE_API_KEY` - Replicate API key
