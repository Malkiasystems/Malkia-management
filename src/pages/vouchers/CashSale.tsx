import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { MalkiaReceipt } from '../ReceiptTemplate'
import type { ReceiptSettings } from '../ReceiptTemplate'
import { loadWAConfig, sendWhatsApp, formatReceiptMessage } from '../../lib/whatsapp'
import type { WAConfig } from '../../lib/whatsapp'
import { useCategories } from '../../lib/useCategories'
import { useAuth } from '../../lib/useAuth'
import BundlePicker from '../../components/BundlePicker'
import { logBundleSale } from '../../lib/useBundles'
import type { Bundle } from '../../lib/useBundles'

interface Props {
  editVoucherId?: string | null
  onClearEdit?: () => void
}

interface DBProduct { id: string; sku: string; name: string; category: string; cost_price: number; selling_price: number; qty_on_hand: number }
interface DBCustomer { id: string; name: string; whatsapp: string; crown_points: number; pregnancy_stage: string; last_purchase_date: string; last_purchase_amount: number; balance: number }
interface SaleLine { productId: string; name: string; qty: number; price: number; amount: number }

// ── PAYMENT METHODS — hardwired to Malkia's actual accounts ──
interface PaymentMethod {
  id: string
  label: string
  sublabel: string
  accountCode: string
  color: string
  bg: string
  showRef: boolean
}

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash',  label: 'Cash',        sublabel: 'Cash in Hand',                    accountCode: '1010', color: '#22c55e', bg: '#14532d', showRef: false },
  { id: 'mpesa', label: 'M-Pesa',      sublabel: '50582099 · Malkia Wellness',      accountCode: '1020', color: '#ef4444', bg: '#7f1d1d', showRef: true  },
  { id: 'mixx',  label: 'Mixx by YAS', sublabel: '17915715 · Malkia Wellness',      accountCode: '1021', color: '#facc15', bg: '#1e3a8a', showRef: true  },
  { id: 'nmb',   label: 'NMB Bank',    sublabel: '22510074972 · Malkia Wellness',   accountCode: '1022', color: '#60a5fa', bg: '#1e3a5f', showRef: true  },
  { id: 'crdb',  label: 'CRDB Bank',   sublabel: '015C874857300 · Malkia Wellness', accountCode: '1030', color: '#4ade80', bg: '#14532d', showRef: true  },
  { id: 'pos',   label: 'POS Card',    sublabel: 'CRDB Card Machine',               accountCode: '1030', color: '#c084fc', bg: '#3b0764', showRef: true  },
]

interface SplitLine { methodId: string; accountId: string; amount: number; ref: string }

