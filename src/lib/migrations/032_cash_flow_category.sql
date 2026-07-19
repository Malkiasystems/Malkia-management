-- Migration 032: Cash-flow classification for every account.
-- RUN BEFORE deploying the Cash Command Center code.
--
-- Adds accounts.cash_flow_category ('operating' | 'investing' | 'financing')
-- so cash movements can be grouped automatically, per Scaling Up's cash tools.
-- Defaults are set from the existing structure and can be edited per account
-- later without code changes.
--
-- Check the bottom of the SQL editor before running: delete any auto-appended
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY; line (this script has UPDATEs,
-- the known trigger is INSERTs, but confirm anyway).

alter table public.accounts
  add column if not exists cash_flow_category text
  check (cash_flow_category in ('operating','investing','financing'));

-- Defaults by structure:
-- Loans + owner capital movements = financing
update public.accounts set cash_flow_category = 'financing'
where cash_flow_category is null
  and (category = 'Loans' or type = 'equity');

-- Fixed assets = investing
update public.accounts set cash_flow_category = 'investing'
where cash_flow_category is null
  and (name ilike '%equipment%' or name ilike '%furniture%' or name ilike '%computer%'
       or name ilike '%vehicle%' or name ilike '%depreciation%' or code like '15%' or code like '16%');

-- Everything else that isn't a cash account itself = operating
-- (Cash & Bank accounts are the SUBJECT of the statement, not classified)
update public.accounts set cash_flow_category = 'operating'
where cash_flow_category is null
  and category is distinct from 'Cash & Bank';

NOTIFY pgrst, 'reload schema';
