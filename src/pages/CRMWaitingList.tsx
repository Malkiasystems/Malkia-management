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
import { renderElementToPdfBlob } from '../lib/customerDocuments'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface Entry {
  id: string; product_id: string; product_name: string | null; qty_wanted: number
  customer_id: string | null; customer_name: string; whatsapp: string | null
  status: string; note: string | null; created_at: string | null
}
interface Group { product_id: string; product_name: string; category: string; inStock: number; entries: Entry[]; totalWanted: number }

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

  // filters
  const [fProduct, setFProduct] = useState('all')
  const [fCategory, setFCategory] = useState('all')
  const [fType, setFType] = useState<'all' | 'returning' | 'new'>('all')
  const [fStock, setFStock] = useState<'all' | 'ready'>('all')
  const [search, setSearch] = useState('')

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
    const cat = new Map<string, string>()
    if (ids.length) {
      const { data: prods } = await supabase.from('products').select('id, qty_on_hand, category').in('id', ids)
      ;(prods || []).forEach((p: any) => { stock.set(p.id, p.qty_on_hand || 0); cat.set(p.id, p.category || '') })
    }
    const map = new Map<string, Group>()
    rows.forEach(r => {
      const g = map.get(r.product_id) || { product_id: r.product_id, product_name: r.product_name || 'Product', category: cat.get(r.product_id) || '', inStock: stock.get(r.product_id) ?? 0, entries: [], totalWanted: 0 }
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

  // ─── filters ──────────────────────────────────────────────────────────────
  const categories = Array.from(new Set(groups.map(g => g.category).filter(Boolean))).sort()
  const productNames = Array.from(new Set(groups.map(g => g.product_name))).sort()

  const visible: Group[] = groups
    .filter(g => fProduct === 'all' || g.product_name === fProduct)
    .filter(g => fCategory === 'all' || g.category === fCategory)
    .filter(g => fStock === 'all' || g.inStock > 0)
    .map(g => ({
      ...g,
      entries: g.entries
        .filter(e => fType === 'all' || (fType === 'returning' ? !!e.customer_id : !e.customer_id))
        .filter(e => {
          if (!search.trim()) return true
          const q = search.trim().toLowerCase()
          return e.customer_name.toLowerCase().includes(q) || (e.whatsapp || '').includes(q) || g.product_name.toLowerCase().includes(q)
        }),
    }))
    .filter(g => g.entries.length > 0)
    .map(g => ({ ...g, totalWanted: g.entries.reduce((t, e) => t + (Number(e.qty_wanted) || 0), 0) }))

  const filtersOn = fProduct !== 'all' || fCategory !== 'all' || fType !== 'all' || fStock !== 'all' || !!search.trim()
  const clearFilters = () => { setFProduct('all'); setFCategory('all'); setFType('all'); setFStock('all'); setSearch('') }

  const readyCount = visible.filter(g => g.inStock > 0).reduce((s, g) => s + g.entries.length, 0)
  const totalWaiting = visible.reduce((s, g) => s + g.entries.length, 0)

  // ─── exports ──────────────────────────────────────────────────────────────
  const rowsForExport = () => visible.flatMap(g => g.entries.map(e => ({
    product: g.product_name, category: g.category, inStock: g.inStock,
    name: e.customer_name, type: e.customer_id ? 'Returning' : 'New',
    whatsapp: e.whatsapp || '', qty: e.qty_wanted, waited: waitedFor(e.created_at),
    status: e.status, note: e.note || '',
  })))

  const exportCsv = () => {
    const rows = rowsForExport()
    if (rows.length === 0) { flash('Nothing to export.', 'err'); return }
    const head = ['Product', 'Category', 'In stock', 'Customer', 'Type', 'WhatsApp', 'Qty wanted', 'Waiting', 'Status', 'Note']
    const body = rows.map(r => [r.product, r.category, r.inStock, `"${r.name}"`, r.type, r.whatsapp, r.qty, r.waited, r.status, `"${r.note}"`].join(','))
    const csv = [head.join(','), ...body].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `waiting-list-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  const exportPdf = async () => {
    const rows = rowsForExport()
    if (rows.length === 0) { flash('Nothing to export.', 'err'); return }
    setBusy('pdf')
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:28px;background:#fff;color:#1a1a1a;font-family:Arial,sans-serif;font-size:12px'
    const body = rows.map(r => `<tr>
      <td style="padding:6px;border-top:1px solid #eee">${r.product}</td>
      <td style="padding:6px;border-top:1px solid #eee;color:#666">${r.category}</td>
      <td style="padding:6px;border-top:1px solid #eee">${r.name}</td>
      <td style="padding:6px;border-top:1px solid #eee;color:${r.type === 'Returning' ? '#5EA8A2' : '#d97706'}">${r.type}</td>
      <td style="padding:6px;border-top:1px solid #eee">${r.whatsapp}</td>
      <td style="padding:6px;text-align:right;border-top:1px solid #eee;font-weight:700">${r.qty}</td>
      <td style="padding:6px;border-top:1px solid #eee;color:#666">${r.waited}</td>
      <td style="padding:6px;text-align:right;border-top:1px solid #eee;color:${r.inStock > 0 ? '#16a34a' : '#dc2626'}">${r.inStock}</td>
    </tr>`).join('')
    const filterNote = filtersOn ? `<div style="font-size:10px;color:#888;margin-bottom:8px">Filtered: ${[fProduct !== 'all' ? fProduct : '', fCategory !== 'all' ? fCategory : '', fType !== 'all' ? fType : '', fStock === 'ready' ? 'in stock only' : '', search.trim()].filter(Boolean).join(' · ')}</div>` : ''
    el.innerHTML = `
      <div style="border-bottom:2px solid #5EA8A2;padding-bottom:10px;margin-bottom:10px">
        <div style="font-size:18px;font-weight:800;color:#5E2230">Waiting List</div>
        <div style="color:#666">Malkia Wellness Group Ltd · ${new Date().toLocaleDateString('en-GB')} · ${rows.length} waiting</div>
      </div>
      ${filterNote}
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f4f4f4">
          <th style="padding:6px;text-align:left">Product</th><th style="padding:6px;text-align:left">Category</th>
          <th style="padding:6px;text-align:left">Customer</th><th style="padding:6px;text-align:left">Type</th>
          <th style="padding:6px;text-align:left">WhatsApp</th><th style="padding:6px;text-align:right">Qty</th>
          <th style="padding:6px;text-align:left">Waiting</th><th style="padding:6px;text-align:right">In stock</th>
        </tr></thead><tbody>${body}</tbody></table>`
    document.body.appendChild(el)
    try {
      const blob = await renderElementToPdfBlob(el)
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `waiting-list-${new Date().toISOString().slice(0, 10)}.pdf`; a.click()
    } catch (err: any) { flash('PDF failed: ' + (err?.message || 'unknown'), 'err') }
    finally { document.body.removeChild(el); setBusy('') }
  }

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

      {tab === 'waiting' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: 10, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / phone / product"
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, width: 200 }} />

          <select value={fProduct} onChange={e => setFProduct(e.target.value)} style={selS}>
            <option value="all">All products</option>
            {productNames.map(p2 => <option key={p2} value={p2}>{p2}</option>)}
          </select>

          <select value={fCategory} onChange={e => setFCategory(e.target.value)} style={selS}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={fType} onChange={e => setFType(e.target.value as any)} style={selS}>
            <option value="all">Everyone</option>
            <option value="returning">Returning customers</option>
            <option value="new">New enquiries</option>
          </select>

          <select value={fStock} onChange={e => setFStock(e.target.value as any)} style={selS}>
            <option value="all">Any stock</option>
            <option value="ready">In stock — ready to call</option>
          </select>

          {filtersOn && <button onClick={clearFilters} style={{ ...btn, color: 'var(--text3)' }}>Clear</button>}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>{totalWaiting} shown</span>
            <button onClick={exportPdf} disabled={busy === 'pdf'} style={btn}>{busy === 'pdf' ? '…' : 'PDF'}</button>
            <button onClick={exportCsv} style={btn}>CSV</button>
          </div>
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {!loading && tab === 'waiting' && (
        visible.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>{filtersOn ? 'No one matches these filters.' : 'Nobody is waiting. Add someone when an item is out of stock.'}</div>
          : visible.map(g => (
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
const selS: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }
const dropdown: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', marginBottom: 8, maxHeight: 160, overflowY: 'auto' }
const ddItem: React.CSSProperties = { padding: '8px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }
