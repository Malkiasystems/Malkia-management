-- ─────────────────────────────────────────────────────────────────────────
-- 027_receipt_payment_ref.sql
-- Gives the receipt payment reference a real home on the vouchers table.
--
-- WHY THIS EXISTS
-- The Receipt Voucher page has always shown a "Transaction ID / Reference /
-- Cheque Number" field. The value was held in React state and then dropped
-- on the floor at posting time:
--
--   * CashReceipt.postCustomerReceipt  → vouchers insert wrote payment_method
--     and notes only. The reference was never written anywhere.
--   * CashReceipt.postOtherIncome      → same.
--   * CashReceipt passed transactionId to <CustomerPaymentFlow>, but that
--     component destructures only { amount, onChange, initialCustomerId }.
--     The prop was accepted and ignored.
--   * CustomerReceiptBatchInner        → crammed it into the free-text notes
--     column, and only when narration was empty. Any row with a narration
--     lost its reference silently.
--
-- Net effect: no M-Pesa code, Mixx/Airtel code, bank TT ref or cheque number
-- was ever queryable. A posted receipt could not be reconciled against a bank
-- or mobile money statement without opening the physical paperwork.
--
-- The reference is now mandatory for every non-cash receipt, so it needs a
-- first-class column rather than a substring of a notes field.
--
-- NOTE ON GRANTS / RLS: vouchers is an existing table with table-level grants
-- and row-level policies already in force. Postgres extends table-level column
-- privileges to columns added later, and RLS policies filter rows not columns,
-- so no new GRANT or policy is required here. Do not re-grant: it risks
-- widening access beyond what the existing policy set intends.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS payment_ref TEXT;

COMMENT ON COLUMN vouchers.payment_ref IS
  'External payment reference supplied by the payer: M-Pesa / Mixx / Airtel transaction code, bank RTGS or TT reference, cheque number, or POS approval code. Mandatory on non-cash receipts, NULL on cash receipts. This is the key used to reconcile a posted voucher against a bank or mobile money statement.';

-- Partial index. Reconciliation looks up one specific code at a time
-- ("did we ever post QTA1BCD2EFG?"), and the column is NULL on every cash
-- receipt, so cash rows are kept out of the index entirely.
CREATE INDEX IF NOT EXISTS idx_vouchers_payment_ref
  ON vouchers (payment_ref)
  WHERE payment_ref IS NOT NULL;

-- Backfill nothing on purpose.
--
-- Historic batch receipts stored the reference inside notes as
-- "Batch receipt · ref XXXX". It is tempting to parse those out into
-- payment_ref, but that string was only written when narration was empty,
-- and "Batch receipt · ref " (empty tail) was written when the clerk left
-- the field blank. Parsing it would manufacture a reference trail that is
-- partial and unverifiable, which is worse than an honest NULL. Existing
-- vouchers keep payment_ref = NULL and mean "we do not know".

NOTIFY pgrst, 'reload schema';
