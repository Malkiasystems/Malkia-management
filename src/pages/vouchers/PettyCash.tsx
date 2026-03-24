import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { genRef, today, tzs } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function PettyCash({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: genRef('PCE', 45), paidTo: '', approvedBy: 'Joe Gembe', narration: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Expense / Cr Petty Cash · Balance updated`); onNav('vouchers') }

  return (
    <VoucherPage title="Petty Cash Expense" icon="🪙" subtitle="Record small office expenses from petty cash float" color="rgba(255,211,42,.12)"
      onPost={post} journalNote="Dr Expense Account · Cr Petty Cash (1040)">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Expense Details</div>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Paid To" req><input className="form-input" placeholder="e.g. Office supplies shop" value={form.paidTo} onChange={e => set('paidTo', e.target.value)} /></FG>
          <FG label="Approved By"><select className="form-input" value={form.approvedBy} onChange={e => set('approvedBy', e.target.value)}><option>Joe Gembe</option><option>Jane Mwatonoka</option></select></FG>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title">Expense Items</div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 14px', fontFamily: 'var(--mono)', fontSize: 12 }}>
            Balance: <span style={{ color: 'var(--green)' }}>TZS 150,000</span>
          </div>
        </div>
        <LineItemsTable lines={lines} setLines={setLines} showProduct={false} priceLabel="Amount (TZS)" />
      </div>
      <div className="card">
        <FG label="Expense Account" req>
          <select className="form-input">
            <option>6510 — Office Supplies & Stationery</option>
            <option>6410 — Delivery — Last Mile DSM</option>
            <option>6515 — Miscellaneous Expenses</option>
            <option>6120 — Utilities</option>
          </select>
        </FG>
        {total > 150000 && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>⚠️ Exceeds petty cash balance. Replenishment required.</div>}
        <div style={{ background: total > 150000 ? 'var(--red-dim)' : 'var(--green-dim)', border: `1px solid ${total > 150000 ? 'var(--red)' : 'var(--green)'}`, borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 13 }}>Total</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: total > 150000 ? 'var(--red)' : 'var(--green)' }}>{tzs(total)}</span>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
