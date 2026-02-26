# Requirements Document

## Introduction

Tính năng **Supabase Backend Integration với Gemini AI Try-On** tích hợp backend Supabase và Gemini AI (qua Replicate) vào Chrome Extension "Fitly - Virtual Try-On" hiện có. Hệ thống cho phép người dùng thử đồ ảo với ảnh thật thông qua AI, quản lý tủ đồ cá nhân, và sử dụng hệ thống Gem (virtual currency) để thanh toán cho các lần thử đồ.

## Glossary

- **Extension**: Chrome Extension "Fitly - Virtual Try-On" chạy trên trình duyệt người dùng
- **Supabase**: Backend-as-a-Service platform cung cấp database, storage, authentication và edge functions
- **Edge_Function**: Serverless function chạy trên Supabase edge network để xử lý business logic
- **Gemini_Flash**: AI model trên Replicate platform dùng để xử lý virtual try-on
- **Replicate**: Platform cung cấp API để gọi các AI models
- **Model_Image**: Ảnh toàn thân của người dùng dùng làm base cho try-on
- **Clothing_Item**: Một item quần áo (áo, quần, giày, phụ kiện) để thử
- **Gem**: Virtual currency trong hệ thống, dùng để thanh toán cho try-on requests
- **Try-On**: Quá trình xử lý AI để tạo ảnh kết quả người dùng mặc đồ mới
- **Wardrobe**: Tủ đồ cá nhân lưu trữ các clothing items của người dùng
- **Storage_Bucket**: Nơi lưu trữ ảnh trên Supabase Storage
- **RLS_Policy**: Row Level Security policy để bảo vệ dữ liệu trong database
- **API_Secret**: API key của Replicate được lưu trong Supabase Secrets

## Requirements

### Requirement 1: User Authentication

**User Story:** Là người dùng, tôi muốn đăng nhập vào Extension bằng email/password, để có thể sử dụng các tính năng thử đồ và lưu trữ dữ liệu cá nhân.

#### Acceptance Criteria

1. WHEN người dùng nhập email và password hợp lệ, THE Extension SHALL gọi Supabase Auth API và lưu session token
2. WHEN session token hết hạn, THE Extension SHALL tự động refresh token hoặc yêu cầu đăng nhập lại
3. WHEN người dùng đăng xuất, THE Extension SHALL xóa session token và clear local storage
4. WHEN người dùng đăng ký tài khoản mới, THE System SHALL tạo profile record với gems_balance = 0
5. THE System SHALL validate email format trước khi gọi API

### Requirement 2: Model Image Management

**User Story:** Là người dùng, tôi muốn upload ảnh toàn thân của mình, để AI có thể dùng làm base cho việc thử đồ.

#### Acceptance Criteria

1. WHEN người dùng upload ảnh, THE Extension SHALL validate định dạng (jpg/png) và kích thước (max 10MB)
2. WHEN ảnh hợp lệ, THE Edge_Function SHALL resize ảnh về max 1024px và upload lên Storage_Bucket
3. WHEN upload thành công, THE System SHALL lưu record vào bảng user_models với image_url
4. WHEN người dùng đánh dấu một ảnh làm default, THE System SHALL set is_default = true và set các ảnh khác = false
5. THE System SHALL trả về public URL của ảnh sau khi upload

### Requirement 3: Wardrobe Management

**User Story:** Là người dùng, tôi muốn lưu các item quần áo vào tủ đồ cá nhân, để có thể tái sử dụng cho các lần thử đồ sau.

#### Acceptance Criteria

1. WHEN người dùng lưu clothing item, THE System SHALL upload ảnh lên Storage_Bucket và tạo record trong wardrobe_items
2. WHEN lưu item, THE System SHALL validate category thuộc danh sách: top/bottom/dress/shoes/accessories
3. WHEN người dùng xóa item, THE System SHALL xóa ảnh khỏi Storage và xóa record khỏi database
4. THE System SHALL cho phép người dùng query wardrobe theo category
5. THE System SHALL lưu source_url nếu item được scrape từ website

### Requirement 4: Gem Balance Management

**User Story:** Là người dùng, tôi muốn xem số dư Gem hiện tại, để biết mình có đủ Gem để thực hiện try-on hay không.

#### Acceptance Criteria

1. WHEN người dùng mở Extension, THE System SHALL hiển thị gems_balance từ profiles table
2. WHEN có transaction xảy ra, THE System SHALL cập nhật gems_balance và tạo record trong gem_transactions
3. THE System SHALL đảm bảo gems_balance không bao giờ âm (constraint check)
4. WHEN query gem balance, THE System SHALL sử dụng RLS_Policy để chỉ trả về balance của user hiện tại
5. THE System SHALL log mọi thay đổi gem vào gem_transactions với type (purchase/tryon/refund)

### Requirement 5: Try-On Processing

**User Story:** Là người dùng, tôi muốn thử đồ ảo với 1-5 items quần áo, để xem mình trông như thế nào khi mặc những items đó.

#### Acceptance Criteria

1. WHEN người dùng submit try-on request, THE Edge_Function SHALL validate auth token và kiểm tra gems_balance đủ hay không
2. WHEN gems đủ, THE System SHALL trừ gems trước khi gọi Gemini_Flash API (1 gem cho standard, 2 gems cho HD)
3. WHEN gọi Gemini_Flash, THE Edge_Function SHALL upload model_image và clothing_images lên Storage trước
4. WHEN Gemini_Flash trả về kết quả, THE System SHALL lưu result_image_url vào tryon_history với status = completed
5. IF Gemini_Flash trả về lỗi hoặc timeout, THEN THE System SHALL hoàn lại gems và set status = failed
6. THE System SHALL giới hạn tối đa 5 clothing items trong một request
7. WHEN processing, THE System SHALL tạo record trong tryon_history với status = processing
8. THE Edge_Function SHALL construct prompt động dựa trên số lượng và category của clothing items

