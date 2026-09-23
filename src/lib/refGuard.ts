// ════════════════════════════════════════════════════════════════════════════
// refGuard.ts — intelligent duplicate-reference guard for receipts.
//
// Three layers, mirroring migration_receipt_ref_guard.sql exactly:
//   1. Exact duplicate (fingerprint match on the same deposit account):
//      always DENY. The DB unique index enforces it too; this pre-check just
//      makes the message friendly instead of a constraint error.
//   2. Fraud signature: similar reference (edit distance <= 2) AND amount
//      within 1% AND within 60 days on the same account: DENY, overridable
//      by a super admin with a mandatory reason (audited).
//   3. Format profile: each bank account learns the SHAPES of its references
//      (letters -> A, digits -> 9, other characters kept literally). A bank
//      can and normally does hold SEVERAL shapes (2-3 formats per bank);
//      the profile is a set, never a single pattern. Once an account has
//      MIN_SAMPLES posted references, a reference matching none of its
//      shapes WARNS (or DENIES if the account is set strict). Petty cash /
//      cash-in-hand accounts (no_external_ref) skip everything.
//
// Why not a plain similarity threshold: consecutive M-Pesa codes differ by
// one or two characters BY DESIGN. Similarity alone would block legitimate
// receipts daily; similarity + same amount + near date is what a reused
// slip actually looks like.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export const REF_GUARD = {
  EDIT_DISTANCE_MAX: 2,     // fingerprints within this are "similar"
  MIN_FP_LENGTH: 6,         // shorter refs are too collision-prone to judge
  AMOUNT_TOLERANCE: 0.01,   // 1%
  WINDOW_DAYS: 60,
  MIN_SAMPLES: 20,          // shapes activate after this many posted refs
  CANDIDATE_LIMIT: 300,
}

// ── Normalisation, mirroring SQL ref_fingerprint() ──────────────────────────
export function refFingerprint(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1')
}

/** Shape of a reference: letters -> A, digits -> 9, everything else kept.
 *  'FT26123ABC45' -> 'AA99999AAA99'; 'SFH8K2M9Q1' -> 'AAA9A9A9A9'. */
export function refShape(raw: string): string {
  return raw.trim().toUpperCase()
    .replace(/[A-Z]/g, 'A').replace(/[0-9]/g, '9')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[n]
}

export interface RefGuardMatch {
  voucherRef: string
  paymentRef: string
  postingDate: string
  amount: number
  description?: string
}

export interface RefGuardVerdict {
  verdict: 'ok' | 'warn' | 'deny'
  reasons: string[]
  match?: RefGuardMatch
  /** true when a deny may be bypassed with an audited override */
  overridable: boolean
}

const OK: RefGuardVerdict = { verdict: 'ok', reasons: [], overridable: false }

/**
 * Check a reference before posting. Never throws; a guard that crashes the
 * till is worse than no guard, so any lookup failure degrades to 'ok' and
 * the DB trigger remains the backstop.
 */
