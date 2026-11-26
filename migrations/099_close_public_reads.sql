-- 099: close two tables that anyone on the internet could read, and retire the WATI view.
-- Found in a security check on 26 Nov 2026. Applied the same day. Do not re-run the
-- secret change (step 2b): it would log every kiosk out of step for one code window.
--
-- 1. partner_applications (dealer applications from the shop's "apply" form)
--    Two old policies let a visitor with no login read EVERY application: shop name,
--    owner name, WhatsApp number, map location, monthly sales range.
--    The form itself needs to read back the row it has just written (it asks for the
--    new id), so a visitor may now read only rows created in the last 2 minutes.
--    Staff see everything, as before. Submitting the form is unchanged.
--    Tighter still, later: have the form make its own id so it needs no read at all.
--
-- 2. system_settings
--    a. A policy let a visitor with no login read every setting, including the
--       attendance kiosk's secret (the value the 6-digit clock-in code is made from),
--       the company TIN and VRN, and the lockout settings. The only setting the
--       sign-in page needs before login is the logo ('branding'), so that is now the
--       only one a visitor can read.
--    b. The kiosk secret was exposed, so it is replaced with a new random one. Both
--       functions that use it (attendance_kiosk_code, attendance_punch) read it live,
--       so the kiosk screen and clock-in carry on with the next code.
--
-- 3. wati_conversations_recent
--    A leftover view from WATI, the WhatsApp provider retired on 13 Nov 2026. Nothing
--    in MalkiaOS, the shop or the website reads it. Its definition, to restore it:
--      create view public.wati_conversations_recent as
--      select id, wati_id, phone_number, customer_id, customer_name, customer_full_name, crown_tier,
--             last_message_at, unread_count, status, assigned_to, assigned_to_name, last_message, created_at
--        from (select wc.id, wc.wati_id, wc.phone_number, wc.customer_id, wc.customer_name,
--                     wc.customer_name as customer_full_name, null::text as crown_tier, wc.last_message_at,
--                     wc.unread_count, wc.status, wc.assigned_to, null::text as assigned_to_name,
--                     wm.content as last_message, wc.created_at
--                from wati_conversations wc
--                left join lateral (select content from wati_messages where conversation_id = wc.id
--                                    order by created_at desc limit 1) wm on true
--               order by wc.last_message_at desc) _v
--       where (select staff_or_server());

drop policy if exists lockdown_public_read on public.partner_applications;
drop policy if exists anon_can_select_own on public.partner_applications;
create policy anon_read_just_submitted on public.partner_applications
  for select to anon using (created_at > now() - interval '2 minutes');

drop policy if exists system_settings_anon_read on public.system_settings;
create policy system_settings_anon_branding on public.system_settings
  for select to anon using (key = 'branding');

update public.system_settings
   set value = jsonb_set(value::jsonb, '{secret}', to_jsonb(encode(extensions.gen_random_bytes(16), 'hex')))::text
 where key = 'attendance_kiosk';

drop view if exists public.wati_conversations_recent;
