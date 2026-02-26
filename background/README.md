# Background module

Thư mục này chứa các module logic chính cho chrome service worker (background script).
Được thiết kế dựa trên nguyên tắc **Micro-Files** để mã nguồn dễ bảo trì, module hoá và tối ưu cho AI Assistant.

## Cấu trúc module

Background script được chia theo các chức năng cụ thể:

*   **`message_routing.js`**: File quan trọng nhất, đóng vai trò Router để nhận tất cả message gửi từ frontend (popup, sidebar) và chuyển tiếp đến các handler xử lý nghiệp vụ tương ứng.
*   **`auth_state_manager.js` & `auth_handlers.js`**: Quản lý trạng thái xác thực, đăng nhập/đăng xuất Google, lưu trữ JWT Token và session.
*   **`process_tryon.js`**: Xử lý logic Thử đồ ảo (Virtual Try-On), trừ Gems, và tương tác với Supabase Edge Functions.
*   **`process_edit.js`**: Tương tự như quy trình thử đồ nhưng chuyên dụng cho Edit ảnh.
*   **`wardrobe_manager.js` & `recent_clothing_manager.js`**: Quản lý tương tác với Tủ đồ và các món đồ vừa thử.
*   **`user_model_manager.js` & `outfit_manager.js`**: Quản lý Ảnh Model của người dùng, cài đặt ảnh mặc định và lưu trữ Outfit.
*   **`context_menus.js`**: Setup Menu chuột phải.
*   **`cloud_sync.js`**: Đồng bộ dữ liệu Local sang Cloud qua Supabase.
*   **`payment_handlers.js`**: Truy xuất số lượng Gems.
*   **`image_compressor.js` & `fetch_image_proxy_bypass_cors.js`**: Tiện ích nén ảnh (bằng OffscreenCanvas) và bypass URL CORS bằng server proxy.
*   **`ENVIRONMENT_CONFIG.js`**: Định nghĩa Constants, Feature Flags và các cài đặt Supabase.
*   **`settings_manager.js` & `i18n_manager.js`**: Quản lý cài đặt giao diện (ngôn ngữ, theme) và hỗ trợ đa ngôn ngữ nội tại của Service Worker.

## Luồng hoạt động

1.  Toàn bộ Chrome runtime message sẽ đi qua `service_worker.js`.
2.  `service_worker.js` đẩy message vào hàm `handleMessage` trong `message_routing.js`.
3.  `message_routing.js` phân tích `message.type` và chuyển giao tác vụ cho từng handler (ví dụ: `PROCESS_TRYON` được gọi trong `process_tryon.js`).
4.  Data trả về được service worker gửi lại cho frontend asynchronouly (`return true`).

## Hướng dẫn maintain

Nếu có Event Type hoặc chức năng mới:
1.  Tạo **file_verb_noun_condition.js** chuyên dụng.
2.  Viết hàm export trong file đó.
3.  Import hàm đó vào `message_routing.js`.
4.  Thêm 1 switch-case mapping `message.type` gọi hàm vừa import.

_Dự án áp dụng chặt chẽ kiến trúc Clean Code và file siêu nhỏ (<= 300 dòng/file). Tuyệt đối không nhồi nhét xử lý vào main service_worker.js._
