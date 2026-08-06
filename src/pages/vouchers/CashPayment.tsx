import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import {
  loadNegativeCashPolicy, computeCashShortfall, evaluateCashPolicy,
  cashShortfallMessage, cashOverridePrompt, NEGATIVE_CASH_PERMISSION,
  type NegativeCashPolicy,
} from '../../lib/cashPolicy'
import { deriveMethod, methodLabel, isRefRequired, refLabel, refPlaceholder } from '../../lib/paymentMethods'
import { checkApprovalRequired, submitForApproval, formatApprovalNotice, type ApprovalCheckResult } from '../../lib/useApproval'
import { consumeExpensePrefill } from '../../lib/expensePrefill'
import CategorySelect from '../../components/CategorySelect'
import { getExpenseVendorRules } from '../../lib/expenseSettings'
import { GuideTip } from '../../components/GuideMode'
import BankTilePicker from '../../components/BankTilePicker'
import { BranchSelect, useBranchChoice } from '../../components/BranchSelect'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import DraftBanner from '../../components/DraftBanner'
import QuickAddPayee, { type PayeeRole } from '../../components/QuickAddPayee'
import type { Page } from '../../lib/types'
import { setTransferPrefill, suggestFundingAmount } from '../../lib/transferPrefill'

interface Props { onNav: (p: Page) => void }

interface DBAccount { id: string; code: string; name: string; type: string; category: string; balance?: number | null; parent_id?: string | null; allow_direct_posting?: boolean | null; sort_order?: number | null }
interface DBSupplier { id: string; name: string; balance_tzs: number; is_supplier?: boolean | null; is_vendor?: boolean | null }

