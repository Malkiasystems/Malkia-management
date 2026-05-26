import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs, getPostedBy } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import {
  postCustomerReceiptLedger,
  buildCustomerReceiptJournalLines,
  type Debtor,
  type OpenInvoice,
} from '../../components/CustomerPaymentFlow'
import type { Page } from '../../lib/types'

// ════════════════════════════════════════════════════════════════════════
// Customer Receipt — Batch Entry (Navision-style)
//
// Why this page exists:
//   Joe asked for the same fast multi-line entry he had in Navision: load
//   many invoices for many customers in one screen, allocate amounts, hit
//   post once. The existing single CashReceipt page is fine for one-offs
//   but punishingly slow when a clerk is reconciling 30 wholesale payments
//   from a single bank statement.
//
// Design notes (why this is many vouchers, not one):
//   Each row in the batch becomes its OWN Cash Receipt voucher with its
//   OWN journal entry. We do NOT collapse the batch into one giant
//   multi-customer voucher because:
//     1. The customer_ledger_entries / customer statements / AR aging code
//        all assume one ledger entry per receipt voucher. Collapsing would
//        break per-customer history grouping.
//     2. An auditor wants to trace "did customer X pay TZS Y on date Z" —
//        easy when each customer has a discrete voucher, painful when one
//        voucher represents 30 different customers' payments.
//     3. If row 7 of 30 fails (RPC timeout, bad allocation maths), rows
//        1-6 are safely posted and 7 onwards can be retried. A single
//        transactional batch would fail the whole thing.
//
// Per-row safety:
//   Each row's post is wrapped in its own try/catch. Failures are
//   surfaced inline on that row with the actual error message, and the
//   row stays editable for retry. Successful rows lock with their ref
//   displayed.
//
// Reuse of existing helpers:
//   We call the same postCustomerReceiptLedger + buildCustomerReceiptJournalLines
//   used by the single CashReceipt page, so the journal shape, ledger
//   entries, and customer balance updates are byte-identical with what
//   a manual single-receipt would produce. The batch is just a faster
//   driver for the same proven posting logic.
// ════════════════════════════════════════════════════════════════════════

interface Props { onNav: (p: Page) => void }

interface BatchRow {
  id: string                          // local UI id
  customer: Debtor | null
  amount: string                      // free-text while editing
  paymentMethod: string               // 'cash' | 'mpesa' | 'rtgs' | 'cheque' | 'pos' | ...
  transactionId: string               // M-Pesa ref / cheque # / RTGS ref
  narration: string
  openInvoices: OpenInvoice[]         // loaded once a customer is picked
  status: 'pending' | 'posting' | 'posted' | 'failed'
  postedRef?: string                  // populated after a successful post
  error?: string                      // populated on failure, cleared on retry
  // When true the row is collapsed in the table; clicking expand reveals the
  // per-invoice allocation grid. Defaults closed so the table stays scannable.
  expanded: boolean
}

const PAYMENT_METHODS = [
  { value: 'cash',    label: 'Cash' },
  { value: 'mpesa',   label: 'M-Pesa' },
  { value: 'mixx',    label: 'Mixx by Yas' },
  { value: 'airtel',  label: 'Airtel Money' },
  { value: 'rtgs',    label: 'RTGS / Bank Transfer' },
  { value: 'cheque',  label: 'Cheque' },
  { value: 'deposit', label: 'Cash Deposit at Bank' },
  { value: 'pos',     label: 'POS' },
]

// Generate a stable, collision-resistant local row id without a uuid lib.
// (We could use crypto.randomUUID but want this to work in older browsers
// too; Date.now + Math.random is plenty for in-memory rows.)
const newRowId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const emptyRow = (paymentMethod = 'cash'): BatchRow => ({
  id: newRowId(),
  customer: null,
  amount: '',
  paymentMethod,
  transactionId: '',
  narration: '',
  openInvoices: [],
  status: 'pending',
  expanded: true,
})