export default function CashSale({ editVoucherId, onClearEdit }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [autoRef, setAutoRef] = useState('CS-10-????')
  const [posting, setPosting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [autoReceipt] = useState(true)
  
  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false)
  const [editVoucherData, setEditVoucherData] = useState<any>(null)
  const [appliedBundle, setAppliedBundle] = useState<Bundle | null>(null)
  const { user } = useAuth()

  // Customer
  const [waInput, setWaInput] = useState('')
  const [newCustName, setNewCustName] = useState('')
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Products
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([])
  const [filterCat, setFilterCat] = useState('all')
  const [lines, setLines] = useState<SaleLine[]>([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }])
  const { groups, catsByGroup } = useCategories()

  // Delivery
  const [showDelivery, setShowDelivery] = useState(false)
  const [townDelivery, setTownDelivery] = useState('')
  const [upcountryShipping, setUpcountryShipping] = useState('')
  const [deliveryAccountId, setDeliveryAccountId] = useState('')

  // Payment
  const [isPOD, setIsPOD] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<string>('cash')
  const [isSplit, setIsSplit] = useState(false)
  const [splitLines, setSplitLines] = useState<SplitLine[]>([])
  const [tendered, setTendered] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  const [accountMap, setAccountMap] = useState<Record<string, string>>({})

  // Dashboard
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0, avgSale: 0, crownPts: 0 })
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [paymentSplit, setPaymentSplit] = useState<Record<string, number>>({})
  const [invSettings, setInvSettings] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [locations, setLocations] = useState<{id:string;code:string;name:string}[]>([])
  const [locationCode, setLocationCode] = useState('1001')
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [lastVoucher, setLastVoucher] = useState<any>(null)
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null)

  useEffect(() => {
    loadProducts(); loadDeliveryAccount(); loadAccountMap(); loadReceiptSettings(); loadWAConfig().then(setWaConfig)
    supabase.from('stock_locations').select('id,code,name').eq('is_active',true).order('code').then(({data})=>{ if(data) setLocations(data); if(data?.[0]) setLocationCode(data[0].code) })
    supabase.from('system_settings').select('value').eq('key','inventory_settings').single().then(({data})=>{ if(data?.value) try { setInvSettings(JSON.parse(data.value)) } catch {} })
    loadTodayStats(); loadRecentSales()
    
    // Check if we're in edit mode
    if (editVoucherId) {
      loadExistingVoucher(editVoucherId)
    } else {
      loadNextRef()
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editVoucherId])

  // Load existing voucher for editing
  const loadExistingVoucher = async (voucherId: string) => {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select(`
        *, 
        customers (id, name, whatsapp, crown_points, pregnancy_stage, last_purchase_date, last_purchase_amount, balance),
        voucher_lines (id, product_id, qty, unit_price, unit_cost, total, products (id, sku, name, category, cost_price, selling_price, qty_on_hand))
      `)
      .eq('id', voucherId)
      .single()
    
    if (voucher) {
      setIsEditMode(true)
      setEditVoucherData(voucher)
      setAutoRef(voucher.ref)
      
      // Set customer
      if (voucher.customers) {
        setSelectedCust(voucher.customers as DBCustomer)
        setWaInput(voucher.customers.whatsapp || '')
        setNewCustName(voucher.customers.name || '')
      }
      
      // Set lines
      const editLines: SaleLine[] = (voucher.voucher_lines || []).map((l: any) => ({
        productId: l.product_id,
        name: l.products?.name || '',
        qty: l.qty,
        price: l.unit_price,
        amount: l.total
      }))
      if (editLines.length > 0) setLines(editLines)
      
      // Set payment method
      const pm = voucher.payment_method || 'Cash'
      const methodId = pm.toLowerCase().includes('cash') ? 'cash' :
                       pm.toLowerCase().includes('m-pesa') ? 'mpesa' :
                       pm.toLowerCase().includes('mixx') ? 'mixx' :
                       pm.toLowerCase().includes('nmb') ? 'nmb' :
                       pm.toLowerCase().includes('crdb') ? 'crdb' :
                       pm.toLowerCase().includes('pos') ? 'pos' : 'cash'
      setSelectedMethod(methodId)
      
      // Set POD status
      setIsPOD(voucher.status === 'draft')
      
      // Auto-open modal
      setShowModal(true)
    }
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
  }

  const loadAccountMap = async () => {
    const codes = PAYMENT_METHODS.map(m => m.accountCode)
    const { data } = await supabase.from('accounts').select('id, code').in('code', [...new Set(codes)])
    if (data) {
      const map: Record<string, string> = {}
      data.forEach(a => { map[a.code] = a.id })
      setAccountMap(map)
    }
  }

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, category, cost_price, selling_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) setDbProducts(data)
  }

  const loadReceiptSettings = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'receipt_template').single()
    if (data?.value) {
      try { setReceiptSettings(JSON.parse(data.value)) } catch {}
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
      data.forEach(v => {
        const m = v.payment_method || 'Cash'
        split[m] = (split[m] || 0) + (v.total_amount || 0)
      })
      setTodayStats({ count: data.length, total, avgSale: Math.round(total / data.length), crownPts: Math.round(total / 1000) })
      setPaymentSplit(split)
    }
  }

  const loadRecentSales = async () => {
    const { data } = await supabase.from('vouchers')
      .select('ref, description, total_amount, payment_method, posting_date, status, customers(name, whatsapp)')
      .eq('type', 'cash_sale').order('created_at', { ascending: false }).limit(10)
    if (data) setRecentSales(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('cash_sale')
    setAutoRef(ref)
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

  // Totals
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const deliveryTotal = (parseFloat(townDelivery) || 0) + (parseFloat(upcountryShipping) || 0)
  const total = subtotal + deliveryTotal
  const crownPoints = Math.round(subtotal / 1000)

  // Payment amounts
  const currentMethod = PAYMENT_METHODS.find(m => m.id === selectedMethod)!
  const totalSplitPaid = splitLines.reduce((s, l) => s + l.amount, 0)
  const tenderedNum = parseFloat(tendered) || 0
  const change = isSplit ? totalSplitPaid - total : tenderedNum - total

  const margin = lines.reduce((s, l) => {
    const p = dbProducts.find(p => p.id === l.productId)
    return s + (p ? (l.price - p.cost_price) * l.qty : 0)
  }, 0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const resetForm = () => {
    setWaInput(''); setNewCustName(''); setSelectedCust(null)
    setLines([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }])
    setSelectedMethod('cash'); setIsSplit(false); setSplitLines([])
    setTendered(''); setPaymentRef(''); setIsPOD(false)
    setTownDelivery(''); setUpcountryShipping(''); setShowDelivery(false)
    setIsEditMode(false); setEditVoucherData(null); setAppliedBundle(null)
    if (onClearEdit) onClearEdit()
  }

  const openNewSale = () => { resetForm(); loadNextRef(); setShowModal(true) }

  // Update existing voucher (edit mode)
  const updateVoucher = async () => {
    if (!editVoucherData) return
    if (!newCustName.trim()) { showToast('Customer name required', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    
    setPosting(true)
    try {
      // Calculate totals
      const lineItems = lines.filter(l => l.productId && l.amount > 0)
      const newSubtotal = lineItems.reduce((sum, l) => sum + l.amount, 0)
      const deliveryTotal = (parseInt(townDelivery) || 0) + (parseInt(upcountryShipping) || 0)
      const newTotal = newSubtotal + deliveryTotal
      
      // Build payment label
      const paymentLabel = isSplit
        ? splitLines.map(l => PAYMENT_METHODS.find(m => m.id === l.methodId)?.label || l.methodId).join(' + ') + ' + ' + currentMethod.label
        : currentMethod.label

      // Update customer if changed
      const cleaned = waInput.replace(/[\s+\-()]/g, '')
      if (selectedCust) {
        await supabase.from('customers').update({
          name: newCustName.trim(),
          whatsapp: cleaned || null,
        }).eq('id', selectedCust.id)
      }

      // Update voucher
      const { error: vErr } = await supabase.from('vouchers').update({
        subtotal: newSubtotal,
        total_amount: newTotal,
        payment_method: paymentLabel,
        status: isPOD ? 'draft' : 'posted',
        notes: [
          deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
          currentMethod.id === 'pos' ? 'POS Card payment' : '',
          paymentRef ? `Ref: ${paymentRef}` : ''
        ].filter(Boolean).join(' · ') || null,
      }).eq('id', editVoucherData.id)
      
      if (vErr) throw new Error('Voucher update: ' + vErr.message)

      // Get old lines for stock reversal
      const oldLines = editVoucherData.voucher_lines || []
      
      // Reverse old stock changes
      for (const oldLine of oldLines) {
        if (!oldLine.product_id) continue
        const prod = dbProducts.find(p => p.id === oldLine.product_id)
        if (prod) {
          await supabase.from('products').update({ 
            qty_on_hand: prod.qty_on_hand + oldLine.qty 
          }).eq('id', oldLine.product_id)
        }
      }

      // Delete old voucher lines
      await supabase.from('voucher_lines').delete().eq('voucher_id', editVoucherData.id)

      // Insert new voucher lines and update stock
      for (let i = 0; i < lineItems.length; i++) {
        const line = lineItems[i]
        const prod = dbProducts.find(p => p.id === line.productId)
        if (!prod) continue
        
        await supabase.from('voucher_lines').insert({
          voucher_id: editVoucherData.id,
          line_number: i + 1,
          product_id: line.productId,
          description: line.name,
          qty: line.qty,
          unit_cost: prod.cost_price,
          unit_price: line.price,
          subtotal: line.amount,
          total: line.amount
        })
        
        // Deduct new quantity from stock
        const currentQty = prod.qty_on_hand + (oldLines.find((ol: any) => ol.product_id === line.productId)?.qty || 0)
        await supabase.from('products').update({ 
          qty_on_hand: currentQty - line.qty 
        }).eq('id', line.productId)
      }

      showToast(`${editVoucherData.ref} updated successfully`)
      setShowModal(false)
      resetForm()
      loadTodayStats()
      loadRecentSales()
      loadProducts()
      
    } catch (err: any) {
      console.error(err)
      showToast(err.message || 'Update failed', 'error')
    } finally {
      setPosting(false)
    }
  }

  const addSplitLine = () => {
    const nextMethod = PAYMENT_METHODS.find(m => m.id !== selectedMethod) || PAYMENT_METHODS[1]
    setSplitLines([...splitLines, { methodId: nextMethod.id, accountId: accountMap[nextMethod.accountCode] || '', amount: 0, ref: '' }])
    setIsSplit(true)
  }

  const updateSplitLine = (i: number, field: keyof SplitLine, val: string | number) => {
    const nl = [...splitLines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'methodId') {
      const m = PAYMENT_METHODS.find(pm => pm.id === val)
      if (m) nl[i].accountId = accountMap[m.accountCode] || ''
    }
    setSplitLines(nl)
  }

  const post = async () => {
    if (!newCustName.trim()) { showToast('Customer name required', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    // Inventory settings enforcement
    if (invSettings?.block_negative_stock) {
      for (const line of lines) {
        if (!line.productId) continue
        const prod = dbProducts.find(p => p.id === line.productId)
        if (prod && prod.qty_on_hand < line.qty) { showToast(`Insufficient stock for ${prod.name}. Available: ${prod.qty_on_hand} units`, 'error'); return }
      }
    }
    if (invSettings?.block_sell_below_cost) {
      for (const line of lines) {
        if (!line.productId || !line.price) continue
        const prod = dbProducts.find(p => p.id === line.productId)
        if (prod && line.price < prod.cost_price) { showToast(`Selling ${prod.name} below cost price. Adjust price or change settings.`, 'error'); return }
      }
    }
    if (invSettings?.warn_below_min_margin) {
      for (const line of lines) {
        if (!line.productId || !line.price) continue
        const prod = dbProducts.find(p => p.id === line.productId)
        if (prod && prod.selling_price > 0) {
          const margin = ((line.price - prod.cost_price) / line.price) * 100
          if (margin < (invSettings.global_min_margin || 0)) { showToast(`Warning: ${prod.name} margin is ${Math.round(margin)}% — below minimum ${invSettings.global_min_margin}%`, 'error'); return }
        }
      }
    }
    if (!isPOD && !isSplit && currentMethod.showRef && !paymentRef.trim()) {
      showToast(`Please enter the ${currentMethod.label} transaction reference number`, 'error')
      return
    }
    setPosting(true)
    const ref = await nextRef('cash_sale')
    const postingDate = today()

    try {
      // Upsert customer
      const cleaned = waInput.replace(/[\s+\-()]/g, '')
      let customerId = selectedCust?.id || null
      
      // Generate customer code if new customer (not updating existing)
      let customerCode: string | undefined
      if (!selectedCust?.id) {
        const { data: maxCode } = await supabase
          .from('customers')
          .select('code')
          .like('code', 'CONT-%')
          .order('code', { ascending: false })
          .limit(1)
        const lastNum = maxCode?.[0]?.code ? parseInt(maxCode[0].code.replace('CONT-', '')) || 10000 : 10000
        customerCode = `CONT-${lastNum + 1}`
      }
      
      const { data: custData } = await supabase.from('customers').upsert({
        ...(customerCode ? { code: customerCode } : {}),
        name: newCustName.trim(), whatsapp: cleaned || null, customer_type: 'cash',
        segment: 'retail',
        crown_points: (selectedCust?.crown_points || 0) + crownPoints,
        last_purchase_date: postingDate,
        last_purchase_amount: subtotal,
        balance: isPOD ? (selectedCust?.balance || 0) + total : (selectedCust?.balance || 0),
      }, { onConflict: 'whatsapp' }).select('id').single()
      if (custData) customerId = custData.id

      // Get accounts
      const neededCodes = ['4010', '5010', '1110', '1050', '2085']
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4010'); const cogsId = acct('5010')
      const inventoryId = acct('1110')
      const arId = acct('1050'); const delivFloatId = acct('2085') || deliveryAccountId
      if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found')

      // Build payment label for voucher
      const paymentLabel = isSplit
        ? splitLines.map(l => PAYMENT_METHODS.find(m => m.id === l.methodId)?.label || l.methodId).join(' + ') + ' + ' + currentMethod.label
        : currentMethod.label

      // Create journal
      const { data: journal, error: jErr } = await supabase.from('journals').insert({
        ref: 'JV-' + ref, posting_date: postingDate,
        description: `Cash Sale — ${newCustName} — ${ref}`,
        journal_type: 'cash_sale', source_type: 'cash_sale', source_ref: ref,
        posted_by: user?.full_name || 'Unknown', status: 'posted',
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
        // Primary payment method
        const primaryAcctId = accountMap[currentMethod.accountCode]
        if (!primaryAcctId) throw new Error(`Payment account not found for ${currentMethod.label} (code: ${currentMethod.accountCode}). Check Chart of Accounts.`)
        const primaryAmount = isSplit ? total - totalSplitPaid : total
        jLines.push({
          journal_id: journal.id, line_number: ln++,
          account_id: primaryAcctId,
          description: `${currentMethod.label}${paymentRef ? ' · ' + paymentRef : ''} — ${newCustName}`,
          debit: primaryAmount > 0 ? primaryAmount : total, credit: 0
        })
        // Split payment lines
        for (const sl of splitLines) {
          if (!sl.accountId || !sl.amount) continue
          const m = PAYMENT_METHODS.find(pm => pm.id === sl.methodId)
          jLines.push({
            journal_id: journal.id, line_number: ln++,
            account_id: sl.accountId,
            description: `${m?.label || sl.methodId}${sl.ref ? ' · ' + sl.ref : ''} — ${newCustName}`,
            debit: sl.amount, credit: 0
          })
        }
        // Delivery collected
        if (deliveryTotal > 0 && delivFloatId) {
          const delivAcctId = accountMap[currentMethod.accountCode]
          if (delivAcctId) jLines.push({ journal_id: journal.id, line_number: ln++, account_id: delivAcctId, description: `Delivery collected — ${ref}`, debit: deliveryTotal, credit: 0 })
        }
      } else if (isPOD && arId) {
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: arId, description: `POD — ${newCustName} — ${ref}`, debit: total, credit: 0 })
      }

      // Revenue, COGS, Inventory
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: revenueId, description: `Sales — ${ref}`, debit: 0, credit: subtotal })
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
        subtotal, total_amount: total,
        status: isPOD ? 'draft' : 'posted', branch: 'DSM HQ',
        customer_id: customerId, journal_id: journal.id,
        payment_method: paymentLabel,
        notes: [
          deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
          currentMethod.id === 'pos' ? 'POS Card payment' : '',
          paymentRef ? `Ref: ${paymentRef}` : ''
        ].filter(Boolean).join(' · ') || null,
        posted_by: user?.full_name || 'Unknown',
      }).select('id').single()
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      // Voucher lines + stock
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; if (!line.productId) continue
        const prod = dbProducts.find(p => p.id === line.productId); if (!prod) continue
        await supabase.from('voucher_lines').insert({ voucher_id: voucher.id, line_number: i + 1, product_id: line.productId, description: line.name, qty: line.qty, unit_cost: prod.cost_price, unit_price: line.price, subtotal: line.amount, total: line.amount })
        await supabase.from('products').update({ qty_on_hand: prod.qty_on_hand - line.qty }).eq('id', line.productId)
        await supabase.from('item_ledger_entries').insert({ product_id: line.productId, entry_type: 'sale', document_type: 'cash_sale', document_ref: ref, posting_date: postingDate, qty: -line.qty, cost_amount: prod.cost_price * line.qty, location_code: locationCode })
        // Update product_locations balance
        const locObj = locations.find(l => l.code === locationCode)
        if (locObj) {
          await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: locObj.id, location_code: locationCode, qty_on_hand: Math.max(0, (prod.qty_on_hand || 0) - line.qty), last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }
      }

      if (isPOD && customerId && arId) {
        await supabase.from('customer_ledger_entries').insert({ customer_id: customerId, posting_date: postingDate, document_type: 'invoice', document_ref: ref, description: `POD — ${newCustName}`, amount: total, remaining_amount: total, is_open: true, journal_id: journal.id })
      }

      // AUTO-CREATE BANK RECEIPT VOUCHER for non-cash payments
      if (!isPOD && autoReceipt && currentMethod.id !== 'cash') {
        try {
          // Create receipt voucher for the bank/payment account
          const receiptRef = await nextRef('cash_receipt')
          
          // Determine which bank account to credit
          let bankAccountId = accountMap[currentMethod.accountCode]
          if (!bankAccountId) {
            // Fallback: try to find the account
            const { data: bankAcct } = await supabase
              .from('accounts')
              .select('id')
              .eq('code', currentMethod.accountCode)
              .single()
            bankAccountId = bankAcct?.id
          }
          
          if (bankAccountId) {
            // Create receipt journal for the bank deposit
            const { data: receiptJournal, error: rjErr } = await supabase
              .from('journals')
              .insert({
                ref: 'JV-' + receiptRef,
                posting_date: postingDate,
                description: `Auto Bank Receipt — ${currentMethod.label} — ${ref}`,
                journal_type: 'cash_receipt',
                source_type: 'cash_sale',
                source_ref: ref,
                posted_by: user?.full_name || 'Unknown',
                status: 'posted',
              })
              .select('id')
              .single()
            
            if (rjErr) {
              console.error('Receipt journal error:', rjErr)
            } else if (receiptJournal) {
              // Build receipt journal lines: debit bank account, credit cash/payment account
              const receiptJLines: any[] = []
              const lineAmount = isSplit ? total - totalSplitPaid : total
              
              receiptJLines.push({
                journal_id: receiptJournal.id,
                line_number: 1,
                account_id: bankAccountId,
                description: `${currentMethod.label}${paymentRef ? ' · ' + paymentRef : ''} — From ${ref}`,
                debit: lineAmount,
                credit: 0
              })
              
              // Credit the payment account (reverse the debit from cash sale)
              const primaryAcctId = accountMap[currentMethod.accountCode]
              if (primaryAcctId) {
                receiptJLines.push({
                  journal_id: receiptJournal.id,
                  line_number: 2,
                  account_id: primaryAcctId,
                  description: `Deposit received — ${ref}`,
                  debit: 0,
                  credit: lineAmount
                })
              }
              
              // Insert receipt journal lines
              const { error: rjlErr } = await supabase
                .from('journal_lines')
                .insert(receiptJLines)
              
              if (!rjlErr) {
                // Update account balances
                await Promise.all(
                  receiptJLines.map(l =>
                    supabase.rpc('update_account_balance', {
                      p_account_id: l.account_id,
                      p_debit: l.debit,
                      p_credit: l.credit
                    })
                  )
                )
                
                // Create receipt voucher record
                await supabase.from('vouchers').insert({
                  ref: receiptRef,
                  type: 'cash_receipt',
                  posting_date: postingDate,
                  description: `Auto Receipt — ${currentMethod.label} — ${ref}`,
                  subtotal: lineAmount,
                  total_amount: lineAmount,
                  status: 'posted',
                  branch: 'DSM HQ',
                  customer_id: customerId || null,
                  journal_id: receiptJournal.id,
                  payment_method: currentMethod.label,
                  notes: `Auto-created from ${ref}${paymentRef ? ' · Ref: ' + paymentRef : ''}`,
                  posted_by: user?.full_name || 'Unknown'
                })
              }
            }
          }
        } catch (err: any) {
          console.error('Auto-receipt creation failed:', err)
          // Don't fail the main sale if receipt creation fails
        }
      }

      showToast(`${ref} posted · ${isPOD ? 'POD — receipt pending' : `${currentMethod.label} · ${crownPoints} Crown pts`}`)

      // Log bundle sale for analytics (does not touch journals)
      if (appliedBundle && voucher) {
        logBundleSale({
          bundleId: appliedBundle.id,
          voucherId: voucher.id,
          voucherRef: ref,
          customerId: customerId,
          customerName: newCustName,
          bundlePrice: appliedBundle.bundle_price,
          individualTotal: appliedBundle.individual_total,
          soldBy: user?.full_name || 'Unknown',
          postingDate,
        }).catch(err => console.error('Bundle sale log failed:', err))
      }
      
      // Build voucher data for receipt
      if (!isPOD) {
        const receiptData = {
          ref, posting_date: postingDate,
          description: `Cash Sale — ${newCustName}`,
          total_amount: total, subtotal,
          payment_method: currentMethod.label, notes: '', posted_by: user?.full_name || 'Unknown',
          customers: selectedCust ? { name: selectedCust.name, whatsapp: selectedCust.whatsapp, pregnancy_stage: selectedCust.pregnancy_stage, crown_points: (selectedCust.crown_points || 0) + crownPoints } : { name: newCustName, whatsapp: waInput, pregnancy_stage: '', crown_points: crownPoints },
          voucher_lines: lines.filter(l => l.productId).map(l => {
            const prod = dbProducts.find(p => p.id === l.productId)
            return { qty: l.qty, unit_price: l.price, total: l.amount, products: prod ? { name: prod.name, sku: prod.sku, category: '' } : null }
          }),
        }
        setLastVoucher(receiptData)
        setShowModal(false)
        setShowReceipt(true)
      } else {
        setShowModal(false); resetForm()
      }
      loadTodayStats(); loadRecentSales(); loadProducts()

    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  // ── PAYMENT BUTTON COMPONENT ──────────────────
  // ── SVG icons per payment method ─────────────
  const PayIcon = ({ id, color }: { id: string; color: string }) => {
    const s = { width: 22, height: 22 }
    if (id === 'cash') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M6 12h.01M18 12h.01"/>
      </svg>
    )
    if (id === 'mpesa') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="7" y="2" width="10" height="18" rx="2"/>
        <path d="M10 18h4"/>
        <path d="M9 6l3 3 3-3"/>
        <path d="M12 9v5"/>
      </svg>
    )
    if (id === 'mixx') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="7" y="2" width="10" height="18" rx="2"/>
        <path d="M10 18h4"/>
        <path d="M9 7h6M9 11h6M9 15h4"/>
      </svg>
    )
    if (id === 'nmb') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
        <path d="M6 15h4M14 15h4"/>
      </svg>
    )
    if (id === 'crdb') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
        <path d="M3 9l9-5 9 5"/>
        <path d="M12 12v5"/>
      </svg>
    )
    // pos
    return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
        <path d="M6 15h2M10 15h6"/>
        <rect x="6" y="12.5" width="2" height="1.5" rx=".5" fill={color}/>
      </svg>
    )
  }

  const PayBtn = ({ method }: { method: PaymentMethod }) => {
    const isSelected = selectedMethod === method.id
    return (
      <div onClick={() => { setSelectedMethod(method.id); setIsSplit(false); setSplitLines([]) }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isSelected ? `${method.color}18` : 'var(--surface2)', border: `2px solid ${isSelected ? method.color : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', transition: 'all .15s' }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: method.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <PayIcon id={method.id} color={method.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? method.color : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{method.label}</div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{method.sublabel}</div>
        </div>
        {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: method.color, flexShrink: 0 }}></div>}
      </div>
    )
  }

  // ── RENDER ────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(212,135,74,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}></div>
          <div>
            <div className="page-title">Cash Sale</div>
            <div className="page-sub">Counter sales · WhatsApp ID required · Auto-posts journal + Crown points</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadRecentSales}>Refresh</button>
          <button className="btn btn-primary" onClick={openNewSale} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700 }}>+ New Cash Sale</button>
        </div>
      </div>

      {/* TODAY STATS */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card green"><div className="stat-label">Sales Today</div><div className="stat-value">{todayStats.count}</div><div className="stat-change up">↑ Transactions</div></div>
        <div className="stat-card amber"><div className="stat-label">Revenue Today</div><div className="stat-value">{todayStats.total >= 1000000 ? (todayStats.total/1000000).toFixed(2)+'M' : (todayStats.total/1000).toFixed(0)+'K'}</div><div className="stat-change up">↑ TZS</div></div>
        <div className="stat-card blue"><div className="stat-label">Avg Sale</div><div className="stat-value">{todayStats.avgSale >= 1000 ? (todayStats.avgSale/1000).toFixed(0)+'K' : todayStats.avgSale || '—'}</div><div className="stat-change up">↑ TZS</div></div>
        <div className="stat-card yellow"><div className="stat-label">Crown Pts Awarded</div><div className="stat-value">{todayStats.crownPts.toLocaleString()}</div><div className="stat-change up">↑ Today</div></div>
      </div>

      <div className="grid g32" style={{ marginBottom: 20 }}>
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
              <div style={{ fontSize: 32, marginBottom: 10 }}></div>
              <div style={{ fontSize: 14 }}>No sales yet today</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Click + New Cash Sale to start</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Payment</th><th className="td-right">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {recentSales.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <div className="td-bold">{(s.customers as any)?.name || s.description}</div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{s.ref} · {(s.customers as any)?.whatsapp}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{s.payment_method?.includes('M-Pesa') ? '' : s.payment_method?.includes('Cash') ? '' : s.payment_method?.includes('POS') ? '' : ''}</span>
                          <span style={{ fontSize: 12 }}>{s.payment_method}</span>
                        </div>
                      </td>
                      <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{s.total_amount?.toLocaleString()}</td>
                      <td><span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`} style={{ fontSize: 10 }}>{s.status === 'draft' ? 'POD' : 'Posted '}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ textAlign: 'center', padding: 28, cursor: 'pointer', border: '2px dashed var(--accent)' }} onClick={openNewSale}>
            <div style={{ fontSize: 40, marginBottom: 10 }}></div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>New Cash Sale</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>WhatsApp · Products · Payment · Crown points</div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, fontWeight: 700 }}>+ Start New Sale</button>
          </div>

          {Object.keys(paymentSplit).length > 0 && (
            <div className="card card-sm">
              <div className="card-title" style={{ marginBottom: 12 }}>Payment Split — Today</div>
              {Object.entries(paymentSplit).map(([method, amount], i) => {
                const pct = todayStats.total > 0 ? (amount / todayStats.total) * 100 : 0
                const pm = PAYMENT_METHODS.find(m => m.label === method)
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text3)' }}>● {method}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(amount)}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pm?.color || 'var(--accent)', borderRadius: 2 }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL ──────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '20px 0' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '94%', maxWidth: 920, margin: 'auto' }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{isEditMode ? '✏️' : ''}</span>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{isEditMode ? 'Edit Cash Sale' : 'New Cash Sale'}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{isEditMode ? 'Update voucher · Stock adjusted' : 'Posts journal · Crown points · WhatsApp receipt → customer'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: isEditMode ? 'var(--yellow-dim)' : 'var(--surface2)', border: `1px solid ${isEditMode ? 'var(--yellow)' : 'var(--border)'}`, borderRadius: 8, padding: '5px 12px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{isEditMode ? 'EDITING ' : 'SALE NO. '}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: isEditMode ? 'var(--yellow)' : 'var(--accent)' }}>{autoRef}</span>
                  {!isEditMode && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 6 }}>Auto · Read only</span>}
                </div>
                <button onClick={() => { setShowModal(false); if (isEditMode) resetForm() }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text3)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* LEFT — Customer, Products, Delivery */}
              <div style={{ padding: 22, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* STEP 1 — CUSTOMER */}
                <div>
                  <div className="step-header" style={{ marginBottom: 12 }}><div className="step-num">1</div><div className="step-title">CUSTOMER IDENTITY</div></div>
                  <div ref={searchRef} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex' }}>
                      <div style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: 'var(--r) 0 0 var(--r)', padding: '0 10px', display: 'flex', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>+255</div>
                      <input className="form-input" style={{ borderRadius: '0 var(--r) var(--r) 0', borderColor: selectedCust ? 'var(--green)' : 'var(--border)' }}
                        placeholder="7XX XXX XXX — type to search existing customers"
                        value={waInput} onChange={e => searchCustomer(e.target.value)}
                        onFocus={() => custResults.length > 0 && setShowDropdown(true)} />
                    </div>

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
                              <div style={{ fontSize: 11, color: 'var(--yellow)' }}>{(c.crown_points || 0).toLocaleString()} pts</div>
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{tzs(c.balance || 0)} LFV</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedCust ? (
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: 12, marginTop: 8 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}> Existing Customer Found</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>NAME</div><div style={{ fontSize: 13, fontWeight: 600 }}>{selectedCust.name}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>STAGE</div><div style={{ fontSize: 12 }}>{selectedCust.pregnancy_stage || '—'}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>LAST PURCHASE</div><div style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{selectedCust.last_purchase_date || '—'}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>LIFETIME VALUE</div><div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{tzs(selectedCust.balance || 0)}</div></div>
                      </div>
                      <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Crown Points Balance</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)', fontSize: 13 }}>{(selectedCust.crown_points || 0).toLocaleString()} pts</span>
                      </div>
                    </div>
                  ) : (
                    <input className="form-input" style={{ marginTop: 8 }} placeholder="Customer name (new customer)" value={newCustName} onChange={e => setNewCustName(e.target.value)} />
                  )}
                </div>

                {/* STEP 2 — LOCATION */}
                {locations.length > 1 && (
                  <div>
                    <div className="step-header" style={{ marginBottom: 10 }}><div className="step-num">2</div><div className="step-title">SELL FROM LOCATION</div></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {locations.map(loc => (
                        <div key={loc.id} onClick={() => setLocationCode(loc.code)}
                          style={{ flex: 1, padding: '10px 12px', border: `2px solid ${locationCode === loc.code ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', background: locationCode === loc.code ? 'var(--accent-dim)' : 'var(--surface2)', transition: 'all .15s' }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: locationCode === loc.code ? 'var(--accent)' : 'var(--text3)' }}>{loc.code}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{loc.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 3 (was 2) — PRODUCTS */}
                <div>
                  <div className="step-header" style={{ marginBottom: 8 }}><div className="step-num">{locations.length > 1 ? '3' : '2'}</div><div className="step-title">PRODUCTS SOLD</div></div>
                  {/* Bundle quick-pick */}
                  <BundlePicker onApply={(bundleLines, bundle) => {
                    setLines(bundleLines)
                    setAppliedBundle(bundle)
                  }} />
                  {appliedBundle && (
                    <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,.3)', borderRadius: 8, padding: '6px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>Bundle applied: {appliedBundle.name} · Save {tzs(appliedBundle.individual_total - appliedBundle.bundle_price)}</span>
                      <button onClick={() => { setAppliedBundle(null); setLines([{ productId: '', name: '', qty: 1, price: 0, amount: 0 }]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 10, textDecoration: 'underline' }}>Clear</button>
                    </div>
                  )}
                  {/* Category filter strip */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                    <button onClick={() => setFilterCat('all')} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, border: `1px solid ${filterCat === 'all' ? 'var(--accent)' : 'var(--border)'}`, background: filterCat === 'all' ? 'var(--accent)' : 'transparent', color: filterCat === 'all' ? '#fff' : 'var(--text3)', cursor: 'pointer', fontWeight: 600 }}>All</button>
                    {groups.map((g: string) => (
                      <button key={g} onClick={() => setFilterCat(`group:${g}`)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, border: `1px solid ${filterCat === `group:${g}` ? 'var(--accent)' : 'var(--border)'}`, background: filterCat === `group:${g}` ? 'var(--accent-dim)' : 'transparent', color: filterCat === `group:${g}` ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontWeight: 600 }}>{g}</button>
                    ))}
                  </div>
                  {lines.map((line, i) => {
                    const visibleProducts = filterCat === 'all' ? dbProducts
                      : filterCat.startsWith('group:') ? dbProducts.filter(p => {
                          const grp = filterCat.slice(6)
                          return (catsByGroup[grp] || []).some((c: {name:string}) => c.name === p.category)
                        })
                      : dbProducts.filter(p => p.category === filterCat)
                    return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 90px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                        <option value="">— Select product —</option>
                        {visibleProducts.map(p => <option key={p.id} value={p.id}>{p.name} · {tzs(p.selling_price)} · Stk:{p.qty_on_hand}</option>)}
                      </select>
                      <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 13, fontWeight: 700 }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                      <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }} value={line.price} onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} />
                      {lines.length > 1 ? <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button> : <div />}
                    </div>
                    )
                  })}
                  <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>PRODUCT · QTY · PRICE (editable for custom amounts)</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, price: 0, amount: 0 }])}>+ Add item</button>
                </div>

                {/* STEP 3 — DELIVERY (collapsible) */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setShowDelivery(!showDelivery)}>
                    <div className="step-num">3</div>
                    <div className="step-title">DELIVERY / SHIPPING FEES</div>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{showDelivery ? '↑ Hide' : '↓ Add fees'}</span>
                  </div>
                  {showDelivery && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>Posts to 2085 Delivery & Shipping Float — not product revenue</div>
                      <div className="form-row">
                        <FG label="Town Delivery (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={townDelivery} onChange={e => setTownDelivery(e.target.value)} /></FG>
                        <FG label="Upcountry Shipping (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={upcountryShipping} onChange={e => setUpcountryShipping(e.target.value)} /></FG>
                      </div>
                      {deliveryTotal > 0 && (
                        <div style={{ background: 'var(--blue-dim)', border: '1px solid rgba(61,139,255,.2)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text3)' }}>Total delivery/shipping</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{tzs(deliveryTotal)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — Payment + Totals */}
              <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* STEP 4 — PAYMENT */}
                <div>
                  <div className="step-header" style={{ marginBottom: 12 }}><div className="step-num">4</div><div className="step-title">PAYMENT METHOD</div></div>

                  {/* POD toggle */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button onClick={() => setIsPOD(false)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: !isPOD ? 'var(--green-dim)' : 'transparent', border: `1px solid ${!isPOD ? 'var(--green)' : 'var(--border)'}`, color: !isPOD ? 'var(--green)' : 'var(--text3)' }}>Paid at Counter</button>
                    <button onClick={() => setIsPOD(true)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: isPOD ? 'var(--yellow-dim)' : 'transparent', border: `1px solid ${isPOD ? 'var(--yellow)' : 'var(--border)'}`, color: isPOD ? 'var(--yellow)' : 'var(--text3)' }}>Pay on Delivery (POD)</button>
                  </div>

                  {!isPOD && (
                    <>
                      {/* Payment method grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        {PAYMENT_METHODS.map(m => <PayBtn key={m.id} method={m} />)}
                      </div>

                      {/* Ref number for non-cash */}
                      {currentMethod.showRef && (
                        <div style={{ marginBottom: 12 }}>
                          <input className="form-input" placeholder={`${currentMethod.label} reference / transaction number`} value={paymentRef} onChange={e => setPaymentRef(e.target.value)} style={{ fontSize: 12, borderColor: 'var(--accent)' }} />
                        </div>
                      )}

                      {/* Split payment lines */}
                      {isSplit && splitLines.map((sl, i) => {
                        const slMethod = PAYMENT_METHODS.find(m => m.id === sl.methodId)!
                        return (
                          <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 10, marginBottom: 8 }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                              <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={sl.methodId} onChange={e => updateSplitLine(i, 'methodId', e.target.value)}>
                                {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label} — {m.sublabel}</option>)}
                              </select>
                              <button onClick={() => setSplitLines(splitLines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="number" className="form-input" style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 700 }} placeholder="Amount (TZS)" value={sl.amount || ''} onChange={e => updateSplitLine(i, 'amount', parseFloat(e.target.value) || 0)} />
                              {slMethod.showRef && <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="Ref / Transaction No" value={sl.ref} onChange={e => updateSplitLine(i, 'ref', e.target.value)} />}
                            </div>
                          </div>
                        )
                      })}

                      {/* Cash tendered / quick amounts */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>
                          {isSplit ? 'AMOUNT TENDERED FOR CASH PORTION' : currentMethod.id === 'cash' ? 'AMOUNT TENDERED (for change calculation)' : 'TOTAL TO COLLECT'}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, paddingRight: 80 }}
                            placeholder={tzs(total)} value={tendered}
                            onChange={e => setTendered(e.target.value)} />
                          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                            {total > 0 && !tendered ? tzs(total) : ''}
                          </div>
                        </div>
                      </div>

                      {/* Quick amount buttons */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {[50000, 100000, 200000].map(amt => (
                          <button key={amt} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontFamily: 'var(--mono)' }} onClick={() => setTendered(amt.toString())}>{(amt/1000).toFixed(0)}K</button>
                        ))}
                        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontWeight: 700 }} onClick={() => setTendered(total.toString())}>Exact</button>
                      </div>

                      {/* Change */}
                      {tendered && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: change >= 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${change >= 0 ? 'rgba(0,229,160,.2)' : 'rgba(255,71,87,.2)'}`, borderRadius: 'var(--r)', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: 'var(--text3)' }}>Change</span>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(Math.max(0, change))}</span>
                        </div>
                      )}

                      {/* Split payment button */}
                      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={addSplitLine}>+ Split Payment (customer pays with 2+ methods)</button>
                    </>
                  )}

                  {isPOD && (
                    <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 12, fontSize: 12, color: 'var(--yellow)' }}>
                      POD — Stock deducted and sale recorded now. Cash receipt posted manually when rider returns with payment.
                    </div>
                  )}
                </div>

                {/* TOTALS */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Products subtotal</span><span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toLocaleString()}</span></div>
                  {deliveryTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Delivery → Float 2085</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{deliveryTotal.toLocaleString()}</span></div>}
                  {margin > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Gross margin</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(margin)} ({subtotal > 0 ? Math.round((margin/subtotal)*100) : 0}%)</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, padding: '12px 0 0', borderTop: '1px solid var(--border2)', marginTop: 8 }}>
                    <span>TOTAL</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(total)}</span>
                  </div>
                </div>

                {/* Info tags */}
                <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {!isPOD && <div style={{ color: 'var(--green)' }}>WhatsApp receipt auto-sent to customer</div>}
                  {isPOD && <div style={{ color: 'var(--yellow)' }}>Receipt posted manually after delivery</div>}
                  <div style={{ color: 'var(--text3)' }}>Inventory deducted · COGS → 5010 · Revenue → 4010</div>
                  <div style={{ color: 'var(--yellow)' }}>{crownPoints} Crown pts will be awarded</div>
                  {!isPOD && currentMethod.id === 'pos' && <div style={{ color: 'var(--blue)' }}>POS → tagged separately in GL reports from CRDB transfers</div>}
                  {deliveryTotal > 0 && <div style={{ color: 'var(--blue)' }}>{tzs(deliveryTotal)} → Delivery & Shipping Float (2085)</div>}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowModal(false); if (isEditMode) resetForm() }}>Cancel</button>
                  {!isEditMode && <button className="btn btn-ghost btn-sm" style={{ padding: '10px 14px' }}>Draft</button>}
                  <button className="btn btn-primary" onClick={isEditMode ? updateVoucher : post} disabled={posting} style={{ flex: 2, justifyContent: 'center', padding: '12px', fontSize: 13, fontWeight: 700, opacity: posting ? 0.6 : 1 }}>
                    {posting ? (isEditMode ? 'Updating…' : 'Posting…') : isEditMode ? 'Update Sale' : isPOD ? 'Post POD Sale' : `Post · ${currentMethod.label}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceipt && lastVoucher && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          {/* Sticky action bar — always visible at top */}
          <div style={{ background: 'rgba(0,0,0,.95)', borderBottom: '1px solid rgba(255,255,255,.1)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: '#fff' }}>
              Receipt — {lastVoucher.ref}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={() => {
                const win = window.open('', '_blank')
                if (!win) return
                const el = document.getElementById('malkia-receipt-modal')
                if (!el) return
                win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${lastVoucher.ref}</title>
                  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
                  <style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}@media print{body{background:#fff;padding:0}}</style>
                  </head><body>${el.innerHTML}</body></html>`)
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
                  if (!lastVoucher || !waConfig) return
                  const phone = lastVoucher.customers?.whatsapp
                  if (!phone) { alert('No WhatsApp number for this customer'); return }
                  setSending(true)
                  const msg = formatReceiptMessage(waConfig.template_receipt || '', {
                    customer_name: lastVoucher.customers?.name || 'Mama',
                    ref: lastVoucher.ref, date: lastVoucher.posting_date,
                    payment_method: lastVoucher.payment_method,
                    items: lastVoucher.voucher_lines?.map((l: any) => ({ name: l.products?.name || '—', qty: l.qty, amount: l.total })) || [],
                    total: lastVoucher.total_amount,
                  })
                  const result = await sendWhatsApp(waConfig, { to: phone, message: msg, type: 'receipt', ref: lastVoucher.ref, customer_name: lastVoucher.customers?.name })
                  setSending(false)
                  if (result.success) { setWaSent(true) } else { alert('Send failed: ' + result.error) }
                }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                {sending ? 'Sending…' : waSent ? 'Sent ✓' : 'Send via WhatsApp'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowReceipt(false); resetForm(); setWaSent(false) }}>Close</button>
            </div>
          </div>
          {/* Scrollable receipt area */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '24px 20px' }}>
            <div id="malkia-receipt-modal">
              <MalkiaReceipt voucher={lastVoucher} settings={receiptSettings || {
                company_name: 'Malkia Wellness Group Ltd', tagline: 'Reimagining Motherhood',
                address: 'Dar es Salaam, Tanzania', phone: '+255 700 000 000',
                email: 'hello@malkia.co.tz', website: 'www.malkia.co.tz', instagram: '@malkia_tz',
                tin: '—', vrn: '—', primary_color: '#85c2be', accent_color: '#f7a6ad',
                logo_url: '', logo_width: 60, logo_x: 0, logo_y: 0, show_logo: true,
                label_receipt: 'Receipt', label_billed_to: 'Billed To',
                label_items: 'Items Purchased', label_total_paid: 'Total Paid',
                label_crown_points: 'Crown Points', label_midwife_tip: 'Midwife Tip',
                label_konnect: 'Join Malkia Konnect', label_cashier: 'Served by',
                konnect_url: 'https://www.malkia.co.tz/join', konnect_enabled: true,
                konnect_cta_text: 'Join Konnect →',
                konnect_sub_text: 'Weekly guidance · Expert Q&A · Birth prep · Postpartum support',
                konnect_utm_tracking: true,
                community_url: '', community_enabled: false, community_name: 'Mama Community', community_qr_enabled: false,
                show_crown_points: true, show_cashier: true,
                show_care_tip: true, show_stage_message: true,
                footer_message: 'Share your Malkia moment — tag us on Instagram',
                msg_pregnant: 'You are doing something extraordinary. Every choice you make matters, Mama.',
                msg_postpartum: 'The hardest work is invisible. We see you, and we are with you.',
                msg_general: 'Motherhood deserves better. That is why we exist.',
              }} />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
