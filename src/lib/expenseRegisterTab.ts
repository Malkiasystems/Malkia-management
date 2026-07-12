// ─── expenseRegisterTab ────────────────────────────────────────────────────
// Lets the sidebar's Expenses shortcuts open the expense register on a specific
// tab (Budget, Recurring, Transactions).
//
// Two delivery paths, because navigating to the page you're already on does NOT
// remount the register:
//   • cross-page: `pending` is read once on mount (consume).
//   • same-page:  a window event tells the already-mounted register to switch.
// A request sets both, so it works either way.
// ───────────────────────────────────────────────────────────────────────────

export type ExpenseRegisterTab = 'transactions' | 'budget' | 'vendors' | 'recurring'

const EVT = 'malkia:expense-register-tab'
let pending: ExpenseRegisterTab | null = null

/** Ask the register to open on a tab. Sets the mount value AND fires the event. */
export function requestExpenseRegisterTab(t: ExpenseRegisterTab) {
  pending = t
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: t })) } catch { /* SSR/no window */ }
}

/** Read + clear the pending tab (used by the register's initial state). */
export function consumeExpenseRegisterTab(): ExpenseRegisterTab | null {
  const t = pending
  pending = null
  return t
}

/** Subscribe to same-page tab requests. Returns an unsubscribe fn. */
export function subscribeExpenseRegisterTab(cb: (t: ExpenseRegisterTab) => void): () => void {
  const handler = (e: Event) => {
    pending = null // handled live; don't let it linger for a later mount
    cb((e as CustomEvent).detail as ExpenseRegisterTab)
  }
  if (typeof window !== 'undefined') window.addEventListener(EVT, handler)
  return () => { if (typeof window !== 'undefined') window.removeEventListener(EVT, handler) }
}
