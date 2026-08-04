export const tzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString()

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export const genRef = (prefix: string, num: number) =>
  `${prefix}-${String(num).padStart(4, '0')}`

// Format a Date as YYYY-MM-DD in LOCAL time. Never use toISOString() for
// calendar dates: it converts to UTC first, and Tanzania is UTC+3, so local
// midnight on the 1st becomes 21:00 on the 30th of the PREVIOUS month.
export const localIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Local calendar date. The previous toISOString version returned YESTERDAY for
// anyone posting between midnight and 03:00 EAT, so a late-night cash sale was
// dated to the day before and landed in the wrong day-close.
export const today = () => localIso(new Date())

export const getStatus = (qty: number, reorder: number): 'critical' | 'low' | 'ok' => {
  if (qty === 0) return 'critical'
  if (qty <= reorder) return qty <= reorder * 0.5 ? 'critical' : 'low'
  return 'ok'
}

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// Current user, set by useAuth on every auth state change.
//
// This used to fall back to the literal string 'Joe Gembe' when the global was
// missing, which is the worst possible default for a field that ends up on
// journals.posted_by: an entry made by anyone during a load race, a stale tab,
// or a failed session refresh gets permanently stamped with the CEO's name and
// there is no way to tell those apart from real ones afterwards. 'Unknown' is
// honest, sorts to the top of any audit query, and is obviously wrong on sight.
export const getPostedBy = (): string => {
  try {
    const user = (window as any).__malkiaUser
    return user?.name || 'Unknown'
  } catch {
    return 'Unknown'
  }
}
