-- ═══════════════════════════════════════════════════════════════════════════
-- 028_stock_adjustment_gl.sql
--
-- Makes stock adjustments and stock counts reach the general ledger.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY
--
-- StockAdjustment.tsx and StockCount.tsx both move stock and neither posts a
-- journal. As of today that has left 85 item ledger entries — 70,843,588.88 of
-- increases and 19,462,350.67 of decreases — that changed the warehouse and
-- never touched the balance sheet. Account 1110 is at -30,588,673.22 partly
-- because of this.
--
-- Three distinct causes, all in the code:
--
--   1. StockAdjustment.tsx line 140 reads:
--          if (form.type === 'writeoff' && writeoffId) { ...post journal... }
--      So 'increase' and 'decrease' post NOTHING to the GL. By design. The
--      toast at line 157 even says "No P&L impact", which is simply false —
--      finding or losing stock always moves the balance sheet.
--
--   2. That same page looks up the write-off account by code '5080'. No such
--      account exists; the real one is 5082. writeoffId is therefore undefined,
--      the `&& writeoffId` guard is false, and the write-off journal is skipped
--      SILENTLY. No error, no toast. Latent, since no write-off has been done.
--
--   3. StockCount.tsx has no journal code at all.
--
-- All three fail AFTER products.qty_on_hand and item_ledger_entries have
-- already been written, and there is no transaction, so nothing rolls back and
-- nothing is reported. Stock module right, accounts wrong, no error anywhere.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES
--
--   1. Creates post_journal_transaction(). This was written in migration 002
--      and NEVER APPLIED — it does not exist in the database. It is the fix for
--      the root cause: it inserts journal + lines + balance updates inside one
--      PostgreSQL transaction and refuses to post an unbalanced entry. The code
--      changes shipping with this migration depend on it.
--
--   2. Adds account 6850 'Stock Variance & Shrinkage'.
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. The atomic posting RPC (from migration 002, never applied) ─────────

CREATE OR REPLACE FUNCTION post_journal_transaction(
  p_ref TEXT,
  p_posting_date DATE,
  p_description TEXT,
  p_journal_type TEXT,
  p_source_type TEXT,
  p_source_ref TEXT,
  p_posted_by TEXT,
  p_branch TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_journal_id UUID;
  v_line JSONB;
  v_line_num INT := 0;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
BEGIN
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_debit  := v_total_debit  + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::NUMERIC, 0);
  END LOOP;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Journal not balanced: debits (%) != credits (%)', v_total_debit, v_total_credit;
  END IF;

  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal must have at least 2 lines';
  END IF;

  INSERT INTO journals (ref, posting_date, description, journal_type, source_type, source_ref, posted_by, status, branch)
  VALUES (p_ref, p_posting_date, p_description, p_journal_type, p_source_type, p_source_ref, p_posted_by, 'posted', p_branch)
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_num := v_line_num + 1;
    INSERT INTO journal_lines (journal_id, line_number, account_id, description, debit, credit)
    VALUES (
      v_journal_id,
      v_line_num,
      (v_line->>'account_id')::UUID,
      COALESCE(v_line->>'description', ''),
      COALESCE((v_line->>'debit')::NUMERIC, 0),
      COALESCE((v_line->>'credit')::NUMERIC, 0)
    );

    PERFORM update_account_balance(
      (v_line->>'account_id')::UUID,
      COALESCE((v_line->>'debit')::NUMERIC, 0),
      COALESCE((v_line->>'credit')::NUMERIC, 0)
    );
  END LOOP;

  RETURN v_journal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION post_journal_transaction(TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;


-- ─── 2. Stock variance account ────────────────────────────────────────────
--
-- Deliberately NOT a child of 6800 INTERNAL USE. That header is for stock you
-- chose to consume: marketing samples, staff use, sales samples. A count
-- variance is stock you cannot account for. Filing "3M vanished" under the same
-- heading as "we gave away samples" would hide exactly the number a business
-- most needs to see. It gets its own P&L line, alongside the other 12 headers.
--
-- Used in both directions:
--   decrease / shrinkage  → Dr 6850 / Cr 1110
--   increase / found      → Dr 1110 / Cr 6850   (a credit here, reducing the expense)
--
-- Deliberate write-offs of damaged goods keep using 5082 Write-offs, which is
-- genuinely internal use.

INSERT INTO accounts (code, name, type, category, parent_id, is_active, balance)
SELECT '6850', 'Stock Variance & Shrinkage', 'expense', 'Operating Expenses', NULL, true, 0
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '6850');

COMMENT ON TABLE accounts IS
  'Chart of accounts. 6850 Stock Variance & Shrinkage carries count and adjustment differences; 5082 Write-offs carries deliberate disposal of damaged goods. Keep them apart: one is a decision, the other is a discovery.';


-- ─── Verify ───────────────────────────────────────────────────────────────
-- Expected: rpc_exists = true, variance_account = 1

SELECT
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'post_journal_transaction') AS rpc_exists,
  (SELECT count(*) FROM accounts WHERE code = '6850') AS variance_account;

NOTIFY pgrst, 'reload schema';
