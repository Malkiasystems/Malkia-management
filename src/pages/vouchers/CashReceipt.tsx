import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function CashReceipt({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date: today(), ref: genRef('CRV', 28), receivedFrom: '', incomeAccount: '', cashAccount: '1010', amount: '', method: 'cash', narration: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Cash / Cr Income — Journal created`); onNav('vouchers') }

  return (
    <VoucherPage title="Cash Receipt" icon="📥" subtitle="Record money received in cash or M-Pesa" color="rgba(0,229,160,.12)"
      onPost={post} journalNote="Dr Cash/M-Pesa Account · Cr Revenue/Customer Account">
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Receipt Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          <FG label="Received From" req><input className="form-input" placeholder="e.g. Amina Hassan, Aga Khan Hospital" value={form.receivedFrom} onChange={e => set('receivedFrom', e.target.value)} /></FG>
          <div className="form-row">
            <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></FG>
            <FG label="Payment Method" req>
              <select className="form-input" value={form.method} onChange={e => set('method', e.target.value)}>
                <option value="cash">💵 Cash</option>
                <option value="mpesa">📱 M-Pesa</option>
                <option value="bank">🏦 Bank Transfer</option>
                <option value="pos">💳 POS Card</option>
              </select>
            </FG>
          </div>
          <FG label="Narration"><textarea className="form-input" rows={3} placeholder="What is this payment for?" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Accounting</div>
          <FG label="Deposit To (Debit Account)" req>
            <select className="form-input" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
            </select>
          </FG>
          <FG label="Income / Credit Account" req>
            <select className="form-input" value={form.incomeAccount} onChange={e => set('incomeAccount', e.target.value)}>
              <option value="">— Select account —</option>
              <option value="4010">4010 — Sales B2C</option>
              <option value="4011">4011 — Sales B2B</option>
              <option value="4110">4110 — Konnect Subscription Revenue</option>
              <option value="1050">1050 — Accounts Receivable — B2B</option>
              <option value="2070">2070 — Customer Deposits</option>
            </select>
          </FG>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 8 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--blue)' }}>Dr Cash Account</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
              <span style={{ color: 'var(--green)' }}>Cr Income Account</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
