-- ═══════════════════════════════════════════════════════════════════════════
-- migration_rider_tracking.sql  (28 Sep 2026)
-- Riders on cash sales, so the Day Book can settle them by name.
--
-- The riders table already exists (Dispatch uses it for invoice
-- deliveries). This adds the cash-sale side: which rider carried a town
-- delivery or POD, what delivery fee the sale collected for them, and
-- therefore what the cashier pays or collects per rider at day close.
-- Forward-only: past sales keep their fee inside the notes text and
-- won't appear in the rider summary.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vouchers add column if not exists rider_id uuid references riders(id);
alter table vouchers add column if not exists rider_name text;
alter table vouchers add column if not exists delivery_fee numeric not null default 0;

create index if not exists ix_vouchers_rider_day
  on vouchers (posting_date, rider_name) where rider_name is not null;

-- The editor-created-table lesson from 28 Sep, applied preemptively:
-- make sure the app role can actually use the riders table everywhere.
grant select, insert, update on table riders to authenticated, service_role;
notify pgrst, 'reload schema';

-- 28 Sep, same-day extension: WHERE the delivery goes, as data.
alter table vouchers add column if not exists delivery_destination text;
alter table vouchers add column if not exists upcountry_bus text;
