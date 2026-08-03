// ─── salesRegisterTab ──────────────────────────────────────────────────────
// Lets the sidebar's Sales shortcuts open the Sales Register on a specific tab
// (Reports = transactions, Targets), and lets the register itself remember the
// last tab across a browser refresh.
//
// Same two delivery paths as expenseRegisterTab (see that file's notes):
//   • cross-page: `pending` is consumed once on mount.
//   • same-page:  a window event switches the already-mounted register.
// Plus localStorage so a refresh lands back on the tab you were on.
// ───────────────────────────────────────────────────────────────────────────

export type SalesRegisterTab =
  | 'transactions' | 'products' | 'customers' | 'salespeople'
  | 'bundles' | 'compare' | 'targets'

const EVT = 'malkia:sales-register-tab'
const LS_KEY = 'malkia.salesRegisterTab'
const VALID: SalesRegisterTab[] = ['transactions', 'products', 'customers', 'salespeople', 'bundles', 'compare', 'targets']

let pending: SalesRegisterTab | null = null

export function requestSalesRegisterTab(t: SalesRegisterTab) {
  pending = t
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: t })) } catch { /* no window */ }
}

/** Initial tab: explicit request wins, then the refresh-persisted tab. */
export function consumeSalesRegisterTab(): SalesRegisterTab | null {
  const t = pending
  pending = null
  if (t) return t
  try {
    const stored = localStorage.getItem(LS_KEY) as SalesRegisterTab | null
    if (stored && VALID.includes(stored)) return stored
  } catch { /* private mode */ }
  return null
}

/** Persist the current tab so a browser refresh returns to it. */
export function rememberSalesRegisterTab(t: SalesRegisterTab) {
  try { localStorage.setItem(LS_KEY, t) } catch { /* private mode */ }
}

export function subscribeSalesRegisterTab(cb: (t: SalesRegisterTab) => void): () => void {
  // `pending` is deliberately NOT cleared here — see expenseRegisterTab.ts.
  const handler = (e: Event) => cb((e as CustomEvent).detail as SalesRegisterTab)
  if (typeof window !== 'undefined') window.addEventListener(EVT, handler)
  return () => { if (typeof window !== 'undefined') window.removeEventListener(EVT, handler) }
}
