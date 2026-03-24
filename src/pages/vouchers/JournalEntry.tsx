import { useState } from 'react'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { ACCOUNTS } from '../../lib/data'
import { genRef, today } from '../../lib/utils'
import type { Page, JournalLine } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function JournalEntry({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [jLines, setJLines] = useState<JournalLine[]>([
    { account: '', dr: 0, cr: 0, desc: '' },
    { account: '', dr: 0, cr: 0, desc: '' },
  ])
  const [form, setForm] = useState({ date: today(), ref: genRef('JV', 10), narration: '', type: 'manual' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const updateLine = (i: number, k: keyof JournalLine, v: string | number) => {
    const nl = [...jLines]
    nl[i] = { ...nl[i], [k]: v }
    setJLines(nl)
  }

  const totalDr = jLines.reduce((s, l) => s + l.dr, 0)
  const totalCr = jLines.reduce((s, l) => s + l.cr, 0)
  const balanced = totalDr === totalCr && totalDr > 0

  const post = () => {
    if (!balanced) { setToast('❌ Journal not balanced — Debits must equal Credits'); return }
    setToast(`✅ ${form.ref} posted · ${jLines.length} lines · Balanced at TZS ${totalDr.toLocaleString()}`)
    onNav('vouchers')
  }

  return (
    <VoucherPage title="Journal Entry" icon="🔄" subtitle="Manual double-entry — use for corrections and adjustments" color="rgba(212,135,74,.12)"
      onPost={post} postLabel="📤 Post Journal"
      journalNote="Manual entry — debits must equal credits before posting is allowed">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Journal Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Type">
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="manual">Manual Adjustment</option>
              <option value="depreciation">Depreciation</option>
              <option value="accrual">Accrual</option>
              <option value="prepayment">Prepayment</option>
              <option value="fx_revaluation">FX Revaluation</option>
              <option value="correction">Error Correction</option>
            </select>
          </FG>
        </div>
        <FG label="Narration / Description" req><input className="form-input" placeholder="Explain why this journal entry is being posted" value={form.narration} onChange={e => set('narration', e.target.value)} /></FG>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title">Journal Lines</div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: balanced ? 'var(--green)' : 'var(--red)' }}>
            {balanced ? '✅ BALANCED' : `⚠️ Difference: ${Math.abs(totalDr - totalCr).toLocaleString()}`}
          </span>
        </div>
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead><tr><th>Account</th><th>Description</th><th className="td-right" style={{ width: 150 }}>Debit (TZS)</th><th className="td-right" style={{ width: 150 }}>Credit (TZS)</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {jLines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.account} onChange={e => updateLine(i, 'account', e.target.value)}>
                      <option value="">— Select account —</option>
                      {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </td>
                  <td><input className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.desc} onChange={e => updateLine(i, 'desc', e.target.value)} placeholder="Line description" /></td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }} value={line.dr || ''} onChange={e => updateLine(i, 'dr', parseInt(e.target.value) || 0)} placeholder="0" /></td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }} value={line.cr || ''} onChange={e => updateLine(i, 'cr', parseInt(e.target.value) || 0)} placeholder="0" /></td>
                  <td><button onClick={() => setJLines(jLines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button></td>
                </tr>
              ))}
              <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                <td colSpan={2} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', padding: '10px 14px' }}>TOTALS</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)', padding: '10px 14px' }}>{totalDr.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', padding: '10px 14px' }}>{totalCr.toLocaleString()}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setJLines([...jLines, { account: '', dr: 0, cr: 0, desc: '' }])}>+ Add Line</button>
      </div>
      {toast && <Toast message={toast} type={toast.startsWith('❌') ? 'error' : 'success'} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
