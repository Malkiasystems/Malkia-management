// ════════════════════════════════════════════════════════════════════════════
// salespersonCode.ts
//
// Short salesperson codes for invoice printouts, per the house rule:
//
//   Default: first initial + last initial.       Joseph Gembe  -> JG
//   Collision: the LATER person (by EMP code, so seniority of registration
//   decides who keeps the short code) takes the first TWO letters of their
//   first name, a dot, then the last-name initial.
//                                                Mary Kimario  -> MK
//                                                Musa Koma     -> MU.K
//   Still colliding (e.g. Musa Koma vs Mustafa Kondo, both MU.K): the
//   first-name prefix grows a letter at a time (MUS.K) until unique. Two
//   literally identical names fall back to a numeric suffix (MK2) — at that
//   point no initial scheme on earth can tell them apart.
//
// Codes are deterministic: the roster is sorted by emp_code (numeric-aware)
// then name before assignment, so the same roster always yields the same
// codes, on screen, on PDF, and on a reprint next year.
// ════════════════════════════════════════════════════════════════════════════

export interface SalespersonLite {
  id?: string
  full_name: string
  emp_code?: string | null
}

const norm = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

function baseCode(fullName: string): { first: string; last: string; base: string } {
  const tokens = fullName.trim().split(/\s+/)
  const first = tokens[0] || ''
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : first
  const base = tokens.length > 1
    ? (first[0] + last[0]).toUpperCase()
    // Single-word name: first two letters, same spirit as the collision rule.
    : first.slice(0, 2).toUpperCase()
  return { first, last, base }
}

/**
 * Assign a unique code to every person on the roster.
 * Returns a Map keyed by normalised full name.
 */
export function buildSalespersonCodes(people: SalespersonLite[]): Map<string, string> {
  const sorted = [...people].sort((a, b) =>
    (a.emp_code || '\uffff').localeCompare(b.emp_code || '\uffff', undefined, { numeric: true }) ||
    a.full_name.localeCompare(b.full_name))

  const taken = new Set<string>()
  const out = new Map<string, string>()

  for (const p of sorted) {
    const key = norm(p.full_name)
    if (out.has(key)) continue // same person listed twice
    const { first, last, base } = baseCode(p.full_name)

    let code = base
    if (taken.has(code)) {
      // Collision rule: grow the FIRST-name prefix, dot, last initial.
      let assigned = ''
      for (let n = 2; n <= first.length; n++) {
        const candidate = `${first.slice(0, n).toUpperCase()}.${(last[0] || '').toUpperCase()}`
        if (!taken.has(candidate)) { assigned = candidate; break }
      }
      if (!assigned) {
        // Identical or prefix-exhausted names: numeric suffix, last resort.
        let i = 2
        while (taken.has(`${base}${i}`)) i++
        assigned = `${base}${i}`
      }
      code = assigned
    }
    taken.add(code)
    out.set(key, code)
  }
  return out
}

/** Code for one person given the full roster (roster drives collisions). */
export function salespersonCodeFor(roster: SalespersonLite[], fullName: string): string {
  if (!fullName?.trim()) return ''
  const codes = buildSalespersonCodes(
    // The person must be in the collision set even if the roster misses them
    // (e.g. a name typed free-hand before HRM had the employee).
    roster.some(r => norm(r.full_name) === norm(fullName))
      ? roster
      : [...roster, { full_name: fullName }]
  )
  return codes.get(norm(fullName)) || ''
}
