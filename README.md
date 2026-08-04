# Banks + Posted Vouchers — cumulative build

## Deploy
Three files, full replacements, ship together. No migration.
SUPERSEDES every earlier zip in this series. Contains everything to date:
  Banks.tsx            maximize · sortable columns · Export PDF/Excel/CSV ·
                       (posting_date, created_at) ordering + true-chronology
                       running balance · hover tooltip on shortened
                       descriptions, full wrapped text in maximized view
  PostedVouchers.tsx   VAT shows stored vat_amount only (no more delivery or
                       full amounts masquerading as VAT); zero rows hidden
  bankStatementExport.ts  export lib (fixes backwards running balance in the
                       old CSV)

## This change
Description column: hovering a shortened description shows the complete text
(native tooltip). In the maximized ledger the cell wraps instead of
truncating, so the whole description is visible without hovering.

## Verified
tsc -b and vite build pass on the full repo.
