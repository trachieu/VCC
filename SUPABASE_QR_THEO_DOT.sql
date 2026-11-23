-- V16.51: Chốt thông tin QR của từng đợt khi đợt chuyển từ đang mở sang khóa/kết thúc.
-- Chạy MỘT LẦN trong Supabase SQL Editor SAU SUPABASE_PAYMENT_SETTINGS.sql.
-- Không thay đổi dữ liệu đơn hàng hay số tiền thanh toán.
ALTER TABLE public.order_rounds
  ADD COLUMN IF NOT EXISTS qr_bank_bin text,
  ADD COLUMN IF NOT EXISTS qr_bank_name text,
  ADD COLUMN IF NOT EXISTS qr_account_number text,
  ADD COLUMN IF NOT EXISTS qr_account_name text;

-- Chỉ chụp cấu hình QR khi chuyển trạng thái từ OPEN sang LOCKED/ARCHIVED.
-- Các đợt đã khóa trước khi chạy SQL không thể tự khôi phục STK cũ.
CREATE OR REPLACE FUNCTION public.vcc_freeze_round_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_pay record;
BEGIN
  IF OLD.status = 'open' AND NEW.status IN ('locked','archived') THEN
    SELECT bank_bin, bank_name, account_number, account_name
      INTO v_pay FROM public.payment_settings WHERE id = 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Chưa cấu hình QR thanh toán; không thể khóa đợt';
    END IF;
    NEW.qr_bank_bin := v_pay.bank_bin;
    NEW.qr_bank_name := v_pay.bank_name;
    NEW.qr_account_number := v_pay.account_number;
    NEW.qr_account_name := v_pay.account_name;
  ELSIF NEW.status = 'open' THEN
    -- Khi Admin mở lại đợt, QR đi theo tài khoản hiện tại.
    -- Nếu khóa lại, hệ thống sẽ chụp lại cấu hình mới nhất.
    NEW.qr_bank_bin := NULL;
    NEW.qr_bank_name := NULL;
    NEW.qr_account_number := NULL;
    NEW.qr_account_name := NULL;
  ELSE
    -- Ngăn sửa lén thông tin QR của đợt đã khóa/kết thúc bằng UPDATE trực tiếp.
    NEW.qr_bank_bin := OLD.qr_bank_bin;
    NEW.qr_bank_name := OLD.qr_bank_name;
    NEW.qr_account_number := OLD.qr_account_number;
    NEW.qr_account_name := OLD.qr_account_name;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vcc_freeze_round_payment ON public.order_rounds;
CREATE TRIGGER vcc_freeze_round_payment
BEFORE UPDATE ON public.order_rounds
FOR EACH ROW EXECUTE FUNCTION public.vcc_freeze_round_payment();

-- Với đợt ĐÃ KHÓA trước khi áp dụng bản này: muốn giữ STK cũ, Admin cần
-- nhập chính xác thông tin trước đó rồi cập nhật một lần bằng SQL riêng.
-- Không tự sao chép STK hiện tại vào lịch sử vì có thể chuyển sai người nhận.
