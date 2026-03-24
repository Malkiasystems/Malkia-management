import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { SUPPLIERS } from '../../lib/data'
import { genRef, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function PurchaseReturn({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: genRef('PRN', 3), supplier: '', originalGrn: '', reason: 'defective' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr AP Suppliers / Cr Inventory · Stock returned to supplier`); onNav('vouchers') }

  return (
    <VoucherPage title="Purchase Return" icon="↩️" subtitle="Return goods to supplier — reduces AP and inventory" color="rgba(168,85,247,.12)"
      onPost={post} journalNote="Dr Accounts Payable (2010) · Cr Inventory (1110) · Reduces stock and supplier balance">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Return Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Supplier" req>
            <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
              <option value="">— Select supplier —</option>
              {SUPPLIERS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FG>
          <FG label="Original GRN Ref"><input className="form-input" value={form.originalGrn} onChange={e => set('originalGrn', e.target.value)} placeholder="GRN-0019" /></FG>
        </div>
        <FG label="Return Reason">
          <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
            <option value="defective">Defective / Not as described</option>
            <option value="wrong">Wrong items sent</option>
            <option value="overdelivery">Over-delivery</option>
            <option value="damaged">Damaged in transit</option>
          </select>
        </FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Items to Return</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Unit Cost (TZS)" />
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
