import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function StockAdjustment({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: genRef('SA', 8), type: 'increase', reason: 'count', approvedBy: 'Joe Gembe', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Stock quantities updated`); onNav('vouchers') }

  return (
    <VoucherPage title="Stock Adjustment" icon="🔧" subtitle="Correct stock quantities — physical count, damage, write-off" color="rgba(255,71,87,.12)"
      onPost={post} postLabel="✅ Post Adjustment"
      journalNote={form.type === 'writeoff' ? 'Dr Inventory Write-off (5080) · Cr Inventory (1110)' : 'Dr/Cr Inventory · Cr/Dr Opening Stock Equity (3040)'}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Adjustment Type" req>
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="increase">📈 Increase Stock</option>
              <option value="decrease">📉 Decrease Stock</option>
              <option value="writeoff">❌ Write-off (Damaged/Expired)</option>
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
          <FG label="Approved By" req><select className="form-input"><option>Joe Gembe</option><option>Jane Mwatonoka</option></select></FG>
          <FG label="Notes"><input className="form-input" placeholder="Reason for adjustment" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Products to Adjust</div>
        <LineItemsTable lines={lines} setLines={setLines} showPrice={false} />
        <div style={{ background: form.type === 'writeoff' ? 'var(--red-dim)' : form.type === 'increase' ? 'var(--green-dim)' : 'var(--yellow-dim)', border: `1px solid ${form.type === 'writeoff' ? 'var(--red)' : form.type === 'increase' ? 'var(--green)' : 'var(--yellow)'}`, borderRadius: 'var(--r)', padding: 12, marginTop: 12, fontSize: 11 }}>
          {form.type === 'increase' && <span style={{ color: 'var(--green)' }}>📈 Stock will increase · Dr Inventory / Cr Opening Stock Equity</span>}
          {form.type === 'decrease' && <span style={{ color: 'var(--yellow)' }}>📉 Stock will decrease · Dr Opening Stock Equity / Cr Inventory</span>}
          {form.type === 'writeoff' && <span style={{ color: 'var(--red)' }}>❌ Stock written off · Dr Write-off (5080) / Cr Inventory · P&L impact</span>}
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
