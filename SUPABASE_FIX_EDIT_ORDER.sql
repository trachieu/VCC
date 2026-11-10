-- Patch cho V16.25: phiên ẩn danh được sửa đơn do chính phiên đó tạo.
-- Chạy trong Supabase SQL Editor. Đơn tạo từ phiên ẩn danh cũ khác sẽ không sửa được.
CREATE OR REPLACE FUNCTION public.edit_member_order(p_order uuid,p_member uuid,p_items jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_round uuid; v_restaurant uuid; v_paid boolean;
  v_owner uuid; v_status text; v_item jsonb; v_db record;
  v_topping text; v_topping_price bigint; v_tops jsonb;
  v_qty int; v_sugar int; v_ice int; v_size text; v_note text;
  v_unit bigint; v_total bigint := 0; v_lines jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean,false) IS FALSE
     AND NOT (SELECT private.is_active()) THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id=p_member AND active) THEN
    RAISE EXCEPTION 'Tên nhân viên không hợp lệ';
  END IF;
  SELECT o.round_id,o.restaurant_id,o.paid,o.user_id
    INTO v_round,v_restaurant,v_paid,v_owner
    FROM public.orders o WHERE o.id=p_order AND o.member_id=p_member FOR UPDATE;
  IF NOT FOUND OR v_paid THEN RETURN false; END IF;
  IF v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Chỉ phiên đã đặt đơn mới có quyền sửa đơn này';
  END IF;
  SELECT r.status INTO v_status FROM public.order_rounds r WHERE r.id=v_round FOR UPDATE;
  IF v_status IS DISTINCT FROM 'open' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id=v_restaurant AND active) THEN
    RAISE EXCEPTION 'Quán không còn hoạt động'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>25 THEN
    RAISE EXCEPTION 'Giỏ hàng không hợp lệ'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'Dữ liệu món không hợp lệ'; END IF;
    SELECT id,name,price_m,price_l INTO v_db FROM public.menu_items
     WHERE id=(v_item->>'menu_id')::uuid AND restaurant_id=v_restaurant AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Món không còn bán'; END IF;
    v_size:=upper(coalesce(v_item->>'size','M'));
    IF v_size NOT IN ('M','L') OR (v_size='L' AND v_db.price_l IS NULL) THEN
      RAISE EXCEPTION 'Size không hợp lệ'; END IF;
    v_qty:=(v_item->>'qty')::int;
    IF v_qty IS NULL OR v_qty<1 OR v_qty>30 THEN RAISE EXCEPTION 'Số lượng không hợp lệ'; END IF;
    v_sugar:=(v_item->>'sugar')::int; v_ice:=(v_item->>'ice')::int;
    IF v_sugar IS NULL OR v_ice IS NULL OR v_sugar NOT IN (0,25,50,70,100) OR v_ice NOT IN (0,25,50,70,100) THEN
      RAISE EXCEPTION 'Mức đường/đá không hợp lệ'; END IF;
    v_note:=left(coalesce(v_item->>'note',''),160);
    v_tops:=coalesce(v_item->'toppings','[]'::jsonb);
    IF jsonb_typeof(v_tops)<>'array' OR jsonb_array_length(v_tops)>6 THEN
      RAISE EXCEPTION 'Topping không hợp lệ'; END IF;
    v_unit:=CASE WHEN v_size='L' THEN v_db.price_l ELSE v_db.price_m END;
    FOR v_topping IN SELECT value FROM jsonb_array_elements_text(v_tops) LOOP
      SELECT price INTO v_topping_price FROM public.toppings
       WHERE restaurant_id=v_restaurant AND name=v_topping AND active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Topping không hợp lệ: %',v_topping; END IF;
      v_unit:=v_unit+v_topping_price;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_array_elements_text(v_tops)) <>
       (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_tops)) THEN
      RAISE EXCEPTION 'Không chọn topping trùng'; END IF;
    v_total:=v_total+v_unit*v_qty;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'menu_id',v_db.id,'name',v_db.name,'size',v_size,'qty',v_qty,
      'sugar',v_sugar,'ice',v_ice,'toppings',v_tops,'note',v_note,'unit',v_unit));
  END LOOP;
  IF v_total>2000000000 THEN RAISE EXCEPTION 'Giá trị đơn vượt giới hạn'; END IF;
  PERFORM set_config('app.member_order_edit','on',true);
  UPDATE public.orders SET items=v_lines,total=v_total::int
   WHERE id=p_order AND member_id=p_member AND user_id=v_uid AND paid=false AND round_id=v_round;
  RETURN FOUND;
END;
$function$;

-- Kiểm tra RPC sửa đơn trước nhánh admin; không cho thay đổi chủ đơn, thanh toán hoặc đợt.
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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
REVOKE EXECUTE ON FUNCTION public.edit_member_order(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_member_order(uuid,uuid,jsonb) TO authenticated;

-- Quan trọng: kiểm tra quyền UPDATE trực tiếp trên orders; không cho client ghi items/total.
-- Nếu bảng orders đang cấp UPDATE toàn bảng cho authenticated, cần thu hẹp quyền đó
-- theo cấu hình RLS/GRANT hiện tại trước khi đưa vào production.
