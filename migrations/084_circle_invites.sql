-- 084_circle_invites (ALREADY LIVE, 18 Nov 2026)
-- Personal Circle join links printed on cash-sale receipts.
-- The receipt function stores a random code per customer; the join page looks
-- the code up to prefill her name and WhatsApp number. The table is closed to
-- everyone except the server; the lookup returns only name and number, only
-- for an exact code, and only for 90 days.
create table if not exists public.circle_invites (
  token       text primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  voucher_ref text,
  created_at  timestamptz not null default now(),
  opened_at   timestamptz,
  open_count  integer not null default 0
);
create index if not exists circle_invites_customer_idx on public.circle_invites (customer_id);
alter table public.circle_invites enable row level security;
revoke all on table public.circle_invites from anon, authenticated;

create or replace function public.circle_invite_lookup(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $fn$
declare v_c uuid; v_name text; v_wa text;
begin
  if p_token is null or length(p_token) < 10 or length(p_token) > 40 then return null; end if;
  select customer_id into v_c from public.circle_invites
   where token = p_token and created_at > now() - interval '90 days';
  if v_c is null then return null; end if;
  select name, coalesce(nullif(whatsapp, ''), phone) into v_name, v_wa from public.customers where id = v_c;
  update public.circle_invites set opened_at = coalesce(opened_at, now()), open_count = open_count + 1 where token = p_token;
  return jsonb_build_object('name', v_name, 'whatsapp', v_wa);
end $fn$;
revoke all on function public.circle_invite_lookup(text) from public;
grant execute on function public.circle_invite_lookup(text) to anon, authenticated, service_role;
