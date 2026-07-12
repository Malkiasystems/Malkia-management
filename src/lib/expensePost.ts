// ─── expensePost ───────────────────────────────────────────────────────────
// Mutation + checks for the expense system. One place that every expense entry
// path (the New Expense form, and recurring "pay now") flows through, so the
// approval gate and budget guardrail are applied consistently — you can't post
// an expense that skips them.
//
// Voucher type is DERIVED from the paying account: petty cash (code 1040) posts
// as 'petty_cash', everything else as 'cash_payment'. Both already have live
// approval rules AND existing approval executors (executePettyCash /
// executeCashPayment), so a held expense re-posts correctly when approved.
// The approval payloads below are built to match those executors exactly.
//
// Mirrors the working post() in CashPayment.tsx / PettyCash.tsx. Nothing here
// writes products.qty_on_hand or touches stock — expenses are money-only.
// ───────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import { insertJournalWithRetry } from './refs'
import { validatePostingDate } from './dateValidation'
import { checkApprovalRequired, submitForApproval } from './useApproval'
import { loadActualSpend, getMonthPeriod } from './useExpenseBudgets'

const PETTY_CASH_CODE = '1040'

export type ExpenseVoucherType = 'cash_payment' | 'petty_cash'

export function deriveExpenseType(payingAccountCode: string): ExpenseVoucherType {
  return payingAccountCode === PETTY_CASH_CODE ? 'petty_cash' : 'cash_payment'
}

export interface ExpenseInput {
  date: string
  ref: string
  payTo: string
  supplierId?: string | null
  expenseAccountId: string   // Dr — the category
  payingAccountId: string    // Cr — cash / bank / petty account
  payingAccountCode: string  // used to derive the voucher type
  amount: number
  narration?: string
  branch?: string | null
}

export interface Poster { id: string; full_name: string }

// ─── Approval ──────────────────────────────────────────────────────────────

export function checkExpenseApproval(payingAccountCode: string, amount: number) {
  return checkApprovalRequired(deriveExpenseType(payingAccountCode), { value: amount })
}

/**
 * Build the approval payload in the EXACT shape the existing executor expects,
 * so approving a held expense re-posts it identically.
 *   cash_payment → executeCashPayment: needs cashAccountId
 *   petty_cash   → executePettyCash: resolves 1040 itself, no cash id
 */
function buildApprovalPayload(input: ExpenseInput, type: ExpenseVoucherType) {
  const base = {
    form: { date: input.date, ref: input.ref, paidTo: input.payTo, notes: input.narration },
    lines: [{ desc: input.narration || input.payTo, amount: Number(input.amount), accountId: input.expenseAccountId }],
    total: Number(input.amount),
  }
  return type === 'cash_payment' ? { ...base, cashAccountId: input.payingAccountId } : base
}

// ─── Budget guardrail (item 3) ───────────────────────────────────────────────

export interface BudgetImpact {
  hasBudget: boolean
  budget: number
  actualBefore: number
  actualAfter: number
  pctAfter: number
  status: 'under' | 'warning' | 'over'
}

/**
 * What this expense would do to the category's budget for its month. Read-only.
 * Used to WARN at entry, never to block — a budget is guidance, not a lock.
 */
export async function checkBudgetImpact(
  expenseAccountId: string,
  dateISO: string,
  addAmount: number
): Promise<BudgetImpact> {
  const d = new Date(dateISO)
  const { start, end } = getMonthPeriod(d.getFullYear(), d.getMonth())

  const { data: budgetRows } = await supabase
    .from('expense_budgets')
    .select('budget_amount')
    .eq('account_id', expenseAccountId)
    .lte('period_start', dateISO)
    .gte('period_end', dateISO)

  const budget = (budgetRows || []).reduce((s: number, r: any) => s + (r.budget_amount || 0), 0)
  const actualMap = await loadActualSpend([expenseAccountId], start, end)
  const actualBefore = actualMap[expenseAccountId] || 0
  const actualAfter = actualBefore + (Number(addAmount) || 0)
  const pctAfter = budget > 0 ? Math.round((actualAfter / budget) * 100) : (actualAfter > 0 ? 999 : 0)
  const status: BudgetImpact['status'] = pctAfter >= 100 ? 'over' : pctAfter >= 80 ? 'warning' : 'under'

  return { hasBudget: budget > 0, budget, actualBefore, actualAfter, pctAfter, status }
}

// ─── Post (direct) ───────────────────────────────────────────────────────────

export interface PostResult { success: boolean; error?: string; ref?: string }

