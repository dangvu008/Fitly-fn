# Edge Function: upload-image

## Purpose
Upload và resize image to Supabase Storage với validation và security checks.

## Endpoint
```
POST /upload-image
```

## Authentication
Requires JWT token trong Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Request Body
```json
{
  "image": "base64_encoded_image_string",
  "bucket_type": "models" | "wardrobe" | "results"
}
```

### Parameters
- `image` (required): Base64 encoded image string (có thể có hoặc không có data URL prefix)
- `bucket_type` (required): Loại bucket để upload, phải là một trong:
  - `models`: Ảnh toàn thân người dùng
  - `wardrobe`: Ảnh quần áo trong tủ đồ
  - `results`: Ảnh kết quả try-on

## Response

### Success (200)
```json
{
  "url": "https://[project].supabase.co/storage/v1/object/sign/users/...",
  "size": 245678,
  "path": "users/{user_id}/{bucket_type}/{uuid}.jpg"
}
```

### Error Responses

**401 Unauthorized**
```json
{
  "error": "Missing authorization header"
}
```

**400 Bad Request**
```json
{
  "error": "File size 12.5MB exceeds maximum 10MB"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal server error",
  "message": "Failed to resize image: ..."
}
```

## Validation Rules

1. **File Type**: Chỉ chấp nhận JPEG và PNG (kiểm tra bằng magic bytes)
2. **File Size**: Maximum 10MB
3. **Resize**: Tự động resize về max 1024px (giữ aspect ratio)
4. **Authentication**: Phải có valid JWT token

## Storage Structure

Files được lưu theo cấu trúc:
```
users/
  {user_id}/
    models/
      {uuid}.jpg
    wardrobe/
      {uuid}.png
    results/
      {uuid}.jpg
```

## Signed URL

URL trả về là signed URL với expiration time **1 giờ**.

## Example Usage

### JavaScript/TypeScript
```typescript
const response = await fetch('https://[project].supabase.co/functions/v1/upload-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    image: base64Image,
    bucket_type: 'models'
  })
})

const data = await response.json()
console.log('Uploaded:', data.url)
```

### cURL
```bash
curl -X POST https://[project].supabase.co/functions/v1/upload-image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "bucket_type": "models"
  }'
```

## Testing

### Local Testing
```bash
# Start Supabase locally
supabase start

# Serve function locally
supabase functions serve upload-image --env-file .env.local

# Test với curl
curl -X POST http://localhost:54321/functions/v1/upload-image \
  -H "Authorization: Bearer YOUR_LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

## Dependencies

- `imagescript@1.3.0`: Image processing library (pure TypeScript)
- `@supabase/supabase-js@2`: Supabase client

## Security Notes

1. **Magic Bytes Validation**: Không tin vào file extension, kiểm tra magic bytes
2. **Size Limit**: Enforce 10MB limit trước khi processing
3. **User Isolation**: Storage path bao gồm user_id để enforce RLS
4. **Signed URLs**: URLs expire sau 1 giờ để tăng security
5. **JWT Validation**: Mọi request phải có valid token

## Error Handling

Function handle các error cases sau:
- Missing/invalid auth token → 401
- Invalid image format → 400
- File too large → 400
- Resize failure → 500
- Storage upload failure → 500

Mọi error đều được log và trả về user-friendly message (không expose internal details).
