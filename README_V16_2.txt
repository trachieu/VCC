V16.2 – GIAO DIỆN TRẠNG THÁI & TOPPING THEO QUÁN

1. Supabase > SQL Editor: chạy TOÀN BỘ file 02_NANG_CAP_TOPPING_V16_2.sql (chỉ cần một lần; giữ nguyên 6 bảng và tài khoản Admin).
2. GitHub VCC: thay admin.html, admin.js, member.js, style.css bằng các file cùng tên trong ZIP, giữ config.js đang dùng.
3. Admin: mở Quản lý topping, chọn quán, thêm/sửa/xóa topping và giá.
4. Nút khóa: đợt MỞ hiển thị nền xanh + nút đỏ 🔒 Khóa đơn; đợt KHÓA hiển thị nền đỏ + nút xanh 🔓 Mở khóa.
5. Đơn cũ không bị sửa. Topping mặc định 6 loại chỉ được tạo cho quán đã tồn tại và chưa có topping tại lúc chạy SQL. Với quán mới, admin thêm topping trong giao diện.
6. Nếu bị trùng tên topping trong cùng quán, Supabase sẽ báo lỗi; sửa topping cũ thay vì tạo trùng.
