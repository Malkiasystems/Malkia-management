-- 097: MalkiaOS notification bell, and a WhatsApp escalation for Circle questions that
--      a midwife has not answered in time.
--
-- Why: a mother's question sat for almost two days (21 to 23 Nov 2026) with nobody in the
-- office knowing. The midwife alert had gone out, and nothing told anyone it went unanswered.
--
-- What this adds:
--   1. os_notifications()        one list of "things waiting on someone", worked out fresh from
--                                the live tables each time it is asked. Nothing is copied, so a
--                                notice disappears the moment the work is done.
--                                It only returns what the signed-in user has the rights to act on.
--   2. os_notification_mutes     per user: "don't show this again" for one item, a whole kind
--                                switched off, or everything switched off. On by default.
--   3. circle_wa_escalate()      every 15 minutes: any question with no midwife answer after
--                                `escalate_hours` gets one WhatsApp message to each number in
--                                `escalate_to`. Once per question per number, never repeated.
--   4. pg_cron                   the clock that runs (3). MalkiaOS had no scheduler before this.
--
-- Run BEFORE the code deploy. Safe while the current code is live: nothing existing is changed
-- except the list of allowed kinds on circle_wa_outbox, which gains one value.
-- The circle-alerts edge function must be v3 or later (it knows the new kind).

-- ── 1. Who is asking ────────────────────────────────────────────────────────────────────
-- Older staff rows have ids that differ from their sign-in ids, so match by email as well.
create or replace function public.os_me()
returns table(id uuid, permissions text[])
language sql stable security definer set search_path to 'public' as $function$
  select u.id, coalesce(u.permissions, '{}')::text[]
  from public.users u
  where u.is_active
    and (u.id = auth.uid()
         or exists (select 1 from auth.users a where a.id = auth.uid() and lower(a.email) = lower(u.email)))
  order by (u.id = auth.uid()) desc
  limit 1
$function$;