export async function postExpense(input: ExpenseInput, poster: Poster, isSuperAdmin: boolean): Promise<PostResult> {
  const amount = Number(input.amount)
  if (!input.payTo?.trim()) return { success: false, error: 'Enter who was paid.' }
  if (!amount || amount <= 0) return { success: false, error: 'Enter a valid amount.' }
  if (!input.expenseAccountId) return { success: false, error: 'Choose a category.' }
  if (!input.payingAccountId) return { success: false, error: 'Choose where the money comes from.' }
  if (!input.ref) return { success: false, error: 'Reference number missing.' }

  const dateCheck = await validatePostingDate(input.date, isSuperAdmin)
  if (!dateCheck.allowed) return { success: false, error: dateCheck.error || 'Date not allowed.' }

  const type = deriveExpenseType(input.payingAccountCode)

  const { data: j, error: jErr } = await insertJournalWithRetry({
    ref: 'JV-' + input.ref,
    posting_date: input.date,
    description: `Expense — ${input.payTo} — ${input.ref}`,
    journal_type: type,
    source_type: type,
    source_ref: input.ref,
    posted_by: poster.full_name,
    status: 'posted',
    branch: input.branch || undefined,
  })
  if (jErr || !j) return { success: false, error: jErr?.message || 'Journal insert failed.' }

  const { error: jlErr } = await supabase.from('journal_lines').insert([
    { journal_id: j.id, line_number: 1, account_id: input.expenseAccountId, description: input.narration || input.payTo, debit: amount, credit: 0 },
    { journal_id: j.id, line_number: 2, account_id: input.payingAccountId, description: `Paid — ${input.payTo}`, debit: 0, credit: amount },
  ])
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  await Promise.all([
    supabase.rpc('update_account_balance', { p_account_id: input.expenseAccountId, p_debit: amount, p_credit: 0 }),
    supabase.rpc('update_account_balance', { p_account_id: input.payingAccountId, p_debit: 0, p_credit: amount }),
  ])

  const { error: vErr } = await supabase.from('vouchers').insert({
    ref: input.ref,
    type,
    posting_date: input.date,
    description: `Expense — ${input.payTo}`,
    total_amount: amount,
    status: 'posted',
    branch: input.branch || null,
    supplier_id: input.supplierId || null,
    journal_id: j.id,
    payment_method: type === 'petty_cash' ? 'petty' : 'cash',
    notes: input.narration,
    posted_by: poster.full_name,
  })
  if (vErr) return { success: false, error: 'Voucher: ' + vErr.message }

  // Supplier payment: reduce their balance and log a vendor ledger entry,
  // matching CashPayment's behaviour.
  if (input.supplierId) {
    const { data: sup } = await supabase.from('suppliers').select('balance_tzs').eq('id', input.supplierId).maybeSingle()
    if (sup) await supabase.from('suppliers').update({ balance_tzs: (sup.balance_tzs || 0) - amount }).eq('id', input.supplierId)
    await supabase.from('vendor_ledger_entries').insert({
      supplier_id: input.supplierId, posting_date: input.date, document_type: 'payment',
      document_ref: input.ref, description: `Expense — ${input.payTo}${input.narration ? ' — ' + input.narration : ''}`,
      amount_tzs: -amount, remaining_amount: 0, is_open: false, journal_id: j.id,
    })
  }

  return { success: true, ref: input.ref }
}

// ─── Submit for approval (held) ──────────────────────────────────────────────

export interface SubmitResult { success: boolean; error?: string }

export async function submitExpenseForApproval(input: ExpenseInput, poster: Poster, reason: string): Promise<SubmitResult> {
  const amount = Number(input.amount)
  const type = deriveExpenseType(input.payingAccountCode)

  const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
    ref: input.ref, type, posting_date: input.date,
    description: `Expense — ${input.payTo}`, total_amount: amount,
    status: 'pending_approval', posted_by: poster.full_name, notes: input.narration,
    branch: input.branch || null, supplier_id: input.supplierId || null,
    payment_method: type === 'petty_cash' ? 'petty' : 'cash',
  }).select('id').single()
  if (vErr || !voucher) return { success: false, error: 'Pending voucher: ' + (vErr?.message || 'unknown') }

  const res = await submitForApproval({
    typeCode: type,
    referenceType: 'voucher',
    referenceId: voucher.id,
    referenceNumber: input.ref,
    summary: `Expense to ${input.payTo}${reason ? ' · ' + reason : ''}`,
    requestedValue: amount,
    payload: buildApprovalPayload(input, type),
    requestedBy: poster.id,
  })
  if (!res.success) {
    await supabase.from('vouchers').delete().eq('id', voucher.id)
    return { success: false, error: res.error || 'Submission failed.' }
  }
  return { success: true }
}
