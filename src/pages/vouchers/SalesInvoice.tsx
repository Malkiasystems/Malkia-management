import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function SalesInvoice({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), dueDate: '', ref: genRef('INV', 18), customer: '', wa: '', paymentTerms: 'NET30', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr AR / Cr Revenue · Dr COGS / Cr Inventory · Invoice sent via WhatsApp`); onNav('vouchers') }

  return (
    <VoucherPage title="Sales Invoice" icon="📄" subtitle="Credit sale — creates open AR entry" color="rgba(0,229,160,.12)"
      onPost={post} postLabel="📤 Post Invoice & Send"
      journalNote="Dr Accounts Receivable (1050) · Cr Revenue (4011) · Dr COGS / Cr Inventory · VAT to 2020">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Invoice Header</div>
            <div className="form-row">
              <FG label="Invoice No" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
              <FG label="Invoice Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Due Date"><input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></FG>
              <FG label="Payment Terms">
                <select className="form-input" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                  <option value="COD">COD</option><option value="NET30">Net 30 Days</option><option value="NET15">Net 15 Days</option>
                </select>
              </FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Bill To</div>
            <FG label="Customer / Company Name" req><input className="form-input" placeholder="e.g. Aga Khan Hospital" value={form.customer} onChange={e => set('customer', e.target.value)} /></FG>
            <FG label="WhatsApp (for delivery)"><input className="form-input" placeholder="+255 7XX XXX XXX" value={form.wa} onChange={e => set('wa', e.target.value)} /></FG>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Invoice Lines</div>
        <LineItemsTable lines={lines} setLines={setLines} />
      </div>
      <div className="card">
        <FG label="Notes / Terms"><textarea className="form-input" rows={2} placeholder="Payment instructions, bank details…" value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'none' }} /></FG>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
