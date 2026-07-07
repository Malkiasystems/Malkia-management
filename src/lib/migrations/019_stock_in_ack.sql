-- ════════════════════════════════════════════════════════════════════════════
-- 019_stock_in_ack.sql
-- Stock-in follow-up. When stock comes in (GRN, credit note, transfer in,
-- positive adjustment, opening stock, purchase, etc.) the stock man should be
-- notified and verify it against the physical goods. This tracks which stock-in
-- documents he has acknowledged, so the rest show up as "needs follow-up".
--
--   • A stock-in document (a ledger ref with positive qty) with NO row here
--     = still to be verified (counts toward the notification badge).
--   • A row here = verified, by whom and when.
--
-- pending_stock_in_count() powers the sidebar badge. It only counts the last
-- 90 days, so the historical backlog doesn't show as a permanent alert.
--
-- Idempotent. RLS off to match the operational tables; the app gates who can
-- acknowledge via the 'inventory.view' / dispatch permissions.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_in_ack (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_ref         TEXT NOT NULL,
  acknowledged_by      UUID,
  acknowledged_by_name TEXT,
  note                 TEXT,
  acknowledged_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_in_ack_ref ON stock_in_ack (document_ref);
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_in_ack TO authenticated;

-- Count of stock-in documents in the last 90 days not yet acknowledged.
CREATE OR REPLACE FUNCTION pending_stock_in_count()
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT count(DISTINCT ile.document_ref)::int
  FROM item_ledger_entries ile
  WHERE ile.qty > 0
    AND ile.document_ref IS NOT NULL
    AND ile.created_at >= now() - interval '90 days'
    AND NOT EXISTS (SELECT 1 FROM stock_in_ack a WHERE a.document_ref = ile.document_ref);
$$;
GRANT EXECUTE ON FUNCTION pending_stock_in_count() TO authenticated;

NOTIFY pgrst, 'reload schema';
