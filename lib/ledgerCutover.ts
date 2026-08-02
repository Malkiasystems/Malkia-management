// ════════════════════════════════════════════════════════════════════════════
// LEDGER CUTOVER
//
// On 2 August 2026 the books were reopened. Nothing was deleted: every journal,
// voucher and statement line from before that date is still in the database and
// still browsable. What changed is that the ACCOUNTS stop counting anything
// dated earlier.
//
// The database already enforces this. rebuild_account_balances(),
// get_trial_balance() and ledger_health_check() all filter on
// ledger_cutover_date(), and a BEFORE INSERT trigger on journals rejects any
// posting dated before it.
//
// This file is the client-side half. Any page that queries journal_lines by
// date must clamp its "from" to the cutover, otherwise it reports numbers the
// balance sheet does not recognise. The failure is quiet: a P&L for August
// starting on the 1st would include 1 August's 75 journals, which the accounts
// deliberately exclude, and nobody would see an error.
//
// Read once per session and cached. The date lives in system_settings so the
// database stays the single source of truth.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase'

const FALLBACK = '2026-08-02'

let cached: string | null = null
let inflight: Promise<string> | null = null

/** The cutover date as YYYY-MM-DD. Cached for the session. */
export async function getCutoverDate(): Promise<string> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'ledger_cutover')
        .maybeSingle()

      let parsed: string | null = null
      if (data?.value) {
        const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
        if (raw && typeof raw.cutover_date === 'string') parsed = raw.cutover_date
      }
      cached = parsed || FALLBACK
    } catch {
      // Never block a report on this. The fallback matches what was committed.
      cached = FALLBACK
    }
    inflight = null
    return cached
  })()

  return inflight
}

/**
 * The cutover date without waiting on the network.
 *
 * Returns the cached value if getCutoverDate() has already resolved, otherwise
 * the fallback. Safe for useState initialisers, which cannot await. Every such
 * default is re-clamped once the real value arrives, so a stale first render
 * self-corrects rather than persisting.
 */
export function cutoverDateSync(): string {
  return cached || FALLBACK
}

/**
 * Clamp a range start so it never reaches behind the cutover.
 *
 * Returns whichever is later. A page asking for 1 January gets the cutover
 * back; a page asking for 1 September keeps its own date.
 */
export function clampFrom(from: string, cutover?: string): string {
  const floor = cutover || cutoverDateSync()
  return from < floor ? floor : from
}

/**
 * True when the requested range starts before the cutover, meaning the page
 * asked for history the accounts do not count. Use it to show a note rather
 * than to silently change what the user typed.
 */
export function reachesBehindCutover(from: string, cutover?: string): boolean {
  const floor = cutover || cutoverDateSync()
  return from < floor
}

/** Wording for the note. Kept here so every page says the same thing. */
export function cutoverNote(cutover?: string): string {
  return `Accounts were reopened on ${cutover || cutoverDateSync()}. Earlier transactions are still on file but are not counted in balances.`
}
