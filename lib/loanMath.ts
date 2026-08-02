// src/lib/loanMath.ts
//
// Loan calculations for the three ways money actually gets lent to Tanzanian
// SMEs. Pure functions, no React, no Supabase, so they can be unit tested.
//
//  1. REDUCING BALANCE ("amortizing", "EMI") — what CRDB, NMB, Equity and
//     every formal bank quotes. Interest each month is charged on what is
//     still outstanding, so the interest portion shrinks as you repay.
//
//  2. FLAT RATE — common with microfinance and SACCOS. Interest is computed
//     once on the ORIGINAL principal for the whole term and split evenly.
//     A "10% flat" loan is far more expensive than "10% reducing", because
//     you keep paying interest on money you have already given back. The
//     effective rate is usually close to double. effectiveRate() exists so a
//     tenant can see that before signing.
//
//  3. FIXED TOTAL REPAYABLE — the informal one. A friend lends 50,000,000
//     against an agreement to repay 60,000,000. No rate is ever stated. The
//     interest is simply total - principal, and we work the implied rates
//     backwards so it can be compared with a bank offer on equal terms.
//
// Currency is handled in whole shillings. TZS has no subunit in practice, and
// carrying cents would produce schedules that do not add back to the total.

export type InterestMethod = 'reducing_balance' | 'flat' | 'fixed_total'

export interface LoanTerms {
  principal: number
  /** Nominal ANNUAL rate percent. Ignored for 'fixed_total'. */
  annualRatePct?: number
  /** Number of repayment instalments. */
  periods: number
  /** Instalments per year: 12 monthly, 4 quarterly, 52 weekly. */
  periodsPerYear?: number
  method: InterestMethod
  /** Required for 'fixed_total': the agreed total repayable. */
  totalRepayable?: number
}

export interface ScheduleRow {
  period: number
  opening: number
  payment: number
  interest: number
  principal: number
  closing: number
}

export interface LoanSummary {
  instalment: number
  totalRepayableAmount: number
  totalInterest: number
  /** Nominal annual rate as quoted, for reference. */
  nominalRatePct: number
  /**
   * The reducing-balance rate that produces this same cash flow. This is the
   * number to compare offers with: a 10% flat loan and an 18% reducing loan
   * cost about the same, and nothing else on the screen makes that visible.
   */
  effectiveAnnualRatePct: number
  schedule: ScheduleRow[]
}

const round = (n: number) => Math.round(n)

/**
 * Instalment for a reducing-balance loan.
 *   A = P·r·(1+r)^n / ((1+r)^n − 1)
 * where r is the rate per period. Falls back to straight division at 0%,
 * because the formula divides by zero there.
 */
export function reducingBalancePayment(principal: number, ratePerPeriod: number, periods: number): number {
  if (periods <= 0) return 0
  if (ratePerPeriod <= 0) return principal / periods
  const f = Math.pow(1 + ratePerPeriod, periods)
  return (principal * ratePerPeriod * f) / (f - 1)
}

/**
 * The reducing-balance rate per period implied by borrowing `principal` and
 * repaying `payment` for `periods`. Solved by bisection rather than Newton:
 * the function is monotonic over the bracket, bisection cannot diverge, and
 * 200 iterations is instant at this size. Simplest algorithm that is correct.
 *
 * Returns 0 when the cash flow implies no interest or worse.
 */
