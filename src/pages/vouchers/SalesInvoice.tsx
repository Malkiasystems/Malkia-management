import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { genRef, today } from '../../lib/utils'
import type { Page } from '../../lib/types'
import { MalkiaInvoice } from '../InvoiceTemplate'
import { loadWAConfig, sendWhatsApp, formatInvoiceMessage } from '../../lib/whatsapp'
import type { WAConfig } from '../../lib/whatsapp'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; cost_price: number; selling_price: number; qty_on_hand: number }
interface DBCustomer { id: string; name: string; whatsapp: string; crown_points: number; balance: number }
interface InvLine { productId: string; name: string; qty: number; price: number; amount: number }

export default function SalesInvoice({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [invSettings, setInvSettings] = useState<any>(null)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<any>(null)
  const [invoiceSettings, setInvoiceSettings] = useState<any>(null)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const [lines, setLines] = useState<InvLine[]>([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({
    date: today(), dueDate: '', ref: '', customer: '', wa: '',
    paymentTerms: 'NET30', notes: '', salesperson: 'Joe Gembe'
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadProducts(); loadNextRef(); loadInvoiceSettings(); loadWAConfig().then(setWaConfig)
    supabase.from('system_settings').select('value').eq('key','inventory_settings').single().then(({data})=>{ if(data?.value) try { setInvSettings(JSON.parse(data.value)) } catch {} }) }, [])

  const loadInvoiceSettings = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'invoice_template').single()
    if (data?.value) { try { setInvoiceSettings(JSON.parse(data.value)) } catch {} }
  }

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, cost_price, selling_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) setProducts(data)
  }

  const loadNextRef = async () => {
    const { count } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'sales_invoice')
    set('ref', genRef('INV', (count || 0) + 1))
  }

  const searchCustomer = async (val: string) => {
    set('customer', val)
    if (val.length < 2) { setCustResults([]); setShowDrop(false); return }
    const { data } = await supabase.from('customers').select('*').or(`name.ilike.%${val}%,whatsapp.ilike.%${val}%`).limit(6)
    if (data && data.length > 0) { setCustResults(data); setShowDrop(true) }
    setSelectedCust(null)
  }

  const selectCust = (c: DBCustomer) => {
    setSelectedCust(c); set('customer', c.name); set('wa', c.whatsapp || '')
    setShowDrop(false); setCustResults([])
  }

  const updateLine = (i: number, field: keyof InvLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].name = p.name; nl[i].price = p.selling_price; nl[i].amount = nl[i].qty * p.selling_price }
    }
    if (field === 'qty') nl[i].amount = (val as number) * nl[i].price
    if (field === 'price') nl[i].amount = nl[i].qty * (val as number)
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
    if (!form.customer.trim()) { showToast('Customer name required', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    if (subtotal <= 0) { showToast('Invoice total must be greater than zero', 'error'); return }
    if (invSettings?.block_negative_stock) {
      for (const line of lines) {
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (prod && prod.qty_on_hand < line.qty) { showToast(`Insufficient stock for ${prod.name}. Available: ${prod.qty_on_hand}`, 'error'); return }
      }
    }
    setPosting(true)

    try {
      // Upsert customer
      let customerId = selectedCust?.id || null
      if (!customerId && form.customer.trim()) {
        const cleaned = form.wa.replace(/[\s+\-()]/g, '')
        const custPayload = {
          code: 'CUST-' + Date.now().toString().slice(-6),
          name: form.customer.trim(),
          whatsapp: cleaned || null,
          customer_type: 'B2B',
          balance: subtotal,
          last_purchase_date: form.date,
          last_purchase_amount: subtotal,
        }
        // If whatsapp provided, upsert to avoid duplicates; otherwise plain insert
        let cData = null
        if (cleaned) {
          const { data } = await supabase.from('customers').upsert(custPayload, { onConflict: 'whatsapp' }).select('id').single()
          cData = data
        } else {
          const { data } = await supabase.from('customers').insert(custPayload).select('id').single()
          cData = data
        }
        if (cData) customerId = cData.id
      }

      // Get accounts
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['4011', '5010', '1110', '2020', '1050'])
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4011'); const cogsId = acct('5010')
      const inventoryId = acct('1110'); const vatId = acct('2020'); const arId = acct('1050')
      if (!revenueId || !cogsId || !inventoryId || !arId) throw new Error('Required GL accounts not found: check 4011, 5010, 1110, 1050 exist in Chart of Accounts')

      // Create journal
      const { data: journal, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Sales Invoice — ${form.customer} — ${form.ref}`,
        journal_type: 'sales_invoice', source_type: 'sales_invoice', source_ref: form.ref,
        posted_by: form.salesperson, status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error('Journal: ' + jErr.message)

      // Journal lines
      const jLines = [
        { journal_id: journal.id, line_number: 1, account_id: arId, description: `AR — ${form.customer} — ${form.ref}`, debit: subtotal, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: revenueId, description: `B2B Revenue — ${form.ref}`, debit: 0, credit: netRevenue },
        { journal_id: journal.id, line_number: 3, account_id: vatId, description: `VAT — ${form.ref}`, debit: 0, credit: vat },
        { journal_id: journal.id, line_number: 4, account_id: cogsId, description: `COGS — ${form.ref}`, debit: cogsTotal, credit: 0 },
        { journal_id: journal.id, line_number: 5, account_id: inventoryId, description: `Inventory out — ${form.ref}`, debit: 0, credit: cogsTotal },
      ]

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances
      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      // Create voucher
      const voucherPayload: Record<string, unknown> = {
        ref: form.ref, type: 'sales_invoice', posting_date: form.date,
        description: `Sales Invoice — ${form.customer}`,
        subtotal: netRevenue, vat_amount: vat, total_amount: subtotal,
        status: 'posted', customer_id: customerId, journal_id: journal.id,
        notes: form.notes || null, posted_by: form.salesperson,
      }
      // Add optional columns only if they have values
      if (form.dueDate) voucherPayload.due_date = form.dueDate
      if (form.paymentTerms) voucherPayload.payment_terms = form.paymentTerms

      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert(voucherPayload).select('id').single()
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      // Voucher lines + stock deduction
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId); if (!prod) continue
        await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id, line_number: i + 1, product_id: line.productId,
          description: line.name, qty: line.qty, unit_cost: prod.cost_price,
          unit_price: line.price, subtotal: line.amount,
          vat_amount: Math.round(line.amount * 18 / 118), total: line.amount,
        })
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand - line.qty }).eq('id', line.productId)
        await supabase.from('item_ledger_entries').insert({
          product_id: line.productId, entry_type: 'sale',
          document_type: 'sales_invoice', document_ref: form.ref,
          posting_date: form.date, qty: -line.qty, cost_amount: prod.cost_price * line.qty,
        })
      }

      const invoiceData = {
        ref: form.ref, posting_date: form.date, due_date: form.dueDate,
        payment_terms: form.paymentTerms, notes: form.notes,
        total_amount: subtotal, vat_amount: vat, subtotal: netRevenue,
        posted_by: form.salesperson,
        customers: selectedCust
          ? { name: selectedCust.name, whatsapp: selectedCust.whatsapp || '', address: '', balance: selectedCust.balance || 0 }
          : { name: form.customer, whatsapp: form.wa || '', address: '', balance: 0 },
        voucher_lines: lines.filter(l => l.productId).map(l => ({
          qty: l.qty, unit_price: l.price, total: l.amount,
          description: l.name, products: { name: l.name, sku: '' }
        })),
      }
      setLastInvoice(invoiceData)
      setShowInvoice(true)
      showToast(`${form.ref} posted · AR updated · Stock deducted`)

      // Customer AR ledger entry (non-blocking)
      if (customerId) {
        supabase.from('customer_ledger_entries').insert({
          customer_id: customerId, posting_date: form.date,
          document_type: 'invoice', document_ref: form.ref,
          description: `Sales Invoice — ${form.customer}`,
          amount: subtotal, remaining_amount: subtotal,
          due_date: form.dueDate || null, is_open: true, journal_id: journal.id,
        }).then(({ error }) => { if (error) console.warn('Ledger entry:', error.message) })
      }
    } catch (err: any) {
      console.error('SalesInvoice post error:', err)
      showToast(err.message || 'Something went wrong — check browser console', 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <>
    <VoucherPage title="Sales Invoice" icon="" subtitle="Credit sale — creates open AR entry · Stock deducted · Customer ledger updated"
      color="rgba(0,229,160,.12)" onPost={post}
      postLabel={posting ? 'Posting…' : 'Post Invoice'}
      journalNote="Dr AR (1050) · Cr Revenue (4011) · Cr VAT (2020) · Dr COGS (5010) · Cr Inventory (1110)">

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div style={{ flex: 1 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Invoice Header</div>
            <div className="form-row">
              <FG label="Invoice No" req><input className="form-input" value={form.ref} onChange={e => set('ref', e.target.value)} /></FG>
              <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Due Date"><input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></FG>
              <FG label="Payment Terms">
                <select className="form-input" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                  <option value="COD">Cash on Delivery</option>
                  <option value="NET15">Net 15 Days</option>
                  <option value="NET30">Net 30 Days</option>
                  <option value="NET60">Net 60 Days</option>
                </select>
              </FG>
            </div>
            <FG label="Salesperson">
              <select className="form-input" value={form.salesperson} onChange={e => set('salesperson', e.target.value)}>
                <option>Joe Gembe</option><option>Jane Mwatonoka</option>
                <option>Lilian Mallya</option><option>Barbra Kabendera</option>
              </select>
            </FG>
          </div>
          <div style={{ flex: 1 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Bill To</div>
            <div style={{ position: 'relative' }}>
              <FG label="Customer / Company" req>
                <input className="form-input" placeholder="Type to search existing customer…"
                  value={form.customer} onChange={e => searchCustomer(e.target.value)}
                  onFocus={() => custResults.length > 0 && setShowDrop(true)} />
              </FG>
              {showDrop && custResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r)', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden' }}>
                  {custResults.map((c, i) => (
                    <div key={i} onClick={() => selectCust(c)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{c.whatsapp}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        Balance: {(c.balance || 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <FG label="WhatsApp"><input className="form-input" placeholder="+255 7XX XXX XXX" value={form.wa} onChange={e => set('wa', e.target.value)} /></FG>
            {selectedCust && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: 10, fontSize: 12 }}>
                <div style={{ color: 'var(--green)', fontSize: 10, fontFamily: 'var(--mono)', marginBottom: 4 }}>EXISTING CUSTOMER</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3)' }}>Outstanding AR</span>
                  <span style={{ fontFamily: 'var(--mono)', color: selectedCust.balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>TZS {(selectedCust.balance || 0).toLocaleString()}</span>
                </div>
              </div>
            )}
            <FG label="Notes / Payment Instructions">
              <textarea className="form-input" rows={2} placeholder="Bank details, delivery instructions…"
                value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'none' }} />
            </FG>
          </div>
        </div>
      </div>

      {/* LINE ITEMS */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Invoice Lines</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 120px 120px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
              <option value="">— Select product —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} · Stock: {p.qty_on_hand}</option>)}
            </select>
            <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 13 }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }} value={line.price} onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--green)', paddingRight: 4 }}>{line.amount.toLocaleString()}</div>
            {lines.length > 1 ? <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button> : <div />}
          </div>
        ))}
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>PRODUCT · QTY · UNIT PRICE · LINE TOTAL</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, price: 0, amount: 0 }])}>+ Add line</button>

        {/* Totals */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12, maxWidth: 320, marginLeft: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Gross Total</span><span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toLocaleString()}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>VAT (18% incl.)</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{vat.toLocaleString()}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Net Revenue</span><span style={{ fontFamily: 'var(--mono)' }}>{netRevenue.toLocaleString()}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, padding: '10px 0 0', borderTop: '1px solid var(--border2)', marginTop: 6 }}>
            <span>INVOICE TOTAL</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{subtotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>

      {/* INVOICE MODAL — outside VoucherPage so fixed positioning works */}
      {showInvoice && lastInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>
          <div style={{ background: 'rgba(0,0,0,.95)', borderBottom: '1px solid rgba(255,255,255,.1)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: '#fff' }}>Invoice — {lastInvoice.ref}</div>
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
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print / Save PDF
              </button>
              <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, background: waSent ? 'rgba(37,211,102,.15)' : waConfig?.enabled && waConfig?.api_key ? 'rgba(37,211,102,.1)' : 'var(--surface2)', color: waSent ? '#25D366' : waConfig?.enabled && waConfig?.api_key ? '#25D366' : 'var(--text3)', border: `1px solid ${waConfig?.enabled && waConfig?.api_key ? 'rgba(37,211,102,.3)' : 'var(--border)'}`, cursor: waConfig?.enabled && waConfig?.api_key ? 'pointer' : 'not-allowed' }}
                title={!waConfig?.enabled || !waConfig?.api_key ? 'Configure WhatsApp in Settings first' : ''}
                disabled={sending || waSent || !waConfig?.enabled || !waConfig?.api_key}
                onClick={async () => {
                  if (!lastInvoice || !waConfig) return
                  const phone = lastInvoice.customers?.whatsapp
                  if (!phone) { alert('No WhatsApp number for this customer'); return }
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
                  const result = await sendWhatsApp(waConfig, { to: phone, message: msg, type: 'invoice', ref: lastInvoice.ref, customer_name: lastInvoice.customers?.name })
                  setSending(false)
                  if (result.success) { setWaSent(true) } else { alert('Send failed: ' + result.error) }
                }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                {sending ? 'Sending…' : waSent ? 'Sent ✓' : 'Send via WhatsApp'}
              </button>
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
                footer_note: 'Thank you for your business. Payment is due by the date above.',
                payment_note: 'Please include the invoice number as payment reference.',
              }} />
            </div>
          </div>
        </div>
      )}
  </>
  )
}
