import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { nextRef } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface ReturnLine { productId: string; name: string; qty: number; salePrice: number; costPrice: number; amount: number }

export default function SalesReturn({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<{id:string;name:string;cost_price:number;selling_price:number;qty_on_hand:number}[]>([])
  const [cashAccounts, setCashAccounts] = useState<{id:string;code:string;name:string}[]>([])
  const [lines, setLines] = useState<ReturnLine[]>([{ productId: '', name: '', qty: 1, salePrice: 0, costPrice: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: '', customer: '', wa: '', originalRef: '', reason: 'defective', refundMethod: 'cash', refundAccountId: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: prods }, { data: cash }, { count }] = await Promise.all([
      supabase.from('products').select('id, name, cost_price, selling_price, qty_on_hand').eq('is_active', true).order('name'),
      supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
      supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'sales_return'),
    ])
    if (prods) setProducts(prods)
    if (cash) {
      setCashAccounts(cash)
      // default to Cash till
      const cashTill = cash.find(a => a.code === '1010')
      if (cashTill) set('refundAccountId', cashTill.id)
    }
    set('ref', 'SR-10-????' + 1))
  }

  const updateLine = (i: number, field: keyof ReturnLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].name = p.name; nl[i].salePrice = p.selling_price; nl[i].costPrice = p.cost_price; nl[i].amount = nl[i].qty * p.selling_price }
    }
    if (field === 'qty') nl[i].amount = (val as number) * nl[i].salePrice
    setLines(nl)
  }

  const total = lines.reduce((s, l) => s + l.amount, 0)
  const cogsReversal = lines.reduce((s, l) => s + l.costPrice * l.qty, 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.customer.trim()) { showToast('Customer name required', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    if (form.refundMethod !== 'credit' && form.refundMethod !== 'exchange' && !form.refundAccountId) { showToast('Select refund account', 'error'); return }
    setPosting(true)
    try {
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['4050', '5010', '1110', '2020'])
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const returnsId = acct('4050')
      const cogsId = acct('5010')
      const inventoryId = acct('1110')
      const vatId = acct('2020')
      if (!returnsId || !cogsId || !inventoryId) throw new Error('Required accounts not found. Ensure 4050 Sales Returns exists in Chart of Accounts.')

      const vat = Math.round(total * 18 / 118)
      const netReturn = total - vat

      const { data: j, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Sales Return — ${form.customer} — ${form.ref}`,
        journal_type: 'sales_return', source_type: 'sales_return', source_ref: form.ref,
        posted_by: 'Joe Gembe', status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error(jErr.message)

      const jLines: any[] = [
        { journal_id: j.id, line_number: 1, account_id: returnsId, description: `Sales return — ${form.customer}`, debit: netReturn, credit: 0 },
      ]
      if (vatId) jLines.push({ journal_id: j.id, line_number: 2, account_id: vatId, description: `VAT reversal — ${form.ref}`, debit: vat, credit: 0 })
      // Cr Cash/AR — refund issued
      if (form.refundAccountId) {
        jLines.push({ journal_id: j.id, line_number: jLines.length + 1, account_id: form.refundAccountId, description: `Refund — ${form.customer}`, debit: 0, credit: total })
      }
      // Dr Inventory / Cr COGS — stock restored
      jLines.push({ journal_id: j.id, line_number: jLines.length + 1, account_id: inventoryId, description: `Stock restored — ${form.ref}`, debit: cogsReversal, credit: 0 })
      jLines.push({ journal_id: j.id, line_number: jLines.length + 1, account_id: cogsId, description: `COGS reversal — ${form.ref}`, debit: 0, credit: cogsReversal })

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'sales_return', posting_date: form.date,
        description: `Sales Return — ${form.customer}`,
        total_amount: total, status: 'posted', journal_id: j.id,
        notes: `${form.reason}${form.originalRef ? ' · Orig: ' + form.originalRef : ''}`,
        posted_by: 'Joe Gembe',
      })

      // Restore stock
      for (const line of lines) {
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand + line.qty }).eq('id', line.productId)
        await supabase.from('item_ledger_entries').insert({
          product_id: line.productId, entry_type: 'return',
          document_type: 'sales_return', document_ref: form.ref,
          posting_date: form.date, qty: line.qty, cost_amount: line.costPrice * line.qty,
        })
      }

      showToast(`${form.ref} posted · Dr Sales Returns / Cr Cash · Stock restored · ${tzs(total)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Sales Return" icon="" subtitle="Customer returns goods — reverses original sale" color="rgba(255,71,87,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Return'}
      journalNote="Dr Sales Returns (4050) · Cr Cash/AR · Dr Inventory (1110) · Cr COGS (5010) · Stock restored">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Return Ref" req><input className="form-input" value={form.ref} readOnly  /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Original Sale Ref"><input className="form-input" placeholder="CS-0042" value={form.originalRef} onChange={e => set('originalRef', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Customer Name" req><input className="form-input" value={form.customer} onChange={e => set('customer', e.target.value)} /></FG>
          <FG label="WhatsApp"><input className="form-input" placeholder="+255 7XX XXX XXX" value={form.wa} onChange={e => set('wa', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Return Reason">
            <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
              <option value="defective">Defective / Not Working</option>
              <option value="wrong">Wrong Item Delivered</option>
              <option value="changed">Customer Changed Mind</option>
              <option value="damaged">Damaged in Transit</option>
            </select>
          </FG>
          <FG label="Refund Method">
            <select className="form-input" value={form.refundMethod} onChange={e => set('refundMethod', e.target.value)}>
              <option value="cash">Cash Refund</option>
              <option value="mpesa">M-Pesa Refund</option>
              <option value="credit">Store Credit</option>
              <option value="exchange">Exchange Only</option>
            </select>
          </FG>
        </div>
        {form.refundMethod !== 'credit' && form.refundMethod !== 'exchange' && (
          <FG label="Refund From Account" req>
            <select className="form-input" value={form.refundAccountId} onChange={e => set('refundAccountId', e.target.value)}>
              <option value="">— Select account —</option>
              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FG>
        )}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Items Returned</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
              <option value="">— Select product —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} · {tzs(p.selling_price)}</option>)}
            </select>
            <input type="number" className="form-input" style={{ textAlign: 'center' }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, salePrice: 0, costPrice: 0, amount: 0 }])}>+ Add item</button>
        {total > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
            <span>Refund Total</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{tzs(total)}</span>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
