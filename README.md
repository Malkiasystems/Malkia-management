# Bank statement reconciliation and charge posting

## Deploy order
1. Run `migrations/037_bank_statement_reconciliation.sql` **BEFORE** deploying the code.
2. Deploy `src/`.
3. Add a route to `src/pages/BankReconciliation.tsx`.

## What it does
Imports a bank or mobile money statement, walks the running balance to prove the
statement adds up, works out which printed service charges actually left the
account, and posts only the approved ones as a balanced journal.

## Verified against MalkiaOS (ebokhvibnypiomzqimfg) on 2026-08-03
- `journals.ref` is UNIQUE, so refs come from `seq_bank_charge_ref`
- `assert_journal_balanced` is DEFERRABLE; every journal posts 2+ balanced lines
- `assert_after_cutover` blocks `posting_date < ledger_cutover_date()`
- `accounts.balance` has no trigger and is updated inside the RPC transaction
- RLS is disabled on accounts/journals/journal_lines, so these tables match

## Tested (BEGIN/ROLLBACK against production)
- pre-cutover line rejected with a clear message
- one journal per entry date, debits = credits
- charges that were printed but not borne never post
- import status returns to `reviewed` while pending lines remain

## Files
- `src/lib/bankStatement/statementTypes.ts` types
- `src/lib/bankStatement/statementParse.ts` Mixx by Yas + generic CSV adapters
- `src/lib/bankStatement/statementReconcile.ts` pure reconciliation logic
- `src/lib/bankStatement/statementPost.ts` mutations
- `src/hooks/useBankStatements.ts` reads
- `src/pages/BankReconciliation.tsx` page, with GuideToggle and GuideTip

## Import paths
Written against `@/lib/supabase`, `@/components/GuideToggle`, `@/components/GuideTip`.
Adjust if MalkiaOS uses relative paths.
