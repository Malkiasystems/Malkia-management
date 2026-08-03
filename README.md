# Bank Reconciliation — rebuilt against the live repo

## Deploy
Migration 037 is ALREADY APPLIED to MalkiaOS (ebokhvibnypiomzqimfg) via MCP,
tested with a rolled-back smoke test (balanced journal, cache updated through
update_account_balance, cutover rejection working). Nothing to run.
Drag these files into the repo (they overwrite) and deploy. Done.

## Files
NEW
  src/lib/bankStatement/statementTypes.ts      types
  src/lib/bankStatement/statementParse.ts      Mixx by Yas + CSV adapters,
                                               auto-reads OPENING/CLOSING from a pasted header
  src/lib/bankStatement/statementReconcile.ts  pure logic: balance-chain check,
                                               borne-vs-printed charge test, cutover awareness
  src/lib/bankStatement/statementPost.ts       mutations (RPC + import save)
  src/hooks/useBankStatements.ts               reads
  src/pages/BankReconciliation.tsx             page (house dark theme, GuideMode,
                                               Toast, MoneyInput, tzs, usePermission)
EDITED (must ship together)
  src/App.tsx              lazy import + case 'bank-recon'
  src/lib/types.ts         Page union + 'bank-recon'
  src/components/Sidebar.tsx  Accounts section: "Bank Recon" entry
  src/lib/pageDirectory.ts    search terms + icon
  migrations/037_bank_statement_reconciliation.sql  replaced with the applied version

## Fixed from the previous drop (which could not have worked)
1. `@/` imports — the repo has no path alias; everything is relative now.
2. GuideToggle/GuideTip — imported from components/GuideMode with the real
   no-props API, instead of two components that do not exist.
3. Tailwind classes — the repo has no Tailwind; the page now uses the house
   CSS variables and inline-style tokens like every other page.
4. Cutover — read via lib/ledgerCutover (cached, system_settings-backed)
   instead of a bespoke RPC round-trip.
5. Money formatting via tzs(), amounts entered via MoneyInput, results via
   Toast, posting gated by usePermission('accounting.edit').
6. Page reachable: Sidebar > Accounts > Bank Recon (previously orphaned).

## Verified
- `tsc -b` and `vite build` pass on the full repo with these files in place.
- Reconciler regression on the real Mixx statement: 13 rows, gap 101,440 on
  row 5, borne charges 11,305 (6,765 postable, 4,540 pre-cutover), 4,200
  printed-but-not-ours correctly excluded.
- RPC smoke test on production (rolled back): BCHG journal balanced,
  6512 +1,500 / 1021 −1,500 through update_account_balance, import → posted.

## Accounting note
CashPayment and expense vouchers credit the paying account with the amount
typed; the carrier's charge is never captured. These charge journals are the
MISSING entries, not duplicates — no contra account needed for normal use.
