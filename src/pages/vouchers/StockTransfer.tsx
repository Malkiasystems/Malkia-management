import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function StockTransfer({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: genRef('ST', 5), fromBranch: 'DSM HQ', toBranch: 'Arusha Branch', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Stock moved from ${form.fromBranch} to ${form.toBranch} · No P&L impact`); onNav('vouchers') }

  return (
    <VoucherPage title="Stock Transfer" icon="🔄" subtitle="Move stock between branches — no P&L impact" color="rgba(61,139,255,.12)"
      onPost={post} postLabel="🔄 Confirm Transfer"
      journalNote="Dr Inventory at destination · Cr Inventory at source · No revenue or cost impact">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
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
        <LineItemsTable lines={lines} setLines={setLines} showPrice={false} />
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
