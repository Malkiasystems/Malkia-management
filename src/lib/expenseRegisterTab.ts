// ─── expenseRegisterTab ────────────────────────────────────────────────────
// One-shot: lets the sidebar's Expenses shortcut open the expense register on
// a specific tab (Budget, Recurring). Consumed once on mount, then cleared, so
// a later plain navigation to the register opens on Transactions as usual.
// ───────────────────────────────────────────────────────────────────────────

export type ExpenseRegisterTab = 'transactions' | 'budget' | 'vendors' | 'recurring'

let pending: ExpenseRegisterTab | null = null

export function setExpenseRegisterTab(t: ExpenseRegisterTab) { pending = t }

export function consumeExpenseRegisterTab(): ExpenseRegisterTab | null {
  const t = pending
  pending = null
  return t
}
