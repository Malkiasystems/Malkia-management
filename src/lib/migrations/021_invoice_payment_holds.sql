-- ════════════════════════════════════════════════════════════════════════════
-- 021_invoice_payment_holds.sql
-- Advance-paid wholesale invoices must be approved by a CEO/admin (who confirms
-- the money actually hit the bank) before the goods can be dispatched. The
-- invoice still posts and deducts stock as normal; it is only the DISPATCH that
-- is held.
--
--   • Invoice marked "paid in advance" at posting  -> a row here, status 'pending'.
--   • Approver confirms payment received           -> status 'approved'.
--   • Dispatch queue ignores invoices with a 'pending' hold; shows them once
--     approved (or if they never had a hold at all).
--
-- Idempotent. RLS off to match the operational tables; who can approve is gated
-- in the app by the 'sales.approve_advance' permission.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoice_payment_holds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id       UUID,
  ref              TEXT NOT NULL,
  customer_name    TEXT,
  amount           NUMERIC,
  status           TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved'
  bank_ref         TEXT,
  note             TEXT,
  requested_by     UUID,
  requested_by_name TEXT,
  approved_by      UUID,
  approved_by_name TEXT,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_payment_holds_ref ON invoice_payment_holds (ref);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_holds_status ON invoice_payment_holds (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_payment_holds TO authenticated;

NOTIFY pgrst, 'reload schema';
