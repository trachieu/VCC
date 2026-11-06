-- V16: CHẠY TOÀN BỘ 1 LẦN TRONG SUPABASE SQL EDITOR.
-- Dành riêng cho 6 bảng đã tạo trước đó; KHÔNG xóa bảng hay lịch sử.
begin;

alter table public.orders add column if not exists member_id uuid references public.members(id);
create index if not exists idx_orders_member_v16 on public.orders(member_id);

-- Anonymous auth được sử dụng web, nhưng không bao giờ là admin.
create or replace function private.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
    or exists(select 1 from public.profiles where id=(select auth.uid()) and active=true)
  );
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
    and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and active=true);
$$;

-- Khóa quyền bảng profile: không cho nhiều admin khác được tạo qua giao diện.
-- Quản trị đã chỉ định được giữ nguyên; mọi role admin mới cần thao tác thủ công trong SQL Editor.
create or replace function public.guard_profile_admin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.role='admin' then raise exception 'Không được xóa quản trị'; end if;
    return old;
  end if;
  if new.role='admin' and (tg_op='INSERT' or old.role is distinct from 'admin') then
    raise exception 'Không được cấp thêm quyền quản trị từ website';
  end if;
  if tg_op='UPDATE' and old.role='admin' and (new.role <> 'admin' or not new.active) then
    raise exception 'Không được tắt tài khoản quản trị từ website';
  end if;
  return new;
end; $$;
drop trigger if exists v16_guard_profile_admin on public.profiles;
create trigger v16_guard_profile_admin before insert or update or delete on public.profiles
for each row execute function public.guard_profile_admin();

-- Phân quyền nhân viên.
alter table public.members enable row level security;
drop policy if exists members_admin_manage on public.members;
create policy members_admin_manage on public.members for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated
using (active or (select private.is_admin()));
grant select,insert,update,delete on public.members to authenticated;

-- KHÔNG cho web tự gửi số tiền. Chỉ hàm đặt món được tạo đơn.
drop policy if exists orders_insert on public.orders;
revoke insert on public.orders from authenticated;
-- Không dùng DELETE qua cột member_id làm danh tính: user_id phải trùng phiên đăng nhập.
-- Chặn hủy đơn đã thanh toán, ngay cả khi đợt còn mở.
drop policy if exists orders_delete_self_open on public.orders;
create policy orders_delete_self_open on public.orders for delete to authenticated using (
  user_id=(select auth.uid()) and (select private.is_active()) and not paid
  and (select private.round_is_open(round_id))
);

