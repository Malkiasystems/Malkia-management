// ════════════════════════════════════════════════════════════════════════════
// statementReconcile.ts
//
// Pure reconciliation logic. No I/O, no Supabase, no React — deterministic, so
// it can be tested against a known statement.
//
// Two questions per row:
//   1. Does the running balance the statement prints agree with the entries it
//      prints? A disagreement means the statement is hiding a movement.
//   2. Did a printed service charge actually leave this account, or is it the
//      other side's charge shown for information? Only borne charges may post.
//
// The second question is the whole point. On Tigo receive rows the charge is
// printed but the balance moves by the full amount — that charge belongs to
// the sender, and posting it would fabricate an expense.
// ════════════════════════════════════════════════════════════════════════════

import type { ParsedRow, ReconciledRow, RowFlag, StatementSummary } from './statementTypes'
import { round2 } from './statementParse'

/** Money is compared to the cent, never with ===. */
const TOL = 0.01
const near = (a: number, b: number) => Math.abs(a - b) <= TOL

/**
 * Did a printed charge actually come out of this account?
 *
 * Outgoing: money-out already includes the charge, so
 * moneyOut === gross + charge proves we bore it.
 *
 * Incoming: money-in === gross means the full amount arrived and the printed
 * charge never touched us. Only money-in === gross − charge proves we bore it.
 */
export function isChargeBorne(row: ParsedRow): boolean {
  if (row.printedCharge <= 0) return false
  if (row.direction === 'out') return near(row.moneyOut, row.grossAmount + row.printedCharge)
  return near(row.moneyIn, row.grossAmount - row.printedCharge)
}

function looksMalformedMsisdn(party: string | null): boolean {
  if (!party) return false
  if (!/^\d+$/.test(party)) return false
  // A Tanzanian MSISDN is 255 + 9 digits = 12. Short wallet ids (5–8 digits)
  // and bank shortcodes such as 2556000002 (10 digits) are legitimate, so only
  // flag a near miss of 11 or 13 — what a lost or doubled digit actually
  // looks like in an export.
  if (!party.startsWith('255')) return false
  return party.length === 11 || party.length === 13
}

/**
 * Walk the statement and compare our arithmetic against the bank's own
 * running balance. The chain deliberately continues from the bank's stated
 * balance rather than our computed one, so one hidden movement produces
 * exactly one flagged row instead of poisoning every row after it.
 */
export function reconcile(
  rows: ParsedRow[],
  statedOpening: number,
  cutoverDate: string | null
): ReconciledRow[] {
  let previous = statedOpening

  return rows.map(row => {
    const computedBalance = round2(previous + row.moneyIn - row.moneyOut)
    const balanceBreak =
      row.statedBalance == null ? 0 : round2(row.statedBalance - computedBalance)

    const chargeBorne = isChargeBorne(row)
    const beforeCutover = cutoverDate != null && row.entryDate < cutoverDate

    const flags: RowFlag[] = []
    if (!near(balanceBreak, 0)) flags.push('balance_break')
    if (row.printedCharge > 0) flags.push(chargeBorne ? 'charge_borne' : 'charge_not_borne')
    if (beforeCutover && chargeBorne) flags.push('before_cutover')
    if (looksMalformedMsisdn(row.counterparty)) flags.push('malformed_msisdn')

    previous = row.statedBalance ?? computedBalance

    return { ...row, computedBalance, balanceBreak, chargeBorne, beforeCutover, flags }
  })
}

export function summarise(
  rows: ReconciledRow[],
  statedOpening: number,
  statedClosing: number
): StatementSummary {
  const parsedMoneyIn = round2(rows.reduce((s, r) => s + r.moneyIn, 0))
  const parsedMoneyOut = round2(rows.reduce((s, r) => s + r.moneyOut, 0))
  const computedClosing = round2(statedOpening + parsedMoneyIn - parsedMoneyOut)

  return {
    statedOpening,
    statedClosing,
    parsedMoneyIn,
    parsedMoneyOut,
    computedClosing,
    balanceGap: round2(statedClosing - computedClosing),
    printedCharges: round2(rows.reduce((s, r) => s + r.printedCharge, 0)),
    borneCharges: round2(rows.reduce((s, r) => s + (r.chargeBorne ? r.printedCharge : 0), 0)),
    rowsWithBreaks: rows.filter(r => r.flags.includes('balance_break')).length,
  }
}

/**
 * A statement is only clean when it reconciles to itself. A parser silently
 * reading zeros produces a gap, so this is also the guard that stops a bad
 * extraction reaching the ledger unnoticed.
 */
export function isSafeToPost(summary: StatementSummary): boolean {
  return Math.abs(summary.balanceGap) <= TOL && summary.rowsWithBreaks === 0
}

export function describeBreak(row: ReconciledRow): string {
  if (!row.flags.includes('balance_break')) return ''
  const dir = row.balanceBreak > 0 ? 'higher' : 'lower'
  return `Balance is ${Math.abs(row.balanceBreak).toLocaleString()} ${dir} than the entries explain. An entry is missing from the statement here.`
}
