-- APPLIED TO PROD 1 Sep 2026 via MCP. In repo for the record.
-- Server-side aggregation of posted journal lines per account for a date
-- range. Replaces client-side sums over raw journal_lines in P&L, Budget vs
-- Actual, and Banks month stats, all of which silently truncated at the
-- PostgREST 1,000-row cap (August 2026 P&L needed 1,231 rows and showed
-- salaries at 230,000 instead of 7,396,000). Returns at most one row per
-- account, so the cap can never bite. SECURITY INVOKER: RLS still applies.
CREATE OR REPLACE FUNCTION account_period_totals(
  p_from date,
  p_to date,
  p_account_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(account_id uuid, debit numeric, credit numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT jl.account_id,
         COALESCE(SUM(jl.debit), 0)::numeric  AS debit,
         COALESCE(SUM(jl.credit), 0)::numeric AS credit
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  WHERE j.status = 'posted'
    AND j.posting_date >= p_from
    AND j.posting_date <= p_to
    AND (p_account_ids IS NULL OR jl.account_id = ANY(p_account_ids))
  GROUP BY jl.account_id
$$;

GRANT EXECUTE ON FUNCTION account_period_totals(date, date, uuid[]) TO authenticated;
