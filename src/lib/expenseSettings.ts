// ─── expenseSettings ───────────────────────────────────────────────────────
// The petty-cash ceiling: the amount at which an expense stops qualifying as
// petty cash and must be a Cash Payment. Stored in system_settings under
// 'petty_cash_ceiling'. This is a business rule (what CAN be petty cash),
// distinct from the petty_cash APPROVAL threshold (when petty cash needs
// sign-off) which lives in approval_settings.
// ───────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

export const DEFAULT_PETTY_CASH_CEILING = 50000

export async function getPettyCashCeiling(): Promise<number> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'petty_cash_ceiling')
    .maybeSingle()
  if (data?.value != null) {
    const n = Number(String(data.value).replace(/[^0-9.]/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_PETTY_CASH_CEILING
}

export async function savePettyCashCeiling(amount: number): Promise<{ ok: boolean; error?: string }> {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Enter a positive amount.' }
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key: 'petty_cash_ceiling', value: String(Math.round(n)) }, { onConflict: 'key' })
  return error ? { ok: false, error: error.message } : { ok: true }
}
