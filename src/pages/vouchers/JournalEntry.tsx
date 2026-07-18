import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import type { Page, JournalLine } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBAccount { id: string; code: string; name: string; category?: string; balance?: number }

export default function JournalEntry({ onNav }: Props) {
  const { isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [jLines, setJLines] = useState<JournalLine[]>([
    { account: '', dr: 0, cr: 0, desc: '' },
    { account: '', dr: 0, cr: 0, desc: '' },
  ])
  const [form, setForm] = useState({ date: today(), ref: '', narration: '', type: 'manual' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ── Simple Loan Payment mode state ──
  const [loanPay, setLoanPay] = useState({ loanId: '', payFromId: '', amount: '' })
  const isLoanMode = form.type === 'loan_payment'

  useEffect(() => { loadAccounts(); loadNextRef() }, [])

  const loadAccounts = async () => {
    // include category + balance so the loan-mode dropdowns can show amounts owed / available
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name, category, balance')
      .eq('is_active', true)
      .order('code')
    if (data) setAccounts(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('journal_entry')
    setForm(f => ({ ...f, ref }))
  }

  const updateLine = (i: number, k: keyof JournalLine, v: string | number) => {
    const nl = [...jLines]; nl[i] = { ...nl[i], [k]: v }; setJLines(nl)
  }

  const totalDr = jLines.reduce((s, l) => s + (l.dr || 0), 0)
  const totalCr = jLines.reduce((s, l) => s + (l.cr || 0), 0)
  const balanced = totalDr === totalCr && totalDr > 0

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  // ── loan-mode helpers ──
  const loanAccounts = accounts.filter(a => a.category === 'Loans')
  const cashBankAccounts = accounts.filter(a => a.category === 'Cash & Bank')
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const selectedLoan = loanAccounts.find(a => a.id === loanPay.loanId)
  const selectedPayFrom = cashBankAccounts.find(a => a.id === loanPay.payFromId)
  const loanOwed = selectedLoan ? -Number(selectedLoan.balance ?? 0) : 0  // liability held as negative
  const loanAmount = Number((loanPay.amount || '').toString().replace(/,/g, ''))
  const loanValid = !!loanPay.loanId && !!loanPay.payFromId && loanPay.loanId !== loanPay.payFromId && loanAmount > 0

  // ── SAFE POST via post_journal_transaction (loan mode) ──
  const postLoanPayment = async () => {
    if (!loanValid) { showToast('Choose a loan, an amount, and the account you are paying from.', 'error'); return }
    if (!form.narration.trim() && !selectedLoan) { /* narration optional in loan mode; we build one */ }
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }
    setPosting(true)
    try {
      const desc = form.narration.trim() || `Loan repayment — ${selectedLoan?.name} via ${selectedPayFrom?.name}`
      const journalRef = `JV-${form.ref}`
      const { data: journalId, error } = await supabase.rpc('post_journal_transaction', {
        p_ref: journalRef,
        p_posting_date: form.date,
        p_description: desc,
        p_journal_type: 'loan_payment',
        p_source_type: 'loan_payment',
        p_source_ref: form.ref,
        p_posted_by: 'Joe Gembe',
        p_branch: null,
        p_lines: [
          { account_id: loanPay.loanId, description: 'Loan repayment (reduces what you owe)', debit: loanAmount, credit: 0 },
          { account_id: loanPay.payFromId, description: `Paid from ${selectedPayFrom?.name}`, debit: 0, credit: loanAmount },
        ],
      })
      if (error) throw new Error(error.message)

      // voucher header linked to the journal
      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'loan_payment', posting_date: form.date,
        description: desc, total_amount: loanAmount, status: 'posted',
        journal_id: journalId, posted_by: 'Joe Gembe',
      })

      showToast(`${form.ref} posted · ${selectedLoan?.name} reduced by TZS ${fmt(loanAmount)}`)
      onNav('vouchers')
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  // ── raw journal post (unchanged behaviour for accountants) ──
  const postRawJournal = async () => {
    if (!balanced) { showToast('Journal not balanced — Debits must equal Credits', 'error'); return }
    if (!form.narration.trim()) { showToast('Please enter a narration/description', 'error'); return }
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }
    setPosting(true)
    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: form.ref, posting_date: form.date, description: form.narration,
        journal_type: form.type, source_type: 'manual',
        posted_by: 'Joe Gembe', status: 'posted',
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const linesToInsert = jLines.filter(l => l.account && (l.dr > 0 || l.cr > 0)).map((l, i) => ({
        journal_id: journal.id, line_number: i + 1,
        account_id: l.account, description: l.desc,
        debit: l.dr || 0, credit: l.cr || 0,
      }))

      const { error: jlErr } = await supabase.from('journal_lines').insert(linesToInsert)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      for (const line of linesToInsert) {
        await supabase.rpc('update_account_balance', { p_account_id: line.account_id, p_debit: line.debit, p_credit: line.credit })
      }

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'journal_entry', posting_date: form.date,
        description: form.narration || `Journal Entry — ${form.ref}`,
        total_amount: totalDr, status: 'posted',
        journal_id: journal.id, posted_by: 'Joe Gembe',
      })

      showToast(`${form.ref} posted · ${linesToInsert.length} lines · Balanced at TZS ${totalDr.toLocaleString()}`)
      onNav('vouchers')
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const post = () => (isLoanMode ? postLoanPayment() : postRawJournal())

  return (
    <VoucherPage title="Journal Entry" icon="" subtitle="Manual double-entry — corrections and adjustments" color="rgba(212,135,74,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : (isLoanMode ? 'Post Loan Payment' : 'Post Journal')}
      journalNote={isLoanMode
        ? 'Loan payment — pick the loan, the amount, and the account you paid from. The double-entry is built for you.'
        : 'Manual entry — debits must equal credits before posting is allowed'}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Journal Ref" req><input className="form-input" value={form.ref} readOnly /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Type">
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="loan_payment">💵 Loan Payment (simple)</option>
              <option value="manual">Manual Adjustment</option>
              <option value="depreciation">Depreciation</option>
              <option value="accrual">Accrual</option>
              <option value="prepayment">Prepayment</option>
              <option value="fx_revaluation">FX Revaluation</option>
              <option value="correction">Error Correction</option>
            </select>
          </FG>
        </div>
        <FG label="Narration / Description" req={!isLoanMode}>
          <input className="form-input" placeholder={isLoanMode ? 'Optional note, e.g. Part repayment to Herman' : 'Explain why this journal entry is being posted'} value={form.narration} onChange={e => set('narration', e.target.value)} />
        </FG>
      </div>

      {isLoanMode ? (
        /* ───────── SIMPLE LOAN PAYMENT MODE ───────── */
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Loan Payment</div>

          <FG label="Which loan are you paying?">
            <select className="form-input" value={loanPay.loanId} onChange={e => setLoanPay(s => ({ ...s, loanId: e.target.value }))}>
              <option value="">— Choose the lender —</option>
              {loanAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} · owed {fmt(-Number(a.balance ?? 0))}</option>
              ))}
            </select>
          </FG>

          <FG label="How much are you paying? (TZS)">
            <input className="form-input" inputMode="decimal" placeholder="0"
              value={loanPay.amount}
              onChange={e => setLoanPay(s => ({ ...s, amount: e.target.value }))} />
          </FG>

          <FG label="Which account are you paying from?">
            <select className="form-input" value={loanPay.payFromId} onChange={e => setLoanPay(s => ({ ...s, payFromId: e.target.value }))}>
              <option value="">— Choose cash or bank —</option>
              {cashBankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} · balance {fmt(Number(a.balance ?? 0))}</option>
              ))}
            </select>
          </FG>

          {/* plain-English preview of what will post */}
          {loanValid && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'var(--surface2)', fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>What this will do</div>
              <div>• <b>{selectedLoan?.name}</b> debt goes down by <b>TZS {fmt(loanAmount)}</b> (from {fmt(loanOwed)} to {fmt(loanOwed - loanAmount)})</div>
              <div>• <b>{selectedPayFrom?.name}</b> goes down by <b>TZS {fmt(loanAmount)}</b></div>
              {loanAmount > loanOwed && (
                <div style={{ color: 'var(--gold, #C8A96E)', marginTop: 6 }}>
                  ⚠ This is more than you owe on this loan ({fmt(loanOwed)}). Check the amount.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ───────── RAW JOURNAL MODE (unchanged) ───────── */
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div className="card-title">Journal Lines</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: balanced ? 'var(--green)' : 'var(--red)' }}>
              {balanced ? 'BALANCED' : totalDr > 0 || totalCr > 0 ? `Difference: ${Math.abs(totalDr - totalCr).toLocaleString()}` : 'Enter amounts'}
            </span>
          </div>
          {/* plain-language helper for the columns */}
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
            <b>Debit</b> = money or value coming <i>in</i> to an account (an asset going up, or a debt going down).&nbsp;
            <b>Credit</b> = money or value going <i>out</i> (an asset going down, or a debt going up). Every entry must have equal totals on both sides.
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
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
                    </td>
                    <td><input className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.desc} onChange={e => updateLine(i, 'desc', e.target.value)} placeholder="Line description" /></td>
                    <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }} value={line.dr || ''} onChange={e => updateLine(i, 'dr', parseFloat(e.target.value) || 0)} placeholder="0" /></td>
                    <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }} value={line.cr || ''} onChange={e => updateLine(i, 'cr', parseFloat(e.target.value) || 0)} placeholder="0" /></td>
                    <td><button onClick={() => setJLines(jLines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>×</button></td>
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
      )}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
