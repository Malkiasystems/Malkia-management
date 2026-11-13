import { supabase } from './supabase'

/* No silent half-saves.

   Posting a document is several separate writes (voucher, accounting entry,
   statement line). If a late one fails, the earlier ones are already saved.
   Between 5 and 12 Nov 2026 three invoices lost their statement line this way
   and the only sign was a toast that vanished after a few seconds.

   These helpers make such a failure impossible to miss:
     - it is written to app_error_log, so it appears in the administrators'
       books check with the exact reason
     - the person posting is stopped by a message they must dismiss */

export async function recordPostingFailure(ref: string, what: string, message: string, detail?: Record<string, unknown>): Promise<void> {
  try {
    await supabase.rpc('log_app_error', { p_kind: 'posting', p_ref: ref, p_message: `${what}: ${message}`, p_detail: detail || null })
  } catch { /* the alert below is the last resort */ }
}

export function alarmPostingFailure(ref: string, what: string, message: string): void {
  window.alert(
    `IMPORTANT: ${ref} was posted, but ${what} could not be saved.\n\n` +
    `The customer's statement and balance may be wrong for this document. ` +
    `Do NOT post it again. Tell your administrator now.\n\nReason: ${message}`
  )
}

/** Wrap a statement-line insert so its result is never ignored:
 *    await statementLine(supabase.from('customer_ledger_entries').insert({...}), { ref, what })
 *  Returns true when the line was saved. */
export async function statementLine(
  run: PromiseLike<{ error: { message: string } | null }>,
  ctx: { ref: string; what: string },
): Promise<boolean> {
  let error: { message: string } | null = null
  try { error = (await run).error } catch (e: any) { error = { message: e?.message || String(e) } }
  if (!error) return true
  console.error(`${ctx.what} failed for ${ctx.ref}:`, error.message)
  await recordPostingFailure(ctx.ref, ctx.what, error.message)
  alarmPostingFailure(ctx.ref, ctx.what, error.message)
  return false
}