export default function CustomerReceiptBatch({ onNav }: Props) {
  const { user } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)

  // Header / batch-level fields shared by all rows.
  // The deposit account picker is the one bank/cash account every receipt
  // in this batch will be debited against. Sensible default for the
  // common case: one bank statement → one deposit account → many
  // wholesale receipts. If different rows really must land in different
  // accounts, the clerk should split into two batches.
  const [postingDate, setPostingDate] = useState(today())
  const [cashAccounts, setCashAccounts] = useState<{ id: string; code: string; name: string; category: string }[]>([])
  const [depositAccountId, setDepositAccountId] = useState('')
  const [arAccountId, setArAccountId] = useState('')

  // The roster of selectable wholesale contacts. Pulled once on mount,
  // filtered to active and non-hidden. We accept both 'wholesale'
  // (canonical) and 'debtor' (legacy) so a partially-migrated DB still
  // works. See migration 009.
  const [contacts, setContacts] = useState<Debtor[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)

  // Rows. Always at least one. Clicking + adds another; rows can be
  // deleted unless they've already posted (locked).
  const [rows, setRows] = useState<BatchRow[]>([emptyRow()])

  // Track which row's customer picker is currently open (only one at a
  // time, otherwise the dropdowns visually collide).
  const [openPickerRowId, setOpenPickerRowId] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

  const showToast = (msg: string, t: 'success' | 'error' = 'success') => { setToast(msg); setToastType(t) }

  // ── Load contacts + cash accounts + AR account on mount ──────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [{ data: custs }, { data: accs }, { data: arData }] = await Promise.all([
        supabase.from('customers')
          .select('id, name, company, contact_person, customer_number, balance, whatsapp')
          .in('customer_type', ['wholesale', 'debtor'])
          .eq('is_active', true)
          .eq('is_hidden', false)
          .order('name'),
        supabase.from('accounts')
          .select('id, code, name, category')
          .eq('is_active', true)
          .eq('category', 'Cash & Bank')
          .order('code'),
        supabase.from('accounts').select('id').eq('code', '1050').single(),
      ])
      if (cancelled) return
      if (custs) setContacts(custs as Debtor[])
      if (accs) {
        setCashAccounts(accs)
        // Default deposit to the first bank-type account if any, else first cash.
        // 103x = bank, 101x = cash; bank first because batch receipts are usually
        // reconciliations of bank statements rather than cash drawer counts.
        const firstBank = accs.find(a => a.code.startsWith('103'))
        const firstCash = accs.find(a => a.code.startsWith('101'))
        setDepositAccountId((firstBank || firstCash || accs[0])?.id || '')
      }
      if (arData) setArAccountId(arData.id)
      setContactsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Row helpers ────────────────────────────────────────────────────
  const updateRow = (id: string, patch: Partial<BatchRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const addRow = () => {
    // Inherit the previous row's payment method as a sensible default —
    // batches of receipts are typically all the same method (one bank
    // statement, one M-Pesa export, etc.). Saves a click per row.
    const lastMethod = rows[rows.length - 1]?.paymentMethod || 'cash'
    setRows(prev => [...prev, emptyRow(lastMethod)])
  }

  const removeRow = (id: string) => {
    setRows(prev => {
      // Always keep at least one row visible. Removing the last one resets
      // it instead of leaving an empty table.
      if (prev.length === 1) return [emptyRow(prev[0].paymentMethod)]
      // Don't delete posted rows — they represent committed DB state and
      // dropping them from the UI would lose the audit trail of what we
      // just did. The clerk can press "Reset batch" if they want a fresh
      // sheet.
      const target = prev.find(r => r.id === id)
      if (target?.status === 'posted') return prev
      return prev.filter(r => r.id !== id)
    })
  }

  const resetBatch = () => {
    const hasPosted = rows.some(r => r.status === 'posted')
    if (hasPosted) {
      const ok = window.confirm(`This batch has ${rows.filter(r => r.status === 'posted').length} posted receipt(s). Clearing won't undo them — they remain in the books. Continue?`)
      if (!ok) return
    }
    setRows([emptyRow()])
  }

  // Pick a customer for a row. Triggers an open-invoice fetch so the
  // expand-view can show what's available to allocate against.
  const pickCustomer = async (rowId: string, c: Debtor) => {
    updateRow(rowId, { customer: c, openInvoices: [], status: 'pending', error: undefined })
    setOpenPickerRowId(null)
    setPickerSearch('')

    // Load open invoices for this customer. Same query shape as
    // CustomerPaymentFlow uses for its single-customer flow.
    const { data: invoices, error } = await supabase
      .from('customer_ledger_entries')
      .select('id, document_ref, posting_date, due_date, amount, remaining_amount')
      .eq('customer_id', c.id)
      .eq('document_type', 'invoice')
      .eq('is_open', true)
      .gt('remaining_amount', 0)
      .order('posting_date', { ascending: true })  // FIFO order

    if (error) {
      updateRow(rowId, { error: 'Failed to load open invoices: ' + error.message })
      return
    }
    const openInvs: OpenInvoice[] = (invoices || []).map(i => ({
      id: i.id,
      document_ref: i.document_ref,
      posting_date: i.posting_date,
      due_date: i.due_date,
      amount: i.amount || 0,
      remaining_amount: i.remaining_amount || 0,
      allocation: 0,
    }))
    updateRow(rowId, { openInvoices: openInvs })
  }

  // When the clerk types an amount, auto-allocate FIFO across the
  // customer's open invoices. They can manually override afterwards in
  // the expanded view.
  const setAmountAndAutoAllocate = (rowId: string, amountStr: string) => {
    const amt = parseFloat(amountStr) || 0
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      if (!r.customer || r.openInvoices.length === 0) {
        return { ...r, amount: amountStr }
      }
      // Walk invoices in FIFO order, consuming the amount until exhausted.
      let remaining = amt
      const newAllocs = r.openInvoices.map(inv => {
        if (remaining <= 0) return { ...inv, allocation: 0 }
        const take = Math.min(remaining, inv.remaining_amount)
        remaining -= take
        return { ...inv, allocation: take }
      })
      return { ...r, amount: amountStr, openInvoices: newAllocs }
    }))
  }

  // Manual override: user typed an explicit allocation for one invoice.
  const setInvoiceAllocation = (rowId: string, invoiceId: string, allocStr: string) => {
    const a = Math.max(0, parseFloat(allocStr) || 0)
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      return {
        ...r,
        openInvoices: r.openInvoices.map(inv =>
          inv.id === invoiceId
            ? { ...inv, allocation: Math.min(a, inv.remaining_amount) }
            : inv
        ),
      }
    }))
  }

  // ── Per-row validation ─────────────────────────────────────────────
  // Returns null if the row is OK to post, or a human-readable reason
  // if not. We surface the reason inline so the clerk doesn't have to
  // hunt for what's wrong.
  const validateRow = (r: BatchRow): string | null => {
    if (!r.customer) return 'Pick a customer'
    const amt = parseFloat(r.amount) || 0
    if (amt <= 0) return 'Amount must be > 0'
    const allocated = r.openInvoices.reduce((s, i) => s + i.allocation, 0)
    if (allocated > amt + 0.5) return `Allocated TZS ${allocated.toLocaleString()} > amount TZS ${amt.toLocaleString()}`
    // Note: allocated < amt is OK — the leftover becomes credit on account
    // (same behaviour as single-receipt path). We just don't error on it.
    return null
  }

  // Filtered roster for the picker dropdown. Client-side filter on the
  // already-loaded contacts list so each keystroke is instant.
  const filteredContacts = (() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return contacts.slice(0, 50)
    return contacts.filter(c =>
      (c.company || '').toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q) ||
      (c.customer_number || '').toLowerCase().includes(q)
    ).slice(0, 50)
  })()

  // ── Post the entire batch ──────────────────────────────────────────
  // Loops rows. Skips already-posted ones. For each row, posts using the
  // same shape as the single CashReceipt page. Per-row try/catch so a
  // single failure doesn't kill the rest.
  const postBatch = async () => {
    if (!user) { showToast('You must be signed in', 'error'); return }
    if (!depositAccountId) { showToast('Pick a deposit account first', 'error'); return }
    if (!arAccountId) { showToast('AR control account (1050) not found in Chart of Accounts', 'error'); return }

    const dateCheck = await validatePostingDate(postingDate, false)
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Posting date not allowed', 'error'); return }

    // Pre-validate every unposted row before we start writing. A clean
    // batch posts in one go; a dirty batch makes the clerk fix things
    // first rather than half-posting a mess.
    const toPost = rows.filter(r => r.status !== 'posted')
    if (toPost.length === 0) { showToast('Nothing to post — all rows are already posted', 'error'); return }

    const errors: { rowId: string; reason: string }[] = []
    for (const r of toPost) {
      const reason = validateRow(r)
      if (reason) errors.push({ rowId: r.id, reason })
    }
    if (errors.length > 0) {
      // Stamp inline errors and stop. Don't post anything.
      setRows(prev => prev.map(r => {
        const e = errors.find(x => x.rowId === r.id)
        return e ? { ...r, error: e.reason } : r
      }))
      showToast(`${errors.length} row(s) need fixing before posting`, 'error')
      return
    }

    setPosting(true)
    let okCount = 0
    let failCount = 0
    const failures: string[] = []

    for (const r of toPost) {
      // Mark this row as posting so the UI shows progress.
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: 'posting', error: undefined } : x))

      try {
        const cust = r.customer!
        const amount = parseFloat(r.amount) || 0
        const custName = cust.company || cust.name
        const ref = await nextRef('cash_receipt')

        // 1) Journal header
        const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
          ref: 'JV-' + ref, posting_date: postingDate,
          description: `Customer Receipt — ${custName} — ${ref} (batch)`,
          journal_type: 'cash_receipt', source_type: 'cash_receipt',
          source_ref: ref, posted_by: getPostedBy(), status: 'posted',
        })
        if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
        const journal = journalRaw

        // 2) Journal lines (reuses single-receipt builder)
        const lines = buildCustomerReceiptJournalLines({
          depositAccountId,
          arAccountId,
          amount,
          customerName: custName,
          narration: r.narration,
        }).map(l => ({ ...l, journal_id: journal.id }))

        const { error: jlErr } = await supabase.from('journal_lines').insert(lines)
        if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

        // 3) Update GL balances
        await Promise.all(lines.map(l =>
          supabase.rpc('update_account_balance', {
            p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit,
          })
        ))

        // 4) Customer AR ledger (reuses single-receipt helper)
        const ledgerResult = await postCustomerReceiptLedger({
          customerId: cust.id,
          voucherRef: ref,
          postingDate,
          amount,
          allocations: r.openInvoices,
          journalId: journal.id,
          narration: r.narration,
        })
        if (!ledgerResult.success) throw new Error(ledgerResult.error || 'Ledger update failed')

        // 5) Voucher header
        await supabase.from('vouchers').insert({
          ref, type: 'cash_receipt', posting_date: postingDate,
          description: `Customer Receipt — ${custName} (batch)`,
          total_amount: amount, status: 'posted', journal_id: journal.id,
          payment_method: r.paymentMethod,
          notes: r.narration || `Batch receipt · ${r.transactionId ? `ref ${r.transactionId}` : ''}`,
          posted_by: getPostedBy(), customer_id: cust.id,
        })

        // Mark posted, lock the row.
        setRows(prev => prev.map(x => x.id === r.id
          ? { ...x, status: 'posted', postedRef: ref, error: undefined, expanded: false }
          : x))
        okCount++

      } catch (err: any) {
        const msg = err?.message || 'Unknown error'
        setRows(prev => prev.map(x => x.id === r.id
          ? { ...x, status: 'failed', error: msg }
          : x))
        failures.push(`${r.customer?.company || r.customer?.name || 'row'}: ${msg}`)
        failCount++
      }
    }

    setPosting(false)
    if (failCount === 0) {
      showToast(`Batch complete · ${okCount} receipt${okCount === 1 ? '' : 's'} posted`)
    } else if (okCount === 0) {
      showToast(`Batch failed — ${failCount} row(s) errored. Fix and retry.`, 'error')
    } else {
      showToast(`Partial: ${okCount} posted, ${failCount} failed. See inline errors and retry.`, 'error')
    }
  }

  // ── Derived totals ──────────────────────────────────────────────────
  const batchTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const postedTotal = rows.filter(r => r.status === 'posted').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const pendingCount = rows.filter(r => r.status !== 'posted' && r.customer && (parseFloat(r.amount) || 0) > 0).length

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <VoucherPage
      title="Customer Receipts — Batch"
      icon="≡"
      subtitle="Receive payments from multiple wholesale customers in one entry"
      color="rgba(0,150,255,.12)"
      onPost={postBatch}
      postLabel={posting ? 'Posting batch…' : `Post Batch (${pendingCount} pending)`}
      postDisabled={posting || pendingCount === 0}
      postDisabledReason={pendingCount === 0 ? 'Add at least one row with a customer and amount' : undefined}
      journalNote="Dr Cash/Bank · Cr AR (1050) — one voucher per row, identical to single Customer Receipt"
      onNav={onNav}
    >
      {/* ── Batch header (shared across all rows) ─────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Batch Header</div>
        <div className="form-row">
          <FG label="Posting Date" req>
            <input type="date" className="form-input" value={postingDate} onChange={e => setPostingDate(e.target.value)} />
          </FG>
          <FG label="Deposit Account" req>
            <select className="form-input" value={depositAccountId} onChange={e => setDepositAccountId(e.target.value)}>
              <option value="">— Select —</option>
              {cashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </FG>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          All receipts in this batch will be debited to the same account. To deposit some elsewhere, split into separate batches.
        </div>
      </div>

      {/* ── Summary strip ─────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12,
      }}>
        {[
          { label: 'Rows', val: rows.length },
          { label: 'Batch Total', val: tzs(batchTotal) },
          { label: 'Posted So Far', val: tzs(postedTotal), color: 'var(--green)' },
          { label: 'Pending Post', val: pendingCount, color: pendingCount > 0 ? 'var(--accent)' : 'var(--text3)' },
        ].map((s, i) => (
          <div key={i} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: (s as any).color || 'var(--text)' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Rows ──────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title">Receipt Rows</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetBatch} className="btn btn-ghost btn-sm">Reset Batch</button>
            <button onClick={addRow} className="btn btn-primary btn-sm">+ Add Row</button>
          </div>
        </div>

        {contactsLoading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>Loading wholesale contacts…</div>
        )}

        {!contactsLoading && rows.map((r, idx) => {
          const amt = parseFloat(r.amount) || 0
          const allocated = r.openInvoices.reduce((s, i) => s + i.allocation, 0)
          const overflow = allocated - amt
          const credit = amt - allocated
          const locked = r.status === 'posted'

          return (
            <div key={r.id} style={{
              border: `1px solid ${
                r.status === 'posted' ? 'rgba(0,229,160,.4)'
                : r.status === 'failed' ? 'rgba(255,71,87,.4)'
                : 'var(--border)'
              }`,
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
              background: r.status === 'posted' ? 'rgba(0,229,160,.05)' : 'var(--surface)',
              opacity: locked ? 0.85 : 1,
            }}>
              {/* Row top: status badge + delete */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>
                    #{idx + 1}
                  </span>
                  {r.status === 'posted' && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(0,229,160,.15)', color: 'var(--green)', fontWeight: 700 }}>
                      ✓ POSTED · {r.postedRef}
                    </span>
                  )}
                  {r.status === 'posting' && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700 }}>
                      POSTING…
                    </span>
                  )}
                  {r.status === 'failed' && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,71,87,.15)', color: 'var(--red)', fontWeight: 700 }}>
                      FAILED — RETRY
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {r.customer && (
                    <button onClick={() => updateRow(r.id, { expanded: !r.expanded })}
                      disabled={locked}
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: locked ? 'not-allowed' : 'pointer', color: 'var(--text3)' }}>
                      {r.expanded ? 'Collapse' : 'Allocate'} ({r.openInvoices.filter(i => i.allocation > 0).length}/{r.openInvoices.length})
                    </button>
                  )}
                  <button onClick={() => removeRow(r.id)}
                    disabled={locked}
                    style={{ background: locked ? 'transparent' : 'rgba(255,71,87,.08)', border: `1px solid ${locked ? 'var(--border)' : 'rgba(255,71,87,.3)'}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: locked ? 'not-allowed' : 'pointer', color: locked ? 'var(--text3)' : 'var(--red)' }}
                    title={locked ? 'Posted rows cannot be removed (audit trail)' : 'Remove row'}>
                    Remove
                  </button>
                </div>
              </div>

              {/* Row body: customer + amount + method + ref */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, alignItems: 'start' }}>
                {/* Customer picker */}
                <div style={{ position: 'relative' }}>
                  <label className="form-label" style={{ fontSize: 10 }}>Customer</label>
                  {r.customer ? (
                    <div style={{
                      padding: '8px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--surface2)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.customer.company || r.customer.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{r.customer.customer_number} · Balance {tzs(r.customer.balance || 0)}</div>
                      </div>
                      {!locked && (
                        <button onClick={() => updateRow(r.id, { customer: null, openInvoices: [], amount: '' })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11 }}>
                          Change
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <input className="form-input"
                        placeholder="Click to pick a customer…"
                        value={openPickerRowId === r.id ? pickerSearch : ''}
                        onFocus={() => { setOpenPickerRowId(r.id); setPickerSearch('') }}
                        onChange={e => setPickerSearch(e.target.value)}
                        disabled={locked}
                      />
                      {openPickerRowId === r.id && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                          background: 'var(--surface)', border: '1px solid var(--accent)',
                          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                          maxHeight: 280, overflowY: 'auto',
                        }}>
                          <div style={{ padding: '6px 12px', background: 'var(--surface2)', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                            {filteredContacts.length} of {contacts.length}
                          </div>
                          {filteredContacts.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No match</div>
                          ) : filteredContacts.map(c => (
                            <div key={c.id}
                              onClick={() => pickCustomer(r.id, c)}
                              style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.company || c.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                                {c.customer_number} · Owes {tzs(c.balance || 0)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Amount (TZS)</label>
                  <input className="form-input" type="number" min="0"
                    placeholder="0"
                    style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}
                    value={r.amount}
                    onChange={e => setAmountAndAutoAllocate(r.id, e.target.value)}
                    disabled={locked || !r.customer}
                  />
                </div>

                {/* Method */}
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Method</label>
                  <select className="form-input" value={r.paymentMethod}
                    onChange={e => updateRow(r.id, { paymentMethod: e.target.value })}
                    disabled={locked}>
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                {/* Transaction reference */}
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Reference</label>
                  <input className="form-input"
                    placeholder={r.paymentMethod === 'cheque' ? 'Cheque #' : r.paymentMethod === 'rtgs' ? 'RTGS ref' : r.paymentMethod === 'mpesa' ? 'M-Pesa ref' : 'Optional'}
                    value={r.transactionId}
                    onChange={e => updateRow(r.id, { transactionId: e.target.value })}
                    disabled={locked}
                  />
                </div>
              </div>

              {/* Narration */}
              <div style={{ marginTop: 8 }}>
                <input className="form-input" placeholder="Narration (optional)"
                  style={{ fontSize: 12 }}
                  value={r.narration}
                  onChange={e => updateRow(r.id, { narration: e.target.value })}
                  disabled={locked}
                />
              </div>

              {/* Error banner */}
              {r.error && (
                <div style={{
                  marginTop: 10, padding: '8px 12px',
                  background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.3)',
                  borderRadius: 6, color: 'var(--red)', fontSize: 12,
                }}>
                  ⚠ {r.error}
                </div>
              )}

              {/* Allocation grid (expanded) */}
              {r.expanded && r.customer && !locked && (
                <div style={{
                  marginTop: 12, padding: 10,
                  background: 'var(--surface2)', borderRadius: 8,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Allocate Across Open Invoices (FIFO Pre-Filled)
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                      <span style={{ color: 'var(--text3)' }}>Allocated </span>
                      <span style={{ fontWeight: 700, color: overflow > 0.5 ? 'var(--red)' : 'var(--text)' }}>{tzs(allocated)}</span>
                      <span style={{ color: 'var(--text3)' }}> / {tzs(amt)}</span>
                      {credit > 0.5 && (
                        <span style={{ marginLeft: 8, padding: '1px 6px', background: 'var(--yellow-dim, rgba(255,211,42,.15))', color: 'var(--yellow, #f59e0b)', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                          {tzs(credit)} → credit on account
                        </span>
                      )}
                    </div>
                  </div>
                  {r.openInvoices.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', padding: 8 }}>
                      No open invoices — full amount will post as credit on account.
                    </div>
                  ) : (
                    <table style={{ width: '100%', fontSize: 11 }}>
                      <thead>
                        <tr style={{ color: 'var(--text3)', textAlign: 'left', fontSize: 10, textTransform: 'uppercase' }}>
                          <th style={{ padding: '4px 8px' }}>Invoice</th>
                          <th style={{ padding: '4px 8px' }}>Date</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>Outstanding</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>Allocate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.openInvoices.map(inv => (
                          <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{inv.document_ref}</td>
                            <td style={{ padding: '4px 8px', color: 'var(--text3)' }}>{inv.posting_date}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{inv.remaining_amount.toLocaleString()}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                              <input type="number" min="0" max={inv.remaining_amount}
                                value={inv.allocation || ''}
                                onChange={e => setInvoiceAllocation(r.id, inv.id, e.target.value)}
                                style={{
                                  width: 100, padding: '3px 6px', fontFamily: 'var(--mono)',
                                  textAlign: 'right', fontSize: 11,
                                  border: '1px solid var(--border)', borderRadius: 4,
                                  background: 'var(--surface)',
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
