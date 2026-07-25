# MW-DB-23 — ImportOrder void path fix

## Files

| Path | New/Edited |
|---|---|
| `src/lib/migrations/036_import_order_void.sql` | NEW |
| `src/lib/importOrderVoid.ts` | NEW |
| `src/pages/vouchers/ImportOrder.tsx` | EDITED |

## Deploy order

1. **Run migration `036_import_order_void.sql` FIRST**, before the code deploy.
   It is additive (CREATE OR REPLACE FUNCTION + GRANT). It touches no data and is
   safe to run more than once.
   *Already applied to `ebokhvibnypiomzqimfg` on 25 July as `036_import_order_void`.
   The file is included so the repo and the database agree.*
2. Deploy the two TypeScript files.

Deploying the code without the migration breaks the void button (the RPC will not
exist). Running the migration without the code changes nothing.

## What changed in ImportOrder.tsx

Only the payment-reversal block inside the Level 2 void handler, plus one import.
Nothing else in the file was touched. No existing function was removed or disabled.

- Reversal now goes through `reverseImportPayments()` → `void_import_payment` RPC,
  one transaction per payment.
- Partial failure halts before the order is voided, and reports which payments were
  reversed and which failed.
- Payment `notes` are now appended to, not overwritten, and only for the payment row
  being stamped rather than every row on the order.

## Follow-up this does not fix

- `ImportOrder.tsx` is 1,082 lines and still mixes UI, state, posting, stock and
  average-cost logic. Recommended split: `importOrderPost.ts` (payments, receives,
  landed-cost adjustments), `importOrderTypes.ts`, `useImportOrders.ts` (reads).
  This bundle deliberately does not attempt that; it is a behaviour fix, not a refactor.
- MW-DB-24: `suppliers.balance_tzs` read-modify-write still present at lines 187, 192
  and in `PurchaseInvoice.tsx`.
- MW-DB-25: the three direct `journals` inserts still bypass `insertJournalWithRetry`.
- MW-DB-26: import orders still write no `vouchers` rows.
