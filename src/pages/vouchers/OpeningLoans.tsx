// src/pages/vouchers/OpeningLoans.tsx
//
// One-time capture of money the business already owed when it started using
// the app: a CRDB facility, a SACCO loan, money borrowed from a relative.
//
// ACCOUNTING
//   Dr 3040 Opening Balance Equity
//       Cr 2200 Loans Payable        (current, due within a year)
//       Cr 2500 Long-Term Loans      (due beyond a year)
//
// The debit side is equity for the same reason the bank opening balance
// credits it: this liability predates the books, so no expense or purchase
// explains it. Together the two opening entries net correctly. A tenant who
// borrowed 4m that is sitting in CRDB records the bank as an asset AND the
// loan as a liability, and 3040 ends up holding their real stake, which is
// the difference. Recording only the bank would overstate the business.
//
// ONE COMBINED LINE PER ACCOUNT, not one per loan. Migration 115 allows each
// account a single opening balance, and 2200 is one account. The per-facility
// detail (lender, rate, term, method) lives in the loans table instead, which
// is the subledger design from migration 116. The Loans page reads it from
// there.
//
// RUN ONCE. Posting twice would double the liability while still balancing,
// so nothing would look wrong. The database enforces this, not this screen:
// the guard is the per-account trigger from 115. The check here only exists
// so the user sees a locked screen rather than a Postgres error.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import { useAuth } from '../../lib/useAuth'
import { computeLoan, type InterestMethod } from '../../lib/loanMath'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface DraftLoan {
  lender: string
  lenderType: string
  principal: string
  method: InterestMethod
  rate: string
  totalRepayable: string
  periods: string
  periodsPerYear: string
  startDate: string
  longTerm: boolean
}

const EQUITY_CODE = '3040'
const CURRENT_CODE = '2200'
const LONGTERM_CODE = '2500'

const blankLoan = (): DraftLoan => ({
  lender: '', lenderType: 'bank', principal: '', method: 'reducing_balance',
  rate: '', totalRepayable: '', periods: '12', periodsPerYear: '12',
  startDate: today(), longTerm: false,
})

