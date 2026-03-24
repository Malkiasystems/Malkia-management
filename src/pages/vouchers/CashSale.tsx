import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface DBProduct { id: string; sku: string; name: string; cost_price: number; selling_price: number; qty_on_hand: number }
interface DBCustomer { id: string; name: string; whatsapp: string; crown_points: number; pregnancy_stage: string; last_purchase_date: string; last_purchase_amount: number; balance: number }
interface DBAccount { id: string; code: string; name: string }
interface PaymentLine { method: string; accountId: string; amount: string; ref: string }
interface SaleLine { productId: string; name: string; qty: number; price: number; amount: number }

const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Bank Transfer', 'POS Card']

export default function CashSale({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)

  // Settings
  const [autoReceipt, setAutoReceipt] = useState(true)
  const [allowedAccountCodes, setAllowedAccountCodes] = useState<string[]>([])

  // Customer
  const [waInput, setWaInput] = useState('')
  const [custSearch, setCustSearch] = useState('')
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [newCustName, setNewCustName] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Products
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([])
  const [lines, setLines] = useState<SaleLine[]>([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }])

  // Payment
  const [isPOD, setIsPOD] = useState(false)
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ method: 'Cash', accountId: '', amount: '', ref: '' }])
  const [bankAccounts, setBankAccounts] = useState<DBAccount[]>([])

  // Delivery
  const [townDelivery, setTownDelivery] = useState('')
  const [upcountryShipping, setUpcountryShipping] = useState('')
  const [deliveryAccountId, setDeliveryAccountId] = useState('')

  // Stats
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 })
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [refNum, setRefNum] = useState(1)

  useEffect(() => {
    loadProducts()
    loadBankAccounts()
    loadSettings()
    loadTodayStats()
    loadRecentSales()
    loadNextRef()
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleClickOutside = (e: MouseEvent) => {
    if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
  }

  const loadSettings = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) {
      setAllowedAccountCodes(data.map(a => a.code))
      const delivAcct = data.find(a => a.code === '2080')
      if (!delivAcct) {
        // Try to get 2080 from liabilities
        const { data: d2 } = await supabase.from('accounts').select('id').eq('code', '2080').single()
        if (d2) setDeliveryAccountId(d2.id)
      }
    }
    const { data: d2080 } = await supabase.from('accounts').select('id').eq('code', '2080').single()
    if (d2080) setDeliveryAccountId(d2080.id)
  }

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, cost_price, selling_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) setDbProducts(data)
  }

  const loadBankAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) setBankAccounts(data)
  }

  const loadTodayStats = async () => {
    const { data } = await supabase.from('vouchers').select('total_amount').eq('type', 'cash_sale').eq('posting_date', today())
    if (data) setTodayStats({ count: data.length, total: data.reduce((s, v) => s + (v.total_amount || 0), 0) })
  }

  const loadRecentSales = async () => {
    const { data } = await supabase.from('vouchers').select('ref, description, total_amount, payment_method, posting_date, status').eq('type', 'cash_sale').order('created_at', { ascending: false }).limit(8)
    if (data) setRecentSales(data)
  }

  const loadNextRef = async () => {
    const { count } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'cash_sale')
    setRefNum((count || 0) + 1)
  }

  // Customer search as you type
  const searchCustomer = async (val: string) => {
    setWaInput(val)
    const cleaned = val.replace(/[\s+\-()]/g, '')
    if (cleaned.length < 3) { setCustResults([]); setShowDropdown(false); return }
    const { data } = await supabase.from('customers').select('*').or(`whatsapp.ilike.%${cleaned}%,name.ilike.%${val}%`).limit(6)
    if (data && data.length > 0) { setCustResults(data); setShowDropdown(true) }
    else { setCustResults([]); setShowDropdown(false) }
    setSelectedCust(null)
  }

  const selectCustomer = (c: DBCustomer) => {
    setSelectedCust(c)
    setWaInput(c.whatsapp)
    setNewCustName(c.name)
    setShowDropdown(false)
    setCustResults([])
  }

  // Sale lines
  const updateLine = (i: number, field: keyof SaleLine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = dbProducts.find(p => p.id === val)
      if (p) { nl[i].name = p.name; nl[i].price = p.selling_price; nl[i].amount = nl[i].qty * p.selling_price }
    }
    if (field === 'qty' || field === 'price') nl[i].amount = nl[i].qty * (field === 'price' ? val as number : nl[i].price)
    setLines(nl)
  }

  // Payment lines
  const updatePayment = (i: number, field: keyof PaymentLine, val: string) => {
    const nl = [...paymentLines]; nl[i] = { ...nl[i], [field]: val }; setPaymentLines(nl)
  }

  const setExact = () => {
    const nl = [...paymentLines]
    nl[0] = { ...nl[0], amount: total.toString() }
    setPaymentLines(nl)
  }

  // Totals
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const vat = Math.round(subtotal * 18 / 118)
  const netRevenue = subtotal - vat
  const deliveryTotal = (parseFloat(townDelivery) || 0) + (parseFloat(upcountryShipping) || 0)
  const total = subtotal + deliveryTotal
  const totalPaid = paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const change = totalPaid - total
  const crownPoints = Math.round(subtotal / 1000)
  const margin = lines.reduce((s, l) => {
    const p = dbProducts.find(p => p.id === l.productId)
    return s + (p ? (l.price - p.cost_price) * l.qty : 0)
  }, 0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!newCustName.trim()) { showToast('❌ Customer name required', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('❌ Add at least one product', 'error'); return }
    if (!isPOD && paymentLines.some(l => !l.accountId)) { showToast('❌ Select account for each payment method', 'error'); return }
    if (!isPOD && totalPaid < subtotal) { showToast('❌ Payment is less than product total', 'error'); return }

    setPosting(true)
    const ref = genRef('CS', refNum)
    const postingDate = today()

    try {
      // Step 1: Upsert customer
      const cleaned = waInput.replace(/[\s+\-()]/g, '')
      let customerId = selectedCust?.id || null
      const custCode = 'CUST-' + (cleaned.slice(-6) || Math.random().toString(36).slice(-6).toUpperCase())
      const { data: custData } = await supabase.from('customers').upsert({
        code: custCode, name: newCustName.trim(), whatsapp: cleaned || null,
        customer_type: 'B2C',
        crown_points: (selectedCust?.crown_points || 0) + crownPoints,
        last_purchase_date: postingDate,
        last_purchase_amount: subtotal,
        balance: isPOD ? (selectedCust?.balance || 0) + total : (selectedCust?.balance || 0),
      }, { onConflict: 'whatsapp' }).select('id').single()
      if (custData) customerId = custData.id

      // Step 2: Get account IDs
      const neededCodes = ['4010', '5010', '1110', '2020']
      if (deliveryTotal > 0) neededCodes.push('2080')
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4010')
      const cogsId = acct('5010')
      const inventoryId = acct('1110')
      const vatId = acct('2020')
      const deliveryFloatId = acct('2080') || deliveryAccountId
      if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found. Check Chart of Accounts.')

      // Step 3: Create journal
      const { data: journal, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + ref, posting_date: postingDate,
        description: `Cash Sale — ${newCustName} — ${ref}`,
        journal_type: 'cash_sale', source_type: 'cash_sale', source_ref: ref,
        posted_by: 'Joe Gembe', status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error('Journal: ' + jErr.message)

      const cogsTotal = lines.reduce((s, l) => {
        const p = dbProducts.find(p => p.id === l.productId)
        return s + (p ? p.cost_price * l.qty : 0)
      }, 0)

      // Step 4: Build journal lines
      const jLines: any[] = []
      let lineNum = 1

      if (!isPOD && autoReceipt) {
        // Dr each payment account
        for (const pl of paymentLines) {
          if (!pl.accountId || !pl.amount) continue
          jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: pl.accountId, description: `${pl.method} receipt — ${newCustName}${pl.ref ? ' · Ref: ' + pl.ref : ''}`, debit: parseFloat(pl.amount), credit: 0 })
        }
      } else {
        // POD or no auto-receipt → Dr AR
        const { data: arAcct } = await supabase.from('accounts').select('id').eq('code', '1050').single()
        if (arAcct) jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: arAcct.id, description: `POD — ${newCustName} — ${ref}`, debit: subtotal, credit: 0 })
      }

      // Cr Revenue
      jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: revenueId, description: `Sales revenue — ${ref}`, debit: 0, credit: netRevenue })
      // Cr VAT
      if (vatId) jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: vatId, description: `VAT 18% — ${ref}`, debit: 0, credit: vat })
      // Dr COGS / Cr Inventory
      jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: cogsId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 })
      jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: inventoryId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal })
      // Delivery float
      if (deliveryTotal > 0 && deliveryFloatId) {
        jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: deliveryFloatId, description: `Delivery/Shipping Float — ${ref}`, debit: 0, credit: deliveryTotal })
        // Dr cash for delivery portion
        if (!isPOD && paymentLines[0]?.accountId) {
          jLines.push({ journal_id: journal.id, line_number: lineNum++, account_id: paymentLines[0].accountId, description: `Delivery fee collected — ${ref}`, debit: deliveryTotal, credit: 0 })
        }
      }

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Step 5: Update account balances
      const balanceUpdates = jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit }))
      await Promise.all(balanceUpdates)

      // Step 6: Create voucher
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref, type: 'cash_sale', posting_date: postingDate,
        description: `Cash Sale — ${newCustName}`,
        subtotal: netRevenue, vat_amount: vat, total_amount: total,
        status: isPOD ? 'draft' : 'posted',
        branch: 'DSM HQ', customer_id: customerId, journal_id: journal.id,
        payment_method: paymentLines.map(p => p.method).join('+'),
        notes: `${isPOD ? 'POD — ' : ''}${deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : ''}`,
        posted_by: 'Joe Gembe',
      }).select('id').single()
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      // Step 7: Voucher lines + stock deduction
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.productId) continue
        const prod = dbProducts.find(p => p.id === line.productId)
        if (!prod) continue
        await supabase.from('voucher_lines').insert({ voucher_id: voucher.id, line_number: i + 1, product_id: line.productId, description: line.name, qty: line.qty, unit_cost: prod.cost_price, unit_price: line.price, subtotal: line.amount, vat_amount: Math.round(line.amount * 18 / 118), total: line.amount })
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand - line.qty }).eq('id', line.productId)
        await supabase.from('item_ledger_entries').insert({ product_id: line.productId, entry_type: 'sale', document_type: 'cash_sale', document_ref: ref, posting_date: postingDate, qty: -line.qty, cost_amount: prod.cost_price * line.qty })
      }

      // Step 8: CRM — customer ledger entry if POD
      if (isPOD && customerId) {
        await supabase.from('customer_ledger_entries').insert({ customer_id: customerId, posting_date: postingDate, document_type: 'invoice', document_ref: ref, description: `POD — ${newCustName}`, amount: total, remaining_amount: total, is_open: true, journal_id: journal.id })
      }

      showToast(`✅ ${ref} posted · ${isPOD ? 'POD — receipt pending' : `Receipted · ${crownPoints} Crown pts`}`)
      setRefNum(n => n + 1)
      setWaInput(''); setNewCustName(''); setSelectedCust(null)
      setLines([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }])
      setPaymentLines([{ method: 'Cash', accountId: bankAccounts.find(a => a.code === '1010')?.id || '', amount: '', ref: '' }])
      setTownDelivery(''); setUpcountryShipping(''); setIsPOD(false)
      loadTodayStats(); loadRecentSales(); loadProducts()

    } catch (err: any) {
      showToast('❌ ' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const defaultCashAcct = bankAccounts.find(a => a.code === '1010')

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      {/* HEADER */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(212,135,74,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💵</div>
          <div>
            <div className="page-title">Cash Sale</div>
            <div className="page-sub">Counter POS · WhatsApp ID required · Auto-posts journal + Crown points · <span className="sync-dot"></span> Live</div>
          </div>
        </div>
        <div className="page-actions">
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 16px', fontFamily: 'var(--mono)', fontSize: 12 }}>
            Today: <span style={{ color: 'var(--green)', fontWeight: 700 }}>{tzs(todayStats.total)}</span> · <span style={{ color: 'var(--accent)' }}>{todayStats.count} sales</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 12 }}>
            <span style={{ color: 'var(--text3)' }}>Auto-receipt</span>
            <div onClick={() => setAutoReceipt(!autoReceipt)} style={{ width: 36, height: 20, background: autoReceipt ? 'var(--green)' : 'var(--surface3)', borderRadius: 10, cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
              <div style={{ position: 'absolute', top: 2, left: autoReceipt ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left .2s' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* SALE REF BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>SALE NO.</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{genRef('CS', refNum)}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', background: 'var(--surface3)', padding: '2px 8px', borderRadius: 4 }}>Auto-assigned · Read only</span>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{today()} · DSM HQ</div>
      </div>

      <div className="grid g2" style={{ gap: 20, marginBottom: 20 }}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* CUSTOMER */}
          <div className="card">
            <div className="step-header"><div className="step-num">1</div><div className="step-title">CUSTOMER IDENTITY</div></div>
            <div ref={searchRef} style={{ position: 'relative' }}>
              <FG label="WhatsApp Number" req>
                <div style={{ display: 'flex', gap: 0 }}>
                  <div style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: 'var(--r) 0 0 var(--r)', padding: '0 10px', display: 'flex', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', whiteSpace: 'nowrap' }}>+255</div>
                  <input className="form-input" style={{ borderRadius: '0 var(--r) var(--r) 0', borderColor: selectedCust ? 'var(--green)' : 'var(--border)' }}
                    placeholder="7XX XXX XXX · type to search"
                    value={waInput} onChange={e => searchCustomer(e.target.value)}
                    onFocus={() => custResults.length > 0 && setShowDropdown(true)} />
                </div>
              </FG>

              {/* Dropdown results */}
              {showDropdown && custResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r)', zIndex: 50, boxShadow: '0 8px 32px rgba(0,0,0,.4)', overflow: 'hidden' }}>
                  {custResults.map((c, i) => (
                    <div key={i} onClick={() => selectCustomer(c)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{c.whatsapp} · {c.pregnancy_stage || 'No stage set'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--yellow)', fontFamily: 'var(--mono)' }}>👑 {c.crown_points?.toLocaleString() || 0} pts</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>LFV: {tzs(c.balance || 0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Customer profile card */}
            {selectedCust && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: 12, marginTop: 8 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--green)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>✓ Existing Customer</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Name</div><div style={{ fontSize: 13, fontWeight: 600 }}>{selectedCust.name}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Stage</div><div style={{ fontSize: 12 }}>{selectedCust.pregnancy_stage || '—'}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Last Purchase</div><div style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{selectedCust.last_purchase_date ? `${selectedCust.last_purchase_date} · ${tzs(selectedCust.last_purchase_amount)}` : '—'}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Lifetime Value</div><div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(selectedCust.balance || 0)}</div></div>
                </div>
                <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Crown Points Balance</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--yellow)', fontFamily: 'var(--mono)' }}>👑 {(selectedCust.crown_points || 0).toLocaleString()} pts</span>
                </div>
              </div>
            )}

            {/* New customer name if not found */}
            {!selectedCust && (
              <FG label="Customer Name" req>
                <input className="form-input" placeholder="e.g. Fatuma Said" value={newCustName} onChange={e => setNewCustName(e.target.value)} />
              </FG>
            )}
          </div>

          {/* PAYMENT */}
          <div className="card">
            <div className="step-header"><div className="step-num">2</div><div className="step-title">PAYMENT</div></div>

            {/* POD Toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button onClick={() => setIsPOD(false)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: !isPOD ? 'var(--green-dim)' : 'transparent', border: `1px solid ${!isPOD ? 'var(--green)' : 'var(--border)'}`, color: !isPOD ? 'var(--green)' : 'var(--text3)' }}>💵 Paid at Counter</button>
              <button onClick={() => setIsPOD(true)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: isPOD ? 'var(--yellow-dim)' : 'transparent', border: `1px solid ${isPOD ? 'var(--yellow)' : 'var(--border)'}`, color: isPOD ? 'var(--yellow)' : 'var(--text3)' }}>🛵 Pay on Delivery (POD)</button>
            </div>

            {!isPOD && (
              <>
                {paymentLines.map((pl, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={pl.method} onChange={e => updatePayment(i, 'method', e.target.value)}>
                        {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                      </select>
                      <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={pl.accountId} onChange={e => updatePayment(i, 'accountId', e.target.value)}>
                        <option value="">— Account —</option>
                        {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
                      {paymentLines.length > 1 && <button onClick={() => setPaymentLines(paymentLines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>✕</button>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" className="form-input" style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15 }} placeholder="Amount (TZS)" value={pl.amount} onChange={e => updatePayment(i, 'amount', e.target.value)} />
                      {pl.method !== 'Cash' && <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="Ref / Transaction No" value={pl.ref} onChange={e => updatePayment(i, 'ref', e.target.value)} />}
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPaymentLines([...paymentLines, { method: 'M-Pesa', accountId: bankAccounts.find(a => a.code === '1020')?.id || '', amount: '', ref: '' }])}>+ Split Payment</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => updatePayment(0, 'amount', (subtotal + deliveryTotal).toString())}>⚡ Exact</button>
                  {[50000, 100000, 200000].map(amt => (
                    <button key={amt} className="btn btn-ghost btn-sm" onClick={() => updatePayment(0, 'amount', amt.toString())} style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{(amt/1000).toFixed(0)}K</button>
                  ))}
                </div>

                {totalPaid > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text3)', fontSize: 13 }}>Change</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(Math.max(0, change))}</span>
                  </div>
                )}
              </>
            )}

            {isPOD && (
              <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 12, fontSize: 12, color: 'var(--yellow)' }}>
                🛵 POD — Stock will be deducted and sale recorded. Payment receipt will be posted manually when boda returns with cash.
              </div>
            )}
          </div>

          {/* DELIVERY FEES */}
          <div className="card">
            <div className="step-header"><div className="step-num">3</div><div className="step-title">DELIVERY & SHIPPING FEES</div></div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
              ⚡ Posts to Delivery & Shipping Float (2080) — not product revenue
            </div>
            <div className="form-row">
              <FG label="Town Delivery (TZS)">
                <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0 — leave blank if none" value={townDelivery} onChange={e => setTownDelivery(e.target.value)} />
              </FG>
              <FG label="Upcountry Shipping (TZS)">
                <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0 — leave blank if none" value={upcountryShipping} onChange={e => setUpcountryShipping(e.target.value)} />
              </FG>
            </div>
            {deliveryTotal > 0 && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>Total Delivery/Shipping</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{tzs(deliveryTotal)}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — PRODUCTS + TOTALS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="step-header"><div className="step-num">4</div><div className="step-title">PRODUCTS SOLD</div></div>

            {lines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                    <option value="">— Select product —</option>
                    {dbProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name} · {tzs(p.selling_price)} · Stock: {p.qty_on_hand}</option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 56 }}>
                  <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 12 }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                </div>
                <div style={{ width: 110 }}>
                  <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 12 }} value={line.price} onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} />
                </div>
                {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', paddingBottom: 8 }}>✕</button>}
              </div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>QTY · PRICE (editable for custom amounts)</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, price: 0, amount: 0 }])}>+ Add item</button>

            {/* TOTALS */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: 'var(--text3)' }}>Products subtotal</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: 'var(--text3)' }}>VAT (18% incl.)</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{vat.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: 'var(--text3)' }}>Net revenue (excl. VAT)</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{netRevenue.toLocaleString()}</span>
              </div>
              {deliveryTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span style={{ color: 'var(--text3)' }}>Delivery/Shipping (→ 2080 Float)</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{deliveryTotal.toLocaleString()}</span>
                </div>
              )}
              {margin > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                  <span style={{ color: 'var(--text3)' }}>Gross margin</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 11 }}>{tzs(margin)} ({subtotal > 0 ? Math.round((margin / subtotal) * 100) : 0}%)</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, padding: '12px 0 0', borderTop: '1px solid var(--border2)', marginTop: 8 }}>
                <span>TOTAL</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(total)}</span>
              </div>
            </div>

            {/* INFO TAGS */}
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10, marginTop: 12, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {autoReceipt && !isPOD && <div style={{ color: 'var(--green)' }}>💬 WhatsApp receipt auto-sent · Journal auto-posted</div>}
              {isPOD && <div style={{ color: 'var(--yellow)' }}>🛵 POD — receipt will be posted manually after delivery</div>}
              <div style={{ color: 'var(--text3)' }}>📦 Inventory deducted · COGS posted to 5010</div>
              <div style={{ color: 'var(--yellow)' }}>👑 {crownPoints} Crown points will be awarded to customer</div>
              {deliveryTotal > 0 && <div style={{ color: 'var(--blue)' }}>🚚 {tzs(deliveryTotal)} → Delivery & Shipping Float (2080)</div>}
            </div>

            <button className="btn btn-primary" onClick={post} disabled={posting} style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '14px', fontSize: 14, fontWeight: 700, opacity: posting ? 0.6 : 1 }}>
              {posting ? '⏳ Posting…' : isPOD ? '🛵 Post POD Sale' : '📤 Post Sale & Send Receipt'}
            </button>
          </div>
        </div>
      </div>

      {/* RECENT SALES */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title">Recent Cash Sales</div>
            <div className="card-sub">Live from Supabase · <span className="sync-dot"></span></div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadRecentSales}>🔄 Refresh</button>
        </div>
        {recentSales.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>No sales posted yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ref</th><th>Description</th><th className="td-right">Amount (TZS)</th><th>Payment</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {recentSales.map((s, i) => (
                  <tr key={i}>
                    <td className="td-mono td-amber">{s.ref}</td>
                    <td>{s.description}</td>
                    <td className="td-right td-mono td-green">{s.total_amount?.toLocaleString()}</td>
                    <td><span className={`pill ${s.payment_method?.includes('Cash') ? 'pill-green' : s.payment_method?.includes('M-Pesa') ? 'pill-blue' : 'pill-amber'}`}>{s.payment_method}</span></td>
                    <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>{s.posting_date}</td>
                    <td><span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`}>{s.status === 'draft' ? 'POD Pending' : s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
