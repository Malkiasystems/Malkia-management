// ════════════════════════════════════════════════════════════════════════════
// InternalUseReturns.tsx
// Books temporary Internal Use stock back in when it's returned. Lists
// outstanding loans (temporary IU issues not yet fully returned). Returning a
// quantity reverses the original exactly: stock goes back into the location it
// left, a positive ledger entry is written, and a reversing journal is posted
// (Dr Inventory, Cr the same expense account the issue debited) so the books and
// stock stay balanced. Un-returned stock can be written off (stays expensed).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { localIso } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { insertJournalWithRetry } from '../lib/refs'
import { postLedgerEntry } from '../lib/itemLedger'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface Loan {
  id: string; ref: string; product_id: string; product_name: string | null
  location_id: string | null; location_code: string | null; unit_cost: number
  qty_issued: number; qty_returned: number; expense_account_id: string | null
  inventory_account_id: string | null; status: string; issued_by_name: string | null
  issued_at: string | null
}
const fmt = (s: string | null) => { if (!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }

export default function InternalUseReturns({ onNav: _onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const canDo = isSuperAdmin() || can('inventory.internal_use') || can('inventory.adjust')

  const [tab, setTab] = useState<'outstanding' | 'closed'>('outstanding')
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(false)
  const [qtyInput, setQtyInput] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    setLoading(true)
    const q = supabase.from('iu_loans').select('*').order('issued_at', { ascending: false }).limit(300)
    const { data } = tab === 'outstanding' ? await q.eq('status', 'outstanding') : await q.neq('status', 'outstanding')
    setLoans((data || []) as Loan[]); setLoading(false)
  }, [tab])
  useEffect(() => { load() }, [load])

  const outstanding = (l: Loan) => l.qty_issued - l.qty_returned

  const doReturn = async (l: Loan) => {
    const rq = parseFloat(qtyInput[l.id] || String(outstanding(l)))
    if (!rq || rq <= 0) { flash('Enter a quantity to return.', 'err'); return }
    if (rq > outstanding(l) + 0.001) { flash(`Only ${outstanding(l)} outstanding.`, 'err'); return }
    if (!l.location_id) { flash('This loan has no location recorded — cannot book back safely.', 'err'); return }
    setBusy(l.id)
    try {
      const value = rq * (l.unit_cost || 0)
      const today = localIso(new Date())

      // 1. Reversing journal: Dr Inventory, Cr expense (only if accounts known)
      if (l.inventory_account_id && l.expense_account_id && value > 0) {
        const { data: journal, error: jErr } = await insertJournalWithRetry({
          ref: 'JV-IUR-' + l.ref, posting_date: today,
          description: `Internal Use return — ${l.product_name || 'item'} — ${l.ref}`,
          journal_type: 'internal_use_return', source_type: 'internal_use_return', source_ref: l.ref,
          posted_by: user?.full_name || 'System', status: 'posted',
        })
        if (jErr || !journal) throw new Error(jErr?.message || 'Journal failed')
        const { error: jlErr } = await supabase.from('journal_lines').insert([
          { journal_id: journal.id, line_number: 1, account_id: l.inventory_account_id, description: `Inventory returned · ${l.ref}`, debit: value, credit: 0 },
          { journal_id: journal.id, line_number: 2, account_id: l.expense_account_id, description: `Reverse internal use · ${l.ref}`, debit: 0, credit: value },
        ])
        if (jlErr) throw new Error('Journal lines: ' + jlErr.message)
        await Promise.all([
          supabase.rpc('update_account_balance', { p_account_id: l.inventory_account_id, p_debit: value, p_credit: 0 }),
          supabase.rpc('update_account_balance', { p_account_id: l.expense_account_id, p_debit: 0, p_credit: value }),
        ])
      }

      // 2. Ledger entry (stock coming back in), tagged as internal_use
      await postLedgerEntry({
        product_id: l.product_id, entry_type: 'positive_adjustment', document_type: 'internal_use',
        document_ref: l.ref, posting_date: today, qty: rq, cost_amount: value,
        location: { id: l.location_id, code: l.location_code || undefined },
      })

      // 3. Increment the location's stock (trigger recomputes qty_on_hand)
      const { data: existingLoc } = await supabase.from('product_locations')
        .select('qty_on_hand').eq('product_id', l.product_id).eq('location_id', l.location_id).maybeSingle()
      await supabase.from('product_locations').upsert(
        { product_id: l.product_id, location_id: l.location_id, location_code: l.location_code, qty_on_hand: (existingLoc?.qty_on_hand ?? 0) + rq, last_updated: new Date().toISOString() },
        { onConflict: 'product_id,location_id' })

      // 4. Update the loan
      const newReturned = l.qty_returned + rq
      await supabase.from('iu_loans').update({
        qty_returned: newReturned, status: newReturned >= l.qty_issued - 0.001 ? 'returned' : 'outstanding',
      }).eq('id', l.id)

      flash(`${rq} × ${l.product_name || 'item'} booked back to ${l.location_code}`)
      setQtyInput(s => ({ ...s, [l.id]: '' }))
      setLoans(prev => newReturned >= l.qty_issued - 0.001 ? prev.filter(x => x.id !== l.id) : prev.map(x => x.id === l.id ? { ...x, qty_returned: newReturned } : x))
    } catch (e: any) {
      flash('Failed: ' + (e?.message || 'unknown'), 'err')
    } finally { setBusy('') }
  }

  const writeOff = async (l: Loan) => {
    if (!confirm(`Write off the ${outstanding(l)} outstanding of ${l.product_name}? Stock is NOT returned and it stays as an expense.`)) return
    setBusy(l.id)
    const { error } = await supabase.from('iu_loans').update({ status: 'written_off' }).eq('id', l.id)
    setBusy('')
    if (error) { flash('Failed: ' + error.message, 'err'); return }
    flash(`${l.ref} written off`)
    setLoans(prev => prev.filter(x => x.id !== l.id))
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Internal Use Returns</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Temporary internal-use stock (photos, samples, display) that's expected back. Book returns in, or write off what won't come back.
      </p>

      <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
        {([['outstanding', 'Outstanding'], ['closed', 'Returned / Written off']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${tab === k ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === k ? 'var(--accent)' : 'var(--surface2)', color: tab === k ? '#fff' : 'var(--text2)' }}>{lbl}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {!loading && (loans.length === 0
        ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>{tab === 'outstanding' ? 'Nothing outstanding — all temporary stock is back.' : 'Nothing here yet.'}</div>
        : loans.map(l => (
          <div key={l.id} style={{ border: `1px solid ${tab === 'outstanding' ? 'var(--yellow, #d97706)' : 'var(--border)'}`, borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{l.product_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{l.ref}</span> · {l.location_code || '—'} · issued {fmt(l.issued_at)}{l.issued_by_name ? ` by ${l.issued_by_name}` : ''}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Issued <strong>{l.qty_issued}</strong> · Returned <strong>{l.qty_returned}</strong>
                  {tab === 'outstanding' && <> · <span style={{ color: 'var(--yellow, #d97706)', fontWeight: 700 }}>Outstanding {outstanding(l)}</span></>}
                  {l.status === 'written_off' && <> · <span style={{ color: 'var(--red, #dc2626)', fontWeight: 700 }}>Written off</span></>}
                  {l.status === 'returned' && <> · <span style={{ color: 'var(--green, #16a34a)', fontWeight: 700 }}>Fully returned</span></>}
                </div>
              </div>
              {tab === 'outstanding' && canDo && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" min={0} max={outstanding(l)} value={qtyInput[l.id] ?? ''} placeholder={String(outstanding(l))}
                    onChange={e => setQtyInput(s => ({ ...s, [l.id]: e.target.value }))}
                    style={{ width: 70, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, textAlign: 'right' }} />
                  <button disabled={busy === l.id} onClick={() => doReturn(l)}
                    style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--green, #16a34a)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {busy === l.id ? '…' : 'Return'}
                  </button>
                  <button disabled={busy === l.id} onClick={() => writeOff(l)}
                    style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Write off
                  </button>
                </div>
              )}
            </div>
          </div>
        )))}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, color: '#fff', background: toast.type === 'ok' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 13, zIndex: 1000 }}>{toast.msg}</div>
      )}
    </div>
  )
}
