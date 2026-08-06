import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import MoneyInput from '../../components/MoneyInput'
import {
  loadNegativeCashPolicy, computeCashShortfall, evaluateCashPolicy,
  cashShortfallMessage, cashOverridePrompt, NEGATIVE_CASH_PERMISSION,
  type NegativeCashPolicy,
} from '../../lib/cashPolicy'
import { deriveMethod, refLabel, refPlaceholder } from '../../lib/paymentMethods'
import { checkApprovalRequired, submitForApproval, formatApprovalNotice, type ApprovalCheckResult } from '../../lib/useApproval'
import { consumeExpensePrefill } from '../../lib/expensePrefill'
import CategorySelect from '../../components/CategorySelect'
import QuickAddPayee, { type PayeeRole } from '../../components/QuickAddPayee'
import { GuideTip } from '../../components/GuideMode'
import { getExpenseVendorRules } from '../../lib/expenseSettings'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface DBAccount { id: string; code: string; name: string; type: string; category: string; balance?: number | null; parent_id?: string | null; allow_direct_posting?: boolean | null; sort_order?: number | null }
interface DBSupplier { id: string; name: string; balance_tzs: number; is_supplier?: boolean | null; is_vendor?: boolean | null }

export default function CashPayment({ onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  // Synchronous double-submit latch — React state alone lets two clicks in
  // the same tick both pass. Same guard BankTransfer got after the triple
  // 384,000 post; shared by BOTH posting paths (direct + approval).
  const postingRef = useRef(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
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
    branch: 'DSM HQ',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

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
  // Who is being paid. 'supplier' = stock suppliers (their AP balance and
  // statement update), 'vendor' = operational vendors (rent, internet,
  // services), 'other' = one-off payee typed by hand. One table, role flags;
  // NULL counts as allowed so pre-split rows appear in both lists.
  const [payeeType, setPayeeType] = useState<'supplier' | 'vendor' | 'other'>('supplier')
  const [quickAdd, setQuickAdd] = useState<PayeeRole | null>(null)
  const supplierList = suppliers.filter(sp => sp.is_supplier !== false)
  const vendorList = suppliers.filter(sp => sp.is_vendor !== false)
  const vendorMissing = requireVendor && payeeType !== 'other' && !form.supplierId

  const switchPayeeType = (t: 'supplier' | 'vendor' | 'other') => {
    if (t === payeeType) return
    setPayeeType(t)
    // A selection cannot survive the switch, and neither can the debit
    // account: Supplier locks it to 2010, and moving off Supplier must force
    // a fresh, conscious category pick rather than silently leaving AP
    // selected on a rent payment.
    setForm(f => ({ ...f, supplierId: '', expAccount: '' }))
  }

  // ─── Supplier payments settle AP ───────────────────────────────────────
  // Before this, the journal debited whatever category was picked while
  // suppliers.balance_tzs and the vendor ledger still dropped, so the AP
  // subledger moved and GL 2010 never did: they quietly diverged on every
  // supplier payment. The debit side is locked to 2010 whenever payee type
  // is Supplier. Vendor and Other keep the category picker, because those
  // genuinely are expenses.
  const apAccount = accounts.find(a => a.code === '2010')
  useEffect(() => {
    if (payeeType === 'supplier' && apAccount && form.expAccount !== apAccount.id) {
      setForm(f => ({ ...f, expAccount: apAccount.id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeType, accounts])

  const handleQuickAddCreated = async (id: string, name: string) => {
    setQuickAdd(null)
    await loadSuppliers()
    setForm(f => ({ ...f, supplierId: id, payTo: name }))
  }

  useEffect(() => {
    loadAccounts()
    loadSuppliers()
    loadNextRef()
  }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, type, category, balance, parent_id, allow_direct_posting, sort_order').eq('is_active', true).order('sort_order', { nullsFirst: false }).order('code')
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

  // Negative cash policy. Loaded once; the library declines to enforce if the
  // column is missing, so this is inert until migration 038 has run.
  const [cashPolicy, setCashPolicy] = useState<NegativeCashPolicy>('allow')
  useEffect(() => { loadNegativeCashPolicy().then(setCashPolicy) }, [])

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
  const expenseAccounts = accounts.filter(a => ['liability', 'expense', 'cogs'].includes(a.type))

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type)
  }

  // Create a pending voucher + approval request. On approval, executeCashPayment
  // re-posts it from this exact payload shape (form + expense lines + cashAccountId).
  const submitCashPaymentForApproval = async (amount: number, reason: string) => {
    // Same stale-ref exposure as the direct path: allocate fresh at submit.
    const draftRef = await nextRef('cash_payment')
    setForm(f => ({ ...f, ref: draftRef }))
    if (!user) { showToast('You must be signed in', 'error'); return }
    setPosting(true)
    try {
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: draftRef, type: 'cash_payment', posting_date: form.date,
        description: `Cash Payment — ${form.payTo}`, total_amount: amount,
        status: 'pending_approval', posted_by: user.full_name, notes: form.narration,
        branch: form.branch, supplier_id: form.supplierId || null, payment_method: 'cash',
      }).select('id').single()
      if (vErr || !voucher) throw new Error('Pending voucher: ' + (vErr?.message || 'unknown'))

      const payload = {
        form: { date: form.date, ref: draftRef, paidTo: form.payTo, notes: form.narration },
        lines: [{ desc: form.narration || form.payTo, amount, accountId: form.expAccount }],
        cashAccountId: form.cashAccount,
        total: amount,
      }
      const res = await submitForApproval({
        typeCode: 'cash_payment', referenceType: 'voucher', referenceId: voucher.id,
        referenceNumber: draftRef, summary: `Cash payment to ${form.payTo}${reason ? ' · ' + reason : ''}`,
        requestedValue: amount, payload, requestedBy: user.id,
      })
      if (!res.success) {
        await supabase.from('vouchers').delete().eq('id', voucher.id)
        throw new Error(res.error || 'Submission failed')
      }
      showToast(`${draftRef} submitted for approval · TZS ${amount.toLocaleString()}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      showToast(err.message || 'Submission failed', 'error')
    } finally { setPosting(false) }
  }

  // Guarded entry point. The latch flips synchronously BEFORE any await, so
  // a second click during the multi-second validation round-trips (posting
  // date check, approval check) finds it set and returns. Wrapping the whole
  // body means every early-return validation releases the latch through one
  // finally instead of twenty hand-written resets. The approval branch runs
  // inside doPost, so it is covered by the same latch.
  const post = async () => {
    if (postingRef.current) return
    postingRef.current = true
    setPosting(true)
    try {
      await doPost()
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  const doPost = async () => {
    if (!form.payTo.trim()) { showToast('Please enter payee name', 'error'); return }
    if (!form.amount) { showToast('Please enter amount', 'error'); return }
    if (!form.cashAccount) { showToast('Please select cash/bank account', 'error'); return }
    if (!form.expAccount) { showToast('Please select expense/debit account', 'error'); return }
    if (requireVendor && payeeType !== 'other' && !form.supplierId) { showToast('Select the supplier or vendor being paid.', 'error'); return }
    // Supplier payments settle a liability, not an expense. If the lock has
    // been defeated by a stale draft or a missing account, refuse rather
    // than let GL and subledger diverge again.
    if (payeeType === 'supplier' && (!apAccount || form.expAccount !== apAccount.id)) {
      showToast('Supplier payments settle Accounts Payable (2010). Account 2010 was not found or not selected.', 'error'); return
    }
    // Reference is OPTIONAL on money out, by decision: payments are often
    // posted before the money physically moves (approval-first control), so
    // demanding an ID here only taught people to invent one. The narration
    // carries the description; the ref is captured when it exists and the
    // register can list unreferenced payments for backfill. Money IN keeps
    // its strict ref in CashReceipt: a customer who has paid has the ID.
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

    // ─── Overdraw gate ─────────────────────────────────────────────────
    // A till cannot hold a negative balance. Checked here rather than in the
    // ledger so the user is told before anything is written, and told which
    // account and by how much.
    {
      const payingFrom = accounts.find(a => a.id === form.cashAccount)
      const shortfall = computeCashShortfall(payingFrom, amount)
      const canOverrideCash = can(NEGATIVE_CASH_PERMISSION) || isSuperAdmin()
      const verdict = evaluateCashPolicy(shortfall, cashPolicy, canOverrideCash, false)
      if (verdict === 'blocked' && shortfall) {
        showToast(cashShortfallMessage(shortfall, cashPolicy, canOverrideCash), 'error')
        return
      }
      if (verdict === 'needs_override' && shortfall) {
        if (!window.confirm(cashOverridePrompt(shortfall))) return
      }
    }

    try {
      // Get account IDs
      const cashAcct = accounts.find(a => a.id === form.cashAccount)
      const expAcct = accounts.find(a => a.id === form.expAccount)
      if (!cashAcct || !expAcct) throw new Error('Accounts not found')

      // Fresh ref at POST time. The ref shown in the form was computed at
      // mount and is stale the moment anyone else posts a payment — that is
      // how a tab opened before Epifania's PAY-10-0081 tried to reuse her
      // number. The preview is cosmetic; this is the real allocation, and
      // insertJournalWithRetry remains the backstop for a same-second race.
      const postRef = await nextRef('cash_payment')

      // Create journal
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + postRef,
        posting_date: form.date,
        description: `Cash Payment — ${form.payTo} — ${postRef}`,
        journal_type: 'cash_payment',
        source_type: 'cash_payment',
        source_ref: postRef,
        posted_by: user.full_name,   // was hardcoded 'Joe Gembe'
        status: 'posted',
        branch: form.branch,
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw
      // The ref that actually landed. If the retry bumped past a collision,
      // this differs from postRef — and every write below must follow it,
      // or we recreate the voucher-points-at-wrong-journal skew.
      const finalRef = journal.source_ref

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
        ref: finalRef,
        type: 'cash_payment',
        posting_date: form.date,
        description: `Cash Payment — ${form.payTo}`,
        total_amount: amount,
        status: 'posted',
        branch: form.branch,
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
        await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplierId,
          posting_date: form.date,
          document_type: 'payment',
          document_ref: finalRef,
          description: `Cash Payment — ${form.payTo}${form.narration ? ' — ' + form.narration : ''}`,
          amount_tzs: -amount,
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
        })
      }

      showToast(`${finalRef} posted · Dr ${expAcct.code} / Cr ${cashAcct.code} · Journal created`)
      onNav('vouchers')

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      showToast(msg, 'error')
    }
  }

  return (
    <VoucherPage
      title="Payment Voucher"
      icon=""
      subtitle="Pay any expense or supplier from cash, bank, or M-Pesa"
      color="rgba(255,71,87,.12)"
      onPost={post}
      postDisabled={vendorMissing || posting}
      postDisabledReason={vendorMissing ? 'A vendor is required — select a supplier' : posting ? 'Posting in progress — please wait' : undefined}
      postLabel={posting ? (needsApproval ? 'Submitting…' : 'Posting…') : needsApproval ? 'Submit for Approval' : 'Post Payment'}
      journalNote={`Dr Expense/Supplier Account · Cr Cash/Bank Account · Balance updated`}>

      {needsApproval && approvalNotice && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, fontSize: 12, background: 'rgba(212,135,74,.10)', border: '1px solid rgba(212,135,74,.4)', color: 'var(--text2)' }}>
          {approvalNotice}
        </div>
      )}
      {vendorMissing && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, fontSize: 12, background: 'rgba(255,71,87,.10)', border: '1px solid rgba(255,71,87,.4)', color: 'var(--red, #dc2626)' }}>
          A vendor is required for cash payments. Select a supplier below.
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
              <button type="button" className={`btn btn-sm ${payeeType === 'other' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => switchPayeeType('other')}>Other</button>
            </div>
            <GuideTip>Who is this money going to? <strong>Supplier</strong> = someone who supplies you stock — their balance and statement update, and the payment settles what you owe them. <strong>Vendor</strong> = operational providers like rent, internet, transport or services. <strong>Other</strong> = a one-off payee typed by hand; nothing is tracked against a saved account.</GuideTip>
          </FG>
          {payeeType === 'supplier' && (
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplierId}
                onChange={e => e.target.value === '__add__' ? setQuickAdd('supplier') : handleSupplierChange(e.target.value)}>
                <option value="">— Select supplier —</option>
                {supplierList.map(sp => <option key={sp.id} value={sp.id}>{sp.name} · Balance: TZS {sp.balance_tzs?.toLocaleString()}</option>)}
                <option value="__add__">＋ Add new supplier…</option>
              </select>
              <GuideTip>Paying one reduces what you owe them: the debit locks to 2010 Accounts Payable, and the payment lands on their statement.</GuideTip>
            </FG>
          )}
          {payeeType === 'vendor' && (
            <FG label="Vendor" req>
              <select className="form-input" value={form.supplierId}
                onChange={e => e.target.value === '__add__' ? setQuickAdd('vendor') : handleSupplierChange(e.target.value)}>
                <option value="">— Select vendor —</option>
                {vendorList.map(sp => <option key={sp.id} value={sp.id}>{sp.name} · Balance: TZS {sp.balance_tzs?.toLocaleString()}</option>)}
                <option value="__add__">＋ Add new vendor…</option>
              </select>
              <GuideTip>Saved operational vendors — landlord, internet, security. Choosing one keeps every payment to them on one statement.</GuideTip>
            </FG>
          )}
          <FG label="Pay To (Payee)" req>
            <input className="form-input" placeholder="e.g. Meditech Tanzania, John Msomi" value={form.payTo} onChange={e => set('payTo', e.target.value)} />
          </FG>
          <FG label="Amount (TZS)" req>
            <MoneyInput className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={n => set('amount', n ? String(n) : '')} />
          </FG>
          <FG label="Narration">
            <textarea className="form-input" rows={3} placeholder="What was this payment for?" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} />
          </FG>
          <FG label={`${refLabel(payMethod)} (optional)`}>
            <input className="form-input"
              placeholder={refPlaceholder(payMethod)}
              value={form.chequeNo} onChange={e => set('chequeNo', e.target.value)} />
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
            <select className="form-input" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
              <option value="">— Select account —</option>
              {creditAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name} · TZS {(a.balance || 0).toLocaleString()}</option>)}
            </select>
            {creditMode === 'asset' && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Pays out of an asset pot (no bank movement). The pot must already be funded, or its balance goes negative.
              </div>
            )}
          </FG>
          <FG label="Expense / Debit Account" req>
            {payeeType === 'supplier' ? (
              <input className="form-input" value="2010 — Accounts Payable (locked for supplier payments)" readOnly
                style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }} />
            ) : (
              <CategorySelect accounts={expenseAccounts} value={form.expAccount} onChange={v => set('expAccount', v)} placeholder="— Select category —" />
            )}
          </FG>

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

          <FG label="Branch" req>
            <select className="form-input" value={form.branch} onChange={e => set('branch', e.target.value)}>
              <option>DSM HQ</option>
            </select>
          </FG>

          <button className="btn btn-primary" onClick={post} disabled={posting} style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '12px', opacity: posting ? 0.6 : 1 }}>
            {posting ? 'Posting…' : 'Post Payment'}
          </button>
        </div>
      </div>

      {quickAdd && (
        <QuickAddPayee role={quickAdd} onCreated={handleQuickAddCreated} onClose={() => setQuickAdd(null)} />
      )}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
