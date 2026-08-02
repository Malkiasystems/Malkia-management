// ─── transferPrefill ───────────────────────────────────────────────────────
// Carries a one-shot prefill into Bank Transfer when a voucher is blocked for
// insufficient cash and the user taps "Fund this account".
//
// WHY THIS EXISTS
//   A block that only says "no" makes the user leave the screen, work out which
//   account was short, work out how much it needs, find the right voucher, and
//   fill it in from memory. Every one of those steps is a chance to fund the
//   wrong account or the wrong amount. The system already knows all of it at
//   the moment it refuses, so it should hand it over.
//
// Deliberately mirrors expensePrefill.ts: module-level, consumed once, then
// cleared, so a later manual Bank Transfer opens blank. This is navigation
// state, not persistent data, and it must not survive a page reload.
// ───────────────────────────────────────────────────────────────────────────

export interface TransferPrefill {
  /** Account that needs funding (the destination of the transfer). */
  toAccountId: string
  /** Suggested amount. See suggestFundingAmount for how this is derived. */
  amount?: number
  /** Pre-written narration explaining why the transfer is happening. */
  narration?: string
}

let pending: TransferPrefill | null = null

export function setTransferPrefill(p: TransferPrefill) { pending = p }

export function consumeTransferPrefill(): TransferPrefill | null {
  const p = pending
  pending = null
  return p
}

/**
 * How much to suggest transferring in.
 *
 * Covering only the shortfall would leave the account at exactly zero, so the
 * very next expense is blocked again. The suggestion therefore clears the
 * overdraft AND covers the payment being attempted, which is the amount that
 * actually lets the user finish what they were doing.
 *
 * Example: petty cash at -16,567 with a 4,900 expense pending suggests 21,467.
 *
 * It is only a default. The user can change it before posting.
 */
export function suggestFundingAmount(currentBalance: number, amountNeeded: number): number {
  const deficit = Math.max(0, -currentBalance)
  return Math.round((deficit + Math.max(0, amountNeeded)) * 100) / 100
}
