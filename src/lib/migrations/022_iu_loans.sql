-- ════════════════════════════════════════════════════════════════════════════
-- 022_iu_loans.sql
-- Temporary Internal Use. Some IU issues are returnable (stock taken out for
-- photos, samples, display) and come back later. This tracks each temporary
-- issue line as a "loan": how much went out, how much has come back, and what's
-- still outstanding. Permanent (consumed) internal use is unaffected.
--
-- One row per product line of a temporary IU. On return, the app books the
-- returned quantity back into stock (reversing the original stock + journal) and
-- raises qty_returned. Fully returned -> 'returned'; the remainder can be
-- written off ('written_off') if it was damaged or not coming back.
--
-- The account ids are stored so the return can post an exact reversing journal
-- (Dr Inventory, Cr the same expense account the issue debited).
--
-- Idempotent. RLS off to match the operational tables.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS iu_loans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id           UUID,
  ref                  TEXT NOT NULL,
  product_id           UUID NOT NULL,
  product_name         TEXT,
  location_id          UUID,
  location_code        TEXT,
  unit_cost            NUMERIC NOT NULL DEFAULT 0,
  qty_issued           NUMERIC NOT NULL,
  qty_returned         NUMERIC NOT NULL DEFAULT 0,
  expense_account_id   UUID,
  inventory_account_id UUID,
  status               TEXT NOT NULL DEFAULT 'outstanding',  -- outstanding | returned | written_off
  issued_by_name       TEXT,
  issued_at            DATE,
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iu_loans_status ON iu_loans (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON iu_loans TO authenticated;

NOTIFY pgrst, 'reload schema';
