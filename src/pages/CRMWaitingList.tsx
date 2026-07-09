// ════════════════════════════════════════════════════════════════════════════
// CRMWaitingList.tsx
// Out-of-stock demand. When someone asks for a product you don't have, they go
// on this list instead of walking away unrecorded. Grouped by product, with the
// CURRENT stock shown, so the moment stock lands you can see who to call.
//
// Each waiter is flagged as a RETURNING customer (linked to a customers row) or
// a NEW enquiry (never bought before) — they warrant different follow-up.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface Entry {
  id: string; product_id: string; product_name: string | null; qty_wanted: number
  customer_id: string | null; customer_name: string; whatsapp: string | null
  status: string; note: string | null; created_at: string | null
}
interface Group { product_id: string; product_name: string; inStock: number; entries: Entry[]; totalWanted: number }

function waitedFor(s: string | null): string {
  if (!s) return ''
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`
}
const waLink = (wa: string | null, name: string, product: string) => {
  if (!wa) return null
  const num = wa.replace(/[^0-9]/g, '')
  const msg = encodeURIComponent(`Habari ${name}, ${product} imepatikana tena Malkia. Tukuwekee?`)
  return `https://wa.me/${num}?text=${msg}`
}

export default function CRMWaitingList({ onNav: _onNav }: Props) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'waiting' | 'closed'>('waiting')
  const [groups, setGroups] = useState<Group[]>([])
  const [closed, setClosed] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (m: string, t: 'ok' | 'err' = 'ok') => { setToast({ msg: m, type: t }); setTimeout(() => setToast(null), 3000) }

  // add form
  const [showAdd, setShowAdd] = useState(false)
  const [prodQuery, setProdQuery] = useState('')
  const [prodResults, setProdResults] = useState<{ id: string; name: string; qty_on_hand: number }[]>([])
  const [pickedProd, setPickedProd] = useState<{ id: string; name: string } | null>(null)
  const [custQuery, setCustQuery] = useState('')
  const [custResults, setCustResults] = useState<{ id: string; name: string; whatsapp: string | null }[]>([])
  const [pickedCust, setPickedCust] = useState<{ id: string; name: string; whatsapp: string | null } | null>(null)
  const [walkName, setWalkName] = useState('')
  const [walkPhone, setWalkPhone] = useState('')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    if (tab === 'closed') {
      const { data } = await supabase.from('waiting_list').select('*').in('status', ['fulfilled', 'cancelled']).order('closed_at', { ascending: false }).limit(200)
      setClosed((data || []) as Entry[]); setLoading(false); return
    }
    const { data } = await supabase.from('waiting_list').select('*').in('status', ['waiting', 'notified']).order('created_at', { ascending: true })
    const rows = (data || []) as Entry[]
    const ids = Array.from(new Set(rows.map(r => r.product_id)))
    const stock = new Map<string, number>()
    if (ids.length) {
      const { data: prods } = await supabase.from('products').select('id, qty_on_hand').in('id', ids)
      ;(prods || []).forEach((p: any) => stock.set(p.id, p.qty_on_hand || 0))
    }
    const map = new Map<string, Group>()
    rows.forEach(r => {
      const g = map.get(r.product_id) || { product_id: r.product_id, product_name: r.product_name || 'Product', inStock: stock.get(r.product_id) ?? 0, entries: [], totalWanted: 0 }
      g.entries.push(r); g.totalWanted += Number(r.qty_wanted) || 0
      map.set(r.product_id, g)
    })
    setGroups(Array.from(map.values()).sort((a, b) => (b.inStock > 0 ? 1 : 0) - (a.inStock > 0 ? 1 : 0) || b.entries.length - a.entries.length))
    setLoading(false)
  }, [tab])
  useEffect(() => { load() }, [load])

  const searchProducts = async (v: string) => {
    setProdQuery(v); setPickedProd(null)
    if (v.trim().length < 2) { setProdResults([]); return }
    const { data } = await supabase.from('products').select('id, name, qty_on_hand').eq('is_active', true).ilike('name', `%${v}%`).limit(6)
    setProdResults((data || []) as any)
  }
  const searchCustomers = async (v: string) => {
    setCustQuery(v); setPickedCust(null)
    if (v.trim().length < 3) { setCustResults([]); return }
    const cleaned = v.replace(/[\s+\-()]/g, '')
    const { data } = await supabase.from('customers').select('id, name, whatsapp').or(`whatsapp.ilike.%${cleaned}%,name.ilike.%${v}%`).limit(6)
    setCustResults((data || []) as any)
  }

  const addEntry = async () => {
    if (!pickedProd) { flash('Choose the product they want.', 'err'); return }
    const name = pickedCust ? pickedCust.name : walkName.trim()
    if (!name) { flash('Enter who is waiting.', 'err'); return }
    setBusy('add')
    const { error } = await supabase.from('waiting_list').insert({
      product_id: pickedProd.id, product_name: pickedProd.name,
      qty_wanted: parseFloat(qty) || 1,
      customer_id: pickedCust?.id || null,           // NULL = never bought before
      customer_name: name,
      whatsapp: pickedCust ? pickedCust.whatsapp : (walkPhone.trim() || null),
      note: note.trim() || null, status: 'waiting',
      added_by: user?.id || null, added_by_name: user?.full_name || null,
    })
    setBusy('')
    if (error) { flash('Failed: ' + error.message, 'err'); return }
    flash(`${name} added to the waiting list`)
    setShowAdd(false); setPickedProd(null); setProdQuery(''); setPickedCust(null); setCustQuery('')
    setWalkName(''); setWalkPhone(''); setQty('1'); setNote('')
    load()
  }

  const close = async (e: Entry, status: 'fulfilled' | 'cancelled') => {
    setBusy(e.id)
    const { error } = await supabase.from('waiting_list').update({
      status, closed_at: new Date().toISOString(), closed_by_name: user?.full_name || null,
    }).eq('id', e.id)
    setBusy('')
    if (error) { flash('Failed: ' + error.message, 'err'); return }
    flash(`${e.customer_name} marked ${status}`); load()
  }
  const markNotified = async (e: Entry) => {
    setBusy(e.id)
    await supabase.from('waiting_list').update({ status: 'notified', notified_at: new Date().toISOString() }).eq('id', e.id)
    setBusy(''); flash(`${e.customer_name} marked notified`); load()
  }

  const readyCount = groups.filter(g => g.inStock > 0).reduce((s, g) => s + g.entries.length, 0)
  const totalWaiting = groups.reduce((s, g) => s + g.entries.length, 0)

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Waiting List</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
            People waiting for out-of-stock products. When stock lands, they're the first calls to make.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+ Add Waiter</button>
      </div>

      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 460, maxWidth: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Add to Waiting List</div>

            <label style={lbl}>Product they want</label>
            <input value={pickedProd ? pickedProd.name : prodQuery} onChange={e => searchProducts(e.target.value)} placeholder="Search product…" style={inp} />
            {prodResults.length > 0 && !pickedProd && (
              <div style={dropdown}>
                {prodResults.map(p => (
                  <div key={p.id} onClick={() => { setPickedProd({ id: p.id, name: p.name }); setProdResults([]) }} style={ddItem}>
                    {p.name} <span style={{ color: p.qty_on_hand > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 11 }}>({p.qty_on_hand} in stock)</span>
                  </div>
                ))}
              </div>
            )}

            <label style={lbl}>Who is waiting</label>
            <input value={pickedCust ? pickedCust.name : custQuery} onChange={e => searchCustomers(e.target.value)} placeholder="Search existing customer by name or WhatsApp…" style={inp} />
            {custResults.length > 0 && !pickedCust && (
              <div style={dropdown}>
                {custResults.map(c => (
                  <div key={c.id} onClick={() => { setPickedCust(c); setCustResults([]); setWalkName(''); setWalkPhone('') }} style={ddItem}>
                    {c.name} <span style={{ color: 'var(--text3)', fontSize: 11 }}>{c.whatsapp || ''}</span>
                  </div>
                ))}
              </div>
            )}
            {pickedCust
              ? <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>Returning customer · <button onClick={() => { setPickedCust(null); setCustQuery('') }} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11 }}>clear</button></div>
              : (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 6px' }}>Not in the system? Enter them as a new enquiry:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={walkName} onChange={e => setWalkName(e.target.value)} placeholder="Name" style={{ ...inp, flex: 1 }} />
                    <input value={walkPhone} onChange={e => setWalkPhone(e.target.value)} placeholder="WhatsApp" style={{ ...inp, flex: 1 }} />
                  </div>
                </>
              )}

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 100 }}><label style={lbl}>Qty</label><input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} style={inp} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. wants size L" style={inp} /></div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={addEntry} disabled={busy === 'add'} style={{ flex: 1, padding: 10, borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{busy === 'add' ? 'Saving…' : 'Add to list'}</button>
              <button onClick={() => setShowAdd(false)} style={{ padding: 10, borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, margin: '12px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        {([['waiting', `Waiting${totalWaiting ? ` (${totalWaiting})` : ''}`], ['closed', 'Fulfilled / Cancelled']] as const).map(([k, lbl2]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${tab === k ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === k ? 'var(--accent)' : 'var(--surface2)', color: tab === k ? '#fff' : 'var(--text2)' }}>{lbl2}</button>
        ))}
        {tab === 'waiting' && readyCount > 0 && (
          <div style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, background: 'rgba(22,163,74,.12)', border: '1px solid var(--green, #16a34a)', color: 'var(--green, #16a34a)', fontSize: 12, fontWeight: 700 }}>
            {readyCount} ready to call — stock available
          </div>
        )}
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {!loading && tab === 'waiting' && (
        groups.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Nobody is waiting. Add someone when an item is out of stock.</div>
          : groups.map(g => (
            <div key={g.product_id} style={{ border: `1px solid ${g.inStock > 0 ? 'var(--green, #16a34a)' : 'var(--border)'}`, borderRadius: 10, marginBottom: 12, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{g.product_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{g.entries.length} waiting · {g.totalWanted} units wanted</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 7,
                  background: g.inStock > 0 ? 'rgba(22,163,74,.15)' : 'rgba(220,38,38,.12)',
                  color: g.inStock > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}>
                  {g.inStock > 0 ? `${g.inStock} in stock — call them` : 'Out of stock'}
                </span>
              </div>
              {g.entries.map(e => {
                const returning = !!e.customer_id
                const link = waLink(e.whatsapp, e.customer_name, g.product_name)
                return (
                  <div key={e.id} style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{e.customer_name}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: .3,
                          background: returning ? 'rgba(94,168,162,.15)' : 'rgba(217,119,6,.15)',
                          color: returning ? 'var(--accent)' : 'var(--yellow, #d97706)' }}>
                          {returning ? 'Returning customer' : 'New enquiry'}
                        </span>
                        {e.status === 'notified' && <span style={{ fontSize: 10, color: 'var(--text3)' }}>· notified</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        wants {e.qty_wanted} · waiting {waitedFor(e.created_at)}{e.whatsapp ? ` · ${e.whatsapp}` : ''}{e.note ? ` · ${e.note}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {link && <a href={link} target="_blank" rel="noreferrer" style={{ ...btn, background: 'rgba(37,211,102,.15)', color: '#25D366', border: '1px solid rgba(37,211,102,.4)', textDecoration: 'none' }}>WhatsApp</a>}
                      {e.status !== 'notified' && <button disabled={busy === e.id} onClick={() => markNotified(e)} style={btn}>Mark notified</button>}
                      <button disabled={busy === e.id} onClick={() => close(e, 'fulfilled')} style={{ ...btn, background: 'var(--green, #16a34a)', color: '#fff', border: 'none' }}>Fulfilled</button>
                      <button disabled={busy === e.id} onClick={() => close(e, 'cancelled')} style={{ ...btn, color: 'var(--text3)' }}>Cancel</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
      )}

      {!loading && tab === 'closed' && (
        closed.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Nothing closed yet.</div>
          : <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface2)' }}>{['Customer', 'Product', 'Wanted', 'Type', 'Outcome'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
              <tbody>{closed.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px' }}>{e.customer_name}</td>
                  <td style={{ padding: '9px 12px' }}>{e.product_name}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)' }}>{e.qty_wanted}</td>
                  <td style={{ padding: '9px 12px', fontSize: 11, color: e.customer_id ? 'var(--accent)' : 'var(--yellow, #d97706)' }}>{e.customer_id ? 'Returning' : 'New'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: e.status === 'fulfilled' ? 'var(--green, #16a34a)' : 'var(--text3)' }}>{e.status === 'fulfilled' ? 'Fulfilled' : 'Cancelled'}</span>
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, color: '#fff', background: toast.type === 'ok' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 13, zIndex: 3000 }}>{toast.msg}</div>}
    </div>
  )
}

const btn: React.CSSProperties = { padding: '6px 11px', borderRadius: 7, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4, margin: '8px 0 4px' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, marginBottom: 6 }
const dropdown: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', marginBottom: 8, maxHeight: 160, overflowY: 'auto' }
const ddItem: React.CSSProperties = { padding: '8px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }
