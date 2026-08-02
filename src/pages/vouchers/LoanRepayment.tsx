// src/pages/vouchers/LoanRepayment.tsx
//
// Pay down a loan, splitting the payment correctly between principal and
// interest.
//
//   Dr 2200 Loans Payable      (principal portion  — reduces the liability)
//   Dr 6200 Interest Expense   (interest portion   — a real cost, hits P&L)
//       Cr <bank or cash>      (the whole payment leaves the account)
//
// This split is the single most common thing SMEs get wrong by hand. Expensing
// the entire instalment overstates costs, understates profit, and leaves the
// loan sitting on the balance sheet at its original size forever. Splitting it
// evenly is just as wrong: early payments are mostly interest, later ones are
// mostly principal, and that shifts every month.
//
// The split is taken from the loan's own amortization schedule (lib/loanMath),
// positioned by how many repayments have already been recorded, so it follows
// the real curve rather than a guess. It stays editable, because in practice
// people pay late, pay round numbers, or pay two instalments at once, and a
// system that refuses those is a system people stop using. Whatever is typed
// still has to add up to the payment, and the voucher enforces that.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import { useAuth } from '../../lib/useAuth'
import {
  loadNegativeCashPolicy, computeCashShortfall, evaluateCashPolicy,
  cashShortfallMessage, cashOverridePrompt, NEGATIVE_CASH_PERMISSION,
  type NegativeCashPolicy,
} from '../../lib/cashPolicy'
import { computeLoan, type InterestMethod } from '../../lib/loanMath'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface LoanRow {
  id: string; ref: string; lender: string; principal: number
  interest_method: InterestMethod; annual_rate_pct: number | null
  total_repayable: number | null; periods: number; periods_per_year: number
  liability_account_id: string | null; status: string
}
interface Acct { id: string; code: string; name: string; balance?: number | null }

// MalkiaOS: Interest Expense already exists at 7030. Tarakimu seeds it at
// 6200, but 6200 here is Branding & Marketing, and interest booked as
// marketing would be a quiet little lie in every P&L.
const INTEREST_CODE = '7030'

