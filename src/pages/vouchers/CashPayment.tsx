import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function CashPayment({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date: today(), ref: genRef('CPV', 32), payTo: '', expAccount: '', cashAccount: '1010', amount: '', narration: '', chequeNo: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Expense / Cr Cash — Journal created`); onNav('vouchers') }

  return (
    <VoucherPage title="Cash Payment" icon="💸" subtitle="Record a cash expense or supplier payment" color="rgba(255,71,87,.12)"
      onPost={post} journalNote="Dr Expense/Supplier Account · Cr Cash Account">
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Payment Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          <FG label="Pay To (Payee)" req><input className="form-input" placeholder="e.g. Meditech Tanzania, John Msomi" value={form.payTo} onChange={e => set('payTo', e.target.value)} /></FG>
          <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></FG>
          <FG label="Narration"><textarea className="form-input" rows={3} placeholder="What was this payment for?" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} /></FG>
          <FG label="Cheque / Reference No"><input className="form-input" placeholder="e.g. CHQ-001234 or M-Pesa ref" value={form.chequeNo} onChange={e => set('chequeNo', e.target.value)} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Accounting</div>
          <FG label="Cash / Bank Account (Credit)" req>
            <select className="form-input" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
              <option value="1040">1040 — Petty Cash — DSM HQ</option>
            </select>
          </FG>
          <FG label="Expense / Debit Account" req>
            <select className="form-input" value={form.expAccount} onChange={e => set('expAccount', e.target.value)}>
              <option value="">— Select account —</option>
              <option value="2010">2010 — Accounts Payable — Import Suppliers</option>
              <option value="2011">2011 — Accounts Payable — Local Suppliers</option>
              <option value="6010">6010 — Salaries</option>
              <option value="6110">6110 — Rent</option>
              <option value="6210">6210 — Social Media Advertising</option>
              <option value="6310">6310 — Software Subscriptions</option>
              <option value="6410">6410 — Delivery — Last Mile</option>
              <option value="6512">6512 — Bank Charges</option>
            </select>
          </FG>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 8 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--blue)' }}>Dr Expense Account</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
              <span style={{ color: 'var(--red)' }}>Cr Cash Account</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
