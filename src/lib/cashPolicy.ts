// ============================================================================
// cashPolicy.ts — Negative cash / bank balance policy
//
// The direct counterpart of stockPolicy.ts, deliberately the same shape so
// there is one mental model for "block, permission, or allow" across the
// system rather than two competing ones.
//
// One company-wide policy governing what happens when a payment would take a
// cash or bank account below zero. Set in Settings → Accounting → Posting
// Rules, stored on the existing `posting_rules` row:
//
//   'block'      — nobody pays out more than the account holds. The default,
//                  and the right default: an account that cannot go negative
//                  in real life should not go negative in the books. Petty
//                  cash at -15.9M in MalkiaOS is what happens without this.
//   'permission' — holders of 'accounting.override_negative_cash' may proceed
//                  after confirming; everyone else is blocked.
//   'allow'      — any user may overdraw. For tenants running bank overdraft
//                  facilities, where a negative bank balance is legitimate.
//
// WHY BLOCK IS THE DEFAULT
//   A negative cash account is almost always a data error rather than a real
//   event: a payment entered against the wrong account, a float that was never
//   funded, or a receipt that was never captured. Blocking at the point of
//   posting is the only cheap moment to catch it. Afterwards it becomes a
//   reconciliation problem that needs a bank statement to unpick.
//
// WHAT THIS DOES NOT COVER
//   Overdrafts arranged with a bank are a real negative balance. That is what
//   'allow' is for, and why this is a company setting rather than a hard rule.
//
// The policy resolution and shortfall math are pure and side-effect free.
// ============================================================================

import { supabase } from './supabase'

export type NegativeCashPolicy = 'block' | 'permission' | 'allow'

/** Permission that lets a user override a 'permission'-mode shortfall */
export const NEGATIVE_CASH_PERMISSION = 'accounting.override_negative_cash'

/** Where a user is sent to change this. Kept here so every error message
 *  names the same place and none of them drift. */
export const CASH_POLICY_SETTINGS_PATH = 'Settings → Accounting → Posting Rules'

/**
 * Resolve the policy from a posting_rules row (or anything shaped like one).
 * Pure. Unknown or absent values fall back to 'block', which is both the
 * safe default and what every existing tenant gets before they touch it.
 */
export function resolveNegativeCashPolicy(rules: unknown): NegativeCashPolicy {
  const p = (rules as { negative_cash_policy?: unknown } | null | undefined)?.negative_cash_policy
  if (p === 'block' || p === 'permission' || p === 'allow') return p
  return 'block'
}

/** Load posting_rules and resolve the policy. Company-scoped via RLS.
 *
 *  FIXED: this used to rely on a try/catch to detect a missing
 *  `negative_cash_policy` column and fall back to 'allow'. PostgREST does not
 *  throw for an unknown column, it returns an error object, so the catch was
 *  unreachable and `data` came back null, resolving to 'block'. On a database
 *  where the migration had not run, every overdraw was refused and the user was
 *  pointed at a setting that did not exist. The error is now inspected
 *  explicitly, which is what the original comment intended. */
export async function loadNegativeCashPolicy(): Promise<NegativeCashPolicy> {
  try {
    const { data, error } = await supabase
      .from('posting_rules')
      .select('negative_cash_policy')
      .maybeSingle()

    if (error) {
      // Column or table absent (migration not applied), or a read failure.
      // Do not enforce: a guard must never become an outage.
      console.warn('[cashPolicy] settings unavailable, not enforcing:', error.message)
      return 'allow'
    }
    return resolveNegativeCashPolicy(data)
  } catch (e) {
    console.warn('[cashPolicy] settings load threw, not enforcing:', e)
    return 'allow'
  }
}

/**
 * Server-side balance read for a cash or bank account.
 *
 * The voucher pages already hold a balance in component state, but the
 * approval executor does not: an approved payment may post hours or days after
 * it was submitted, by which time the balance has moved. This reads the
 * account fresh at the moment of posting.
 */
export async function fetchCashAccount(
  accountId: string,
): Promise<{ id: string; code: string; name: string; balance: number } | null> {
  const { data, error } = await supabase
    .from('accounts').select('id, code, name, balance').eq('id', accountId).maybeSingle()
  if (error || !data) return null
  return {
    id: String(data.id), code: String(data.code), name: String(data.name),
    balance: Number(data.balance) || 0,
  }
}