export default function OpeningLoans({ onNav }: Props) {
  const { user } = useAuth()
  const postedByName = user?.full_name || 'System'
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [alreadyPosted, setAlreadyPosted] = useState(false)
  const [loans, setLoans] = useState<DraftLoan[]>([blankLoan()])
  const [date, setDate] = useState(today())

  const showToast = (m: string, t: 'success' | 'error' = 'success') => {
    setToastType(t); setToast(m); setTimeout(() => setToast(''), 5000)
  }

  useEffect(() => { checkExisting() }, [])

  const checkExisting = async () => {
    setLoading(true)
    const { count } = await supabase.from('loans')
      .select('*', { count: 'exact', head: true })
      .eq('is_opening', true)
    if ((count || 0) > 0) setAlreadyPosted(true)
    setLoading(false)
  }

  const setLoan = (i: number, patch: Partial<DraftLoan>) =>
    setLoans(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLoan = () => setLoans(ls => [...ls, blankLoan()])
  const removeLoan = (i: number) => setLoans(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)

  const filled = loans.filter(l => l.lender.trim() && parseFloat(l.principal) > 0)
  const currentTotal = filled.filter(l => !l.longTerm).reduce((s, l) => s + (parseFloat(l.principal) || 0), 0)
  const longTermTotal = filled.filter(l => l.longTerm).reduce((s, l) => s + (parseFloat(l.principal) || 0), 0)
  const grandTotal = currentTotal + longTermTotal

  const post = async () => {
    if (alreadyPosted) { showToast('Opening loans have already been recorded', 'error'); return }
    if (!filled.length) { showToast('Add at least one loan with a lender and an amount', 'error'); return }

    for (const l of filled) {
      if (l.method === 'fixed_total') {
        const t = parseFloat(l.totalRepayable) || 0
        if (t < (parseFloat(l.principal) || 0)) {
          showToast(`${l.lender}: total repayable cannot be less than the amount borrowed`, 'error'); return
        }
      } else if (!(parseFloat(l.rate) >= 0)) {
        showToast(`${l.lender}: enter the interest rate`, 'error'); return
      }
      if (!(parseInt(l.periods) > 0)) { showToast(`${l.lender}: enter the number of instalments`, 'error'); return }
    }

    setPosting(true)
    try {
      const codes = [EQUITY_CODE, CURRENT_CODE, LONGTERM_CODE]
      const { data: accts } = await supabase.from('accounts').select('id, code').in('code', codes)
      const eq = accts?.find(a => a.code === EQUITY_CODE)
      const cur = accts?.find(a => a.code === CURRENT_CODE)
      const lt = accts?.find(a => a.code === LONGTERM_CODE)
      if (!eq) throw new Error(`Account ${EQUITY_CODE} Opening Balance Equity is missing from this company's chart of accounts.`)
      if (currentTotal > 0 && !cur) throw new Error(`Account ${CURRENT_CODE} Loans Payable is missing from this company's chart of accounts.`)
      if (longTermTotal > 0 && !lt) throw new Error(`Account ${LONGTERM_CODE} Long-Term Loans is missing from this company's chart of accounts.`)

      // One combined credit per liability account, one equity debit for the lot.
      const lines: Array<{ account_id: string; description: string; debit: number; credit: number }> = []
      lines.push({ account_id: eq.id, description: 'Opening loans (equity contra)', debit: grandTotal, credit: 0 })
      if (currentTotal > 0) lines.push({ account_id: cur!.id, description: 'Opening loans payable', debit: 0, credit: currentTotal })
      if (longTermTotal > 0) lines.push({ account_id: lt!.id, description: 'Opening long-term loans', debit: 0, credit: longTermTotal })

      const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
      const ref = `JV-OL-${date.replace(/-/g, '')}-${stamp}`

      const { error: jErr } = await supabase.rpc('post_journal_transaction', {
        p_ref: ref,
        p_posting_date: date,
        p_description: 'Opening loan balances',
        p_journal_type: 'opening_balance',
        p_source_type: 'opening_loans_voucher',
        p_source_ref: ref,
        p_posted_by: postedByName,
        p_branch: null,
        p_lines: lines,
      })
      if (jErr) {
        if (jErr.code === '23505' || /already has an opening balance/i.test(jErr.message)) {
          setAlreadyPosted(true)
          throw new Error('A loan account already has an opening balance recorded. This can only be done once. To correct it, void the existing opening balance journal first.')
        }
        throw jErr
      }

      // Subledger detail. Written after the journal so the GL is never left
      // without its backing rows if the insert fails.
      const rows = filled.map((l, i) => ({
        ref: `OL-${String(i + 1).padStart(3, '0')}`,
        lender: l.lender.trim(),
        lender_type: l.lenderType,
        principal: parseFloat(l.principal) || 0,
        interest_method: l.method,
        annual_rate_pct: l.method === 'fixed_total' ? null : (parseFloat(l.rate) || 0),
        total_repayable: l.method === 'fixed_total' ? (parseFloat(l.totalRepayable) || 0) : null,
        periods: parseInt(l.periods) || 1,
        periods_per_year: parseInt(l.periodsPerYear) || 12,
        start_date: l.startDate || date,
        liability_account_id: l.longTerm ? lt?.id : cur?.id,
        status: 'active',
        is_opening: true,
        created_by: postedByName,
      }))
      const { error: lErr } = await supabase.from('loans').insert(rows)
      if (lErr) {
        throw new Error(`The journal posted, but the loan details failed to save: ${lErr.message}. Add them on the Loans page.`)
      }

      showToast('Opening loans recorded', 'success')
      setAlreadyPosted(true)
      setTimeout(() => onNav('loans'), 1600)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  const lbl: React.CSSProperties = {
    fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  }

  return (
    <VoucherPage
      title="Opening Loans"
      icon=""
      subtitle="Money the business already owed when it started using the app. One time only"
      color="rgba(var(--accent-rgb),.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : 'Record Opening Loans'}
      postPosition="bottom"
      postDisabled={alreadyPosted || loading}
      postDisabledReason={alreadyPosted ? 'Opening loans have already been recorded' : 'Loading'}
      journalNote={`Dr ${EQUITY_CODE} Opening Balance Equity · Cr ${CURRENT_CODE} / ${LONGTERM_CODE} · Run once at go-live`}
    >
      {alreadyPosted && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
          Opening loans have already been recorded, so this voucher is locked. Posting again would
          double the liability while the journal still balanced, which no report would flag. To
          correct a mistake, void the existing opening balance journal first.
        </div>
      )}

      <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
        Record what you still owe today, not the original amount if you have been repaying it.
        If the borrowed money is sitting in a bank account, record that account's balance separately
        under Opening Balances: the loan is the liability, the cash is the asset, and you need both
        for the balance sheet to be honest.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <FG label="As-at Date" req>
          <input type="date" className="form-input" value={date}
            onChange={e => setDate(e.target.value)} disabled={alreadyPosted} style={{ maxWidth: 220 }} />
        </FG>
      </div>

      {loans.map((l, i) => {
        const preview = computeLoan({
          principal: parseFloat(l.principal) || 0,
          annualRatePct: parseFloat(l.rate) || 0,
          totalRepayable: parseFloat(l.totalRepayable) || 0,
          periods: parseInt(l.periods) || 0,
          periodsPerYear: parseInt(l.periodsPerYear) || 12,
          method: l.method,
        })
        return (
          <div key={i} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Loan {i + 1}</div>
              {!alreadyPosted && loans.length > 1 && (
                <button className="btn btn-ghost btn-sm" onClick={() => removeLoan(i)}>Remove</button>
              )}
            </div>

            <div className="form-row">
              <FG label="Lender" req>
                <input className="form-input" placeholder="e.g. CRDB Bank, or a person's name"
                  value={l.lender} disabled={alreadyPosted}
                  onChange={e => setLoan(i, { lender: e.target.value })} />
              </FG>
              <FG label="Lender Type">
                <select className="form-input" value={l.lenderType} disabled={alreadyPosted}
                  onChange={e => setLoan(i, { lenderType: e.target.value })}>
                  <option value="bank">Bank</option>
                  <option value="microfinance">Microfinance</option>
                  <option value="sacco">SACCO</option>
                  <option value="individual">Individual / family</option>
                  <option value="other">Other</option>
                </select>
              </FG>
            </div>

            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <div style={lbl}>How is interest charged?</div>
              {([
                ['reducing_balance', 'Reducing balance (banks)'],
                ['flat', 'Flat rate (microfinance, SACCO)'],
                ['fixed_total', 'Fixed total repayable (no rate quoted)'],
              ] as const).map(([val, title]) => (
                <label key={val} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 12, marginRight: 14 }}>
                  <input type="radio" name={`method-${i}`} checked={l.method === val} disabled={alreadyPosted}
                    onChange={() => setLoan(i, { method: val })} style={{ accentColor: 'var(--accent)' }} />
                  {title}
                </label>
              ))}
            </div>

            <div className="form-row">
              <FG label="Amount still owed (TZS)" req>
                <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                  value={l.principal} disabled={alreadyPosted}
                  onChange={e => setLoan(i, { principal: e.target.value })} />
              </FG>
              {l.method === 'fixed_total' ? (
                <FG label="Total agreed to repay (TZS)" req>
                  <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                    value={l.totalRepayable} disabled={alreadyPosted}
                    onChange={e => setLoan(i, { totalRepayable: e.target.value })} />
                </FG>
              ) : (
                <FG label="Annual rate (%)" req>
                  <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                    value={l.rate} disabled={alreadyPosted}
                    onChange={e => setLoan(i, { rate: e.target.value })} />
                </FG>
              )}
            </div>

            <div className="form-row">
              <FG label="Instalments remaining" req>
                <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                  value={l.periods} disabled={alreadyPosted}
                  onChange={e => setLoan(i, { periods: e.target.value })} />
              </FG>
              <FG label="Frequency">
                <select className="form-input" value={l.periodsPerYear} disabled={alreadyPosted}
                  onChange={e => setLoan(i, { periodsPerYear: e.target.value })}>
                  <option value="12">Monthly</option>
                  <option value="4">Quarterly</option>
                  <option value="52">Weekly</option>
                  <option value="1">Yearly</option>
                </select>
              </FG>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, cursor: 'pointer', marginTop: 6 }}>
              <input type="checkbox" checked={l.longTerm} disabled={alreadyPosted}
                onChange={e => setLoan(i, { longTerm: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
              <span>
                Long term (final payment more than a year away)
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)' }}>
                  Puts it under {LONGTERM_CODE} Long-Term Loans instead of {CURRENT_CODE}, which is how a balance sheet should split debt.
                </span>
              </span>
            </label>

            {preview.instalment > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
                About <strong style={{ fontFamily: 'var(--mono)' }}>{tzs(preview.instalment)}</strong> per instalment ·
                total repayable <strong style={{ fontFamily: 'var(--mono)' }}>{tzs(preview.totalRepayableAmount)}</strong> ·
                true cost <strong>{preview.effectiveAnnualRatePct.toFixed(1)}%</strong> a year
              </div>
            )}
          </div>
        )
      })}

      {!alreadyPosted && (
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={addLoan}>+ Add another loan</button>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>{CURRENT_CODE} Loans Payable (current)</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{tzs(currentTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>{LONGTERM_CODE} Long-Term Loans</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{tzs(longTermTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '1px solid var(--border)', marginTop: 6, fontSize: 13, fontWeight: 700 }}>
          <span>{EQUITY_CODE} Opening Balance Equity (debit)</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{tzs(grandTotal)}</span>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
