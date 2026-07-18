-- Migration 030: Loan Repayment voucher support
-- RUN THIS IN THE SUPABASE SQL EDITOR *BEFORE* DEPLOYING THE CODE.
-- The code writes to vouchers.loan_account_id and calls account_balance_as_of,
-- so both must exist first.
--
-- Before you run: check the very bottom of the editor. If it appended
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
-- delete that line. (This script has no INSERT, so it should not trigger the
-- silent append, but confirm anyway.)

-- 1. Record which loan a repayment voucher settled.
--    Mirrors the existing customer_id / supplier_id pattern on vouchers.
alter table public.vouchers
  add column if not exists loan_account_id uuid references public.accounts(id);

-- 2. Point-in-time balance of an account, used to warn before recording a
--    payment the paying account could not have covered on that date.
--    For a cash/bank asset, a positive result means money was available.
create or replace function public.account_balance_as_of(p_account_id uuid, p_as_of date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(jl.debit - jl.credit), 0)
  from journal_lines jl
  join journals j on j.id = jl.journal_id
  where jl.account_id = p_account_id
    and coalesce(j.status, 'posted') <> 'void'
    and j.posting_date <= p_as_of;
$$;

grant execute on function public.account_balance_as_of(uuid, date) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
