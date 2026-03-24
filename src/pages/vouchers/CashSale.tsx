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

export default function CashSale({ onNav: _onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [autoReceipt] = useState(true)

  // Customer
  const [waInput, setWaInput] = useState('')
  const [newCustName, setNewCustName] = useState('')
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Products
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([])
  const [lines, setLines] = useState<SaleLine[]>([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }])

  // Delivery
  const [showDelivery, setShowDelivery] = useState(false)
  const [townDelivery, setTownDelivery] = useState('')
  const [upcountryShipping, setUpcountryShipping] = useState('')
  const [deliveryAccountId, setDeliveryAccountId] = useState('')

  // Payment
  const [isPOD, setIsPOD] = useState(false)
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ method: 'Cash', accountId: '', amount: '', ref: '' }])
  const [bankAccounts, setBankAccounts] = useState<DBAccount[]>([])

  // Dashboard stats
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0, avgSale: 0, crownPts: 0 })
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [paymentSplit, setPaymentSplit] = useState<Record<string, number>>({})
  const [refNum, setRefNum] = useState(1)

  useEffect(() => {
    loadProducts(); loadBankAccounts(); loadDeliveryAccount()
    loadTodayStats(); loadRecentSales(); loadNextRef()
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleClickOutside = (e: MouseEvent) => {
    if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
  }

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, cost_price, selling_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) setDbProducts(data)
  }

  const loadBankAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) {
      setBankAccounts(data)
      const cashAcct = data.find(a => a.code === '1010')
      if (cashAcct) setPaymentLines([{ method: 'Cash', accountId: cashAcct.id, amount: '', ref: '' }])
    }
  }

  const loadDeliveryAccount = async () => {
    const { data } = await supabase.from('accounts').select('id').eq('code', '2085').single()
    if (data) setDeliveryAccountId(data.id)
  }

  const loadTodayStats = async () => {
    const { data } = await supabase.from('vouchers').select('total_amount, payment_method').eq('type', 'cash_sale').eq('posting_date', today())
    if (data && data.length > 0) {
      const total = data.reduce((s, v) => s + (v.total_amount || 0), 0)
      const split: Record<string, number> = {}
      data.forEach(v => { const m = v.payment_method || 'Cash'; split[m] = (split[m] || 0) + (v.total_amount || 0) })
      setTodayStats({ count: data.length, total, avgSale: Math.round(total / data.length), crownPts: Math.round(total / 1000) })
      setPaymentSplit(split)
    }
  }

  const loadRecentSales = async () => {
    const { data } = await supabase.from('vouchers').select('ref, description, total_amount, payment_method, posting_date, status, customers(name, whatsapp)').eq('type', 'cash_sale').order('created_at', { ascending: false }).limit(10)
    if (data) setRecentSales(data)
  }

  const loadNextRef = async () => {
    const { count } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'cash_sale')
    setRefNum((count || 0) + 1)
  }

  const searchCustomer = async (val: string) => {
    setWaInput(val)
    const cleaned = val.replace(/[\s+\-()]/g, '')
    if (cleaned.length < 3) { setCustResults([]); setShowDropdown(false); setSelectedCust(null); return }
    const { data } = await supabase.from('customers').select('*').or(`whatsapp.ilike.%${cleaned}%,name.ilike.%${val}%`).limit(6)
    if (data && data.length > 0) { setCustResults(data); setShowDropdown(true) }
    else { setCustResults([]); setShowDropdown(false) }
    setSelectedCust(null)
  }

  const selectCustomer = (c: DBCustomer) => {
    setSelectedCust(c); setWaInput(c.whatsapp); setNewCustName(c.name)
    setShowDropdown(false); setCustResults([])
  }

  const updateLine = (i: number, field: keyof SaleLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = dbProducts.find(p => p.id === val)
      if (p) { nl[i].name = p.name; nl[i].price = p.selling_price; nl[i].amount = nl[i].qty * p.selling_price }
    }
    if (field === 'qty') nl[i].amount = (val as number) * nl[i].price
    if (field === 'price') nl[i].amount = nl[i].qty * (val as number)
    setLines(nl)
  }

  const updatePayment = (i: number, field: keyof PaymentLine, val: string) => {
    const nl = [...paymentLines]; nl[i] = { ...nl[i], [field]: val }; setPaymentLines(nl)
  }

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

  const resetForm = () => {
    setWaInput(''); setNewCustName(''); setSelectedCust(null)
    setLines([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }])
    setPaymentLines([{ method: 'Cash', accountId: bankAccounts.find(a => a.code === '1010')?.id || '', amount: '', ref: '' }])
    setTownDelivery(''); setUpcountryShipping(''); setIsPOD(false); setShowDelivery(false)
  }

  const openNewSale = () => { resetForm(); setShowModal(true) }

  const post = async () => {
    if (!newCustName.trim()) { showToast('❌ Customer name required', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('❌ Add at least one product', 'error'); return }
    if (!isPOD && paymentLines.some(l => !l.accountId)) { showToast('❌ Select account for each payment', 'error'); return }
    if (!isPOD && totalPaid < subtotal) { showToast('❌ Payment less than product total', 'error'); return }
    setPosting(true)
    const ref = genRef('CS', refNum)
    const postingDate = today()

    try {
      // Upsert customer
      const cleaned = waInput.replace(/[\s+\-()]/g, '')
      let customerId = selectedCust?.id || null
      const custCode = 'CUST-' + (cleaned.slice(-6) || Date.now().toString().slice(-6))
      const { data: custData } = await supabase.from('customers').upsert({
        code: custCode, name: newCustName.trim(), whatsapp: cleaned || null, customer_type: 'B2C',
        crown_points: (selectedCust?.crown_points || 0) + crownPoints,
        last_purchase_date: postingDate, last_purchase_amount: subtotal,
        balance: (selectedCust?.balance || 0) + subtotal,
      }, { onConflict: 'whatsapp' }).select('id').single()
      if (custData) customerId = custData.id

      // Get accounts
      const neededCodes = ['4010', '5010', '1110', '2020', '1050']
      if (deliveryTotal > 0) neededCodes.push('2085')
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4010'); const cogsId = acct('5010')
      const inventoryId = acct('1110'); const vatId = acct('2020')
      const arId = acct('1050'); const delivFloatId = acct('2085') || deliveryAccountId
      if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found')

      // Create journal
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

      // Build journal lines
      const jLines: any[] = []
      let ln = 1

      if (!isPOD && autoReceipt) {
        for (const pl of paymentLines) {
          if (!pl.accountId || !pl.amount) continue
          jLines.push({ journal_id: journal.id, line_number: ln++, account_id: pl.accountId, description: `${pl.method} — ${newCustName}${pl.ref ? ' · ' + pl.ref : ''}`, debit: parseFloat(pl.amount), credit: 0 })
        }
        if (deliveryTotal > 0 && delivFloatId) {
          const delivPayAcct = paymentLines[0]?.accountId
          if (delivPayAcct) jLines.push({ journal_id: journal.id, line_number: ln++, account_id: delivPayAcct, description: `Delivery collected — ${ref}`, debit: deliveryTotal, credit: 0 })
        }
      } else if (isPOD && arId) {
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: arId, description: `POD — ${newCustName} — ${ref}`, debit: total, credit: 0 })
      }

      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: revenueId, description: `Sales — ${ref}`, debit: 0, credit: netRevenue })
      if (vatId) jLines.push({ journal_id: journal.id, line_number: ln++, account_id: vatId, description: `VAT — ${ref}`, debit: 0, credit: vat })
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: cogsId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 })
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: inventoryId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal })
      if (deliveryTotal > 0 && delivFloatId) {
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: delivFloatId, description: `Delivery float — ${ref}`, debit: 0, credit: deliveryTotal })
      }

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      // Create voucher
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref, type: 'cash_sale', posting_date: postingDate,
        description: `Cash Sale — ${newCustName}`,
        subtotal: netRevenue, vat_amount: vat, total_amount: total,
        status: isPOD ? 'draft' : 'posted', branch: 'DSM HQ',
        customer_id: customerId, journal_id: journal.id,
        payment_method: paymentLines.map(p => p.method).join('+'),
        notes: deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : null,
        posted_by: 'Joe Gembe',
      }).select('id').single()
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      // Voucher lines + stock
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; if (!line.productId) continue
        const prod = dbProducts.find(p => p.id === line.productId); if (!prod) continue
        await supabase.from('voucher_lines').insert({ voucher_id: voucher.id, line_number: i + 1, product_id: line.productId, description: line.name, qty: line.qty, unit_cost: prod.cost_price, unit_price: line.price, subtotal: line.amount, vat_amount: Math.round(line.amount * 18 / 118), total: line.amount })
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand - line.qty }).eq('id', line.productId)
        await supabase.from('item_ledger_entries').insert({ product_id: line.productId, entry_type: 'sale', document_type: 'cash_sale', document_ref: ref, posting_date: postingDate, qty: -line.qty, cost_amount: prod.cost_price * line.qty })
      }

      // CRM — POD ledger
      if (isPOD && customerId) {
        await supabase.from('customer_ledger_entries').insert({ customer_id: customerId, posting_date: postingDate, document_type: 'invoice', document_ref: ref, description: `POD — ${newCustName}`, amount: total, remaining_amount: total, is_open: true, journal_id: journal.id })
      }

      showToast(`✅ ${ref} posted · ${isPOD ? 'POD pending receipt' : `Receipted · ${crownPoints} Crown pts`}`)
      setRefNum(n => n + 1); setShowModal(false); resetForm()
      loadTodayStats(); loadRecentSales(); loadProducts()

    } catch (err: any) {
      showToast('❌ ' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  // ── RENDER ─────────────────────────────────────
  return (
    <div className="page">
      {/* HEADER */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(212,135,74,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💵</div>
          <div>
            <div className="page-title">Cash Sale</div>
            <div className="page-sub">Counter sales · WhatsApp ID required · Auto-posts journal + Crown points</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadRecentSales}>🔄 Refresh</button>
          <button className="btn btn-primary" onClick={openNewSale} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700 }}>+ New Cash Sale</button>
        </div>
      </div>

      {/* TODAY STATS */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card green"><div className="stat-label">Sales Today</div><div className="stat-value">{todayStats.count}</div><div className="stat-change up">▲ Transactions</div></div>
        <div className="stat-card amber"><div className="stat-label">Revenue Today (TZS)</div><div className="stat-value">{todayStats.total >= 1000000 ? (todayStats.total/1000000).toFixed(2)+'M' : (todayStats.total/1000).toFixed(0)+'K'}</div><div className="stat-change up">▲ All sales</div></div>
        <div className="stat-card blue"><div className="stat-label">Avg Sale (TZS)</div><div className="stat-value">{todayStats.avgSale >= 1000 ? (todayStats.avgSale/1000).toFixed(0)+'K' : todayStats.avgSale}</div><div className="stat-change up">▲ Per transaction</div></div>
        <div className="stat-card yellow"><div className="stat-label">Crown Pts Awarded</div><div className="stat-value">{todayStats.crownPts.toLocaleString()}</div><div className="stat-change up">▲ Today</div></div>
      </div>

      <div className="grid g32" style={{ marginBottom: 20 }}>
        {/* TODAY'S SALES LIST */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">Today's Sales — {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <div className="card-sub">{todayStats.count} transactions · {tzs(todayStats.total)} total</div>
            </div>
            <button className="btn btn-ghost btn-sm">Full Register →</button>
          </div>
          {recentSales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💵</div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>No sales yet today</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Click + New Cash Sale to start</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Items</th><th>Payment</th><th className="td-right">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {recentSales.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <div className="td-bold">{(s.customers as any)?.name || s.description}</div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--wa)' }}>{(s.customers as any)?.whatsapp} · {s.ref}</div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{s.description?.replace('Cash Sale — ', '').split(' — ')[0]}</td>
                      <td><span className={`pill ${s.payment_method?.includes('Cash') ? 'pill-green' : s.payment_method?.includes('M-Pesa') || s.payment_method?.includes('Mpesa') ? 'pill-blue' : 'pill-amber'}`}>{s.payment_method}</span></td>
                      <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{s.total_amount?.toLocaleString()}</td>
                      <td><span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`}>{s.status === 'draft' ? '🛵 POD' : 'Posted ✓'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* New Sale CTA */}
          <div className="card" style={{ textAlign: 'center', padding: 28, cursor: 'pointer', border: '2px dashed var(--accent)' }} onClick={openNewSale}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💵</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>New Cash Sale</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>WhatsApp · Products · Payment · Crown points</div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, fontWeight: 700 }} onClick={openNewSale}>+ Start New Sale</button>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, fontFamily: 'var(--mono)' }}>or ⌘K → cash sale</div>
          </div>

          {/* Payment Split Today */}
          {Object.keys(paymentSplit).length > 0 && (
            <div className="card card-sm">
              <div className="card-title" style={{ marginBottom: 12 }}>Payment Split — Today</div>
              {Object.entries(paymentSplit).map(([method, amount], i) => {
                const pct = todayStats.total > 0 ? (amount / todayStats.total) * 100 : 0
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text3)' }}>{method.includes('Cash') ? '💵' : method.includes('Pesa') || method.includes('pesa') ? '📱' : '🏦'} {method}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)' }}>{tzs(amount)}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: method.includes('Cash') ? 'var(--green)' : method.includes('Pesa') || method.includes('pesa') ? 'var(--blue)' : 'var(--amber)', borderRadius: 2, transition: 'width .4s' }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL ─────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '20px 0' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '92%', maxWidth: 880, margin: 'auto' }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>💵</span>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>New Cash Sale</div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>Posts journal · EFD receipt · Crown points · WhatsApp receipt → customer</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>SALE NO. </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{genRef('CS', refNum)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 6 }}>Auto-assigned · Read only</span>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text3)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* LEFT */}
              <div style={{ padding: 24, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* STEP 1 — CUSTOMER */}
                <div>
                  <div className="step-header" style={{ marginBottom: 14 }}><div className="step-num">1</div><div className="step-title">CUSTOMER IDENTITY</div></div>
                  <div ref={searchRef} style={{ position: 'relative' }}>
                    <FG label="WhatsApp Number" req>
                      <div style={{ display: 'flex' }}>
                        <div style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: 'var(--r) 0 0 var(--r)', padding: '0 10px', display: 'flex', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>+255</div>
                        <input className="form-input" style={{ borderRadius: '0 var(--r) var(--r) 0', borderColor: selectedCust ? 'var(--green)' : 'var(--border)' }}
                          placeholder="7XX XXX XXX — type to search" value={waInput}
                          onChange={e => searchCustomer(e.target.value)}
                          onFocus={() => custResults.length > 0 && setShowDropdown(true)} />
                      </div>
                    </FG>

                    {showDropdown && custResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r)', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,.5)', overflow: 'hidden' }}>
                        {custResults.map((c, i) => (
                          <div key={i} onClick={() => selectCustomer(c)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{c.whatsapp} · {c.pregnancy_stage || '—'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, color: 'var(--yellow)' }}>👑 {(c.crown_points || 0).toLocaleString()}</div>
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{tzs(c.balance || 0)} LFV</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedCust ? (
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: 12, marginTop: 8 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>✓ Existing Customer</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>NAME</div><div style={{ fontSize: 13, fontWeight: 600 }}>{selectedCust.name}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>STAGE</div><div style={{ fontSize: 12 }}>{selectedCust.pregnancy_stage || '—'}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>LAST PURCHASE</div><div style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{selectedCust.last_purchase_date ? `${selectedCust.last_purchase_date}` : '—'}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>LIFETIME VALUE</div><div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{tzs(selectedCust.balance || 0)}</div></div>
                      </div>
                      <div style={{ marginTop: 8, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Crown Points</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>👑 {(selectedCust.crown_points || 0).toLocaleString()} pts</span>
                      </div>
                    </div>
                  ) : (
                    <FG label="Customer Name" req>
                      <input className="form-input" placeholder="e.g. Fatuma Said" value={newCustName} onChange={e => setNewCustName(e.target.value)} style={{ marginTop: 4 }} />
                    </FG>
                  )}
                </div>

                {/* STEP 2 — PRODUCTS */}
                <div>
                  <div className="step-header" style={{ marginBottom: 14 }}><div className="step-num">2</div><div className="step-title">PRODUCTS SOLD</div></div>
                  {lines.map((line, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 100px auto', gap: 6, marginBottom: 8, alignItems: 'flex-end' }}>
                      <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                        <option value="">— Select product —</option>
                        {dbProducts.map(p => <option key={p.id} value={p.id}>{p.name} · {tzs(p.selling_price)} · Stock: {p.qty_on_hand}</option>)}
                      </select>
                      <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 12 }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                      <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }} value={line.price} onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} placeholder="Price" />
                      {lines.length > 1 ? <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>✕</button> : <div />}
                    </div>
                  ))}
                  <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>PRODUCT · QTY · PRICE (editable)</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, price: 0, amount: 0 }])}>+ Add item</button>
                </div>

                {/* STEP 3 — DELIVERY (collapsible) */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: showDelivery ? 14 : 0 }} onClick={() => setShowDelivery(!showDelivery)}>
                    <div className="step-num">3</div>
                    <div className="step-title">DELIVERY / SHIPPING FEES</div>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>{showDelivery ? '▲ Hide' : '▼ Add fees'}</span>
                  </div>
                  {showDelivery && (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10 }}>⚡ Posts to 2085 Delivery & Shipping Float — not product revenue</div>
                      <div className="form-row">
                        <FG label="Town Delivery (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={townDelivery} onChange={e => setTownDelivery(e.target.value)} /></FG>
                        <FG label="Upcountry Shipping (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={upcountryShipping} onChange={e => setUpcountryShipping(e.target.value)} /></FG>
                      </div>
                      {deliveryTotal > 0 && (
                        <div style={{ background: 'var(--blue-dim)', border: '1px solid rgba(61,139,255,.2)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text3)' }}>🚚 Delivery/Shipping total</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{tzs(deliveryTotal)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* RIGHT */}
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* STEP 4 — PAYMENT */}
                <div>
                  <div className="step-header" style={{ marginBottom: 14 }}><div className="step-num">4</div><div className="step-title">PAYMENT METHOD</div></div>

                  {/* POD toggle */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button onClick={() => setIsPOD(false)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: !isPOD ? 'var(--green-dim)' : 'transparent', border: `1px solid ${!isPOD ? 'var(--green)' : 'var(--border)'}`, color: !isPOD ? 'var(--green)' : 'var(--text3)' }}>💵 Paid at Counter</button>
                    <button onClick={() => setIsPOD(true)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: isPOD ? 'var(--yellow-dim)' : 'transparent', border: `1px solid ${isPOD ? 'var(--yellow)' : 'var(--border)'}`, color: isPOD ? 'var(--yellow)' : 'var(--text3)' }}>🛵 Pay on Delivery (POD)</button>
                  </div>

                  {!isPOD ? (
                    <>
                      {paymentLines.map((pl, i) => (
                        <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={pl.method} onChange={e => updatePayment(i, 'method', e.target.value)}>
                              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                            </select>
                            <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={pl.accountId} onChange={e => updatePayment(i, 'accountId', e.target.value)}>
                              <option value="">— Account —</option>
                              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                            </select>
                            {paymentLines.length > 1 && <button onClick={() => setPaymentLines(paymentLines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>✕</button>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input type="number" className="form-input" style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15 }} placeholder="Amount (TZS)" value={pl.amount} onChange={e => updatePayment(i, 'amount', e.target.value)} />
                            {pl.method !== 'Cash' && <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="Ref / Transaction No" value={pl.ref} onChange={e => updatePayment(i, 'ref', e.target.value)} />}
                          </div>
                        </div>
                      ))}

                      {/* Quick amounts */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {[50000, 100000, 200000].map(amt => (
                          <button key={amt} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontFamily: 'var(--mono)' }} onClick={() => updatePayment(0, 'amount', amt.toString())}>{(amt/1000).toFixed(0)}K</button>
                        ))}
                        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => updatePayment(0, 'amount', total.toString())}>Exact</button>
                      </div>

                      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} onClick={() => setPaymentLines([...paymentLines, { method: 'M-Pesa', accountId: bankAccounts.find(a => a.code === '1020')?.id || '', amount: '', ref: '' }])}>+ Split Payment</button>

                      {totalPaid > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--text3)', fontSize: 13 }}>Change</span>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(Math.max(0, change))}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 12, fontSize: 12, color: 'var(--yellow)' }}>
                      🛵 POD — Stock will be deducted and sale recorded now. Cash receipt will be posted manually when rider returns with payment.
                    </div>
                  )}
                </div>

                {/* TOTALS */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Products subtotal</span><span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>VAT (18% incl.)</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{vat.toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Net revenue (excl. VAT)</span><span style={{ fontFamily: 'var(--mono)' }}>{netRevenue.toLocaleString()}</span></div>
                  {deliveryTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Delivery → 2085 Float</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{deliveryTotal.toLocaleString()}</span></div>}
                  {margin > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Gross margin</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 11 }}>{tzs(margin)} ({subtotal > 0 ? Math.round((margin/subtotal)*100) : 0}%)</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, padding: '12px 0 0', borderTop: '1px solid var(--border2)', marginTop: 8 }}>
                    <span>TOTAL</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(total)}</span>
                  </div>
                </div>

                {/* INFO + ACTIONS */}
                <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {!isPOD && <div style={{ color: 'var(--green)' }}>💬 WhatsApp receipt auto-sent to customer</div>}
                  {isPOD && <div style={{ color: 'var(--yellow)' }}>🛵 POD — receipt posted manually after delivery</div>}
                  <div style={{ color: 'var(--text3)' }}>📦 Inventory deducted · COGS posted to 5010</div>
                  <div style={{ color: 'var(--yellow)' }}>👑 {crownPoints} Crown points will be awarded</div>
                  {deliveryTotal > 0 && <div style={{ color: 'var(--blue)' }}>🚚 {tzs(deliveryTotal)} → Delivery & Shipping Float (2085)</div>}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '10px 14px' }}>📋 Draft</button>
                  <button className="btn btn-primary" onClick={post} disabled={posting} style={{ flex: 2, justifyContent: 'center', padding: '12px', fontSize: 13, fontWeight: 700, opacity: posting ? 0.6 : 1 }}>
                    {posting ? '⏳ Posting…' : isPOD ? '🛵 Post POD Sale' : '📤 Post & Send Receipt'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
