-- VCC: Hẹn giờ tự khóa đợt (chạy một lần trong Supabase SQL Editor).
-- Giữ nguyên dữ liệu và quyền hiện có; chỉ thêm cột và các kiểm tra giới hạn thời gian.

ALTER TABLE public.order_rounds
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;

-- Admin đang cập nhật order_rounds thông qua RLS hiện hữu.
-- Chỉ cấp thêm quyền sửa cột thời hạn; RLS tiếp tục quyết định ai được sửa.
GRANT UPDATE (closes_at) ON public.order_rounds TO authenticated;

-- Không cho mở lại khi giờ đã hết. Muốn mở lại: Admin sửa giờ mới hoặc bỏ hẹn giờ trước.
CREATE OR REPLACE FUNCTION public.vcc_round_deadline_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.status = 'open' AND NEW.closes_at IS NOT NULL
     AND NEW.closes_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'Giờ kết thúc đã qua. Hãy gia hạn hoặc bỏ hẹn giờ trước khi mở đơn.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vcc_round_deadline_guard ON public.order_rounds;
CREATE TRIGGER vcc_round_deadline_guard
BEFORE INSERT OR UPDATE ON public.order_rounds
FOR EACH ROW EXECUTE FUNCTION public.vcc_round_deadline_guard();

-- Ngăn tạo/sửa nội dung đơn sau thời điểm kết thúc NGAY TẠI DB,
-- kể cả khi trình duyệt chưa tự tải lại hoặc bị chỉnh JavaScript.
-- Không ảnh hưởng thao tác Admin đánh dấu thanh toán sau khi khóa.
CREATE OR REPLACE FUNCTION public.vcc_order_deadline_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r_status text; r_closes_at timestamptz;
BEGIN
  SELECT status, closes_at INTO r_status,r_closes_at
    FROM public.order_rounds WHERE id=NEW.round_id FOR SHARE;
  IF NOT FOUND OR r_status <> 'open' THEN
    RAISE EXCEPTION 'Đợt đặt món đã khóa hoặc kết thúc';
  END IF;
  IF r_closes_at IS NOT NULL AND statement_timestamp() >= r_closes_at THEN
    RAISE EXCEPTION 'Đã hết thời gian đặt món';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vcc_order_deadline_guard_insert ON public.orders;
CREATE TRIGGER vcc_order_deadline_guard_insert
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.vcc_order_deadline_guard();
DROP TRIGGER IF EXISTS vcc_order_deadline_guard_edit ON public.orders;
CREATE TRIGGER vcc_order_deadline_guard_edit
BEFORE UPDATE OF items,total ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.vcc_order_deadline_guard();

-- RPC chỉ khóa các đợt có thời hạn thực sự đã đến, không thể dùng để khóa sớm.
CREATE OR REPLACE FUNCTION public.close_expired_rounds()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.order_rounds
     SET status='locked'
   WHERE status='open'
     AND closes_at IS NOT NULL
     AND closes_at <= statement_timestamp();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.close_expired_rounds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_expired_rounds() TO authenticated;

-- Ưu tiên lịch chạy tại DB mỗi phút, kể cả không có ai mở website.
-- Nếu project chưa bật pg_cron, website vẫn gọi RPC khi hết giờ,
-- còn trigger orders ở trên luôn chặn nhận đơn sau hạn.
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron chưa bật được: %. Có thể bật trong Supabase Extensions.', SQLERRM;
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    BEGIN
      PERFORM cron.schedule('vcc-close-expired-rounds','* * * * *',
        'SELECT public.close_expired_rounds();');
      RAISE NOTICE 'Đã tạo lịch khóa đơn mỗi phút bằng pg_cron.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Không tạo được lịch pg_cron: %. Vẫn có khóa trên website và kiểm tra tại DB.', SQLERRM;
    END;
  END IF;
END;
$$;
