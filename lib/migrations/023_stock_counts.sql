-- ════════════════════════════════════════════════════════════════════════════
-- 023_stock_counts.sql
-- Physical stock count / verification. A count session snapshots the system
-- quantity for a scope of products at a location, produces a printable sheet to
-- count against, records the counted quantities, shows the variance, and settles
-- discrepancies by posting stock adjustments so the system matches reality.
--
-- Scope can be all items, or narrowed to items SOLD or MOVED in a period (using
-- the ledger), so you can count only what actually changed in a day or week.
--
--   stock_counts       — one row per count session.
--   stock_count_lines  — one row per product in scope: the system snapshot and
--                        the counted figure (null until entered).
--
-- Idempotent. RLS off to match the operational tables.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_counts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref             TEXT,
  name            TEXT,
  location_code   TEXT,
  location_id     UUID,
  scope           TEXT,                 -- 'all' | 'sold' | 'moved' | 'category'
  scope_detail    TEXT,                 -- category name, or the period label
  period_from     DATE,
  period_to       DATE,
  status          TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'settled'
  counted_by_name TEXT,
  settled_by_name TEXT,
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id      UUID NOT NULL,
  product_id    UUID NOT NULL,
  sku           TEXT,
  product_name  TEXT,
  category      TEXT,
  unit_cost     NUMERIC DEFAULT 0,
  system_qty    NUMERIC NOT NULL DEFAULT 0,   -- snapshot at count creation
  counted_qty   NUMERIC,                       -- null until the counter enters it
  settled       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count ON stock_count_lines (count_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON stock_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_count_lines TO authenticated;

NOTIFY pgrst, 'reload schema';
