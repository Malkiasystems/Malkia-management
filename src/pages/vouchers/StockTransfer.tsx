import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface TxLine { productId: string; qty: number; cost: number }

export default function StockTransfer({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<{id:string;name:string;cost_price:number;qty_on_hand:number}[]>([])
  const [lines, setLines] = useState<TxLine[]>([{ productId: '', qty: 1, cost: 0 }])
  const [form, setForm] = useState({ date: today(), ref: '', fromBranch: 'DSM HQ', toBranch: 'Arusha Branch', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])
  const loadData = async () => {
    const [{ data: prods }, { count }] = await Promise.all([
      supabase.from('products').select('id, name, cost_price, qty_on_hand').eq('is_active', true).order('name'),
      supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'stock_transfer'),
    ])
    if (prods) setProducts(prods)
    set('ref', genRef('ST', (count || 0) + 1))
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

  const post = async () => {
    if (form.fromBranch === form.toBranch) { showToast('From and To branches cannot be the same', 'error'); return }
    if (lines.every(l => !l.productId || !l.qty)) { showToast('Add at least one product with quantity', 'error'); return }
    setPosting(true)
    try {
      const { data: j, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Stock Transfer — ${form.fromBranch} → ${form.toBranch} — ${form.ref}`,
        journal_type: 'stock_transfer', source_type: 'stock_transfer', source_ref: form.ref,
        posted_by: 'Joe Gembe', status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error(jErr.message)

      // For single-location: just log the transfer, no GL impact
      // For multi-location with separate inventory accounts: Dr Inventory-To / Cr Inventory-From
      // Current setup: single inventory account 1110 — just update item ledger
      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'stock_transfer', posting_date: form.date,
        description: `Stock Transfer — ${form.fromBranch} → ${form.toBranch}`,
        total_amount: totalValue, status: 'posted', journal_id: j.id,
        notes: `${form.fromBranch} → ${form.toBranch}${form.notes ? ' · ' + form.notes : ''}`,
        posted_by: 'Joe Gembe',
      })

      // Update item ledger + validate stock
      for (const line of lines) {
        if (!line.productId || !line.qty) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue
        if (prod.qty_on_hand < line.qty) {
          showToast(`Insufficient stock for ${prod.name}. Available: ${prod.qty_on_hand}`, 'error')
          setPosting(false); return
        }
        // Stock stays the same total — just changes location
        await supabase.from('item_ledger_entries').insert([
          { product_id: line.productId, entry_type: 'transfer_out', document_type: 'stock_transfer', document_ref: form.ref, posting_date: form.date, qty: -line.qty, cost_amount: line.cost * line.qty, location: form.fromBranch },
          { product_id: line.productId, entry_type: 'transfer_in', document_type: 'stock_transfer', document_ref: form.ref, posting_date: form.date, qty: line.qty, cost_amount: line.cost * line.qty, location: form.toBranch },
        ])
      }

      showToast(`${form.ref} posted · ${lines.filter(l=>l.productId&&l.qty).length} products · ${form.fromBranch} → ${form.toBranch} · ${tzs(totalValue)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Stock Transfer" icon="" subtitle="Move stock between branches — total inventory unchanged" color="rgba(61,139,255,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Confirm Transfer'}
      journalNote="Item ledger updated · Total stock unchanged · Transfer logged by branch">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="From Branch" req>
            <select className="form-input" value={form.fromBranch} onChange={e => set('fromBranch', e.target.value)}>
              <option>DSM HQ</option><option>Arusha Branch</option><option>Online Warehouse</option>
            </select>
          </FG>
          <FG label="To Branch" req>
            <select className="form-input" value={form.toBranch} onChange={e => set('toBranch', e.target.value)}>
              <option>Arusha Branch</option><option>DSM HQ</option><option>Online Warehouse</option>
            </select>
          </FG>
        </div>
        <FG label="Notes"><input className="form-input" placeholder="Reason for transfer" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
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
