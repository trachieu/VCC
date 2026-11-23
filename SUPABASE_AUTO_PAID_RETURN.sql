-- V16.56: Tự đánh dấu paid khi người dùng quay về qua VietQR Deeplink.
-- CẢNH BÁO: Đây là xác nhận theo thao tác quay lại, KHÔNG xác minh tiền đã vào ngân hàng.
-- Người dùng có thể giả lập lượt quay về. Admin cần đối soát và có quyền bỏ tích.

CREATE OR REPLACE FUNCTION public.member_confirm_payment_return(
  p_order uuid, p_member uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_uid IS NULL OR p_order IS NULL OR p_member IS NULL THEN RETURN false; END IF;
  -- Chỉ đúng phiên tạo đơn mới được đánh dấu; không dựa vào tên nhân viên đơn thuần.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id=p_order AND member_id=p_member AND user_id=v_uid
  ) THEN RETURN false; END IF;

  PERFORM set_config('app.member_payment_return','on',true);
  UPDATE public.orders
     SET paid=true
   WHERE id=p_order AND member_id=p_member AND user_id=v_uid AND paid=false;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.orders WHERE id=p_order
                 AND member_id=p_member AND user_id=v_uid AND paid=true);
END;
$function$;

-- Giữ quyền Admin bỏ tích và cơ chế RPC sửa đơn như bản chuẩn.
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF current_setting('app.member_order_edit',true)='on' THEN
    IF auth.uid() IS NULL OR old.user_id IS DISTINCT FROM auth.uid() OR old.paid THEN
      RAISE EXCEPTION 'Không có quyền sửa đơn này'; END IF;
    IF (old.id,old.round_id,old.user_id,old.member_id,old.restaurant_id,old.paid,old.paid_at,old.created_at)
       IS DISTINCT FROM
       (new.id,new.round_id,new.user_id,new.member_id,new.restaurant_id,new.paid,new.paid_at,new.created_at) THEN
      RAISE EXCEPTION 'Không thể thay đổi thông tin khác của đơn'; END IF;
    RETURN new;
  END IF;

  IF current_setting('app.member_payment_return',true)='on' THEN
    IF auth.uid() IS NULL OR old.user_id IS DISTINCT FROM auth.uid()
       OR old.paid IS TRUE OR new.paid IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Không có quyền xác nhận đơn này'; END IF;
    IF (old.id,old.round_id,old.user_id,old.member_id,old.restaurant_id,old.items,old.total,old.created_at)
       IS DISTINCT FROM
       (new.id,new.round_id,new.user_id,new.member_id,new.restaurant_id,new.items,new.total,new.created_at) THEN
      RAISE EXCEPTION 'Không thể thay đổi nội dung đơn'; END IF;
    new.paid_at:=now();
    RETURN new;
  END IF;

  IF (SELECT private.is_admin()) THEN
    IF (old.id,old.round_id,old.user_id,old.member_id,old.restaurant_id,old.items,old.total,old.created_at)
       IS DISTINCT FROM
       (new.id,new.round_id,new.user_id,new.member_id,new.restaurant_id,new.items,new.total,new.created_at) THEN
      RAISE EXCEPTION 'Không thể thay đổi nội dung đơn, chỉ trạng thái thanh toán'; END IF;
    new.paid_at:=CASE WHEN new.paid THEN coalesce(old.paid_at,now()) ELSE NULL END;
    RETURN new;
  END IF;
  RAISE EXCEPTION 'Chỉ quản trị được cập nhật thanh toán';
END;
$function$;

REVOKE ALL ON FUNCTION public.member_confirm_payment_return(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_confirm_payment_return(uuid,uuid) TO authenticated;
