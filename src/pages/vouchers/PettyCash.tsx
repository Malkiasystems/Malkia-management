import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface ExpLine { desc: string; amount: number; accountId: string }

export default function PettyCash({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [expAccounts, setExpAccounts] = useState<{id:string;code:string;name:string}[]>([])
  const [pettyCashId, setPettyCashId] = useState('')
  const [pettyCashBal, setPettyCashBal] = useState(0)
  const [lines, setLines] = useState<ExpLine[]>([{ desc: '', amount: 0, accountId: '' }])
  const [form, setForm] = useState({ date: today(), ref: '', paidTo: '', approvedBy: 'Joe Gembe', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: accts }, { data: petty }, { count }] = await Promise.all([
      supabase.from('accounts').select('id, code, name').eq('type', 'expense').eq('is_active', true).order('code'),
      supabase.from('accounts').select('id, balance').eq('code', '1040').single(),
      supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'petty_cash'),
    ])
    if (accts) setExpAccounts(accts)
    if (petty) { setPettyCashId(petty.id); setPettyCashBal(petty.balance || 0) }
    set('ref', genRef('PCE', (count || 0) + 1))
  }

  const updateLine = (i: number, k: keyof ExpLine, v: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [k]: v as never }; setLines(nl)
  }
  const total = lines.reduce((s, l) => s + (l.amount || 0), 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.paidTo.trim()) { showToast('Paid to is required', 'error'); return }
    if (lines.every(l => !l.desc || !l.amount)) { showToast('Add at least one expense line', 'error'); return }
    if (lines.some(l => l.amount > 0 && !l.accountId)) { showToast('Select expense account for each line', 'error'); return }
    if (!pettyCashId) { showToast('Petty Cash account (1040) not found', 'error'); return }
    setPosting(true)
    try {
      const { data: j, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Petty Cash — ${form.paidTo} — ${form.ref}`,
        journal_type: 'petty_cash', source_type: 'petty_cash', source_ref: form.ref,
        posted_by: form.approvedBy, status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error(jErr.message)

      const jLines: any[] = []
      let ln = 1
      for (const line of lines) {
        if (!line.amount || !line.accountId) continue
        jLines.push({ journal_id: j.id, line_number: ln++, account_id: line.accountId, description: line.desc, debit: line.amount, credit: 0 })
      }
      jLines.push({ journal_id: j.id, line_number: ln, account_id: pettyCashId, description: `Petty cash out — ${form.paidTo}`, debit: 0, credit: total })

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'petty_cash', posting_date: form.date,
        description: `Petty Cash — ${form.paidTo}`, total_amount: total,
        status: 'posted', journal_id: j.id, posted_by: form.approvedBy, notes: form.notes,
      })

      showToast(`${form.ref} posted · Dr Expense / Cr Petty Cash (1040) · TZS ${total.toLocaleString()}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Petty Cash Expense" icon="" subtitle="Small office expenses from petty cash float" color="rgba(255,211,42,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Expense'}
      journalNote="Dr Expense Account(s) · Cr Petty Cash (1040)">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Paid To" req><input className="form-input" placeholder="e.g. Office supplies shop" value={form.paidTo} onChange={e => set('paidTo', e.target.value)} /></FG>
          <FG label="Approved By"><select className="form-input" value={form.approvedBy} onChange={e => set('approvedBy', e.target.value)}><option>Joe Gembe</option><option>Jane Mwatonoka</option></select></FG>
        </div>
        <FG label="Notes"><input className="form-input" placeholder="Purpose of expense" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title">Expense Lines</div>
          <div style={{ background: 'var(--surface2)', border: `1px solid ${pettyCashBal < total ? 'var(--red)' : 'var(--green)'}`, borderRadius: 'var(--r)', padding: '6px 14px', fontFamily: 'var(--mono)', fontSize: 12 }}>
            Petty Cash Balance: <span style={{ color: pettyCashBal < total ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{tzs(pettyCashBal)}</span>
          </div>
        </div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ fontSize: 12 }} placeholder="Description" value={line.desc} onChange={e => updateLine(i, 'desc', e.target.value)} />
            <select className="form-input" style={{ fontSize: 12 }} value={line.accountId} onChange={e => updateLine(i, 'accountId', e.target.value)}>
              <option value="">— Expense account —</option>
              {expAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="Amount" value={line.amount || ''} onChange={e => updateLine(i, 'amount', parseFloat(e.target.value) || 0)} />
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { desc: '', amount: 0, accountId: '' }])}>+ Add line</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <span style={{ fontWeight: 600 }}>Total</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: pettyCashBal < total ? 'var(--red)' : 'var(--green)' }}>{tzs(total)}</span>
        </div>
        {pettyCashBal < total && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>Exceeds petty cash balance. Replenishment required after posting.</div>}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
