-- ============================================================================
-- Split reports.view: grant reports.financials to current reports.view holders
--
-- RUN THIS BEFORE THE CODE DEPLOY.
--
-- P&L, Balance Sheet, Trial Balance, Stock Valuation, Cash Flow, General
-- Ledger, Ledger Health, Product Profit, Loans and the Investors pages move
-- from reports.view to reports.financials. canAccessPage() requires a match,
-- so without this the five reports.view holders lose those screens the moment
-- the code ships. Running it first makes the deploy behaviour-neutral, then
-- you untick "View Profitability & Net Worth" per user in User Management.
--
-- Idempotent. Verified against production: affects 5 rows, highest resulting
-- permission count is 60, so nobody crosses the 40-permission threshold that
-- canAccessPage() treats as super admin.
--
-- NOTE: this deliberately preserves today's access, including Elizabeth
-- Mnyampanda, who holds reports.view on a 4-permission account and can
-- currently open the balance sheet. She is the most likely person you want to
-- untick immediately after deploying.
-- ============================================================================

update users
set permissions = array_append(permissions, 'reports.financials')
where 'reports.view' = any(permissions)
  and not ('reports.financials' = any(permissions));

-- Verification
select full_name,
       cardinality(permissions)                  as perms,
       ('reports.financials' = any(permissions)) as sees_pnl_and_balance_sheet,
       ('reports.view'       = any(permissions)) as sees_operational_registers,
       ('accounting.view'    = any(permissions)) as sees_banks_and_cash
from users
where is_active
order by perms desc;
