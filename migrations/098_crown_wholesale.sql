-- 098: Malkia Crown for wholesalers. A loyalty programme where a wholesaler earns points
--      on the money they actually pay, and the points are turned into a credit note that
--      lowers what they owe on their next order (Joe, 23 Nov 2026).
--
-- How it works
--   earn     Every payment received from an enrolled wholesaler (a "receipt" line on their
--            statement) earns points: 1 point for every `tzs_per_point` shillings paid.
--            Points come from money paid, not from invoices raised, so a wholesaler who
--            buys on credit and does not pay earns nothing, and returned goods earn nothing.
--   convert  An administrator turns points into a credit note. One step, all or nothing:
--            the accounting entry (Dr Sales Discounts, Cr Accounts Receivable), the CN
--            voucher, the line on the customer's statement and the points deduction are
--            written together or not at all.
--   safety   The programme is OFF until switched on. Nobody is enrolled until someone
--            enrols them. With the switch off, nothing here does anything.
--
-- Nothing existing is changed: no trigger is added to any accounting table. Earning is
-- worked out by reading the statement lines on a timer (every 30 minutes) and when the
-- Crown page is opened.
--
-- Run BEFORE the code deploy. Needs migration 097 (os_me, pg_cron).

-- ── 1. Settings (one row) ───────────────────────────────────────────────────────────────
create table if not exists public.crown_ws_settings (
  id                     boolean primary key default true check (id),
  is_on                  boolean not null default false,
  start_date             date,                           -- payments before this date earn nothing
  tzs_per_point          numeric not null default 1000 check (tzs_per_point > 0),   -- shillings paid to earn 1 point
  point_value_tzs        numeric not null default 10 check (point_value_tzs > 0),   -- what 1 point is worth
  min_redeem_points      integer not null default 5000 check (min_redeem_points > 0),
  block_if_overdue       boolean not null default true,  -- no credit note while an invoice is past due
  discount_account_code  text not null default '4040',   -- Sales Discounts
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);
insert into public.crown_ws_settings (id) values (true) on conflict (id) do nothing;

-- ── 2. Who is in the programme ─────────────────────────────────────────────────────────
create table if not exists public.crown_ws_members (
  customer_id        uuid primary key references public.customers(id) on delete cascade,
  is_active          boolean not null default true,
  enrolled_at        timestamptz not null default now(),
  enrolled_by        uuid,
  welcome_sent_at    timestamptz,
  statement_sent_at  timestamptz
);

-- ── 3. Every movement of points ────────────────────────────────────────────────────────
create table if not exists public.crown_ws_ledger (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete cascade,
  kind             text not null check (kind in ('earn', 'reversal', 'redeem', 'adjust')),
  points           integer not null,                 -- plus for earn, minus for redeem and reversal
  source_entry_id  uuid,                             -- the receipt line on the customer's statement
  source_ref       text,                             -- RCP-10-0123, or the CN number for a conversion
  entry_date       date,
  base_amount      numeric,                          -- shillings the points were worked out from
  tzs_per_point    numeric,
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid
);
-- A receipt earns once, and can be reversed once.
create unique index if not exists crown_ws_ledger_once on public.crown_ws_ledger (source_entry_id, kind) where source_entry_id is not null;
create index if not exists crown_ws_ledger_customer on public.crown_ws_ledger (customer_id, created_at desc);

-- ── 4. Each conversion of points into a credit note ───────────────────────────────────
create table if not exists public.crown_ws_redemptions (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete cascade,
  points           integer not null check (points > 0),
  point_value_tzs  numeric not null,
  amount           numeric not null check (amount > 0),
  voucher_id       uuid,
  voucher_ref      text not null,
  journal_id       uuid,
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  created_by_name  text,
  wa_sent_at       timestamptz
);
create index if not exists crown_ws_redemptions_customer on public.crown_ws_redemptions (customer_id, created_at desc);

-- Reached only through the functions below.
alter table public.crown_ws_settings    enable row level security;
alter table public.crown_ws_members     enable row level security;
alter table public.crown_ws_ledger      enable row level security;
alter table public.crown_ws_redemptions enable row level security;
revoke all on public.crown_ws_settings, public.crown_ws_members, public.crown_ws_ledger, public.crown_ws_redemptions from anon, authenticated;