-- ── 2. Per-user switches ────────────────────────────────────────────────────────────────
create table if not exists public.os_notification_mutes (
  user_id    uuid not null references public.users(id) on delete cascade,
  key        text not null,          -- 'all' | 'kind:<kind>' | 'item:<notification key>'
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.os_notification_mutes enable row level security;
-- No policies on purpose: the table is reached only through the functions below.
revoke all on public.os_notification_mutes from anon, authenticated;

-- ── 3. The list ─────────────────────────────────────────────────────────────────────────
create or replace function public.os_notifications()
returns table(key text, kind text, urgent boolean, title text, detail text, page text, url text, since timestamptz)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  v_id uuid; v_perms text[]; v_super boolean; v_hours numeric;
begin
  select m.id, m.permissions into v_id, v_perms from public.os_me() m;
  if v_id is null then
    raise exception 'Sign in to MalkiaOS as staff to see notifications.' using errcode = '42501';
  end if;
  v_super := cardinality(v_perms) >= 40;

  if exists (select 1 from public.os_notification_mutes x where x.user_id = v_id and x.key = 'all') then
    return;
  end if;

  begin
    v_hours := (select s.value::numeric from public.circle_msg_settings s where s.key = 'escalate_hours');
  exception when others then v_hours := null;
  end;
  v_hours := coalesce(v_hours, 6);

  return query
  with items as (
    -- A mother's Circle question with no answer from a midwife. Urgent once it passes the limit.
    select ('circle_question:' || q.id)::text as key, 'circle_question'::text as kind,
           (q.created_at <= now() - make_interval(secs => (v_hours * 3600)::double precision)) as urgent,
           'Circle question waiting for a midwife'::text as title,
           left(coalesce(nullif(btrim(q.title), ''), q.body, ''), 140)::text as detail,
           'circle-messages'::text as page,
           ('https://www.malkia.co.tz/circle/swali/' || q.id)::text as url,
           q.created_at as since
    from public.circle_questions q
    where (v_super or 'crm.konnect' = any(v_perms))
      and q.deleted_at is null
      and not exists (select 1 from public.circle_answers a
                      where a.question_id = q.id and a.is_expert and a.deleted_at is null)

    union all
    -- Someone applied to be a Circle expert and is waiting for a decision.
    select ('expert_application:' || p.user_id)::text, 'expert_application'::text, true,
           'Circle expert application waiting'::text,
           (coalesce(p.name, 'Someone') || coalesce(' · ' || nullif(p.expert_profession, ''), '')
             || coalesce(' · ' || nullif(p.expert_workplace, ''), ''))::text,
           null::text, 'https://www.malkia.co.tz/admin'::text,
           coalesce(p.expert_applied_at, p.created_at)
    from public.circle_profiles p
    where (v_super or 'crm.konnect' = any(v_perms))
      and p.expert_status = 'pending' and not coalesce(p.is_test, false)

    union all
    -- A live hospital review that mothers have reported.
    select ('review_reported:' || r.id)::text, 'review'::text, false,
           'Hospital review reported by mothers'::text,
           left(coalesce(r.comment, ''), 140)::text,
           'circle-moderation'::text, null::text,
           (select max(rr.created_at) from public.registry_review_reports rr where rr.review_id = r.id)
    from public.registry_reviews r
    where (v_super or 'crm.view' = any(v_perms) or 'crm.konnect' = any(v_perms))
      and r.status = 'approved'
      and exists (select 1 from public.registry_review_reports rr where rr.review_id = r.id)

    union all
    -- A review held back automatically (phone number or blocked word) waiting for a look.
    select ('review_held:' || r.id)::text, 'review'::text, false,
           'Hospital review held for checking'::text,
           left(coalesce(r.comment, ''), 140)::text,
           'circle-moderation'::text, null::text, r.created_at
    from public.registry_reviews r
    where (v_super or 'crm.view' = any(v_perms) or 'crm.konnect' = any(v_perms))
      and r.status = 'pending'

    union all
    -- An approval request assigned to this person. Urgent after a day.
    select ('approval:' || a.id)::text, 'approval'::text,
           (a.requested_at <= now() - interval '24 hours'),
           'Approval waiting for your decision'::text,
           left(coalesce(a.reference_number, '') || coalesce(' · ' || nullif(a.request_summary, ''), ''), 140)::text,
           'approvals'::text, null::text, a.requested_at
    from public.approval_requests a
    where a.assigned_to = v_id and a.status = 'pending'

    union all
    -- A customer payment waiting for approval (this is what the old yellow bell showed).
    select ('payment_hold:' || h.id)::text, 'payment_hold'::text, false,
           'Payment waiting for approval'::text,
           left(coalesce(h.ref, '') || coalesce(' · ' || nullif(h.customer_name, ''), '')
             || coalesce(' · TZS ' || to_char(h.amount, 'FM999,999,999,990'), ''), 140)::text,
           'payment-approvals'::text, null::text, h.created_at
    from public.invoice_payment_holds h
    where (v_super or 'sales.approve_advance' = any(v_perms))
      and h.status = 'pending'
  )
  select i.key, i.kind, i.urgent, i.title, i.detail, i.page, i.url, i.since
  from items i
  where not exists (select 1 from public.os_notification_mutes x
                    where x.user_id = v_id and x.key in ('item:' || i.key, 'kind:' || i.kind))
  order by i.urgent desc, i.since asc nulls last
  limit 100;
end $function$;

-- Hide one item ("don't show this again"), switch a kind off, or switch everything off.
-- p_on = true adds the mute, false removes it.
create or replace function public.os_notification_mute(p_key text, p_on boolean default true)
returns void
language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  select m.id into v_id from public.os_me() m;
  if v_id is null then
    raise exception 'Sign in to MalkiaOS as staff.' using errcode = '42501';
  end if;
  if p_key is null or length(p_key) > 200
     or not (p_key = 'all' or p_key like 'kind:%' or p_key like 'item:%') then
    raise exception 'Unknown notification setting: %', p_key;
  end if;
  if p_on then
    insert into public.os_notification_mutes(user_id, key) values (v_id, p_key) on conflict do nothing;
  else
    delete from public.os_notification_mutes where user_id = v_id and key = p_key;
  end if;
end $function$;

-- Bring back every item this person hid one by one.
create or replace function public.os_notification_unhide_all()
returns void
language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  select m.id into v_id from public.os_me() m;
  if v_id is null then
    raise exception 'Sign in to MalkiaOS as staff.' using errcode = '42501';
  end if;
  delete from public.os_notification_mutes where user_id = v_id and key like 'item:%';
end $function$;

-- What this person has switched off, for the settings part of the bell.
create or replace function public.os_notification_prefs()
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  select m.id into v_id from public.os_me() m;
  if v_id is null then
    raise exception 'Sign in to MalkiaOS as staff.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'off', exists (select 1 from public.os_notification_mutes x where x.user_id = v_id and x.key = 'all'),
    'muted_kinds', coalesce((select jsonb_agg(substr(x.key, 6) order by x.key)
                             from public.os_notification_mutes x
                             where x.user_id = v_id and x.key like 'kind:%'), '[]'::jsonb),
    'hidden_items', (select count(*) from public.os_notification_mutes x
                     where x.user_id = v_id and x.key like 'item:%'));
