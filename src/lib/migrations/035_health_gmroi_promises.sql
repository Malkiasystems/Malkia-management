-- Migration 035: Ledger Health Check + Product GMROI + AR promise tracking.
-- RUN BEFORE deploying the three report pages.

-- ── 1. Ledger Health Check: every integrity test from the July cleanup ──
create or replace function public.ledger_health_check()
returns table (check_name text, status text, detail text, amount numeric)
language sql stable as $$
-- trial balance foots to zero
select 'Trial balance nets to zero', case when abs(coalesce(sum(balance),0)) < 0.01 then 'PASS' else 'FAIL' end,
       'Sum of all posting-account balances', coalesce(sum(balance),0)
from accounts where account_type='posting'
union all
-- unbalanced journals
select 'No unbalanced journals',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       count(*)::text || ' journal(s) where debits <> credits', coalesce(sum(abs(imb)),0)
from (select jl.journal_id, sum(jl.debit)-sum(jl.credit) imb
      from journal_lines jl join journals j on j.id=jl.journal_id
      where coalesce(j.status,'posted')<>'void'
      group by jl.journal_id having abs(sum(jl.debit)-sum(jl.credit))>0.01) x
union all
-- orphan journal headers (no lines)
select 'No orphan journal headers',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       count(*)::text || ' header(s) with zero lines', count(*)::numeric
from journals j where coalesce(j.status,'posted')<>'void'
  and not exists (select 1 from journal_lines jl where jl.journal_id=j.id)
union all
-- deactivated accounts holding balances (the 6012 disease)
select 'No hidden money in inactive accounts',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(code || ' ' || name, ', '), 'none'), coalesce(sum(abs(balance)),0)
from accounts where account_type='posting' and is_active=false and abs(balance)>0.01
union all
-- balance cache vs ledger drift
select 'Account cache matches ledger',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       count(*)::text || ' account(s) drifted', coalesce(sum(abs(drift)),0)
from (select a.id, a.balance - coalesce(sum(jl.debit-jl.credit),0) drift
      from accounts a
      left join journal_lines jl on jl.account_id=a.id
      left join journals j on j.id=jl.journal_id and coalesce(j.status,'posted')<>'void'
      where a.account_type='posting'
      group by a.id, a.balance having abs(a.balance - coalesce(sum(jl.debit-jl.credit),0))>0.01) d
union all
-- supplier subledger vs balance (item #10)
select 'Supplier balances match their ledgers',
       case when count(*)=0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(name, ', '), 'none'), coalesce(sum(abs(diff)),0)
from (select s.name, s.balance_tzs - coalesce((select sum(v.amount) from vendor_ledger_entries v where v.supplier_id=s.id),0) diff
      from suppliers s where abs(s.balance_tzs - coalesce((select sum(v.amount) from vendor_ledger_entries v where v.supplier_id=s.id),0))>0.01
        and s.balance_tzs <> 0) x
union all
-- balance trigger installed
select 'Balance trigger active',
       case when count(*)=1 then 'PASS' else 'FAIL' end,
       'trg_assert_journal_balanced on journal_lines', count(*)::numeric
from pg_trigger where tgname='trg_assert_journal_balanced';
$$;
grant execute on function public.ledger_health_check() to anon, authenticated;

-- ── 2. Product GMROI: margin earned vs cash tied up, per product ──
create or replace function public.product_gmroi(p_from date, p_to date)
returns table (product_name text, qty_sold numeric, revenue numeric, cost numeric,
               margin numeric, stock_qty numeric, stock_value numeric,
               gmroi numeric, days_of_stock numeric)
language sql stable as $$
with sales as (
  select vl.product_id,
         sum(vl.qty) qty_sold,
         sum(vl.total) revenue,
         sum(vl.qty * coalesce(nullif(vl.unit_cost,0), p.cost_price, 0)) cost
  from voucher_lines vl
  join vouchers v on v.id = vl.voucher_id
  join products p on p.id = vl.product_id
  where v.type in ('cash_sale','sales_invoice')
    and coalesce(v.status,'posted') <> 'void'
    and v.posting_date between p_from and p_to
  group by vl.product_id
)
select p.name,
       coalesce(s.qty_sold,0),
       coalesce(s.revenue,0),
       coalesce(s.cost,0),
       coalesce(s.revenue,0) - coalesce(s.cost,0) as margin,
       coalesce(p.qty_on_hand,0),
       coalesce(p.qty_on_hand,0) * coalesce(p.cost_price,0) as stock_value,
       case when coalesce(p.qty_on_hand,0)*coalesce(p.cost_price,0) > 0
            then (coalesce(s.revenue,0)-coalesce(s.cost,0)) / (p.qty_on_hand*p.cost_price)
            else null end as gmroi,
       case when coalesce(s.qty_sold,0) > 0
            then coalesce(p.qty_on_hand,0) / (s.qty_sold / greatest((p_to - p_from + 1),1))
            else null end as days_of_stock
from products p
left join sales s on s.product_id = p.id
where p.is_active = true
  and (coalesce(p.qty_on_hand,0) > 0 or coalesce(s.qty_sold,0) > 0);
$$;
grant execute on function public.product_gmroi(date, date) to anon, authenticated;

-- ── 3. AR promise tracking ──
create table if not exists public.ar_promises (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  promised_amount numeric not null,
  contact_date date not null default current_date,
  due_date date not null,
  note text,
  status text not null default 'open' check (status in ('open','kept','broken')),
  created_by text,
  created_at timestamptz not null default now()
);

NOTIFY pgrst, 'reload schema';
