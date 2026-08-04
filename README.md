# Banks page — full-screen ledger (Maximize)

## Deploy
One file: src/pages/Banks.tsx (full replacement). No migration. Nothing else
changes, and no existing function was removed or disabled — the normal layout,
reconcile panel, export, edit modal and permissions all behave exactly as before.

## What it does
- "Maximize" appears in two places: under Current Balance in the account
  header, and beside Export on the statement card.
- Maximized mode lifts the SAME detail panel into a fixed overlay covering the
  whole viewport (sidebar and topbar included). The tall account header
  collapses to a one-line bar (icon · name · GL/AC · balance · Exit), and the
  statement card flexes to fill everything below the date bar.
- The table body scrolls inside the card with the column headers stuck to the
  top — the sticky thead already existed in global CSS; it just never had a
  bounded scroll container on this page until now.
- Exit via the bar button, the Restore button on the card, or Esc.
- Date presets, Load, Reconcile, and Export all keep working while maximized.
- The Edit modal (z 1000) still layers above the overlay (z 900) if opened.

## Verified
tsc -b and vite build pass on the full repo with this file in place.
