import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { PRODUCTS } from '../../lib/data'
import { genRef, today, tzs } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function OpeningStock({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>(PRODUCTS.slice(0, 4).map(p => ({ productId: p.id, desc: p.name, qty: 0, price: p.cost, amount: 0 })))
  const [form, setForm] = useState({ date: today(), ref: genRef('OS', 1), notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Inventory / Cr Opening Stock Equity · Total value: ${tzs(total)}`); onNav('vouchers') }

  return (
    <VoucherPage title="Opening Stock" icon="📦" subtitle="Enter initial stock quantities at go-live — one time entry" color="rgba(212,135,74,.12)"
      onPost={post} postLabel="✅ Post Opening Stock"
      journalNote="Dr Inventory accounts (1110-1112) · Cr Opening Stock Equity (3040) · Run once at system go-live">
      <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--yellow)' }}>
        ⚠️ This is a one-time entry. Post opening stock only once when you go live. Posting twice will double your inventory values.
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <FG label="Notes"><input className="form-input" placeholder="e.g. Opening stock as at 1 July 2025" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Products — Enter Quantities and Costs</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel="Cost Price (TZS)" />
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
