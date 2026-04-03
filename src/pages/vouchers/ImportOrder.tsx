import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import { FG } from '../../components/FormHelpers'
import { tzs, today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface DBSupplier { id: string; code: string; name: string; balance_tzs: number }
interface DBProduct { id: string; name: string; sku: string; cost_price: number }
interface DBAccount { id: string; code: string; name: string; category: string; type: string }

interface ImportOrder {
  id: string; ref: string; supplier_id: string; status: string
  order_date: string; expected_ready_date: string
  currency: string; fx_rate: number
  total_usd: number; total_tzs: number; total_freight_tzs: number; total_landed_tzs: number
  notes: string; created_by: string; created_at: string
  suppliers?: { name: string; code: string } | null
}

interface OrderLine {
  id?: string; order_id?: string; line_number: number
  product_id: string; description: string; qty: number
  unit_cost_usd: number; unit_cost_tzs: number
  subtotal_usd: number; subtotal_tzs: number
  qty_received: number; landed_unit_cost_tzs: number
}

interface Payment {
  id?: string; order_id?: string; payment_type: string
  payment_date: string; amount_tzs: number
  bank_account_id: string; agent_name: string
  reference: string; notes: string; journal_id?: string; voucher_ref?: string
}

interface Shipment {
  id?: string; order_id?: string; shipment_number: number
  method: string; agent_name: string; tracking_ref: string
  ship_date: string; expected_arrival: string; actual_arrival: string
  freight_cost_tzs: number; freight_paid: boolean; status: string; notes: string
  import_shipment_lines?: ShipmentLine[]
}

interface ShipmentLine {
  id?: string; shipment_id?: string; order_line_id: string
  qty_shipped: number; qty_received: number
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'plus')    return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'back')    return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'ship')    return <svg {...p}><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
  if (n === 'check')   return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  if (n === 'dollar')  return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  if (n === 'box')     return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'pill-gray', deposit_paid: 'pill-amber', balance_paid: 'pill-blue',
  shipped: 'pill-blue', partially_received: 'pill-amber', received: 'pill-green', closed: 'pill-green'
}

const EMPTY_LINE: OrderLine = {
  line_number: 1, product_id: '', description: '', qty: 1,
  unit_cost_usd: 0, unit_cost_tzs: 0, subtotal_usd: 0, subtotal_tzs: 0,
  qty_received: 0, landed_unit_cost_tzs: 0
}

