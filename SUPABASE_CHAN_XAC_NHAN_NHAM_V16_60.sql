-- V16.60: Không cho trình duyệt tự đánh dấu đã thanh toán chỉ vì quay về VietQR.
-- Chạy MỘT LẦN trong Supabase SQL Editor.
-- Không làm thay đổi trạng thái các đơn đã tồn tại.
REVOKE EXECUTE ON FUNCTION public.member_confirm_payment_return(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
-- Admin tiếp tục xác nhận hoặc bỏ tích theo cơ chế thanh toán có sẵn.
