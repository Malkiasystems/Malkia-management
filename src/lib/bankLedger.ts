import { supabase } from './supabase'
import { getCutoverDate } from './ledgerCutover'

export const bankToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Dar_es_Salaam' }).format(new Date())

export function daysBefore(date: string, days: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export async function postedBalances(ids: string[], from: string, to: string) {
  const balances = new Map<string, number>()
  if (to < from || !ids.length) return balances
  const { data, error } = await supabase.rpc('account_period_totals', { p_from: from, p_to: to, p_account_ids: ids })
  if (error) throw error
  for (const row of data || []) balances.set(row.account_id, Number(row.debit) - Number(row.credit))
  return balances
}

export async function bankStatement(account: string, start: string, end: string) {
  if (!start || !end || start > end) throw new Error('Choose a valid statement date range.')
  const cutover = await getCutoverDate()
  const from = start < cutover ? cutover : start
  if (end < from) throw new Error('The current books start on ' + cutover + '.')
  const today = bankToday()
  const [openingTotals, currentTotals] = await Promise.all([
    postedBalances([account], cutover, daysBefore(from, 1)),
    postedBalances([account], cutover, today),
  ])
  const opening = openingTotals.get(account) || 0
  const current = currentTotals.get(account) || 0
  const rows = []
  let count = 0
  do {
    const result = await supabase.from('journal_lines')
      .select('id, created_at, debit, credit, description, journals!inner(ref, posting_date, journal_type, source_ref, status)', { count: 'exact' })
      .eq('account_id', account).eq('journals.status', 'posted')
      .gte('journals.posting_date', from).lte('journals.posting_date', end)
      .order('created_at').order('id').range(rows.length, rows.length + 499)
    if (result.error) throw result.error
    if (result.count === null || (rows.length && result.count !== count)) throw new Error('The ledger changed. Load the statement again.')
    count = result.count
    if (!result.data?.length && rows.length < count) throw new Error('The ledger was only partially loaded. Please retry.')
    for (const line of result.data || []) {
      const journal = Array.isArray(line.journals) ? line.journals[0] : line.journals
      rows.push({ id: line.id, created_at: line.created_at, posting_date: journal.posting_date,
        debit: Number(line.debit), credit: Number(line.credit), description: line.description || '—',
        voucher_ref: journal.source_ref || journal.ref || '—', voucher_type: journal.journal_type || '' })
    }
  } while (rows.length < count)
  rows.sort((a, b) => a.posting_date.localeCompare(b.posting_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  let closing = opening
  const entries = rows.map(row => {
    closing = Math.round((closing + row.debit - row.credit) * 100) / 100
    return { ...row, running_balance: closing }
  })
  if (end === today && Math.abs(current - closing) > 0.005) throw new Error('The ledger changed during loading. Load the statement again.')
  return { from, to: end, opening, closing, current, entries: entries.reverse() }
}
