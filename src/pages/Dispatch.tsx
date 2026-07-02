// ════════════════════════════════════════════════════════════════════════════
// Dispatch.tsx
// Warehouse fulfillment queue. Shows posted sales invoices that still need to be
// sent out, and lets a stock person confirm each one as Dispatched (with the
// rider who took it) or Collected at the Warehouse/Godown counter. Recording is
// who + when + rider, so you can follow up when something goes wrong or a
// reorder comes from the same place. Does not move stock (the invoice already
// deducted it at posting). Confirming requires the 'inventory.dispatch' permission.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }

interface Invoice {
  id: string
  ref: string
  posting_date: string | null
  created_at: string | null
  total_amount: number | null
  delivery_address: string | null
  posted_by: string | null
  customer_id: string | null
  customers?: { name: string | null; company: string | null; whatsapp: string | null } | null
  _lines?: { qty: number; name: string }[]
}

interface DispatchRow {
  id: string
  ref: string
  status: string
  rider_name: string | null
  notes: string | null
  dispatched_by_name: string | null
  dispatched_at: string | null
}

const tzs = (n: number | null | undefined) => (n == null ? 0 : n).toLocaleString('en-TZ', { maximumFractionDigits: 0 })
function fmt(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const party = (i: Invoice) => i.customers?.company || i.customers?.name || 'Walk-in'

export default function Dispatch({ onNav: _onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const canDispatch = isSuperAdmin() || can('inventory.dispatch')

  const [tab, setTab] = useState<'awaiting' | 'dispatched'>('awaiting')
  const [awaiting, setAwaiting] = useState<Invoice[]>([])
  const [done, setDone] = useState<DispatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rider, setRider] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  const loadAwaiting = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('vouchers')
      .select('id, ref, posting_date, created_at, total_amount, delivery_address, posted_by, customer_id, customers(name, company, whatsapp)')
      .eq('type', 'sales_invoice').eq('status', 'posted')
      .order('created_at', { ascending: false }).limit(300)
    if (fromDate) q = q.gte('posting_date', fromDate)
    const [{ data: invs, error }, { data: disp }] = await Promise.all([
      q,
      supabase.from('invoice_dispatches').select('ref'),
    ])
    if (error) { setLoading(false); flash('Load failed: ' + error.message, 'err'); return }
    const dispatchedRefs = new Set((disp || []).map((d: any) => d.ref))
    let rows = ((invs || []) as unknown as Invoice[]).filter(i => !dispatchedRefs.has(i.ref))

    // Pull the picking lines for the awaiting invoices
    const ids = rows.map(r => r.id)
    if (ids.length) {
      const { data: lines } = await supabase.from('voucher_lines')
        .select('voucher_id, qty, products(name)')
        .in('voucher_id', ids)
      const byVoucher = new Map<string, { qty: number; name: string }[]>()
      ;(lines || []).forEach((l: any) => {
        const arr = byVoucher.get(l.voucher_id) || []
        arr.push({ qty: l.qty, name: l.products?.name || 'Item' })
        byVoucher.set(l.voucher_id, arr)
      })
      rows = rows.map(r => ({ ...r, _lines: byVoucher.get(r.id) || [] }))
    }
    setAwaiting(rows)
    setLoading(false)
  }, [fromDate])

  const loadDone = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('invoice_dispatches')
      .select('id, ref, status, rider_name, notes, dispatched_by_name, dispatched_at')
      .order('dispatched_at', { ascending: false }).limit(300)
    setDone((data || []) as DispatchRow[])
    setLoading(false)
  }, [])

  useEffect(() => { if (tab === 'awaiting') loadAwaiting(); else loadDone() }, [tab, loadAwaiting, loadDone])

  const confirm = async (inv: Invoice, status: 'dispatched' | 'collected') => {
    setBusy(inv.id)
    const { error } = await supabase.from('invoice_dispatches').insert({
      voucher_id: inv.id,
      ref: inv.ref,
      status,
      rider_name: status === 'dispatched' ? (rider.trim() || null) : null,
      notes: notes.trim() || null,
      dispatched_by: user?.id || null,
      dispatched_by_name: user?.full_name || null,
    })
    setBusy('')
    if (error) {
      flash(error.message.includes('duplicate') ? 'This invoice was already dispatched.' : 'Failed: ' + error.message, 'err')
      return
    }
    flash(status === 'dispatched' ? `${inv.ref} dispatched` : `${inv.ref} marked collected`)
    setExpanded(null); setRider(''); setNotes('')
    setAwaiting(prev => prev.filter(i => i.id !== inv.id))
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Dispatch</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Posted sales invoices waiting to be sent out. Confirming records who sent it and when. It does not move stock.
      </p>

      <div style={{ display: 'flex', gap: 6, margin: '12px 0', alignItems: 'center' }}>
        {([['awaiting', `Awaiting Dispatch${awaiting.length ? ` (${awaiting.length})` : ''}`], ['dispatched', 'Dispatched']] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setExpanded(null) }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${tab === k ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === k ? 'var(--accent)' : 'var(--surface2)', color: tab === k ? '#fff' : 'var(--text2)' }}>{label}</button>
        ))}
        {tab === 'awaiting' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>Posted from</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
          </div>
        )}
      </div>

      {!canDispatch && (
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          You can view the queue but need the "Confirm Dispatch" permission to mark invoices dispatched.
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {/* AWAITING */}
      {!loading && tab === 'awaiting' && (
        awaiting.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Nothing awaiting dispatch.</div>
          : awaiting.map(inv => (
            <div key={inv.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontFamily: 'var(--mono)' }}>{inv.ref}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{party(inv)}</div>
                  {inv.customers?.whatsapp && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{inv.customers.whatsapp}</div>}
                  {inv.delivery_address && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>📍 {inv.delivery_address}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Posted {fmt(inv.created_at || inv.posting_date)} · {tzs(inv.total_amount)} TZS</div>
                </div>
                {canDispatch && (
                  <button onClick={() => { setExpanded(expanded === inv.id ? null : inv.id); setRider(''); setNotes('') }}
                    style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {expanded === inv.id ? 'Close' : 'Confirm'}
                  </button>
                )}
              </div>

              {/* Picking list */}
              {inv._lines && inv._lines.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {inv._lines.map((l, idx) => (
                    <span key={idx} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      {l.qty} × {l.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Confirm form */}
              {expanded === inv.id && canDispatch && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    <input value={rider} onChange={e => setRider(e.target.value)} placeholder="Rider / driver name (for deliveries)"
                      style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }} />
                    <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
                      style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={!!busy} onClick={() => confirm(inv, 'dispatched')}
                      style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      {busy === inv.id ? 'Saving…' : 'Dispatch with rider'}
                    </button>
                    <button disabled={!!busy} onClick={() => confirm(inv, 'collected')}
                      style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      Collected at Warehouse/Godown
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Rider name is for deliveries; it isn't needed for a counter collection.</div>
                </div>
              )}
            </div>
          ))
      )}

      {/* DISPATCHED */}
      {!loading && tab === 'dispatched' && (
        done.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>No dispatched invoices yet.</div>
          : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: 'var(--surface2)' }}>
                  {['Invoice', 'Status', 'Rider', 'By', 'When', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {done.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)' }}>{d.ref}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: d.status === 'collected' ? 'var(--surface2)' : 'var(--accent-dim, rgba(94,168,162,.15))',
                          color: d.status === 'collected' ? 'var(--text2)' : 'var(--accent)' }}>
                          {d.status === 'collected' ? 'Collected' : 'Dispatched'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>{d.rider_name || '—'}</td>
                      <td style={{ padding: '9px 12px' }}>{d.dispatched_by_name || '—'}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmt(d.dispatched_at)}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text3)' }}>{d.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, color: '#fff', background: toast.type === 'ok' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 13, zIndex: 1000 }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
