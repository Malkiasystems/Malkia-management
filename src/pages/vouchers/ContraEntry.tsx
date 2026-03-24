import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function ContraEntry({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date: today(), ref: genRef('CON', 7), fromAcc: '1010', toAcc: '1030', amount: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Contra entry created`); onNav('vouchers') }

  return (
    <VoucherPage title="Contra Entry" icon="↔️" subtitle="Cash deposit to bank or bank withdrawal to till" color="rgba(168,85,247,.12)"
      onPost={post} journalNote="Dr Bank/Cash (destination) · Cr Cash/Bank (source) · Both are balance sheet accounts">
      <div className="card">
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <FG label="From (Source Account)" req>
          <select className="form-input" value={form.fromAcc} onChange={e => set('fromAcc', e.target.value)}>
            <option value="1010">1010 — Cash — DSM HQ Till</option>
            <option value="1020">1020 — M-Pesa Business Account</option>
            <option value="1030">1030 — CRDB Bank TZS</option>
            <option value="1040">1040 — Petty Cash</option>
          </select>
        </FG>
        <FG label="To (Destination Account)" req>
          <select className="form-input" value={form.toAcc} onChange={e => set('toAcc', e.target.value)}>
            <option value="1030">1030 — CRDB Bank TZS</option>
            <option value="1010">1010 — Cash — DSM HQ Till</option>
            <option value="1020">1020 — M-Pesa Business Account</option>
            <option value="1040">1040 — Petty Cash</option>
          </select>
        </FG>
        <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" /></FG>
        <FG label="Notes"><input className="form-input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. Cash deposited to bank from till" /></FG>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 8 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--blue)' }}>Dr Destination Account</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
            <span style={{ color: 'var(--red)' }}>Cr Source Account</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
