import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface OriginalLine {
  productId: string
  name: string
  origQty: number
  creditQty: number
  unitPrice: number
  unitCost: number
  amount: number
  selected: boolean
}

interface OriginalVoucher {
  id: string
  ref: string
  type: string
  posting_date: string
  total_amount: number
  customer_id: string | null
  customer_name: string
  payment_method: string | null
  lines: OriginalLine[]
}

export default function CreditNote({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)

  // Form
  const [form, setForm] = useState({ date: today(), ref: '', originalRef: '', reason: '', notes: '', creditType: 'full' as 'full' | 'partial' | 'amount_only' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Original voucher lookup
  const [original, setOriginal] = useState<OriginalVoucher | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')

  // Manual amount (when no original ref or amount-only mode)
  const [manualAmount, setManualAmount] = useState('')
  const [manualCustomer, setManualCustomer] = useState('')
  const [custResults, setCustResults] = useState<{ id: string; name: string; balance: number }[]>([])
  const [selectedCust, setSelectedCust] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [showDrop, setShowDrop] = useState(false)

  // Existing credit notes against this invoice (duplicate check)
  const [existingCredits, setExistingCredits] = useState<{ ref: string; total_amount: number }[]>([])

  useEffect(() => { loadNextRef() }, [])

  const loadNextRef = async () => {
    const ref = await nextRef('credit_note')
    setForm(f => ({ ...f, ref }))
  }

  // ── LOOKUP ORIGINAL INVOICE / CASH SALE ──────────────────
  const lookupOriginal = async (ref: string) => {
    set('originalRef', ref)
    if (ref.length < 4) { setOriginal(null); setLookupError(''); setExistingCredits([]); return }

    setLookupLoading(true)
    setLookupError('')

    // Find the voucher
    const { data: voucher } = await supabase.from('vouchers')
      .select('id, ref, type, posting_date, total_amount, subtotal, customer_id, description, payment_method, notes')
      .eq('ref', ref.trim())
      .in('type', ['cash_sale', 'sales_invoice'])
      .single()

    if (!voucher) {
      setLookupLoading(false)
      setLookupError(`No cash sale or invoice found with ref "${ref}"`)
      setOriginal(null)
      return
    }

    // Get voucher lines
    const { data: vLines } = await supabase.from('voucher_lines')
      .select('product_id, description, qty, unit_price, unit_cost, subtotal, total')
      .eq('voucher_id', voucher.id)
      .order('line_number')

    // Get customer name
    let customerName = voucher.description?.replace(/^(Cash Sale|Sales Invoice)\s*[—–-]\s*/i, '') || ''
    if (voucher.customer_id) {
      const { data: cust } = await supabase.from('customers').select('name, balance').eq('id', voucher.customer_id).single()
      if (cust) {
        customerName = cust.name
        setSelectedCust({ id: voucher.customer_id, name: cust.name, balance: cust.balance || 0 })
      }
    }
    setManualCustomer(customerName)

    // Check existing credit notes against this ref
    const { data: existing } = await supabase.from('vouchers')
      .select('ref, total_amount')
      .eq('type', 'credit_note')
      .ilike('notes', `%${ref}%`)
    setExistingCredits(existing || [])

    const lines: OriginalLine[] = (vLines || []).map(l => ({
      productId: l.product_id || '',
      name: l.description || '',
      origQty: l.qty || 0,
      creditQty: l.qty || 0,
      unitPrice: l.unit_price || 0,
      unitCost: l.unit_cost || 0,
      amount: (l.qty || 0) * (l.unit_price || 0),
      selected: true,
    }))

    setOriginal({
      id: voucher.id,
      ref: voucher.ref,
      type: voucher.type,
      posting_date: voucher.posting_date,
      total_amount: voucher.total_amount || 0,
      customer_id: voucher.customer_id,
      customer_name: customerName,
      payment_method: voucher.payment_method,
      lines,
    })

    setForm(f => ({ ...f, creditType: 'full' }))
    setLookupLoading(false)
  }

  // ── CUSTOMER SEARCH (manual mode) ────────────────────────
  const searchCust = async (val: string) => {
    setManualCustomer(val)
    if (val.length < 2) { setCustResults([]); setShowDrop(false); return }
    const { data } = await supabase.from('customers').select('id, name, balance').or(`name.ilike.%${val}%`).limit(6)
    if (data && data.length > 0) { setCustResults(data); setShowDrop(true) }
    setSelectedCust(null)
  }

  // ── LINE EDITING ─────────────────────────────────────────
  const toggleLine = (i: number) => {
    if (!original) return
    const lines = [...original.lines]
    lines[i] = { ...lines[i], selected: !lines[i].selected }
    if (!lines[i].selected) lines[i] = { ...lines[i], creditQty: 0, amount: 0 }
    else lines[i] = { ...lines[i], creditQty: lines[i].origQty, amount: lines[i].origQty * lines[i].unitPrice }
    setOriginal({ ...original, lines })
  }

  const updateCreditQty = (i: number, qty: number) => {
    if (!original) return
    const lines = [...original.lines]
    const capped = Math.min(Math.max(0, qty), lines[i].origQty)
    lines[i] = { ...lines[i], creditQty: capped, amount: capped * lines[i].unitPrice, selected: capped > 0 }
    setOriginal({ ...original, lines })
  }

  // ── COMPUTED TOTALS ──────────────────────────────────────
  const selectedLines = original?.lines.filter(l => l.selected) || []
  const creditSubtotal = original
    ? selectedLines.reduce((s, l) => s + l.amount, 0)
    : parseFloat(manualAmount) || 0
  const creditCOGS = selectedLines.reduce((s, l) => s + l.unitCost * l.creditQty, 0)
  const hasInventory = selectedLines.some(l => l.productId && l.creditQty > 0)
  const alreadyCredited = existingCredits.reduce((s, c) => s + (c.total_amount || 0), 0)
  const maxCreditable = original ? original.total_amount - alreadyCredited : Infinity
  const overCredit = creditSubtotal > maxCreditable

  const customerName = original ? original.customer_name : manualCustomer
  const customerId = original?.customer_id || selectedCust?.id || null

  // ── POST ─────────────────────────────────────────────────
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!customerName.trim()) { showToast('Customer name required', 'error'); return }
    if (creditSubtotal <= 0) { showToast('Credit amount must be greater than zero', 'error'); return }
    if (!form.reason) { showToast('Select a reason', 'error'); return }
    if (overCredit) { showToast(`Cannot credit more than remaining ${tzs(maxCreditable)}. Already credited: ${tzs(alreadyCredited)}`, 'error'); return }

    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    setPosting(true)
    const amount = creditSubtotal
    const userName = user?.full_name || 'System'

    try {
      // Fetch required accounts
      const acctCodes = ['4010', '1050', '5010', '1110']
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', acctCodes)
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4010')
      const arId = acct('1050')
      const cogsId = acct('5010')
      const inventoryId = acct('1110')
      if (!revenueId || !arId) throw new Error('Revenue (4010) or AR (1050) account not found in Chart of Accounts')

      // ── CREATE JOURNAL ───────────────────
      const { data: j, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Credit Note — ${customerName} — ${form.ref}`,
        journal_type: 'credit_note', source_type: 'credit_note', source_ref: form.ref,
        posted_by: userName, status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error(jErr.message)

      // ── JOURNAL LINES ────────────────────
      const jLines: { journal_id: string; line_number: number; account_id: string; description: string; debit: number; credit: number }[] = []
      let ln = 1

      // Dr Revenue (4010) — sales reduction
      jLines.push({ journal_id: j.id, line_number: ln++, account_id: revenueId, description: `Revenue reduced — ${form.reason}`, debit: amount, credit: 0 })

      // Cr AR (1050) — customer owes less
      jLines.push({ journal_id: j.id, line_number: ln++, account_id: arId, description: `AR reduced — ${customerName} — ${form.ref}`, debit: 0, credit: amount })

      // If goods returned and we have inventory accounts: Dr Inventory / Cr COGS
      if (hasInventory && cogsId && inventoryId && (form.reason === 'Goods returned' || form.reason === 'Damaged goods received back')) {
        jLines.push({ journal_id: j.id, line_number: ln++, account_id: inventoryId, description: `Stock restored — ${form.ref}`, debit: creditCOGS, credit: 0 })
        jLines.push({ journal_id: j.id, line_number: ln++, account_id: cogsId, description: `COGS reversal — ${form.ref}`, debit: 0, credit: creditCOGS })
      }

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      // ── UPDATE ACCOUNT BALANCES ──────────
      await Promise.all(jLines.map(l =>
        supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })
      ))

      // ── CREATE VOUCHER ───────────────────
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'credit_note', posting_date: form.date,
        description: `Credit Note — ${customerName}`,
        total_amount: amount, status: 'posted', journal_id: j.id,
        customer_id: customerId,
        notes: [form.reason, original?.ref ? `Orig: ${original.ref}` : '', form.notes].filter(Boolean).join(' · '),
        posted_by: userName,
      }).select('id').single()
      if (vErr) throw new Error(vErr.message)

      // ── VOUCHER LINES ────────────────────
      if (selectedLines.length > 0 && voucher) {
        const vlInserts = selectedLines.map((l, i) => ({
          voucher_id: voucher.id, line_number: i + 1, product_id: l.productId || null,
          description: l.name, qty: l.creditQty, unit_cost: l.unitCost,
          unit_price: l.unitPrice, subtotal: l.amount, total: l.amount,
        }))
        await supabase.from('voucher_lines').insert(vlInserts)
      }

      // ── CUSTOMER LEDGER ENTRY ────────────
      if (customerId) {
        await supabase.from('customer_ledger_entries').insert({
          customer_id: customerId, posting_date: form.date,
          document_type: 'credit_note', document_ref: form.ref,
          description: `Credit Note — ${form.reason}`,
          amount: -amount, remaining_amount: -amount, is_open: true, journal_id: j.id,
        })
      }

      // ── RESTORE STOCK (if goods returned) ─
      if (hasInventory && (form.reason === 'Goods returned' || form.reason === 'Damaged goods received back')) {
        for (const line of selectedLines) {
          if (!line.productId || line.creditQty <= 0) continue
          // Get current stock
          const { data: prod } = await supabase.from('products').select('qty_on_hand').eq('id', line.productId).single()
          if (prod) {
            await supabase.from('products').update({ qty_on_hand: (prod.qty_on_hand || 0) + line.creditQty }).eq('id', line.productId)
            await supabase.from('item_ledger_entries').insert({
              product_id: line.productId, entry_type: 'return',
              document_type: 'credit_note', document_ref: form.ref,
              posting_date: form.date, qty: line.creditQty, cost_amount: line.unitCost * line.creditQty,
            })
          }
        }
      }

      const journalDesc = hasInventory && (form.reason === 'Goods returned' || form.reason === 'Damaged goods received back')
        ? `Dr Revenue (4010) / Cr AR (1050) + Dr Inventory / Cr COGS — Stock restored`
        : `Dr Revenue (4010) / Cr AR (1050)`

      showToast(`${form.ref} posted · ${journalDesc} · ${customerName} credited ${tzs(amount)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  const typeLabel = original?.type === 'cash_sale' ? 'Cash Sale' : original?.type === 'sales_invoice' ? 'Sales Invoice' : 'Sale'

  return (
    <VoucherPage title="Credit Note" icon="" subtitle="Credit customer — reduces outstanding balance or reverses sale" color="rgba(0,229,160,.12)"
      onPost={post} postLabel={posting ? 'Posting...' : 'Post Credit Note'}
      journalNote="Dr Revenue (4010) · Cr AR (1050) · Optionally restores inventory & reverses COGS">

      {/* ── HEADER CARD ──────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Credit Note Ref" req><input className="form-input" value={form.ref} readOnly /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>

        <FG label="Original Sale / Invoice Ref" req>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" value={form.originalRef} onChange={e => lookupOriginal(e.target.value)}
              placeholder="e.g. CS-10-0042 or SI-10-0015" style={{ flex: 1 }} />
            {lookupLoading && <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text3)', fontSize: 11 }}>Searching...</div>}
          </div>
        </FG>

        {lookupError && (
          <div style={{ padding: '10px 14px', background: '#ef444411', border: '1px solid #ef444433', borderRadius: 'var(--r)', fontSize: 12, color: '#ef4444', marginBottom: 10 }}>
            {lookupError}
            <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: 'var(--text3)' }}>You can still issue a manual credit note below.</span>
          </div>
        )}

        {/* Duplicate warning */}
        {existingCredits.length > 0 && (
          <div style={{ padding: '10px 14px', background: '#f59e0b11', border: '1px solid #f59e0b44', borderRadius: 'var(--r)', fontSize: 12, color: '#f59e0b', marginBottom: 10 }}>
            <strong>Warning:</strong> {existingCredits.length} existing credit note(s) found against {original?.ref}:
            {existingCredits.map((c, i) => <span key={i} style={{ fontFamily: 'var(--mono)', marginLeft: 8 }}>{c.ref} ({tzs(c.total_amount)})</span>)}
            <div style={{ fontSize: 11, marginTop: 4 }}>Remaining creditable: <strong>{tzs(maxCreditable)}</strong></div>
          </div>
        )}
      </div>

      {/* ── ORIGINAL SALE DETAILS (when found) ─ */}
      {original && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Original {typeLabel}: {original.ref}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                {original.customer_name} · {original.posting_date} · {original.payment_method || 'N/A'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(original.total_amount)}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>Original Total</div>
            </div>
          </div>

          {/* Credit Type Selector */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
            {([['full', 'Full Credit'], ['partial', 'Partial (edit qty)'], ['amount_only', 'Custom Amount']] as const).map(([val, label]) => (
              <button key={val} onClick={() => {
                setForm(f => ({ ...f, creditType: val }))
                if (val === 'full' && original) {
                  const lines = original.lines.map(l => ({ ...l, selected: true, creditQty: l.origQty, amount: l.origQty * l.unitPrice }))
                  setOriginal({ ...original, lines })
                }
              }} style={{ flex: 1, padding: '8px 12px', fontSize: 11, fontWeight: form.creditType === val ? 700 : 500, background: form.creditType === val ? 'var(--accent)' : 'var(--surface2)', color: form.creditType === val ? '#000' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRight: val !== 'amount_only' ? '1px solid var(--border)' : 'none' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Line Items Table */}
          {form.creditType !== 'amount_only' && original.lines.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 60px 60px 80px 90px', gap: 6, padding: '6px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid var(--border)' }}>
                <span></span><span>Product</span><span style={{ textAlign: 'center' }}>Orig</span><span style={{ textAlign: 'center' }}>Credit</span><span style={{ textAlign: 'right' }}>Unit Price</span><span style={{ textAlign: 'right' }}>Credit Amt</span>
              </div>
              {original.lines.map((line, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 60px 60px 80px 90px', gap: 6, padding: '8px 8px', alignItems: 'center', borderBottom: '1px solid var(--border)', opacity: line.selected ? 1 : 0.4, background: line.selected ? 'transparent' : 'var(--surface2)' }}>
                  <input type="checkbox" checked={line.selected} onChange={() => toggleLine(i)} style={{ accentColor: 'var(--accent)' }} disabled={form.creditType === 'full'} />
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{line.name}</div>
                  <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{line.origQty}</div>
                  <div style={{ textAlign: 'center' }}>
                    {form.creditType === 'partial' ? (
                      <input type="number" min={0} max={line.origQty} value={line.creditQty} onChange={e => updateCreditQty(i, parseInt(e.target.value) || 0)} style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '3px 4px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--mono)', textAlign: 'center' }} />
                    ) : (
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{line.creditQty}</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)' }}>{tzs(line.unitPrice)}</div>
                  <div style={{ textAlign: 'right', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: line.selected ? 'var(--accent)' : 'var(--text3)' }}>{tzs(line.amount)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Custom Amount Input */}
          {form.creditType === 'amount_only' && (
            <FG label="Credit Amount (TZS)" req>
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }}
                value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="0" />
            </FG>
          )}

          {/* Credit Total */}
          <div style={{ borderTop: '2px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15 }}>
            <span style={{ fontWeight: 700 }}>Credit Total</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, color: overCredit ? '#ef4444' : 'var(--accent)', fontSize: 18 }}>{tzs(creditSubtotal)}</span>
          </div>
          {overCredit && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Exceeds remaining creditable amount of {tzs(maxCreditable)}</div>
          )}
          {hasInventory && (form.reason === 'Goods returned' || form.reason === 'Damaged goods received back') && (
            <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 6 }}>
              Stock will be restored: {selectedLines.filter(l => l.productId).map(l => `${l.name} x${l.creditQty}`).join(', ')} · COGS reversal: {tzs(creditCOGS)}
            </div>
          )}
        </div>
      )}

      {/* ── MANUAL MODE (no original found) ──── */}
      {!original && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <FG label="Customer" req>
              <input className="form-input" placeholder="Type to search..." value={manualCustomer} onChange={e => searchCust(e.target.value)} />
            </FG>
            {showDrop && custResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r)', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden' }}>
                {custResults.map((c, i) => (
                  <div key={i} onClick={() => { setSelectedCust(c); setManualCustomer(c.name); setShowDrop(false) }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Balance: {tzs(c.balance || 0)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedCust && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text3)' }}>Outstanding AR balance</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{tzs(selectedCust.balance || 0)}</span>
            </div>
          )}
          <FG label="Credit Amount (TZS)" req>
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }}
              value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="0" />
          </FG>
        </div>
      )}

      {/* ── REASON & NOTES ───────────────────── */}
      <div className="card">
        <FG label="Reason" req>
          <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
            <option value="">— Select reason —</option>
            <option>Overbilling correction</option>
            <option>Discount granted after invoice</option>
            <option>Goods returned</option>
            <option>Damaged goods received back</option>
            <option>Goodwill credit</option>
            <option>Price adjustment</option>
            <option>Duplicate invoice correction</option>
            <option>Other</option>
          </select>
        </FG>
        {form.reason === 'Other' && (
          <FG label="Specify Reason" req>
            <input className="form-input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Describe the reason..." />
          </FG>
        )}
        {form.reason !== 'Other' && (
          <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
        )}

        {/* Inventory Restoration Indicator */}
        {hasInventory && (
          <div style={{ padding: '10px 14px', background: form.reason === 'Goods returned' || form.reason === 'Damaged goods received back' ? '#22c55e11' : '#f59e0b11', border: `1px solid ${form.reason === 'Goods returned' || form.reason === 'Damaged goods received back' ? '#22c55e33' : '#f59e0b44'}`, borderRadius: 'var(--r)', fontSize: 11, marginTop: 8 }}>
            {form.reason === 'Goods returned' || form.reason === 'Damaged goods received back' ? (
              <span style={{ color: '#22c55e' }}>Inventory will be restored and COGS reversed for returned items.</span>
            ) : (
              <span style={{ color: '#f59e0b' }}>Credit only (no stock change). Select "Goods returned" or "Damaged goods received back" to also restore inventory.</span>
            )}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
