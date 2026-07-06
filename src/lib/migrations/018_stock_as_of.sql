-- ════════════════════════════════════════════════════════════════════════════
-- 018_stock_as_of.sql
-- Point-in-time stock. Reconstructs each product's quantity (per location) as it
-- stood at a chosen moment, by summing the stock ledger up to that timestamp.
-- This is how proper accounting systems do historical stock: replay the ledger,
-- don't store daily snapshots. Exact and auditable from the point the ledger
-- became the system of record.
--
-- Returns one row per product+location with the balance as of p_ts. The app
-- joins products for cost/name and values it. Uses created_at (the moment each
-- movement was recorded), so it answers "what did the system hold at this time".
--
-- Idempotent. Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION stock_as_of(p_ts TIMESTAMPTZ)
RETURNS TABLE(product_id UUID, location_code TEXT, qty NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ile.product_id,
         ile.location_code,
         COALESCE(SUM(ile.qty), 0)::numeric AS qty
  FROM item_ledger_entries ile
  WHERE ile.created_at <= p_ts
    AND ile.product_id IS NOT NULL
  GROUP BY ile.product_id, ile.location_code
  HAVING COALESCE(SUM(ile.qty), 0) <> 0;
$$;

GRANT EXECUTE ON FUNCTION stock_as_of(TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Verify (stock as it stood at end of last month, for example):
--   SELECT * FROM stock_as_of('2026-06-30 23:59:59+00') LIMIT 20;
