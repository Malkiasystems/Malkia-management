-- ═══════════════════════════════════════════════════════════════════════════
-- migration_ar_reminders.sql  (24 Sep 2026)
-- Log of payment reminders sent to customers, one row per send. Keyed by
-- invoice + stage so the AR Reminders page can show what was already sent
-- and never queue the same nag twice. WhatsApp Web today (the page opens
-- wa.me links); the same table feeds the WhatsApp API integration later —
-- only the sender changes, the log stays.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists ar_reminders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  invoice_ref text not null,
  due_date date,
  amount numeric,
  -- pre7 / pre4 / pre3 / pre2 / pre1 = days-before-due stage; overdue = past due
  stage text not null check (stage in ('pre7','pre4','pre3','pre2','pre1','overdue')),
  channel text not null default 'whatsapp_web',
  sent_by text,
  sent_at timestamptz not null default now()
);

create index if not exists ix_ar_reminders_inv on ar_reminders (invoice_ref, stage);
create index if not exists ix_ar_reminders_cust on ar_reminders (customer_id, sent_at desc);

alter table ar_reminders enable row level security;
drop policy if exists ar_reminders_staff_full on ar_reminders;
create policy ar_reminders_staff_full on ar_reminders
  for all to authenticated using (true) with check (true);
