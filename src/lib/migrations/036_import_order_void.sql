-- ════════════════════════════════════════════════════════════════════════════
-- 036_import_order_void.sql
--
-- MW-DB-23. Fixes the ImportOrder void path, which could not work.
--
-- What was wrong (ImportOrder.tsx, void handler):
--   1. It set journals.status = 'cancelled'. journals_status_check permits only
--      'draft', 'posted', 'void'. The UPDATE raised 23514 and was not error
--      checked, so it failed silently.
--   2. It zeroed journal_lines in place. That edits history and destroys the
--      audit trail. Register rule 2 forbids it.
--   3. It DELETED the vendor_ledger_entries row rather than reversing it.
--   4. It updated suppliers.balance_tzs with a client-side read-modify-write,
--      so two concurrent operations silently lose one update.
--   5. None of it was transactional. A failure part-way left balances reversed
--      with the ledger untouched.
--
-- This RPC does the whole reversal in ONE transaction, the way StockCount
-- already does it via post_journal_transaction.
--
-- ── ACCOUNTING DECISION, read this before using ──
-- The original journal is LEFT AT status = 'posted' and a separate reversing
-- journal is posted against it. It is NOT marked 'void'.
--
-- This is deliberate. Every report in MalkiaOS filters on status = 'posted'.
-- If we both marked the original void AND posted a reversal, the trial balance
-- would drop the original and subtract the reversal, reversing it twice, while
-- accounts.balance only moved once. That would manufacture cache drift on a
-- database that currently has none.
--
-- So: original stays posted, reversal nets it to zero, accounts.balance moves
-- exactly once, and journal_lines remains a complete history. This matches
-- register rules 2 and 3.
--
-- journals.voided_at / voided_by / void_reason are stamped on the ORIGINAL as
-- the already-reversed marker and the audit link. A row with status='posted'
-- and voided_at set means "this happened, and it has been reversed". Reports
-- that want to hide reversed pairs should filter on voided_at IS NULL, not on
-- status.
--
-- Idempotent: safe to run more than once. Additive only, no data touched.
-- Run BEFORE deploying the code in this bundle.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION void_import_payment(
  p_journal_id  UUID,
  p_supplier_id UUID    DEFAULT NULL,
  p_amount_tzs  NUMERIC DEFAULT 0,
  p_posted_by   TEXT    DEFAULT 'System',
  p_reason      TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig       journals%ROWTYPE;
  v_line_count INT;
  v_rev_id     UUID;
  v_rev_ref    TEXT;
  v_base_ref   TEXT;
  v_line       RECORD;
  v_n          INT := 0;
BEGIN
  -- Lock the original so two voids cannot race
  SELECT * INTO v_orig FROM journals WHERE id = p_journal_id FOR UPDATE;

  IF v_orig.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal not found');
  END IF;

  IF v_orig.status <> 'posted' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Journal is ' || COALESCE(v_orig.status, 'null') ||
               '. Only posted journals can be reversed.');
  END IF;

  IF v_orig.voided_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Already reversed on ' || v_orig.voided_at::DATE ||
               ' by ' || COALESCE(v_orig.voided_by, 'unknown'));
  END IF;

  -- Refuse to reverse a header with no lines. Reversing nothing would just
  -- mint a second orphan header (see MW-DB-22).
  SELECT COUNT(*) INTO v_line_count FROM journal_lines WHERE journal_id = p_journal_id;
  IF v_line_count = 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Journal has no lines. Nothing to reverse. Investigate this header instead.');
  END IF;

  -- Register rule 3: correcting journals carry a JV-FIX- ref.
  -- journals_ref_key is a live unique index, so probe for a free one.
  v_base_ref := 'JV-FIX-' || COALESCE(v_orig.source_ref, v_orig.ref) || '-V';
  v_rev_ref  := v_base_ref;
  WHILE EXISTS (SELECT 1 FROM journals WHERE ref = v_rev_ref) LOOP
    v_n := v_n + 1;
    v_rev_ref := v_base_ref || v_n::TEXT;
  END LOOP;

  INSERT INTO journals (
    ref, posting_date, description, journal_type, source_type, source_ref,
    posted_by, status
  ) VALUES (
    v_rev_ref,
    CURRENT_DATE,
    'REVERSAL of ' || v_orig.ref || COALESCE(' — ' || p_reason, ''),
    'import_payment_void',
    v_orig.source_type,
    v_orig.source_ref,
    p_posted_by,
    'posted'
  ) RETURNING id INTO v_rev_id;

  -- Mirror every line, Dr and Cr swapped, line numbers preserved.
  FOR v_line IN
    SELECT account_id, line_number, description, debit, credit
    FROM journal_lines
    WHERE journal_id = p_journal_id
    ORDER BY line_number
  LOOP
    INSERT INTO journal_lines (
      journal_id, line_number, account_id, description, debit, credit
    ) VALUES (
      v_rev_id,
      v_line.line_number,
      v_line.account_id,
      'Reversal — ' || COALESCE(v_line.description, ''),
      v_line.credit,
      v_line.debit
    );

    PERFORM update_account_balance(v_line.account_id, v_line.credit, v_line.debit);
  END LOOP;

  -- Stamp the original as reversed. Status deliberately unchanged, see header.
  UPDATE journals
     SET voided_at   = NOW(),
         voided_by   = p_posted_by,
         void_reason = COALESCE(p_reason, 'Reversed via import order void')
   WHERE id = p_journal_id;

  -- Subledger: reverse, never delete. Supplier balance moves atomically in SQL
  -- rather than by client-side read-modify-write.
  IF p_supplier_id IS NOT NULL AND COALESCE(p_amount_tzs, 0) <> 0 THEN
    INSERT INTO vendor_ledger_entries (
      supplier_id, posting_date, document_type, document_ref, description,
      amount_tzs, remaining_amount, is_open, journal_id
    ) VALUES (
      p_supplier_id,
      CURRENT_DATE,
      'reversal',
      v_rev_ref,
      'Reversal of import payment ' || v_orig.ref,
      p_amount_tzs,
      0,
      false,
      v_rev_id
    );

    UPDATE suppliers
       SET balance_tzs = COALESCE(balance_tzs, 0) + p_amount_tzs
     WHERE id = p_supplier_id;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'reversal_journal_id', v_rev_id,
    'reversal_ref',        v_rev_ref,
    'lines_reversed',      v_line_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION void_import_payment(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION void_import_payment IS
  'Atomically reverses a posted import payment journal: posts a mirrored JV-FIX- reversing journal, moves account balances once, stamps the original as reversed (status stays posted so the trial balance nets correctly), and reverses the vendor ledger entry and supplier balance in the same transaction. MW-DB-23.';
