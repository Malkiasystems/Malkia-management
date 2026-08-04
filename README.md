# Fix: fabricated VAT on vouchers + "missing" receipt in bank statement

## Deploy
Three files, ship together (full replacements):
  src/pages/PostedVouchers.tsx
  src/pages/Banks.tsx
  src/lib/bankStatementExport.ts
No migration. SUPERSEDES all earlier Banks zips — this contains maximize +
sorting + export menu + both of today's fixes. Deploy this one only.

## Finding 1 — the VAT was fabricated (display bug, books are clean)
RCP-10-1511 and RCP-10-1512 both store vat_amount = 0 in the database.
The Posted Vouchers page DERIVED VAT as total_amount − subtotal, which is
wrong for every voucher type it touched:
  · cash sales: that difference is the DELIVERY FEE (total = subtotal +
    delivery per cashSalePost.ts) — 507 posted cash sales were showing
    delivery as "VAT"
  · receipts/payments/petty cash/transfers/contra: subtotal is 0 by design,
    so the ENTIRE amount displayed as VAT (your 80,000 receipt → "VAT
    80,000"; the 117M contra would show "VAT 117,000,000")
Now: VAT displays the STORED vat_amount only (the VAT engine is its only
writer), the VAT and Subtotal rows hide when zero, and the same rule applies
to the table column and the PDF export. Receipts now show Payment + Amount,
nothing invented.

## Finding 2 — the 80,000 was never missing
JV-RCP-10-1511 exists, posted 2026-08-03: Dr 1020 M-Pesa 80,000 / Cr 1050
AR — B2B 80,000. It was row 21 of 21: posting_date has no time part, so
same-day entries kept CREATION order, putting the day's newest entry at the
BOTTOM of the day's block, below the scroll fold. Fixed by ordering on
(posting_date, created_at):
  · display: newest day first, newest entry first within the day — a 21:09
    receipt now tops the 03 Aug block
  · the Date column sort and all three exports use the same composite
  · running balance now accumulates in true accounting chronology
    (posting_date then created_at) instead of raw creation order, so a
    BACKDATED voucher lands on its accounting date in the running column
    instead of at the end of the walk

## Verified
DB: both receipt journals present, balanced, posted; 1020 cached balance
1,154,386 includes the 80,000 and matches the sum of postings.
Build: tsc -b and vite build pass on the full repo.
