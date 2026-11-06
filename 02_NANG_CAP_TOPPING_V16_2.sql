-- V16.2: CHẠY 1 LẦN SAU KHI ĐÃ CHẠY 01_NANG_CAP_SUPABASE.sql CỦA V16.
-- Không xóa lịch sử, không xóa các đơn cũ.
begin;
create table if not exists public.toppings (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id),
 name text not null check (char_length(trim(name)) between 1 and 100),
 price bigint not null check (price between 0 and 1000000),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists toppings_restaurant_idx on public.toppings(restaurant_id);
create unique index if not exists toppings_unique_restaurant_name on public.toppings(restaurant_id, lower(trim(name)));
alter table public.toppings enable row level security;
revoke all on public.toppings from anon;
grant select,insert,update,delete on public.toppings to authenticated;
drop policy if exists topping_read on public.toppings;
create policy topping_read on public.toppings for select to authenticated using (active or (select private.is_admin()));
drop policy if exists topping_admin_insert on public.toppings;
create policy topping_admin_insert on public.toppings for insert to authenticated with check ((select private.is_admin()));
drop policy if exists topping_admin_update on public.toppings;
create policy topping_admin_update on public.toppings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists topping_admin_delete on public.toppings;
create policy topping_admin_delete on public.toppings for delete to authenticated using ((select private.is_admin()));
-- Tạo topping mẫu cho quán đã tồn tại (chỉ khi quán chưa có topping)
insert into public.toppings (restaurant_id,name,price)
select r.id,v.name,v.price from public.restaurants r
cross join (values ('Trân châu trắng',5000),('Trân châu đường đen',5000),('Nha đam',5000),('Thạch dừa',5000),('Kem cheese',7000),('Kem trứng',7000)) as v(name,price)
where not exists(select 1 from public.toppings t where t.restaurant_id=r.id)
on conflict do nothing;
-- Chặn sửa giá trực tiếp trên trình duyệt: giá món và topping tính lại trong database.
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
  v_topping_price bigint;
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
      select price into v_topping_price from public.toppings where restaurant_id=p_restaurant and name=v_topping and active;
      if not found then raise exception 'Topping không hợp lệ: %',v_topping; end if;
      v_unit:=v_unit+v_topping_price;
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
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='toppings') then
  alter publication supabase_realtime add table public.toppings;
 end if;
end $$;
commit;