-- ── 5. Who may do what ─────────────────────────────────────────────────────────────────
-- See the page: any staff member with CRM rights. Change anything or issue a credit note:
-- an administrator, or someone given 'crm.crown_manage'.
create or replace function public.crown_ws_role()
returns text
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_id uuid; v_perms text[];
begin
  select m.id, m.permissions into v_id, v_perms from public.os_me() m;
  if v_id is null then return 'none'; end if;
  if cardinality(v_perms) >= 40 or 'crm.crown_manage' = any(v_perms) then return 'manage'; end if;
  if 'crm.view' = any(v_perms) then return 'view'; end if;
  return 'none';
end $function$;

-- ── 6. Working out points from payments (no sign-in: called by the timer and by the page) ─
create or replace function public.crown_ws_sync_core()
returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare s public.crown_ws_settings%rowtype; n int := 0; m int := 0;
begin
  select * into s from public.crown_ws_settings where id;
  if not found or not s.is_on or s.start_date is null then return 0; end if;

  -- One at a time, so the timer and an open page cannot both award the same payment.
  perform pg_advisory_xact_lock(hashtext('crown-ws-sync'));

  -- New payments from enrolled wholesalers.
  insert into public.crown_ws_ledger (customer_id, kind, points, source_entry_id, source_ref, entry_date, base_amount, tzs_per_point, note)
  select e.customer_id, 'earn', floor(abs(e.amount) / s.tzs_per_point)::int, e.id, e.document_ref, e.posting_date, abs(e.amount), s.tzs_per_point,
         'Payment ' || coalesce(e.document_ref, '')
  from public.customer_ledger_entries e
  join public.crown_ws_members mb on mb.customer_id = e.customer_id and mb.is_active
  join public.customers c on c.id = e.customer_id and c.customer_type = 'wholesale'
  where e.document_type = 'receipt' and e.amount < 0
    and e.posting_date >= greatest(s.start_date, (mb.enrolled_at at time zone 'Africa/Dar_es_Salaam')::date)
    and floor(abs(e.amount) / s.tzs_per_point) >= 1
    and not exists (select 1 from public.crown_ws_ledger l where l.source_entry_id = e.id and l.kind = 'earn')
  on conflict do nothing;
  get diagnostics n = row_count;

  -- A payment that was later removed from the statement (voided or deleted) gives its points back.
  insert into public.crown_ws_ledger (customer_id, kind, points, source_entry_id, source_ref, entry_date, base_amount, tzs_per_point, note)
  select l.customer_id, 'reversal', -l.points, l.source_entry_id, l.source_ref, (now() at time zone 'Africa/Dar_es_Salaam')::date, l.base_amount, l.tzs_per_point,
         'Payment ' || coalesce(l.source_ref, '') || ' was removed from the statement'
  from public.crown_ws_ledger l
  where l.kind = 'earn'
    and not exists (select 1 from public.customer_ledger_entries e where e.id = l.source_entry_id)
    and not exists (select 1 from public.crown_ws_ledger r where r.source_entry_id = l.source_entry_id and r.kind = 'reversal')
  on conflict do nothing;
  get diagnostics m = row_count;

  return n + m;
end $function$;
revoke all on function public.crown_ws_sync_core() from public, anon, authenticated;

