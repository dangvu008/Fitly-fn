# Authentication Module

## Tổng quan

Module authentication cho Fitly Chrome Extension sử dụng **Supabase Auth** với **Google OAuth** provider.

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │  Login Overlay   │────────▶│  Auth Service    │          │
│  │  (UI)            │         │  (Logic)         │          │
│  └──────────────────┘         └──────────────────┘          │
│           │                            │                     │
│           │                            ▼                     │
│           │                   ┌──────────────────┐          │
│           │                   │ Service Worker   │          │
│           │                   │ (Background)     │          │
│           │                   └──────────────────┘          │
│           │                            │                     │
└───────────┼────────────────────────────┼─────────────────────┘
            │                            │
            ▼                            ▼
   ┌────────────────┐          ┌────────────────┐
   │  Google OAuth  │          │  Supabase Auth │
   │  (Popup)       │─────────▶│  (Backend)     │
   └────────────────┘          └────────────────┘
                                        │
                                        ▼
                               ┌────────────────┐
                               │   PostgreSQL   │
                               │   (Database)   │
                               └────────────────┘
```

## Files

### 1. `google_auth_service.js`
**Purpose**: Core authentication logic

**Exports**:
- `signInWithGoogle()`: Khởi tạo Google OAuth flow
- `signOut()`: Đăng xuất user
- `getSession()`: Lấy session hiện tại
- `getCurrentUser()`: Lấy thông tin user
- `isAuthenticated()`: Check auth status
- `initializeAuth()`: Initialize khi extension start

**Flow**:
```javascript
// 1. User click "Sign in with Google"
const result = await signInWithGoogle();

// 2. Supabase trả về OAuth URL
// 3. Mở popup window với Google OAuth
// 4. User authorize
// 5. Google callback về Supabase
// 6. Supabase tạo session
// 7. Session được lưu vào chrome.storage.local

if (result.success) {
  console.log('Logged in:', result.user);
}
```

### 2. `google_login_overlay.js`
**Purpose**: UI overlay cho login

**Features**:
- Modern gradient design
- Google Sign In button với icon
- Loading states
- Error handling
- Responsive layout

**Usage**:
```javascript
// Show overlay
chrome.runtime.sendMessage({ type: 'SHOW_LOGIN_OVERLAY' });

// Hide overlay
chrome.runtime.sendMessage({ type: 'HIDE_LOGIN_OVERLAY' });
```

### 3. `config.js`
**Purpose**: Supabase client configuration

**Exports**:
- `supabase`: Supabase client instance
- `getAuthToken()`: Helper để lấy JWT token
- `getCurrentUser()`: Helper để lấy user info

## Authentication Flow

### Sign In Flow

```
1. User clicks "Đăng nhập với Google"
   ↓
2. google_login_overlay.js sends message to service_worker
   ↓
3. service_worker calls google_auth_service.signInWithGoogle()
   ↓
4. Supabase Auth returns Google OAuth URL
   ↓
5. Open popup window with OAuth URL
   ↓
6. User authorizes in Google
   ↓
7. Google redirects to Supabase callback
   ↓
8. Supabase creates session and user record
   ↓
9. Trigger handle_new_user() creates profile with 100 gems
   ↓
10. Session saved to chrome.storage.local
   ↓
11. Overlay closes, sidebar refreshes
```

### Session Management

**Storage**: `chrome.storage.local`

**Keys**:
- `fitly_auth_session`: Supabase session object
- `fitly_auth_user`: User object (cached)

**Auto-refresh**: Supabase client tự động refresh token trước khi expire

**Persistence**: Session được lưu local, user không cần login lại khi restart browser

### Sign Out Flow

```
1. User clicks "Đăng xuất"
   ↓
2. Call google_auth_service.signOut()
   ↓
3. Supabase Auth invalidates session
   ↓
4. Clear chrome.storage.local
   ↓
5. Clear cached data (gems, wardrobe, etc.)
   ↓
