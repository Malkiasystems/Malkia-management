-- 100_services (applied live 26 Nov 2026 as os_100_services)
-- The Services page: everything Malkia sells that is not a physical product.
-- First service: the week by week pregnancy lessons on WhatsApp (slug 'weekly').
-- Built so that mobile money (Snippe) slots in later without reshaping anything:
--   service_payments already holds a provider reference, an idempotency key and the
--   period each payment covers, and service_payment_settle() is the one door a
--   payment webhook goes through to extend a mother's cover.
-- No table here is readable by a Circle login or the public. Staff reach them only
-- through the functions below, which check the 'crm.services' permission.

-- ── Tables ─────────────────────────────────────────────────────────────────────
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  kind text not null check (kind in ('subscription', 'booking', 'course')),
  name text not null check (length(trim(name)) between 2 and 80),
  tagline text,
  price_tzs integer check (price_tzs is null or price_tzs >= 0),
  period_days integer not null default 30 check (period_days between 1 and 366),
  free_days integer not null default 30 check (free_days between 0 and 366),
  is_open boolean not null default false,
  -- While false nobody can pay yet, so nobody is expired for not paying.
  payments_live boolean not null default false,
  payments_live_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_subscriptions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  rejoined_at timestamptz,
  free_until timestamptz,
  paid_until timestamptz,
  paused_at timestamptz,
  pause_reason text,
  stopped_at timestamptz,
  stop_source text check (stop_source is null or stop_source in ('mother', 'staff', 'acha')),
  added_by uuid,
  added_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, user_id)
);

create table if not exists public.service_payments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  subscription_id uuid references public.service_subscriptions(id) on delete set null,
  user_id uuid,
  payer_name text,
  phone text,
  amount_tzs integer not null check (amount_tzs > 0),
  currency text not null default 'TZS',
  provider text not null check (provider in ('snippe', 'manual')),
  provider_ref text,
  idempotency_key text unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'expired', 'reversed')),
  channel text,
  period_days integer not null check (period_days between 1 and 366),
  covers_from timestamptz,
  covers_until timestamptz,
  raw jsonb,
  note text,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (provider, provider_ref)
);

