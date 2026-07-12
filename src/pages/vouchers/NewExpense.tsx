// ─── NewExpense ────────────────────────────────────────────────────────────
// A clean, accounting-free way to log an expense. You pick a Category (what it
// was for) and where the money comes from (Cash / Bank / Petty). The double
// entry, voucher type, approval gate, and budget check are handled behind the
// scenes by expensePost.ts.
//
// Replaces nothing: Cash Payment and Petty Cash still exist for accountants who
// want the raw voucher. This is the friendly front door for everyone else.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today } from '../../lib/utils'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'
import {
  postExpense, submitExpenseForApproval, checkExpenseApproval, checkBudgetImpact,
  deriveExpenseType, type ExpenseInput, type BudgetImpact,
} from '../../lib/expensePost'
import { formatApprovalNotice, type ApprovalCheckResult } from '../../lib/useApproval'
import { consumeExpensePrefill } from '../../lib/expensePrefill'

interface Props { onNav: (p: Page) => void }
interface Account { id: string; code: string; name: string; type: string; category: string }
interface Supplier { id: string; name: string; balance_tzs: number }

const tzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString()

export default function NewExpense({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)

  const [form, setForm] = useState({
    date: today(), ref: '', payTo: '', supplierId: '',
    expenseAccountId: '', payingAccountId: '', amount: '', narration: '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const [approvalCheck, setApprovalCheck] = useState<ApprovalCheckResult | null>(null)
  const [budget, setBudget] = useState<BudgetImpact | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  useEffect(() => {
    supabase.from('accounts').select('id, code, name, type, category').eq('is_active', true).order('code')
      .then(({ data }) => data && setAccounts(data))
    supabase.from('suppliers').select('id, name, balance_tzs').eq('is_active', true).order('name')
      .then(({ data }) => data && setSuppliers(data))
    nextRef('cash_payment').then(ref => setForm(f => ({ ...f, ref })))

    // One-shot prefill from a recurring "Pay now". User still picks pay-from
    // and confirms, so it passes through the same approval + budget checks.
    const pre = consumeExpensePrefill()
    if (pre) setForm(f => ({
      ...f,
      expenseAccountId: pre.expenseAccountId || f.expenseAccountId,
      amount: pre.amount != null ? String(pre.amount) : f.amount,
      payTo: pre.payTo || f.payTo,
      supplierId: pre.supplierId || f.supplierId,
      narration: pre.narration || f.narration,
    }))
  }, [])

  const categories = accounts.filter(a => ['expense', 'cogs'].includes(a.type))
  const payFrom = accounts.filter(a => a.category === 'Cash & Bank')
  const payingAccount = accounts.find(a => a.id === form.payingAccountId)
  const amountNum = parseFloat(form.amount) || 0

  // Live approval pre-check: recompute when amount or paying account changes.
  useEffect(() => {
    if (!payingAccount || amountNum <= 0) { setApprovalCheck(null); return }
    let cancelled = false
    checkExpenseApproval(payingAccount.code, amountNum).then(r => { if (!cancelled) setApprovalCheck(r) })
    return () => { cancelled = true }
  }, [payingAccount?.code, amountNum])

  // Live budget guardrail: recompute when category or amount changes.
  useEffect(() => {
    if (!form.expenseAccountId || amountNum <= 0) { setBudget(null); return }
    let cancelled = false
    checkBudgetImpact(form.expenseAccountId, form.date, amountNum).then(b => { if (!cancelled) setBudget(b) })
    return () => { cancelled = true }
  }, [form.expenseAccountId, form.date, amountNum])

  const canBypass = (approvalCheck?.superAdminBypass ?? false) && isSuperAdmin()
  const needsApproval = !!approvalCheck?.requiresApproval && !!approvalCheck?.blockPosting && !canBypass
  const approvalNotice = approvalCheck ? formatApprovalNotice(approvalCheck) : ''

  const handleSupplier = (id: string) => {
    set('supplierId', id)
    const sup = suppliers.find(s => s.id === id)
    if (sup && !form.payTo) set('payTo', sup.name)
  }

  const buildInput = useCallback((): ExpenseInput => ({
    date: form.date, ref: form.ref, payTo: form.payTo.trim(),
    supplierId: form.supplierId || null,
    expenseAccountId: form.expenseAccountId,
    payingAccountId: form.payingAccountId,
    payingAccountCode: payingAccount?.code || '',
    amount: amountNum, narration: form.narration.trim(),
  }), [form, payingAccount, amountNum])

  const post = async () => {
    if (!user) { showToast('You must be signed in', 'error'); return }
    if (!form.payTo.trim()) { showToast('Enter who was paid', 'error'); return }
    if (!form.expenseAccountId) { showToast('Choose a category', 'error'); return }
    if (!form.payingAccountId) { showToast('Choose where the money comes from', 'error'); return }
    if (amountNum <= 0) { showToast('Enter a valid amount', 'error'); return }

    setPosting(true)
    const input = buildInput()
    const poster = { id: user.id, full_name: user.full_name }

    try {
      // Re-check approval at submit time (rules may have changed mid-session).
      const check = await checkExpenseApproval(payingAccount!.code, amountNum)
      const bypass = check.superAdminBypass && isSuperAdmin()
      if (check.requiresApproval && check.blockPosting && !bypass) {
        const res = await submitExpenseForApproval(input, poster, check.reason || 'Approval required')
        if (!res.success) throw new Error(res.error)
        showToast(`${form.ref} submitted for approval · ${tzs(amountNum)}`)
        setTimeout(() => onNav('expense-register'), 1400)
        return
      }

      const res = await postExpense(input, poster, isSuperAdmin())
      if (!res.success) throw new Error(res.error)
      showToast(`${form.ref} posted · ${tzs(amountNum)}`)
      setTimeout(() => onNav('expense-register'), 1400)
    } catch (e: any) {
      showToast(e.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  const type = payingAccount ? deriveExpenseType(payingAccount.code) : null

  return (
    <>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      <VoucherPage
        title="New Expense"
        icon="💸"
        subtitle="Log any expense — the accounting is handled for you"
        color="rgba(255,71,87,.12)"
        onPost={post}
        postLabel={posting ? (needsApproval ? 'Submitting…' : 'Posting…') : needsApproval ? 'Submit for Approval' : 'Post Expense'}
        journalNote="Records the expense and reduces the account you paid from">

        <div className="grid g2" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>What was it?</div>
            <div className="form-row">
              <FG label="Ref" req><input className="form-input" value={form.ref} readOnly /></FG>
              <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <FG label="Category" req>
              <select className="form-input" value={form.expenseAccountId} onChange={e => set('expenseAccountId', e.target.value)}>
                <option value="">— Choose a category —</option>
                {categories.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FG>
            <FG label="Paid To" req>
              <input className="form-input" placeholder="e.g. Luku, landlord, Meditech" value={form.payTo} onChange={e => set('payTo', e.target.value)} />
            </FG>
            <FG label="Supplier (optional)">
              <select className="form-input" value={form.supplierId} onChange={e => handleSupplier(e.target.value)}>
                <option value="">— Not a supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} · {tzs(s.balance_tzs || 0)}</option>)}
              </select>
            </FG>
            <FG label="Notes">
              <textarea className="form-input" rows={2} placeholder="What was this for?" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} />
            </FG>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>How was it paid?</div>
            <FG label="Amount (TZS)" req>
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </FG>
            <FG label="Pay from" req>
              <select className="form-input" value={form.payingAccountId} onChange={e => set('payingAccountId', e.target.value)}>
                <option value="">— Choose cash / bank / petty —</option>
                {payFrom.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FG>
            {type && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: -6, marginBottom: 12 }}>
                Posts as {type === 'petty_cash' ? 'Petty Cash' : 'Cash Payment'}.
              </div>
            )}

            {/* Budget guardrail (item 3) */}
            {budget?.hasBudget && (
              <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 10, fontSize: 12,
                background: budget.status === 'over' ? 'rgba(255,71,87,.10)' : budget.status === 'warning' ? 'rgba(212,135,74,.10)' : 'rgba(94,168,162,.10)',
                border: `1px solid ${budget.status === 'over' ? 'rgba(255,71,87,.4)' : budget.status === 'warning' ? 'rgba(212,135,74,.4)' : 'rgba(94,168,162,.3)'}`,
                color: budget.status === 'over' ? 'var(--red, #dc2626)' : 'var(--text2)',
              }}>
                {budget.status === 'over'
                  ? `This puts this category at ${budget.pctAfter}% of its ${tzs(budget.budget)} budget — over by ${tzs(budget.actualAfter - budget.budget)}.`
                  : `This category will be at ${budget.pctAfter}% of its ${tzs(budget.budget)} monthly budget after this.`}
              </div>
            )}

            {/* Approval notice (items 1 + 4) */}
            {needsApproval && approvalNotice && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, fontSize: 12, background: 'rgba(212,135,74,.10)', border: '1px solid rgba(212,135,74,.4)', color: 'var(--text2)' }}>
                {approvalNotice}
              </div>
            )}
          </div>
        </div>
      </VoucherPage>
    </>
  )
}