6. Redirect to login screen
```

## Database Schema

### Trigger: `handle_new_user()`

Tự động chạy khi user mới đăng ký:

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

**Actions**:
1. Tạo record trong bảng `profiles`
2. Set `gems_balance = 100`
3. Extract `full_name` từ Google metadata
4. Set `email` từ auth.users

## Security

### ✅ Best Practices

1. **Anon Key Only**: Chỉ sử dụng `anon` key, KHÔNG dùng `service_role` key
2. **RLS Enabled**: Row Level Security bảo vệ data access
3. **HTTPS Only**: OAuth chỉ hoạt động trên HTTPS (production)
4. **Token Encryption**: Session token được Chrome encrypt tự động
5. **Auto Refresh**: Token tự động refresh, không lưu password

### ❌ Security Risks

- **Không hardcode secrets** trong code
- **Không log sensitive data** (tokens, passwords)
- **Không share session** giữa các users
- **Không bypass RLS** trong queries

## Error Handling

### Common Errors

#### 1. "Popup blocked"
**Cause**: Browser chặn popup window

**Solution**:
```javascript
// User phải click vào button trước
// Không thể tự động mở popup
```

#### 2. "redirect_uri_mismatch"
**Cause**: Redirect URI không match với Google Cloud Console config

**Solution**:
- Check Authorized redirect URIs trong Google Cloud Console
- Verify Extension ID đúng
- Verify Supabase URL đúng

#### 3. "Invalid session"
**Cause**: Session expired hoặc invalid

**Solution**:
```javascript
// Auto-refresh sẽ xử lý
// Nếu refresh fail, user phải login lại
const session = await loadSession();
if (!session) {
  // Show login overlay
}
```

#### 4. "User already registered"
**Cause**: Email đã tồn tại trong database

**Solution**: User có thể login với tài khoản hiện có

## Testing

### Manual Testing

1. **Test Sign In**:
   ```
   - Click "Đăng nhập với Google"
   - Verify popup opens
   - Select Google account
   - Verify redirect back to extension
   - Check gems balance = 100
   ```

2. **Test Session Persistence**:
   ```
   - Login
   - Close browser
   - Reopen browser
   - Verify still logged in
   ```

3. **Test Sign Out**:
   ```
   - Click "Đăng xuất"
   - Verify session cleared
   - Verify redirected to login
   ```

### Automated Testing

```javascript
// Test auth service
import { signInWithGoogle, signOut, isAuthenticated } from './google_auth_service.js';

// Test sign in
const result = await signInWithGoogle();
assert(result.success === true);
assert(result.user !== null);

// Test authenticated
const authed = await isAuthenticated();
assert(authed === true);

// Test sign out
const logoutResult = await signOut();
assert(logoutResult.success === true);

const authedAfter = await isAuthenticated();
assert(authedAfter === false);
```

## Monitoring

### Logs

**Chrome Extension**:
```javascript
// Service worker console
chrome://extensions > Service Worker > Console

// Content script console
F12 > Console (on any webpage)
```

**Supabase**:
```
Dashboard > Logs > Auth Logs
- Sign in events
- Sign out events
- Token refresh events
```

### Metrics

Track trong Supabase Dashboard:
- Daily Active Users (DAU)
- Sign up rate
- Sign in success rate
- Token refresh rate

## Troubleshooting

### Debug Checklist

- [ ] Supabase URL và Anon Key đúng trong `config.js`
- [ ] Google OAuth credentials đúng trong Supabase Dashboard
- [ ] Redirect URIs đã được thêm vào Google Cloud Console
- [ ] Extension ID đúng trong redirect URIs
- [ ] Migration `005_google_auth_setup.sql` đã chạy
- [ ] Trigger `handle_new_user()` tồn tại trong database
- [ ] RLS policies enabled cho bảng `profiles`
- [ ] Popup không bị block bởi browser

### Common Issues

**Issue**: User không nhận được 100 gems

**Debug**:
```sql
-- Check trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check function exists
SELECT * FROM pg_proc WHERE proname = 'handle_new_user';

-- Check profile created
SELECT * FROM profiles WHERE id = 'user-id-here';
```

**Issue**: Session không persist

**Debug**:
```javascript
// Check storage
chrome.storage.local.get(['fitly_auth_session'], (result) => {
  console.log('Session:', result.fitly_auth_session);
});
```

## Migration Guide

### From Email/Password to Google OAuth

Nếu đã có users với email/password:

1. **Keep existing auth**: Supabase hỗ trợ multiple providers
2. **Link accounts**: User có thể link Google account với email account
3. **Migrate data**: Profile data được giữ nguyên (cùng user ID)

### From Demo Mode to Production

```javascript
// Before: Demo mode
const DEMO_MODE = true;

// After: Production with Google Auth
const DEMO_MODE = false;

// Users sẽ được yêu cầu login
// Data từ demo mode không được migrate
```

## Future Enhancements

### Planned Features

1. **Multiple OAuth Providers**:
   - Facebook Login
   - Apple Sign In
   - Email/Password fallback

2. **Profile Management**:
   - Update display name
   - Upload avatar
   - Manage linked accounts

3. **Security Enhancements**:
   - 2FA (Two-Factor Authentication)
   - Session timeout settings
   - Device management

4. **Analytics**:
   - Track login sources
   - User retention metrics
   - Auth error tracking

## Support

### Documentation
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Chrome Extension OAuth](https://developer.chrome.com/docs/extensions/mv3/tut_oauth/)

### Contact
- GitHub Issues: [fitly/issues](https://github.com/fitly/issues)
- Email: support@fitly.app
