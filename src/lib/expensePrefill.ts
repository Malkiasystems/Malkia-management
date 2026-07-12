// ─── expensePrefill ────────────────────────────────────────────────────────
// Carries a one-shot prefill into the New Expense form when a recurring
// expense's "Pay now" is tapped. Module-level, consumed once, then cleared —
// so a later manual "New Expense" opens blank. Kept deliberately tiny; this is
// navigation state, not persistent data.
// ───────────────────────────────────────────────────────────────────────────

export interface ExpensePrefill {
  expenseAccountId?: string
  amount?: number
  payTo?: string
  supplierId?: string | null
  narration?: string
}

let pending: ExpensePrefill | null = null

export function setExpensePrefill(p: ExpensePrefill) { pending = p }

export function consumeExpensePrefill(): ExpensePrefill | null {
  const p = pending
  pending = null
  return p
}
