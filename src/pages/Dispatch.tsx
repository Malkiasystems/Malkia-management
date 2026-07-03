// ════════════════════════════════════════════════════════════════════════════
// Dispatch.tsx  (v2)
// Warehouse fulfillment queue — the stock man's main screen.
//  • Confirm a posted sales invoice as Dispatched (with a saved rider) or
//    Collected at the Warehouse/Godown counter.
//  • Partial dispatch: send some now, the rest later. The invoice stays in the
//    queue until a send marks it final.
//  • Batch: tick several invoices and dispatch them all to one rider at once.
//  • Search the queue, override the delivery address, and print a Pick List
//    (for the warehouse) or a Delivery Note (for the rider/customer).
// Stock already left at invoice posting; this tracks physical fulfilment only.
// Confirming requires the 'inventory.dispatch' permission.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { renderElementToPdfBlob } from '../lib/customerDocuments'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }

interface Line { qty: number; name: string }
interface Partial { rider_name: string | null; items_sent: string | null; dispatched_at: string | null; dispatched_by_name: string | null }
interface Invoice {
  id: string; ref: string; posting_date: string | null; created_at: string | null
  total_amount: number | null; delivery_address: string | null; posted_by: string | null
  customer_id: string | null
  customers?: { name: string | null; company: string | null; whatsapp: string | null } | null
  _lines?: Line[]; _partials?: Partial[]
}
interface DispatchRow {
  id: string; ref: string; status: string; is_final: boolean; rider_name: string | null
  items_sent: string | null; notes: string | null; dispatched_by_name: string | null; dispatched_at: string | null
}
interface Rider { id: string; name: string; phone: string | null }

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
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [search, setSearch] = useState('')

  // single-confirm form state
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rider, setRider] = useState('')
  const [notes, setNotes] = useState('')
  const [itemsSent, setItemsSent] = useState('')
  const [addr, setAddr] = useState('')
  const [isFinal, setIsFinal] = useState(true)

  // batch state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchRider, setBatchRider] = useState('')

  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  const loadRiders = useCallback(async () => {
    const { data } = await supabase.from('riders').select('id, name, phone').eq('is_active', true).order('name')
    setRiders((data || []) as Rider[])
  }, [])

  const loadAwaiting = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('vouchers')
      .select('id, ref, posting_date, created_at, total_amount, delivery_address, posted_by, customer_id, customers(name, company, whatsapp)')
      .eq('type', 'sales_invoice').eq('status', 'posted')
      .order('created_at', { ascending: false }).limit(400)
    if (fromDate) q = q.gte('posting_date', fromDate)
    const [{ data: invs, error }, { data: disp }] = await Promise.all([
      q,
      supabase.from('invoice_dispatches').select('ref, is_final, rider_name, items_sent, dispatched_at, dispatched_by_name'),
    ])
    if (error) { setLoading(false); flash('Load failed: ' + error.message, 'err'); return }

    const finalRefs = new Set<string>()
    const partialsByRef = new Map<string, Partial[]>()
    ;(disp || []).forEach((d: any) => {
      if (d.is_final) finalRefs.add(d.ref)
      else {
        const arr = partialsByRef.get(d.ref) || []
        arr.push({ rider_name: d.rider_name, items_sent: d.items_sent, dispatched_at: d.dispatched_at, dispatched_by_name: d.dispatched_by_name })
        partialsByRef.set(d.ref, arr)
      }
    })
    let rows = ((invs || []) as unknown as Invoice[]).filter(i => !finalRefs.has(i.ref))
    rows = rows.map(r => ({ ...r, _partials: partialsByRef.get(r.ref) || [] }))

    const ids = rows.map(r => r.id)
    if (ids.length) {
      const { data: lines } = await supabase.from('voucher_lines').select('voucher_id, qty, products(name)').in('voucher_id', ids)
      const byV = new Map<string, Line[]>()
      ;(lines || []).forEach((l: any) => {
        const arr = byV.get(l.voucher_id) || []
        arr.push({ qty: l.qty, name: l.products?.name || 'Item' }); byV.set(l.voucher_id, arr)
      })
      rows = rows.map(r => ({ ...r, _lines: byV.get(r.id) || [] }))
    }
    setAwaiting(rows); setLoading(false)
  }, [fromDate])

  const loadDone = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('invoice_dispatches')
      .select('id, ref, status, is_final, rider_name, items_sent, notes, dispatched_by_name, dispatched_at')
      .order('dispatched_at', { ascending: false }).limit(400)
    setDone((data || []) as DispatchRow[]); setLoading(false)
  }, [])

  useEffect(() => { loadRiders() }, [loadRiders])
  useEffect(() => { if (tab === 'awaiting') loadAwaiting(); else loadDone() }, [tab, loadAwaiting, loadDone])

  // Save a rider to the saved list if it's new
  const rememberRider = async (name: string) => {
    const n = name.trim(); if (!n) return
    if (riders.some(r => r.name.toLowerCase() === n.toLowerCase())) return
    await supabase.from('riders').insert({ name: n }).then(() => loadRiders())
  }

  const confirmOne = async (inv: Invoice, status: 'dispatched' | 'collected') => {
    if (status === 'dispatched' && !rider.trim()) { flash('Choose or enter the rider / driver name.', 'err'); return }
    setBusy(inv.id)
    const { error } = await supabase.from('invoice_dispatches').insert({
      voucher_id: inv.id, ref: inv.ref, status,
      rider_name: status === 'dispatched' ? rider.trim() : null,
      items_sent: itemsSent.trim() || null,
      delivery_address: addr.trim() || null,
      notes: notes.trim() || null,
      is_final: status === 'collected' ? true : isFinal,
      dispatched_by: user?.id || null, dispatched_by_name: user?.full_name || null,
    })
    setBusy('')
    if (error) { flash('Failed: ' + error.message, 'err'); return }
    if (status === 'dispatched') rememberRider(rider)
    flash(isFinal || status === 'collected' ? `${inv.ref} done` : `${inv.ref} partial recorded`)
    setExpanded(null); setRider(''); setNotes(''); setItemsSent(''); setAddr(''); setIsFinal(true)
    if (isFinal || status === 'collected') setAwaiting(prev => prev.filter(i => i.id !== inv.id))
    else loadAwaiting()
  }

  const confirmBatch = async () => {
    if (!batchRider.trim()) { flash('Choose the rider for this batch.', 'err'); return }
    setBusy('batch')
    const chosen = awaiting.filter(i => selected.has(i.id))
    const rows = chosen.map(i => ({
      voucher_id: i.id, ref: i.ref, status: 'dispatched', rider_name: batchRider.trim(),
      is_final: true, dispatched_by: user?.id || null, dispatched_by_name: user?.full_name || null,
    }))
    const { error } = await supabase.from('invoice_dispatches').insert(rows)
    setBusy('')
    if (error) { flash('Batch failed: ' + error.message, 'err'); return }
    rememberRider(batchRider)
    flash(`${rows.length} invoices dispatched to ${batchRider.trim()}`)
    const ids = new Set(chosen.map(i => i.id))
    setAwaiting(prev => prev.filter(i => !ids.has(i.id)))
    setSelected(new Set()); setBatchRider('')
  }

  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // PDFs
  const printDoc = async (inv: Invoice, kind: 'pick' | 'note') => {
    setBusy(inv.id + kind)
    try {
      const el = kind === 'pick' ? buildPickList(inv) : buildDeliveryNote(inv, addr.trim() || inv.delivery_address || '', rider.trim())
      document.body.appendChild(el)
      const blob = await renderElementToPdfBlob(el)
      document.body.removeChild(el)
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = `${inv.ref}-${kind === 'pick' ? 'picklist' : 'delivery-note'}.pdf`; a.click(); URL.revokeObjectURL(url)
    } catch (e: any) { flash('PDF failed: ' + (e?.message || 'unknown'), 'err') }
    finally { setBusy('') }
  }

  const visible = awaiting.filter(i => {
    if (!search.trim()) return true
    const s = search.trim().toLowerCase()
    return i.ref.toLowerCase().includes(s) || party(i).toLowerCase().includes(s) || (i.customers?.whatsapp || '').includes(s)
  })

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Dispatch</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Posted sales invoices waiting to be sent out. Confirming records who sent it, when, and the rider. It does not move stock.
      </p>

      <div style={{ display: 'flex', gap: 6, margin: '12px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        {([['awaiting', `Awaiting Dispatch${visible.length ? ` (${visible.length})` : ''}`], ['dispatched', 'Dispatched']] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setExpanded(null); setSelected(new Set()) }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${tab === k ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === k ? 'var(--accent)' : 'var(--surface2)', color: tab === k ? '#fff' : 'var(--text2)' }}>{label}</button>
        ))}
        {tab === 'awaiting' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice / customer"
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, width: 200 }} />
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>From</label>
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

      {/* saved-riders datalist */}
      <datalist id="riders-list">{riders.map(r => <option key={r.id} value={r.name} />)}</datalist>

      {/* batch action bar */}
      {tab === 'awaiting' && canDispatch && selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12, marginBottom: 10, borderRadius: 10, background: 'var(--accent-dim, rgba(94,168,162,.12))', border: '1px solid var(--accent)' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{selected.size} selected</span>
          <input list="riders-list" value={batchRider} onChange={e => setBatchRider(e.target.value)} placeholder="Rider for all selected"
            style={{ flex: 1, maxWidth: 260, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
          <button disabled={!!busy} onClick={confirmBatch} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {busy === 'batch' ? 'Dispatching…' : `Dispatch ${selected.size} to rider`}
          </button>
          <button onClick={() => setSelected(new Set())} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>Clear</button>
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {/* AWAITING */}
      {!loading && tab === 'awaiting' && (
        visible.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Nothing awaiting dispatch.</div>
          : visible.map(inv => (
            <div key={inv.id} style={{ border: `1px solid ${selected.has(inv.id) ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  {canDispatch && <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggle(inv.id)} style={{ marginTop: 4 }} />}
                  <div>
                    <div style={{ fontWeight: 800, fontFamily: 'var(--mono)' }}>{inv.ref}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{party(inv)}</div>
                    {inv.customers?.whatsapp && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{inv.customers.whatsapp}</div>}
                    {inv.delivery_address && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>📍 {inv.delivery_address}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Posted {fmt(inv.created_at || inv.posting_date)} · {tzs(inv.total_amount)} TZS</div>
                    {inv._partials && inv._partials.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--yellow, #d97706)', marginTop: 4, fontWeight: 600 }}>
                        Partially sent: {inv._partials.map((p) => `${p.items_sent || 'items'} (${p.rider_name || 'counter'})`).join('; ')}
                      </div>
                    )}
                  </div>
                </div>
                {canDispatch && (
                  <button onClick={() => { setExpanded(expanded === inv.id ? null : inv.id); setRider(''); setNotes(''); setItemsSent(''); setAddr(inv.delivery_address || ''); setIsFinal(true) }}
                    style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {expanded === inv.id ? 'Close' : 'Confirm'}
                  </button>
                )}
              </div>

              {inv._lines && inv._lines.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {inv._lines.map((l, idx) => (
                    <span key={idx} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>{l.qty} × {l.name}</span>
                  ))}
                </div>
              )}

              {expanded === inv.id && canDispatch && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <input list="riders-list" value={rider} onChange={e => setRider(e.target.value)} placeholder="Rider / driver (required for delivery)"
                      style={inp} />
                    <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Deliver to (override address)"
                      style={inp} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <input value={itemsSent} onChange={e => setItemsSent(e.target.value)} placeholder="What is going in this trip? (for partial sends)"
                      style={inp} />
                    <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" style={inp} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isFinal} onChange={e => setIsFinal(e.target.checked)} />
                    This completes the invoice (untick if more is still to follow)
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button disabled={!!busy} onClick={() => confirmOne(inv, 'dispatched')}
                      style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      {busy === inv.id ? 'Saving…' : (isFinal ? 'Dispatch with rider' : 'Record partial send')}
                    </button>
                    <button disabled={!!busy} onClick={() => confirmOne(inv, 'collected')}
                      style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      Collected at Warehouse/Godown
                    </button>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button disabled={!!busy} onClick={() => printDoc(inv, 'pick')} style={ghost}>🖨 Pick List</button>
                      <button disabled={!!busy} onClick={() => printDoc(inv, 'note')} style={ghost}>🖨 Delivery Note</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Rider is required for a delivery; not needed for a counter collection.</div>
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
                  {['Invoice', 'Status', 'Rider', 'Items sent', 'By', 'When'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {done.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)' }}>{d.ref}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: d.status === 'collected' ? 'var(--surface2)' : (d.is_final ? 'var(--accent-dim, rgba(94,168,162,.15))' : 'rgba(217,119,6,.15)'),
                          color: d.status === 'collected' ? 'var(--text2)' : (d.is_final ? 'var(--accent)' : 'var(--yellow, #d97706)') }}>
                          {d.status === 'collected' ? 'Collected' : (d.is_final ? 'Dispatched' : 'Partial')}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>{d.rider_name || '—'}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text3)' }}>{d.items_sent || ''}</td>
                      <td style={{ padding: '9px 12px' }}>{d.dispatched_by_name || '—'}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmt(d.dispatched_at)}</td>
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

const inp: React.CSSProperties = { flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }
const ghost: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }

// ─── printable builders ────────────────────────────────────────────────────
function baseEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.position = 'fixed'; el.style.left = '-10000px'; el.style.top = '0'; el.style.width = '760px'
  el.style.padding = '28px'; el.style.background = '#fff'; el.style.color = '#1a1a1a'; el.style.fontFamily = 'Arial, sans-serif'; el.style.fontSize = '13px'
  return el
}
function lineRows(inv: Invoice, withPrice: boolean): string {
  return (inv._lines || []).map(l =>
    `<tr><td style="padding:7px;border-top:1px solid #eee">${l.name}</td>
     <td style="padding:7px;text-align:right;border-top:1px solid #eee;font-weight:700">${l.qty}</td>
     ${withPrice ? `<td style="padding:7px;text-align:right;border-top:1px solid #eee">☐</td>` : ''}</tr>`).join('')
}
function buildPickList(inv: Invoice): HTMLDivElement {
  const el = baseEl()
  el.innerHTML = `
    <div style="border-bottom:2px solid #5EA8A2;padding-bottom:10px;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800;color:#5E2230">PICK LIST</div>
      <div style="color:#666">${inv.ref} · ${party(inv)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f4f4f4"><th style="padding:7px;text-align:left">Item</th>
      <th style="padding:7px;text-align:right">Qty</th><th style="padding:7px;text-align:right">Picked</th></tr></thead>
      <tbody>${lineRows(inv, true)}</tbody>
    </table>
    <div style="margin-top:24px;font-size:11px;color:#666">Picked by: ____________________   Checked by: ____________________</div>`
  return el
}
function buildDeliveryNote(inv: Invoice, address: string, rider: string): HTMLDivElement {
  const el = baseEl()
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #5EA8A2;padding-bottom:10px;margin-bottom:14px">
      <div><div style="font-size:18px;font-weight:800;color:#5E2230">Malkia Wellness Group Ltd</div>
        <div style="color:#666">Delivery Note</div></div>
      <div style="text-align:right"><div style="font-size:15px;font-weight:800">${inv.ref}</div>
        <div style="color:#666">${new Date().toLocaleDateString('en-GB')}</div></div>
    </div>
    <div style="margin-bottom:12px">
      <div><b>Customer:</b> ${party(inv)}</div>
      ${inv.customers?.whatsapp ? `<div><b>Phone:</b> ${inv.customers.whatsapp}</div>` : ''}
      ${address ? `<div><b>Deliver to:</b> ${address}</div>` : ''}
      ${rider ? `<div><b>Rider:</b> ${rider}</div>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#f4f4f4"><th style="padding:7px;text-align:left">Item</th>
      <th style="padding:7px;text-align:right">Qty</th></tr></thead>
      <tbody>${lineRows(inv, false)}</tbody>
    </table>
    <div style="font-size:12px;margin-top:30px">Received in good condition:</div>
    <div style="font-size:12px;margin-top:16px">Name: ____________________   Signature: ____________________   Date: __________</div>`
  return el
}
