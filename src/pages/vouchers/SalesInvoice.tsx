import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today, tzs, getPostedBy } from '../../lib/utils'
import type { Page } from '../../lib/types'
import { MalkiaInvoice } from '../InvoiceTemplate'
import { loadWAConfig, sendWhatsApp, formatInvoiceMessage } from '../../lib/whatsapp'
import type { WAConfig } from '../../lib/whatsapp'

interface Props { onNav: (p: Page) => void }

interface DBCustomer {
  id: string; name: string; company: string; contact_person: string
  whatsapp: string; balance: number; credit_limit: number
  credit_period: number; payment_terms: string; customer_number: string
}

interface DBProduct {
  id: string; sku: string; name: string
  cost_price: number; selling_price: number; qty_on_hand: number
}

interface InvLine {
  productId: string; name: string; qty: number
  price: number; discount: number; amount: number
}

const TERMS = ['COD', 'NET7', 'NET14', 'NET30', 'NET45', 'NET60', 'NET90']

export default function SalesInvoice({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<any>(null)
  const [invoiceSettings, setInvoiceSettings] = useState<any>(null)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const [locations, setLocations] = useState<{id:string;code:string;name:string}[]>([])
  const [locationCode, setLocationCode] = useState('1001')
  const [invSettings, setInvSettings] = useState<any>(null)
  const [lines, setLines] = useState<InvLine[]>([{ productId: '', name: '', qty: 1, price: 0, discount: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), dueDate: '', ref: '', customer: '', wa: '', paymentTerms: 'NET30', notes: '', salesperson: 'Joe Gembe' })
  const dropRef = useRef<HTMLDivElement>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    loadProducts(); loadNextRef(); loadSettings()
    supabase.from('stock_locations').select('id,code,name').eq('is_active', true).order('code')
      .then(({ data }) => { if (data) { setLocations(data); if (data[0]) setLocationCode(data[0].code) } })
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const loadSettings = () => {
    supabase.from('system_settings').select('value').eq('key', 'invoice_template').single()
      .then(({ data }) => { if (data?.value) try { setInvoiceSettings(JSON.parse(data.value)) } catch {} })
    supabase.from('system_settings').select('value').eq('key', 'inventory_settings').single()
      .then(({ data }) => { if (data?.value) try { setInvSettings(JSON.parse(data.value)) } catch {} })
    loadWAConfig().then(setWaConfig)
  }

  const loadProducts = () => {
    supabase.from('products').select('id, sku, name, cost_price, selling_price, qty_on_hand')
      .eq('is_active', true).order('name').then(({ data }) => { if (data) setProducts(data) })
  }

  const loadNextRef = async () => {
    const ref = await nextRef('sales_invoice')
    setForm(f => ({ ...f, ref }))
  }

  const searchCustomer = async (val: string) => {
    set('customer', val)
    setSelectedCust(null)
    if (val.length < 1) { setCustResults([]); setShowDrop(false); return }
    const { data } = await supabase.from('customers')
      .select('*').eq('customer_type', 'debtor').eq('is_active', true)
      .or(`name.ilike.%${val}%,company.ilike.%${val}%,contact_person.ilike.%${val}%,customer_number.ilike.%${val}%`)
      .order('name').limit(8)
    setCustResults(data || [])
    setShowDrop((data || []).length > 0)
  }

  const selectCust = (c: DBCustomer) => {
    setSelectedCust(c)
    set('customer', c.company || c.name)
    set('wa', c.whatsapp || '')
    if (c.payment_terms) set('paymentTerms', c.payment_terms)
    if (c.credit_period > 0) {
      const due = new Date(); due.setDate(due.getDate() + c.credit_period)
      set('dueDate', due.toISOString().split('T')[0])
    }
    setShowDrop(false); setCustResults([])
  }

  const updateLine = (i: number, field: keyof InvLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].name = p.name; nl[i].price = p.selling_price }
    }
    const price = field === 'price' ? Number(val) : nl[i].price
    const qty = field === 'qty' ? Number(val) : nl[i].qty
    const disc = field === 'discount' ? Number(val) : nl[i].discount
    nl[i].amount = Math.round(price * qty * (1 - disc / 100))
    setLines(nl)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const vat = Math.round(subtotal * 18 / 118)
  const netRevenue = subtotal - vat
  const cogsTotal = lines.reduce((s, l) => {
    const p = products.find(p => p.id === l.productId)
    return s + (p ? p.cost_price * l.qty : 0)
  }, 0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!selectedCust) { showToast('Select a customer from the database first', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    if (subtotal <= 0) { showToast('Invoice total must be greater than zero', 'error'); return }
    if (invSettings?.block_negative_stock) {
      for (const line of lines) {
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (prod && prod.qty_on_hand < line.qty) {
          showToast(`Insufficient stock: ${prod.name} · Available: ${prod.qty_on_hand}`, 'error'); return
        }
      }
    }
    setPosting(true)
    try {
      const customerId = selectedCust.id
      const { data: acctData } = await supabase.from('accounts').select('id, code')
        .in('code', ['4011', '5010', '1110', '2020', '1050'])
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4011'); const cogsId = acct('5010')
      const inventoryId = acct('1110'); const vatId = acct('2020'); const arId = acct('1050')
      if (!revenueId || !cogsId || !inventoryId || !arId) throw new Error('Required GL accounts not found')

      const { data: journal, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Sales Invoice — ${selectedCust.company || selectedCust.name} — ${form.ref}`,
        journal_type: 'sales_invoice', source_type: 'sales_invoice', source_ref: form.ref,
        posted_by: getPostedBy(), status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error(jErr.message)

      const jLines = [
        { journal_id: journal.id, line_number: 1, account_id: arId, description: `AR — ${selectedCust.company || selectedCust.name} — ${form.ref}`, debit: subtotal, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: revenueId, description: `Revenue — ${form.ref}`, debit: 0, credit: netRevenue },
        { journal_id: journal.id, line_number: 3, account_id: vatId, description: `VAT — ${form.ref}`, debit: 0, credit: vat },
        { journal_id: journal.id, line_number: 4, account_id: cogsId, description: `COGS — ${form.ref}`, debit: cogsTotal, credit: 0 },
        { journal_id: journal.id, line_number: 5, account_id: inventoryId, description: `Inventory out — ${form.ref}`, debit: 0, credit: cogsTotal },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)
      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      const voucherPayload: Record<string, unknown> = {
        ref: form.ref, type: 'sales_invoice', posting_date: form.date,
        description: `Sales Invoice — ${selectedCust.company || selectedCust.name}`,
        subtotal: netRevenue, vat_amount: vat, total_amount: subtotal,
        status: 'posted', customer_id: customerId, journal_id: journal.id,
        notes: form.notes || null, posted_by: getPostedBy(),
      }
      if (form.dueDate) voucherPayload.due_date = form.dueDate
      if (form.paymentTerms) voucherPayload.payment_terms = form.paymentTerms

      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert(voucherPayload).select('id').single()
      if (vErr) throw new Error(vErr.message)

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId); if (!prod) continue
        await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id, line_number: i + 1, product_id: line.productId,
          description: line.name, qty: line.qty, unit_cost: prod.cost_price,
          unit_price: line.price, subtotal: line.amount, discount_pct: line.discount,
          vat_amount: Math.round(line.amount * 18 / 118), total: line.amount,
        })
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand - line.qty }).eq('id', prod.id)
        await supabase.from('item_ledger_entries').insert({
          product_id: line.productId, entry_type: 'sale', location_code: locationCode,
          document_type: 'sales_invoice', document_ref: form.ref,
          posting_date: form.date, qty: -line.qty, cost_amount: prod.cost_price * line.qty,
        })
      }

      // Update customer balance and ledger
      await supabase.from('customers').update({
        balance: (selectedCust.balance || 0) + subtotal,
        last_purchase_date: form.date, last_purchase_amount: subtotal,
      }).eq('id', customerId)

      supabase.from('customer_ledger_entries').insert({
        customer_id: customerId, posting_date: form.date,
        document_type: 'invoice', document_ref: form.ref,
        description: `Sales Invoice — ${selectedCust.company || selectedCust.name}`,
        amount: subtotal, remaining_amount: subtotal,
        due_date: form.dueDate || null, is_open: true, journal_id: journal.id,
      }).then(({ error }) => { if (error) console.warn('Ledger:', error.message) })

      const invoiceData = {
        ref: form.ref, posting_date: form.date, due_date: form.dueDate,
        payment_terms: form.paymentTerms, notes: form.notes,
        total_amount: subtotal, vat_amount: vat, subtotal: netRevenue,
        posted_by: form.salesperson,
        customers: {
          name: selectedCust.name, company: selectedCust.company || '',
          contact_person: selectedCust.contact_person || '',
          whatsapp: selectedCust.whatsapp || '', address: '', balance: selectedCust.balance || 0
        },
        voucher_lines: lines.filter(l => l.productId).map(l => ({
          qty: l.qty, unit_price: l.price, total: l.amount,
          discount_pct: l.discount, description: l.name,
          products: { name: l.name, sku: products.find(p => p.id === l.productId)?.sku || '' }
        })),
      }
      setLastInvoice(invoiceData)
      setShowInvoice(true)
      showToast(`${form.ref} posted · TZS ${subtotal.toLocaleString()}`)
    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  const creditUsedPct = selectedCust && selectedCust.credit_limit > 0
    ? Math.min(100, Math.round(((selectedCust.balance || 0) / selectedCust.credit_limit) * 100)) : 0
  const availableCredit = selectedCust && selectedCust.credit_limit > 0
    ? Math.max(0, selectedCust.credit_limit - (selectedCust.balance || 0)) : null

  return (
    <>
    <VoucherPage title="Sales Invoice" icon="" subtitle="Credit sale — creates open AR · Stock deducted · Customer ledger updated"
      color="rgba(0,229,160,.12)" onPost={post}
      postLabel={posting ? 'Posting…' : 'Post Invoice'}
      journalNote="Dr AR (1050) · Cr Revenue (4011) · Cr VAT (2020) · Dr COGS (5010) · Cr Inventory (1110)">

      {/* ── CUSTOMER SELECTION (full width hero) ─────────────────────────── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title">Bill To</div>
          {selectedCust && (
            <button onClick={() => { setSelectedCust(null); set('customer', ''); set('wa', '') }}
              style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Change customer
            </button>
          )}
        </div>

        {!selectedCust ? (
          /* Customer search */
          <div ref={dropRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                width="14" height="14" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <input className="form-input" style={{ paddingLeft: 36, fontSize: 14, height: 48 }}
                placeholder="Search debtors by company, name, contact person, or DEB number…"
                value={form.customer}
                onChange={e => searchCustomer(e.target.value)}
                onFocus={() => { if (!form.customer) searchCustomer(' ') }}
                autoFocus
              />
            </div>
            {showDrop && custResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--surface)', border: '1px solid var(--accent)',
                borderRadius: 10, zIndex: 50, boxShadow: '0 12px 40px rgba(0,0,0,.4)',
                overflow: 'hidden', maxHeight: 320, overflowY: 'auto'
              }}>
                {custResults.map((c, i) => (
                  <div key={i} onClick={() => selectCust(c)}
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.company || c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {c.contact_person && `Attn: ${c.contact_person} · `}{c.customer_number} · {c.payment_terms || 'COD'}
                        {c.whatsapp && ` · ${c.whatsapp}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                      {(c.balance || 0) > 0 && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                          AR: {(c.balance || 0).toLocaleString()}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                        {c.credit_limit > 0 ? `Limit: ${c.credit_limit.toLocaleString()}` : 'Unlimited credit'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Selected customer card */
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>
                  {selectedCust.company || selectedCust.name}
                </div>
                {selectedCust.contact_person && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Attn: {selectedCust.contact_person}</div>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>
                    {selectedCust.customer_number}
                  </span>
                  {selectedCust.whatsapp && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{selectedCust.whatsapp}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{selectedCust.payment_terms || 'COD'}</span>
                </div>
              </div>

              {/* Credit info panel */}
              <div style={{ textAlign: 'right', minWidth: 200 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 8 }}>
                  {[
                    { label: 'Outstanding AR', val: tzs(selectedCust.balance || 0), color: (selectedCust.balance||0) > 0 ? 'var(--red)' : 'var(--green)' },
                    { label: 'Credit Limit', val: selectedCust.credit_limit > 0 ? tzs(selectedCust.credit_limit) : 'Unlimited' },
                    { label: 'Credit Period', val: selectedCust.credit_period > 0 ? `${selectedCust.credit_period} days` : 'COD' },
                    { label: 'Available', val: availableCredit !== null ? tzs(availableCredit) : 'Unlimited', color: 'var(--green)' },
                  ].map(item => (
                    <div key={item.label} style={{ padding: '4px 0' }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: item.color || 'var(--text)' }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {selectedCust.credit_limit > 0 && (
                  <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${creditUsedPct}%`, background: creditUsedPct > 80 ? 'var(--red)' : creditUsedPct > 60 ? 'var(--yellow)' : 'var(--green)', borderRadius: 2, transition: 'width .3s' }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── INVOICE METADATA STRIP ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'Invoice No', content: <input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', background: 'var(--surface2)', cursor: 'default' }} /> },
          { label: 'Date', content: <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /> },
          { label: 'Due Date', content: <input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /> },
          { label: 'Payment Terms', content: (
            <select className="form-input" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
          )},
          { label: 'Salesperson', content: (
            <select className="form-input" value={form.salesperson} onChange={e => set('salesperson', e.target.value)}>
              <option>Joe Gembe</option><option>Jane Mwatonoka</option>
              <option>Lilian Mallya</option><option>Barbra Kabendera</option>
            </select>
          )},
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{item.label}</div>
            {item.content}
          </div>
        ))}
      </div>

      {/* ── STOCK LOCATION ───────────────────────────────────────────────── */}
      {locations.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Deduct from:</span>
          {locations.map(loc => (
            <button key={loc.id} onClick={() => setLocationCode(loc.code)}
              style={{ padding: '5px 12px', border: `1.5px solid ${locationCode === loc.code ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, background: locationCode === loc.code ? 'var(--accent-dim)' : 'var(--surface)', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: locationCode === loc.code ? 'var(--accent)' : 'var(--text3)', transition: 'all .15s' }}>
              {loc.code} — {loc.name}
            </button>
          ))}
        </div>
      )}

      {/* ── LINE ITEMS ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Invoice Lines</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Product', 'Qty', 'Unit Price', 'Disc %', 'Line Total', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Line Total' ? 'right' : 'left', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 4px', minWidth: 200 }}>
                    <select className="form-input" style={{ fontSize: 12 }} value={line.productId}
                      onChange={e => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Select product —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku} · Stock: {p.qty_on_hand}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 4px', width: 70 }}>
                    <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 13 }} min={1} value={line.qty}
                      onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                  </td>
                  <td style={{ padding: '6px 4px', width: 130 }}>
                    <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }} value={line.price}
                      onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td style={{ padding: '6px 4px', width: 80 }}>
                    <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 12 }} min={0} max={100} value={line.discount}
                      onChange={e => updateLine(i, 'discount', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                    {line.amount.toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 4px', width: 32 }}>
                    {lines.length > 1 && (
                      <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1 }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
          onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, price: 0, discount: 0, amount: 0 }])}>
          + Add line
        </button>

        {/* Totals */}
        <div style={{ maxWidth: 340, marginLeft: 'auto', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {[
            { label: 'Subtotal (incl. VAT)', val: subtotal.toLocaleString() },
            { label: 'VAT (18% incl.)', val: vat.toLocaleString(), color: 'var(--text3)' },
            { label: 'Net Revenue', val: netRevenue.toLocaleString(), color: 'var(--text3)' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: item.color || 'var(--text)' }}>
              <span>{item.label}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{item.val}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--accent)' }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>INVOICE TOTAL</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>TZS {subtotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── NOTES ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Notes / Payment Instructions</div>
        <textarea className="form-input" rows={2} style={{ resize: 'none', fontSize: 12 }}
          placeholder="Bank details, delivery instructions, payment reference…"
          value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>

    {/* ── INVOICE MODAL ────────────────────────────────────────────────── */}
    {showInvoice && lastInvoice && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>
        <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700 }}>Invoice — {lastInvoice.ref}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={() => {
              const el = document.getElementById('malkia-invoice')
              if (!el) return
              const win = window.open('', '_blank')
              if (!win) return
              win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${lastInvoice.ref}</title>
                <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
                <style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}@media print{body{background:#fff;padding:0}}</style>
              </head><body>${el.outerHTML}</body></html>`)
              win.document.close()
              setTimeout(() => win.print(), 600)
            }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print / PDF
            </button>
            {waConfig?.enabled && waConfig?.api_key && lastInvoice.customers?.whatsapp && (
              <button className="btn btn-ghost btn-sm" disabled={sending || waSent}
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366', border: '1px solid rgba(37,211,102,.3)' }}
                onClick={async () => {
                  if (!lastInvoice || !waConfig) return
                  setSending(true)
                  const msg = formatInvoiceMessage(waConfig.template_invoice || '', {
                    customer_name: lastInvoice.customers?.name || 'Customer',
                    ref: lastInvoice.ref, date: lastInvoice.posting_date,
                    due_date: lastInvoice.due_date || '', payment_terms: lastInvoice.payment_terms || '',
                    items: lastInvoice.voucher_lines?.map((l: any) => ({ name: l.products?.name || l.description || '—', qty: l.qty, amount: l.total })) || [],
                    total: lastInvoice.total_amount,
                    outstanding: lastInvoice.customers?.balance || 0,
                    bank_account: waConfig ? '22510074972 (NMB)' : '—',
                  })
                  const result = await sendWhatsApp(waConfig, { to: lastInvoice.customers.whatsapp, message: msg, type: 'invoice', ref: lastInvoice.ref, customer_name: lastInvoice.customers?.name })
                  setSending(false)
                  if (result.success) setWaSent(true)
                }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                {sending ? 'Sending…' : waSent ? 'Sent ✓' : 'WhatsApp'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => { setShowInvoice(false); onNav('vouchers'); setWaSent(false) }}>Close</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '32px 20px' }}>
          <div id="malkia-invoice">
            <MalkiaInvoice voucher={lastInvoice} settings={invoiceSettings || {
              company_name: 'Malkia Wellness Group Ltd', tagline: 'Reimagining Motherhood',
              address: 'Dar es Salaam, Tanzania', city: 'Dar es Salaam',
              phone: '+255 700 000 000', email: 'hello@malkia.co.tz', website: 'www.malkia.co.tz',
              tin: '—', vrn: '—', primary_color: '#85c2be',
              bank_name: 'NMB Bank', bank_account_name: 'Malkia Wellness Group Ltd',
              bank_account_number: '22510074972', bank_branch: 'Dar es Salaam Branch',
              show_bank_details: true, show_salesperson: true, show_vat_breakdown: true,
              show_outstanding_balance: true, show_payment_terms: true, show_notes: true,
              footer_note: 'Thank you for your business. Payment is due by the date shown above.',
              payment_note: 'Please quote the invoice number as payment reference.',
            }} />
          </div>
        </div>
      </div>
    )}
    </>
  )
}
