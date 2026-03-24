import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function DebitNote({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date: today(), ref: genRef('DN', 6), customer: '', originalInv: '', amount: '', reason: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr AR / Cr Revenue · Customer balance increased`); onNav('vouchers') }

  return (
    <VoucherPage title="Debit Note" icon="📤" subtitle="Charge customer additional amount — increases their balance" color="rgba(255,71,87,.12)"
      onPost={post} journalNote="Dr Accounts Receivable (1050) · Cr Revenue · Customer owes more">
      <div className="card">
        <div className="form-row">
          <FG label="Debit Note Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Customer" req><input className="form-input" value={form.customer} onChange={e => set('customer', e.target.value)} placeholder="Customer name" /></FG>
          <FG label="Original Invoice Ref"><input className="form-input" value={form.originalInv} onChange={e => set('originalInv', e.target.value)} placeholder="INV-0018" /></FG>
        </div>
        <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" /></FG>
        <FG label="Reason" req>
          <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
            <option value="">— Select reason —</option>
            <option>Underbilling correction</option>
            <option>Additional delivery charges</option>
            <option>Interest on overdue invoice</option>
            <option>Price adjustment</option>
          </select>
        </FG>
        <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
