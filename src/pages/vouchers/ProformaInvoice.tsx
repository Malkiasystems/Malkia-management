import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; selling_price: number; cost_price: number; qty_on_hand: number }
interface PFLine { productId: string; desc: string; qty: number; price: number; amount: number }

export default function ProformaInvoice({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [converting, setConverting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [lines, setLines] = useState<PFLine[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({
    ref: 'PF-10-????', date: today(), dueDate: '', customer: '', wa: '',
    paymentTerms: 'NET30', notes: '', validity: '7', branch: '10'
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  useEffect(() => {
    loadProducts()
    nextRef('proforma').then(ref => set('ref', ref))
  }, [])

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, selling_price, cost_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) setProducts(data)
  }

  const updateLine = (i: number, field: keyof PFLine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].desc = p.name; nl[i].price = p.selling_price }
    }
    if (field === 'qty' || field === 'price') {
      nl[i].amount = nl[i].qty * nl[i].price
    }
    setLines(nl)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const vat = Math.round(subtotal * 18 / 118)
  const net = subtotal - vat

  const saveProforma = async () => {
    if (!form.customer.trim()) { showToast('Customer name required', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    setPosting(true)
    try {
      const { error } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'proforma', posting_date: form.date,
        description: `Proforma Invoice — ${form.customer} — ${form.ref}`,
        total_amount: subtotal, status: 'proforma',
        notes: `Customer: ${form.customer}${form.wa ? ` · WA: ${form.wa}` : ''}${form.notes ? ` · ${form.notes}` : ''}`,
        posted_by: 'Joe Gembe',
      })
      if (error) throw new Error(error.message)
      showToast(`${form.ref} saved as Proforma — no stock or GL impact`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error')
    } finally { setPosting(false) }
  }

  const convertToInvoice = async () => {
    if (!form.customer.trim()) { showToast('Customer name required', 'error'); return }
    setConverting(true)
    try {
      // Get next SI ref
      const siRef = await nextRef('sales_invoice')
      // Navigate to sales invoice with pre-filled data via localStorage
      localStorage.setItem('prefill_invoice', JSON.stringify({
        customer: form.customer, wa: form.wa, ref: siRef,
        paymentTerms: form.paymentTerms, notes: form.notes,
        lines: lines.map(l => ({ productId: l.productId, desc: l.desc, qty: l.qty, price: l.price, amount: l.amount })),
        pfRef: form.ref,
      }))
      // Mark proforma as converted
      await supabase.from('vouchers').update({ status: 'converted', notes: `Converted to ${siRef}` })
        .eq('ref', form.ref).eq('type', 'proforma')
      showToast(`Converting to Sales Invoice ${siRef}…`)
      setTimeout(() => onNav('sales-invoice'), 800)
    } catch (err: any) {
      showToast(err.message || 'Conversion failed', 'error')
    } finally { setConverting(false) }
  }

  return (
    <VoucherPage
      title="Proforma Invoice"
      icon=""
      subtitle="Price quotation — no GL or stock impact · Convert to Sales Invoice when confirmed"
      color="rgba(133,194,190,.12)"
      onPost={saveProforma}
      postLabel={posting ? 'Saving…' : 'Save Proforma'}
      extraActions={
        <button className="btn btn-primary btn-sm" style={{ background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={convertToInvoice} disabled={converting}>
          {converting ? 'Converting…' : 'Convert to Sales Invoice →'}
        </button>
      }
      journalNote="Proforma — no journal entries · No stock deduction · Informational only">

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Proforma Ref">
            <input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} />
          </FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Valid Until">
            <input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </FG>
        </div>
        <div className="form-row">
          <FG label="Customer Name" req><input className="form-input" placeholder="Customer or company name" value={form.customer} onChange={e => set('customer', e.target.value)} /></FG>
          <FG label="WhatsApp"><input className="form-input" placeholder="+255 7XX XXX XXX" value={form.wa} onChange={e => set('wa', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Payment Terms">
            <select className="form-input" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
              <option value="NET30">NET 30</option>
              <option value="NET14">NET 14</option>
              <option value="NET7">NET 7</option>
              <option value="COD">Cash on Delivery</option>
              <option value="PREPAY">Prepayment Required</option>
            </select>
          </FG>
          <FG label="Validity (days)"><input type="number" className="form-input" value={form.validity} onChange={e => set('validity', e.target.value)} /></FG>
        </div>
        <FG label="Notes / Special Instructions"><input className="form-input" placeholder="e.g. Prices valid for 7 days · Delivery not included" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Line Items</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
              <option value="">— Select product —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} · {tzs(p.selling_price)}</option>)}
            </select>
            <input type="number" className="form-input" style={{ textAlign: 'center' }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', textAlign: 'right' }} value={line.price} onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} />
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', desc: '', qty: 1, price: 0, amount: 0 }])}>+ Add line</button>

        {subtotal > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
            {[
              { label: 'Subtotal (excl. VAT)', val: tzs(net) },
              { label: 'VAT 18%', val: tzs(vat) },
              { label: 'Total (incl. VAT)', val: tzs(subtotal), bold: true, color: 'var(--accent)' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: item.bold ? 14 : 12 }}>
                <span style={{ color: 'var(--text3)' }}>{item.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: item.bold ? 700 : 400, color: item.color || 'var(--text)' }}>{item.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proforma notice */}
      <div style={{ background: 'rgba(133,194,190,.06)', border: '1px solid rgba(133,194,190,.2)', borderRadius: 10, padding: '12px 16px', marginTop: 12, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
        This is a <strong>Proforma Invoice</strong> — for quotation purposes only. No journal entries are created, no stock is deducted, and no accounts are affected. When the customer confirms, click <strong>"Convert to Sales Invoice"</strong> to post the actual invoice.
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