create table if not exists public.service_events (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id),
  subscription_id uuid references public.service_subscriptions(id) on delete set null,
  user_id uuid,
  member_name text,
  action text not null,
  reason text,
  days integer,
  by_user uuid,
  by_name text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.service_sends (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  subscription_id uuid not null references public.service_subscriptions(id) on delete cascade,
  user_id uuid,
  lesson_id uuid references public.circle_lessons(id) on delete set null,
  week integer,
  position integer,
  topic text,
  phone text,
  to_name text,
  trigger text not null default 'slot' check (trigger in ('first', 'slot', 'retry')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  twilio_sid text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (subscription_id, lesson_id)
);
create index if not exists service_sends_status_idx on public.service_sends (status, created_at);
create index if not exists service_sends_sub_idx on public.service_sends (subscription_id, created_at desc);

create table if not exists public.service_exports (
  id uuid primary key default gen_random_uuid(),
  by_user uuid,
  by_name text,
  what text,
  row_count integer,
  filters jsonb,
  created_at timestamptz not null default now()
);

alter table public.services enable row level security;
alter table public.service_subscriptions enable row level security;
alter table public.service_payments enable row level security;
alter table public.service_events enable row level security;
alter table public.service_sends enable row level security;
alter table public.service_exports enable row level security;
revoke all on public.services, public.service_subscriptions, public.service_payments,
  public.service_events, public.service_sends, public.service_exports from anon, authenticated, public;
grant all on public.services, public.service_subscriptions, public.service_payments,
  public.service_events, public.service_sends, public.service_exports to service_role;

insert into public.services (slug, kind, name, tagline, price_tzs, period_days, free_days, is_open)
values ('weekly', 'subscription', 'Week by week lessons', 'Pregnancy lessons on WhatsApp, three a week', null, 30, 30,
        coalesce((select value from public.circle_msg_settings where key = 'weekly_open'), 'false') = 'true')
on conflict (slug) do nothing;

-- ── Helpers ────────────────────────────────────────────────────────────────────
create or replace function public.services_can() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.circle_staff_can('crm.services');
$$;

-- What a subscription is right now. Never stored, so it can never go stale.
--   free_open = her free days are over but payments are not switched on yet, so she stays covered.
create or replace function public.service_sub_status(s public.service_subscriptions, p_payments_live boolean) returns text
language sql stable as $$
  select case
    when s.stopped_at is not null then 'stopped'
    when s.paused_at is not null then 'paused'
    when s.paid_until is not null and s.paid_until > now() then 'active'
    when s.free_until is not null and s.free_until > now() then 'free'
    when not coalesce(p_payments_live, false) then 'free_open'
    else 'expired' end;
$$;

create or replace function public.service_send_kick() returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  perform net.http_post(
    url := 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/circle-weekly',
    body := '{"action":"run"}'::jsonb,
    headers := '{"content-type":"application/json"}'::jsonb);
exception when others then null;
end $$;

-- ── The planner: who gets which lesson ─────────────────────────────────────────
-- Runs Monday, Wednesday and Saturday at 10:00 Dar es Salaam time for everyone, and
-- once for one mother the moment she joins (p_sub). The rule is the same both times:
--   her week = completed weeks of pregnancy today
--   she gets the lowest numbered Ready lesson of that week she has not had yet
-- so what she reads always matches her real week, lessons arrive in order, and a
-- lesson is never sent twice. A send that failed is tried again, up to 3 times.
create or replace function public.service_plan_sends(p_sub uuid default null) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare sv public.services; r record; n integer := 0;
begin
  select * into sv from public.services where slug = 'weekly' and is_active;
  if not found then return 0; end if;

  -- A mother who typed ACHA on WhatsApp after joining has asked to stop.
  for r in
    select p.user_id
    from public.service_subscriptions s
    join public.circle_profiles p on p.user_id = s.user_id
    join public.wa_contacts c on c.phone = '+' || p.whatsapp
    where s.service_id = sv.id and s.stopped_at is null and (p_sub is null or s.id = p_sub)
      and coalesce(c.consent_marketing, false) = false and c.consent_source = 'whatsapp opt-out'
      and c.consent_at > coalesce(s.rejoined_at, s.started_at)
  loop
    perform set_config('malkia.stop_source', 'acha', true);
    update public.circle_profiles set weekly_wa = false, weekly_stopped_at = now() where user_id = r.user_id and weekly_wa;
    perform set_config('malkia.stop_source', '', true);
  end loop;

  insert into public.service_sends (service_id, subscription_id, user_id, lesson_id, week, position, topic, phone, to_name, trigger, status)
  select sv.id, s.id, s.user_id, l.id, l.week, l.position, l.topic, p.whatsapp, p.name,
         case when p_sub is null then 'slot' else 'first' end, 'queued'
  from public.service_subscriptions s
  join public.circle_profiles p on p.user_id = s.user_id
  cross join lateral (select floor(public.circle_preg_days(p.due_date, p.last_period) / 7.0)::int as wk) w
  join lateral (
    select l.id, l.week, l.position, l.topic from public.circle_lessons l
    where l.kind = 'lesson' and l.status = 'ready' and l.week = w.wk
      and not exists (select 1 from public.service_sends x
                      where x.subscription_id = s.id and x.lesson_id = l.id
                        and (x.status <> 'failed' or x.attempts >= 3))
    order by l.position limit 1) l on true
  where s.service_id = sv.id and (p_sub is null or s.id = p_sub)
    and public.service_sub_status(s, sv.payments_live) in ('active', 'free', 'free_open')
    and coalesce(p.weekly_wa, false) and p.stage = 'pregnancy'
    and coalesce(p.whatsapp, '') <> '' and not coalesce(p.is_expert, false)
    and w.wk between 4 and 42
    and not exists (select 1 from public.service_sends y
                    where y.subscription_id = s.id and y.status in ('queued', 'sending', 'sent')
                      and y.created_at > now() - interval '12 hours')
  on conflict (subscription_id, lesson_id) do update
    set status = 'queued', trigger = 'retry', error = null, created_at = now()
    where public.service_sends.status = 'failed' and public.service_sends.attempts < 3;
  get diagnostics n = row_count;
  if n > 0 then perform public.service_send_kick(); end if;
  return n;
end $$;

-- Picks up anything still waiting (for example after the sender was interrupted).
create or replace function public.service_send_sweep() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update public.service_sends set status = 'failed', error = 'Sending was interrupted before it was confirmed.'
   where status = 'sending' and created_at < now() - interval '30 minutes';
  select count(*) into n from public.service_sends where status = 'queued';
  if n > 0 then perform public.service_send_kick(); end if;
  return n;
end $$;

-- The sender takes its work through this, so two runs can never take the same row.
create or replace function public.service_send_claim(p_limit integer default 20) returns json
language plpgsql security definer set search_path to 'public' as $$
declare out json;
begin
  with c as (
    select id from public.service_sends where status = 'queued'
    order by created_at limit greatest(least(coalesce(p_limit, 20), 50), 1) for update skip locked),
  u as (
    update public.service_sends s set status = 'sending', attempts = s.attempts + 1
    from c where s.id = c.id returning s.*)
  select coalesce(json_agg(json_build_object(
      'id', u.id, 'phone', u.phone, 'name', u.to_name,
      'lesson', (select row_to_json(l) from public.circle_lessons l where l.id = u.lesson_id and l.status = 'ready' and l.kind = 'lesson'),
      'still_on', exists (select 1 from public.service_subscriptions s join public.services sv on sv.id = s.service_id
                          join public.circle_profiles p on p.user_id = s.user_id
                          where s.id = u.subscription_id and coalesce(p.weekly_wa, false)
                            and public.service_sub_status(s, sv.payments_live) in ('active', 'free', 'free_open')))), '[]'::json)
    into out from u;
  return out;
end $$;

-- ── Keeping the subscription in step with what the mother does in Circle ───────
-- Circle keeps working exactly as before (circle_weekly_join / circle_weekly_stop set
-- weekly_wa on her profile). This trigger mirrors that into service_subscriptions.
-- It can never block a profile save: any fault is written down and the save goes on.
create or replace function public.service_weekly_sync() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare sv public.services; s public.service_subscriptions; was_there boolean;
  a_id uuid := nullif(current_setting('malkia.actor_id', true), '')::uuid;
  a_name text := nullif(current_setting('malkia.actor_name', true), '');
  a_reason text := nullif(current_setting('malkia.reason', true), '');
  a_src text := coalesce(nullif(current_setting('malkia.stop_source', true), ''), 'mother');
begin
  begin
    select * into sv from public.services where slug = 'weekly';
    if not found then return new; end if;
    if coalesce(new.weekly_wa, false) then
      was_there := exists (select 1 from public.service_subscriptions where service_id = sv.id and user_id = new.user_id);
      insert into public.service_subscriptions (service_id, user_id, started_at, free_until, added_by, added_by_name)
      values (sv.id, new.user_id, now(), now() + make_interval(days => sv.free_days), a_id, a_name)
      on conflict (service_id, user_id) do update
        set stopped_at = null, stop_source = null, paused_at = null, pause_reason = null, rejoined_at = now(), updated_at = now()
      returning * into s;
      insert into public.service_events (service_id, subscription_id, user_id, member_name, action, reason, by_user, by_name)
      values (sv.id, s.id, new.user_id, new.name,
              case when a_id is not null then 'added_by_staff' when was_there then 'rejoined' else 'joined' end, a_reason, a_id, a_name);
      perform public.service_plan_sends(s.id);
    else
      update public.service_subscriptions set stopped_at = now(), stop_source = a_src, updated_at = now()
       where service_id = sv.id and user_id = new.user_id and stopped_at is null returning * into s;
      if found then
        insert into public.service_events (service_id, subscription_id, user_id, member_name, action, reason, by_user, by_name)
        values (sv.id, s.id, new.user_id, new.name,
                case a_src when 'staff' then 'stopped_by_staff' when 'acha' then 'stopped_acha' else 'stopped' end, a_reason, a_id, a_name);
      end if;
    end if;
  exception when others then
    begin
      insert into public.app_error_log (kind, ref, message, detail)
      values ('service_weekly_sync', new.user_id::text, sqlerrm, jsonb_build_object('weekly_wa', new.weekly_wa));
    exception when others then null;
    end;
  end;
  return new;
end $$;

drop trigger if exists trg_service_weekly_sync on public.circle_profiles;
create trigger trg_service_weekly_sync after update of weekly_wa on public.circle_profiles
  for each row when (old.weekly_wa is distinct from new.weekly_wa) execute function public.service_weekly_sync();

-- ── What the Services page reads ───────────────────────────────────────────────
create or replace function public.services_me(out id uuid, out name text)
language sql stable security definer set search_path to 'public' as $$
  select u.id, u.full_name::text from public.users u
   where (u.id = auth.uid() or lower(u.email) = lower(coalesce((select email from auth.users where id = auth.uid()), '')))
     and u.is_active limit 1;
$$;

create or replace function public.services_overview() returns json
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.services_can() then raise exception 'You do not have permission to see Services.'; end if;
  return json_build_object(
    'is_super', public.circle_staff_super(),
    'services', coalesce((select json_agg(json_build_object(
      'id', sv.id, 'slug', sv.slug, 'kind', sv.kind, 'name', sv.name, 'tagline', sv.tagline,
      'price_tzs', sv.price_tzs, 'period_days', sv.period_days, 'free_days', sv.free_days,
      'payments_live', sv.payments_live,
      'is_open', case when sv.slug = 'weekly'
                      then coalesce((select value from circle_msg_settings where key = 'weekly_open'), 'false') = 'true'
                      else sv.is_open end,
      'counts', (select json_build_object(
          'on',      count(*) filter (where st in ('active', 'free', 'free_open')),
          'free',    count(*) filter (where st in ('free', 'free_open')),
          'paying',  count(*) filter (where st = 'active'),
          'paused',  count(*) filter (where st = 'paused'),
          'stopped', count(*) filter (where st = 'stopped'),
          'expired', count(*) filter (where st = 'expired'),
          'ending',  count(*) filter (where st = 'free' and sv.payments_live and free_until < now() + interval '7 days'))
        from (select public.service_sub_status(s, sv.payments_live) st, s.free_until
                from service_subscriptions s where s.service_id = sv.id) q),
      'lessons_ready', (select count(*) from circle_lessons where kind = 'lesson' and status = 'ready'),
      'lessons_total', (select count(*) from circle_lessons where kind = 'lesson'),
      'template_ok', exists (select 1 from wa_templates where name in ('malkia_circle_weekly_sw', 'malkia_circle_weekly_img_sw') and status = 'approved' and is_active),
      -- mothers who are due a lesson but have none Ready for their week
      'gaps', coalesce((select json_agg(json_build_object('week', g.wk, 'mothers', g.n) order by g.wk) from (
          select w.wk, count(*) n
          from service_subscriptions s join circle_profiles p on p.user_id = s.user_id
          cross join lateral (select floor(public.circle_preg_days(p.due_date, p.last_period) / 7.0)::int as wk) w
          where s.service_id = sv.id and sv.slug = 'weekly'
            and public.service_sub_status(s, sv.payments_live) in ('active', 'free', 'free_open')
            and w.wk between 4 and 42
            and not exists (select 1 from circle_lessons l where l.kind = 'lesson' and l.status = 'ready' and l.week = w.wk
                              and not exists (select 1 from service_sends x where x.subscription_id = s.id and x.lesson_id = l.id and x.status <> 'failed'))
            and (select count(*) from service_sends x join circle_lessons l on l.id = x.lesson_id
                  where x.subscription_id = s.id and l.week = w.wk and x.status <> 'failed') < 3
          group by w.wk) g), '[]'::json)
    ) order by sv.created_at) from services sv where sv.is_active), '[]'::json));
end $$;

create or replace function public.services_subscribers(p_service uuid) returns json
language plpgsql stable security definer set search_path to 'public' as $$
declare super boolean := public.circle_staff_super(); live boolean;
begin
  if not public.services_can() then raise exception 'You do not have permission to see Services.'; end if;
  select payments_live into live from services where id = p_service;
  return coalesce((select json_agg(x order by x.started_at desc) from (
    select s.id, s.user_id, p.name, p.username, p.member_no, coalesce(p.is_test, false) as is_test,
           case when super then p.whatsapp end as whatsapp,
           case when p.stage = 'pregnancy' then floor(public.circle_preg_days(p.due_date, p.last_period) / 7.0)::int end as preg_week,
           public.service_sub_status(s, live) as status,
           s.started_at, s.rejoined_at, s.free_until, s.paid_until,
           greatest(s.free_until, s.paid_until) as covered_until,
           s.paused_at, s.pause_reason, s.stopped_at, s.stop_source, s.added_by_name,
           (select count(*) from service_sends x where x.subscription_id = s.id and x.status = 'sent') as lessons_sent,
           (select json_build_object('week', x.week, 'position', x.position, 'topic', x.topic, 'at', coalesce(x.sent_at, x.created_at),
                     'status', case when x.status = 'sent' then coalesce((select m.status from wa_messages m where m.twilio_sid = x.twilio_sid), 'sent') else x.status end)
              from service_sends x where x.subscription_id = s.id order by x.created_at desc limit 1) as last_send,
           (select json_build_object('amount', y.amount_tzs, 'at', y.completed_at, 'covers_until', y.covers_until)
              from service_payments y where y.subscription_id = s.id and y.status = 'completed' order by y.completed_at desc limit 1) as last_payment
      from service_subscriptions s join circle_profiles p on p.user_id = s.user_id
     where s.service_id = p_service) x), '[]'::json);
end $$;

-- Mothers who can be added by hand: pregnant, with a date, not on the lessons now.
create or replace function public.services_candidates(p_q text) returns json
language plpgsql stable security definer set search_path to 'public' as $$
declare q text := lower(trim(coalesce(p_q, '')));
begin
  if not public.services_can() then raise exception 'You do not have permission to see Services.'; end if;
  if length(q) < 2 then return '[]'::json; end if;
  return coalesce((select json_agg(x) from (
    select p.user_id, p.name, p.username, p.member_no,
           floor(public.circle_preg_days(p.due_date, p.last_period) / 7.0)::int as preg_week
      from circle_profiles p
     where p.stage = 'pregnancy' and not coalesce(p.is_expert, false) and p.expert_status is null
       and not coalesce(p.weekly_wa, false) and coalesce(p.whatsapp, '') <> ''
       and (p.due_date is not null or p.last_period is not null)
       and (lower(p.name) like '%' || q || '%' or lower(p.username) like '%' || q || '%' or p.member_no::text = q)
     order by p.name limit 20) x), '[]'::json);
end $$;

create or replace function public.services_add_subscriber(p_service uuid, p_user uuid, p_reason text) returns json
language plpgsql security definer set search_path to 'public' as $$
declare me record; p public.circle_profiles; sv public.services; s public.service_subscriptions;
begin
  if not public.services_can() then raise exception 'You do not have permission to manage Services.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write the reason for adding her, for example "she asked by phone".'; end if;
  select * into sv from services where id = p_service;
  if not found or sv.slug <> 'weekly' then raise exception 'That service cannot take subscribers yet.'; end if;
  select * into p from circle_profiles where user_id = p_user;
  if not found then raise exception 'That member no longer exists.'; end if;
  if coalesce(p.is_expert, false) or p.expert_status is not null then raise exception 'The lessons are for pregnant mothers, not experts.'; end if;
  if p.stage <> 'pregnancy' or (p.due_date is null and p.last_period is null) then
    raise exception 'She needs to be in the pregnancy stage with a due date on her Circle profile first.';
  end if;
  if coalesce(p.whatsapp, '') = '' then raise exception 'She has no WhatsApp number on her Circle account.'; end if;
  if coalesce(p.weekly_wa, false) then raise exception 'She is already on the lessons.'; end if;
  select * into me from public.services_me();
  perform set_config('malkia.actor_id', coalesce(me.id::text, ''), true);
  perform set_config('malkia.actor_name', coalesce(me.name, ''), true);
  perform set_config('malkia.reason', trim(p_reason), true);
  update circle_profiles set weekly_wa = true, weekly_joined_at = now(), weekly_stopped_at = null where user_id = p_user;
  perform set_config('malkia.actor_id', '', true);
  perform set_config('malkia.actor_name', '', true);
  perform set_config('malkia.reason', '', true);
  select * into s from service_subscriptions where service_id = p_service and user_id = p_user;
  if not found or s.stopped_at is not null then raise exception 'She could not be added. The fault was written to the error log.'; end if;
  return json_build_object('ok', true, 'id', s.id);
end $$;

-- pause, resume, stop, extend. Every one needs a reason and is written down with the staff name.
create or replace function public.services_sub_action(p_sub uuid, p_action text, p_reason text, p_days integer default null) returns json
language plpgsql security definer set search_path to 'public' as $$
declare me record; s public.service_subscriptions; p public.circle_profiles; base timestamptz;
begin
  if not public.services_can() then raise exception 'You do not have permission to manage Services.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write the reason first.'; end if;
  select * into s from service_subscriptions where id = p_sub for update;
  if not found then raise exception 'That subscription no longer exists.'; end if;
  select * into p from circle_profiles where user_id = s.user_id;
  select * into me from public.services_me();

  if p_action = 'pause' then
    if s.stopped_at is not null then raise exception 'She has stopped, so there is nothing to pause.'; end if;
    if s.paused_at is not null then raise exception 'She is already paused.'; end if;
    update service_subscriptions set paused_at = now(), pause_reason = trim(p_reason), updated_at = now() where id = p_sub;
    delete from service_sends where subscription_id = p_sub and status = 'queued';   -- never sent, so nothing to keep
  elsif p_action = 'resume' then
    if s.paused_at is null then raise exception 'She is not paused.'; end if;
    update service_subscriptions set paused_at = null, pause_reason = null, updated_at = now() where id = p_sub;
  elsif p_action = 'stop' then
    if s.stopped_at is not null then raise exception 'She has already stopped.'; end if;
    perform set_config('malkia.stop_source', 'staff', true);
    perform set_config('malkia.actor_id', coalesce(me.id::text, ''), true);
    perform set_config('malkia.actor_name', coalesce(me.name, ''), true);
    perform set_config('malkia.reason', trim(p_reason), true);
    update circle_profiles set weekly_wa = false, weekly_stopped_at = now() where user_id = s.user_id and weekly_wa;
    perform set_config('malkia.stop_source', '', true);
    perform set_config('malkia.actor_id', '', true);
    perform set_config('malkia.actor_name', '', true);
    perform set_config('malkia.reason', '', true);
    -- if her profile was already off, close the subscription directly
    update service_subscriptions set stopped_at = now(), stop_source = 'staff', updated_at = now() where id = p_sub and stopped_at is null;
    delete from service_sends where subscription_id = p_sub and status = 'queued';
    return json_build_object('ok', true);   -- the trigger already wrote the event
  elsif p_action = 'extend' then
    if coalesce(p_days, 0) < 1 or p_days > 366 then raise exception 'Give the number of days to add, between 1 and 366.'; end if;
    if s.stopped_at is not null then raise exception 'She has stopped. Add her again first.'; end if;
    base := greatest(now(), coalesce(s.free_until, now()), coalesce(s.paid_until, now()));
    update service_subscriptions set free_until = base + make_interval(days => p_days), updated_at = now() where id = p_sub;
  else
    raise exception 'Unknown action.';
  end if;

  insert into service_events (service_id, subscription_id, user_id, member_name, action, reason, days, by_user, by_name)
  values (s.service_id, s.id, s.user_id, p.name, p_action, trim(p_reason), case when p_action = 'extend' then p_days end, me.id, me.name);
  return json_build_object('ok', true);
end $$;

-- Name, price, free days. Super admins only.
create or replace function public.services_update(p_service uuid, p_name text, p_tagline text, p_price integer, p_free_days integer, p_period_days integer) returns json
language plpgsql security definer set search_path to 'public' as $$
declare me record; old public.services;
begin
  if not public.circle_staff_super() then raise exception 'Only a super admin can change a service''s name, price or free period.'; end if;
  select * into old from services where id = p_service;
  if not found then raise exception 'That service no longer exists.'; end if;
  update services set name = trim(p_name), tagline = nullif(trim(coalesce(p_tagline, '')), ''), price_tzs = p_price,
         free_days = coalesce(p_free_days, free_days), period_days = coalesce(p_period_days, period_days), updated_at = now()
   where id = p_service;
  select * into me from public.services_me();
  insert into service_events (service_id, action, by_user, by_name, meta)
  values (p_service, 'settings_changed', me.id, me.name, jsonb_build_object(
    'before', jsonb_build_object('name', old.name, 'price_tzs', old.price_tzs, 'free_days', old.free_days, 'period_days', old.period_days),
    'after',  jsonb_build_object('name', trim(p_name), 'price_tzs', p_price, 'free_days', coalesce(p_free_days, old.free_days), 'period_days', coalesce(p_period_days, old.period_days))));
  return json_build_object('ok', true);
end $$;

create or replace function public.services_delivery(p_service uuid, p_days integer default 14) returns json
language plpgsql stable security definer set search_path to 'public' as $$
declare since timestamptz := now() - make_interval(days => greatest(least(coalesce(p_days, 14), 90), 1));
begin
  if not public.services_can() then raise exception 'You do not have permission to see Services.'; end if;
  return json_build_object(
    'since', since,
    'lessons', coalesce((select json_agg(g order by g.last_at desc) from (
      select x.week, x.position, max(x.topic) as topic, max(coalesce(x.sent_at, x.created_at)) as last_at,
             count(*) filter (where x.status = 'sent') as sent,
             count(*) filter (where x.status = 'sent' and m.status in ('delivered', 'read')) as delivered,
             count(*) filter (where x.status = 'sent' and m.status = 'read') as read,
             count(*) filter (where x.status = 'failed' or (x.status = 'sent' and m.status = 'failed')) as failed,
             count(*) filter (where x.status in ('queued', 'sending')) as waiting
        from service_sends x left join wa_messages m on m.twilio_sid = x.twilio_sid
       where x.service_id = p_service and x.created_at >= since and x.status <> 'cancelled'
       group by x.week, x.position) g), '[]'::json),
    'log', coalesce((select json_agg(l order by l.at desc) from (
      select x.id, x.to_name as name, x.week, x.position, x.topic, x.trigger, coalesce(x.sent_at, x.created_at) as at,
             case when x.status = 'sent' then coalesce(m.status, 'sent') else x.status end as status,
             coalesce(x.error, m.error) as error, x.attempts
        from service_sends x left join wa_messages m on m.twilio_sid = x.twilio_sid
       where x.service_id = p_service and x.created_at >= since
       order by x.created_at desc limit 200) l), '[]'::json));
end $$;

create or replace function public.services_payments(p_service uuid) returns json
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.services_can() then raise exception 'You do not have permission to see Services.'; end if;
  return coalesce((select json_agg(x order by x.created_at desc) from (
    select y.id, y.payer_name, (select member_no from circle_profiles p where p.user_id = y.user_id) as member_no,
           y.amount_tzs, y.provider, y.provider_ref, y.channel, y.status, y.covers_from, y.covers_until, y.created_at, y.completed_at, y.note
      from service_payments y where y.service_id = p_service order by y.created_at desc limit 1000) x), '[]'::json);
end $$;

create or replace function public.services_history(p_sub uuid) returns json
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.services_can() then raise exception 'You do not have permission to see Services.'; end if;
  return coalesce((select json_agg(json_build_object('action', e.action, 'reason', e.reason, 'days', e.days, 'by_name', e.by_name, 'at', e.created_at) order by e.created_at desc)
                     from service_events e where e.subscription_id = p_sub), '[]'::json);
end $$;

create or replace function public.services_export_log(p_what text, p_rows integer, p_filters jsonb) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare me record;
begin
  if not public.circle_staff_super() then raise exception 'Only a super admin can export from Services.'; end if;
  select * into me from public.services_me();
  insert into service_exports (by_user, by_name, what, row_count, filters)
  values (me.id, me.name, left(coalesce(p_what, ''), 60), greatest(coalesce(p_rows, 0), 0), coalesce(p_filters, '{}'::jsonb));
  return true;
end $$;

-- Staff ask for a failed lesson to be tried again.
create or replace function public.services_retry_send(p_send uuid) returns json
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.services_can() then raise exception 'You do not have permission to manage Services.'; end if;
  update service_sends set status = 'queued', trigger = 'retry', error = null, attempts = least(attempts, 2), created_at = now()
   where id = p_send and status = 'failed';
  if not found then raise exception 'Only a failed lesson can be sent again.'; end if;
  perform public.service_send_kick();
  return json_build_object('ok', true);
end $$;

-- ── Payments: the doors a mobile money provider (Snippe) will use ──────────────
-- Not reachable from the browser. A server function calls service_payment_start()
-- before asking the provider to prompt her phone, and service_payment_settle() when
-- the provider's signed webhook says how it ended. Settling twice changes nothing.
create or replace function public.service_payment_start(p_sub uuid, p_provider text, p_idempotency_key text, p_phone text default null) returns json
language plpgsql security definer set search_path to 'public' as $$
declare s public.service_subscriptions; sv public.services; p public.circle_profiles; pay public.service_payments;
begin
  select * into s from service_subscriptions where id = p_sub;
  if not found then raise exception 'subscription not found'; end if;
  select * into sv from services where id = s.service_id;
  if coalesce(sv.price_tzs, 0) <= 0 then raise exception 'This service has no price set yet.'; end if;
  select * into pay from service_payments where idempotency_key = p_idempotency_key;
  if found then return row_to_json(pay); end if;
  select * into p from circle_profiles where user_id = s.user_id;
  insert into service_payments (service_id, subscription_id, user_id, payer_name, phone, amount_tzs, provider, idempotency_key, period_days)
  values (sv.id, s.id, s.user_id, p.name, coalesce(nullif(trim(p_phone), ''), p.whatsapp), sv.price_tzs, p_provider, p_idempotency_key, sv.period_days)
  returning * into pay;
  return row_to_json(pay);
end $$;

create or replace function public.service_payment_settle(p_payment uuid, p_status text, p_provider_ref text default null, p_amount integer default null, p_channel text default null, p_raw jsonb default null) returns json
language plpgsql security definer set search_path to 'public' as $$
declare pay public.service_payments; s public.service_subscriptions; base timestamptz;
begin
  select * into pay from service_payments where id = p_payment for update;
  if not found then raise exception 'payment not found'; end if;
  if pay.status = 'completed' then return json_build_object('ok', true, 'already', true, 'covers_until', pay.covers_until); end if;
  if p_status not in ('completed', 'failed', 'expired') then raise exception 'unknown payment status %', p_status; end if;
  if p_status <> 'completed' then
    update service_payments set status = p_status, provider_ref = coalesce(p_provider_ref, provider_ref), channel = coalesce(p_channel, channel), raw = coalesce(p_raw, raw) where id = p_payment;
    return json_build_object('ok', true, 'status', p_status);
  end if;
  if p_amount is not null and p_amount <> pay.amount_tzs then
    update service_payments set note = format('Amount received (%s) does not match the price (%s). Not applied.', p_amount, pay.amount_tzs),
           provider_ref = coalesce(p_provider_ref, provider_ref), raw = coalesce(p_raw, raw) where id = p_payment;
    return json_build_object('ok', false, 'error', 'amount_mismatch');
  end if;
  select * into s from service_subscriptions where id = pay.subscription_id for update;
  if not found then raise exception 'subscription for this payment no longer exists'; end if;
  -- A payment never eats into free days she still has: the paid period starts after them.
  base := greatest(now(), coalesce(s.free_until, now()), coalesce(s.paid_until, now()));
  update service_payments set status = 'completed', completed_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref),
         channel = coalesce(p_channel, channel), raw = coalesce(p_raw, raw),
         covers_from = base, covers_until = base + make_interval(days => pay.period_days) where id = p_payment;
  update service_subscriptions set paid_until = base + make_interval(days => pay.period_days), updated_at = now() where id = s.id;
  insert into service_events (service_id, subscription_id, user_id, member_name, action, days, meta)
  values (s.service_id, s.id, s.user_id, pay.payer_name, 'payment', pay.period_days, jsonb_build_object('payment_id', pay.id, 'amount_tzs', pay.amount_tzs, 'provider', pay.provider));
  -- Paying is asking for the lessons: if she had stopped, she is back on.
  if s.stopped_at is not null then
    update circle_profiles set weekly_wa = true, weekly_stopped_at = null where user_id = s.user_id and not coalesce(weekly_wa, false);
  end if;
  return json_build_object('ok', true, 'covers_until', base + make_interval(days => pay.period_days));
