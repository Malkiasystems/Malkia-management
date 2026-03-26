import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface TxLine { productId: string; qty: number; cost: number }
interface StockLocation { id: string; code: string; name: string; branch_code: string }

export default function StockTransfer({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<{id:string;name:string;cost_price:number;qty_on_hand:number}[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [lines, setLines] = useState<TxLine[]>([{ productId: '', qty: 1, cost: 0 }])
  const [form, setForm] = useState({ date: today(), ref: '', fromLocation: '', toLocation: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: prods }, { count: stCount }, { data: locs }] = await Promise.all([
      supabase.from('products').select('id, name, cost_price, qty_on_hand').eq('is_active', true).order('name'),
      supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'stock_transfer'),
      supabase.from('stock_locations').select('id, code, name, branch_code').eq('is_active', true).order('code'),
    ])
    if (prods) setProducts(prods)
    const stpRef = `STP-10-${String((stCount || 0) + 1).padStart(4, '0')}`
    if (locs && locs.length > 0) {
      setLocations(locs)
      setForm(f => ({ ...f, ref: stpRef, fromLocation: locs[0].code, toLocation: locs.length >= 2 ? locs[1].code : locs[0].code }))
    } else {
      setForm(f => ({ ...f, ref: stpRef }))
    }
  }

  const updateLine = (i: number, field: keyof TxLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) nl[i].cost = p.cost_price
    }
    setLines(nl)
  }

  const totalValue = lines.reduce((s, l) => s + l.qty * l.cost, 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }
  const fromLoc = locations.find(l => l.code === form.fromLocation)
  const toLoc = locations.find(l => l.code === form.toLocation)

  const post = async () => {
    if (!form.fromLocation || !form.toLocation) { showToast('Select From and To locations', 'error'); return }
    if (form.fromLocation === form.toLocation) { showToast('From and To locations cannot be the same', 'error'); return }
    if (lines.every(l => !l.productId || !l.qty)) { showToast('Add at least one product', 'error'); return }
    if (!fromLoc || !toLoc) { showToast('Invalid locations', 'error'); return }
    setPosting(true)
    try {
      const fromLabel = `${fromLoc.code} — ${fromLoc.name}`
      const toLabel = `${toLoc.code} — ${toLoc.name}`
      const { data: j, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Stock Transfer — ${fromLabel} → ${toLabel} — ${form.ref}`,
        journal_type: 'stock_transfer', source_type: 'stock_transfer', source_ref: form.ref,
        posted_by: 'Joe Gembe', status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error(jErr.message)

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'stock_transfer', posting_date: form.date,
        description: `Stock Transfer — ${fromLabel} → ${toLabel}`,
        total_amount: totalValue, status: 'posted', journal_id: j.id,
        notes: `${fromLabel} → ${toLabel}${form.notes ? ' · ' + form.notes : ''}`,
        posted_by: 'Joe Gembe',
      })

      for (const line of lines) {
        if (!line.productId || !line.qty) continue
        // Fetch fresh qty from Supabase at post time — don't use stale local state
        const { data: freshProd } = await supabase.from('products').select('name, qty_on_hand, cost_price').eq('id', line.productId).single()
        if (!freshProd) continue
        if (freshProd.qty_on_hand < line.qty) {
          showToast(`Insufficient stock: ${freshProd.name} · Available: ${freshProd.qty_on_hand}`, 'error')
          setPosting(false); return
        }
        const entryNum = Date.now() + Math.floor(Math.random() * 1000)
        const { error: leErr } = await supabase.from('item_ledger_entries').insert([
          { entry_number: entryNum, product_id: line.productId, entry_type: 'transfer_out', document_type: 'stock_transfer', document_ref: form.ref, posting_date: form.date, qty: -line.qty, cost_amount: (freshProd.cost_price || 0) * line.qty, location_code: fromLoc.code },
          { entry_number: entryNum + 1, product_id: line.productId, entry_type: 'transfer_in', document_type: 'stock_transfer', document_ref: form.ref, posting_date: form.date, qty: line.qty, cost_amount: (freshProd.cost_price || 0) * line.qty, location_code: toLoc.code },
        ])
        if (leErr) console.error('item_ledger_entries error:', leErr.message)
        // Update product_locations with fresh qty
        const { data: fromPL } = await supabase.from('product_locations').select('qty_on_hand').eq('product_id', line.productId).eq('location_code', fromLoc.code).single()
        const { data: toPL } = await supabase.from('product_locations').select('qty_on_hand').eq('product_id', line.productId).eq('location_code', toLoc.code).single()
        const fromQty = Math.max(0, (fromPL?.qty_on_hand || freshProd.qty_on_hand) - line.qty)
        const toQty = (toPL?.qty_on_hand || 0) + line.qty
        await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: fromLoc.id, location_code: fromLoc.code, qty_on_hand: fromQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
        await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: toLoc.id, location_code: toLoc.code, qty_on_hand: toQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
        // Total stock unchanged — no update to products.qty_on_hand needed
      }
      showToast(`${form.ref} posted · ${fromLabel} → ${toLabel} · ${tzs(totalValue)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Stock Transfer" icon="" subtitle="Move stock between locations — total inventory unchanged" color="rgba(61,139,255,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Confirm Transfer'}
      journalNote="Item ledger updated · Location balances updated · Total stock unchanged">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="From Location" req>
            <select className="form-input" value={form.fromLocation} onChange={e => set('fromLocation', e.target.value)}>
              <option value="">— Select source —</option>
              {locations.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name}</option>)}
            </select>
          </FG>
          <FG label="To Location" req>
            <select className="form-input" value={form.toLocation} onChange={e => set('toLocation', e.target.value)}>
              <option value="">— Select destination —</option>
              {locations.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name}</option>)}
            </select>
          </FG>
        </div>
        {fromLoc && toLoc && form.fromLocation !== form.toLocation && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{fromLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fromLoc.name}</div>
            </div>
            <svg width="32" height="16" viewBox="0 0 32 16" fill="none"><path d="M0 8h28M22 2l8 6-8 6" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round"/></svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{toLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{toLoc.name}</div>
            </div>
          </div>
        )}
        {form.fromLocation === form.toLocation && form.fromLocation && (
          <div style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--mono)' }}>From and To cannot be the same location</div>
        )}
        <FG label="Notes"><input className="form-input" placeholder="e.g. Restocking front office from warehouse" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Items to Transfer</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
              <option value="">— Select product —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} · Stock: {p.qty_on_hand}</option>)}
            </select>
            <input type="number" className="form-input" style={{ textAlign: 'center' }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', qty: 1, cost: 0 }])}>+ Add item</button>
        {totalValue > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: 'var(--text3)' }}>Transfer value at cost</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{tzs(totalValue)}</span>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