// onNav intentionally unused since fix-13: posting keeps the cashier on the
// page. The prop stays in the signature for App.tsx call-site compatibility.
export default function CashPayment({ onNav }: Props) {
  const { user, isSuperAdmin, can } = useAuth()
  // Branch stamp for the P&L by Branch report. Replaces the hardcoded
  // 'DSM HQ' / 'Arusha Branch' options that leaked from MalkiaOS — every
  // tenant now sees ITS OWN branches, scoped by the 060 ladder.
  const branchChoice = useBranchChoice()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  // Who is being paid. 'supplier' = stock suppliers (Purchases side),
  // 'vendor' = operational vendors (rent, internet, services), 'other' =
  // one-off payee typed by hand. Suppliers and vendors share one table with
  // is_supplier / is_vendor role flags; a NULL flag counts as allowed, so
  // rows from before the role split appear in both lists and nothing is lost.
  const [payeeType, setPayeeType] = useState<'supplier' | 'vendor' | 'delivery' | 'other'>('supplier')
  // Delivery money comes in two natures, and the journal must not confuse
  // them: 'withheld' = the rider's OWN money that sat in our accounts (a
  // debt we are settling — Dr 2115 liability), 'cost' = a genuine company
  // delivery expense (fuel, a courier we hire — Dr expense). Withheld is the
  // default because paying it as an expense is the mistake this exists to
  // prevent: costs inflate while the money owed to riders never drops.
  const [moneyKind, setMoneyKind] = useState<'withheld' | 'cost'>('withheld')
  const [approvalCheck, setApprovalCheck] = useState<ApprovalCheckResult | null>(null)
  const [requireVendor, setRequireVendor] = useState(false)
  const [creditMode, setCreditMode] = useState<'bank' | 'asset'>('bank')


  const [form, setForm] = useState({
    date: today(),
    ref: '',
    payTo: '',
    supplierId: '',
    expAccount: '',
    cashAccount: '',
    amount: '',
    narration: '',
    chequeNo: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence (fix-12) ────────────────────────────────────────
  // Same treatment CashSale and Purchase already have. Navigating away and
  // coming back no longer loses a half-filled payment. The ref is NOT part
  // of the draft — a fresh one is generated on every mount so a resumed
  // draft can never collide with a payment posted in between.
  interface CashPaymentDraft {
    form: Omit<typeof form, 'ref'>
    payeeType: 'supplier' | 'vendor' | 'delivery' | 'other'
    moneyKind?: 'withheld' | 'cost'
    creditMode: 'bank' | 'asset'
  }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<CashPaymentDraft>('cash-payment')

  useEffect(() => {
    // Nothing worth saving until the user has actually entered something.
    if (!form.payTo && !form.amount && !form.narration && !form.supplierId) return
    const { ref: _ref, ...rest } = form
    saveDraft({ form: rest, payeeType, moneyKind, creditMode })
  }, [form, payeeType, moneyKind, creditMode, saveDraft])

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(f => ({ ...f, ...availableDraft.form }))   // keep the fresh ref
    setPayeeType(availableDraft.payeeType)
    if (availableDraft.moneyKind) setMoneyKind(availableDraft.moneyKind)
    setCreditMode(availableDraft.creditMode)
    acknowledgeResume()
  }

  // ─── Quick-add payee (fix-12, handoff 5a) ──────────────────────────────
  const [quickAdd, setQuickAdd] = useState<PayeeRole | null>(null)
  const handleQuickAddCreated = async (id: string, name: string) => {
    setQuickAdd(null)
    await loadSuppliers()
    setForm(f => ({ ...f, supplierId: id, payTo: name }))
  }

  // Live approval pre-check: a cash payment over the configured threshold
  // (TZS 500,000) needs sign-off before it can post. Recompute as amount changes.
  const amountNum = parseFloat(form.amount) || 0
  useEffect(() => {
    if (amountNum <= 0) { setApprovalCheck(null); return }
    let cancelled = false
    checkApprovalRequired('cash_payment', { value: amountNum }).then(r => { if (!cancelled) setApprovalCheck(r) })
    return () => { cancelled = true }
  }, [amountNum])
  const canBypassApproval = (approvalCheck?.superAdminBypass ?? false) && isSuperAdmin()
  const needsApproval = !!approvalCheck?.requiresApproval && !!approvalCheck?.blockPosting && !canBypassApproval
  const approvalNotice = approvalCheck ? formatApprovalNotice(approvalCheck) : ''
  const supplierList = suppliers.filter(s => s.is_supplier !== false)
  const vendorList = suppliers.filter(s => s.is_vendor !== false)
  const vendorMissing = requireVendor && !form.supplierId

  // Recurring-expense prefill lands before the suppliers list resolves, so
  // classify the prefilled payee once rows arrive: vendor-only rows flip the
  // segment to Vendor so the selection is actually visible in its dropdown.
  useEffect(() => {
    if (!form.supplierId || suppliers.length === 0) return
    const row = suppliers.find(s => s.id === form.supplierId)
    if (row && row.is_supplier === false && row.is_vendor !== false) setPayeeType('vendor')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers])

  const switchPayeeType = (t: 'supplier' | 'vendor' | 'delivery' | 'other') => {
    if (t === payeeType) return
    setPayeeType(t)
    // The lists differ, so a selection cannot survive a switch. Typed payee
    // text is kept — the user may have written it deliberately.
    // The debit account also cannot survive the switch: Supplier locks it to
    // 2010 Accounts Payable (paying a supplier settles a liability), and
    // moving off Supplier must force a fresh, conscious category pick rather
    // than silently leaving AP selected on a rent payment.
    setForm(f => ({ ...f, supplierId: '', expAccount: '' }))
  }

  // ─── Supplier payments settle AP (fix-12) ──────────────────────────────
  // Before this, the journal debited whatever category the user picked while
  // suppliers.balance_tzs and the vendor ledger still dropped — so the AP
  // sub-ledger moved and GL 2010 never did, and the two quietly diverged on
  // every supplier payment. The debit side is now locked to 2010 whenever
  // payee type is Supplier. Vendor and Other keep the category picker,
  // because those genuinely are expenses.
  const apAccount = accounts.find(a => a.code === '2010')

  // ── Delivery & Rider Payables (2115) ────────────────────────────────────
  // Same one-way logic as the 2010 lock above, for the same reason: paying a
  // rider their withheld money settles a debt, and letting it hit an expense
  // account would overstate costs while the amount held never dropped.
  // The account is created on first use — seeded charts predate it.
  const deliveryPayables = accounts.find(a => a.code === '2115')
  const ensuringRef = useRef(false)
  useEffect(() => {
    if (payeeType !== 'delivery' || moneyKind !== 'withheld') return
    if (deliveryPayables || ensuringRef.current) return
    ensuringRef.current = true
    ;(async () => {
      await supabase.from('accounts').insert({
        code: '2115', name: 'Delivery & Rider Payables', type: 'liability',
        category: 'Payables', allow_direct_posting: true, is_active: true,
      })
      await loadAccounts()
      ensuringRef.current = false
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeType, moneyKind, deliveryPayables])
  useEffect(() => {
    if (payeeType === 'delivery' && moneyKind === 'withheld' && deliveryPayables && form.expAccount !== deliveryPayables.id) {
      setForm(f => ({ ...f, expAccount: deliveryPayables.id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeType, moneyKind, deliveryPayables?.id])
  useEffect(() => {
    if (payeeType === 'supplier' && apAccount && form.expAccount !== apAccount.id) {
      setForm(f => ({ ...f, expAccount: apAccount.id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeType, accounts])

  useEffect(() => {
    loadAccounts()
    loadSuppliers()
    loadNextRef()
  }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, type, category, balance, parent_id, allow_direct_posting, sort_order, nature, display_color, account_number').eq('is_active', true).order('sort_order', { nullsFirst: false }).order('code')
    if (data) setAccounts(data)
  }

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name, balance_tzs, is_supplier, is_vendor').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('cash_payment')
    setForm(f => ({ ...f, ref }))
  }

  // Recurring "Pay now" hands off here for amounts at/above the petty cash
  // ceiling. Prefill payee, amount, expense account, supplier.
  useEffect(() => {
    getExpenseVendorRules().then(r => setRequireVendor(r.cashPayment))
    const pre = consumeExpensePrefill()
    if (pre) setForm(f => ({
      ...f,
      payTo: pre.payTo || f.payTo,
      amount: pre.amount != null ? String(pre.amount) : f.amount,
      expAccount: pre.expenseAccountId || f.expAccount,
      supplierId: pre.supplierId || f.supplierId,
      narration: pre.narration || f.narration,
    }))
  }, [])

  // When supplier is selected, auto-fill Pay To
  const handleSupplierChange = (supplierId: string) => {
    set('supplierId', supplierId)
    if (supplierId) {
      const sup = suppliers.find(s => s.id === supplierId)
      if (sup) set('payTo', sup.name)
    }
  }

  const cashAccounts = accounts.filter(a => a.category === 'Cash & Bank')
  // Asset "pots" you can pay OUT of (e.g. a rent float / prepaid / deposit).
  // Whitelisted by name so no one credits Inventory, AR, or a header by mistake.
  const assetPots = accounts.filter(a =>
    a.type === 'asset' && a.allow_direct_posting !== false && /prepaid|deposit|advance|float|other receivable/i.test(a.name))
  const creditAccounts = creditMode === 'asset' ? assetPots : cashAccounts

  // What the money actually left through. An asset pot (a prepaid float, a
  // deposit) is not a bank movement and has no external reference to quote, so
  // it is treated like cash for reference purposes.
  const payAcct = accounts.find(a => a.id === form.cashAccount)
  const payMethod = creditMode === 'asset' || !payAcct
    ? 'cash'
    : deriveMethod(payAcct.code, payAcct.name)
  const refRequired = isRefRequired(payMethod)
  const refMissing = refRequired && !form.chequeNo.trim() && !!form.cashAccount && amountNum > 0
  const expenseAccounts = accounts.filter(a => ['liability', 'expense', 'cogs'].includes(a.type))

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type)
  }

  // Create a pending voucher + approval request. On approval, executeCashPayment
  // re-posts it from this exact payload shape (form + expense lines + cashAccountId).
  const submitCashPaymentForApproval = async (amount: number, reason: string) => {
    if (!user) { showToast('You must be signed in', 'error'); return }

    // ─── Negative cash gate ────────────────────────────────────────────
    // A payment cannot take the till or the bank below zero unless the
    // company has explicitly said it may. The refusal names the setting.
    setCashBlock(null)
    {
      const payingFrom = accounts.find(a => a.id === form.cashAccount)
      const shortfall = computeCashShortfall(payingFrom, amountNum)
      const canOverrideCash = can(NEGATIVE_CASH_PERMISSION) || isSuperAdmin()
      const verdict = evaluateCashPolicy(shortfall, cashPolicy, canOverrideCash, false)
      if (verdict === 'blocked' && shortfall) {
        setCashFund({
          accountId: shortfall.accountId,
          amount: suggestFundingAmount(shortfall.available, shortfall.needed),
        })
        setCashBlock(cashShortfallMessage(shortfall, cashPolicy, canOverrideCash))
        showToast('Not enough in that account to post this payment', 'error')
        return
      }
      if (verdict === 'needs_override' && shortfall) {
        if (!window.confirm(cashOverridePrompt(shortfall))) return
      }
    }
    setPosting(true)
    try {
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'cash_payment', posting_date: form.date,
        description: `Cash Payment — ${form.payTo}`, total_amount: amount,
        status: 'pending_approval', posted_by: user.full_name, notes: form.narration,
        branch: branchChoice.branchName || null, supplier_id: form.supplierId || null, payment_method: 'cash',
      }).select('id').single()
      if (vErr || !voucher) throw new Error('Pending voucher: ' + (vErr?.message || 'unknown'))

      const payload = {
        form: { date: form.date, ref: form.ref, paidTo: form.payTo, notes: form.narration, branch: branchChoice.branchName || null },
        lines: [{ desc: form.narration || form.payTo, amount, accountId: form.expAccount }],
        cashAccountId: form.cashAccount,
        total: amount,
      }
      const res = await submitForApproval({
        typeCode: 'cash_payment', referenceType: 'voucher', referenceId: voucher.id,
        referenceNumber: form.ref, summary: `Cash payment to ${form.payTo}${reason ? ' · ' + reason : ''}`,
        requestedValue: amount, payload, requestedBy: user.id,
      })
      if (!res.success) {
        await supabase.from('vouchers').delete().eq('id', voucher.id)
        throw new Error(res.error || 'Submission failed')
      }
      clearDraft()  // submitted — nothing left to recover
      showToast(`${form.ref} submitted for approval · TZS ${amount.toLocaleString()}`)
      setTimeout(() => resetForm(), 1200)
    } catch (err: any) {
      showToast(err.message || 'Submission failed', 'error')
    } finally { setPosting(false) }
  }

  // ─── Stay on the page after posting (fix-13) ───────────────────────────
  // A cashier paying five invoices in a row should not be bounced to the
  // voucher register after each one. Posting now resets the form in place
  // with a fresh ref; the till, payee type and credit mode are kept because
  // the next payment almost always leaves from the same place.
  const resetForm = async () => {
    const newRef = await nextRef('cash_payment')
    setForm(f => ({
      ...f,
      ref: newRef,
      date: today(),
      payTo: '',
      supplierId: '',
      amount: '',
      narration: '',
      chequeNo: '',
      // Supplier mode re-locks to 2010 via the AP effect; other modes start
      // with a conscious category pick.
      expAccount: payeeType === 'supplier' && apAccount ? apAccount.id : '',
    }))
    setApprovalCheck(null)
  }

  const [cashPolicy, setCashPolicy] = useState<NegativeCashPolicy>('block')
  const [cashBlock, setCashBlock] = useState<string | null>(null)
  // Which account was short, and how much clears it. Drives the funding button.
  const [cashFund, setCashFund] = useState<{ accountId: string; amount: number } | null>(null)

  useEffect(() => { loadNegativeCashPolicy().then(setCashPolicy) }, [])

  const post = async () => {
    if (!form.payTo.trim()) { showToast('Please enter payee name', 'error'); return }
    if (!form.amount) { showToast('Please enter amount', 'error'); return }
    if (!form.cashAccount) { showToast('Please select cash/bank account', 'error'); return }
    if (!form.expAccount) { showToast('Please select expense/debit account', 'error'); return }
    if (payeeType === 'supplier' && (!apAccount || form.expAccount !== apAccount.id)) {
      showToast('Supplier payments settle Accounts Payable (2010). Account 2010 was not found — check the chart of accounts.', 'error'); return
    }
    // Withheld rider money settles 2115, never an expense — same one-way
    // logic as the supplier/AP lock above, same reason.
    if (payeeType === 'delivery' && moneyKind === 'withheld' && (!deliveryPayables || form.expAccount !== deliveryPayables.id)) {
      showToast('Withheld delivery money settles Delivery & Rider Payables (2115). Wait a moment for the account to finish setting up, then post again.', 'error'); return
    }
    if (requireVendor && (payeeType === 'supplier' || payeeType === 'vendor') && !form.supplierId) { showToast('This company requires a saved payee. Choose Supplier or Vendor and select one.', 'error'); return }
    // Money going out needs a reference for every non-cash method, exactly as
    // money coming in does. Mirrors CashReceipt.
    if (refRequired && !form.chequeNo.trim()) {
      showToast(`${refLabel(payMethod)} is required for ${methodLabel(payMethod)} payments`, 'error'); return
    }
    if (!branchChoice.ready) { showToast('Select a branch for this payment', 'error'); return }
    if (!user) { showToast('You must be signed in', 'error'); return }

    // Date lock enforcement
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    const amount = parseFloat(form.amount)

    // ─── Approval gate ─────────────────────────────────────────────────
    // Large cash payments must be signed off before they post. Re-check at
    // submit time in case rules changed mid-session.
    const check = await checkApprovalRequired('cash_payment', { value: amount })
    const canBypass = check.superAdminBypass && isSuperAdmin()
    if (check.requiresApproval && check.blockPosting && !canBypass) {
      await submitCashPaymentForApproval(amount, check.reason || 'Approval required')
      return
    }

    setPosting(true)

    try {
      // Get account IDs
      const cashAcct = accounts.find(a => a.id === form.cashAccount)
      const expAcct = accounts.find(a => a.id === form.expAccount)
      if (!cashAcct || !expAcct) throw new Error('Accounts not found')

      // Create journal
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Cash Payment — ${form.payTo} — ${form.ref}`,
        journal_type: 'cash_payment',
        source_type: 'cash_payment',
        source_ref: form.ref,
        posted_by: user.full_name,   // was hardcoded 'Joe Gembe'
        status: 'posted',
        branch: branchChoice.branchName || null,
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      // Journal lines: Dr Expense / Cr Cash
      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: form.expAccount, description: `${form.narration || form.payTo}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: form.cashAccount, description: `Cash paid — ${form.payTo}`, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.expAccount, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.cashAccount, p_debit: 0, p_credit: amount }),
      ])

      // Create voucher
      const { error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'cash_payment',
        posting_date: form.date,
        description: `Cash Payment — ${form.payTo}`,
        total_amount: amount,
        status: 'posted',
        branch: branchChoice.branchName || null,
        supplier_id: form.supplierId || null,
        journal_id: journal.id,
        // Was hardcoded 'cash', so a supplier paid from CRDB was recorded as a
        // cash payment. Derived from the account the money actually left.
        payment_method: payMethod,
        // chequeNo was captured by the form and written nowhere — the exact bug
        // the Receipt page had. payment_ref exists on vouchers as of migration
        // 027, so it now has a home and can be reconciled against a statement.
        payment_ref: form.chequeNo.trim() || null,
        notes: form.narration,
        posted_by: user.full_name,   // was hardcoded 'Joe Gembe'
      })
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      // Update supplier balance and create vendor ledger entry if supplier selected
      if (form.supplierId) {
        const supplier = suppliers.find(s => s.id === form.supplierId)
        if (supplier) {
          await supabase.from('suppliers').update({ balance_tzs: supplier.balance_tzs - amount }).eq('id', form.supplierId)
        }

        // Create vendor ledger entry for supplier payment
        const { error: ck9 } = await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplierId,
          posting_date: form.date,
          document_type: 'payment',
          document_ref: form.ref,
          description: `Cash Payment — ${form.payTo}${form.narration ? ' — ' + form.narration : ''}`,
          amount_tzs: -amount,
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
        })
        if (ck9) throw new Error('vendor_ledger_entries write failed: ' + ck9.message)
      }

      clearDraft()  // posted successfully — nothing left to recover
      showToast(`${form.ref} posted · Dr ${expAcct.code} / Cr ${cashAcct.code} · Journal created`)
      resetForm()

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      showToast(msg, 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage
      title="Payment Voucher"
      icon=""
      subtitle="Pay any expense or supplier from cash, bank, or M-Pesa"
      color="rgba(255,71,87,.12)"
      onPost={post}
      postDisabled={vendorMissing}
      postDisabledReason={vendorMissing ? 'A vendor is required — select a supplier' : undefined}
      postLabel={posting ? (needsApproval ? 'Submitting…' : 'Posting…') : needsApproval ? 'Submit for Approval' : 'Post Payment'}
      journalNote={`Dr Expense/Supplier Account · Cr Cash/Bank Account · Balance updated`}>

      {availableDraft && draftAgeMs !== null && (
        <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
      )}
      {quickAdd && (
        <QuickAddPayee role={quickAdd} onClose={() => setQuickAdd(null)} onCreated={handleQuickAddCreated} />
      )}

      {needsApproval && approvalNotice && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, fontSize: 12, background: 'rgba(var(--accent-rgb),.10)', border: '1px solid rgba(var(--accent-rgb),.4)', color: 'var(--text2)' }}>
          {approvalNotice}
        </div>
      )}
      {vendorMissing && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, fontSize: 12, background: 'rgba(255,71,87,.10)', border: '1px solid rgba(255,71,87,.4)', color: 'var(--red, #dc2626)' }}>
          This company requires a saved payee on cash payments. Choose Supplier or Vendor above and select one.
        </div>
      )}

      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Payment Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} readOnly  /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          <FG label="Payee Type" req>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={`btn btn-sm ${payeeType === 'supplier' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => switchPayeeType('supplier')}>Supplier</button>
              <button type="button" className={`btn btn-sm ${payeeType === 'vendor' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => switchPayeeType('vendor')}>Vendor</button>
              <button type="button" className={`btn btn-sm ${payeeType === 'delivery' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => switchPayeeType('delivery')}>Delivery &amp; Shipping</button>
              <button type="button" className={`btn btn-sm ${payeeType === 'other' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => switchPayeeType('other')}>Other</button>
            </div>
            <GuideTip>Who is this money going to? <strong>Supplier</strong> = someone who supplies you stock (their balance and statement update automatically). <strong>Vendor</strong> = operational providers like rent, internet, transport, or services. <strong>Delivery &amp; Shipping</strong> = riders, boda boda, and couriers — including paying out delivery money you held for them. <strong>Other</strong> = a one-off payee you type by hand.</GuideTip>
          </FG>
          {payeeType === 'delivery' && (
            <FG label="Whose money is this?" req>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => setMoneyKind('withheld')}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r)', cursor: 'pointer',
                    border: `1px solid ${moneyKind === 'withheld' ? 'var(--accent)' : 'var(--border)'}`,
                    background: moneyKind === 'withheld' ? 'var(--accent-dim)' : 'var(--surface2)',
                  }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: moneyKind === 'withheld' ? 'var(--accent)' : 'var(--text)' }}>The rider's money we held</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, lineHeight: 1.45 }}>Their delivery fees sat in our till or M-Pesa. Paying it out clears what we owe — it is NOT a company cost.</div>
                </button>
                <button type="button" onClick={() => setMoneyKind('cost')}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r)', cursor: 'pointer',
                    border: `1px solid ${moneyKind === 'cost' ? 'var(--accent)' : 'var(--border)'}`,
                    background: moneyKind === 'cost' ? 'var(--accent-dim)' : 'var(--surface2)',
                  }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: moneyKind === 'cost' ? 'var(--accent)' : 'var(--text)' }}>A company delivery cost</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, lineHeight: 1.45 }}>We hired transport with our own money — fuel, a courier, a boda errand. This is a real expense.</div>
                </button>
              </div>
              <GuideTip>This choice decides the books. Money you HELD for riders is a debt being repaid — it goes against Delivery &amp; Rider Payables and never touches your expenses, so your profit stays honest. Money you SPENT on transport is a genuine cost and lands in an expense category like normal.</GuideTip>
            </FG>
          )}
          {payeeType === 'supplier' && (
            <FG label="Supplier" req={requireVendor}>
              <select className="form-input" value={form.supplierId}
                onChange={e => e.target.value === '__add__' ? setQuickAdd('supplier') : handleSupplierChange(e.target.value)}>
                <option value="">— Select supplier —</option>
                {supplierList.map(s => <option key={s.id} value={s.id}>{s.name} · Balance: TZS {s.balance_tzs?.toLocaleString()}</option>)}
                <option value="__add__">＋ Add new supplier…</option>
              </select>
              <GuideTip>Stock suppliers from your Purchases side. Paying one here reduces what you owe them — the payment lands on their statement and their balance drops. If they are missing, add them under Purchases → Suppliers first.</GuideTip>
            </FG>
          )}
          {payeeType === 'vendor' && (
            <FG label="Vendor" req={requireVendor}>
              <select className="form-input" value={form.supplierId}
                onChange={e => e.target.value === '__add__' ? setQuickAdd('vendor') : handleSupplierChange(e.target.value)}>
                <option value="">— Select vendor —</option>
                {vendorList.map(s => <option key={s.id} value={s.id}>{s.name} · Balance: TZS {s.balance_tzs?.toLocaleString()}</option>)}
                <option value="__add__">＋ Add new vendor…</option>
              </select>
              <GuideTip>Saved operational vendors — landlord, internet, security, services. Choosing one keeps all payments to them on one statement, so you can answer "how much have we paid them this year?" in one click.</GuideTip>
            </FG>
          )}
          <FG label="Pay To (Payee)" req>
            <input className="form-input" placeholder="e.g. Meditech Tanzania, John Msomi" value={form.payTo} onChange={e => set('payTo', e.target.value)} />
            <GuideTip>The name printed on the voucher. Picking a supplier or vendor fills it automatically; for Other, type the payee exactly as you want it to appear.</GuideTip>
          </FG>
          <FG label="Amount (TZS)" req>
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
            <GuideTip>Amounts above the company's approval threshold will be submitted for sign-off instead of posting instantly — the button below will tell you before you press it.</GuideTip>
          </FG>
          <FG label="Narration">
            <textarea className="form-input" rows={3} placeholder="What was this payment for?" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} />
            <GuideTip>One clear sentence on what the money was for. This is what you will read in the ledger and reports months from now — "June rent, Kariakoo office" beats "payment".</GuideTip>
          </FG>
          <FG label={refLabel(payMethod)} req={refRequired}>
            <input className="form-input"
              style={refMissing ? { borderColor: 'var(--red)' } : undefined}
              placeholder={refPlaceholder(payMethod)}
              value={form.chequeNo} onChange={e => set('chequeNo', e.target.value)} />
            {refMissing && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>
                Required for {methodLabel(payMethod)}. This is what Finance matches against the statement.
              </div>
            )}
          </FG>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Accounting</div>
          <FG label={creditMode === 'asset' ? 'Asset Account (Credit)' : 'Cash / Bank Account (Credit)'} req>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button type="button" className={`btn btn-sm ${creditMode === 'bank' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setCreditMode('bank'); set('cashAccount', '') }}>Bank / Cash</button>
              <button type="button" className={`btn btn-sm ${creditMode === 'asset' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setCreditMode('asset'); set('cashAccount', '') }}>Asset account</button>
            </div>
            {creditMode === 'bank' ? (
              <BankTilePicker
                accounts={cashAccounts}
                value={form.cashAccount}
                onChange={id => set('cashAccount', id)}
                showBalance
                ariaLabel="Pay from account"
              />
            ) : (
              <select className="form-input" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
                <option value="">— Select account —</option>
                {creditAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} · TZS {(a.balance || 0).toLocaleString()}</option>)}
              </select>
            )}
            {creditMode === 'asset' && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Pays out of an asset pot (no bank movement). The pot must already be funded, or its balance goes negative.
              </div>
            )}
            <GuideTip>Where the money physically leaves from — a till, bank, or mobile money account. The journal preview below shows exactly what will be recorded.</GuideTip>
          </FG>
          <FG label={payeeType === 'supplier' || (payeeType === 'delivery' && moneyKind === 'withheld') ? 'Debit Account — locked' : 'Expense / Debit Account'} req>
            {payeeType === 'supplier' || (payeeType === 'delivery' && moneyKind === 'withheld') ? (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 'var(--r)',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {payeeType === 'delivery'
                      ? (deliveryPayables ? `${deliveryPayables.code} — ${deliveryPayables.name}` : 'Setting up 2115 — Delivery & Rider Payables…')
                      : (apAccount ? `${apAccount.code} — ${apAccount.name}` : '2010 — Accounts Payable (missing!)')}
                  </span>
                  <svg width="14" height="14" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-label="locked">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <GuideTip>{payeeType === 'delivery'
                  ? 'This was never your money — it is the rider\u2019s fees you kept safely. Paying it out settles the debt in Delivery & Rider Payables, so it will not appear as a company expense and your profit stays true. If this payment is actually YOUR transport cost, switch \u201CWhose money is this?\u201D above to company cost.'
                  : 'Paying a supplier settles what you owe them, so the debit side is always Accounts Payable — it is not a choice, because picking an expense here would inflate costs while the amount owed never dropped. If this payment is actually for rent or services, switch the payee type to Vendor or Other above.'}</GuideTip>
              </>
            ) : (
              <>
                <CategorySelect
                  accounts={expenseAccounts}
                  value={form.expAccount}
                  onChange={v => set('expAccount', v)}
                  placeholder="— Select category —"
                  allowCreate={{ onCreated: async id => { await loadAccounts(); set('expAccount', id) } }}
                />
                <GuideTip>What the money was spent ON. If the right category isn't in the list, pick "Add new category" at the bottom — it creates a proper expense ledger on the spot.</GuideTip>
              </>
            )}
          </FG>

          {cashBlock && (
            <div style={{ marginBottom: 14, padding: '12px 14px', background: '#fee2e2', border: '1px solid #dc2626', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Cannot post</div>
              <div style={{ fontSize: 12, color: '#991b1b', lineHeight: 1.6, marginBottom: 10 }}>{cashBlock}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: '#991b1b', color: '#fff', border: 'none' }}
                onClick={() => {
                  // Hand the transfer the short account, the amount that clears
                  // it, and why. See transferPrefill.ts.
                  if (cashFund) {
                    setTransferPrefill({
                      toAccountId: cashFund.accountId,
                      amount: cashFund.amount,
                      narration: `Fund ${accounts.find(a => a.id === cashFund.accountId)?.name || 'cash account'} — ${form.ref || 'cash payment'}`,
                    })
                  }
                  onNav('bank-transfer')
                }}
              >
                Fund This Account{cashFund ? ` (${Math.round(cashFund.amount).toLocaleString()})` : ''}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: 'transparent', color: '#991b1b', border: '1px solid #991b1b' }}
                onClick={() => onNav('accounting-settings')}
              >
                Open Posting Rules
              </button>
            </div>
            </div>
          )}

          {form.amount && form.cashAccount && form.expAccount && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--blue)' }}>Dr {accounts.find(a => a.id === form.expAccount)?.code} — {accounts.find(a => a.id === form.expAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
                <span style={{ color: 'var(--red)' }}>Cr {accounts.find(a => a.id === form.cashAccount)?.code} — {accounts.find(a => a.id === form.cashAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
            </div>
          )}

          <BranchSelect choice={branchChoice} />

          <button className="btn btn-primary" onClick={post} disabled={posting} style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '12px', opacity: posting ? 0.6 : 1 }}>
            {posting ? 'Posting…' : 'Post Payment'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
