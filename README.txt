V16 - WEBSITE ĐẶT MÓN NHÓM

1. Trong Supabase > SQL Editor > New query, dán TOÀN BỘ file 01_NANG_CAP_SUPABASE.sql rồi Run một lần.
2. Cần bật Authentication > Sign In / Providers > Allow anonymous sign-ins.
3. Tạo tài khoản quản trị Supabase Auth và cấp role=admin trong profiles (bạn đã làm).
4. GitHub repository trachieu/VCC > Add file > Upload files: tải lên 6 file
   index.html, admin.html, member.js, admin.js, common.js, config.js, style.css (7 file).
   Không đăng file SQL lên website để tránh người dùng nhầm; chỉ chạy nó trong Supabase.
5. GitHub Pages: main, /(root).
6. Truy cập:
   Nhân viên: https://trachieu.github.io/VCC/
   Quản trị: https://trachieu.github.io/VCC/admin.html
7. Admin đăng nhập -> thêm nhân viên -> thêm quán -> thêm món -> tạo đợt.
8. Mở link nhân viên ở điện thoại khác để kiểm tra.

CHÚ Ý:
- Đây là bản V16 thử nghiệm, chưa được kiểm thử với Supabase thật của bạn.
- Publishable key trong config.js là khóa công khai, KHÔNG chứa mật khẩu hay service role.
- Chọn tên KHÔNG chứng minh danh tính. Người khác có thể chọn tên của bạn. Hủy đơn gắn với phiên đăng nhập ẩn danh của thiết bị/tác vụ tạo đơn, không chỉ theo tên.
- Giá trong đơn được server tính lại theo menu và topping whitelist.
- Topping hiện đang dùng giá cố định 5.000đ hoặc 7.000đ.
- CSV có thể mở bằng Excel; không phải tệp .xlsx.
- Nếu xuất bản trên GitHub công khai, cần thêm chống spam/rate limit/CAPTCHA trước khi dùng chính thức.
