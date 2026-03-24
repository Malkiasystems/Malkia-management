import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function SalesReturn({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: genRef('SRN', 4), customer: '', wa: '', originalInv: '', reason: 'defective', refundMethod: 'cash' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Sales Returns / Cr Cash · Dr Inventory / Cr COGS · Stock restored`); onNav('vouchers') }

  return (
    <VoucherPage title="Sales Return" icon="↩️" subtitle="Customer returns goods — reverses original sale" color="rgba(255,71,87,.12)"
      onPost={post} postLabel="↩️ Post Return"
      journalNote="Dr Sales Returns (4050) · Cr Cash/AR · Dr Inventory (1110) · Cr COGS (5010)">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Return Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Original Invoice Ref"><input className="form-input" placeholder="e.g. CS-0042" value={form.originalInv} onChange={e => set('originalInv', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Customer Name" req><input className="form-input" value={form.customer} onChange={e => set('customer', e.target.value)} placeholder="Customer name" /></FG>
          <FG label="WhatsApp"><input className="form-input" value={form.wa} onChange={e => set('wa', e.target.value)} placeholder="+255 7XX XXX XXX" /></FG>
        </div>
        <div className="form-row">
          <FG label="Return Reason">
            <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
              <option value="defective">Defective / Not Working</option>
              <option value="wrong">Wrong Item Delivered</option>
              <option value="changed">Customer Changed Mind</option>
              <option value="damaged">Damaged in Transit</option>
            </select>
          </FG>
          <FG label="Refund Method">
            <select className="form-input" value={form.refundMethod} onChange={e => set('refundMethod', e.target.value)}>
              <option value="cash">💵 Cash Refund</option>
              <option value="mpesa">📱 M-Pesa Refund</option>
              <option value="credit">📋 Store Credit</option>
              <option value="exchange">🔄 Exchange</option>
            </select>
          </FG>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Items Returned</div>
        <LineItemsTable lines={lines} setLines={setLines} />
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
