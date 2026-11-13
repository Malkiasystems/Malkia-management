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
import { localIso } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { renderElementToPdfBlob } from '../lib/customerDocuments'
import { sendWaitlistNotice } from '../lib/wa'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface Entry {
  id: string; product_id: string; product_name: string | null; qty_wanted: number
  customer_id: string | null; customer_name: string; whatsapp: string | null
  status: string; note: string | null; created_at: string | null; added_by_name: string | null
  notified_at?: string | null; notify_wa_message_id?: string | null; notify_count?: number | null
  offer_percent?: number | null; offer_price?: number | null; offer_expires_at?: string | null
  customer_reply?: string | null
}
interface Group { product_id: string; product_name: string; category: string; inStock: number; retail: number; entries: Entry[]; totalWanted: number }

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
  const { user, can, isSuperAdmin } = useAuth()
  // Anyone who serves customers can ADD a waiter (they're the ones who meet her).
  // Closing one out — notified / fulfilled / cancelled — decides whether the
  // customer actually got called, so that stays with CRM or management.
  const canManage = isSuperAdmin() || can('crm.edit')
  const [tab, setTab] = useState<'waiting' | 'closed'>('waiting')
  const [groups, setGroups] = useState<Group[]>([])
  const [closed, setClosed] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [bulk, setBulk] = useState('')   // product id while a "tell all" run is going
  // the entry a WhatsApp message is being sent to right now. Kept apart from `busy`
  // (which covers Fulfilled, Cancel and Told by phone) so the WhatsApp button only
  // ever says "Sending..." when a message really is being sent.
  const [telling, setTelling] = useState('')
  // the offer being prepared: for one waiting customer, or for everyone waiting for a product
  const [offer, setOffer] = useState<{ group: Group; entry: Entry | null } | null>(null)
  const [pct, setPct] = useState('5')
  const [maxPct, setMaxPct] = useState(10)
  // delivery state of the WhatsApp notice for each entry, from the message log
  const [ticks, setTicks] = useState<Record<string, { status: string; error: string | null }>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (m: string, t: 'ok' | 'err' = 'ok') => { setToast({ msg: m, type: t }); setTimeout(() => setToast(null), t === 'err' ? 9000 : 3000) }

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
    const msgIds = rows.map(r => r.notify_wa_message_id).filter(Boolean) as string[]
    if (msgIds.length) {
      const { data: ms } = await supabase.from('wa_messages').select('id, status, error').in('id', msgIds)
      const t: Record<string, { status: string; error: string | null }> = {}
      ;(ms || []).forEach((m: any) => { t[m.id] = { status: m.status, error: m.error } })
      setTicks(t)
    } else setTicks({})
    const ids = Array.from(new Set(rows.map(r => r.product_id)))
    const stock = new Map<string, number>()
    const cat = new Map<string, string>()
    const retail = new Map<string, number>()
    if (ids.length) {
      const { data: prods } = await supabase.from('products').select('id, qty_on_hand, category, selling_price').in('id', ids)
      ;(prods || []).forEach((p: any) => { stock.set(p.id, p.qty_on_hand || 0); cat.set(p.id, p.category || ''); retail.set(p.id, Number(p.selling_price) || 0) })
    }
    const map = new Map<string, Group>()
    rows.forEach(r => {
      const g = map.get(r.product_id) || { product_id: r.product_id, product_name: r.product_name || 'Product', category: cat.get(r.product_id) || '', inStock: stock.get(r.product_id) ?? 0, retail: retail.get(r.product_id) ?? 0, entries: [], totalWanted: 0 }
      g.entries.push(r); g.totalWanted += Number(r.qty_wanted) || 0
      map.set(r.product_id, g)
    })
    setGroups(Array.from(map.values()).sort((a, b) => (b.inStock > 0 ? 1 : 0) - (a.inStock > 0 ? 1 : 0) || b.entries.length - a.entries.length))
    setLoading(false)
  }, [tab])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'waitlist_offer').maybeSingle().then(({ data }: any) => {
      try { const v = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : null; if (Number(v?.max_percent) > 0) setMaxPct(Number(v.max_percent)) } catch { /* keep the default */ }
    })
  }, [])

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
    if (!canManage) { flash('You need CRM rights to close a waiting entry.', 'err'); return }
    setBusy(e.id)
    const { error } = await supabase.from('waiting_list').update({
      status, closed_at: new Date().toISOString(), closed_by_name: user?.full_name || null,
    }).eq('id', e.id)
    setBusy('')
    if (error) { flash('Failed: ' + error.message, 'err'); return }
    flash(`${e.customer_name} marked ${status}`); load()
  }
  // Price the customer is told: retail less the percentage, rounded down to the
  // nearest 100 (the same sum the sending function does; it has the final say).
  const priceAfter = (retail: number, percent: number) => Math.floor((retail * (1 - percent / 100)) / 100) * 100

  // Tell a waiting customer through the business number. Returns what happened
  // so the "tell all" run can count results without a toast per person.
  const tell = async (e: Entry, percent: number, force = false): Promise<{ result: 'sent' | 'recent' | 'failed'; message: string }> => {
    try {
      await sendWaitlistNotice(e.id, percent, force)
      return { result: 'sent', message: '' }
    } catch (err: any) {
      return { result: err?.code === 'recent' ? 'recent' : 'failed', message: err?.message || 'Could not send' }
    }
  }
  const sendOffer = async () => {
    if (!offer) return
    const percent = Number(pct)
    if (!Number.isFinite(percent) || percent <= 0) { flash('Enter the discount percentage to offer.', 'err'); return }
    if (percent > maxPct) { flash(`The discount cannot be more than ${maxPct}%.`, 'err'); return }
    const { group: g, entry } = offer
    setOffer(null)
    if (entry) {
      setTelling(entry.id)
      let r = await tell(entry, percent)
      if (r.result === 'recent' && window.confirm(`${entry.customer_name}: ${r.message}\n\nSend the message again anyway?`)) r = await tell(entry, percent, true)
      setTelling('')
      if (r.result === 'sent') flash(`${entry.customer_name} told on WhatsApp: ${percent}% off, TZS ${priceAfter(g.retail, percent).toLocaleString()}`)
      else if (r.result === 'failed') flash(r.message, 'err')
      load(); return
    }
    const targets = g.entries.filter(e => e.status === 'waiting' && e.whatsapp)
    setBulk(g.product_id)
    let sent = 0, failed = 0, firstError = ''
    for (const e of targets) {
      const r = await tell(e, percent)
      if (r.result === 'sent') sent++
      else { failed++; if (!firstError) firstError = `${e.customer_name}: ${r.message}` }
    }
    setBulk('')
    flash(failed ? `${sent} told, ${failed} not sent. First problem: ${firstError}` : `${sent} ${sent === 1 ? 'person' : 'people'} told on WhatsApp`, failed ? 'err' : 'ok')
    load()
  }
  const tellOne = (g: Group, e: Entry) => setOffer({ group: g, entry: e })
  const tellAll = (g: Group) => {
    if (!g.entries.some(e => e.status === 'waiting' && e.whatsapp)) { flash('Everyone here has already been told, or has no WhatsApp number.', 'err'); return }
    setOffer({ group: g, entry: null })
  }

  const markNotified = async (e: Entry) => {
    if (!canManage) { flash('You need CRM rights to update a waiting entry.', 'err'); return }
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
    addedBy: e.added_by_name || '', status: e.status, note: e.note || '',
  })))

  const exportCsv = () => {
    const rows = rowsForExport()
    if (rows.length === 0) { flash('Nothing to export.', 'err'); return }
    const head = ['Product', 'Category', 'In stock', 'Customer', 'Type', 'WhatsApp', 'Qty wanted', 'Waiting', 'Added by', 'Status', 'Note']
    const body = rows.map(r => [r.product, r.category, r.inStock, `"${r.name}"`, r.type, r.whatsapp, r.qty, r.waited, `"${r.addedBy}"`, r.status, `"${r.note}"`].join(','))
    const csv = [head.join(','), ...body].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `waiting-list-${localIso(new Date())}.csv`; a.click()
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
      <td style="padding:6px;border-top:1px solid #eee;color:#666">${r.addedBy}</td>
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
          <th style="padding:6px;text-align:left">Waiting</th><th style="padding:6px;text-align:left">Added by</th>
          <th style="padding:6px;text-align:right">In stock</th>
        </tr></thead><tbody>${body}</tbody></table>`
    document.body.appendChild(el)
    try {
      const blob = await renderElementToPdfBlob(el)
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `waiting-list-${localIso(new Date())}.pdf`; a.click()
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

      {!canManage && (
        <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          You can add people to the waiting list and message them. Marking an entry notified, fulfilled or cancelled needs CRM rights.
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {g.inStock > 0 && g.entries.some(e => e.status === 'waiting' && e.whatsapp) && (
                    <button disabled={!!bulk || !!busy || !!telling} onClick={() => tellAll(g)}
                      title="Sends the back-in-stock message from the business number to everyone here who has not been told yet"
                      style={{ ...btn, background: '#25D366', color: '#06301A', border: 'none' }}>
                      {bulk === g.product_id ? 'Sending...' : `Tell all ${g.entries.filter(e => e.status === 'waiting' && e.whatsapp).length} on WhatsApp`}
                    </button>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 7,
                  background: g.inStock > 0 ? 'rgba(22,163,74,.15)' : 'rgba(220,38,38,.12)',
                  color: g.inStock > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}>
                  {g.inStock > 0 ? `${g.inStock} in stock — call them` : 'Out of stock'}
                  </span>
                </div>
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
                        {e.status === 'notified' && (() => {
                          const tk = e.notify_wa_message_id ? ticks[e.notify_wa_message_id] : undefined
                          const when = e.notified_at ? new Date(e.notified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
                          if (!tk) return <span style={{ fontSize: 10, color: 'var(--text3)' }}>told{when ? ` ${when}` : ''} (by phone or own WhatsApp)</span>
                          const bad = tk.status === 'failed'
                          const label = bad ? 'not delivered' : tk.status === 'read' ? 'read' : tk.status === 'delivered' ? 'delivered' : 'sent'
                          return <span title={bad ? (tk.error || '') : 'Sent from the business number'} style={{ fontSize: 10, fontWeight: 700, color: bad ? 'var(--red, #dc2626)' : 'var(--green, #16a34a)' }}>
                            WhatsApp {label}{when ? ` ${when}` : ''}{(e.notify_count || 0) > 1 ? ` (${e.notify_count} times)` : ''}
                          </span>
                        })()}
                        {e.customer_reply === 'hold' && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: 'var(--green, #16a34a)', color: '#fff', textTransform: 'uppercase', letterSpacing: .3 }}>Replied: hold one for me</span>}
                        {e.customer_reply === 'call' && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#d97706', color: '#fff', textTransform: 'uppercase', letterSpacing: .3 }}>Asked for a call</span>}
                      </div>
                      {e.offer_percent ? (() => {
                        const ends = e.offer_expires_at ? new Date(e.offer_expires_at) : null
                        const live = ends ? ends.getTime() > Date.now() : false
                        return <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: live ? 'var(--accent)' : 'var(--text3)' }}>
                          Offered {e.offer_percent}% off: TZS {Number(e.offer_price || 0).toLocaleString()}
                          {ends ? (live ? ` until ${ends.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ` (offer ended ${ends.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`) : ''}
                        </div>
                      })() : null}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        wants {e.qty_wanted} · waiting {waitedFor(e.created_at)}{e.whatsapp ? ` · ${e.whatsapp}` : ''}{e.added_by_name ? ` · added by ${e.added_by_name}` : ''}{e.note ? ` · ${e.note}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {g.inStock > 0 && e.whatsapp && (
                        <button disabled={busy === e.id || telling === e.id || !!bulk} onClick={() => tellOne(g, e)}
                          title="Sends the back-in-stock message from the business number. It is recorded and shows in the WhatsApp Inbox."
                          style={{ ...btn, background: 'rgba(37,211,102,.15)', color: '#25D366', border: '1px solid rgba(37,211,102,.4)' }}>
                          {telling === e.id ? 'Sending...' : e.status === 'notified' ? 'Tell again' : 'Tell on WhatsApp'}
                        </button>
                      )}
                      {link && g.inStock > 0 && <a href={link} target="_blank" rel="noreferrer" title="Opens your own WhatsApp. Not recorded, and it does not come from the business number."
                        style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center', textDecoration: 'underline' }}>own WhatsApp</a>}
                      {canManage && e.status !== 'notified' && <button disabled={busy === e.id} onClick={() => markNotified(e)} title="Use this when you told them by phone" style={btn}>Told by phone</button>}
                      {canManage && <button disabled={busy === e.id} onClick={() => close(e, 'fulfilled')} style={{ ...btn, background: 'var(--green, #16a34a)', color: '#fff', border: 'none' }}>Fulfilled</button>}
                      {canManage && <button disabled={busy === e.id} onClick={() => close(e, 'cancelled')} style={{ ...btn, color: 'var(--text3)' }}>Cancel</button>}
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
              <thead><tr style={{ background: 'var(--surface2)' }}>{['Customer', 'Product', 'Wanted', 'Type', 'Added by', 'Outcome'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
              <tbody>{closed.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px' }}>{e.customer_name}</td>
                  <td style={{ padding: '9px 12px' }}>{e.product_name}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)' }}>{e.qty_wanted}</td>
                  <td style={{ padding: '9px 12px', fontSize: 11, color: e.customer_id ? 'var(--accent)' : 'var(--yellow, #d97706)' }}>{e.customer_id ? 'Returning' : 'New'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text3)' }}>{e.added_by_name || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: e.status === 'fulfilled' ? 'var(--green, #16a34a)' : 'var(--text3)' }}>{e.status === 'fulfilled' ? 'Fulfilled' : 'Cancelled'}</span>
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
      )}

      {offer && (() => {
        const g = offer.group
        const n = offer.entry ? 1 : g.entries.filter(e => e.status === 'waiting' && e.whatsapp).length
        const percent = Number(pct)
        const ok = Number.isFinite(percent) && percent > 0 && percent <= maxPct
        return (
          <div onClick={() => setOffer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div onClick={ev => ev.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 430, maxWidth: '92%' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{offer.entry ? `Tell ${offer.entry.customer_name}` : `Tell ${n} ${n === 1 ? 'person' : 'people'}`}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 3 }}>{g.product_name} is back. The message goes from the business WhatsApp number.</div>
              <label style={lbl}>Discount to offer (up to {maxPct}%)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input autoFocus type="number" min={1} max={maxPct} step={1} value={pct} onChange={ev => setPct(ev.target.value)}
                  onKeyDown={ev => { if (ev.key === 'Enter' && ok && g.retail > 0) sendOffer() }} style={{ ...inp, width: 100, marginBottom: 0, fontSize: 16, fontWeight: 700 }} />
                <span style={{ fontSize: 16, fontWeight: 700 }}>%</span>
              </div>
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--surface2)', fontSize: 13, lineHeight: 1.6 }}>
                {g.retail > 0 ? (ok
                  ? <>Normal price <b>TZS {g.retail.toLocaleString()}</b>. The customer will be told <b>TZS {priceAfter(g.retail, percent).toLocaleString()}</b> if they pay within 24 hours.</>
                  : <span style={{ color: 'var(--red, #dc2626)' }}>Enter a percentage from 1 to {maxPct}.</span>)
                  : <span style={{ color: 'var(--red, #dc2626)' }}>This product has no retail price set, so the offer cannot be sent.</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>{n === 1 ? 'This message is charged.' : `${n} messages will be sent, and each one is charged.`} The offer is recorded so the cashier can honour it.</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button onClick={() => setOffer(null)} style={btn}>Cancel</button>
                <button disabled={!ok || !(g.retail > 0)} onClick={sendOffer} style={{ ...btn, background: '#25D366', color: '#06301A', border: 'none', opacity: ok && g.retail > 0 ? 1 : .5 }}>{n === 1 ? 'Send' : `Send to ${n}`}</button>
              </div>
            </div>
          </div>
        )
      })()}

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
