import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; qty_on_hand: number; cost_price: number }
interface AdjLine { productId: string; qty: number; reason: string }

export default function StockAdjustment({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [lines, setLines] = useState<AdjLine[]>([{ productId: '', qty: 1, reason: '' }])
  const [form, setForm] = useState({ date: today(), ref: '', type: 'increase', reason: 'count', approvedBy: 'Joe Gembe', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadProducts(); loadNextRef() }, [])

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, qty_on_hand, cost_price').eq('is_active', true).order('name')
    if (data) setProducts(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('stock_adjustment')
    setForm(f => ({ ...f, ref }))
  } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'stock_adjustment')
    set('ref', 'ADJ-10-????' + 1))
  }

  const updateLine = (i: number, k: keyof AdjLine, v: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [k]: v as never }; setLines(nl)
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (lines.every(l => !l.productId)) { showToast('Please select at least one product', 'error'); return }
    setPosting(true)

    try {
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['1110', '3040', '5080'])
      const inventoryId = acctData?.find(a => a.code === '1110')?.id
      // equityId not needed
      const writeoffId = acctData?.find(a => a.code === '5080')?.id
      if (!inventoryId) throw new Error('Inventory account 1110 not found')

      const { error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'stock_adjustment', posting_date: form.date,
        description: `Stock Adjustment — ${form.type} — ${form.reason}`,
        status: 'posted', posted_by: form.approvedBy, notes: form.notes,
      }).select('id').single()
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      for (const line of lines) {
        if (!line.productId || !line.qty) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue

        const qtyChange = form.type === 'increase' ? line.qty : -line.qty
        const costAmount = Math.abs(line.qty) * prod.cost_price
        const newQty = prod.qty_on_hand + qtyChange

        await supabase.from('products').update({ qty_on_hand: newQty }).eq('id', line.productId)

        await supabase.from('item_ledger_entries').insert({
          product_id: line.productId,
          entry_type: form.type === 'writeoff' ? 'write_off' : form.type === 'increase' ? 'positive_adjustment' : 'negative_adjustment',
          document_type: 'stock_adjustment', document_ref: form.ref,
          posting_date: form.date, qty: qtyChange, cost_amount: costAmount,
        })

        // Journal for write-offs
        if (form.type === 'writeoff' && writeoffId) {
          const { data: j } = await supabase.from('journals').insert({
            ref: 'JV-' + form.ref + '-' + lines.indexOf(line),
            posting_date: form.date, description: `Stock Write-off — ${prod.name}`,
            journal_type: 'stock_adjustment', posted_by: form.approvedBy, status: 'posted',
          }).select('id').single()
          if (j) {
            await supabase.from('journal_lines').insert([
              { journal_id: j.id, line_number: 1, account_id: writeoffId, description: `Write-off — ${prod.name}`, debit: costAmount, credit: 0 },
              { journal_id: j.id, line_number: 2, account_id: inventoryId, description: `Inventory reduced — ${prod.name}`, debit: 0, credit: costAmount },
            ])
            await supabase.rpc('update_account_balance', { p_account_id: writeoffId, p_debit: costAmount, p_credit: 0 })
            await supabase.rpc('update_account_balance', { p_account_id: inventoryId, p_debit: 0, p_credit: costAmount })
          }
        }
      }

      showToast(`${form.ref} posted · Stock quantities updated · ${form.type === 'writeoff' ? 'Write-off journal posted' : 'No P&L impact'}`)
      onNav('vouchers')
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Stock Adjustment" icon="" subtitle="Correct stock quantities — physical count, damage, write-off" color="rgba(255,71,87,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Adjustment'}
      journalNote={form.type === 'writeoff' ? 'Dr Write-off (5080) · Cr Inventory (1110) · P&L impact' : 'Stock qty updated · No journal for count corrections'}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Adjustment Type" req>
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="increase">Increase Stock</option>
              <option value="decrease"> Decrease Stock</option>
              <option value="writeoff">Write-off (Damaged/Expired)</option>
            </select>
          </FG>
          <FG label="Reason">
            <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
              <option value="count">Physical Count Correction</option>
              <option value="damaged">Damaged Goods</option>
              <option value="expired">Expired Products</option>
              <option value="theft">Theft / Shrinkage</option>
              <option value="opening">Opening Stock Entry</option>
            </select>
          </FG>
        </div>
        <div className="form-row">
          <FG label="Approved By"><select className="form-input" value={form.approvedBy} onChange={e => set('approvedBy', e.target.value)}><option>Joe Gembe</option><option>Jane Mwatonoka</option></select></FG>
          <FG label="Notes"><input className="form-input" placeholder="Reason for adjustment" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Products to Adjust</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                <option value="">— Select product —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} (Current: {p.qty_on_hand})</option>)}
              </select>
            </div>
            <div style={{ width: 80 }}>
              <input type="number" className="form-input" style={{ fontSize: 12, textAlign: 'center' }} placeholder="Qty" min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
            </div>
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, paddingBottom: 8 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', qty: 1, reason: '' }])}>+ Add product</button>
        <div style={{ background: form.type === 'writeoff' ? 'var(--red-dim)' : form.type === 'increase' ? 'var(--green-dim)' : 'var(--yellow-dim)', border: `1px solid ${form.type === 'writeoff' ? 'var(--red)' : form.type === 'increase' ? 'var(--green)' : 'var(--yellow)'}`, borderRadius: 'var(--r)', padding: 12, marginTop: 12, fontSize: 11 }}>
          {form.type === 'increase' && <span style={{ color: 'var(--green)' }}>Stock will increase · No P&L impact</span>}
          {form.type === 'decrease' && <span style={{ color: 'var(--yellow)' }}> Stock will decrease · No P&L impact</span>}
          {form.type === 'writeoff' && <span style={{ color: 'var(--red)' }}>Stock written off · Dr Write-off (5080) / Cr Inventory (1110) · P&L impact</span>}
        </div>
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
