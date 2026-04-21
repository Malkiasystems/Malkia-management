import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, getPostedBy } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'
import {
  CustomerPaymentFlow, postCustomerReceiptLedger, buildCustomerReceiptJournalLines,
  type Debtor, type OpenInvoice,
} from '../../components/CustomerPaymentFlow'

interface Props {
  onNav: (p: Page) => void
  // Variant controls defaults: 'cash' shows cash/M-Pesa methods and defaults
  // deposit account to cash; 'bank' shows bank/cheque/RTGS and defaults
  // deposit to a bank account. Business logic is identical.
  variant?: 'cash' | 'bank'
}
interface DBAccount { id: string; code: string; name: string; category: string }

type ReceiptType = 'customer' | 'other'

const PAYMENT_METHODS_CASH = [
  { value: 'cash',    label: 'Cash' },
  { value: 'mpesa',   label: 'M-Pesa' },
  { value: 'mixx',    label: 'Mixx by Yas' },
  { value: 'airtel',  label: 'Airtel Money' },
  { value: 'pos',     label: 'POS Card (small)' },
]
const PAYMENT_METHODS_BANK = [
  { value: 'rtgs',    label: 'RTGS / Bank Transfer' },
  { value: 'cheque',  label: 'Cheque' },
  { value: 'deposit', label: 'Cash Deposit at Bank' },
  { value: 'pos',     label: 'POS Settlement' },
  { value: 'swift',   label: 'SWIFT (International)' },
]

