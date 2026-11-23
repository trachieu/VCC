-- V16.62: bật lại quyền đánh dấu paid theo lượt quay về VietQR.
-- CẢNH BÁO: quay lại không chứng minh giao dịch thành công. Có thể tự tích nhầm.
-- Chỉ chạy nếu đã triển khai SUPABASE_AUTO_PAID_RETURN.sql của V16.56.
-- Không thay đổi các đơn hiện hữu.
GRANT EXECUTE ON FUNCTION public.member_confirm_payment_return(uuid, uuid) TO authenticated;
