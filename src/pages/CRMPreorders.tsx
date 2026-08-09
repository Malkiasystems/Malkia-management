import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { tzs, today } from '../lib/utils'
import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { nextRef, insertJournalWithRetry } from '../lib/refs'
// Deposits are ACCOUNTING events, not CRM numbers. They post through the
// same shared receipt machinery CashReceipt uses (Dr cash tile / Cr AR),
// landing as customer credit that the fulfilment invoice consumes
// automatically ("SETTLED · covered by account credit" on the printout).
// These tables only record the promise; the ledger records the money.
import { getPostedBy } from '../components/CustomerPaymentFlow'

interface Props {
  onNav: (p: Page) => void // used for navigation actions
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    arrowUpRight: <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    bellRing: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    play: <><polygon points="5 3 19 12 5 21 5 3"/></>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    shoppingBag: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface Campaign {
  id: string
  name: string
  product: string
  image?: string
  target: number
  orders: number
  depositPercent: number
  minDeposit: number
  totalDeposits: number
  closeDate: string
  eta: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  customers: PreOrderCustomer[]
}

interface PreOrderCustomer {
  id: string
  customerId?: string
  receiptRef?: string
  name: string
  phone: string
  tier: 'mama' | 'gold' | 'crown'
  deposit: number
  paidAt: string
  reminderSent: boolean
}

export default function CRMPreorders({ onNav }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  void onNav // available for future navigation

  const { can, isSuperAdmin } = useAuth()
  const canDeposit = can('accounting.receipt') || isSuperAdmin()
  const canRefund = can('accounting.create') || isSuperAdmin()

  // Accounting anchors: AR (1050) + the cash/bank tiles a deposit can land in
  const [arAccountId, setArAccountId] = useState('')
  // 2086 Customer Deposits — Pre-Orders. THE liability account: deposits sit
  // here (money received before delivery = obligation to deliver), never as
  // negative AR. Its credit balance IS the customer-funded capital pool.
  const [depositLiabilityId, setDepositLiabilityId] = useState('')
  const [capitalHeld, setCapitalHeld] = useState(0)
  const [cashAccounts, setCashAccounts] = useState<{ id: string; code: string; name: string }[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; selling_price: number }[]>([])
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string; company: string | null; whatsapp: string | null }[]>([])
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 5000) }

  // Modals
  const [newCampOpen, setNewCampOpen] = useState(false)
  const [newCamp, setNewCamp] = useState({ name: '', productId: '', target: '', depositPercent: '30', minDeposit: '', closeDate: '', etaDate: '' })
  const [addCustFor, setAddCustFor] = useState<Campaign | null>(null)
  const [custSearch, setCustSearch] = useState('')
  const [depositFor, setDepositFor] = useState<{ camp: Campaign; cust: PreOrderCustomer } | null>(null)
  const [depositForm, setDepositForm] = useState({ amount: '', accountId: '', txnRef: '' })
  const [refundFor, setRefundFor] = useState<{ camp: Campaign; cust: PreOrderCustomer } | null>(null)
  const [refundForm, setRefundForm] = useState({ amount: '', accountId: '' })
  // Synchronous double-submit latch — same guard every money voucher carries
  // after the BNK-10-0009 triple-post.
  const postingRef = useRef(false)
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [{ data: ar }, { data: dep }, { data: cash }, { data: prods }] = await Promise.all([
        supabase.from('accounts').select('id').eq('code', '1050').single(),
        supabase.from('accounts').select('id, balance').eq('code', '2086').single(),
        supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
        supabase.from('products').select('id, name, selling_price').eq('is_active', true).order('name'),
      ])
      if (ar) setArAccountId(ar.id)
      if (dep) { setDepositLiabilityId(dep.id); setCapitalHeld(-(dep.balance || 0)) }
      setCashAccounts(cash || [])
      setProducts(prods || [])
    })()
  }, [])

  useEffect(() => {
    if (!custSearch.trim()) { setCustomerResults([]); return }
    const t = window.setTimeout(async () => {
      const { data } = await supabase.from('customers')
        .select('id, name, company, whatsapp')
        .or(`name.ilike.%${custSearch}%,company.ilike.%${custSearch}%,whatsapp.ilike.%${custSearch}%`)
        .limit(6)
      setCustomerResults(data || [])
    }, 250)
    return () => window.clearTimeout(t)
  }, [custSearch])

  const createCampaign = async () => {
    if (!newCamp.name.trim() || !newCamp.productId) { showToast('Name and product are required'); return }
    const { error } = await supabase.from('pre_order_campaigns').insert({
      name: newCamp.name.trim(), product_id: newCamp.productId,
      target: parseInt(newCamp.target) || 0,
      deposit_percent: parseFloat(newCamp.depositPercent) || 30,
      min_deposit: parseFloat(newCamp.minDeposit) || 0,
      close_date: newCamp.closeDate || null, eta_date: newCamp.etaDate || null,
      status: 'active', created_by: getPostedBy(),
    })
    if (error) { showToast('Create failed: ' + error.message); return }
    setNewCampOpen(false)
    setNewCamp({ name: '', productId: '', target: '', depositPercent: '30', minDeposit: '', closeDate: '', etaDate: '' })
    showToast('Campaign created')
    loadData()
  }

  const setCampaignStatus = async (camp: Campaign, status: string) => {
    const { error } = await supabase.from('pre_order_campaigns').update({ status }).eq('id', camp.id)
    if (error) { showToast(error.message); return }
    loadData()
  }

  const addCustomer = async (custId: string, whatsapp: string | null) => {
    if (!addCustFor) return
    const { error } = await supabase.from('pre_order_customers').insert({
      campaign_id: addCustFor.id, customer_id: custId, phone: whatsapp || '', tier: 'mama',
    })
    if (error) { showToast('Add failed: ' + error.message); return }
    await supabase.from('pre_order_campaigns')
      .update({ orders_received: (addCustFor.orders || 0) + 1 }).eq('id', addCustFor.id)
    setAddCustFor(null); setCustSearch('')
    showToast('Customer added to campaign')
    loadData()
  }

  // ── The accounting wiring ─────────────────────────────────────────────
  // Deposit: a REAL cash receipt. Dr chosen cash/bank tile, Cr AR — the
  // customer goes into credit, and the fulfilment invoice consumes that
  // credit automatically. Voucher + journal + customer ledger + rederived
  // balance, identical building blocks to the CashReceipt page.
  const postDeposit = async () => {
    if (postingRef.current) return
    postingRef.current = true
    setPosting(true)
    try {
      if (!depositFor || !arAccountId) throw new Error('Accounting accounts not loaded')
      const amount = parseFloat(depositForm.amount)
      if (!amount || amount <= 0) throw new Error('Enter a deposit amount')
      if (!depositForm.accountId) throw new Error('Select where the money landed')
      const custRow = depositFor.cust
      if (!custRow) throw new Error('No customer')
      const { data: custData } = await supabase.from('customers').select('id, name, company').eq('id', (custRow as any).customerId || '').single()
      if (!custData) throw new Error('Customer record not found — add them in Customers first')
      const custName = custData.company || custData.name
      const narration = `Pre-order deposit — ${depositFor.camp.name}`

      const freshRef = await nextRef('cash_receipt')
      const { data: journal, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + freshRef, posting_date: today(),
        description: `Customer Receipt — ${custName} — ${freshRef}`,
        journal_type: 'cash_receipt', source_type: 'cash_receipt',
        source_ref: freshRef, posted_by: getPostedBy(), status: 'posted',
      })
      if (jErr || !journal) throw new Error(jErr?.message || 'Journal insert failed')
      const finalRef = journal.source_ref

      // Dr cash tile / Cr 2086 — the deposit is a LIABILITY (we owe product),
      // not a reduction of what the customer owes. AR is untouched until the
      // fulfilment invoice exists; then Apply moves 2086 -> AR.
      if (!depositLiabilityId) throw new Error('Account 2086 not found — check Chart of Accounts')
      const lines = [
        { journal_id: journal.id, line_number: 1, account_id: depositForm.accountId, description: `Received from ${custName}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: depositLiabilityId, description: narration, debit: 0, credit: amount },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(lines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all(lines.map(l => supabase.rpc('update_account_balance', {
        p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit,
      })))

      const { error: vErr } = await supabase.from('vouchers').insert({
        ref: finalRef, type: 'cash_receipt', posting_date: today(),
        description: `Customer Receipt — ${custName}`,
        total_amount: amount, status: 'posted', journal_id: journal.id,
        payment_method: 'mpesa', payment_ref: depositForm.txnRef.trim() || null,
        notes: narration, posted_by: getPostedBy(), customer_id: custData.id,
      })
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      await supabase.from('pre_order_customers').update({
        deposit_amount: (custRow.deposit || 0) + amount,
        paid_at: new Date().toISOString(), receipt_ref: finalRef,
      }).eq('id', custRow.id)
      await supabase.from('pre_order_campaigns').update({
        total_deposits: (depositFor.camp.totalDeposits || 0) + amount,
      }).eq('id', depositFor.camp.id)

      showToast(`${finalRef} posted · TZS ${amount.toLocaleString()} deposit as credit on ${custName}'s account`)
      setDepositFor(null); setDepositForm({ amount: '', accountId: '', txnRef: '' })
      loadData()
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'))
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  // Apply at FULFILMENT: the liability converts into settlement of the
  // customer's invoice. Dr 2086 (obligation discharged) / Cr AR, with a
  // customer-ledger credit so the statement shows the deposit paying the
  // invoice, and the balance rederived from the ledger (anti-drift).
  const [applyFor, setApplyFor] = useState<{ camp: Campaign; cust: PreOrderCustomer } | null>(null)
  const [applyForm, setApplyForm] = useState({ amount: '', invoiceNote: '' })
  const postApplyDeposit = async () => {
    if (postingRef.current) return
    postingRef.current = true
    setPosting(true)
    try {
      if (!applyFor || !arAccountId || !depositLiabilityId) throw new Error('Accounting accounts not loaded')
      const amount = parseFloat(applyForm.amount)
      if (!amount || amount <= 0) throw new Error('Enter the amount to apply')
      if (amount > (applyFor.cust.deposit || 0) + 0.001) throw new Error('Exceeds the held deposit')
      const { data: custData } = await supabase.from('customers').select('id, name, company').eq('id', (applyFor.cust as any).customerId || '').single()
      if (!custData) throw new Error('Customer record not found')
      const custName = custData.company || custData.name
      const narration = `Pre-order deposit applied — ${applyFor.camp.name}${applyForm.invoiceNote ? ' · ' + applyForm.invoiceNote : ''}`

      const freshRef = await nextRef('journal_entry')
      const { data: journal, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + freshRef, posting_date: today(),
        description: `Journal — ${narration} — ${freshRef}`,
        journal_type: 'journal_entry', source_type: 'journal_entry',
        source_ref: freshRef, posted_by: getPostedBy(), status: 'posted',
      })
      if (jErr || !journal) throw new Error(jErr?.message || 'Journal insert failed')
      const finalRef = journal.source_ref

      const lines = [
        { journal_id: journal.id, line_number: 1, account_id: depositLiabilityId, description: narration, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: arAccountId, description: `Deposit applied — ${custName}`, debit: 0, credit: amount },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(lines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)
      await Promise.all(lines.map(l => supabase.rpc('update_account_balance', {
        p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit,
      })))

      const { error: clErr } = await supabase.from('customer_ledger_entries').insert({
        customer_id: custData.id, posting_date: today(), document_type: 'receipt',
        document_ref: finalRef, description: narration,
        amount: -amount, remaining_amount: 0, is_open: false, journal_id: journal.id,
      })
      if (clErr) throw new Error('Customer ledger: ' + clErr.message)
      const { data: sumRow } = await supabase.from('customer_ledger_entries').select('amount').eq('customer_id', custData.id)
      if (sumRow) {
        const totalBal = sumRow.reduce((t: number, r: any) => t + (r.amount || 0), 0)
        await supabase.from('customers').update({ balance: totalBal }).eq('id', custData.id)
      }

      await supabase.from('pre_order_customers').update({
        deposit_amount: Math.max(0, (applyFor.cust.deposit || 0) - amount), applied_ref: finalRef,
      }).eq('id', applyFor.cust.id)
      await supabase.from('pre_order_campaigns').update({
        total_deposits: Math.max(0, (applyFor.camp.totalDeposits || 0) - amount),
      }).eq('id', applyFor.camp.id)

      showToast(`${finalRef} posted · TZS ${amount.toLocaleString()} deposit applied to ${custName}'s account`)
      setApplyFor(null); setApplyForm({ amount: '', invoiceNote: '' })
      loadData()
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'))
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  // Refund: the exact reverse — Dr AR / Cr cash tile, ledger debit entry,
  // balance rederived from the ledger (same anti-drift rule the receipt
  // poster uses), cash_payment voucher for the register.
  const postRefund = async () => {
    if (postingRef.current) return
    postingRef.current = true
    setPosting(true)
    try {
      if (!refundFor || !arAccountId) throw new Error('Accounting accounts not loaded')
      const amount = parseFloat(refundForm.amount)
      if (!amount || amount <= 0) throw new Error('Enter the refund amount')
      if (amount > (refundFor.cust.deposit || 0) + 0.001) throw new Error('Refund exceeds the recorded deposit')
      if (!refundForm.accountId) throw new Error('Select which account pays the refund')
      const { data: custData } = await supabase.from('customers').select('id, name, company').eq('id', (refundFor.cust as any).customerId || '').single()
      if (!custData) throw new Error('Customer record not found')
      const custName = custData.company || custData.name
      const narration = `Pre-order deposit refund — ${refundFor.camp.name}`

      const freshRef = await nextRef('cash_payment')
      const { data: journal, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + freshRef, posting_date: today(),
        description: `Cash Payment — ${custName} — ${freshRef}`,
        journal_type: 'cash_payment', source_type: 'cash_payment',
        source_ref: freshRef, posted_by: getPostedBy(), status: 'posted',
      })
      if (jErr || !journal) throw new Error(jErr?.message || 'Journal insert failed')
      const finalRef = journal.source_ref

      if (!depositLiabilityId) throw new Error('Account 2086 not found')
      const lines = [
        { journal_id: journal.id, line_number: 1, account_id: depositLiabilityId, description: narration, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: refundForm.accountId, description: `Refund to ${custName}`, debit: 0, credit: amount },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(lines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)
      await Promise.all(lines.map(l => supabase.rpc('update_account_balance', {
        p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit,
      })))

      const { error: vErr } = await supabase.from('vouchers').insert({
        ref: finalRef, type: 'cash_payment', posting_date: today(),
        description: `Cash Payment — ${custName}`, total_amount: amount,
        status: 'posted', journal_id: journal.id, notes: narration,
        posted_by: getPostedBy(), customer_id: custData.id,
      })
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      await supabase.from('pre_order_customers').update({
        deposit_amount: Math.max(0, (refundFor.cust.deposit || 0) - amount), refund_ref: finalRef,
      }).eq('id', refundFor.cust.id)
      await supabase.from('pre_order_campaigns').update({
        total_deposits: Math.max(0, (refundFor.camp.totalDeposits || 0) - amount),
      }).eq('id', refundFor.camp.id)

      showToast(`${finalRef} posted · TZS ${amount.toLocaleString()} refunded to ${custName}`)
      setRefundFor(null); setRefundForm({ amount: '', accountId: '' })
      loadData()
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'))
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load pre-order campaigns from database
      const { data: preorderData, error } = await supabase
        .from('pre_order_campaigns')
        .select(`
          id, name, product_id, target, orders_received, 
          deposit_percent, min_deposit, total_deposits,
          close_date, eta_date, status, created_at,
          products (name),
          pre_order_customers (
            id, customer_id, phone, tier, deposit_amount, 
            paid_at, reminder_sent, receipt_ref, refund_ref,
            customers (name)
          )
        `)
        .order('status', { ascending: false })
        .order('close_date', { ascending: true })

      if (error) throw error

      // Transform database records to Campaign format
      const campaigns: Campaign[] = (preorderData || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        product: row.products?.name || 'Product',
        target: row.target || 0,
        orders: row.orders_received || 0,
        depositPercent: row.deposit_percent || 30,
        minDeposit: row.min_deposit || 0,
        totalDeposits: row.total_deposits || 0,
        closeDate: row.close_date ? new Date(row.close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
        eta: row.eta_date ? new Date(row.eta_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
        status: row.status || 'active',
        customers: (row.pre_order_customers || []).map((cust: any) => ({
          id: cust.id,
          customerId: cust.customer_id,
          receiptRef: cust.receipt_ref || '',
          name: cust.customers?.name || cust.customer_id,
          phone: cust.phone || '',
          tier: cust.tier || 'mama',
          deposit: cust.deposit_amount || 0,
          paidAt: cust.paid_at ? new Date(cust.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Pending',
          reminderSent: cust.reminder_sent || false,
        }))
      }))

      setCampaigns(campaigns)
      if (campaigns.length > 0) {
        setSelectedCampaign(campaigns[0])
      }
    } catch (err) {
      console.error('Failed to load pre-order campaigns:', err)
      // If no data in database, show empty state (not demo data)
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10b981'
      case 'paused': return '#f59e0b'
      case 'completed': return '#3b82f6'
      case 'cancelled': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return 'activity'
      case 'paused': return 'pause'
      case 'completed': return 'checkCircle'
      case 'cancelled': return 'xCircle'
      default: return 'clock'
    }
  }

  const totalDeposits = campaigns.reduce((sum, c) => sum + c.totalDeposits, 0)
  const totalOrders = campaigns.reduce((sum, c) => sum + c.orders, 0)
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length

  const s = {
    page: { padding: 24, maxWidth: 1600, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 } as React.CSSProperties,
    headerLeft: {} as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    headerRight: { display: 'flex', gap: 10 } as React.CSSProperties,
    btnPrimary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
    btnGhost: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,

    // Stats
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 } as React.CSSProperties,
    statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, textAlign: 'center' as const } as React.CSSProperties,
    statValue: (color: string) => ({ fontSize: 26, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    statLabel: { fontSize: 11, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,

    // Main layout
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 400px', gap: 16 } as React.CSSProperties,

    // Campaign cards
    campaignGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 } as React.CSSProperties,
    campaignCard: (isSelected: boolean, status: string) => ({ 
      background: 'var(--card)', 
      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)', 
      borderRadius: 12, 
      padding: 16, 
      cursor: 'pointer',
      opacity: status === 'cancelled' ? 0.5 : 1,
      transition: 'all .15s'
    }) as React.CSSProperties,
    campaignHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 } as React.CSSProperties,
    campaignName: { fontWeight: 700, fontSize: 14, marginBottom: 4 } as React.CSSProperties,
    campaignProduct: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    statusBadge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '4px 10px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,
    progressWrap: { marginBottom: 12 } as React.CSSProperties,
    progressLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 } as React.CSSProperties,
    progressBar: { height: 8, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden' } as React.CSSProperties,
    progressFill: (percent: number, color: string) => ({ height: '100%', width: `${Math.min(percent, 100)}%`, background: color, borderRadius: 4, transition: 'width .3s' }) as React.CSSProperties,
    campaignMeta: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 11 } as React.CSSProperties,
    metaItem: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text3)' } as React.CSSProperties,

    // Customer list
    customerPanel: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    panelHeader: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    panelTitle: { fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    customerList: { maxHeight: 400, overflowY: 'auto' as const } as React.CSSProperties,
    customerItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    customerAvatar: (color: string) => ({ width: 36, height: 36, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    customerInfo: { flex: 1, minWidth: 0 } as React.CSSProperties,
    customerName: { fontWeight: 600, fontSize: 12, marginBottom: 2 } as React.CSSProperties,
    customerPhone: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    customerDeposit: { textAlign: 'right' as const } as React.CSSProperties,
    depositAmount: { fontWeight: 700, fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    depositDate: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    tierBadge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '2px 8px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,

    // Actions
    actionBar: { padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 } as React.CSSProperties,
    actionBtn: { flex: 1, padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
    actionBtnPrimary: { flex: 1, padding: '10px', background: '#25d366', border: 'none', borderRadius: 8, fontSize: 11, color: '#000', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="package" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Pre-Orders...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="package" size={28} color="#3b82f6" />
            Pre-Order Campaigns
          </h1>
          <p style={s.subtitle}>Manage deposits, waitlists, and restock campaigns</p>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnGhost}>
            <Icon name="download" size={16} /> Export
          </button>
          <button style={s.btnPrimary} onClick={() => setNewCampOpen(true)}>
            <Icon name="plus" size={16} /> New Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue('#3b82f6')}>{activeCampaigns}</div>
          <div style={s.statLabel}>Active Campaigns</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('var(--accent)')}>{totalOrders}</div>
          <div style={s.statLabel}>Total Pre-Orders</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#25d366')}>{tzs(totalDeposits)}</div>
          <div style={s.statLabel}>Deposits Collected</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#f59e0b')}>{tzs(capitalHeld)}</div>
          <div style={s.statLabel}>Customer Capital Held (2086)</div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Campaign Grid */}
        <div style={s.campaignGrid}>
          {campaigns.map(campaign => {
            const progress = (campaign.orders / campaign.target) * 100
            const isSelected = selectedCampaign?.id === campaign.id
            
            return (
              <div 
                key={campaign.id}
                style={s.campaignCard(isSelected, campaign.status)}
                onClick={() => setSelectedCampaign(campaign)}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--text3)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={s.campaignHeader}>
                  <div>
                    <div style={s.campaignName}>{campaign.name}</div>
                    <div style={s.campaignProduct}>{campaign.product}</div>
                  </div>
                  <span style={s.statusBadge(getStatusColor(campaign.status))}>
                    <Icon name={getStatusIcon(campaign.status)} size={10} />
                    {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                  </span>
                </div>

                <div style={s.progressWrap}>
                  <div style={s.progressLabel}>
                    <span>Orders / Target</span>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{campaign.orders} / {campaign.target}</span>
                  </div>
                  <div style={s.progressBar}>
                    <div style={s.progressFill(progress, progress >= 100 ? '#10b981' : '#3b82f6')} />
                  </div>
                </div>

                <div style={s.campaignMeta}>
                  <div style={s.metaItem}>
                    <Icon name="dollarSign" size={12} />
                    {tzs(campaign.totalDeposits)}
                  </div>
                  <div style={s.metaItem}>
                    <Icon name="calendar" size={12} />
                    Closes {campaign.closeDate}
                  </div>
                  <div style={s.metaItem}>
                    <Icon name="truck" size={12} />
                    ETA {campaign.eta}
                  </div>
                  <div style={s.metaItem}>
                    <Icon name="target" size={12} />
                    {campaign.depositPercent}% deposit
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add new campaign card */}
          <div 
            style={{ ...s.campaignCard(false, 'active'), border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}
          >
            <Icon name="plus" size={32} color="var(--text3)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>Create Campaign</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Set product, target, and deposit</div>
          </div>
        </div>

        {/* Customer Panel */}
        {selectedCampaign && (
          <div style={s.customerPanel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>
                <Icon name="users" size={18} color="var(--accent)" />
                Pre-Order Customers ({selectedCampaign.customers.length})
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setAddCustFor(selectedCampaign)}>
                  <Icon name="plus" size={12} /> Add customer
                </button>
                {selectedCampaign.status === 'active' && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setCampaignStatus(selectedCampaign, 'paused')} title="Pause campaign">
                    <Icon name="pause" size={12} />
                  </button>
                )}
                {selectedCampaign.status === 'paused' && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setCampaignStatus(selectedCampaign, 'active')} title="Resume campaign">
                    <Icon name="play" size={12} />
                  </button>
                )}
              </div>
            </div>

            {selectedCampaign.customers.length > 0 ? (
              <div style={s.customerList}>
                {selectedCampaign.customers.map(customer => (
                  <div key={customer.id} style={s.customerItem}>
                    <div style={s.customerAvatar(getTierColor(customer.tier))}>
                      <Icon name="user" size={18} color={getTierColor(customer.tier)} />
                    </div>
                    <div style={s.customerInfo}>
                      <div style={s.customerName}>{customer.name}</div>
                      <div style={s.customerPhone}>{customer.phone}</div>
                      <span style={s.tierBadge(getTierColor(customer.tier))}>
                        <Icon name={customer.tier === 'crown' ? 'crown' : customer.tier === 'gold' ? 'award' : 'heart'} size={8} />
                        {customer.tier.charAt(0).toUpperCase() + customer.tier.slice(1)}
                      </span>
                    </div>
                    <div style={s.customerDeposit}>
                      <div style={s.depositAmount}>{tzs(customer.deposit)}</div>
                      <div style={s.depositDate}>Paid {customer.paidAt}</div>
                      {customer.reminderSent && (
                        <span style={{ fontSize: 9, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                          <Icon name="bellRing" size={10} /> Reminded
                        </span>
                      )}
                      {customer.receiptRef && (
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{customer.receiptRef}</div>
                      )}
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 6 }}>
                        {canDeposit && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                            title="Record a deposit — posts a real cash receipt (customer goes into credit)"
                            onClick={() => { setDepositFor({ camp: selectedCampaign, cust: customer }); setDepositForm({ amount: selectedCampaign.minDeposit ? String(selectedCampaign.minDeposit) : '', accountId: '', txnRef: '' }) }}>
                            + Deposit
                          </button>
                        )}
                        {canDeposit && customer.deposit > 0 && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--accent)' }}
                            title="Stock arrived and invoiced? Apply the held deposit against their account"
                            onClick={() => { setApplyFor({ camp: selectedCampaign, cust: customer }); setApplyForm({ amount: String(customer.deposit), invoiceNote: '' }) }}>
                            Apply
                          </button>
                        )}
                        {canRefund && customer.deposit > 0 && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--red)' }}
                            title="Refund the deposit — posts a real cash payment"
                            onClick={() => { setRefundFor({ camp: selectedCampaign, cust: customer }); setRefundForm({ amount: String(customer.deposit), accountId: '' }) }}>
                            Refund
                          </button>
                        )}
                        {customer.phone && (
                          <a className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px', textDecoration: 'none' }}
                            href={`https://wa.me/${customer.phone.replace(/[^0-9]/g, '').replace(/^0/, '255')}`} target="_blank" rel="noreferrer"
                            onClick={() => supabase.from('pre_order_customers').update({ reminder_sent: true }).eq('id', customer.id).then(() => loadData())}>
                            WhatsApp
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                <Icon name="users" size={32} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 12 }}>No customers yet</div>
              </div>
            )}

            {/* Summary */}
            <div style={{ padding: 16, background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Total Deposits</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{tzs(selectedCampaign.totalDeposits)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Remaining Balance</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                  {tzs(selectedCampaign.orders * (selectedCampaign.minDeposit / (selectedCampaign.depositPercent / 100)) - selectedCampaign.totalDeposits)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Close Date</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{selectedCampaign.closeDate}</span>
              </div>
            </div>

            <div style={s.actionBar}>
              <button style={s.actionBtn}>
                <Icon name="edit" size={14} /> Edit
              </button>
              <button style={s.actionBtnPrimary}>
                <Icon name="bellRing" size={14} /> Send Reminders
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {newCampOpen && (
        <Modal title="New Pre-Order Campaign" onClose={() => setNewCampOpen(false)}>
          <input className="form-input" placeholder="Campaign name (e.g. bbhugme Sept batch)" value={newCamp.name} onChange={e => setNewCamp({ ...newCamp, name: e.target.value })} />
          <select className="form-input" value={newCamp.productId} onChange={e => setNewCamp({ ...newCamp, productId: e.target.value })}>
            <option value="">— Product —</option>
            {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="number" className="form-input" placeholder="Target qty" value={newCamp.target} onChange={e => setNewCamp({ ...newCamp, target: e.target.value })} />
            <input type="number" className="form-input" placeholder="Deposit %" value={newCamp.depositPercent} onChange={e => setNewCamp({ ...newCamp, depositPercent: e.target.value })} />
            <input type="number" className="form-input" placeholder="Min deposit (TZS)" value={newCamp.minDeposit} onChange={e => setNewCamp({ ...newCamp, minDeposit: e.target.value })} />
            <input type="date" className="form-input" title="Close date" value={newCamp.closeDate} onChange={e => setNewCamp({ ...newCamp, closeDate: e.target.value })} />
            <input type="date" className="form-input" title="ETA date" value={newCamp.etaDate} onChange={e => setNewCamp({ ...newCamp, etaDate: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={createCampaign}>Create campaign</button>
        </Modal>
      )}

      {addCustFor && (
        <Modal title={`Add customer — ${addCustFor.name}`} onClose={() => { setAddCustFor(null); setCustSearch('') }}>
          <input className="form-input" autoFocus placeholder="Search customers (name / company / WhatsApp)" value={custSearch} onChange={e => setCustSearch(e.target.value)} />
          <div>
            {customerResults.map(c => (
              <div key={c.id} onClick={() => addCustomer(c.id, c.whatsapp)}
                style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <strong>{c.company || c.name}</strong>
                <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 8 }}>{c.whatsapp || ''}</span>
              </div>
            ))}
            {custSearch.trim() && customerResults.length === 0 && (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--text3)' }}>No match — add them in Customers first, then return here.</div>
            )}
          </div>
        </Modal>
      )}

      {depositFor && (
        <Modal title={`Deposit — ${depositFor.cust.name}`} onClose={() => setDepositFor(null)}>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
            Posts a real cash receipt: the money lands in the account you pick and is HELD in 2086 Customer Deposits — a liability, because until delivery this is their money and our obligation. At fulfilment, use Apply to settle their invoice from it.
          </div>
          <input type="number" className="form-input" placeholder="Amount (TZS)" value={depositForm.amount} onChange={e => setDepositForm({ ...depositForm, amount: e.target.value })} />
          <select className="form-input" value={depositForm.accountId} onChange={e => setDepositForm({ ...depositForm, accountId: e.target.value })}>
            <option value="">— Where did the money land? —</option>
            {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
          <input className="form-input" placeholder="M-Pesa / bank transaction ID (optional)" value={depositForm.txnRef} onChange={e => setDepositForm({ ...depositForm, txnRef: e.target.value })} />
          <button className="btn btn-primary" disabled={posting} onClick={postDeposit}>{posting ? 'Posting…' : 'Post deposit receipt'}</button>
        </Modal>
      )}

      {applyFor && (
        <Modal title={`Apply deposit — ${applyFor.cust.name}`} onClose={() => setApplyFor(null)}>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
            Use at fulfilment, AFTER their invoice is posted: moves the held deposit out of Customer Deposits (2086) and settles their account. Their statement will show the deposit paying the invoice.
          </div>
          <input type="number" className="form-input" placeholder="Amount to apply (TZS)" value={applyForm.amount} onChange={e => setApplyForm({ ...applyForm, amount: e.target.value })} />
          <input className="form-input" placeholder="Invoice ref (optional, e.g. SI-10-0203)" value={applyForm.invoiceNote} onChange={e => setApplyForm({ ...applyForm, invoiceNote: e.target.value })} />
          <button className="btn btn-primary" disabled={posting} onClick={postApplyDeposit}>{posting ? 'Posting…' : 'Apply deposit'}</button>
        </Modal>
      )}

      {refundFor && (
        <Modal title={`Refund deposit — ${refundFor.cust.name}`} onClose={() => setRefundFor(null)}>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
            Posts a real cash payment reversing the deposit: their account credit is cleared and the money leaves the account you pick.
          </div>
          <input type="number" className="form-input" placeholder="Amount (TZS)" value={refundForm.amount} onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })} />
          <select className="form-input" value={refundForm.accountId} onChange={e => setRefundForm({ ...refundForm, accountId: e.target.value })}>
            <option value="">— Pay refund from —</option>
            {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={posting} onClick={postRefund}>{posting ? 'Posting…' : 'Post refund'}</button>
        </Modal>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', fontSize: 12, maxWidth: 420, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// Minimal modal, styled with the app's tokens
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: 420, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
