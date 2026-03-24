import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, tzs, today } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface DBProduct {
  id: string
  sku: string
  name: string
  cost_price: number
  selling_price: number
  qty_on_hand: number
  category: string
}

interface DBCustomer {
  id: string
  name: string
  whatsapp: string
  crown_points: number
  pregnancy_stage: string
  last_purchase_date: string
  last_purchase_amount: number
}

const PAYMENT_ACCOUNTS: Record<string, string> = {
  cash: '1010',
  mpesa: '1020',
  bank: '1030',
  pos: '1030',
}

export default function CashSale({ onNav: _onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [wa, setWa] = useState('')
  const [custName, setCustName] = useState('')
  const [foundCust, setFoundCust] = useState<DBCustomer | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [payment, setPayment] = useState('cash')
  const [tendered, setTendered] = useState('')
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([])
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [refNum, setRefNum] = useState(1)

  useEffect(() => {
    loadProducts()
    loadRecentSales()
    loadNextRef()
  }, [])

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, cost_price, selling_price, qty_on_hand, category')
      .eq('is_active', true)
      .order('name')
    if (!error && data) setDbProducts(data)
  }

  const loadRecentSales = async () => {
    const { data, error } = await supabase
      .from('vouchers')
      .select('ref, description, total_amount, payment_method, posting_date, status')
      .eq('type', 'cash_sale')
      .order('created_at', { ascending: false })
      .limit(10)
    if (!error && data) setRecentSales(data)
  }

  const loadNextRef = async () => {
    const { count } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'cash_sale')
    setRefNum((count || 0) + 1)
  }

  const lookupCust = async (val: string) => {
    setWa(val)
    const cleaned = val.replace(/[\s+]/g, '')
    if (cleaned.length < 9) { setFoundCust(null); return }
    setLookingUp(true)
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('whatsapp', cleaned)
      .single()
    setLookingUp(false)
    if (data) { setFoundCust(data); setCustName(data.name) }
    else setFoundCust(null)
  }

  const updateLine = (i: number, field: keyof LineItem, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = dbProducts.find(p => p.id === val)
      if (p) { nl[i].desc = p.name; nl[i].price = p.selling_price; nl[i].amount = nl[i].qty * p.selling_price }
    }
    if (field === 'qty' || field === 'price') nl[i].amount = nl[i].qty * nl[i].price
    setLines(nl)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const vat = Math.round(subtotal * 18 / 118)
  const total = subtotal
  const change = tendered ? parseInt(tendered) - total : 0
  const crownPoints = Math.round(total / 1000)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type)
  }

  const post = async () => {
    if (!custName.trim()) { showToast('❌ Please enter customer name', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('❌ Please add at least one product', 'error'); return }
    setPosting(true)
    const ref = genRef('CS', refNum)
    const postingDate = today()

    try {
      // Step 1: Upsert customer
      const cleaned = wa.replace(/[\s+]/g, '')
      let customerId = foundCust?.id || null
      if (cleaned.length >= 9) {
        const custCode = 'CUST-' + cleaned.slice(-6)
        const { data: custData, error: custErr } = await supabase
          .from('customers')
          .upsert({ code: custCode, name: custName.trim(), whatsapp: cleaned, customer_type: 'B2C', crown_points: (foundCust?.crown_points || 0) + crownPoints, last_purchase_date: postingDate, last_purchase_amount: total }, { onConflict: 'whatsapp' })
          .select('id').single()
        if (custErr) throw new Error('Customer: ' + custErr.message)
        customerId = custData.id
      }

      // Step 2: Get account IDs
      const { data: acctData, error: acctErr } = await supabase.from('accounts').select('id, code').in('code', [PAYMENT_ACCOUNTS[payment], '4010', '5010', '1110', '2020'])
      if (acctErr) throw new Error('Accounts: ' + acctErr.message)
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const cashAcctId = acct(PAYMENT_ACCOUNTS[payment])
      const revenueAcctId = acct('4010')
      const cogsAcctId = acct('5010')
      const inventoryAcctId = acct('1110')
      const vatAcctId = acct('2020')
      if (!cashAcctId || !revenueAcctId || !cogsAcctId || !inventoryAcctId) throw new Error('Required accounts not found. Check Chart of Accounts.')

      // Step 3: Create journal
      const { data: journal, error: jErr } = await supabase.from('journals').insert({ ref: 'JV-' + ref, posting_date: postingDate, description: `Cash Sale — ${custName} — ${ref}`, journal_type: 'cash_sale', source_type: 'cash_sale', source_ref: ref, posted_by: 'Joe Gembe', status: 'posted' }).select('id').single()
      if (jErr) throw new Error('Journal: ' + jErr.message)

      const cogsTotal = lines.reduce((s, l) => { const p = dbProducts.find(p => p.id === l.productId); return s + (p ? p.cost_price * l.qty : 0) }, 0)
      const netRevenue = subtotal - vat

      // Step 4: Journal lines
      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: cashAcctId, description: `Cash received — ${custName}`, debit: total, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: revenueAcctId, description: `Revenue — ${ref}`, debit: 0, credit: netRevenue },
        { journal_id: journal.id, line_number: 3, account_id: vatAcctId, description: `VAT 18% — ${ref}`, debit: 0, credit: vat },
        { journal_id: journal.id, line_number: 4, account_id: cogsAcctId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 },
        { journal_id: journal.id, line_number: 5, account_id: inventoryAcctId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Step 5: Update account balances
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: cashAcctId, p_debit: total, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: revenueAcctId, p_debit: 0, p_credit: netRevenue }),
        supabase.rpc('update_account_balance', { p_account_id: vatAcctId, p_debit: 0, p_credit: vat }),
        supabase.rpc('update_account_balance', { p_account_id: cogsAcctId, p_debit: cogsTotal, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: inventoryAcctId, p_debit: 0, p_credit: cogsTotal }),
      ])

      // Step 6: Create voucher
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({ ref, type: 'cash_sale', posting_date: postingDate, description: `Cash Sale — ${custName}`, subtotal: netRevenue, vat_amount: vat, total_amount: total, status: 'posted', branch: 'DSM HQ', customer_id: customerId, journal_id: journal.id, payment_method: payment, posted_by: 'Joe Gembe' }).select('id').single()
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      // Step 7: Voucher lines + stock deduction
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.productId) continue
        const prod = dbProducts.find(p => p.id === line.productId)
        if (!prod) continue
        await supabase.from('voucher_lines').insert({ voucher_id: voucher.id, line_number: i + 1, product_id: line.productId, description: line.desc, qty: line.qty, unit_cost: prod.cost_price, unit_price: prod.selling_price, subtotal: line.amount, vat_amount: Math.round(line.amount * 18 / 118), total: line.amount })
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand - line.qty }).eq('id', line.productId)
        await supabase.from('item_ledger_entries').insert({ product_id: line.productId, entry_type: 'sale', document_type: 'cash_sale', document_ref: ref, posting_date: postingDate, qty: -line.qty, cost_amount: prod.cost_price * line.qty })
      }

      showToast(`✅ ${ref} posted · Journal created · Stock deducted · ${crownPoints} Crown pts awarded`)
      setRefNum(n => n + 1)
      setWa(''); setCustName(''); setFoundCust(null)
      setLines([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
      setTendered(''); setPayment('cash')
      loadRecentSales(); loadProducts()

    } catch (err: any) {
      showToast('❌ ' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(212,135,74,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💵</div>
          <div>
            <div className="page-title">Cash Sale</div>
            <div className="page-sub">Counter POS · Crown points · Stock auto-deducted · <span className="sync-dot"></span> Live</div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 20, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
        <span style={{ color: 'var(--accent)' }}>⚡ Auto-journal:</span> Dr Cash/MPesa · Cr 4010 Revenue · Cr 2020 VAT · Dr 5010 COGS · Cr 1110 Inventory
      </div>

      <div className="grid g2" style={{ gap: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="step-header"><div className="step-num">1</div><div className="step-title">CUSTOMER IDENTITY</div></div>
            <div className="form-row">
              <FG label="WhatsApp Number" req>
                <input className="form-input" value={wa} onChange={e => lookupCust(e.target.value)} placeholder="+255 7XX XXX XXX" style={{ borderColor: 'var(--accent)' }} />
              </FG>
              <FG label="Customer Name" req>
                <input className="form-input" value={custName} onChange={e => setCustName(e.target.value)} placeholder="e.g. Fatuma Said" />
              </FG>
            </div>
            {lookingUp && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 6 }}>🔍 Looking up customer…</div>}
            {foundCust && (
              <div style={{ background: 'var(--surface3)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: 12, marginTop: 8 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--green)', marginBottom: 6 }}>✓ EXISTING CUSTOMER FOUND</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{foundCust.name}</div>
                {foundCust.pregnancy_stage && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>Stage: {foundCust.pregnancy_stage}</div>}
                <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4, fontFamily: 'var(--mono)' }}>👑 Crown Points: {foundCust.crown_points?.toLocaleString() || 0}</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="step-header"><div className="step-num">2</div><div className="step-title">PAYMENT METHOD</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[{ id: 'cash', label: '💵 Cash' }, { id: 'mpesa', label: '📱 M-Pesa' }, { id: 'bank', label: '🏦 Bank Transfer' }, { id: 'pos', label: '💳 POS Card' }].map(pm => (
                <button key={pm.id} onClick={() => setPayment(pm.id)} className="btn" style={{ justifyContent: 'center', background: payment === pm.id ? 'var(--accent-dim)' : 'transparent', border: `1px solid ${payment === pm.id ? 'var(--accent)' : 'var(--border)'}`, color: payment === pm.id ? 'var(--accent)' : 'var(--text2)' }}>{pm.label}</button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <FG label="Amount Tendered (TZS)">
                <input className="form-input" type="number" placeholder="0" value={tendered} onChange={e => setTendered(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} />
              </FG>
              {tendered && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0' }}>
                  <span style={{ color: 'var(--text3)' }}>Change</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(Math.max(0, change))}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="step-header"><div className="step-num">3</div><div className="step-title">PRODUCTS SOLD</div></div>
          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                <option value="">— Select product —</option>
                {dbProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {tzs(p.selling_price)} (Stock: {p.qty_on_hand})</option>
                ))}
              </select>
              <input type="number" className="form-input" style={{ width: 60, textAlign: 'center', fontSize: 12 }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
              {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>✕</button>}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setLines([...lines, { productId: '', desc: '', qty: 1, price: 0, amount: 0 }])}>+ Add item</button>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--text3)' }}>Subtotal (excl. VAT)</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{(subtotal - vat).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--text3)' }}>VAT (18% inclusive)</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{vat.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, padding: '10px 0', borderTop: '1px solid var(--border2)' }}>
              <span>TOTAL</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(total)}</span>
            </div>
          </div>

          <div style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginTop: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ color: 'var(--text3)' }}>📦 Stock deducted from Supabase · Full journal posted</div>
            <div style={{ color: 'var(--yellow)' }}>👑 {crownPoints} Crown points will be awarded</div>
          </div>

          <button className="btn btn-primary" onClick={post} disabled={posting} style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '12px', opacity: posting ? 0.6 : 1 }}>
            {posting ? '⏳ Posting…' : '📤 Post Sale & Send Receipt'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          Recent Cash Sales <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--green)', marginLeft: 8 }}>● Live from Supabase</span>
        </div>
        {recentSales.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>No sales posted yet. Post your first sale above.</div>
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
                    <td><span className={`pill ${s.payment_method === 'cash' ? 'pill-green' : s.payment_method === 'mpesa' ? 'pill-blue' : 'pill-amber'}`}>{s.payment_method}</span></td>
                    <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>{s.posting_date}</td>
                    <td><span className="pill pill-green">{s.status}</span></td>
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
