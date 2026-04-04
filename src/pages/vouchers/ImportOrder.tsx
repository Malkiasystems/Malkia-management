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
interface DBProduct { id: string; name: string; sku: string; cost_price: number; qty: number }
interface DBAccount { id: string; code: string; name: string; category: string; type: string }
interface ImportOrder { id: string; ref: string; supplier_id: string; status: string; order_date: string; expected_ready_date: string; currency: string; fx_rate: number; total_usd: number; total_tzs: number; total_freight_tzs: number; total_landed_tzs: number; notes: string; created_by: string; created_at: string; suppliers?: { name: string; code: string } | null }
interface OrderLine { id?: string; order_id?: string; line_number: number; product_id: string; description: string; qty: number; unit_cost_usd: number; unit_cost_tzs: number; subtotal_usd: number; subtotal_tzs: number; qty_received: number; landed_unit_cost_tzs: number }
interface Payment { id?: string; order_id?: string; payment_type: string; payment_date: string; amount_tzs: number; bank_account_id: string; agent_name: string; reference: string; notes: string; journal_id?: string }
interface Shipment { id?: string; order_id?: string; shipment_number: number; method: string; agent_name: string; tracking_ref: string; ship_date: string; expected_arrival: string; actual_arrival: string; freight_cost_tzs: number; freight_paid: boolean; status: string; notes: string; import_shipment_lines?: ShipmentLine[] }
interface ShipmentLine { id?: string; shipment_id?: string; order_line_id: string; qty_shipped: number; qty_received: number }
interface ReceiveLine { shipmentLineId: string; orderLineId: string; productId: string; qtyShipped: number; qtyAlreadyReceived: number; qtyReceive: number; desc: string; unitCostTzs: number }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'plus') return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'back') return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'ship') return <svg {...p}><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
  if (n === 'check') return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  if (n === 'dollar') return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}
const STA_C: Record<string, string> = { draft:'pill-gray', deposit_paid:'pill-amber', balance_paid:'pill-blue', shipped:'pill-blue', partially_received:'pill-amber', received:'pill-green', closed:'pill-green' }
const STA_L: Record<string, string> = { draft:'Draft', deposit_paid:'Deposit Paid', balance_paid:'Fully Paid', shipped:'Shipped', partially_received:'Partial Received', received:'All Received', closed:'Closed' }
const EMPTY_LINE: OrderLine = { line_number:1, product_id:'', description:'', qty:1, unit_cost_usd:0, unit_cost_tzs:0, subtotal_usd:0, subtotal_tzs:0, qty_received:0, landed_unit_cost_tzs:0 }