/**
 * One-call gate for non-interactive posting paths (the approval executor).
 *
 * There is no user present to confirm an override, so 'permission' mode is
 * treated as blocking unless the submitter already holds the permission. The
 * returned message is written to be read in an approval failure notice.
 */
export async function assertCashAvailable(
  accountId: string,
  amount: number,
  submitterHasOverride: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const policy = await loadNegativeCashPolicy()
  if (policy === 'allow') return { ok: true }

  const account = await fetchCashAccount(accountId)
  if (!account) return { ok: true } // cannot read the account: do not block

  const shortfall = computeCashShortfall(account, amount)
  const verdict = evaluateCashPolicy(shortfall, policy, submitterHasOverride, submitterHasOverride)
  if (verdict === 'proceed' || !shortfall) return { ok: true }

  return { ok: false, error: cashShortfallMessage(shortfall, policy, submitterHasOverride) }
}

// ─── Pure shortfall math ───────────────────────────────────────────────────

export interface CashShortfall {
  accountId: string
  code: string
  name: string
  /** Amount being paid out */
  needed: number
  /** Balance before the payment */
  available: number
  /** What the balance would become. Always negative when a shortfall exists. */
  resulting: number
}

/**
 * Returns a shortfall when paying `amount` out of `account` would push it
 * below zero, or null when there is room.
 *
 * Cash and bank accounts are debit-normal, so `balance` is the amount held.
 * Only accounts already at or heading below zero produce a shortfall; an
 * account that is merely low is fine.
 */
export function computeCashShortfall(
  account: { id: string; code: string; name: string; balance?: number | null } | null | undefined,
  amount: number,
): CashShortfall | null {
  if (!account) return null
  const pay = Number(amount) || 0
  if (pay <= 0) return null

  const available = Number(account.balance) || 0
  const resulting = Math.round((available - pay) * 100) / 100
  if (resulting >= 0) return null

  return {
    accountId: account.id,
    code: account.code,
    name: account.name,
    needed: pay,
    available,
    resulting,
  }
}

/**
 * Decide the outcome for a shortfall under a policy.
 *
 * hasOverridePermission — whether the acting user holds NEGATIVE_CASH_PERMISSION
 * overrideConfirmed     — whether the user has already confirmed the override
 */
export function evaluateCashPolicy(
  shortfall: CashShortfall | null,
  policy: NegativeCashPolicy,
  hasOverridePermission: boolean,
  overrideConfirmed: boolean,
): 'proceed' | 'needs_override' | 'blocked' {
  if (!shortfall) return 'proceed'
  if (policy === 'allow') return 'proceed'
  if (policy === 'permission') {
    if (overrideConfirmed) return 'proceed'
    return hasOverridePermission ? 'needs_override' : 'blocked'
  }
  return 'blocked'
}

const money = (n: number) => `TZS ${Math.round(n).toLocaleString()}`

/**
 * The message shown when a post is refused. It must explain three things in
 * order: what is wrong, why the system stopped it, and exactly where to change
 * the rule. An error that only says "not allowed" sends the user hunting.
 */
export function cashShortfallMessage(
  s: CashShortfall,
  policy: NegativeCashPolicy,
  canOverride: boolean,
): string {
  const head =
    `${s.code} ${s.name} holds ${money(s.available)}. ` +
    `Paying ${money(s.needed)} would leave it at ${money(s.resulting)}.`

  if (policy === 'permission' && !canOverride) {
    return (
      `${head} Your account cannot approve an overdraw. Ask someone with the ` +
      `"Override Negative Cash" permission, or have an admin change the rule in ` +
      `${CASH_POLICY_SETTINGS_PATH}.`
    )
  }

  return (
    `${head} Posting is blocked because this account cannot go negative. ` +
    `If it should be allowed to (for example a bank overdraft), change it in ` +
    `${CASH_POLICY_SETTINGS_PATH}.`
  )
}

/** Short prompt used when the user does hold the override permission. */
export function cashOverridePrompt(s: CashShortfall): string {
  return (
    `${s.code} ${s.name} holds ${money(s.available)}. ` +
    `Paying ${money(s.needed)} takes it to ${money(s.resulting)}.\n\n` +
    `You have permission to overdraw this account. Post anyway?`
  )
}