-- ── 7. The page's data ─────────────────────────────────────────────────────────────────
create or replace function public.crown_ws_overview()
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_role text := public.crown_ws_role(); s public.crown_ws_settings%rowtype; v_today date := (now() at time zone 'Africa/Dar_es_Salaam')::date;
begin
  if v_role = 'none' then
    raise exception 'You need CRM rights to see Malkia Crown for wholesalers.' using errcode = '42501';
  end if;
  begin
    perform public.crown_ws_sync_core();          -- bring points up to date before showing them
  exception when others then null;                 -- a failed refresh must not hide the page
  end;
  select * into s from public.crown_ws_settings where id;

  return jsonb_build_object(
    'role', v_role,
    'settings', to_jsonb(s),
    'wholesalers_total', (select count(*) from public.customers c where c.customer_type = 'wholesale' and coalesce(c.is_active, true) and not coalesce(c.is_hidden, false)),
    'members', coalesce((
      select jsonb_agg(x order by x.points desc, x.name)
      from (
        select mb.customer_id, coalesce(nullif(c.company, ''), c.name) as name, c.code, c.whatsapp, c.credit_tier,
               coalesce(c.no_contact, false) as no_contact, mb.is_active, mb.enrolled_at, mb.welcome_sent_at, mb.statement_sent_at,
               coalesce(c.balance, 0) as ar_balance,
               coalesce(p.points, 0) as points,
               coalesce(p.earned, 0) as earned,
               coalesce(p.redeemed, 0) as redeemed,
               coalesce(p.since_statement, 0) as earned_since_statement,
               p.last_earn_date,
               exists (select 1 from public.customer_ledger_entries e
                       where e.customer_id = mb.customer_id and e.document_type = 'invoice' and e.is_open
                         and e.remaining_amount > 0.5 and e.due_date is not null and e.due_date < v_today) as overdue
        from public.crown_ws_members mb
        join public.customers c on c.id = mb.customer_id
        left join lateral (
          select sum(l.points)::int as points,
                 sum(l.points) filter (where l.kind in ('earn', 'reversal'))::int as earned,
                 (-sum(l.points) filter (where l.kind = 'redeem'))::int as redeemed,
                 sum(l.points) filter (where l.kind in ('earn', 'reversal') and l.created_at > coalesce(mb.statement_sent_at, mb.enrolled_at))::int as since_statement,
                 max(l.entry_date) filter (where l.kind = 'earn') as last_earn_date
          from public.crown_ws_ledger l where l.customer_id = mb.customer_id
        ) p on true
      ) x), '[]'::jsonb),
    'totals', jsonb_build_object(
      'points_outstanding', coalesce((select sum(points) from public.crown_ws_ledger), 0),
      'points_earned', coalesce((select sum(points) from public.crown_ws_ledger where kind in ('earn', 'reversal')), 0),
      'credit_notes', (select count(*) from public.crown_ws_redemptions),
      'credit_notes_value', coalesce((select sum(amount) from public.crown_ws_redemptions), 0))
  );
end $function$;