export default function ImportOrder({ onNav: _onNav }: Props) {
  const { isSuperAdmin } = useAuth()
  const [toast, setToast] = useState(''); const [toastType, setToastType] = useState<'success'|'error'>('success')
  const showToast = (m: string, t: 'success'|'error' = 'success') => { setToast(m); setToastType(t) }
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([]); const [products, setProducts] = useState<DBProduct[]>([]); const [accounts, setAccounts] = useState<DBAccount[]>([]); const [orders, setOrders] = useState<ImportOrder[]>([]); const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list'|'detail'|'create'>('list')
  const [activeOrder, setActiveOrder] = useState<ImportOrder|null>(null); const [orderLines, setOrderLines] = useState<OrderLine[]>([]); const [payments, setPayments] = useState<Payment[]>([]); const [shipments, setShipments] = useState<Shipment[]>([])
  const [form, setForm] = useState({ supplier:'', orderDate:today(), expectedReady:'', currency:'USD', fxRate:'2500', notes:'' })
  const [lines, setLines] = useState<OrderLine[]>([{...EMPTY_LINE}]); const [saving, setSaving] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false); const [payType, setPayType] = useState<'supplier_deposit'|'supplier_balance'|'forwarding_agent'>('supplier_deposit')
  const [payForm, setPayForm] = useState({ date:today(), amount:'', bankAccount:'', agentSupplierId:'', reference:'', notes:'', currency:'TZS', fxRate:'1' }); const [payPosting, setPayPosting] = useState(false)
  const [showShipModal, setShowShipModal] = useState(false); const [shipForm, setShipForm] = useState({ method:'sea', agentName:'', trackingRef:'', shipDate:today(), expectedArrival:'', freightCost:'', notes:'' })
  const [shipLines, setShipLines] = useState<{orderLineId:string;qty:number;desc:string}[]>([])
  const [showReceiveModal, setShowReceiveModal] = useState(false); const [receiveShipmentId, setReceiveShipmentId] = useState('')
  const [rcvShipment, setRcvShipment] = useState<Shipment|null>(null); const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]); const [receiving, setReceiving] = useState(false)
  const setF = (k:string,v:string) => setForm(f=>({...f,[k]:v})); const setPayF = (k:string,v:string) => setPayForm(f=>({...f,[k]:v}))
  const bankAccounts = accounts.filter(a => a.category==='Cash & Bank' || a.category?.toLowerCase().includes('cash') || a.category?.toLowerCase().includes('bank') || (a.type==='asset' && /^10[1-4]/.test(a.code)))

  useEffect(() => { loadAll() }, [])
  const loadAll = async () => {
    setLoading(true)
    const [s,p,a,o] = await Promise.all([supabase.from('suppliers').select('id,code,name,balance_tzs').eq('is_active',true).order('name'), supabase.from('products').select('id,name,sku,cost_price,qty').eq('is_active',true).order('name'), supabase.from('accounts').select('id,code,name,category,type').eq('is_active',true).order('code'), supabase.from('import_orders').select('*,suppliers(name,code)').order('created_at',{ascending:false})])
    if(s.data) setSuppliers(s.data as DBSupplier[]); if(p.data) setProducts(p.data as DBProduct[]); if(a.data) setAccounts(a.data as DBAccount[]); if(o.data) setOrders(o.data as ImportOrder[])
    setLoading(false)
  }
  const loadOrderDetail = async (order:ImportOrder) => {
    setActiveOrder(order)
    const [l,p,s] = await Promise.all([supabase.from('import_order_lines').select('*').eq('order_id',order.id).order('line_number'), supabase.from('import_payments').select('*').eq('order_id',order.id).order('payment_date'), supabase.from('import_shipments').select('*,import_shipment_lines(*)').eq('order_id',order.id).order('shipment_number')])
    if(l.data) setOrderLines(l.data as OrderLine[]); if(p.data) setPayments(p.data as Payment[]); if(s.data) setShipments(s.data as Shipment[])
    setView('detail')
  }
  const generateRef = async ():Promise<string> => {
    const pat='IMP-10-'; const {data}=await supabase.from('import_orders').select('ref').like('ref',`${pat}%`).order('ref',{ascending:false}).limit(1)
    let seq=1; if(data&&data.length>0) seq=(parseInt((data[0].ref as string).replace(pat,''))||0)+1
    return `${pat}${String(seq).padStart(4,'0')}`
  }
  const updateLine = (i:number,field:keyof OrderLine,val:string|number) => {
    const nl=[...lines]; nl[i]={...nl[i],[field]:val as never}; const rate=parseFloat(form.fxRate)||2500
    if(field==='product_id'){const pr=products.find(pp=>pp.id===val);if(pr)nl[i].description=pr.name}
    if(field==='qty'||field==='unit_cost_usd'){nl[i].subtotal_usd=nl[i].qty*nl[i].unit_cost_usd;nl[i].unit_cost_tzs=nl[i].unit_cost_usd*rate;nl[i].subtotal_tzs=nl[i].subtotal_usd*rate}
    setLines(nl)
  }
  const recalcLines = (rate:number) => setLines(prev=>prev.map(l=>({...l,unit_cost_tzs:l.unit_cost_usd*rate,subtotal_tzs:l.subtotal_usd*rate})))
  const totalUsd = lines.reduce((s,l)=>s+l.subtotal_usd,0); const totalTzs = lines.reduce((s,l)=>s+l.subtotal_tzs,0)

  const saveOrder = async () => {
    if(!form.supplier){showToast('Select a supplier','error');return}; if(lines.every(l=>!l.description&&!l.product_id)){showToast('Add at least one product','error');return}; if(totalUsd<=0){showToast('Total must be > 0','error');return}
    setSaving(true)
    try{
      const ref=await generateRef()
      const{data:order,error:oErr}=await supabase.from('import_orders').insert({ref,supplier_id:form.supplier,status:'draft',order_date:form.orderDate,expected_ready_date:form.expectedReady||null,currency:form.currency,fx_rate:parseFloat(form.fxRate)||2500,total_usd:totalUsd,total_tzs:totalTzs,total_freight_tzs:0,total_landed_tzs:totalTzs,notes:form.notes||null,created_by:'Joe Gembe'}).select('id').single()
      if(oErr)throw new Error(oErr.message)
      const lp=lines.filter(l=>l.description||l.product_id).map((l,i)=>({order_id:order.id,line_number:i+1,product_id:l.product_id||null,description:l.description,qty:l.qty,unit_cost_usd:l.unit_cost_usd,unit_cost_tzs:l.unit_cost_tzs,subtotal_usd:l.subtotal_usd,subtotal_tzs:l.subtotal_tzs,qty_received:0,landed_unit_cost_tzs:0}))
      const{error:lErr}=await supabase.from('import_order_lines').insert(lp); if(lErr)throw new Error(lErr.message)
      showToast(`${ref} created`); await loadAll()
      const full=(await supabase.from('import_orders').select('*,suppliers(name,code)').eq('id',order.id).single()).data
      if(full) await loadOrderDetail(full as ImportOrder)
    }catch(e:unknown){showToast(e instanceof Error?e.message:'Failed','error')}finally{setSaving(false)}
  }

  const recordPayment = async () => {
    if(!activeOrder)return; const raw=parseFloat(payForm.amount); if(!raw||raw<=0){showToast('Enter amount','error');return}
    const fx=parseFloat(payForm.fxRate)||1; const amount=payForm.currency==='TZS'?raw:raw*fx
    if(!payForm.bankAccount){showToast('Select bank','error');return}; if(payType==='forwarding_agent'&&!payForm.agentSupplierId){showToast('Select agent','error');return}
    const dc=await validatePostingDate(payForm.date,isSuperAdmin()); if(!dc.allowed){showToast(dc.error||'Date blocked','error');return}
    setPayPosting(true)
    try{
      const drAcct=accounts.find(a=>a.code==='1121'); if(!drAcct)throw new Error('Account 1121 not found')
      const cn=payForm.currency!=='TZS'?` (${payForm.currency} ${raw.toLocaleString()} @ ${fx})`:''; const an=payType==='forwarding_agent'?suppliers.find(s=>s.id===payForm.agentSupplierId)?.name||'':''
      const desc=payType==='forwarding_agent'?`Import freight — ${an} — ${activeOrder.ref}${cn}`:`Import ${payType.replace('_',' ')} — ${activeOrder.ref}${cn}`
      const{data:jnl,error:jErr}=await supabase.from('journals').insert({ref:`JV-${activeOrder.ref}-${payType.charAt(0).toUpperCase()}${payments.length+1}`,posting_date:payForm.date,description:desc,journal_type:'import_payment',source_type:'import_order',source_ref:activeOrder.ref,posted_by:'Joe Gembe',status:'posted'}).select('id').single()
      if(jErr)throw new Error(jErr.message)
      await supabase.from('journal_lines').insert([{journal_id:jnl.id,line_number:1,account_id:drAcct.id,description:desc,debit:amount,credit:0},{journal_id:jnl.id,line_number:2,account_id:payForm.bankAccount,description:`Bank — ${desc}`,debit:0,credit:amount}])
      await Promise.all([supabase.rpc('update_account_balance',{p_account_id:drAcct.id,p_debit:amount,p_credit:0}),supabase.rpc('update_account_balance',{p_account_id:payForm.bankAccount,p_debit:0,p_credit:amount})])
      if(payType!=='forwarding_agent'&&activeOrder.supplier_id){
        await supabase.from('vendor_ledger_entries').insert({supplier_id:activeOrder.supplier_id,posting_date:payForm.date,document_type:'payment',document_ref:activeOrder.ref,description:desc,amount_tzs:-amount,remaining_amount:0,is_open:false,journal_id:jnl.id,import_order_ref:activeOrder.ref})
        const sup=suppliers.find(s=>s.id===activeOrder.supplier_id); if(sup)await supabase.from('suppliers').update({balance_tzs:(sup.balance_tzs||0)-amount}).eq('id',activeOrder.supplier_id)
      }
      if(payType==='forwarding_agent'&&payForm.agentSupplierId){
        await supabase.from('vendor_ledger_entries').insert({supplier_id:payForm.agentSupplierId,posting_date:payForm.date,document_type:'payment',document_ref:activeOrder.ref,description:desc,amount_tzs:-amount,remaining_amount:0,is_open:false,journal_id:jnl.id,import_order_ref:activeOrder.ref})
        const as2=suppliers.find(s=>s.id===payForm.agentSupplierId); if(as2)await supabase.from('suppliers').update({balance_tzs:(as2.balance_tzs||0)-amount}).eq('id',payForm.agentSupplierId)
      }
      await supabase.from('import_payments').insert({order_id:activeOrder.id,payment_type:payType,payment_date:payForm.date,amount_tzs:amount,bank_account_id:payForm.bankAccount,agent_name:an||null,reference:payForm.reference||null,notes:payForm.notes||null,journal_id:jnl.id})
      const ap=[...payments,{amount_tzs:amount,payment_type:payType} as Payment]; const tf=ap.filter(p=>p.payment_type==='forwarding_agent').reduce((s,p)=>s+p.amount_tzs,0); const sp=ap.filter(p=>p.payment_type!=='forwarding_agent').reduce((s,p)=>s+p.amount_tzs,0)
      let ns=activeOrder.status; if(sp>=activeOrder.total_tzs&&(ns==='draft'||ns==='deposit_paid'))ns='balance_paid'; else if(sp>0&&ns==='draft')ns='deposit_paid'
      await supabase.from('import_orders').update({total_freight_tzs:tf,total_landed_tzs:activeOrder.total_tzs+tf,status:ns}).eq('id',activeOrder.id)
      showToast(`Payment recorded — ${tzs(amount)}`); setShowPayModal(false); setPayForm({date:today(),amount:'',bankAccount:'',agentSupplierId:'',reference:'',notes:'',currency:'TZS',fxRate:'1'})
      const r=(await supabase.from('import_orders').select('*,suppliers(name,code)').eq('id',activeOrder.id).single()).data; if(r)await loadOrderDetail(r as ImportOrder)
    }catch(e:unknown){showToast(e instanceof Error?e.message:'Failed','error')}finally{setPayPosting(false)}
  }

  const addShipment = async () => {
    if(!activeOrder)return; if(shipLines.every(l=>l.qty<=0)){showToast('Add quantities','error');return}
    try{
      const num=shipments.length+1
      const{data:sh,error:sErr}=await supabase.from('import_shipments').insert({order_id:activeOrder.id,shipment_number:num,method:shipForm.method,agent_name:shipForm.agentName||null,tracking_ref:shipForm.trackingRef||null,ship_date:shipForm.shipDate||null,expected_arrival:shipForm.expectedArrival||null,freight_cost_tzs:parseFloat(shipForm.freightCost)||0,status:'in_transit',notes:shipForm.notes||null}).select('id').single()
      if(sErr)throw new Error(sErr.message)
      await supabase.from('import_shipment_lines').insert(shipLines.filter(l=>l.qty>0).map(l=>({shipment_id:sh.id,order_line_id:l.orderLineId,qty_shipped:l.qty,qty_received:0})))
      if(['draft','deposit_paid','balance_paid'].includes(activeOrder.status))await supabase.from('import_orders').update({status:'shipped'}).eq('id',activeOrder.id)
      showToast(`Shipment #${num} (${shipForm.method}) added`); setShowShipModal(false)
      const r=(await supabase.from('import_orders').select('*,suppliers(name,code)').eq('id',activeOrder.id).single()).data; if(r)await loadOrderDetail(r as ImportOrder)
    }catch(e:unknown){showToast(e instanceof Error?e.message:'Failed','error')}
  }

  const openReceiveModal = async (sh: Shipment) => {
    setReceiveShipmentId(sh.id!); setRcvShipment(sh)
    const { data: freshSL } = await supabase.from('import_shipment_lines').select('*').eq('shipment_id', sh.id)
    const sLines = (freshSL || []) as ShipmentLine[]
    setReceiveLines(sLines.map(sl => {
      const ol = orderLines.find(l => l.id === sl.order_line_id)
      return { shipmentLineId: sl.id || '', orderLineId: sl.order_line_id, productId: ol?.product_id || '', qtyShipped: sl.qty_shipped, qtyAlreadyReceived: sl.qty_received || 0, qtyReceive: sl.qty_shipped - (sl.qty_received || 0), desc: ol?.description || '', unitCostTzs: ol?.unit_cost_tzs || 0 }
    }))
    setShowReceiveModal(true)
  }

  const doReceiveShipment = async () => {
    if (!activeOrder || !receiveShipmentId) return
    const totalRcv = receiveLines.reduce((s, rl) => s + rl.qtyReceive, 0)
    if (totalRcv <= 0) { showToast('Enter quantities', 'error'); return }
    setReceiving(true)
    try {
      const freight = rcvShipment?.freight_cost_tzs || 0
      for (const rl of receiveLines) {
        if (rl.qtyReceive <= 0) continue
        const ol = orderLines.find(l => l.id === rl.orderLineId)
        if (!ol) continue
        const costPerUnit = ol.unit_cost_tzs || 0
        const freightPerUnit = totalRcv > 0 ? freight / totalRcv : 0
        const landedPerUnit = costPerUnit + freightPerUnit
        const landedTotal = landedPerUnit * rl.qtyReceive

        await supabase.from('import_shipment_lines').update({ qty_received: (rl.qtyAlreadyReceived || 0) + rl.qtyReceive }).eq('id', rl.shipmentLineId)
        await supabase.from('import_order_lines').update({ qty_received: (ol.qty_received || 0) + rl.qtyReceive, landed_unit_cost_tzs: landedPerUnit }).eq('id', rl.orderLineId)

        if (rl.productId) {
          const { data: fp } = await supabase.from('products').select('qty, cost_price').eq('id', rl.productId).single()
          if (fp) {
            const curQty = fp.qty || 0; const newQty = curQty + rl.qtyReceive
            const oldVal = curQty * (fp.cost_price || 0)
            const avgCost = newQty > 0 ? (oldVal + landedTotal) / newQty : landedPerUnit
            await supabase.from('products').update({ qty: newQty, cost_price: Math.round(avgCost) }).eq('id', rl.productId)
          }
        }
      }
      const invAcct = accounts.find(a => a.code === '1110'); const grnAcct = accounts.find(a => a.code === '1121')
      if (invAcct && grnAcct) {
        const tv = receiveLines.reduce((s, rl) => { if (rl.qtyReceive <= 0) return s; const fp2 = totalRcv > 0 ? freight / totalRcv : 0; return s + (rl.unitCostTzs + fp2) * rl.qtyReceive }, 0)
        if (tv > 0) {
          const d2 = `Import received — ${activeOrder.ref} — Shipment #${rcvShipment?.shipment_number || ''}`
          const { data: j2 } = await supabase.from('journals').insert({ ref: `JV-${activeOrder.ref}-RCV${rcvShipment?.shipment_number || ''}`, posting_date: today(), description: d2, journal_type: 'import_receive', source_type: 'import_order', source_ref: activeOrder.ref, posted_by: 'Joe Gembe', status: 'posted' }).select('id').single()
          if (j2) {
            await supabase.from('journal_lines').insert([{ journal_id: j2.id, line_number: 1, account_id: invAcct.id, description: d2, debit: Math.round(tv), credit: 0 }, { journal_id: j2.id, line_number: 2, account_id: grnAcct.id, description: d2, debit: 0, credit: Math.round(tv) }])
            await Promise.all([supabase.rpc('update_account_balance', { p_account_id: invAcct.id, p_debit: Math.round(tv), p_credit: 0 }), supabase.rpc('update_account_balance', { p_account_id: grnAcct.id, p_debit: 0, p_credit: Math.round(tv) })])
          }
        }
      }
      await supabase.from('import_shipments').update({ status: 'received', actual_arrival: today() }).eq('id', receiveShipmentId)
      const { data: fol } = await supabase.from('import_order_lines').select('qty, qty_received').eq('order_id', activeOrder.id)
      const allDone = fol?.every(l => l.qty_received >= l.qty) || false
      await supabase.from('import_orders').update({ status: allDone ? 'received' : 'partially_received' }).eq('id', activeOrder.id)
      showToast(`Received: ${receiveLines.filter(r => r.qtyReceive > 0).map(r => `${r.desc}: ${r.qtyReceive} pcs`).join(', ')}. Stock updated!`)
      setShowReceiveModal(false); await loadAll()
      const rf = (await supabase.from('import_orders').select('*, suppliers(name, code)').eq('id', activeOrder.id).single()).data
      if (rf) await loadOrderDetail(rf as ImportOrder)
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Receive failed', 'error') } finally { setReceiving(false) }
  }

  // ═══ DETAIL VIEW ═══
  if (view === 'detail' && activeOrder) {
    const totalPaid = payments.reduce((s, p) => s + p.amount_tzs, 0)
    const supplierPaid = payments.filter(p => p.payment_type !== 'forwarding_agent').reduce((s, p) => s + p.amount_tzs, 0)
    const freightPaid = payments.filter(p => p.payment_type === 'forwarding_agent').reduce((s, p) => s + p.amount_tzs, 0)
    const totalQtyOrd = orderLines.reduce((s, l) => s + l.qty, 0)
    const totalQtyRcv = orderLines.reduce((s, l) => s + l.qty_received, 0)
    const paidPct = activeOrder.total_tzs > 0 ? Math.min(100, Math.round(supplierPaid / activeOrder.total_tzs * 100)) : 0
    const step = activeOrder.status === 'draft' ? 1 : activeOrder.status === 'deposit_paid' ? 2 : activeOrder.status === 'balance_paid' ? 3 : ['shipped', 'partially_received'].includes(activeOrder.status) ? 4 : 5

    return (<div className="page">
      <div className="page-header"><div style={{display:'flex',alignItems:'center',gap:12}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>{setView('list');loadAll()}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="back"/> Orders</button>
        <div style={{width:1,height:24,background:'var(--border)'}}/>
        <div><div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:800,color:'var(--accent)',background:'var(--accent-dim)',padding:'3px 12px',borderRadius:6}}>{activeOrder.ref}</span><span className={`pill ${STA_C[activeOrder.status]||'pill-gray'}`} style={{fontSize:10}}>{STA_L[activeOrder.status]||activeOrder.status}</span></div>
        <div className="page-sub">{activeOrder.suppliers?.name||'Unknown'} · {activeOrder.order_date}</div></div>
      </div><div className="page-actions">
        <button className="btn btn-ghost btn-sm" onClick={()=>{setPayType('supplier_deposit');setShowPayModal(true)}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="dollar" s={13}/> Pay</button>
        <button className="btn btn-primary btn-sm" onClick={()=>{setShipForm({method:'sea',agentName:'',trackingRef:'',shipDate:today(),expectedArrival:'',freightCost:'',notes:''});setShipLines(orderLines.map(l=>({orderLineId:l.id!,qty:Math.max(0,l.qty-l.qty_received),desc:l.description})));setShowShipModal(true)}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="ship" s={13}/> Add Shipment</button>
      </div></div>

      {/* Progress */}
      <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:24,padding:'0 4px'}}>
        {['Order Created','Deposit Paid','Fully Paid','Shipped','Received'].map((label,i)=>{const sn=i+1;const done=step>sn;const act=step===sn;return(<div key={i} style={{display:'flex',alignItems:'center',flex:1}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:done?'var(--green)':act?'var(--accent)':'var(--surface3)',border:`2px solid ${done?'var(--green)':act?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:done||act?'#fff':'var(--text3)'}}>{done?'✓':sn}</div>
            <span style={{fontSize:9,fontFamily:'var(--mono)',color:done?'var(--green)':act?'var(--accent)':'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',textAlign:'center',lineHeight:1.2}}>{label}</span>
          </div>{i<4&&<div style={{flex:1,height:2,background:done?'var(--green)':'var(--border)',margin:'0 6px',marginBottom:18}}/>}</div>)})}
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:20}}>
        {[{label:'Order Total',val:tzs(activeOrder.total_tzs),sub:`USD ${activeOrder.total_usd.toLocaleString()} @ ${activeOrder.fx_rate}`,color:'var(--text)'},{label:'Supplier Paid',val:tzs(supplierPaid),sub:`${paidPct}%`,color:supplierPaid>=activeOrder.total_tzs?'var(--green)':'var(--yellow)'},{label:'Freight',val:tzs(freightPaid),color:freightPaid>0?'var(--blue)':'var(--text3)'},{label:'Total Landed',val:tzs(totalPaid),sub:totalQtyOrd>0?`${tzs(Math.round(totalPaid/totalQtyOrd))}/unit`:'',color:'var(--accent)'},{label:'Received',val:`${totalQtyRcv} / ${totalQtyOrd}`,color:totalQtyRcv>=totalQtyOrd?'var(--green)':'var(--yellow)'}].map(it=>(
          <div key={it.label} className="card" style={{padding:'14px 16px'}}><div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{it.label}</div><div style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:it.color}}>{it.val}</div>{it.sub&&<div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>{it.sub}</div>}</div>))}
      </div>

      {/* Order Lines */}
      <div className="card" style={{marginBottom:16}}><div className="card-title" style={{marginBottom:12}}>Products Ordered</div><div className="table-wrap"><table><thead><tr><th>SKU</th><th>Product</th><th className="td-right">Qty</th><th className="td-right">Unit USD</th><th className="td-right">Unit TZS</th><th className="td-right">Received</th><th className="td-right">Landed/Unit</th><th>Status</th></tr></thead><tbody>
        {orderLines.map(l=>{const pct=l.qty>0?Math.round(l.qty_received/l.qty*100):0;return(<tr key={l.id}><td className="td-mono" style={{fontSize:11,color:'var(--accent)'}}>{products.find(pp=>pp.id===l.product_id)?.sku||''}</td><td style={{fontSize:12,fontWeight:600}}>{l.description}</td><td className="td-right td-mono">{l.qty}</td><td className="td-right td-mono" style={{fontSize:11}}>${l.unit_cost_usd.toFixed(2)}</td><td className="td-right td-mono" style={{fontSize:11}}>{tzs(l.unit_cost_tzs)}</td><td className="td-right td-mono" style={{fontWeight:700,color:pct>=100?'var(--green)':pct>0?'var(--yellow)':'var(--text3)'}}>{l.qty_received}/{l.qty}</td><td className="td-right td-mono" style={{fontSize:11,color:'var(--accent)'}}>{l.landed_unit_cost_tzs>0?tzs(Math.round(l.landed_unit_cost_tzs)):''}</td><td><span className={`pill ${pct>=100?'pill-green':pct>0?'pill-amber':'pill-gray'}`} style={{fontSize:9}}>{pct>=100?'Complete':pct>0?`${pct}%`:'Pending'}</span></td></tr>)})}
      </tbody></table></div></div>

      {/* Payments */}
      <div className="card" style={{marginBottom:16}}><div className="card-title" style={{marginBottom:12}}>Payments ({payments.length})</div>
        {payments.length===0?<div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:12}}>No payments yet.</div>:
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>To</th><th>Ref</th><th className="td-right">Amount</th></tr></thead><tbody>
          {payments.map((p,i)=>(<tr key={i}><td className="td-mono" style={{fontSize:11,color:'var(--text3)'}}>{p.payment_date}</td><td><span className={`pill ${p.payment_type==='forwarding_agent'?'pill-blue':p.payment_type==='supplier_deposit'?'pill-amber':'pill-green'}`} style={{fontSize:9,textTransform:'capitalize'}}>{p.payment_type.replace(/_/g,' ')}</span></td><td style={{fontSize:11}}>{p.agent_name||activeOrder.suppliers?.name||''}</td><td className="td-mono" style={{fontSize:11,color:'var(--text3)'}}>{p.reference||''}</td><td className="td-right td-mono" style={{fontWeight:700,fontSize:13}}>{tzs(p.amount_tzs)}</td></tr>))}
        </tbody><tfoot><tr style={{background:'var(--surface2)'}}><td colSpan={4} style={{fontWeight:700}}>Total</td><td className="td-right td-mono" style={{fontSize:15,fontWeight:800}}>{tzs(totalPaid)}</td></tr></tfoot></table></div>}
      </div>

      {/* Shipments */}
      <div className="card"><div className="card-title" style={{marginBottom:12}}>Shipments ({shipments.length})</div>
        {shipments.length===0?<div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:12}}>No shipments yet.</div>:
        <div style={{display:'flex',flexDirection:'column',gap:12}}>{shipments.map(sh=>{const sL=sh.import_shipment_lines||[];const tS=sL.reduce((s,l)=>s+l.qty_shipped,0);const tR=sL.reduce((s,l)=>s+(l.qty_received||0),0);return(
          <div key={sh.id} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 20px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div><div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:14}}>#{sh.shipment_number}</span><span className={`pill ${sh.method==='air'?'pill-amber':'pill-blue'}`} style={{fontSize:9}}>{sh.method==='air'?'AIR':'SEA'}</span><span className={`pill ${sh.status==='received'?'pill-green':'pill-blue'}`} style={{fontSize:9}}>{sh.status==='in_transit'?'In Transit':sh.status}</span></div>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:2,display:'flex',gap:12}}>{sh.agent_name&&<span>Agent: {sh.agent_name}</span>}{sh.ship_date&&<span>Shipped: {sh.ship_date}</span>}{sh.expected_arrival&&<span>ETA: {sh.expected_arrival}</span>}{sh.actual_arrival&&<span>Arrived: {sh.actual_arrival}</span>}</div></div>
              <div style={{display:'flex',alignItems:'center',gap:12}}><div style={{textAlign:'right'}}><div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>{tR}/{tS} pcs</div>{sh.freight_cost_tzs>0&&<div style={{fontSize:10,color:'var(--blue)',fontFamily:'var(--mono)'}}>Freight: {tzs(sh.freight_cost_tzs)}</div>}</div>
              {sh.status!=='received'&&<button className="btn btn-primary btn-sm" onClick={()=>openReceiveModal(sh)} style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}><Ic n="check" s={12} c="#fff"/> Receive</button>}</div>
            </div>
            <div style={{borderTop:'1px solid var(--border)',paddingTop:8}}>{sL.map((sl,idx)=>{const ol2=orderLines.find(l=>l.id===sl.order_line_id);return(<div key={idx} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:12}}><span>{ol2?.description||'?'}</span><span style={{fontFamily:'var(--mono)',color:(sl.qty_received||0)>=sl.qty_shipped?'var(--green)':'var(--text3)'}}>{sl.qty_received||0}/{sl.qty_shipped} pcs</span></div>)})}</div>
          </div>)})}</div>}
      </div>

      {/* Payment Modal */}
      {showPayModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setShowPayModal(false)}><div className="card" style={{width:500}} onClick={e=>e.stopPropagation()}>
        <div className="card-title" style={{marginBottom:16}}>Record Payment — {activeOrder.ref}</div>
        <FG label="Type" req><select className="form-input" value={payType} onChange={e=>setPayType(e.target.value as typeof payType)}><option value="supplier_deposit">Supplier Deposit</option><option value="supplier_balance">Supplier Balance</option><option value="forwarding_agent">Forwarding Agent</option></select></FG>
        <div className="form-row"><FG label="Currency"><select className="form-input" value={payForm.currency} onChange={e=>{setPayF('currency',e.target.value);if(e.target.value==='TZS')setPayF('fxRate','1');else if(e.target.value==='USD')setPayF('fxRate',String(activeOrder?.fx_rate||2500));else setPayF('fxRate','365')}}><option value="TZS">TZS</option><option value="USD">USD</option><option value="RMB">RMB</option></select></FG>
        {payForm.currency!=='TZS'&&<FG label={`Rate TZS/${payForm.currency}`}><input type="number" className="form-input" style={{fontFamily:'var(--mono)'}} value={payForm.fxRate} onChange={e=>setPayF('fxRate',e.target.value)}/></FG>}</div>
        <div className="form-row"><FG label={`Amount (${payForm.currency})`} req><input type="number" className="form-input" style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700}} value={payForm.amount} onChange={e=>setPayF('amount',e.target.value)} placeholder="0"/></FG><FG label="Date" req><input type="date" className="form-input" value={payForm.date} onChange={e=>setPayF('date',e.target.value)}/></FG></div>
        <FG label="Bank Account" req><select className="form-input" value={payForm.bankAccount} onChange={e=>setPayF('bankAccount',e.target.value)}><option value="">— Select —</option>{bankAccounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></FG>
        {payType==='forwarding_agent'&&<FG label="Agent (from Suppliers)" req><select className="form-input" value={payForm.agentSupplierId} onChange={e=>setPayF('agentSupplierId',e.target.value)}><option value="">— Select —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></FG>}
        <FG label="Reference"><input className="form-input" value={payForm.reference} onChange={e=>setPayF('reference',e.target.value)} placeholder="Bank ref"/></FG>
        {payForm.currency!=='TZS'&&payForm.amount&&<div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 12px',fontSize:12,fontFamily:'var(--mono)',color:'var(--text3)',marginTop:4}}>{payForm.currency} {parseFloat(payForm.amount).toLocaleString()} x {payForm.fxRate} = <span style={{fontWeight:700,color:'var(--accent)'}}>{tzs(parseFloat(payForm.amount)*(parseFloat(payForm.fxRate)||1))}</span></div>}
        <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}><button className="btn btn-ghost" onClick={()=>setShowPayModal(false)}>Cancel</button><button className="btn btn-primary" onClick={recordPayment} disabled={payPosting}>{payPosting?'Posting...':'Record Payment'}</button></div>
      </div></div>}

      {/* Shipment Modal */}
      {showShipModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setShowShipModal(false)}><div className="card" style={{width:540,maxHeight:'80vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div className="card-title" style={{marginBottom:16}}>Add Shipment</div>
        <div className="form-row"><FG label="Method" req><select className="form-input" value={shipForm.method} onChange={e=>setShipForm(f=>({...f,method:e.target.value}))}><option value="sea">Sea Cargo</option><option value="air">Air Cargo</option></select></FG><FG label="Agent"><input className="form-input" value={shipForm.agentName} onChange={e=>setShipForm(f=>({...f,agentName:e.target.value}))}/></FG></div>
        <div className="form-row"><FG label="Ship Date"><input type="date" className="form-input" value={shipForm.shipDate} onChange={e=>setShipForm(f=>({...f,shipDate:e.target.value}))}/></FG><FG label="ETA"><input type="date" className="form-input" value={shipForm.expectedArrival} onChange={e=>setShipForm(f=>({...f,expectedArrival:e.target.value}))}/></FG></div>
        <FG label="Tracking Ref"><input className="form-input" value={shipForm.trackingRef} onChange={e=>setShipForm(f=>({...f,trackingRef:e.target.value}))}/></FG>
        <FG label="Freight Cost (TZS)"><input type="number" className="form-input" style={{fontFamily:'var(--mono)'}} value={shipForm.freightCost} onChange={e=>setShipForm(f=>({...f,freightCost:e.target.value}))} placeholder="0"/></FG>
        <div style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:12}}><div style={{fontSize:11,fontWeight:600,marginBottom:10,color:'var(--text3)',textTransform:'uppercase'}}>Quantities per product</div>
        {shipLines.map((sl,i)=>{const ol3=orderLines.find(l=>l.id===sl.orderLineId);const rem=ol3?ol3.qty-ol3.qty_received:0;return(<div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}><span style={{flex:1,fontSize:12}}>{sl.desc}</span><span style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>{rem} left</span><input type="number" className="form-input" style={{width:80,fontSize:12,padding:'5px 8px',textAlign:'center',fontFamily:'var(--mono)'}} value={sl.qty} min={0} max={rem} onChange={e=>{const nl=[...shipLines];nl[i]={...nl[i],qty:parseInt(e.target.value)||0};setShipLines(nl)}}/></div>)})}</div>
        <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}><button className="btn btn-ghost" onClick={()=>setShowShipModal(false)}>Cancel</button><button className="btn btn-primary" onClick={addShipment}>Create Shipment</button></div>
      </div></div>}

      {/* Receive Modal */}
      {showReceiveModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setShowReceiveModal(false)}><div className="card" style={{width:520}} onClick={e=>e.stopPropagation()}>
        <div className="card-title" style={{marginBottom:6}}>Receive Goods — Shipment #{rcvShipment?.shipment_number}</div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:16}}>{rcvShipment?.method==='air'?'Air':'Sea'} cargo{rcvShipment?.agent_name?` via ${rcvShipment.agent_name}`:''}{rcvShipment?.freight_cost_tzs?` · Freight: ${tzs(rcvShipment.freight_cost_tzs)}`:''}</div>
        <div style={{background:'rgba(133,194,190,.06)',border:'1px solid rgba(133,194,190,.15)',borderRadius:8,padding:'10px 12px',marginBottom:16,fontSize:11,color:'var(--text3)'}}>Stock will update immediately. Cost = purchase price + proportional freight per unit.</div>
        {receiveLines.map((rl,i)=>{const rem2=rl.qtyShipped-rl.qtyAlreadyReceived;return(<div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}><span style={{flex:1,fontSize:13,fontWeight:600}}>{rl.desc}</span><span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)'}}>shipped: {rl.qtyShipped}</span></div>
          <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:11,color:'var(--text3)'}}>Receive:</span>
          <input type="number" className="form-input" style={{width:80,fontSize:13,padding:'5px 8px',textAlign:'center',fontFamily:'var(--mono)',fontWeight:700}} value={rl.qtyReceive} min={0} max={rem2} onChange={e=>{const nl=[...receiveLines];nl[i]={...nl[i],qtyReceive:parseInt(e.target.value)||0};setReceiveLines(nl)}}/>
          <span style={{fontSize:10,color:'var(--text3)'}}>of {rem2} remaining</span></div></div>)})}
        <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}><button className="btn btn-ghost" onClick={()=>setShowReceiveModal(false)}>Cancel</button><button className="btn btn-primary" onClick={doReceiveShipment} disabled={receiving}>{receiving?'Updating stock...':'Confirm Received'}</button></div>
      </div></div>}

      {toast&&<Toast message={toast} type={toastType} onClose={()=>setToast('')}/>}
    </div>)
  }

  // ═══ CREATE VIEW ═══
  if (view === 'create') {
    return (<div className="page">
      <div className="page-header"><div style={{display:'flex',alignItems:'center',gap:12}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>setView('list')} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="back"/> Orders</button>
        <div style={{width:1,height:24,background:'var(--border)'}}/><div className="page-title">New Import Order</div>
      </div><div className="page-actions"><button className="btn btn-ghost" onClick={()=>setView('list')}>Cancel</button><button className="btn btn-primary" onClick={saveOrder} disabled={saving}>{saving?'Creating...':'Create Order'}</button></div></div>
      <div className="grid g2" style={{gap:20}}>
        <div className="card"><div className="card-title" style={{marginBottom:14}}>Order Details</div>
          <FG label="Supplier" req><select className="form-input" value={form.supplier} onChange={e=>setF('supplier',e.target.value)}><option value="">— Select —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></FG>
          <div className="form-row"><FG label="Order Date" req><input type="date" className="form-input" value={form.orderDate} onChange={e=>setF('orderDate',e.target.value)}/></FG><FG label="Expected Ready"><input type="date" className="form-input" value={form.expectedReady} onChange={e=>setF('expectedReady',e.target.value)}/></FG></div>
          <div className="form-row"><FG label="Currency"><input className="form-input" value={form.currency} onChange={e=>setF('currency',e.target.value)}/></FG><FG label="FX Rate (TZS/USD)" req><input type="number" className="form-input" style={{fontFamily:'var(--mono)'}} value={form.fxRate} onChange={e=>{setF('fxRate',e.target.value);recalcLines(parseFloat(e.target.value)||2500)}}/></FG></div>
          <FG label="Notes"><textarea className="form-input" rows={2} style={{resize:'none'}} value={form.notes} onChange={e=>setF('notes',e.target.value)}/></FG>
        </div>
        <div className="card" style={{padding:'16px 18px'}}><div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Order Total</div><div style={{fontFamily:'var(--mono)',fontSize:28,fontWeight:800,color:'var(--accent)',marginBottom:4}}>USD {totalUsd.toFixed(2)}</div><div style={{fontFamily:'var(--mono)',fontSize:16,color:'var(--text3)'}}>{tzs(totalTzs)}</div><div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>@ {form.fxRate} TZS/USD</div></div>
      </div>
      <div className="card" style={{marginTop:16}}><div className="card-title" style={{marginBottom:14}}>Products</div><div className="table-wrap" style={{marginBottom:8}}><table><thead><tr><th>Product</th><th>Description</th><th style={{width:70,textAlign:'center'}}>Qty</th><th style={{width:120,textAlign:'right'}}>Unit USD</th><th style={{width:140,textAlign:'right'}}>Subtotal TZS</th><th style={{width:40}}></th></tr></thead><tbody>
        {lines.map((line,i)=>(<tr key={i}><td><select className="form-input" style={{fontSize:12,padding:'6px 8px'}} value={line.product_id} onChange={e=>updateLine(i,'product_id',e.target.value)}><option value="">— Select —</option>{products.map(pp=><option key={pp.id} value={pp.id}>{pp.sku} — {pp.name}</option>)}</select></td><td><input className="form-input" style={{fontSize:12,padding:'6px 8px'}} value={line.description} onChange={e=>updateLine(i,'description',e.target.value)} placeholder="Description"/></td><td><input type="number" className="form-input" style={{fontSize:12,padding:'6px 8px',textAlign:'center'}} value={line.qty} min={1} onChange={e=>updateLine(i,'qty',parseInt(e.target.value)||1)}/></td><td><input type="number" className="form-input" style={{fontSize:12,padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)'}} value={line.unit_cost_usd} step="0.01" onChange={e=>updateLine(i,'unit_cost_usd',parseFloat(e.target.value)||0)}/></td><td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:12}}>{Math.round(line.subtotal_tzs).toLocaleString()}</td><td><button onClick={()=>setLines(lines.filter((_,idx)=>idx!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:14}}>x</button></td></tr>))}
      </tbody></table></div><button className="btn btn-ghost btn-sm" onClick={()=>setLines([...lines,{...EMPTY_LINE,line_number:lines.length+1}])}>+ Add Product</button></div>
      {toast&&<Toast message={toast} type={toastType} onClose={()=>setToast('')}/>}
    </div>)
  }

  // ═══ LIST VIEW ═══
  return (<div className="page">
    <div className="page-header"><div><div className="page-title">Import Orders</div><div className="page-sub">China/India sourcing · Quote to shelf</div></div>
    <div className="page-actions"><button className="btn btn-ghost btn-sm" onClick={loadAll} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="refresh"/> Refresh</button>
    <button className="btn btn-primary btn-sm" onClick={()=>{setForm({supplier:'',orderDate:today(),expectedReady:'',currency:'USD',fxRate:'2500',notes:''});setLines([{...EMPTY_LINE}]);setView('create')}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="plus" s={13}/> New Import Order</button></div></div>
    {loading?<div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>Loading...</div>:orders.length===0?<div className="card" style={{textAlign:'center',padding:'60px 0',color:'var(--text3)'}}><div style={{fontSize:14,fontWeight:600}}>No import orders yet</div></div>:
    <div className="card"><div className="table-wrap"><table><thead><tr><th>Ref</th><th>Supplier</th><th>Date</th><th>Status</th><th className="td-right">USD</th><th className="td-right">TZS</th><th className="td-right">Freight</th><th className="td-right">Landed</th></tr></thead><tbody>
      {orders.map(o=>(<tr key={o.id} style={{cursor:'pointer'}} onClick={()=>loadOrderDetail(o)} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><td className="td-mono td-amber" style={{fontSize:12,fontWeight:700}}>{o.ref}</td><td style={{fontSize:12,fontWeight:600}}>{o.suppliers?.name||''}</td><td className="td-mono" style={{fontSize:11,color:'var(--text3)'}}>{o.order_date}</td><td><span className={`pill ${STA_C[o.status]||'pill-gray'}`} style={{fontSize:9}}>{STA_L[o.status]||o.status}</span></td><td className="td-right td-mono" style={{fontSize:12}}>${o.total_usd.toLocaleString()}</td><td className="td-right td-mono" style={{fontSize:12}}>{tzs(o.total_tzs)}</td><td className="td-right td-mono" style={{fontSize:12,color:o.total_freight_tzs>0?'var(--blue)':'var(--text3)'}}>{o.total_freight_tzs>0?tzs(o.total_freight_tzs):''}</td><td className="td-right td-mono" style={{fontSize:12,fontWeight:700,color:'var(--accent)'}}>{tzs(o.total_landed_tzs)}</td></tr>))}
    </tbody></table></div></div>}
    {toast&&<Toast message={toast} type={toastType} onClose={()=>setToast('')}/>}
  </div>)
}