export function impliedRatePerPeriod(principal: number, payment: number, periods: number): number {
  if (principal <= 0 || payment <= 0 || periods <= 0) return 0
  if (payment * periods <= principal) return 0 // no interest being charged
  let lo = 0
  let hi = 1 // 100% per period, far above anything real
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const guess = reducingBalancePayment(principal, mid, periods)
    if (guess > payment) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/**
 * Build the full picture for a set of loan terms.
 *
 * The schedule always amortizes against the ACTUAL outstanding balance, even
 * for flat and fixed-total loans. That is deliberate: whatever the lender
 * called it, the accounting entry each period is Dr Loan Payable (principal)
 * + Dr Interest Expense (interest) / Cr Bank, and the split has to reflect
 * what is genuinely still owed. Splitting a flat loan evenly would understate
 * the liability early in the term and overstate it late.
 *
 * The final row absorbs any rounding so the schedule sums exactly to the total
 * repayable and the closing balance lands on zero, not on 3 shillings.
 */
export function computeLoan(terms: LoanTerms): LoanSummary {
  const ppy = terms.periodsPerYear ?? 12
  const n = Math.max(0, Math.floor(terms.periods))
  const P = Math.max(0, terms.principal)

  if (n === 0 || P === 0) {
    return {
      instalment: 0, totalRepayableAmount: 0, totalInterest: 0,
      nominalRatePct: terms.annualRatePct ?? 0, effectiveAnnualRatePct: 0, schedule: [],
    }
  }

  let instalment: number
  let totalRepayable: number
  let nominalRatePct = terms.annualRatePct ?? 0

  if (terms.method === 'reducing_balance') {
    const r = (terms.annualRatePct ?? 0) / 100 / ppy
    instalment = reducingBalancePayment(P, r, n)
    totalRepayable = instalment * n
  } else if (terms.method === 'flat') {
    // Interest on the ORIGINAL principal for the whole term, then split evenly.
    const years = n / ppy
    const interest = P * ((terms.annualRatePct ?? 0) / 100) * years
    totalRepayable = P + interest
    instalment = totalRepayable / n
  } else {
    // fixed_total: the agreed figure is the input; the rate is derived.
    totalRepayable = Math.max(P, terms.totalRepayable ?? P)
    instalment = totalRepayable / n
    const years = n / ppy
    const interest = totalRepayable - P
    // Quote it back as the equivalent FLAT rate, which is how an informal
    // lender would describe it if they described it at all.
    nominalRatePct = years > 0 && P > 0 ? (interest / P) / years * 100 : 0
  }

  const effPerPeriod = impliedRatePerPeriod(P, instalment, n)
  const effectiveAnnualRatePct = effPerPeriod * ppy * 100

  // Amortize against the real outstanding balance using the effective rate.
  //
  // The final row absorbs ALL rounding drift on both axes at once:
  //   - its principal is whatever is left of P, so principal sums to exactly P
  //     and the closing balance lands on 0, not on 3 shillings
  //   - its payment is whatever is left of the target total, so the schedule
  //     sums to exactly the agreed figure
  // The second part matters most for 'fixed_total'. If a tenant agreed to
  // repay 60,000,000 and the schedule adds up to 60,000,002, the number they
  // shook hands on is not the number in their books. Interest on the last row
  // is then the remainder, which is where the rounding genuinely belongs.
  const targetTotal = round(totalRepayable)
  const schedule: ScheduleRow[] = []
  let opening = P
  let principalPaid = 0
  let paidSoFar = 0
  for (let i = 1; i <= n; i++) {
    const isLast = i === n
    let interest = round(opening * effPerPeriod)
    let payment = round(instalment)
    let principalPortion = payment - interest

    if (isLast) {
      principalPortion = P - principalPaid
      payment = targetTotal - paidSoFar
      interest = payment - principalPortion
    }

    const closing = Math.max(0, opening - principalPortion)
    schedule.push({
      period: i,
      opening: round(opening),
      payment: round(payment),
      interest: round(interest),
      principal: round(principalPortion),
      closing: round(closing),
    })
    principalPaid += principalPortion
    paidSoFar += payment
    opening = closing
  }

  const totalPaid = schedule.reduce((s, r) => s + r.payment, 0)
  const totalInterest = totalPaid - P

  return {
    instalment: round(instalment),
    totalRepayableAmount: round(totalPaid),
    totalInterest: round(totalInterest),
    nominalRatePct,
    effectiveAnnualRatePct,
    schedule,
  }
}
