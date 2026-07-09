-- ════════════════════════════════════════════════════════════════════════════
-- 024_waiting_list.sql
-- Out-of-stock waiting list. When a walk-in asks for something you don't have,
-- capture the demand instead of losing it. When stock arrives you know exactly
-- who to call back, and for how many.
--
-- A waiter is either:
--   • an EXISTING customer -> customer_id set (a returning buyer), or
--   • a brand-new walk-in  -> customer_id NULL, just name + whatsapp.
-- The app shows this distinction, because a returning customer and a first-time
-- enquiry deserve different follow-up.
--
-- status: 'waiting' -> 'notified' -> 'fulfilled' | 'cancelled'
--
-- Idempotent. RLS OFF to match the other operational tables — choose
-- "Run without RLS" if Supabase prompts.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS waiting_list (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL,
  product_name   TEXT,
  qty_wanted     NUMERIC NOT NULL DEFAULT 1,

  customer_id    UUID,            -- NULL = never bought before (new enquiry)
  customer_name  TEXT NOT NULL,
  whatsapp       TEXT,

  status         TEXT NOT NULL DEFAULT 'waiting',  -- waiting|notified|fulfilled|cancelled
  note           TEXT,

  added_by       UUID,
  added_by_name  TEXT,
  notified_at    TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,
  closed_by_name TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiting_list_status  ON waiting_list (status);
CREATE INDEX IF NOT EXISTS idx_waiting_list_product ON waiting_list (product_id);
CREATE INDEX IF NOT EXISTS idx_waiting_list_cust    ON waiting_list (customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON waiting_list TO authenticated;

NOTIFY pgrst, 'reload schema';