export default function CashReceipt({ onNav: _onNav, variant = 'cash' }: Props) {
  const { isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])

  const [receiptType, setReceiptType] = useState<ReceiptType>('customer')

  const [form, setForm] = useState({
    date: today(),
    ref: '',
    amount: '',
    method: variant === 'bank' ? 'rtgs' : 'cash',
    transactionId: '',
    narration: '',
    depositAccountId: '',
    otherReceivedFrom: '',
    otherIncomeAccountId: '',
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const [paymentState, setPaymentState] = useState<{
    selectedCustomer: Debtor | null
    allocatedTotal: number
    unallocatedCredit: number
    allocations: OpenInvoice[]
  }>({ selectedCustomer: null, allocatedTotal: 0, unallocatedCredit: 0, allocations: [] })

  const handlePaymentChange = useCallback((s: typeof paymentState) => setPaymentState(s), [])

  useEffect(() => { loadAccounts(); loadNextRef() }, [variant])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts')
      .select('id, code, name, category').eq('is_active', true).order('code')
    if (data) {
      setAccounts(data)
      const cashAcc = data.find(a => a.category === 'Cash & Bank' &&
        (variant === 'bank' ? a.code.startsWith('10') && a.code !== '1001' : a.code === '1001' || a.code === '1003'))
        || data.find(a => a.category === 'Cash & Bank')
      if (cashAcc) setForm(f => ({ ...f, depositAccountId: cashAcc.id }))
    }
  }

  const loadNextRef = async () => {
    const ref = await nextRef('cash_receipt')
    setForm(f => ({ ...f, ref }))
  }

  const cashAccounts = accounts.filter(a => a.category === 'Cash & Bank')
  const arAccount = accounts.find(a => a.code === '1050')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const paymentMethods = variant === 'bank' ? PAYMENT_METHODS_BANK : PAYMENT_METHODS_CASH

  // Reset the form after a successful post. Keeps the user on the same page
  // with a clean slate — no page reload, no scroll jump, no lost toast.
  const resetFormAfterPost = async () => {
    const newRef = await nextRef('cash_receipt')
    setReceiptType('customer')
    setForm(f => ({
      ...f,
      ref: newRef,
      amount: '',
      transactionId: '',
      narration: '',
      otherReceivedFrom: '',
      otherIncomeAccountId: '',
      // keep: date, method, depositAccountId — likely reused for next receipt
    }))
    setPaymentState({ selectedCustomer: null, allocatedTotal: 0, unallocatedCredit: 0, allocations: [] })
  }

  const post = async () => {
    const amount = parseFloat(form.amount) || 0
    if (amount <= 0) { showToast('Enter a valid amount', 'error'); return }
    if (!form.depositAccountId) { showToast('Select a deposit account', 'error'); return }

    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    if (receiptType === 'customer') {
      if (!paymentState.selectedCustomer) { showToast('Select a customer first', 'error'); return }
      if (!arAccount) { showToast('Accounts Receivable (1050) not found — check Chart of Accounts', 'error'); return }
      if (paymentState.allocatedTotal > amount + 0.5) {
        showToast('Invoice allocations exceed payment amount. Reduce allocations.', 'error'); return
      }
      await postCustomerReceipt(amount)
    } else {
      if (!form.otherReceivedFrom.trim()) { showToast('Enter who paid', 'error'); return }
      if (!form.otherIncomeAccountId) { showToast('Select income / credit account', 'error'); return }
      await postOtherIncome(amount)
    }
  }

  const postCustomerReceipt = async (amount: number) => {
    if (!paymentState.selectedCustomer || !arAccount) return
    setPosting(true)
    const cust = paymentState.selectedCustomer
    const custName = cust.company || cust.name

    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Customer Receipt — ${custName} — ${form.ref}`,
        journal_type: 'cash_receipt', source_type: 'cash_receipt',
        source_ref: form.ref, posted_by: getPostedBy(), status: 'posted',
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const lines = buildCustomerReceiptJournalLines({
        depositAccountId: form.depositAccountId,
        arAccountId: arAccount.id,
        amount, customerName: custName, narration: form.narration,
      }).map(l => ({ ...l, journal_id: journal.id }))

      const { error: jlErr } = await supabase.from('journal_lines').insert(lines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all(lines.map(l =>
        supabase.rpc('update_account_balance', {
          p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit,
        })
      ))

      const ledgerResult = await postCustomerReceiptLedger({
        customerId: cust.id, voucherRef: form.ref, postingDate: form.date,
        amount, allocations: paymentState.allocations, journalId: journal.id,
        narration: form.narration,
      })
      if (!ledgerResult.success) {
        console.error('[receipt] ledger posting failed:', ledgerResult.error)
        showToast('Journal posted but ledger update failed: ' + ledgerResult.error, 'error')
        setPosting(false); return
      }

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'cash_receipt', posting_date: form.date,
        description: `Customer Receipt — ${custName}`,
        total_amount: amount, status: 'posted', journal_id: journal.id,
        payment_method: form.method, notes: form.narration,
        posted_by: getPostedBy(), customer_id: cust.id,
      })

      const allocCount = paymentState.allocations.filter(a => a.allocation > 0).length
      showToast(
        allocCount > 0
          ? `${form.ref} posted · ${allocCount} invoice${allocCount > 1 ? 's' : ''} settled · TZS ${paymentState.allocatedTotal.toLocaleString()}`
          : `${form.ref} posted · TZS ${amount.toLocaleString()} credit on account`
      )
      await resetFormAfterPost()
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const postOtherIncome = async (amount: number) => {
    setPosting(true)
    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `${variant === 'bank' ? 'Bank' : 'Cash'} Receipt — ${form.otherReceivedFrom} — ${form.ref}`,
        journal_type: 'cash_receipt', source_type: 'cash_receipt',
        source_ref: form.ref, posted_by: getPostedBy(), status: 'posted',
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: form.depositAccountId, description: `Received from ${form.otherReceivedFrom}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: form.otherIncomeAccountId, description: form.narration || form.otherReceivedFrom, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.depositAccountId, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.otherIncomeAccountId, p_debit: 0, p_credit: amount }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'cash_receipt', posting_date: form.date,
        description: `${variant === 'bank' ? 'Bank' : 'Cash'} Receipt — ${form.otherReceivedFrom}`,
        total_amount: amount, status: 'posted', journal_id: journal.id,
        payment_method: form.method, notes: form.narration, posted_by: getPostedBy(),
      })

      showToast(`${form.ref} posted · Dr ${variant === 'bank' ? 'Bank' : 'Cash'} · Cr Income`)
      await resetFormAfterPost()
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const amount = parseFloat(form.amount) || 0
  const depositAcc = accounts.find(a => a.id === form.depositAccountId)
  const journalPreview = (() => {
    if (amount <= 0 || !depositAcc) return null
    if (receiptType === 'customer' && paymentState.selectedCustomer && arAccount) {
      return { debit: { code: depositAcc.code, name: depositAcc.name }, credit: { code: arAccount.code, name: arAccount.name + ' (AR)' } }
    }
    if (receiptType === 'other' && form.otherIncomeAccountId) {
      const incAcc = accounts.find(a => a.id === form.otherIncomeAccountId)
      if (!incAcc) return null
      return { debit: { code: depositAcc.code, name: depositAcc.name }, credit: { code: incAcc.code, name: incAcc.name } }
    }
    return null
  })()

  const pageTitle = variant === 'bank' ? 'Bank Receipt' : 'Cash Receipt'
  const pageSubtitle = variant === 'bank'
    ? 'Record money received via bank transfer, cheque, or deposit'
    : 'Record money received in cash, M-Pesa, or Mobile Money'

  const canPost = (() => {
    if (amount <= 0) return false
    if (!form.depositAccountId) return false
    if (receiptType === 'customer') {
      if (!paymentState.selectedCustomer) return false
      if (paymentState.allocatedTotal > amount + 0.5) return false
      return true
    }
    return !!form.otherReceivedFrom.trim() && !!form.otherIncomeAccountId
  })()

  return (
    <VoucherPage
      title={pageTitle} icon="" subtitle={pageSubtitle} color="rgba(0,229,160,.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : `Post ${pageTitle}`}
      postDisabled={!canPost || posting}
      postDisabledReason={!canPost ? (receiptType === 'customer'
        ? 'Select customer, enter amount, pick deposit account. Allocations must not exceed payment.'
        : 'Enter who paid, amount, and select deposit + income accounts.'
      ) : undefined}
      journalNote={receiptType === 'customer' ? 'Dr Cash/Bank · Cr AR (1050) · Invoice allocations' : 'Dr Cash/Bank · Cr Income'}
    >
      {/* Type toggle */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          What kind of receipt is this?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {([
            { key: 'customer', title: 'Receipt from Customer', sub: 'Settles open invoices · Reduces AR', color: '#00e5a0' },
            { key: 'other',    title: 'Other Income / Deposit',  sub: 'Refunds, interest, misc · Not AR-related', color: '#d4874a' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => setReceiptType(opt.key)}
              style={{
                background: receiptType === opt.key ? `${opt.color}1a` : 'var(--surface2)',
                border: `1px solid ${receiptType === opt.key ? opt.color : 'var(--border)'}`,
                borderRadius: 'var(--r)', padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `2px solid ${receiptType === opt.key ? opt.color : 'var(--border)'}`,
                  background: receiptType === opt.key ? opt.color : 'transparent', flexShrink: 0,
                }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: receiptType === opt.key ? opt.color : 'var(--text)' }}>
                  {opt.title}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.4 }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Shared details */}
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Receipt Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} readOnly /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>

          {receiptType === 'other' && (
            <FG label="Received From" req>
              <input className="form-input" placeholder="e.g. Supplier refund, Bank interest, Grant received"
                value={form.otherReceivedFrom} onChange={e => set('otherReceivedFrom', e.target.value)} />
            </FG>
          )}

          <div className="form-row">
            <FG label="Amount (TZS)" req>
              <input type="number" className="form-input"
                style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }}
                placeholder="0" value={form.amount}
                onChange={e => set('amount', e.target.value)} />
            </FG>
            <FG label="Payment Method" req>
              <select className="form-input" value={form.method} onChange={e => set('method', e.target.value)}>
                {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </FG>
          </div>

          {form.method !== 'cash' && (
            <FG label={form.method === 'cheque' ? 'Cheque Number' : form.method === 'rtgs' ? 'Reference / TT Number' : 'Transaction ID'}>
              <input className="form-input"
                placeholder={
                  form.method === 'mpesa'  ? 'e.g. QTA1BCD2EFG' :
                  form.method === 'cheque' ? 'e.g. 000123' :
                  form.method === 'rtgs'   ? 'e.g. TT-REF-2026-01-01' :
                  'Reference number'
                }
                value={form.transactionId} onChange={e => set('transactionId', e.target.value)} />
            </FG>
          )}

          <FG label="Narration"><textarea className="form-input" rows={2}
            style={{ resize: 'none', fontSize: 12 }}
            placeholder="Purpose of payment, any notes for the ledger…"
            value={form.narration} onChange={e => set('narration', e.target.value)} /></FG>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Accounting</div>
          <FG label={variant === 'bank' ? 'Deposit to Bank Account' : 'Deposit To (Cash / M-Pesa)'} req>
            <select className="form-input" value={form.depositAccountId} onChange={e => set('depositAccountId', e.target.value)}>
              <option value="">— Select account —</option>
              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FG>

          {receiptType === 'customer' ? (
            <div style={{ padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginTop: 10 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Credit Account</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>
                {arAccount ? `${arAccount.code} — ${arAccount.name}` : 'AR account not found'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>
                Locked to Accounts Receivable. The payment reduces specific open invoices below.
              </div>
            </div>
          ) : (
            <FG label="Income / Credit Account" req>
              <select className="form-input" value={form.otherIncomeAccountId} onChange={e => set('otherIncomeAccountId', e.target.value)}>
                <option value="">— Select account —</option>
                {accounts.filter(a => ['4010','4011','4020','4110','2070','2085'].includes(a.code) || a.category === 'Other Income')
                  .map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </FG>
          )}

          {journalPreview && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 14 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--blue)' }}>Dr {journalPreview.debit.code} — {journalPreview.debit.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{amount.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
                <span style={{ color: 'var(--green)' }}>Cr {journalPreview.credit.code} — {journalPreview.credit.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{amount.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customer flow */}
      {receiptType === 'customer' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Customer & Invoice Allocation</div>
          <CustomerPaymentFlow
            voucherRef={form.ref}
            postingDate={form.date}
            amount={amount}
            paymentMethod={form.method}
            transactionId={form.transactionId}
            narration={form.narration}
            depositAccountId={form.depositAccountId}
            onChange={handlePaymentChange}
          />
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
