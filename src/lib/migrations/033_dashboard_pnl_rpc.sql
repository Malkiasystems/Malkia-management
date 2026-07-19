-- Migration 033: server-side P&L aggregation for the dashboard.
-- RUN BEFORE deploying the useDashboard.ts that calls it.
--
-- Why: the dashboard fetched raw journal lines to the browser and summed them
-- there. Three defects: (1) Supabase's silent 1000-row cap truncated the data
-- as July grew, zeroing the P&L with no error; (2) it required status='posted'
-- exactly, dropping journals with NULL status; (3) it classified by
-- accounts.type, but 5 of 6 COGS accounts carry type='expense', deflating
-- gross margin. This RPC aggregates in the database (no cap), treats status
-- like every other query in the system (anything not 'void' counts), and
-- classifies by code prefix (4=revenue, 5=COGS, 6=opex), matching the P&L page.

create or replace function public.dashboard_pnl(p_from date, p_to date)
returns table (
  bucket text,          -- 'revenue' | 'cogs' | 'opex'
  period text,          -- 'current' | 'previous' (relative to p_split below? no: caller passes ranges)
  code text,
  name text,
  amount numeric
)
language sql
stable
as $$
  select
    case
      when a.code like '4%' then 'revenue'
      when a.code like '5%' then 'cogs'
      when a.code like '6%' then 'opex'
      else 'other'
    end as bucket,
    'current'::text as period,
    a.code,
    a.name,
    case
      when a.code like '4%' then sum(jl.credit - jl.debit)
      else sum(jl.debit - jl.credit)
    end as amount
  from journal_lines jl
  join journals j on j.id = jl.journal_id
  join accounts a on a.id = jl.account_id
  where coalesce(j.status, 'posted') <> 'void'
    and j.posting_date >= p_from
    and j.posting_date <= p_to
    and (a.code like '4%' or a.code like '5%' or a.code like '6%')
  group by 1, 2, a.code, a.name
  having abs(case
      when a.code like '4%' then sum(jl.credit - jl.debit)
      else sum(jl.debit - jl.credit)
    end) > 0.005;
$$;

grant execute on function public.dashboard_pnl(date, date) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
