# Bugfix Requirements Document

## Introduction

Lỗi session timeout xảy ra trong quá trình xử lý ảnh thử đồ (try-on processing), khiến người dùng bị đăng xuất khỏi hệ thống ngay cả khi quá trình xử lý chỉ mất khoảng 15 giây. Lỗi này ảnh hưởng nghiêm trọng đến trải nghiệm người dùng vì họ không thể hoàn thành chức năng thử đồ - một tính năng cốt lõi của ứng dụng.

Sau khi phân tích code, vấn đề được xác định là:
- JWT token được lấy từ storage và gửi đến Edge Function `process-tryon`
- Edge Function validate token bằng `supabase.auth.getUser(tokenPart)`
- Nếu token đã expire (hoặc sắp expire), validation sẽ fail với lỗi 401 Unauthorized
- Frontend nhận lỗi 401 và hiển thị thông báo "Phiên đăng nhập đã hết hạn"
- Không có cơ chế refresh token tự động trước khi gọi API

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN người dùng thực hiện try-on và JWT token đã expire (hoặc sắp expire trong vòng 5 phút) THEN hệ thống trả về lỗi 401 Unauthorized từ Edge Function `process-tryon` và hiển thị thông báo "Phiên đăng nhập đã hết hạn vui lòng đăng nhập lại"

1.2 WHEN người dùng thực hiện try-on và JWT token còn hạn nhưng sẽ expire trong quá trình xử lý (15-180 giây) THEN hệ thống có thể fail giữa chừng nếu token expire trong lúc polling status từ `get-tryon-status`

1.3 WHEN người dùng đã login lâu (gần hết thời gian session) và thực hiện try-on THEN hệ thống không tự động refresh token trước khi gọi API, dẫn đến lỗi 401

### Expected Behavior (Correct)

2.1 WHEN người dùng thực hiện try-on và JWT token đã expire hoặc sắp expire (còn dưới 5 phút) THEN hệ thống SHALL tự động refresh token trước khi gọi Edge Function `process-tryon`, đảm bảo token còn hạn đủ lâu để hoàn thành quá trình xử lý

2.2 WHEN người dùng thực hiện try-on và JWT token còn hạn THEN hệ thống SHALL sử dụng token hiện tại để gọi API mà không cần refresh

2.3 WHEN quá trình try-on đang xử lý (polling status) và token sắp expire THEN hệ thống SHALL tự động refresh token trước khi tiếp tục polling để đảm bảo không bị gián đoạn

2.4 WHEN refresh token thất bại (do refresh_token hết hạn hoặc invalid) THEN hệ thống SHALL hiển thị thông báo yêu cầu đăng nhập lại và chuyển hướng người dùng đến màn hình đăng nhập

### Unchanged Behavior (Regression Prevention)

3.1 WHEN người dùng thực hiện try-on với token còn hạn đủ lâu (trên 5 phút) THEN hệ thống SHALL CONTINUE TO xử lý try-on bình thường mà không cần refresh token

3.2 WHEN người dùng thực hiện các chức năng khác (load wardrobe, load models, load history) THEN hệ thống SHALL CONTINUE TO hoạt động bình thường với cơ chế authentication hiện tại

3.3 WHEN background proactive token refresh đang chạy (mỗi 5 phút) THEN hệ thống SHALL CONTINUE TO tự động refresh token như hiện tại

3.4 WHEN người dùng logout THEN hệ thống SHALL CONTINUE TO xóa tất cả token và session data như hiện tại

3.5 WHEN người dùng sử dụng guest mode (không đăng nhập) THEN hệ thống SHALL CONTINUE TO hoạt động với gems balance giới hạn mà không cần authentication
