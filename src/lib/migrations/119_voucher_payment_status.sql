-- 119_voucher_payment_status.sql
--
-- Separates "is this in the GL" from "has the customer paid".
--
-- A Pay on Delivery cash sale was being written with vouchers.status = 'draft'
-- to mean "unpaid". Everywhere else in this system 'draft' means "not posted",
-- and a POD sale is emphatically posted: the journal is status='posted', stock
-- has left the building, revenue is recognised and 2020 is credited. Eight
-- files read vouchers.status and believed the label.
--
-- What that cost:
--   * VATReport filters vouchers on status='posted', so POD supplies never
--     reached the return, while PnL reads journals.status and counted them.
--     The GL and the filed return disagreed by the VAT on every POD sale.
--   * useDashboard, useCashCenter, InvestorsHub and CashCustomerDetail all
--     use the same filter and silently dropped POD revenue.
--   * Nothing ever set the status back, so a POD read "Pending" forever even
--     after the rider returned with the cash.
--
-- The fix is NOT to flip status to 'posted' when payment arrives. VAT here is
-- treated as it is for any cash sale or invoice: the supply is taxable at the
-- point of sale. Flipping on payment would move a July sale onto the August
-- return, trading an omission for a period misstatement that looks correct.
--
-- So: status tells the truth immediately, and payment lives in its own column.
--
-- SAFE TO RUN: 'draft' is used by no other voucher type. Proformas carry
-- status='proforma'. Verified on 2026-08-05 against zvxucqracqwagrbfsltp:
-- 3 cash_sale rows in 'draft' across 3 companies, every other type 'posted'.
--
-- RUN THIS BEFORE deploying the matching code. The code writes payment_status
-- on every new sale; if it lands first, the column does not exist and posting
-- breaks. Run in the other order and there is a window where POD sales read
-- as ordinary paid sales, which is the exact confusion this removes.

-- ── 1. Column ──────────────────────────────────────────────────────────────
alter table public.vouchers add column if not exists payment_status text;

alter table public.vouchers drop constraint if exists vouchers_payment_status_check;
alter table public.vouchers add constraint vouchers_payment_status_check
  check (payment_status is null or payment_status in ('unpaid','part_paid','paid'));

comment on column public.vouchers.payment_status is
  'Settlement state, independent of GL posting. NULL = not AR-tracked. '
  'Maintained by trg_voucher_payment_status from customer_ledger_entries.';

-- ── 2. Backfill ────────────────────────────────────────────────────────────
-- Keyed on journal_id, a globally unique uuid. NOT on document_ref: refs
-- restart per tenant, so 'CS-10-0001' currently exists in 11 different
-- companies and joining on it would cross-link them. Same failure shape as
-- the leak migration 051 fixed.
with ar as (
  select journal_id,
         sum(amount)           as billed,
         sum(remaining_amount) as owing
  from public.customer_ledger_entries
  where document_type = 'invoice'
    and journal_id is not null
  group by journal_id
)
update public.vouchers v
set payment_status = case
      when ar.owing <= 0.5             then 'paid'
      when ar.owing >= ar.billed - 0.5 then 'unpaid'
      else 'part_paid'
    end
from ar
where ar.journal_id = v.journal_id;

-- A cash sale with no AR entry took the money at the till by definition.
-- Scoped to cash_sale on purpose: other types are left NULL rather than
-- guessed at, so NULL keeps meaning "nobody has made a claim about this".
update public.vouchers
set payment_status = 'paid'
where type = 'cash_sale'
  and payment_status is null;

-- ── 3. The correction ──────────────────────────────────────────────────────
update public.vouchers
set status = 'posted'
where type = 'cash_sale'
  and status = 'draft';

-- ── 4. Keep it true ────────────────────────────────────────────────────────
-- Allocation is written client-side by postCustomerReceiptLedger as a plain
-- UPDATE on customer_ledger_entries, so an AFTER row trigger sees every
-- payment without the client needing to know this column exists.
--
-- SECURITY DEFINER for the same reason ledger_recompute_trigger_fn is: the
-- vouchers policies resolve through active_company_id(), which reads the
-- x-company-id request header. That header is present for a PostgREST call
-- but absent in any server-side context, where the UPDATE would silently
-- touch zero rows and leave payment_status stale.
--
-- Scoping is by journal_id alone. Because that is an unguessable uuid unique
-- across the estate, this cannot reach another tenant's voucher even with
-- RLS bypassed. Do not be tempted to add document_ref here.
create or replace function public.sync_voucher_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journal uuid;
  v_billed  numeric;
  v_owing   numeric;
begin
  -- On DELETE only OLD is populated; on INSERT only NEW.
  v_journal := coalesce(new.journal_id, old.journal_id);
  if v_journal is null then
    return coalesce(new, old);
  end if;

  select sum(amount), sum(remaining_amount)
    into v_billed, v_owing
  from public.customer_ledger_entries
  where journal_id = v_journal
    and document_type = 'invoice';

  -- Receipt-only rows (document_type='receipt') share the receipt's own
  -- journal, not the sale's, so this aggregate is empty for them and we
  -- leave the voucher alone rather than writing a bogus status.
  if v_billed is null then
    return coalesce(new, old);
  end if;

  update public.vouchers
     set payment_status = case
           when v_owing <= 0.5             then 'paid'
           when v_owing >= v_billed - 0.5  then 'unpaid'
           else 'part_paid'
         end
   where journal_id = v_journal;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_voucher_payment_status on public.customer_ledger_entries;
create trigger trg_voucher_payment_status
after insert or update or delete on public.customer_ledger_entries
for each row execute function public.sync_voucher_payment_status();

-- ── 5. Index ───────────────────────────────────────────────────────────────
-- Drives the outstanding-POD lists. Predicate is a constant set, no now(),
-- so it stays IMMUTABLE and usable.
create index if not exists idx_vouchers_outstanding
  on public.vouchers (company_id, payment_status, posting_date)
  where payment_status in ('unpaid','part_paid');

notify pgrst, 'reload schema';