export default function LoanRepayment({ onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const postedByName = user?.full_name || 'System'
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)

  const [loans, setLoans] = useState<LoanRow[]>([])
  const [banks, setBanks] = useState<Acct[]>([])
  const [paidCounts, setPaidCounts] = useState<Record<string, number>>({})

  const [loanId, setLoanId] = useState('')
  const [bankId, setBankId] = useState('')
  const [cashPolicy, setCashPolicy] = useState<NegativeCashPolicy>('allow')
  useEffect(() => { loadNegativeCashPolicy().then(setCashPolicy) }, [])
  const [date, setDate] = useState(today())
  const [payment, setPayment] = useState('')
  const [principalPart, setPrincipalPart] = useState('')
  const [interestPart, setInterestPart] = useState('')
  const [touched, setTouched] = useState(false)
  const [notes, setNotes] = useState('')

  const showToast = (m: string, t: 'success' | 'error' = 'success') => {
    setToastType(t); setToast(m); setTimeout(() => setToast(''), 5000)
  }

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: ls }, { data: bs }, { data: reps }] = await Promise.all([
      supabase.from('loans')
        .select('id, ref, lender, principal, interest_method, annual_rate_pct, total_repayable, periods, periods_per_year, liability_account_id, status')
        .eq('status', 'active').order('lender'),
      supabase.from('accounts')
        .select('id, code, name, balance').eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
      supabase.from('loan_repayments').select('loan_id').eq('status', 'paid'),
    ])
    setLoans((ls as LoanRow[]) || [])
    setBanks((bs as Acct[]) || [])
    const counts: Record<string, number> = {}
    for (const r of (reps || []) as { loan_id: string }[]) {
      counts[r.loan_id] = (counts[r.loan_id] || 0) + 1
    }
    setPaidCounts(counts)
    setLoading(false)
  }

  const loan = loans.find(l => l.id === loanId) || null
  const schedule = loan ? computeLoan({
    principal: loan.principal,
    annualRatePct: loan.annual_rate_pct ?? 0,
    totalRepayable: loan.total_repayable ?? 0,
    periods: loan.periods,
    periodsPerYear: loan.periods_per_year,
    method: loan.interest_method,
  }) : null

  const paidSoFar = loan ? (paidCounts[loan.id] || 0) : 0
  const nextRow = schedule && paidSoFar < schedule.schedule.length ? schedule.schedule[paidSoFar] : null

  // Prefill from the schedule whenever the loan changes, unless the user has
  // already edited the split by hand.
  useEffect(() => {
    if (!nextRow || touched) return
    setPayment(String(nextRow.payment))
    setPrincipalPart(String(nextRow.principal))
    setInterestPart(String(nextRow.interest))
  }, [loanId, nextRow?.period])

  const pay = parseFloat(payment) || 0
  const pri = parseFloat(principalPart) || 0
  const int = parseFloat(interestPart) || 0
  const splitDrift = Math.round((pri + int - pay) * 100) / 100
  const splitOk = Math.abs(splitDrift) < 0.01

  const post = async () => {
    if (!loan) { showToast('Choose a loan', 'error'); return }
    if (!bankId) { showToast('Choose the account the money is paid from', 'error'); return }
    if (pay <= 0) { showToast('Enter the payment amount', 'error'); return }
    if (!splitOk) {
      showToast(`Principal + interest is ${tzs(pri + int)}, but the payment is ${tzs(pay)}. They must match.`, 'error'); return
    }
    if (pri < 0 || int < 0) { showToast('Principal and interest cannot be negative', 'error'); return }
    if (!loan.liability_account_id) {
      showToast('This loan has no liability account set. Fix it on the Loans page first.', 'error'); return
    }

    // Overdraw gate: repaying a loan from an account that does not hold the
    // money just converts a loan liability into a bank overdraft.
    {
      const payFrom = banks.find(a => a.id === bankId)
      const shortfall = computeCashShortfall(payFrom, pay)
      const canOverride = can(NEGATIVE_CASH_PERMISSION) || isSuperAdmin()
      const verdict = evaluateCashPolicy(shortfall, cashPolicy, canOverride, false)
      if (verdict === 'blocked' && shortfall) { showToast(cashShortfallMessage(shortfall, cashPolicy, canOverride), 'error'); return }
      if (verdict === 'needs_override' && shortfall) { if (!window.confirm(cashOverridePrompt(shortfall))) return }
    }
    setPosting(true)
    try {
      const { data: intAcct } = await supabase.from('accounts')
        .select('id').eq('code', INTEREST_CODE).maybeSingle()
      if (!intAcct && int > 0) {
        throw new Error(`Account ${INTEREST_CODE} Interest Expense is missing from this company's chart of accounts.`)
      }

      const lines: Array<{ account_id: string; description: string; debit: number; credit: number }> = []
      if (pri > 0) lines.push({ account_id: loan.liability_account_id, description: `Loan repayment principal: ${loan.lender}`, debit: pri, credit: 0 })
      if (int > 0) lines.push({ account_id: intAcct!.id, description: `Loan interest: ${loan.lender}`, debit: int, credit: 0 })
      lines.push({ account_id: bankId, description: `Loan repayment: ${loan.lender}`, debit: 0, credit: pay })
      if (lines.length < 2) throw new Error('A repayment needs at least a principal or interest line.')

      const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
      const ref = `JV-LR-${date.replace(/-/g, '')}-${stamp}`

      const { data: journalId, error: jErr } = await supabase.rpc('post_journal_transaction', {
        p_ref: ref,
        p_posting_date: date,
        p_description: notes.trim() || `Loan repayment: ${loan.lender}`,
        p_journal_type: 'loan_repayment',
        p_source_type: 'loan_repayment_voucher',
        p_source_ref: loan.ref,
        p_posted_by: postedByName,
        p_branch: null,
        p_lines: lines,
      })
      if (jErr) throw jErr

      const { error: rErr } = await supabase.from('loan_repayments').insert({
        loan_id: loan.id,
        period_no: paidSoFar + 1,
        due_date: nextRow ? date : null,
        paid_date: date,
        principal_paid: pri,
        interest_paid: int,
        journal_id: journalId as unknown as string,
        status: 'paid',
        notes: notes.trim() || null,
      })
      if (rErr) {
        throw new Error(`The journal posted, but the repayment record failed to save: ${rErr.message}. The books are correct; the loan schedule may be one payment behind.`)
      }

      // Settle the loan once the principal is fully repaid. Compared against
      // the ORIGINAL principal, not the schedule, because a tenant may have
      // paid irregular amounts that do not follow it.
      const { data: allReps } = await supabase.from('loan_repayments')
        .select('principal_paid').eq('loan_id', loan.id)
      const totalPrincipalPaid = (allReps || []).reduce((s, r: { principal_paid: number }) => s + Number(r.principal_paid || 0), 0)
      if (totalPrincipalPaid >= loan.principal - 0.01) {
        await supabase.from('loans').update({ status: 'settled' }).eq('id', loan.id)
        showToast(`Repayment posted. ${loan.lender} is now fully settled.`, 'success')
      } else {
        showToast('Repayment posted', 'success')
      }

      setTimeout(() => onNav('loans'), 1600)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  const remaining = loan && schedule
    ? Math.max(0, schedule.schedule.length - paidSoFar)
    : 0

  return (
    <VoucherPage
      title="Loan Repayment"
      icon=""
      subtitle="Record a payment and split it correctly between principal and interest"
      color="rgba(var(--accent-rgb),.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : 'Post Repayment'}
      postPosition="bottom"
      postDisabled={loading || !loan || !splitOk}
      postDisabledReason={!loan ? 'Choose a loan' : !splitOk ? 'Principal and interest must add up to the payment' : 'Loading'}
      journalNote={`Dr loan liability (principal) · Dr ${INTEREST_CODE} Interest Expense · Cr bank or cash`}
    >
      {!loading && loans.length === 0 && (
        <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
          There are no active loans to repay. Record what the business owes first, either through
          Opening Loans for existing debt or by adding a facility on the Loans page.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Loan" req>
            <select className="form-input" value={loanId}
              onChange={e => { setLoanId(e.target.value); setTouched(false) }}>
              <option value="">Select a loan…</option>
              {loans.map(l => (
                <option key={l.id} value={l.id}>{l.lender} · {l.ref} · {tzs(l.principal)}</option>
              ))}
            </select>
          </FG>
          <FG label="Paid from" req>
            <select className="form-input" value={bankId} onChange={e => setBankId(e.target.value)}>
              <option value="">Select account…</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
            </select>
          </FG>
        </div>
        <div className="form-row">
          <FG label="Payment Date" req>
            <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
          </FG>
          <FG label="Narration">
            <input className="form-input" value={notes} placeholder="Optional"
              onChange={e => setNotes(e.target.value)} />
          </FG>
        </div>
      </div>

      {loan && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            {paidSoFar} of {schedule?.schedule.length ?? 0} instalments recorded
            {remaining > 0 ? ` · ${remaining} remaining` : ' · schedule complete'}
            {nextRow ? ` · next scheduled instalment ${tzs(nextRow.payment)}` : ''}
          </div>

          <div className="form-row">
            <FG label="Payment Amount (TZS)" req>
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                value={payment}
                onChange={e => {
                  const v = e.target.value
                  setPayment(v)
                  // Keep the split honest when the amount changes: hold the
                  // scheduled interest and move the difference to principal,
                  // which is what actually happens when someone overpays.
                  if (!touched && nextRow) {
                    const amt = parseFloat(v) || 0
                    const keepInterest = Math.min(nextRow.interest, amt)
                    setInterestPart(String(keepInterest))
                    setPrincipalPart(String(Math.max(0, amt - keepInterest)))
                  }
                }} />
            </FG>
          </div>

          <div className="form-row">
            <FG label="Principal (reduces the loan)" req>
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                value={principalPart}
                onChange={e => { setTouched(true); setPrincipalPart(e.target.value) }} />
            </FG>
            <FG label="Interest (a cost, hits P&L)" req>
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }}
                value={interestPart}
                onChange={e => { setTouched(true); setInterestPart(e.target.value) }} />
            </FG>
          </div>

          {!splitOk && pay > 0 && (
            <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 'var(--r)', background: 'var(--red-dim)', border: '1px solid var(--red)', fontSize: 12, color: 'var(--red)' }}>
              Principal + interest is {tzs(pri + int)}, but the payment is {tzs(pay)}.
              {splitDrift > 0 ? ' Reduce the split' : ' Increase the split'} by {tzs(Math.abs(splitDrift))}.
            </div>
          )}

          {touched && splitOk && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
              Split edited by hand. That is fine for a late or irregular payment, but if the interest
              is lower than the schedule expects, the loan will take longer to clear than planned.
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
