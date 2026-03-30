-- Remove VAT from all vouchers and voucher lines
-- Malkia products are zero-rated (no VAT)
-- Run this in Supabase SQL Editor

-- Step 1: Preview current VAT amounts
SELECT 
  v.ref, 
  v.posting_date,
  v.subtotal,
  v.vat_amount AS old_vat,
  v.total_amount AS old_total,
  v.subtotal AS new_total
FROM vouchers v
WHERE v.vat_amount > 0
ORDER BY v.posting_date DESC;

-- Step 2: Update vouchers - set VAT to 0, total = subtotal
UPDATE vouchers
SET 
  vat_amount = 0,
  total_amount = subtotal
WHERE vat_amount > 0;

-- Step 3: Update voucher_lines - set VAT to 0
UPDATE voucher_lines
SET vat_amount = 0
WHERE vat_amount > 0;

-- Step 4: Delete any VAT journal entries (account 2020)
-- First preview what will be deleted
SELECT jl.*, j.ref, a.code, a.name
FROM journal_lines jl
JOIN journals j ON j.id = jl.journal_id
JOIN accounts a ON a.id = jl.account_id
WHERE a.code = '2020';

-- Delete the VAT journal lines
DELETE FROM journal_lines
WHERE account_id IN (SELECT id FROM accounts WHERE code = '2020');

-- Step 5: Reset VAT account balance to 0
UPDATE accounts
SET balance = 0
WHERE code = '2020';

-- Step 6: Verify changes
SELECT ref, posting_date, subtotal, vat_amount, total_amount 
FROM vouchers 
WHERE posting_date >= '2026-03-30'
ORDER BY posting_date DESC;

-- Done! All vouchers are now zero-rated (no VAT)