export default function ImportOrder({ onNav: _onNav }: Props) {
  const { isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  // Data
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  const [products, setProducts] = useState<DBProduct[]>([])
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [orders, setOrders] = useState<ImportOrder[]>([])
  const [loading, setLoading] = useState(true)

  // Views: list | detail | create
  const [view, setView] = useState<'list' | 'detail' | 'create'>('list')
  const [activeOrder, setActiveOrder] = useState<ImportOrder | null>(null)
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])

  // Create form
  const [form, setForm] = useState({
    supplier: '', orderDate: today(), expectedReady: '',
    currency: 'USD', fxRate: '2500', notes: ''
  })
  const [lines, setLines] = useState<OrderLine[]>([{ ...EMPTY_LINE }])
  const [saving, setSaving] = useState(false)

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false)
  const [payType, setPayType] = useState<'supplier_deposit' | 'supplier_balance' | 'forwarding_agent'>('supplier_deposit')
  const [payForm, setPayForm] = useState({ date: today(), amount: '', bankAccount: '', agentName: '', agentSupplierId: '', reference: '', notes: '', currency: 'TZS', fxRate: '1' })
  const [payPosting, setPayPosting] = useState(false)

  // Shipment modal
  const [showShipModal, setShowShipModal] = useState(false)
  const [shipForm, setShipForm] = useState({ method: 'sea', agentName: '', trackingRef: '', shipDate: today(), expectedArrival: '', freightCost: '', notes: '' })
  const [shipLines, setShipLines] = useState<{ orderLineId: string; qty: number }[]>([])

  // Receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveShipmentId, setReceiveShipmentId] = useState('')
  const [receiveLines, setReceiveLines] = useState<{ shipmentLineId: string; orderLineId: string; qtyShipped: number; qtyReceive: number; desc: string }[]>([])

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setPayF = (k: string, v: string) => setPayForm(f => ({ ...f, [k]: v }))

  const bankAccounts = accounts.filter(a =>
    a.category === 'Cash & Bank' || a.category?.toLowerCase().includes('cash')
    || a.category?.toLowerCase().includes('bank')
    || (a.type === 'asset' && /^10[1-4]/.test(a.code))
  )

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [s, p, a, o] = await Promise.all([
      supabase.from('suppliers').select('id, code, name, balance_tzs').eq('is_active', true).order('name'),
      supabase.from('products').select('id, name, sku, cost_price').eq('is_active', true).order('name'),
      supabase.from('accounts').select('id, code, name, category, type').eq('is_active', true).order('code'),
      supabase.from('import_orders').select('*, suppliers(name, code)').order('created_at', { ascending: false }),
    ])
    if (s.data) setSuppliers(s.data as DBSupplier[])
    if (p.data) setProducts(p.data as DBProduct[])
    if (a.data) setAccounts(a.data as DBAccount[])
    if (o.data) setOrders(o.data as ImportOrder[])
    setLoading(false)
  }

  const loadOrderDetail = async (order: ImportOrder) => {
    setActiveOrder(order)
    const [lRes, pRes, sRes] = await Promise.all([
      supabase.from('import_order_lines').select('*').eq('order_id', order.id).order('line_number'),
      supabase.from('import_payments').select('*').eq('order_id', order.id).order('payment_date'),
      supabase.from('import_shipments').select('*, import_shipment_lines(*)').eq('order_id', order.id).order('shipment_number'),
    ])
    if (lRes.data) setOrderLines(lRes.data as OrderLine[])
    if (pRes.data) setPayments(pRes.data as Payment[])
    if (sRes.data) setShipments(sRes.data as Shipment[])
    setView('detail')
  }

  // ── CREATE ORDER ──────────────────────────────────────
  const generateRef = async (): Promise<string> => {
    const pattern = 'IMP-10-'
    const { data } = await supabase.from('import_orders').select('ref').like('ref', `${pattern}%`).order('ref', { ascending: false }).limit(1)
    let seq = 1
    if (data && data.length > 0) {
      seq = (parseInt((data[0].ref as string).replace(pattern, '')) || 0) + 1
    }
    return `${pattern}${String(seq).padStart(4, '0')}`
  }

  const updateLine = (i: number, field: keyof OrderLine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val as never }
    const rate = parseFloat(form.fxRate) || 2500
    if (field === 'product_id') {
      const pr = products.find(pp => pp.id === val)
      if (pr) { nl[i].description = pr.name }
    }
    if (field === 'qty' || field === 'unit_cost_usd') {
      nl[i].subtotal_usd = nl[i].qty * nl[i].unit_cost_usd
      nl[i].unit_cost_tzs = nl[i].unit_cost_usd * rate
      nl[i].subtotal_tzs = nl[i].subtotal_usd * rate
    }
    setLines(nl)
  }

  const recalcLines = (rate: number) => {
    setLines(prev => prev.map(l => ({
      ...l,
      unit_cost_tzs: l.unit_cost_usd * rate,
      subtotal_tzs: l.subtotal_usd * rate,
    })))
  }

  const totalUsd = lines.reduce((s, l) => s + l.subtotal_usd, 0)
  const totalTzs = lines.reduce((s, l) => s + l.subtotal_tzs, 0)

  const saveOrder = async () => {
    if (!form.supplier) { showToast('Select a supplier', 'error'); return }
    if (lines.every(l => !l.description && !l.product_id)) { showToast('Add at least one product', 'error'); return }
    if (totalUsd <= 0) { showToast('Total must be greater than zero', 'error'); return }
    setSaving(true)
    try {
      const ref = await generateRef()
      const { data: order, error: oErr } = await supabase.from('import_orders').insert({
        ref, supplier_id: form.supplier, status: 'draft',
        order_date: form.orderDate, expected_ready_date: form.expectedReady || null,
        currency: form.currency, fx_rate: parseFloat(form.fxRate) || 2500,
        total_usd: totalUsd, total_tzs: totalTzs,
        total_freight_tzs: 0, total_landed_tzs: totalTzs,
        notes: form.notes || null, created_by: 'Joe Gembe',
      }).select('id').single()
      if (oErr) throw new Error(oErr.message)

      const linePayloads = lines.filter(l => l.description || l.product_id).map((l, i) => ({
        order_id: order.id, line_number: i + 1,
        product_id: l.product_id || null, description: l.description,
        qty: l.qty, unit_cost_usd: l.unit_cost_usd, unit_cost_tzs: l.unit_cost_tzs,
        subtotal_usd: l.subtotal_usd, subtotal_tzs: l.subtotal_tzs,
        qty_received: 0, landed_unit_cost_tzs: 0,
      }))
      const { error: lErr } = await supabase.from('import_order_lines').insert(linePayloads)
      if (lErr) throw new Error(lErr.message)

      showToast(`${ref} created`)
      await loadAll()
      const fullOrder = (await supabase.from('import_orders').select('*, suppliers(name, code)').eq('id', order.id).single()).data
      if (fullOrder) await loadOrderDetail(fullOrder as ImportOrder)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally { setSaving(false) }
  }

  // ── RECORD PAYMENT ────────────────────────────────────
  const recordPayment = async () => {
    if (!activeOrder) return
    const rawAmount = parseFloat(payForm.amount)
    if (!rawAmount || rawAmount <= 0) { showToast('Enter amount', 'error'); return }
    const fxRate = parseFloat(payForm.fxRate) || 1
    const amount = payForm.currency === 'TZS' ? rawAmount : rawAmount * fxRate
    if (!payForm.bankAccount) { showToast('Select bank account', 'error'); return }

    const dateCheck = await validatePostingDate(payForm.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    setPayPosting(true)
    try {
      // Find accounts
      const bankAcct = accounts.find(a => a.id === payForm.bankAccount)
      if (!bankAcct) throw new Error('Bank account not found')

      // Determine debit account based on payment type
      // Supplier payments: Dr Supplier Advance (use 1122 or create one) or Dr AP if balance
      // Forwarding agent: Dr GRN Interim (1121) — becomes part of landed cost
      let drAccountCode = '1121' // default to GRN Interim
      if (payType === 'supplier_deposit' || payType === 'supplier_balance') {
        drAccountCode = '1121' // supplier prepayment goes to GRN Interim
      }
      const drAcct = accounts.find(a => a.code === drAccountCode)
      if (!drAcct) throw new Error(`Account ${drAccountCode} not found`)

      const currencyNote = payForm.currency !== 'TZS' ? ` (${payForm.currency} ${rawAmount.toLocaleString()} @ ${fxRate})` : ''
      const desc = payType === 'forwarding_agent'
        ? `Import freight — ${payForm.agentName || 'Agent'} — ${activeOrder.ref}${currencyNote}`
        : `Import ${payType.replace('_', ' ')} — ${activeOrder.ref}${currencyNote}`

      // Create journal: Dr GRN Interim / Cr Bank
      const { data: journal, error: jErr } = await supabase.from('journals').insert({
        ref: `JV-${activeOrder.ref}-${payType.charAt(0).toUpperCase()}${payments.length + 1}`,
        posting_date: payForm.date,
        description: desc,
        journal_type: 'import_payment',
        source_type: 'import_order',
        source_ref: activeOrder.ref,
        posted_by: 'Joe Gembe',
        status: 'posted',
      }).select('id').single()
      if (jErr) throw new Error(jErr.message)

      await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: drAcct.id, description: desc, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: payForm.bankAccount, description: `Bank paid — ${desc}`, debit: 0, credit: amount },
      ])

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: drAcct.id, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: payForm.bankAccount, p_debit: 0, p_credit: amount }),
      ])

      // Vendor ledger entry for supplier payments
      if (payType !== 'forwarding_agent' && activeOrder.supplier_id) {
        await supabase.from('vendor_ledger_entries').insert({
          supplier_id: activeOrder.supplier_id,
          posting_date: payForm.date,
          document_type: 'payment',
          document_ref: activeOrder.ref,
          description: desc,
          amount_tzs: -amount,
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
          import_order_ref: activeOrder.ref,
        })
        // Update supplier balance
        const sup = suppliers.find(s => s.id === activeOrder.supplier_id)
        if (sup) {
          await supabase.from('suppliers').update({ balance_tzs: (sup.balance_tzs || 0) - amount }).eq('id', activeOrder.supplier_id)
        }
      }

      // Vendor ledger entry for forwarding agent (if linked to a supplier)
      if (payType === 'forwarding_agent' && payForm.agentSupplierId) {
        await supabase.from('vendor_ledger_entries').insert({
          supplier_id: payForm.agentSupplierId,
          posting_date: payForm.date,
          document_type: 'payment',
          document_ref: activeOrder.ref,
          description: desc,
          amount_tzs: -amount,
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
          import_order_ref: activeOrder.ref,
        })
        // Update agent supplier balance
        const agentSup = suppliers.find(s => s.id === payForm.agentSupplierId)
        if (agentSup) {
          await supabase.from('suppliers').update({ balance_tzs: (agentSup.balance_tzs || 0) - amount }).eq('id', payForm.agentSupplierId)
        }
      }

      // Save payment record
      await supabase.from('import_payments').insert({
        order_id: activeOrder.id, payment_type: payType,
        payment_date: payForm.date, amount_tzs: amount,
        bank_account_id: payForm.bankAccount,
        agent_name: payType === 'forwarding_agent' ? (suppliers.find(s => s.id === payForm.agentSupplierId)?.name || payForm.agentName || null) : null,
        reference: payForm.reference || null, notes: payForm.notes || null,
        journal_id: journal.id,
      })

      // Update order totals
      const allPayments = [...payments, { amount_tzs: amount, payment_type: payType } as Payment]
      const totalFreight = allPayments.filter(p => p.payment_type === 'forwarding_agent').reduce((s, p) => s + p.amount_tzs, 0)
      const totalLanded = activeOrder.total_tzs + totalFreight

      let newStatus = activeOrder.status
      const supplierPayments = allPayments.filter(p => p.payment_type !== 'forwarding_agent').reduce((s, p) => s + p.amount_tzs, 0)
      if (supplierPayments >= activeOrder.total_tzs && newStatus === 'draft') newStatus = 'balance_paid'
      else if (supplierPayments > 0 && newStatus === 'draft') newStatus = 'deposit_paid'

      await supabase.from('import_orders').update({
        total_freight_tzs: totalFreight, total_landed_tzs: totalLanded, status: newStatus
      }).eq('id', activeOrder.id)

      showToast(`Payment recorded — ${tzs(amount)}`)
      setShowPayModal(false)
      setPayForm({ date: today(), amount: '', bankAccount: '', agentName: '', agentSupplierId: '', reference: '', notes: '', currency: 'TZS', fxRate: '1' })
      const refreshed = (await supabase.from('import_orders').select('*, suppliers(name, code)').eq('id', activeOrder.id).single()).data
      if (refreshed) await loadOrderDetail(refreshed as ImportOrder)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally { setPayPosting(false) }
  }

  // ── ADD SHIPMENT ──────────────────────────────────────
  const addShipment = async () => {
    if (!activeOrder) return
    if (shipLines.every(l => l.qty <= 0)) { showToast('Add quantities to ship', 'error'); return }
    try {
      const num = shipments.length + 1
      const { data: shipment, error: sErr } = await supabase.from('import_shipments').insert({
        order_id: activeOrder.id, shipment_number: num,
        method: shipForm.method, agent_name: shipForm.agentName || null,
        tracking_ref: shipForm.trackingRef || null,
        ship_date: shipForm.shipDate || null, expected_arrival: shipForm.expectedArrival || null,
        freight_cost_tzs: parseFloat(shipForm.freightCost) || 0,
        status: 'in_transit', notes: shipForm.notes || null,
      }).select('id').single()
      if (sErr) throw new Error(sErr.message)

      const slPayloads = shipLines.filter(l => l.qty > 0).map(l => ({
        shipment_id: shipment.id, order_line_id: l.orderLineId,
        qty_shipped: l.qty, qty_received: 0,
      }))
      await supabase.from('import_shipment_lines').insert(slPayloads)

      // Update order status
      await supabase.from('import_orders').update({ status: 'shipped' }).eq('id', activeOrder.id)

      showToast(`Shipment #${num} (${shipForm.method}) added`)
      setShowShipModal(false)
      const refreshed = (await supabase.from('import_orders').select('*, suppliers(name, code)').eq('id', activeOrder.id).single()).data
      if (refreshed) await loadOrderDetail(refreshed as ImportOrder)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  // ── RECEIVE SHIPMENT ──────────────────────────────────
  const receiveShipment = async () => {
    if (!activeOrder || !receiveShipmentId) return
    try {
      // Update shipment lines qty_received
      for (const rl of receiveLines) {
        if (rl.qtyReceive > 0) {
          await supabase.from('import_shipment_lines').update({ qty_received: rl.qtyReceive }).eq('id', rl.shipmentLineId)
          // Update order line qty_received
          const ol = orderLines.find(l => l.id === rl.orderLineId)
          if (ol) {
            const newQtyRcvd = (ol.qty_received || 0) + rl.qtyReceive
            await supabase.from('import_order_lines').update({ qty_received: newQtyRcvd }).eq('id', rl.orderLineId)
            // Update product stock
            if (ol.product_id) {
              const { data: prod } = await supabase.from('products').select('qty').eq('id', ol.product_id).single()
              if (prod) {
                await supabase.from('products').update({ qty: (prod.qty || 0) + rl.qtyReceive }).eq('id', ol.product_id)
              }
            }
          }
        }
      }

      // Mark shipment as received
      await supabase.from('import_shipments').update({ status: 'received', actual_arrival: today() }).eq('id', receiveShipmentId)

      // Check if all lines fully received
      const { data: freshLines } = await supabase.from('import_order_lines').select('qty, qty_received').eq('order_id', activeOrder.id)
      const allReceived = freshLines?.every(l => l.qty_received >= l.qty)
      await supabase.from('import_orders').update({
        status: allReceived ? 'received' : 'partially_received'
      }).eq('id', activeOrder.id)

      // Recalculate landed cost per unit
      const { data: allPayments } = await supabase.from('import_payments').select('amount_tzs').eq('order_id', activeOrder.id)
      const totalPaid = (allPayments || []).reduce((s: number, p: { amount_tzs: number }) => s + p.amount_tzs, 0)
      const totalQty = (freshLines || []).reduce((s: number, l: { qty: number }) => s + l.qty, 0)
      if (totalQty > 0 && freshLines) {
        const unitLanded = totalPaid / totalQty
        await supabase.from('import_order_lines').update({ landed_unit_cost_tzs: unitLanded }).eq('order_id', activeOrder.id)
      }

      showToast('Shipment received! Stock updated.')
      setShowReceiveModal(false)
      const refreshed = (await supabase.from('import_orders').select('*, suppliers(name, code)').eq('id', activeOrder.id).single()).data
      if (refreshed) await loadOrderDetail(refreshed as ImportOrder)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  // ── DETAIL VIEW ───────────────────────────────────────
  if (view === 'detail' && activeOrder) {
    const totalPaid = payments.reduce((s, p) => s + p.amount_tzs, 0)
    const supplierPaid = payments.filter(p => p.payment_type !== 'forwarding_agent').reduce((s, p) => s + p.amount_tzs, 0)
    const freightPaid = payments.filter(p => p.payment_type === 'forwarding_agent').reduce((s, p) => s + p.amount_tzs, 0)
    const totalQtyOrdered = orderLines.reduce((s, l) => s + l.qty, 0)
    const totalQtyReceived = orderLines.reduce((s, l) => s + l.qty_received, 0)
    const landedPerUnit = totalQtyOrdered > 0 ? totalPaid / totalQtyOrdered : 0

    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); loadAll() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic n="back" /> Orders
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 10px', borderRadius: 6 }}>{activeOrder.ref}</span>
                <span className={`pill ${STATUS_COLORS[activeOrder.status] || 'pill-gray'}`} style={{ fontSize: 9, textTransform: 'uppercase' }}>{activeOrder.status.replace(/_/g, ' ')}</span>
              </div>
              <div className="page-sub">{activeOrder.suppliers?.name || 'Unknown'} · Ordered {activeOrder.order_date}</div>
            </div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => { setPayType('supplier_deposit'); setShowPayModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="dollar" s={13} /> Pay</button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setShipForm({ method: 'sea', agentName: '', trackingRef: '', shipDate: today(), expectedArrival: '', freightCost: '', notes: '' })
              setShipLines(orderLines.map(l => ({ orderLineId: l.id!, qty: l.qty - l.qty_received })))
              setShowShipModal(true)
            }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="ship" s={13} /> Add Shipment</button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Order Total', val: tzs(activeOrder.total_tzs), sub: `USD ${activeOrder.total_usd.toLocaleString()} @ ${activeOrder.fx_rate}` },
            { label: 'Supplier Paid', val: tzs(supplierPaid), color: supplierPaid >= activeOrder.total_tzs ? 'var(--green)' : 'var(--yellow)' },
            { label: 'Freight Paid', val: tzs(freightPaid), color: 'var(--blue)' },
            { label: 'Landed Cost', val: tzs(totalPaid), sub: `${tzs(Math.round(landedPerUnit))}/unit` },
            { label: 'Received', val: `${totalQtyReceived} / ${totalQtyOrdered}`, color: totalQtyReceived >= totalQtyOrdered ? 'var(--green)' : 'var(--yellow)' },
          ].map(item => (
            <div key={item.label} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: (item as { color?: string }).color || 'var(--text)' }}>{item.val}</div>
              {(item as { sub?: string }).sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{(item as { sub?: string }).sub}</div>}
            </div>
          ))}
        </div>

        {/* Order Lines */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Order Lines</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Description</th><th className="td-right">Qty</th><th className="td-right">Unit (USD)</th><th className="td-right">Subtotal (TZS)</th><th className="td-right">Received</th><th>Status</th></tr></thead>
              <tbody>
                {orderLines.map(l => (
                  <tr key={l.id}>
                    <td className="td-mono" style={{ fontSize: 11 }}>{products.find(p => p.id === l.product_id)?.sku || ''}</td>
                    <td style={{ fontSize: 12 }}>{l.description}</td>
                    <td className="td-right td-mono">{l.qty}</td>
                    <td className="td-right td-mono">${l.unit_cost_usd.toFixed(2)}</td>
                    <td className="td-right td-mono">{tzs(l.subtotal_tzs)}</td>
                    <td className="td-right td-mono" style={{ fontWeight: 700, color: l.qty_received >= l.qty ? 'var(--green)' : 'var(--yellow)' }}>{l.qty_received} / {l.qty}</td>
                    <td><span className={`pill ${l.qty_received >= l.qty ? 'pill-green' : l.qty_received > 0 ? 'pill-amber' : 'pill-gray'}`} style={{ fontSize: 9 }}>{l.qty_received >= l.qty ? 'Complete' : l.qty_received > 0 ? 'Partial' : 'Pending'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payments */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Payments ({payments.length})</div>
          {payments.length === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>No payments yet. Click "Pay" to record a payment.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Agent</th><th>Reference</th><th className="td-right">Amount (TZS)</th></tr></thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ fontSize: 11 }}>{p.payment_date}</td>
                      <td><span className={`pill ${p.payment_type === 'forwarding_agent' ? 'pill-blue' : 'pill-amber'}`} style={{ fontSize: 9, textTransform: 'capitalize' }}>{p.payment_type.replace(/_/g, ' ')}</span></td>
                      <td style={{ fontSize: 11 }}>{p.agent_name || ''}</td>
                      <td className="td-mono" style={{ fontSize: 11 }}>{p.reference || ''}</td>
                      <td className="td-right td-mono" style={{ fontWeight: 700 }}>{tzs(p.amount_tzs)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ background: 'var(--surface2)', fontWeight: 700 }}><td colSpan={4}>Total Paid</td><td className="td-right td-mono" style={{ fontSize: 14 }}>{tzs(totalPaid)}</td></tr></tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Shipments */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Shipments ({shipments.length})</div>
          {shipments.length === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>No shipments yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shipments.map(sh => (
                <div key={sh.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>Shipment #{sh.shipment_number}</span>
                      <span className={`pill ${sh.method === 'air' ? 'pill-amber' : 'pill-blue'}`} style={{ fontSize: 9, textTransform: 'uppercase' }}>{sh.method}</span>
                      <span className={`pill ${sh.status === 'received' ? 'pill-green' : sh.status === 'in_transit' ? 'pill-blue' : 'pill-gray'}`} style={{ fontSize: 9, textTransform: 'capitalize' }}>{sh.status}</span>
                    </div>
                    {sh.status !== 'received' && (
                      <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                        onClick={() => {
                          setReceiveShipmentId(sh.id!)
                          setReceiveLines((sh.import_shipment_lines || []).map(sl => ({
                            shipmentLineId: sl.id!,
                            orderLineId: sl.order_line_id,
                            qtyShipped: sl.qty_shipped,
                            qtyReceive: sl.qty_shipped - sl.qty_received,
                            desc: orderLines.find(ol => ol.id === sl.order_line_id)?.description || '',
                          })))
                          setShowReceiveModal(true)
                        }}>
                        <Ic n="check" s={12} c="#fff" /> Receive
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 16 }}>
                    {sh.agent_name && <span>Agent: {sh.agent_name}</span>}
                    {sh.tracking_ref && <span>Track: {sh.tracking_ref}</span>}
                    {sh.ship_date && <span>Shipped: {sh.ship_date}</span>}
                    {sh.expected_arrival && <span>ETA: {sh.expected_arrival}</span>}
                    {sh.actual_arrival && <span>Arrived: {sh.actual_arrival}</span>}
                    {sh.freight_cost_tzs > 0 && <span>Freight: {tzs(sh.freight_cost_tzs)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── PAYMENT MODAL ── */}
        {showPayModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPayModal(false)}>
            <div className="card" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
              <div className="card-title" style={{ marginBottom: 16 }}>Record Payment — {activeOrder.ref}</div>
              <FG label="Payment Type" req>
                <select className="form-input" value={payType} onChange={e => setPayType(e.target.value as typeof payType)}>
                  <option value="supplier_deposit">Supplier Deposit (30-50%)</option>
                  <option value="supplier_balance">Supplier Balance Payment</option>
                  <option value="forwarding_agent">Forwarding Agent Fee</option>
                </select>
              </FG>
              <div className="form-row">
                <FG label="Currency" req>
                  <select className="form-input" value={payForm.currency} onChange={e => {
                    setPayF('currency', e.target.value)
                    if (e.target.value === 'TZS') setPayF('fxRate', '1')
                    else if (e.target.value === 'USD') setPayF('fxRate', String(activeOrder?.fx_rate || 2500))
                    else if (e.target.value === 'RMB') setPayF('fxRate', '365')
                  }}>
                    <option value="TZS">TZS (Tanzanian Shilling)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="RMB">RMB (Chinese Yuan)</option>
                  </select>
                </FG>
                {payForm.currency !== 'TZS' && (
                  <FG label={`FX Rate (TZS per ${payForm.currency})`} req>
                    <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} value={payForm.fxRate} onChange={e => setPayF('fxRate', e.target.value)} />
                  </FG>
                )}
              </div>
              <div className="form-row">
                <FG label={`Amount (${payForm.currency})`} req>
                  <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }} value={payForm.amount} onChange={e => setPayF('amount', e.target.value)} placeholder="0" />
                </FG>
                <FG label="Date" req>
                  <input type="date" className="form-input" value={payForm.date} onChange={e => setPayF('date', e.target.value)} />
                </FG>
              </div>
              <FG label="Bank Account" req>
                <select className="form-input" value={payForm.bankAccount} onChange={e => setPayF('bankAccount', e.target.value)}>
                  <option value="">— Select —</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </FG>
              {payType === 'forwarding_agent' && (
                <FG label="Forwarding Agent (from Suppliers)" req>
                  <select className="form-input" value={payForm.agentSupplierId} onChange={e => setPayF('agentSupplierId', e.target.value)}>
                    <option value="">— Select forwarding agent —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                  </select>
                </FG>
              )}
              <FG label="Reference"><input className="form-input" value={payForm.reference} onChange={e => setPayF('reference', e.target.value)} placeholder="Bank ref or receipt no" /></FG>
              {payForm.currency !== 'TZS' && payForm.amount && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 4 }}>
                  {payForm.currency} {parseFloat(payForm.amount).toLocaleString()} × {payForm.fxRate} = <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{tzs(parseFloat(payForm.amount) * (parseFloat(payForm.fxRate) || 1))}</span> (posted amount)
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowPayModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={recordPayment} disabled={payPosting}>{payPosting ? 'Posting…' : 'Record Payment'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── SHIPMENT MODAL ── */}
        {showShipModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowShipModal(false)}>
            <div className="card" style={{ width: 540, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="card-title" style={{ marginBottom: 16 }}>Add Shipment — {activeOrder.ref}</div>
              <div className="form-row">
                <FG label="Method" req>
                  <select className="form-input" value={shipForm.method} onChange={e => setShipForm(f => ({ ...f, method: e.target.value }))}>
                    <option value="sea">Sea Cargo</option>
                    <option value="air">Air Cargo</option>
                  </select>
                </FG>
                <FG label="Agent Name"><input className="form-input" value={shipForm.agentName} onChange={e => setShipForm(f => ({ ...f, agentName: e.target.value }))} placeholder="Forwarding agent" /></FG>
              </div>
              <div className="form-row">
                <FG label="Ship Date"><input type="date" className="form-input" value={shipForm.shipDate} onChange={e => setShipForm(f => ({ ...f, shipDate: e.target.value }))} /></FG>
                <FG label="Expected Arrival"><input type="date" className="form-input" value={shipForm.expectedArrival} onChange={e => setShipForm(f => ({ ...f, expectedArrival: e.target.value }))} /></FG>
              </div>
              <FG label="Tracking Reference"><input className="form-input" value={shipForm.trackingRef} onChange={e => setShipForm(f => ({ ...f, trackingRef: e.target.value }))} /></FG>
              <FG label="Estimated Freight (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} value={shipForm.freightCost} onChange={e => setShipForm(f => ({ ...f, freightCost: e.target.value }))} placeholder="0" /></FG>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text3)', textTransform: 'uppercase' }}>Quantities in this shipment</div>
                {shipLines.map((sl, i) => {
                  const ol = orderLines.find(l => l.id === sl.orderLineId)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1, fontSize: 12 }}>{ol?.description || ''}</span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>of {ol?.qty || 0}</span>
                      <input type="number" className="form-input" style={{ width: 80, fontSize: 12, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--mono)' }}
                        value={sl.qty} min={0} max={ol ? ol.qty - ol.qty_received : 999}
                        onChange={e => { const nl = [...shipLines]; nl[i] = { ...nl[i], qty: parseInt(e.target.value) || 0 }; setShipLines(nl) }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowShipModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={addShipment}>Add Shipment</button>
              </div>
            </div>
          </div>
        )}

        {/* ── RECEIVE MODAL ── */}
        {showReceiveModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowReceiveModal(false)}>
            <div className="card" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
              <div className="card-title" style={{ marginBottom: 16 }}>Receive Shipment</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Enter quantities received for each product. Stock will be updated.</div>
              {receiveLines.map((rl, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 12 }}>{rl.desc}</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>shipped: {rl.qtyShipped}</span>
                  <input type="number" className="form-input" style={{ width: 80, fontSize: 12, padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--mono)' }}
                    value={rl.qtyReceive} min={0} max={rl.qtyShipped}
                    onChange={e => { const nl = [...receiveLines]; nl[i] = { ...nl[i], qtyReceive: parseInt(e.target.value) || 0 }; setReceiveLines(nl) }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowReceiveModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={receiveShipment}><Ic n="check" s={13} c="#fff" /> Confirm Received</button>
              </div>
            </div>
          </div>
        )}

        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── CREATE VIEW ───────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="back" /> Orders</button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
            <div className="page-title">New Import Order</div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-primary" onClick={saveOrder} disabled={saving}>{saving ? 'Creating…' : 'Create Order'}</button>
          </div>
        </div>

        <div className="grid g2" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Order Details</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e => setF('supplier', e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FG>
            <div className="form-row">
              <FG label="Order Date" req><input type="date" className="form-input" value={form.orderDate} onChange={e => setF('orderDate', e.target.value)} /></FG>
              <FG label="Expected Ready Date"><input type="date" className="form-input" value={form.expectedReady} onChange={e => setF('expectedReady', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Currency"><input className="form-input" value={form.currency} onChange={e => setF('currency', e.target.value)} /></FG>
              <FG label="FX Rate (TZS per USD)" req>
                <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} value={form.fxRate} onChange={e => { setF('fxRate', e.target.value); recalcLines(parseFloat(e.target.value) || 2500) }} />
              </FG>
            </div>
            <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} /></FG>
          </div>

          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Order Summary</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>USD {totalUsd.toFixed(2)}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 15, color: 'var(--text3)' }}>{tzs(totalTzs)} @ {form.fxRate}</div>
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', lineHeight: 1.8 }}>
              After creating, you can record payments (deposit, balance, freight) and add shipments from the order detail page.
            </div>
          </div>
        </div>

        {/* Product lines */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Order Lines</div>
          <div className="table-wrap" style={{ marginBottom: 8 }}>
            <table>
              <thead><tr><th>Product</th><th>Description</th><th style={{ width: 70, textAlign: 'center' }}>Qty</th><th style={{ width: 120, textAlign: 'right' }}>Unit (USD)</th><th style={{ width: 140, textAlign: 'right' }}>Subtotal (TZS)</th><th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td>
                      <select className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                        <option value="">— Select —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                      </select>
                    </td>
                    <td><input className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Description" /></td>
                    <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'center' }} value={line.qty} min={1} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                    <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.unit_cost_usd} step="0.01" onChange={e => updateLine(i, 'unit_cost_usd', parseFloat(e.target.value) || 0)} /></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{Math.round(line.subtotal_tzs).toLocaleString()}</td>
                    <td><button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { ...EMPTY_LINE, line_number: lines.length + 1 }])}>+ Add Line</button>
        </div>
        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Import Orders</div>
          <div className="page-sub">China/India imports · Payments · Shipments · Receiving</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadAll} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            setForm({ supplier: '', orderDate: today(), expectedReady: '', currency: 'USD', fxRate: '2500', notes: '' })
            setLines([{ ...EMPTY_LINE }])
            setView('create')
          }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="plus" s={13} /> New Import Order</button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No import orders yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Click "New Import Order" to start tracking a purchase from China or India.</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ref</th><th>Supplier</th><th>Date</th><th>Status</th><th className="td-right">Total (USD)</th><th className="td-right">Total (TZS)</th><th className="td-right">Landed (TZS)</th></tr></thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => loadOrderDetail(o)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="td-mono td-amber" style={{ fontSize: 12, fontWeight: 700 }}>{o.ref}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{o.suppliers?.name || ''}</td>
                    <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{o.order_date}</td>
                    <td><span className={`pill ${STATUS_COLORS[o.status] || 'pill-gray'}`} style={{ fontSize: 9, textTransform: 'uppercase' }}>{o.status.replace(/_/g, ' ')}</span></td>
                    <td className="td-right td-mono" style={{ fontSize: 12 }}>${o.total_usd.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ fontSize: 12 }}>{tzs(o.total_tzs)}</td>
                    <td className="td-right td-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{tzs(o.total_landed_tzs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
