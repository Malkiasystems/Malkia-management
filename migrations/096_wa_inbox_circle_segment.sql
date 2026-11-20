-- 096: "Circle mothers" segment in the WhatsApp Inbox.
--
-- A Circle mother is a WhatsApp contact linked to a Malkia Circle account that is a
-- mother's account (not an expert such as a midwife), and whose number is not a staff
-- number. Being a Circle mother is a TAG, not a kind: a mother who is also a retail
-- customer stays Retail and ALSO appears under Circle mothers, as one chat.
--
-- Changes:
--   1. wa_contacts_by_kind: one new branch, p_kind = 'circle'. Every existing branch
--      (staff, wholesale, retail, new, everyone) is word for word what it was.
--   2. wa_circle_phones(): new. The numbers that are Circle mothers, so the page can
--      filter the Waiting queue and tag rows.
-- Run BEFORE the code deploy. Safe to run while the current code is live: the current
-- page never asks for 'circle', so nothing it does changes.

create or replace function public.wa_is_circle_mother(p_phone text, p_circle_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select p_circle_user is not null
     and not wa_is_staff_phone(p_phone)
     and not exists (select 1 from circle_profiles p
                     where p.user_id = p_circle_user and (p.is_expert or p.expert_status is not null));
$function$;

create or replace function public.wa_contacts_by_kind(p_kind text, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 returns setof wa_contacts
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_staff_ok boolean;
begin
  perform wa_inbox_assert();
  v_staff_ok := wa_staff_chats_allowed();
  if p_kind = 'staff' and not v_staff_ok then return; end if;
  return query
    select c.phone, c.name, c.circle_user_id, c.os_customer_id, c.dealer_shop_id, c.first_source, c.consent_marketing, c.consent_at,
           c.consent_source, c.tags, c.last_inbound_at, c.last_outbound_at, c.created_at, c.needs_reply_since, c.reply_priority,
           c.last_inbound_body, c.handled_at, c.handled_by,
           case when c.last_message_body ilike '%(payslip)%' then 'Salary slip sent' else c.last_message_body end,
           c.last_message_at, c.last_message_dir
    from wa_contacts c left join customers cu on cu.id = c.os_customer_id
    where (p_q is null or c.phone ilike '%' || p_q || '%' or c.name ilike '%' || p_q || '%')
      and (v_staff_ok or not wa_is_staff_phone(c.phone))
      and case p_kind
            when 'staff' then wa_is_staff_phone(c.phone)
            when 'wholesale' then not wa_is_staff_phone(c.phone) and (cu.customer_type = 'wholesale' or (cu.id is null and c.dealer_shop_id is not null))
            when 'retail' then not wa_is_staff_phone(c.phone) and cu.id is not null and cu.customer_type is distinct from 'wholesale'
            when 'new' then not wa_is_staff_phone(c.phone) and cu.id is null and c.dealer_shop_id is null
            when 'circle' then wa_is_circle_mother(c.phone, c.circle_user_id)
            else true end
    order by greatest(coalesce(c.last_inbound_at, 'epoch'), coalesce(c.last_outbound_at, 'epoch')) desc
    limit least(p_limit, 500);
end $function$;

create or replace function public.wa_circle_phones()
returns table(phone text) language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform wa_inbox_assert();
  return query select c.phone from wa_contacts c where wa_is_circle_mother(c.phone, c.circle_user_id);
end $function$;

revoke all on function public.wa_is_circle_mother(text, uuid) from public, anon;
revoke all on function public.wa_circle_phones() from public, anon;
grant execute on function public.wa_circle_phones() to authenticated;