end $$;

-- Switching payments on. Mothers whose free days already ran out while payments were
-- off get a few days of grace so nobody is cut off the same minute.
create or replace function public.service_payments_go_live(p_service uuid, p_grace_days integer default 7) returns json
language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update service_subscriptions set free_until = now() + make_interval(days => greatest(coalesce(p_grace_days, 7), 0)), updated_at = now()
   where service_id = p_service and stopped_at is null and coalesce(free_until, now()) < now() + make_interval(days => greatest(coalesce(p_grace_days, 7), 0))
     and (paid_until is null or paid_until < now());
  get diagnostics n = row_count;
  update services set payments_live = true, payments_live_at = now(), updated_at = now() where id = p_service;
  insert into service_events (service_id, action, days, meta) values (p_service, 'payments_live', p_grace_days, jsonb_build_object('grace_given_to', n));
  return json_build_object('ok', true, 'grace_given_to', n);
end $$;

-- ── Who may call what ──────────────────────────────────────────────────────────
revoke all on function public.service_plan_sends(uuid), public.service_send_sweep(), public.service_send_claim(integer),
  public.service_send_kick(), public.service_weekly_sync(), public.service_payment_start(uuid, text, text, text),
  public.service_payment_settle(uuid, text, text, integer, text, jsonb), public.service_payments_go_live(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.service_plan_sends(uuid), public.service_send_sweep(), public.service_send_claim(integer),
  public.service_payment_start(uuid, text, text, text), public.service_payment_settle(uuid, text, text, integer, text, jsonb),
  public.service_payments_go_live(uuid, integer) to service_role;

revoke all on function public.services_can(), public.services_me(), public.services_overview(), public.services_subscribers(uuid),
  public.services_candidates(text), public.services_add_subscriber(uuid, uuid, text), public.services_sub_action(uuid, text, text, integer),
  public.services_update(uuid, text, text, integer, integer, integer), public.services_delivery(uuid, integer),
  public.services_payments(uuid), public.services_history(uuid), public.services_export_log(text, integer, jsonb),
  public.services_retry_send(uuid) from public, anon;
grant execute on function public.services_can(), public.services_me(), public.services_overview(), public.services_subscribers(uuid),
  public.services_candidates(text), public.services_add_subscriber(uuid, uuid, text), public.services_sub_action(uuid, text, text, integer),
  public.services_update(uuid, text, text, integer, integer, integer), public.services_delivery(uuid, integer),
  public.services_payments(uuid), public.services_history(uuid), public.services_export_log(text, integer, jsonb),
  public.services_retry_send(uuid) to authenticated, service_role;

-- ── The clock ──────────────────────────────────────────────────────────────────
-- 07:00 GMT is 10:00 in Dar es Salaam. Monday, Wednesday, Saturday.
select cron.unschedule(jobname) from cron.job where jobname in ('services-weekly-sends', 'services-send-sweep');
select cron.schedule('services-weekly-sends', '0 7 * * 1,3,6', $cron$select public.service_plan_sends()$cron$);
select cron.schedule('services-send-sweep', '*/10 * * * *', $cron$select public.service_send_sweep()$cron$);