-- Topping có giá cố định, được server kiểm tra (không tin giá trình duyệt).
create or replace function public.place_order(
  p_round uuid,p_member uuid,p_restaurant uuid,p_items jsonb
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
  v_item jsonb;
  v_db record;
  v_topping text;
  v_tops jsonb;
  v_qty int;
  v_sugar int;
  v_ice int;
  v_size text;
  v_note text;
  v_unit bigint;
  v_total bigint := 0;
  v_lines jsonb := '[]'::jsonb;
  v_order uuid;
  v_num int:=0;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  if not (select private.is_active()) then raise exception 'Tài khoản không hoạt động'; end if;
  if not exists(select 1 from public.members where id=p_member and active) then raise exception 'Tên nhân viên không hợp lệ'; end if;
  if not exists(select 1 from public.restaurants where id=p_restaurant and active) then raise exception 'Quán không hợp lệ'; end if;
  -- Đặt khóa SHARE để không tạo đơn sau khi admin khóa đợt.
  perform 1 from public.order_rounds where id=p_round and status='open' for share;
  if not found then raise exception 'Đợt đặt đã khóa'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>25 then
    raise exception 'Giỏ hàng không hợp lệ';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_num:=v_num+1;
    if jsonb_typeof(v_item)<>'object' then raise exception 'Dữ liệu món không hợp lệ'; end if;
    select id,name,price_m,price_l into v_db from public.menu_items
      where id=(v_item->>'menu_id')::uuid and restaurant_id=p_restaurant and active;
    if not found then raise exception 'Món không còn bán'; end if;
    v_size:=upper(coalesce(v_item->>'size','M'));
    if v_size not in ('M','L') or (v_size='L' and v_db.price_l is null) then raise exception 'Size không hợp lệ'; end if;
    v_qty:=(v_item->>'qty')::int;
    if v_qty<1 or v_qty>30 then raise exception 'Số lượng không hợp lệ'; end if;
    v_sugar:=(v_item->>'sugar')::int; v_ice:=(v_item->>'ice')::int;
    if v_sugar not in (0,25,50,70,100) or v_ice not in (0,25,50,70,100) then raise exception 'Mức đường/đá không hợp lệ'; end if;
    v_note:=left(coalesce(v_item->>'note',''),160);
    v_tops:=coalesce(v_item->'toppings','[]'::jsonb);
    if jsonb_typeof(v_tops)<>'array' or jsonb_array_length(v_tops)>6 then raise exception 'Topping không hợp lệ'; end if;
    v_unit:=case when v_size='L' then v_db.price_l else v_db.price_m end;
    for v_topping in select value from jsonb_array_elements_text(v_tops) loop
      if v_topping in ('Trân châu trắng','Trân châu đường đen','Nha đam','Thạch dừa') then v_unit:=v_unit+5000;
      elsif v_topping in ('Kem cheese','Kem trứng') then v_unit:=v_unit+7000;
      else raise exception 'Topping không hợp lệ'; end if;
    end loop;
    if (select count(*) from jsonb_array_elements_text(v_tops))<>(select count(distinct value) from jsonb_array_elements_text(v_tops)) then
      raise exception 'Không chọn topping trùng';
    end if;
    v_total:=v_total + v_unit*v_qty;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('menu_id',v_db.id,'name',v_db.name,'size',v_size,'qty',v_qty,'sugar',v_sugar,'ice',v_ice,'toppings',v_tops,'note',v_note,'unit',v_unit));
  end loop;
  if v_total>2000000000 then raise exception 'Giá trị đơn vượt giới hạn'; end if;
  insert into public.orders(round_id,user_id,member_id,restaurant_id,items,total,paid)
  values(p_round,v_uid,p_member,p_restaurant,v_lines,v_total::int,false)
  returning id into v_order;
  return v_order;
end; $$;
revoke all on function public.place_order(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.place_order(uuid,uuid,uuid,jsonb) to authenticated;

-- Khi cập nhật thanh toán, không cho sửa người đặt, giá hoặc món.
create or replace function public.guard_order_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  select status into v_status from public.order_rounds where id=old.round_id;
  if v_status='archived' then raise exception 'Lịch sử đã chốt không thể sửa'; end if;
  if not (select private.is_admin()) then raise exception 'Chỉ quản trị được cập nhật thanh toán'; end if;
  if (old.id,old.round_id,old.user_id,old.member_id,old.restaurant_id,old.items,old.total,old.created_at)
     is distinct from
     (new.id,new.round_id,new.user_id,new.member_id,new.restaurant_id,new.items,new.total,new.created_at)
  then raise exception 'Không thể thay đổi nội dung đơn, chỉ trạng thái thanh toán'; end if;
  new.paid_at:=case when new.paid then coalesce(old.paid_at,now()) else null end;
  return new;
end; $$;

-- Ngăn hủy khi khóa hoặc đơn đã thanh toán; giữ lịch sử bất biến.
create or replace function public.guard_order_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.paid then raise exception 'Đơn đã thanh toán, liên hệ quản trị'; end if;
  if not exists(select 1 from public.order_rounds where id=old.round_id and status='open') then
    raise exception 'Đơn đã khóa';
  end if;
  return old;
end; $$;
drop trigger if exists v16_order_delete on public.orders;
create trigger v16_order_delete before delete on public.orders for each row execute function public.guard_order_delete();

-- Bảo vệ đợt đã kết thúc và không cho có hai đợt đang hoạt động.
create unique index if not exists v16_one_current_round on public.order_rounds ((1)) where status in ('open','locked');

-- Realtime cho bảng nhân viên/quán/menu (gắn thêm nếu chưa có).
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='members') then
    alter publication supabase_realtime add table public.members;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='restaurants') then
    alter publication supabase_realtime add table public.restaurants;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='menu_items') then
    alter publication supabase_realtime add table public.menu_items;
  end if;
end $$;
commit;
