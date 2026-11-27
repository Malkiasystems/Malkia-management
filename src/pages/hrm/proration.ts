// ─── proration ──────────────────────────────────────────────────────────────
// Part-month pay (22 Nov 2026, Joe). Payroll used to pay the full monthly
// salary to someone who joined on the 25th, and to someone on approved unpaid
// leave. Now the salary is scaled to the days it is actually owed for.
//
// THE RULE, deliberately simple and the same for everyone:
//   pay = monthly salary x (paid days / calendar days in the month)
//   paid days = days employed in the month - days of approved UNPAID leave
// Calendar days are used throughout (weekends count on both sides), so a full
// month is always exactly the full salary. A company that divides by 26 or 30
// instead can type its own figure in the Gross box; a typed figure is kept.
// Leave types paid at half pay or "split" are NOT reduced here.
// Pure functions: no database access.
// ────────────────────────────────────────────────────────────────────────────

export interface Proration { paidDays: number; monthDays: number; factor: number; note: string | null; inMonth: boolean }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const day = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00Z')
const daysBetween = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86400000) + 1
const nice = (s: string) => day(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function monthBounds(period: string): { start: string; end: string; days: number } {
  const [y, m] = period.split('-').map(Number)
  const start = iso(new Date(Date.UTC(y, m - 1, 1))), end = iso(new Date(Date.UTC(y, m, 0)))
  return { start, end, days: daysBetween(start, end) }
}

/** leave = approved unpaid leave ranges for this employee (any dates; clipped here). */
export function prorate(period: string, startDate: string | null | undefined, endDate: string | null | undefined, leave: { start: string; end: string }[] = []): Proration {
  const mb = monthBounds(period)
  const s = startDate ? startDate.slice(0, 10) : null, e = endDate ? endDate.slice(0, 10) : null
  if (s && s > mb.end) return { paidDays: 0, monthDays: mb.days, factor: 0, note: `Starts ${nice(s)}`, inMonth: false }
  // The roster contains active staff only. Flag an overdue renewal and keep
  // applying approved unpaid leave while HR checks the contract record.
  const overdue = !!e && e < mb.start
  const from = s && s > mb.start ? s : mb.start
  const to = e && !overdue && e < mb.end ? e : mb.end
  const employed = daysBetween(from, to)
  // Unpaid leave days inside the employed window, each calendar day counted once.
  const off = new Set<string>()
  for (const l of leave) {
    const a = l.start.slice(0, 10) > from ? l.start.slice(0, 10) : from
    const b = l.end.slice(0, 10) < to ? l.end.slice(0, 10) : to
    for (let d = day(a); a <= b && iso(d) <= b; d = new Date(d.getTime() + 86400000)) off.add(iso(d))
  }
  const paidDays = Math.max(0, employed - off.size)
  const why: string[] = []
  if (overdue) why.push('active with expired contract — review before posting')
  if (from !== mb.start) why.push(`joined ${nice(from)}`)
  if (to !== mb.end) why.push(`left ${nice(to)}`)
  if (off.size > 0) why.push(`${off.size} day${off.size === 1 ? '' : 's'} unpaid leave`)
  return {
    paidDays, monthDays: mb.days, factor: paidDays / mb.days, inMonth: true,
    note: why.length ? `Paid for ${paidDays} of ${mb.days} days (${why.join(', ')})` : null,
  }
}

export const proratedGross = (monthly: number, p: Proration) => p.factor >= 1 ? monthly : Math.round(monthly * p.factor)
