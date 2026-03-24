import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { SUPPLIERS } from '../../lib/data'
import { genRef, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function PurchaseInvoice({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), dueDate: '', ref: genRef('PINV', 12), supplier: '', supplierRef: '', poRef: '', grnRef: '', fxRate: '2540' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr GRN Interim (1121) / Cr AP Suppliers (2010) · Supplier ledger updated`); onNav('vouchers') }

  return (
    <VoucherPage title="Purchase Invoice" icon="🧾" subtitle="Match supplier invoice to GRN — creates AP entry" color="rgba(168,85,247,.12)"
      onPost={post} journalNote="Dr GRN Interim (1121) · Cr Accounts Payable (2010) · Cost variance to 5090 · Open AP entry created">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Invoice Details</div>
            <div className="form-row">
              <FG label="Invoice No" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
              <FG label="Invoice Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Due Date"><input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></FG>
              <FG label="FX Rate (TZS/USD)" req><input className="form-input" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Related PO Ref"><input className="form-input" placeholder="PO-0022" value={form.poRef} onChange={e => set('poRef', e.target.value)} /></FG>
              <FG label="Related GRN Ref"><input className="form-input" placeholder="GRN-0019" value={form.grnRef} onChange={e => set('grnRef', e.target.value)} /></FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Supplier</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
                <option value="">— Select supplier —</option>
                {SUPPLIERS.map(s => <option key={s.id} value={s.id}>{s.name} — Balance: TZS {s.balance.toLocaleString()}</option>)}
              </select>
            </FG>
            <FG label="Supplier Invoice Reference"><input className="form-input" placeholder="Supplier's own invoice number" value={form.supplierRef} onChange={e => set('supplierRef', e.target.value)} /></FG>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Invoice Lines</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Unit Cost (USD)" />
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
