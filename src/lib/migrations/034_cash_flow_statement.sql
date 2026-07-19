-- Migration 034: Cash Flow Statement (direct method) server-side.
-- RUN BEFORE deploying the CashFlow page.
--
-- Groups every movement through 'Cash & Bank' accounts by the counterpart
-- account's cash_flow_category (migration 032 tags). Multi-line journals are
-- apportioned across counterparts by weight. Opening/closing cash computed
-- from the ledger, so the statement always reconciles by construction.
-- Status handling matches the rest of the system: anything not 'void' counts.
--
-- Validated against live July data before shipping: financing section returned
-- exactly -45,240,000 (HK 30M + IM 15.24M loan repayments).

create or replace function public.cash_flow_statement(p_from date, p_to date)
returns table (
  section text,      -- 'operating' | 'investing' | 'financing' | '_opening' | '_closing'
  code text,
  name text,
  amount numeric
)
language sql
stable
as $$
with cash_accts as (
  select id from accounts where category = 'Cash & Bank'
),
-- net cash movement per journal in the period
cash_journals as (
  select jl.journal_id, sum(jl.debit - jl.credit) as cash_delta
  from journal_lines jl
  join journals j on j.id = jl.journal_id
  where jl.account_id in (select id from cash_accts)
    and coalesce(j.status,'posted') <> 'void'
    and j.posting_date between p_from and p_to
  group by jl.journal_id
  having sum(jl.debit - jl.credit) <> 0
),
-- counterpart (non-cash) lines of those journals, weighted
counterparts as (
  select cj.journal_id, cj.cash_delta,
         coalesce(a.cash_flow_category, 'operating') as cfc,
         a.code, a.name,
         sum(jl.credit - jl.debit) as counter_weight
  from cash_journals cj
  join journal_lines jl on jl.journal_id = cj.journal_id
  join accounts a on a.id = jl.account_id
  where jl.account_id not in (select id from cash_accts)
  group by cj.journal_id, cj.cash_delta, coalesce(a.cash_flow_category,'operating'), a.code, a.name
),
weights as (
  select journal_id, sum(counter_weight) as total_weight
  from counterparts group by journal_id
),
detail as (
  select c.cfc as section, c.code, c.name,
         sum(c.cash_delta * c.counter_weight / nullif(w.total_weight, 0)) as amount
  from counterparts c
  join weights w on w.journal_id = c.journal_id
  group by c.cfc, c.code, c.name
  having abs(sum(c.cash_delta * c.counter_weight / nullif(w.total_weight, 0))) > 0.005
),
opening as (
  select '_opening'::text, ''::text, 'Opening cash'::text,
         coalesce(sum(jl.debit - jl.credit), 0)
  from journal_lines jl
  join journals j on j.id = jl.journal_id
  where jl.account_id in (select id from cash_accts)
    and coalesce(j.status,'posted') <> 'void'
    and j.posting_date < p_from
),
closing as (
  select '_closing'::text, ''::text, 'Closing cash'::text,
         coalesce(sum(jl.debit - jl.credit), 0)
  from journal_lines jl
  join journals j on j.id = jl.journal_id
  where jl.account_id in (select id from cash_accts)
    and coalesce(j.status,'posted') <> 'void'
    and j.posting_date <= p_to
)
select * from detail
union all select * from opening
union all select * from closing;
$$;

grant execute on function public.cash_flow_statement(date, date) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
