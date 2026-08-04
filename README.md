# Banks page — sortable statement columns

## Deploy
One file: src/pages/Banks.tsx (full replacement). No migration.
SUPERSEDES the banks_maximize.zip file — this build contains BOTH the
maximize feature and column sorting. Deploy this one.

## What it does
Every column header on the account statement is clickable:
- Click → sort ascending. Click again → descending. Third click → clear.
- Shift+click → stack a secondary sort (1/2/3 priority badges on headers).
- Active column shows an arrow and priority badge, same affordance as the
  Customers list (shared lib/useTableSort hook, not a new copy of the logic).
- Sort choice persists per user in localStorage (malkia.banks.ledger.sort).
- Money In / Money Out sort as numbers; empty cells always sink to the bottom
  in either direction. Type sorts by its display label.
- Works identically in normal and maximized view.

## Accounting honesty
Sorting never falsifies the Balance column — each row's value is that entry's
balance AFTER it posted, true in any order. It just stops "running" visually,
so while any sort is active the card subtitle says: "sorted — Balance shows
each entry's balance after posting."

CSV Export stays chronological regardless of on-screen sort. A bank statement
export is an accounting document; date order is the correct order for it.

## Verified
tsc -b and vite build pass on the full repo with this file in place.
