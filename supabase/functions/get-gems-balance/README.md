# Edge Function: get-gems-balance

## Mục đích

Query gems balance (số dư Gem) của user hiện tại từ bảng `profiles`.

## Endpoint

```
GET /functions/v1/get-gems-balance
```

## Authentication

**Bắt buộc:** JWT token trong Authorization header

```
Authorization: Bearer <jwt_token>
```

## Request

**Method:** GET

**Headers:**
- `Authorization`: Bearer token từ Supabase Auth
- `Content-Type`: application/json (optional)

**Body:** None

## Response

### Success Response (200 OK)

```json
{
  "gems_balance": 100
}
```

**Fields:**
- `gems_balance` (number): Số dư Gem hiện tại của user

### Error Responses

**401 Unauthorized** - Token không hợp lệ hoặc thiếu

```json
{
  "error": "Missing authorization header"
}
```

hoặc

```json
{
  "error": "Invalid or expired token"
}
```

**405 Method Not Allowed** - Sử dụng method khác GET

```json
{
  "error": "Method not allowed"
}
```

**500 Internal Server Error** - Lỗi database hoặc server

```json
{
  "error": "Failed to fetch gems balance"
}
```

## Ví dụ sử dụng

### cURL

```bash
curl -X GET \
  https://your-project.supabase.co/functions/v1/get-gems-balance \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### JavaScript (Extension)

```typescript
import { supabase } from './lib/supabase_client'

async function getGemsBalance(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    throw new Error('Not authenticated')
  }
  
  const response = await fetch(
    'https://your-project.supabase.co/functions/v1/get-gems-balance',
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    }
  )
  
  if (!response.ok) {
    throw new Error('Failed to fetch gems balance')
  }
  
  const data = await response.json()
  return data.gems_balance
}
```

## Security

- **RLS Policy:** Function sử dụng RLS policy trên bảng `profiles` để đảm bảo user chỉ có thể xem gems balance của chính mình
- **JWT Verification:** Token được verify tự động bởi Supabase Edge Runtime (verify_jwt = true)
- **No Sensitive Data Exposure:** Error messages không expose internal details

## Default Behavior

Nếu user chưa có record trong bảng `profiles`, function sẽ trả về `gems_balance: 0` (default value).

## Related

- **Requirements:** 4.1 (Gem Balance Display)
- **Property Test:** Property 13 (Gem Balance Display Consistency)
- **Database Table:** `profiles` (gems_balance column)