### Requirement 6: Image Storage and Retrieval

**User Story:** Là hệ thống, tôi cần lưu trữ và truy xuất ảnh một cách bảo mật, để đảm bảo chỉ user sở hữu mới truy cập được ảnh của mình.

#### Acceptance Criteria

1. THE System SHALL tổ chức Storage_Bucket theo cấu trúc: users/{user_id}/models/, users/{user_id}/wardrobe/, users/{user_id}/results/
2. WHEN upload ảnh, THE Edge_Function SHALL generate unique filename bằng UUID
3. THE System SHALL apply RLS_Policy trên Storage để chỉ user sở hữu mới đọc/xóa được ảnh
4. WHEN trả về URL, THE System SHALL trả về signed URL có thời hạn 1 giờ
5. THE System SHALL tự động xóa ảnh trong results/ sau 30 ngày để tiết kiệm storage

### Requirement 7: API Security

**User Story:** Là system administrator, tôi muốn bảo vệ API keys và user data, để tránh bị lộ thông tin nhạy cảm và truy cập trái phép.

#### Acceptance Criteria

1. THE System SHALL lưu Replicate API key trong Supabase Secrets, không hardcode trong code
2. WHEN Edge_Function gọi Replicate API, THE System SHALL lấy API key từ Deno.env
3. THE System SHALL apply rate limiting: max 10 try-on requests per minute per user
4. WHEN validate request, THE Edge_Function SHALL check auth token trước mọi operation
5. THE System SHALL chỉ accept CORS requests từ Extension domain
6. THE System SHALL validate image file type và size trước khi upload
7. WHEN có lỗi, THE System SHALL không expose internal error details ra response

### Requirement 8: Try-On History

**User Story:** Là người dùng, tôi muốn xem lại lịch sử các lần thử đồ trước đó, để có thể tham khảo và tải lại ảnh kết quả.

#### Acceptance Criteria

1. WHEN người dùng query history, THE System SHALL trả về danh sách tryon_history sorted by created_at DESC
2. THE System SHALL hiển thị: model_image, clothing_images, result_image, gems_used, quality, status
3. WHEN người dùng click vào history item, THE Extension SHALL hiển thị ảnh kết quả full size
4. THE System SHALL cho phép filter history theo status (completed/failed/processing)
5. THE System SHALL apply RLS_Policy để chỉ trả về history của user hiện tại

### Requirement 9: Gemini Flash Prompt Engineering

**User Story:** Là hệ thống, tôi cần tạo prompt chất lượng cao cho Gemini_Flash, để đảm bảo kết quả try-on realistic và giữ nguyên đặc điểm người dùng.

#### Acceptance Criteria

1. THE Edge_Function SHALL phân tích model_image để detect: gender, pose, lighting conditions
2. THE Edge_Function SHALL phân tích từng clothing_item để extract: type, color, style, pattern
3. WHEN construct prompt, THE System SHALL include instructions: giữ nguyên face, hair, body shape, height
4. THE Prompt SHALL yêu cầu: natural lighting, realistic fabric textures, professional photography quality
5. WHEN có nhiều items, THE Prompt SHALL specify cách kết hợp items theo category hierarchy (dress > top+bottom > shoes > accessories)
6. THE System SHALL adjust prompt parameters dựa trên quality setting (standard vs HD)

### Requirement 10: Error Handling and Recovery

**User Story:** Là người dùng, tôi muốn hệ thống xử lý lỗi gracefully, để không mất Gem khi có lỗi xảy ra ngoài tầm kiểm soát.

#### Acceptance Criteria

1. IF Gemini_Flash timeout (>60s), THEN THE System SHALL cancel request và hoàn 100% gems
2. IF Gemini_Flash trả về lỗi (invalid image, model error), THEN THE System SHALL hoàn 100% gems
3. IF upload image thất bại, THEN THE System SHALL trả về error message rõ ràng và không trừ gems
4. WHEN có lỗi, THE System SHALL log error details vào tryon_history với status = failed
5. THE Extension SHALL hiển thị user-friendly error message thay vì technical error
6. THE System SHALL implement retry logic với exponential backoff cho network errors

### Requirement 11: Extension Integration

**User Story:** Là developer, tôi cần update Extension code để tích hợp với Supabase backend, thay thế demo mode hiện tại.

#### Acceptance Criteria

1. THE Extension SHALL thay API_BASE_URL từ localhost sang Supabase project URL
2. THE Extension SHALL integrate Supabase client library (@supabase/supabase-js)
3. WHEN gọi process-tryon, THE Extension SHALL hiển thị loading state với progress indicator
4. THE Extension SHALL poll tryon_history status mỗi 3 giây cho đến khi status != processing
5. WHEN nhận kết quả, THE Extension SHALL hiển thị result image và cập nhật gems balance
6. THE Extension SHALL handle offline mode: cache last known gems balance và hiển thị warning
7. WHEN có lỗi network, THE Extension SHALL hiển thị retry button

### Requirement 12: Database Performance

**User Story:** Là system administrator, tôi muốn database queries chạy nhanh, để đảm bảo trải nghiệm người dùng mượt mà.

#### Acceptance Criteria

1. THE System SHALL tạo index trên: profiles(id), user_models(user_id), wardrobe_items(user_id, category), tryon_history(user_id, created_at)
2. WHEN query wardrobe, THE System SHALL sử dụng index để tránh full table scan
3. THE System SHALL limit query results: max 50 items cho wardrobe, max 100 items cho history
4. THE System SHALL implement pagination cho history queries
5. WHEN update gems_balance, THE System SHALL sử dụng atomic transaction để tránh race condition
