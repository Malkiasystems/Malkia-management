-- ============================================================
-- MIGRATION: Race-safe voucher reference number generation
-- 
-- Problem: The old nextRef() reads MAX(ref) then inserts.
--          Two concurrent users can get the same number.
--
-- Solution: A dedicated voucher_sequences table with 
--           SELECT ... FOR UPDATE to serialize access.
-- ============================================================

-- 1. Create a sequences table to track last-used number per type+branch
CREATE TABLE IF NOT EXISTS voucher_sequences (
  voucher_type TEXT NOT NULL,
  branch_code  TEXT NOT NULL DEFAULT '10',
  last_seq     INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (voucher_type, branch_code)
);

-- 2. Seed from existing vouchers so we don't reset counters
INSERT INTO voucher_sequences (voucher_type, branch_code, last_seq)
SELECT 
  type,
  '10' AS branch_code,
  COALESCE(MAX(
    CAST(
      REGEXP_REPLACE(ref, '^[A-Z]+-[0-9]+-', '') AS INTEGER
    )
  ), 0) AS last_seq
FROM vouchers
WHERE ref ~ '^[A-Z]+-[0-9]+-[0-9]+$'
GROUP BY type
ON CONFLICT (voucher_type, branch_code) DO UPDATE
  SET last_seq = GREATEST(voucher_sequences.last_seq, EXCLUDED.last_seq);

-- 3. Create the RPC function
CREATE OR REPLACE FUNCTION generate_next_ref(
  p_type TEXT,
  p_branch TEXT DEFAULT '10'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_next_seq INTEGER;
  v_ref TEXT;
BEGIN
  -- Map voucher type to prefix (matches VOUCHER_PREFIXES in refs.ts)
  v_prefix := CASE p_type
    WHEN 'cash_sale'        THEN 'CS'
    WHEN 'sales_invoice'    THEN 'SI'
    WHEN 'sales_return'     THEN 'SR'
    WHEN 'proforma'         THEN 'PF'
    WHEN 'credit_note'      THEN 'CN'
    WHEN 'debit_note'       THEN 'DN'
    WHEN 'cash_payment'     THEN 'PAY'
    WHEN 'cash_receipt'     THEN 'RCP'
    WHEN 'bank_transfer'    THEN 'BNK'
    WHEN 'contra'           THEN 'CTR'
    WHEN 'petty_cash'       THEN 'PCT'
    WHEN 'purchase_invoice' THEN 'PIP'
    WHEN 'purchase_order'   THEN 'PO'
    WHEN 'grn'              THEN 'GRN'
    WHEN 'purchase_return'  THEN 'PRN'
    WHEN 'stock_transfer'   THEN 'STP'
    WHEN 'stock_adjustment' THEN 'ADJ'
    WHEN 'opening_stock'    THEN 'OST'
    WHEN 'journal_entry'    THEN 'JNL'
    WHEN 'import_order'     THEN 'IMP'
    ELSE UPPER(LEFT(p_type, 3))
  END;

  -- Insert-or-update the sequence row, locking it to prevent races
  INSERT INTO voucher_sequences (voucher_type, branch_code, last_seq, updated_at)
  VALUES (p_type, p_branch, 1, NOW())
  ON CONFLICT (voucher_type, branch_code) DO UPDATE
    SET last_seq = voucher_sequences.last_seq + 1,
        updated_at = NOW()
  RETURNING last_seq INTO v_next_seq;

  -- Build the ref string: PREFIX-BRANCH-0001
  v_ref := v_prefix || '-' || p_branch || '-' || LPAD(v_next_seq::TEXT, 4, '0');

  RETURN v_ref;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION generate_next_ref(TEXT, TEXT) TO anon, authenticated;
