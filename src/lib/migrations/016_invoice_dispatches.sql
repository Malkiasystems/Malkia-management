-- ════════════════════════════════════════════════════════════════════════════
-- 016_invoice_dispatches.sql
-- Fulfillment layer: lets a warehouse/stock person confirm that a posted sales
-- invoice has physically been sent out (dispatched) or handed over at the
-- warehouse counter (collected). This does NOT move stock — a sales invoice
-- already deducts inventory when it is posted — it is a control and coordination
-- record of who sent the goods, when, and (for deliveries) which rider took them.
--
-- Model: one row per invoice once it is fulfilled.
--   • A posted sales invoice with NO row here  = Awaiting Dispatch.
--   • A posted sales invoice WITH a row here    = Dispatched or Collected.
-- The unique index on ref means an invoice can only be dispatched once.
--
-- Idempotent. Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoice_dispatches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id         UUID,
  ref                TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'dispatched',   -- 'dispatched' | 'collected'
  rider_name         TEXT,                                  -- optional; who took the delivery
  notes              TEXT,
  dispatched_by      UUID,                                  -- the stock person (users.id)
  dispatched_by_name TEXT,                                  -- frozen name for the record
  dispatched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One dispatch per invoice
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_dispatches_ref    ON invoice_dispatches (ref);
CREATE INDEX        IF NOT EXISTS idx_invoice_dispatches_status ON invoice_dispatches (status);
CREATE INDEX        IF NOT EXISTS idx_invoice_dispatches_when   ON invoice_dispatches (dispatched_at DESC);

-- RLS is left OFF to match the other operational tables (vouchers,
-- product_locations, etc). Who may confirm a dispatch is enforced in the app by
-- the 'inventory.dispatch' permission. If you later want database-level
-- enforcement, we can add it deliberately (with a super-admin bypass).

-- Verify:
--   SELECT ref, status, rider_name, dispatched_by_name, dispatched_at
--   FROM invoice_dispatches ORDER BY dispatched_at DESC LIMIT 20;
