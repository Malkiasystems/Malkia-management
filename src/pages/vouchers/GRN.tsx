import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { SUPPLIERS } from '../../lib/data'
import { genRef, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function GRN({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: genRef('GRN', 19), supplier: '', poRef: '', receivedBy: 'Joe Gembe', fxRate: '2540', condition: 'good', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Inventory (1110) / Cr GRN Interim (1121) · Stock & avg cost updated`); onNav('vouchers') }

  return (
    <VoucherPage title="Goods Received Note (GRN)" icon="🚛" subtitle="Record goods received from supplier — posts to inventory" color="rgba(251,146,60,.12)"
      onPost={post} postLabel="✅ Confirm GRN & Update Stock"
      journalNote="Dr Inventory (1110) · Cr GRN Interim (1121) · Qty added · Weighted avg cost recalculated">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Receipt Details</div>
            <div className="form-row">
              <FG label="GRN Number" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
              <FG label="Received Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <FG label="Related PO Reference"><input className="form-input" placeholder="e.g. PO-0022" value={form.poRef} onChange={e => set('poRef', e.target.value)} /></FG>
            <div className="form-row">
              <FG label="FX Rate on Receipt Date" req><input className="form-input" placeholder="2540" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} /></FG>
              <FG label="Received By"><select className="form-input" value={form.receivedBy} onChange={e => set('receivedBy', e.target.value)}><option>Joe Gembe</option><option>Jane Mwatonoka</option><option>Lilian Mallya</option></select></FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Supplier & Condition</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
                <option value="">— Select supplier —</option>
                {SUPPLIERS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FG>
            <FG label="Goods Condition">
              <select className="form-input" value={form.condition} onChange={e => set('condition', e.target.value)}>
                <option value="good">✅ Good — All items accepted</option>
                <option value="partial">⚠️ Partial — Some items rejected</option>
                <option value="damaged">❌ Damaged — Return required</option>
              </select>
            </FG>
            <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Items Received</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Unit Cost (USD)" />
      </div>
      <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(212,135,74,.2)', borderRadius: 'var(--r)', padding: 14, fontSize: 11, color: 'var(--accent)', lineHeight: 1.8 }}>
        ⚡ After posting: Stock qty increases · Weighted avg cost recalculates · GRN Interim (1121) clears when purchase invoice is matched
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
