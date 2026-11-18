-- 080_circle_discount
-- Circle discount for recurring customers: per-product level (0, 5 or 10 percent).
alter table public.products
  add column if not exists circle_discount_pct smallint not null default 0;
do $do$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_circle_discount_pct_chk') then
    alter table public.products add constraint products_circle_discount_pct_chk
      check (circle_discount_pct in (0, 5, 10));
  end if;
end $do$;

create or replace view public.products_public as
select p.id, p.sku, p.slug, p.name, p.description, p.short_description,
  p.category, p.unit, p.selling_price, p.image_url,
  p.pregnancy_stage, p.expert_endorsed, p.expert_endorsement_text,
  p.show_retail, p.is_active, p.display_order,
  (coalesce(p.qty_on_hand, 0) > 0) as in_stock,
  p.circle_discount_pct
from public.products p;
revoke all on table public.products_public from public;
grant select on table public.products_public to anon, authenticated, service_role;

-- For the logged-in Circle member: is she a recurring customer?
-- Returns only yes/no and her member number. No customer data leaves.
create or replace function public.circle_my_discount_status()
returns jsonb language sql stable security definer set search_path = public as $fn$
  with me as (
    select member_no,
           right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 9) as p
    from public.circle_profiles where user_id = auth.uid()
  ),
  c as (
    select cu.id from public.customers cu, me
    where length(me.p) = 9
      and right(regexp_replace(coalesce(nullif(cu.whatsapp, ''), cu.phone, ''), '\D', '', 'g'), 9) = me.p
  ),
  n as (
    select count(*) as d from public.vouchers v
    where v.customer_id in (select id from c)
      and v.status = 'posted' and v.type in ('cash_sale', 'sales_invoice')
  )
  select jsonb_build_object(
    'member', exists (select 1 from me),
    'member_no', (select member_no from me),
    'recurring', coalesce((select d from n), 0) >= 1
  )
$fn$;
revoke all on function public.circle_my_discount_status() from public, anon;
grant execute on function public.circle_my_discount_status() to authenticated, service_role;

-- For staff at the till: is this customer a Circle member, and recurring?
create or replace function public.circle_customer_status(p_customer_id uuid, p_exclude_voucher_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_p text; v_no bigint; v_name text; v_n int;
begin
  perform public.assert_staff_caller();
  select right(regexp_replace(coalesce(nullif(whatsapp, ''), phone, ''), '\D', '', 'g'), 9)
    into v_p from public.customers where id = p_customer_id;
  if v_p is null or length(v_p) <> 9 then
    return jsonb_build_object('member', false, 'recurring', false);
  end if;
  select member_no, name into v_no, v_name from public.circle_profiles
   where right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 9) = v_p
   order by created_at limit 1;
  if v_no is null then
    return jsonb_build_object('member', false, 'recurring', false);
  end if;
  select count(*) into v_n from public.vouchers v
   where v.customer_id = p_customer_id and v.status = 'posted'
     and v.type in ('cash_sale', 'sales_invoice')
     and (p_exclude_voucher_id is null or v.id <> p_exclude_voucher_id);
  return jsonb_build_object('member', true, 'member_no', v_no, 'circle_name', v_name,
                            'past_purchases', v_n, 'recurring', v_n >= 1);
end $fn$;
revoke all on function public.circle_customer_status(uuid, uuid) from public, anon;
grant execute on function public.circle_customer_status(uuid, uuid) to authenticated, service_role;
