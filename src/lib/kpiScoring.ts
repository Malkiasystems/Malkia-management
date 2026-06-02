/**
 * KPI Scorecard scoring engine (pure, no I/O).
 * Mirrors the exact math used in the Malkia PRP spreadsheets:
 *   - attainment (actual/target, or target/actual for "lower is better"), capped
 *   - KRA score = average of its KPI attainments
 *   - overall   = sum of (KRA weight x KRA score)
 *   - rating    = 1-5 band
 *   - PRP       = pool split by KRA weight, paid by KRA score
 *   - sales gate: if the named Sales KRA scores below the gate, final PRP = 0
 */

export type Direction = 'H' | 'L'

export interface ScoringLine {
  kra: string
  kra_weight: number      // fraction, e.g. 0.45
  kpi: string
  direction: Direction
  target: number | null
  actual: number | null   // use the final actual (admin) or self_actual for previews
}

export interface KraResult {
  kra: string
  weight: number
  score: number | null    // fraction (0..cap), null if no scorable KPIs
  weighted: number        // weight * score (0 if score null)
  slice: number           // pool * weight
  payout: number          // slice * score
}

export interface ScorecardResult {
  kras: KraResult[]
  overall: number         // 0..cap
  rating: string
  grossPrp: number
  gatePass: boolean
  finalPrp: number
  weightTotal: number
}

/** Single KPI attainment, capped. Returns null if not scorable. */
export function attainment(direction: Direction, target: number | null, actual: number | null, cap: number): number | null {
  if (target === null || target === undefined || actual === null || actual === undefined) return null
  if (direction === 'H') {
    if (target === 0) return null
    return Math.min(cap, actual / target)
  }
  // direction 'L' (lower is better)
  if (actual === 0) return cap          // zero of a bad thing = perfect (capped)
  return Math.min(cap, target / actual)
}

export function ratingLabel(score: number | null): string {
  if (score === null || score === undefined) return '—'
  if (score >= 1.0) return '5 - Outstanding'
  if (score >= 0.90) return '4 - Strong'
  if (score >= 0.75) return '3 - On track'
  if (score >= 0.60) return '2 - Needs improvement'
  return '1 - Underperforming'
}

export interface ScoreOptions {
  pool: number
  cap: number
  salesGate: number       // 0 = off
  salesKra: string | null // name of the KRA the gate measures
}

export function computeScorecard(lines: ScoringLine[], opts: ScoreOptions): ScorecardResult {
  const cap = opts.cap && opts.cap >= 1 ? opts.cap : 1
  // group lines by KRA, preserving first-seen order
  const order: string[] = []
  const groups = new Map<string, ScoringLine[]>()
  for (const l of lines) {
    if (!groups.has(l.kra)) { groups.set(l.kra, []); order.push(l.kra) }
    groups.get(l.kra)!.push(l)
  }

  const kras: KraResult[] = []
  let overall = 0
  let weightTotal = 0
  let grossPrp = 0

  for (const name of order) {
    const ls = groups.get(name)!
    const weight = ls[0]?.kra_weight ?? 0
    const atts = ls.map(l => attainment(l.direction, l.target, l.actual, cap)).filter((v): v is number => v !== null)
    const score = atts.length ? atts.reduce((a, b) => a + b, 0) / atts.length : null
    const weighted = score === null ? 0 : weight * score
    const slice = opts.pool * weight
    const payout = score === null ? 0 : slice * score
    kras.push({ kra: name, weight, score, weighted, slice, payout })
    weightTotal += weight
    if (score !== null) { overall += weighted; grossPrp += payout }
  }

  // sales gate
  let gatePass = true
  if (opts.salesGate && opts.salesGate > 0) {
    const target = opts.salesKra
      ? kras.find(k => k.kra === opts.salesKra)
      : kras.find(k => /sales/i.test(k.kra))
    const sScore = target?.score ?? null
    gatePass = sScore !== null && sScore >= opts.salesGate
  }

  return {
    kras,
    overall,
    rating: ratingLabel(overall),
    grossPrp,
    gatePass,
    finalPrp: gatePass ? grossPrp : 0,
    weightTotal,
  }
}