end $function$;

revoke all on function public.os_me() from public, anon;
revoke all on function public.os_notifications() from public, anon;
revoke all on function public.os_notification_mute(text, boolean) from public, anon;
revoke all on function public.os_notification_unhide_all() from public, anon;
revoke all on function public.os_notification_prefs() from public, anon;
grant execute on function public.os_me() to authenticated;
grant execute on function public.os_notifications() to authenticated;
grant execute on function public.os_notification_mute(text, boolean) to authenticated;
grant execute on function public.os_notification_unhide_all() to authenticated;
grant execute on function public.os_notification_prefs() to authenticated;

-- ── 4. WhatsApp escalation for unanswered Circle questions ─────────────────────────────
alter table public.circle_wa_outbox drop constraint if exists circle_wa_outbox_kind_check;
alter table public.circle_wa_outbox add constraint circle_wa_outbox_kind_check
  check (kind = any (array['question_alert'::text, 'answer_ready'::text, 'question_escalation'::text]));

-- The existing "once" rule covers rows sent to a Circle account. Escalations go to a plain
-- phone number, so they need their own: one per question per number.
create unique index if not exists circle_wa_outbox_once_phone
  on public.circle_wa_outbox (kind, question_id, to_phone)
  where (not is_test) and to_user is null and question_id is not null;

-- Settings. escalate_from stops the first run from messaging about old questions: only
-- questions asked after this moment are ever escalated.
insert into public.circle_msg_settings(key, value) values
  ('escalate_on', 'true'),
  ('escalate_hours', '6'),
  ('escalate_to', '[{"phone":"255714172979","name":"Joe"}]'),
  ('escalate_from', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
on conflict (key) do nothing;

create or replace function public.circle_wa_escalate()
returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare v_hours numeric; v_from timestamptz; v_to jsonb; n int := 0;
begin
  if coalesce((select s.value from public.circle_msg_settings s where s.key = 'escalate_on'), 'false') <> 'true' then
    return 0;
  end if;
  begin
    v_hours := (select s.value::numeric from public.circle_msg_settings s where s.key = 'escalate_hours');
    v_from  := (select s.value::timestamptz from public.circle_msg_settings s where s.key = 'escalate_from');
    v_to    := (select s.value::jsonb from public.circle_msg_settings s where s.key = 'escalate_to');
  exception when others then
    return 0;   -- a badly typed setting must never send messages to the wrong place
  end;
  v_hours := coalesce(v_hours, 6);
  if v_from is null or v_to is null or jsonb_typeof(v_to) <> 'array' then return 0; end if;

  insert into public.circle_wa_outbox(kind, question_id, to_phone, to_name)
  select 'question_escalation', q.id, r.value ->> 'phone', nullif(r.value ->> 'name', '')
  from public.circle_questions q
  cross join lateral jsonb_array_elements(v_to) r
  where q.deleted_at is null
    and q.created_at >= v_from
    and q.created_at <= now() - make_interval(secs => (v_hours * 3600)::double precision)
    and q.created_at >  now() - interval '7 days'
    and coalesce(r.value ->> 'phone', '') <> ''
    and not exists (select 1 from public.circle_answers a
                    where a.question_id = q.id and a.is_expert and a.deleted_at is null)
    and not exists (select 1 from public.circle_profiles p
                    where p.user_id = q.author_id and coalesce(p.is_test, false))
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform public.circle_wa_kick(); end if;
  return n;
end $function$;

revoke all on function public.circle_wa_escalate() from public, anon, authenticated;

-- ── 5. The clock ───────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'circle-question-escalation';
select cron.schedule('circle-question-escalation', '*/15 * * * *', $cron$select public.circle_wa_escalate()$cron$);
