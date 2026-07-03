-- ════════════════════════════════════════════════════════════════════════════
-- 017_dispatch_enhancements.sql
-- Upgrades the dispatch feature for the stock man's daily work:
--   1. A saved list of riders/drivers (pick from a dropdown instead of retyping,
--      so follow-up and route knowledge is consistent and searchable).
--   2. Partial dispatch: an invoice can be sent in more than one trip. Each send
--      is its own row; the invoice only leaves the queue when a row marks it
--      final. Note: stock already left at invoice posting, so this tracks the
--      PHYSICAL fulfillment progress, not the stock count.
--   3. A per-dispatch delivery address override (send to a different destination
--      than the one on the invoice) and a note of exactly what went in each trip.
--
-- Idempotent. Safe to run more than once.
-- After running, RLS stays OFF to match the operational tables; access is
-- controlled in the app by the 'inventory.dispatch' permission.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Saved riders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS riders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_riders_name ON riders (lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON riders TO authenticated;

-- ─── 2. Partial dispatch + destination override on invoice_dispatches ──────
-- Allow multiple dispatch rows per invoice: drop the one-per-invoice unique.
DROP INDEX IF EXISTS uq_invoice_dispatches_ref;

-- is_final: does this send complete the invoice? Awaiting = no final row yet.
ALTER TABLE invoice_dispatches ADD COLUMN IF NOT EXISTS is_final          BOOLEAN NOT NULL DEFAULT TRUE;
-- override destination for this trip (blank = use the invoice's address)
ALTER TABLE invoice_dispatches ADD COLUMN IF NOT EXISTS delivery_address  TEXT;
-- free-text record of what physically went in this trip (for partials)
ALTER TABLE invoice_dispatches ADD COLUMN IF NOT EXISTS items_sent        TEXT;

-- Keep the rider-required-on-delivery rule from before (added NOT VALID earlier).

CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_final ON invoice_dispatches (ref, is_final);

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT ref, status, is_final, rider_name, items_sent, dispatched_at
--   FROM invoice_dispatches ORDER BY dispatched_at DESC LIMIT 20;
--   SELECT name, phone FROM riders ORDER BY name;