-- Wholesalers who are not in the programme yet.
create or replace function public.crown_ws_candidates()
returns table(customer_id uuid, name text, code text, whatsapp text, credit_tier text, paid_90d numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if public.crown_ws_role() = 'none' then
    raise exception 'You need CRM rights to see Malkia Crown for wholesalers.' using errcode = '42501';
  end if;
  return query
  select c.id, coalesce(nullif(c.company, ''), c.name)::text, c.code::text, c.whatsapp::text, c.credit_tier,
         coalesce((select sum(-e.amount) from public.customer_ledger_entries e
                   where e.customer_id = c.id and e.document_type = 'receipt' and e.posting_date >= current_date - 90), 0)
  from public.customers c
  where c.customer_type = 'wholesale' and coalesce(c.is_active, true) and not coalesce(c.is_hidden, false)
    and not exists (select 1 from public.crown_ws_members mb where mb.customer_id = c.id and mb.is_active)
  order by 6 desc, 2;
end $function$;

-- Points history, newest first. One wholesaler, or everyone.
create or replace function public.crown_ws_activity(p_customer uuid default null, p_limit integer default 100)
returns table(id uuid, customer_id uuid, name text, kind text, points integer, source_ref text, entry_date date, base_amount numeric, note text, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if public.crown_ws_role() = 'none' then
    raise exception 'You need CRM rights to see Malkia Crown for wholesalers.' using errcode = '42501';
  end if;
  return query
  select l.id, l.customer_id, coalesce(nullif(c.company, ''), c.name)::text, l.kind, l.points, l.source_ref, l.entry_date, l.base_amount, l.note, l.created_at
  from public.crown_ws_ledger l join public.customers c on c.id = l.customer_id
  where p_customer is null or l.customer_id = p_customer
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $function$;

-- Credit notes issued from points.
create or replace function public.crown_ws_redemption_list(p_limit integer default 100)
returns table(id uuid, customer_id uuid, name text, whatsapp text, points integer, amount numeric, voucher_ref text, note text, created_at timestamptz, created_by_name text, wa_sent_at timestamptz, points_left integer)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if public.crown_ws_role() = 'none' then
    raise exception 'You need CRM rights to see Malkia Crown for wholesalers.' using errcode = '42501';
  end if;
  return query
  select r.id, r.customer_id, coalesce(nullif(c.company, ''), c.name)::text, c.whatsapp::text, r.points, r.amount, r.voucher_ref, r.note, r.created_at, r.created_by_name, r.wa_sent_at,
         coalesce((select sum(l.points) from public.crown_ws_ledger l where l.customer_id = r.customer_id), 0)::int
  from public.crown_ws_redemptions r join public.customers c on c.id = r.customer_id
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $function$;

-- ── 8. Changes (administrators) ───────────────────────────────────────────────────────
create or replace function public.crown_ws_assert_manage()
returns uuid
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if public.crown_ws_role() <> 'manage' then
    raise exception 'Only an administrator can change Malkia Crown for wholesalers.' using errcode = '42501';
  end if;
  select m.id into v_id from public.os_me() m;
  return v_id;
end $function$;

create or replace function public.crown_ws_save_settings(p jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_me uuid := public.crown_ws_assert_manage(); s public.crown_ws_settings%rowtype;
        v_on boolean; v_start date; v_rate numeric; v_value numeric; v_min int; v_block boolean; v_code text;
begin
  select * into s from public.crown_ws_settings where id for update;
  v_on    := coalesce((p ->> 'is_on')::boolean, s.is_on);
  v_start := coalesce(nullif(p ->> 'start_date', '')::date, s.start_date);
  v_rate  := coalesce(nullif(p ->> 'tzs_per_point', '')::numeric, s.tzs_per_point);
  v_value := coalesce(nullif(p ->> 'point_value_tzs', '')::numeric, s.point_value_tzs);
  v_min   := coalesce(nullif(p ->> 'min_redeem_points', '')::int, s.min_redeem_points);
  v_block := coalesce((p ->> 'block_if_overdue')::boolean, s.block_if_overdue);
  v_code  := coalesce(nullif(btrim(p ->> 'discount_account_code'), ''), s.discount_account_code);

  if v_rate <= 0 then raise exception 'Shillings per point must be more than zero.'; end if;
  if v_value <= 0 then raise exception 'The value of a point must be more than zero.'; end if;
  if v_min <= 0 then raise exception 'The smallest conversion must be at least 1 point.'; end if;
  if v_value / v_rate > 0.10 then
    raise exception 'These rates give back % percent of every payment. The limit is 10 percent. Check the two numbers.', round(v_value / v_rate * 100, 1);
  end if;
  if not exists (select 1 from public.accounts a where a.code = v_code and coalesce(a.is_active, true) and coalesce(a.account_type, 'posting') = 'posting') then
    raise exception 'Account % was not found in the Chart of Accounts, or cannot be posted to.', v_code;
  end if;
  if v_on and v_start is null then v_start := (now() at time zone 'Africa/Dar_es_Salaam')::date; end if;

  update public.crown_ws_settings
     set is_on = v_on, start_date = v_start, tzs_per_point = v_rate, point_value_tzs = v_value, min_redeem_points = v_min,
         block_if_overdue = v_block, discount_account_code = v_code, updated_at = now(), updated_by = v_me
   where id returning * into s;
  return to_jsonb(s);
end $function$;

-- Enrol wholesalers. Earning starts from the day they are enrolled.
create or replace function public.crown_ws_enroll(p_customer_ids uuid[])
returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare v_me uuid := public.crown_ws_assert_manage(); n int;
begin
  insert into public.crown_ws_members (customer_id, enrolled_by)
  select c.id, v_me from public.customers c
  where c.id = any(coalesce(p_customer_ids, '{}')) and c.customer_type = 'wholesale'
  on conflict (customer_id) do update set is_active = true, enrolled_at = now(), enrolled_by = excluded.enrolled_by
    where not public.crown_ws_members.is_active;   -- coming back in starts earning afresh: no points for payments made while out
  get diagnostics n = row_count;
  return n;
end $function$;

-- Take a wholesaler out. Their points stay on record and can still be converted.
create or replace function public.crown_ws_set_active(p_customer uuid, p_active boolean)
returns void
language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.crown_ws_assert_manage();
  update public.crown_ws_members set is_active = coalesce(p_active, false) where customer_id = p_customer;
  if not found then raise exception 'That wholesaler is not in the programme.'; end if;
end $function$;

-- A hand correction, plus or minus, always with a reason.
create or replace function public.crown_ws_adjust(p_customer uuid, p_points integer, p_note text)
returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare v_me uuid := public.crown_ws_assert_manage(); v_bal int;
begin
  if coalesce(p_points, 0) = 0 then raise exception 'Type the number of points to add or take away.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'Write the reason for this correction.'; end if;
  if not exists (select 1 from public.crown_ws_members where customer_id = p_customer) then
    raise exception 'That wholesaler is not in the programme.';
  end if;
  perform 1 from public.customers where id = p_customer for update;
  select coalesce(sum(points), 0) into v_bal from public.crown_ws_ledger where customer_id = p_customer;
  if v_bal + p_points < 0 then raise exception 'That would leave % points. A balance cannot go below zero by a correction.', v_bal + p_points; end if;
  insert into public.crown_ws_ledger (customer_id, kind, points, entry_date, note, created_by)
  values (p_customer, 'adjust', p_points, (now() at time zone 'Africa/Dar_es_Salaam')::date, btrim(p_note), v_me);
  return v_bal + p_points;
end $function$;

-- ── 9. Points into a credit note: one step, all or nothing ──────────────────────────────
create or replace function public.crown_ws_redeem(p_customer uuid, p_points integer, p_note text default null)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_me uuid := public.crown_ws_assert_manage();
  v_me_name text;
  s public.crown_ws_settings%rowtype;
  v_cust public.customers%rowtype;
  v_cust_name text;
  v_today date := (now() at time zone 'Africa/Dar_es_Salaam')::date;
  v_bal int; v_amount numeric;
  v_disc uuid; v_ar uuid;
  v_pattern text := 'CN-10-'; v_ref text;
  v_journal uuid; v_voucher uuid; v_red uuid;
  v_dr numeric; v_cr numeric;
begin
  select * into s from public.crown_ws_settings where id;
  if not s.is_on then raise exception 'Malkia Crown for wholesalers is switched off. Switch it on in Settings first.'; end if;
  if coalesce(p_points, 0) <= 0 then raise exception 'Type how many points to convert.'; end if;
  if p_points < s.min_redeem_points then
    raise exception 'The smallest conversion is % points. This is % points.', s.min_redeem_points, p_points;
  end if;

  -- Hold the customer for the length of the posting, so two conversions cannot overlap.
  select * into v_cust from public.customers where id = p_customer for update;
  if not found then raise exception 'That customer was not found.'; end if;
  if v_cust.customer_type <> 'wholesale' then raise exception 'Malkia Crown credit notes are for wholesale customers only.'; end if;
  if not exists (select 1 from public.crown_ws_members where customer_id = p_customer) then
    raise exception 'That wholesaler is not in the programme.';
  end if;
  v_cust_name := coalesce(nullif(v_cust.company, ''), v_cust.name);

  select coalesce(sum(points), 0) into v_bal from public.crown_ws_ledger where customer_id = p_customer;
  if p_points > v_bal then raise exception '% has % points. You cannot convert %.', v_cust_name, v_bal, p_points; end if;

  if s.block_if_overdue and exists (
       select 1 from public.customer_ledger_entries e
       where e.customer_id = p_customer and e.document_type = 'invoice' and e.is_open
         and e.remaining_amount > 0.5 and e.due_date is not null and e.due_date < v_today) then
    raise exception '% has an invoice past its due date. Points can be converted once it is paid.', v_cust_name;
  end if;

  v_amount := round(p_points * s.point_value_tzs);
  if v_amount <= 0 then raise exception 'These points are worth nothing at the current rate.'; end if;

  select id into v_disc from public.accounts where code = s.discount_account_code;
  select id into v_ar   from public.accounts where code = '1050';
  if v_disc is null then raise exception 'Account % (Sales Discounts) was not found in the Chart of Accounts.', s.discount_account_code; end if;
  if v_ar is null then raise exception 'Account 1050 (Accounts Receivable) was not found in the Chart of Accounts.'; end if;

  select u.full_name into v_me_name from public.users u where u.id = v_me;
  v_me_name := coalesce(nullif(btrim(v_me_name), ''), 'Unknown');

  -- The next credit note number. One posting at a time per series (same lock as invoices use).
  perform pg_advisory_xact_lock(hashtext('voucher-ref:' || v_pattern));
  select v_pattern || lpad((coalesce(max(seq), 0) + 1)::text, 4, '0') into v_ref from (
    select nullif(regexp_replace(substr(ref, length(v_pattern) + 1), '\D', '', 'g'), '')::int as seq from public.vouchers where ref like v_pattern || '%'
    union all
    select nullif(regexp_replace(substr(source_ref, length(v_pattern) + 1), '\D', '', 'g'), '')::int from public.journals where source_ref like v_pattern || '%'
  ) q;

  -- 1. accounting entry: the reward is a discount given to the wholesaler
  insert into public.journals (ref, posting_date, description, journal_type, source_type, source_ref, posted_by, status)
  values ('JV-' || v_ref, v_today, 'Crown Rewards credit note — ' || v_cust_name || ' — ' || v_ref, 'credit_note', 'credit_note', v_ref, v_me_name, 'posted')
  returning id into v_journal;

  insert into public.journal_lines (journal_id, line_number, account_id, description, debit, credit) values
    (v_journal, 1, v_disc, 'Crown Rewards — ' || p_points || ' points — ' || v_cust_name, v_amount, 0),
    (v_journal, 2, v_ar,   'AR reduced — ' || v_cust_name || ' — ' || v_ref, 0, v_amount);
  perform public.update_account_balance(v_disc, v_amount, 0);
  perform public.update_account_balance(v_ar, 0, v_amount);

  -- 2. the credit note itself
  insert into public.vouchers (ref, type, posting_date, description, subtotal, vat_amount, total_amount, status, customer_id, journal_id, notes, posted_by)
  values (v_ref, 'credit_note', v_today, 'Crown Rewards credit note — ' || v_cust_name, v_amount, 0, v_amount, 'posted', v_cust.id, v_journal,
          'Malkia Crown: ' || p_points || ' points converted at TZS ' || (s.point_value_tzs::float8)::text || ' each.'
            || coalesce(' ' || nullif(btrim(p_note), ''), ''),
          v_me_name)
  returning id into v_voucher;

  -- 3. the line on the customer's statement (their balance follows from it)
  insert into public.customer_ledger_entries (customer_id, posting_date, document_type, document_ref, description, amount, remaining_amount, is_open, journal_id)
  values (v_cust.id, v_today, 'credit_note', v_ref, 'Credit Note — Malkia Crown rewards (' || p_points || ' points)', -v_amount, -v_amount, true, v_journal);

  -- 4. the points
  insert into public.crown_ws_ledger (customer_id, kind, points, source_ref, entry_date, base_amount, note, created_by)
  values (v_cust.id, 'redeem', -p_points, v_ref, v_today, v_amount, 'Converted to credit note ' || v_ref, v_me);

  insert into public.crown_ws_redemptions (customer_id, points, point_value_tzs, amount, voucher_id, voucher_ref, journal_id, note, created_by, created_by_name)
  values (v_cust.id, p_points, s.point_value_tzs, v_amount, v_voucher, v_ref, v_journal, nullif(btrim(p_note), ''), v_me, v_me_name)
  returning id into v_red;

  -- 5. refuse to finish unless every part is really there
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_dr, v_cr from public.journal_lines where journal_id = v_journal;
  if abs(v_dr - v_cr) > 0.01 or abs(v_dr - v_amount) > 0.01 then
    raise exception 'Posting stopped: the accounting entry does not balance (debits %, credits %).', v_dr, v_cr;
  end if;
  if not exists (select 1 from public.customer_ledger_entries where document_ref = v_ref and document_type = 'credit_note' and customer_id = v_cust.id) then
    raise exception 'Posting stopped: the credit note did not reach the customer statement.';
  end if;
  if (select coalesce(sum(points), 0) from public.crown_ws_ledger where customer_id = v_cust.id) <> v_bal - p_points then
    raise exception 'Posting stopped: the points did not come off correctly.';
  end if;

  return jsonb_build_object(
    'redemption_id', v_red, 'ref', v_ref, 'voucher_id', v_voucher, 'journal_id', v_journal,
    'points', p_points, 'amount', v_amount, 'points_left', v_bal - p_points,
    'customer', v_cust_name, 'customer_balance', (select balance from public.customers where id = v_cust.id));
end $function$;

-- ── 10. WhatsApp: which approved template to use, and a record of what was sent ─────────
create or replace function public.crown_ws_templates()
returns table(name text, status text, sid text, category text, body text)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if public.crown_ws_role() = 'none' then
    raise exception 'You need CRM rights to see Malkia Crown for wholesalers.' using errcode = '42501';
  end if;
  return query
  select distinct on (t.name) t.name, t.status, t.sid, coalesce(t.meta_category, t.category), t.body
  from public.wa_templates t
  where t.name in ('malkia_crown_ws_welcome_sw', 'malkia_crown_ws_points_sw', 'malkia_crown_ws_credit_sw') and t.is_active
  order by t.name, t.created_at desc;
end $function$;

create or replace function public.crown_ws_mark_sent(p_kind text, p_customer uuid default null, p_redemption uuid default null)
returns void
language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.crown_ws_assert_manage();
  if p_kind = 'welcome' then
    update public.crown_ws_members set welcome_sent_at = now() where customer_id = p_customer;
  elsif p_kind = 'points' then
    update public.crown_ws_members set statement_sent_at = now() where customer_id = p_customer;
  elsif p_kind = 'credit' then
    update public.crown_ws_redemptions set wa_sent_at = now() where id = p_redemption;
  else
    raise exception 'Unknown message kind: %', p_kind;
  end if;
end $function$;

-- What all wholesalers paid in the last 90 days. Shown in Settings so the cost of a rate
-- can be judged before it is switched on.
create or replace function public.crown_ws_paid_90d()
returns numeric
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if public.crown_ws_role() = 'none' then
    raise exception 'You need CRM rights to see Malkia Crown for wholesalers.' using errcode = '42501';
  end if;
  return coalesce((
    select sum(-e.amount)
    from public.customer_ledger_entries e
    join public.customers c on c.id = e.customer_id and c.customer_type = 'wholesale'
    where e.document_type = 'receipt' and e.amount < 0 and e.posting_date >= current_date - 90), 0);
end $function$;

-- ── 11. Rights on the functions ───────────────────────────────────────────────────────
do $do$
declare f text;
begin
  foreach f in array array[
    'crown_ws_role()', 'crown_ws_overview()', 'crown_ws_candidates()', 'crown_ws_activity(uuid, integer)', 'crown_ws_redemption_list(integer)',
    'crown_ws_assert_manage()', 'crown_ws_save_settings(jsonb)', 'crown_ws_enroll(uuid[])', 'crown_ws_set_active(uuid, boolean)',
    'crown_ws_adjust(uuid, integer, text)', 'crown_ws_redeem(uuid, integer, text)', 'crown_ws_templates()', 'crown_ws_mark_sent(text, uuid, uuid)',
    'crown_ws_paid_90d()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $do$;

-- ── 12. The timer: bring points up to date every 30 minutes ─────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'crown-ws-sync';
select cron.schedule('crown-ws-sync', '*/30 * * * *', $cron$select public.crown_ws_sync_core()$cron$);
