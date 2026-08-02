// src/pages/vouchers/NewLoan.tsx
//
// A loan the business takes out NOW, as opposed to debt it already carried at
// go-live (that is the Opening Loans voucher).
//
//   Dr <bank or cash>          the money actually arrives
//       Cr 2200 Loans Payable  (current, final payment within a year)
//       Cr 2500 Long-Term Loans (beyond a year)
//
// Note the debit side is the difference from Opening Loans. There, the contra
// was 3040 Opening Balance Equity, because the cash had arrived before the
// books existed and there was nothing to debit. Here the cash lands in a real
// account today, so the asset side is genuine and equity is untouched. Getting
// this wrong (crediting equity for a live disbursement) would inflate the
// owner's stake by the size of the loan.
//
// Repayments are recorded separately through the Loan Repayment voucher, which
// splits each instalment into principal and interest.
//
// This voucher is NOT subject to the one-opening-balance-per-account guard
// from migration 115, because it posts journal_type 'loan_disbursement'. A
// business can take as many loans as it can service.

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
interface Acct { id: string; code: string; name: string }

const CURRENT_CODE = '2200'
const LONGTERM_CODE = '2500'

export default function NewLoan({ onNav }: Props) {
  const { user } = useAuth()
  const postedByName = user?.full_name || 'System'
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [banks, setBanks] = useState<Acct[]>([])
  const [existingRefs, setExistingRefs] = useState<string[]>([])

  const [lender, setLender] = useState('')
  const [lenderType, setLenderType] = useState('bank')
  const [bankId, setBankId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<InterestMethod>('reducing_balance')
  const [rate, setRate] = useState('')
  const [totalRepayable, setTotalRepayable] = useState('')
  const [periods, setPeriods] = useState('12')
  const [ppy, setPpy] = useState('12')
  const [startDate, setStartDate] = useState(today())
  const [longTerm, setLongTerm] = useState(false)
  const [notes, setNotes] = useState('')

  const showToast = (m: string, t: 'success' | 'error' = 'success') => {
    setToastType(t); setToast(m); setTimeout(() => setToast(''), 5000)
  }

  useEffect(() => { load() }, [])

  const load = async () => {
    const [{ data: bs }, { data: ls }] = await Promise.all([
      supabase.from('accounts').select('id, code, name')
        .eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
      supabase.from('loans').select('ref'),
    ])
    setBanks((bs as Acct[]) || [])
    setExistingRefs(((ls || []) as { ref: string }[]).map(r => r.ref))
  }

  const principal = parseFloat(amount) || 0
  const preview = computeLoan({
    principal,
    annualRatePct: parseFloat(rate) || 0,
    totalRepayable: parseFloat(totalRepayable) || 0,
    periods: parseInt(periods) || 0,
    periodsPerYear: parseInt(ppy) || 12,
    method,
  })

  /** Next free LN-nnn. Checked against existing refs because the table has a
   *  unique constraint on (company_id, ref) and a collision would fail the
   *  whole post after the journal had already gone in. */
  const nextRef = () => {
    const used = new Set(existingRefs)
    for (let i = 1; i <= 9999; i++) {
      const r = `LN-${String(i).padStart(3, '0')}`
      if (!used.has(r)) return r
    }
    return `LN-${Date.now()}`
  }

  const post = async () => {
    if (!lender.trim()) { showToast('Enter the lender', 'error'); return }
    if (!bankId) { showToast('Choose the account the money was paid into', 'error'); return }
    if (principal <= 0) { showToast('Enter the amount received', 'error'); return }
    if (!(parseInt(periods) > 0)) { showToast('Enter the number of instalments', 'error'); return }
    if (method === 'fixed_total') {
      if ((parseFloat(totalRepayable) || 0) < principal) {
        showToast('Total repayable cannot be less than the amount borrowed', 'error'); return
      }
    } else if (!(parseFloat(rate) >= 0)) {
      showToast('Enter the interest rate', 'error'); return
    }

    setPosting(true)
    try {
      const code = longTerm ? LONGTERM_CODE : CURRENT_CODE
      const { data: liab } = await supabase.from('accounts')
        .select('id').eq('code', code).maybeSingle()
      if (!liab) throw new Error(`Account ${code} is missing from this company's chart of accounts.`)

      const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
      const ref = `JV-LN-${startDate.replace(/-/g, '')}-${stamp}`

      const { error: jErr } = await supabase.rpc('post_journal_transaction', {
        p_ref: ref,
        p_posting_date: startDate,
        p_description: notes.trim() || `Loan received from ${lender.trim()}`,
        p_journal_type: 'loan_disbursement',
        p_source_type: 'new_loan_voucher',
        p_source_ref: ref,
        p_posted_by: postedByName,
        p_branch: null,
        p_lines: [
          { account_id: bankId, description: `Loan received: ${lender.trim()}`, debit: principal, credit: 0 },
          { account_id: liab.id, description: `Loan payable: ${lender.trim()}`, debit: 0, credit: principal },
        ],
      })
      if (jErr) throw jErr

      const { error: lErr } = await supabase.from('loans').insert({
        ref: nextRef(),
        lender: lender.trim(),
        lender_type: lenderType,
        principal,
        interest_method: method,
        annual_rate_pct: method === 'fixed_total' ? null : (parseFloat(rate) || 0),
        total_repayable: method === 'fixed_total' ? (parseFloat(totalRepayable) || 0) : null,
        periods: parseInt(periods) || 1,
        periods_per_year: parseInt(ppy) || 12,
        start_date: startDate,
        liability_account_id: liab.id,
        status: 'active',
        is_opening: false,
        notes: notes.trim() || null,
        created_by: postedByName,
      })
      if (lErr) {
        throw new Error(`The journal posted, but the loan details failed to save: ${lErr.message}. The books are correct; add the facility on the Loans page so repayments can be scheduled.`)
      }

      showToast('Loan recorded', 'success')
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
      title="New Loan"
      icon=""
      subtitle="Money received from a lender today"
      color="rgba(var(--accent-rgb),.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : 'Record Loan'}
      postPosition="bottom"
      journalNote={`Dr bank or cash · Cr ${CURRENT_CODE} / ${LONGTERM_CODE} · Repayments are recorded separately`}
    >
      <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
        Use this when the money lands in your account today. If the business already owed this
        before it started using the app, use Opening Loans instead, otherwise the cash will be
        counted twice. Repayments are recorded separately so each instalment can be split into
        principal and interest.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Lender" req>
            <input className="form-input" placeholder="e.g. CRDB Bank, or a person's name"
              value={lender} onChange={e => setLender(e.target.value)} />
          </FG>
          <FG label="Lender Type">
            <select className="form-input" value={lenderType} onChange={e => setLenderType(e.target.value)}>
              <option value="bank">Bank</option>
              <option value="microfinance">Microfinance</option>
              <option value="sacco">SACCO</option>
              <option value="individual">Individual / family</option>
              <option value="other">Other</option>
            </select>
          </FG>
        </div>
        <div className="form-row">
          <FG label="Amount received (TZS)" req>
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
              value={amount} onChange={e => setAmount(e.target.value)} />
          </FG>
          <FG label="Paid into" req>
            <select className="form-input" value={bankId} onChange={e => setBankId(e.target.value)}>
              <option value="">Select account…</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
            </select>
          </FG>
        </div>
        <div className="form-row">
          <FG label="Date received" req>
            <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </FG>
          <FG label="Narration">
            <input className="form-input" value={notes} placeholder="Optional"
              onChange={e => setNotes(e.target.value)} />
          </FG>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={lbl}>How is interest charged?</div>
        <div style={{ marginBottom: 12 }}>
          {([
            ['reducing_balance', 'Reducing balance (banks)'],
            ['flat', 'Flat rate (microfinance, SACCO)'],
            ['fixed_total', 'Fixed total repayable (no rate quoted)'],
          ] as const).map(([val, title]) => (
            <label key={val} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 12, marginRight: 14 }}>
              <input type="radio" name="method" checked={method === val}
                onChange={() => setMethod(val)} style={{ accentColor: 'var(--accent)' }} />
              {title}
            </label>
          ))}
        </div>

        <div className="form-row">
          {method === 'fixed_total' ? (
            <FG label="Total agreed to repay (TZS)" req>
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                value={totalRepayable} onChange={e => setTotalRepayable(e.target.value)} />
            </FG>
          ) : (
            <FG label="Annual rate (%)" req>
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                value={rate} onChange={e => setRate(e.target.value)} />
            </FG>
          )}
          <FG label="Instalments" req>
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
              value={periods} onChange={e => setPeriods(e.target.value)} />
          </FG>
          <FG label="Frequency">
            <select className="form-input" value={ppy} onChange={e => setPpy(e.target.value)}>
              <option value="12">Monthly</option>
              <option value="4">Quarterly</option>
              <option value="52">Weekly</option>
              <option value="1">Yearly</option>
            </select>
          </FG>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, cursor: 'pointer', marginTop: 6 }}>
          <input type="checkbox" checked={longTerm} onChange={e => setLongTerm(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }} />
          <span>
            Long term (final payment more than a year away)
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)' }}>
              Puts it under {LONGTERM_CODE} instead of {CURRENT_CODE}, which is how a balance sheet should split debt.
            </span>
          </span>
        </label>
      </div>

      {preview.instalment > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
            <span style={{ color: 'var(--text3)' }}>Per instalment</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{tzs(preview.instalment)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
            <span style={{ color: 'var(--text3)' }}>Total repayable</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{tzs(preview.totalRepayableAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
            <span style={{ color: 'var(--text3)' }}>Interest cost</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{tzs(preview.totalInterest)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '1px solid var(--border)', marginTop: 6, fontSize: 13, fontWeight: 700 }}>
            <span>True cost per year</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
              {preview.effectiveAnnualRatePct.toFixed(1)}%
            </span>
          </div>
          {method !== 'reducing_balance' && preview.effectiveAnnualRatePct > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
              This costs the same as a {preview.effectiveAnnualRatePct.toFixed(1)}% bank loan. Worth
              comparing against a formal quote before you sign.
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