export async function checkReference(args: {
  depositAccountId: string
  paymentRef: string
  amount: number
  postingDate: string          // yyyy-mm-dd
  customerId?: string | null
}): Promise<RefGuardVerdict> {
  try {
    const fp = refFingerprint(args.paymentRef)
    if (!fp) return OK

    // Account settings: internal-cash accounts and mode 'off' skip all.
    const { data: acct } = await supabase.from('accounts')
      .select('name, ref_guard_mode, no_external_ref')
      .eq('id', args.depositAccountId).maybeSingle()
    if (!acct || acct.no_external_ref || acct.ref_guard_mode === 'off') return OK

    // Candidates on the same account within the window.
    const from = new Date(args.postingDate); from.setDate(from.getDate() - REF_GUARD.WINDOW_DAYS)
    const fromIso = from.toISOString().slice(0, 10)
    const { data: cands } = await supabase.from('vouchers')
      .select('ref, payment_ref, payment_ref_fp, posting_date, total_amount, description, customer_id')
      .eq('deposit_account_id', args.depositAccountId)
      .eq('status', 'posted')
      .not('payment_ref_fp', 'is', null)
      .gte('posting_date', fromIso)
      .order('posting_date', { ascending: false })
      .limit(REF_GUARD.CANDIDATE_LIMIT)

    const rows = (cands || []) as any[]
    const toMatch = (v: any): RefGuardMatch => ({
      voucherRef: v.ref, paymentRef: v.payment_ref,
      postingDate: v.posting_date, amount: v.total_amount || 0,
      description: v.description,
    })

    // Layer 1: exact fingerprint duplicate — deny, never overridable in the
    // UI (the DB index would reject it anyway).
    const exact = rows.find(v => v.payment_ref_fp === fp)
    if (exact) {
      return {
        verdict: 'deny', overridable: false, match: toMatch(exact),
        reasons: [`This reference is already on ${exact.ref} (${exact.posting_date}, TZS ${(exact.total_amount || 0).toLocaleString()}). The same bank reference cannot be receipted twice.`],
      }
    }

    // Layer 2: fraud signature — similar ref + near amount + in window.
    if (fp.length >= REF_GUARD.MIN_FP_LENGTH) {
      const sig = rows.find(v =>
        v.payment_ref_fp &&
        levenshtein(v.payment_ref_fp, fp) <= REF_GUARD.EDIT_DISTANCE_MAX &&
        Math.abs((v.total_amount || 0) - args.amount)
          <= Math.max(args.amount, v.total_amount || 0) * REF_GUARD.AMOUNT_TOLERANCE)
      if (sig) {
        return {
          verdict: 'deny', overridable: true, match: toMatch(sig),
          reasons: [`Suspiciously similar to ${sig.ref}: "${sig.payment_ref}" for TZS ${(sig.total_amount || 0).toLocaleString()} on ${sig.posting_date}. Same amount, near-identical reference — this is what a reused slip looks like.`],
        }
      }

      // Similar ref alone (different amount): warn only. Sequential codes
      // (M-Pesa) make this common and legitimate.
      const near = rows.find(v =>
        v.payment_ref_fp && levenshtein(v.payment_ref_fp, fp) <= REF_GUARD.EDIT_DISTANCE_MAX)
      if (near) {
        return {
          verdict: 'warn', overridable: false, match: toMatch(near),
          reasons: [`Reference is close to ${near.ref} ("${near.paymentRef ?? near.payment_ref}", TZS ${(near.total_amount || 0).toLocaleString()}). Different amount, so it may simply be a consecutive transaction — double-check the slip.`],
        }
      }
    }

    // Same customer, same amount, same day, DIFFERENT reference: the honest
    // double entry a ref check cannot see.
    if (args.customerId) {
      const twin = rows.find(v =>
        v.customer_id === args.customerId &&
        v.posting_date === args.postingDate &&
        Math.abs((v.total_amount || 0) - args.amount) < 0.01)
      if (twin) {
        return {
          verdict: 'warn', overridable: false, match: toMatch(twin),
          reasons: [`${twin.ref} already receipted TZS ${args.amount.toLocaleString()} from this customer today with a different reference. Two payments, or one payment entered twice?`],
        }
      }
    }

    // Layer 3: format profile. Multiple shapes per account by design.
    const { data: fmts } = await supabase.from('ref_formats')
      .select('shape, sample_count, status')
      .eq('account_id', args.depositAccountId)
      .neq('status', 'rejected')
    const shapes = (fmts || []) as any[]
    const totalSamples = shapes.reduce((s, f) => s + (f.sample_count || 0), 0)
    if (totalSamples >= REF_GUARD.MIN_SAMPLES) {
      const shape = refShape(args.paymentRef)
      if (!shapes.some(f => f.shape === shape)) {
        const strict = acct.ref_guard_mode === 'strict'
        return {
          verdict: strict ? 'deny' : 'warn', overridable: strict,
          reasons: [`"${args.paymentRef}" does not match any known ${acct.name} reference format (${shapes.filter(f => f.sample_count >= 3).map(f => f.shape).join(', ') || 'learning'}). Check for typos or a doctored slip.`],
        }
      }
    }

    return OK
  } catch {
    return OK  // degrade silently; the DB trigger still stands
  }
}

/** Learn the shape of a successfully posted reference. Fire-and-forget. */
export async function learnRefShape(depositAccountId: string, paymentRef: string): Promise<void> {
  try {
    const shape = refShape(paymentRef)
    if (!shape) return
    const { data: existing } = await supabase.from('ref_formats')
      .select('id, sample_count').eq('account_id', depositAccountId).eq('shape', shape).maybeSingle()
    if (existing) {
      await supabase.from('ref_formats')
        .update({ sample_count: (existing.sample_count || 0) + 1, last_seen_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('ref_formats')
        .insert({ account_id: depositAccountId, shape, sample_count: 1, status: 'learned' })
    }
  } catch { /* learning is best-effort */ }
}

/** Record an audited override BEFORE posting with ref_guard_override=true. */
export async function recordRefGuardOverride(args: {
  voucherRef: string; paymentRef: string; depositAccountId: string
  match?: RefGuardMatch; reason: string; overriddenBy: string
}): Promise<void> {
  try {
    await supabase.from('ref_guard_overrides').insert({
      voucher_ref: args.voucherRef, payment_ref: args.paymentRef,
      deposit_account_id: args.depositAccountId,
      matched_voucher_ref: args.match?.voucherRef || null,
      matched_payment_ref: args.match?.paymentRef || null,
      reason: args.reason, overridden_by: args.overriddenBy,
    })
  } catch { /* the override flag on the voucher still tells the story */ }
}
