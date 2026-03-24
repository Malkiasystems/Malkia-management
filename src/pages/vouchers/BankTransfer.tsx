import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function BankTransfer({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ date: today(), ref: genRef('BTV', 14), fromAccount: '1030', toAccount: '1020', amount: '', fxRate: '', narration: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const post = () => { setToast(`✅ ${form.ref} posted · Dr Target / Cr Source — Journal created`); onNav('vouchers') }

  return (
    <VoucherPage title="Bank Transfer" icon="🔁" subtitle="Move funds between your own bank accounts" color="rgba(61,139,255,.12)"
      onPost={post} journalNote="Dr Target Account · Cr Source Account · FX difference to 7010/7011 if cross-currency">
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Transfer Details</div>
          <div className="form-row">
            <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          <FG label="From Account" req>
            <select className="form-input" value={form.fromAccount} onChange={e => set('fromAccount', e.target.value)}>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
              <option value="1031">1031 — CRDB Bank — USD Account</option>
              <option value="1040">1040 — Petty Cash</option>
            </select>
          </FG>
          <FG label="To Account" req>
            <select className="form-input" value={form.toAccount} onChange={e => set('toAccount', e.target.value)}>
              <option value="1030">1030 — CRDB Bank — TZS Operating</option>
              <option value="1010">1010 — Cash — DSM HQ Till</option>
              <option value="1020">1020 — M-Pesa — Business Account</option>
              <option value="1031">1031 — CRDB Bank — USD Account</option>
              <option value="1040">1040 — Petty Cash</option>
            </select>
          </FG>
          <div className="form-row">
            <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></FG>
            <FG label="FX Rate (if USD)"><input className="form-input" placeholder="e.g. 2540" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} /></FG>
          </div>
          <FG label="Narration"><textarea className="form-input" rows={2} placeholder="Purpose of transfer" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Journal Preview</div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--blue)' }}>Dr To Account</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
              <span style={{ color: 'var(--red)' }}>Cr From Account</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{form.amount ? parseInt(form.amount).toLocaleString() : '—'}</span>
            </div>
          </div>
          <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.2)', borderRadius: 'var(--r)', padding: 12, marginTop: 14, fontSize: 11, color: 'var(--yellow)' }}>
            ⚠️ If transferring between TZS and USD accounts, the system will automatically post the FX difference to account 7010 or 7011.
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
