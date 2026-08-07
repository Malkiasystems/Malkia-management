import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import QuickAddSupplier from '../../components/QuickAddSupplier'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { GuideTip } from '../../components/GuideMode'
import { receiveBatch } from '../../lib/batchPost'
import {
  EMPTY_BATCH_LINE, tracksBatches, defaultExpiryFrom, suggestBatchNo,
  daysToExpiry, validateBatchLine,
} from '../../lib/batchTypes'
import { resolvePurchaseVat, taxSnapshotFromSettings } from '../../lib/vatEngine'
import { useSettings } from '../../lib/settingsLoader'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import { branchNameOf } from '../../lib/branchLocations'
import type { BranchLite } from '../../lib/branchLocations'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; cost_price: number; qty_on_hand: number; tax_code?: string | null; vat_rate?: number | null; tracks_batches?: boolean | null; shelf_life_days?: number | null }
interface DBSupplier { id: string; name: string; balance_tzs: number }
interface DBAccount { id: string; code: string; name: string; type: string; category: string | null; balance: number | null }
// batchNo / expiryDate are carried on EVERY line and simply ignored for
// products that are not batch tracked, which keeps the line shape uniform and
// avoids a second parallel array to keep in sync with add/remove.
interface PurchaseLine { productId: string; description: string; qty: number; unitCost: number; amount: number; batchNo: string; expiryDate: string }

// Only two things a purchase can be: settled now, or owed.
//
// There used to be four modes — credit / cash / bank / mpesa — but cash, bank
// and mpesa were behaviourally IDENTICAL. All three posted Cr {form.payAccount}
// and differed only in a text label. The Pay From dropdown underneath already
// names the exact account, so the button was asking the same question twice and
// letting the two answers disagree: you could pick 'Cash' and then select CRDB
// Bank, and the voucher would record payment_method 'Cash' while crediting the
// bank. The account is the answer. Derive the label from it.
type PaymentMode = 'credit' | 'now'

// none      supplier issued no VAT invoice — the whole amount is cost
// inclusive prices already contain VAT — extract it
// exclusive VAT is added on top of the prices typed
type VatMode = 'none' | 'inclusive' | 'exclusive'

// Label a payment by the account it came from. Matches the convention already
// used by CashReceipt, SalesInvoice and CustomerReceiptBatchInner: 101x and
// 1040 are cash, 102x is mobile money, 103x is bank. Falls back to the account
// name, which is more informative than a wrong guess.
function methodFromAccount(a?: { code: string; name: string } | null): string {
  if (!a) return 'Paid'
  const c = a.code
  if (c.startsWith('101') || c === '1040') return 'Cash'
  if (c.startsWith('102')) return 'Mobile Money'
  if (c.startsWith('103')) return 'Bank'
  return a.name
}

export default function Purchase({ onNav }: Props) {
  const { user, can, activeCompany } = useAuth()

  // Receiving goods and paying for them are two different jobs. Anyone who can
  // reach this page can bring stock in on account, which records the debt
  // honestly. Actually settling it out of cash, bank or M-Pesa touches money,
  // so it needs accounting.create. Today every user who can open this page has
  // that permission, so this changes nothing for Joe or Barbra — it exists so
  // that the day a warehouse hire gets inventory.grn, they get the receiving
  // half and not the bank.
  const canSettle = can('accounting.create')
  const userLoc = useUserLocation()
  const [toast, setToast] = useState('')
  const { settings } = useSettings()
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [locations, setLocations] = useState<{id:string;code:string;name:string;branch_id?:string|null;branch_code?:string|null}[]>([])
  const [branchList, setBranchList] = useState<BranchLite[]>([])

  const [lines, setLines] = useState<PurchaseLine[]>([{ productId: '', description: '', qty: 1, unitCost: 0, amount: 0, ...EMPTY_BATCH_LINE }])
  const [form, setForm] = useState({
    date: today(),
    ref: 'PUR-10-????',
    supplier: '',
    invoiceRef: '',
    paymentMode: 'credit' as PaymentMode,
    payAccount: '',
    dueDate: '',
    location_code: '1002',
    notes: '',
    // A VAT-registered business buys from registered wholesalers AND from a
    // farmer or duka who issues no VAT invoice. Assuming VAT always applies
    // would claim input tax that does not exist, which is worse than not
    // claiming it. So the page asks, every time, and defaults to the
    // company's usual answer rather than guessing per supplier.
    vatMode: 'none' as VatMode,
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence ─────────────────────────────────────────────────
  type PurchaseDraft = { form: typeof form; lines: PurchaseLine[] }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<PurchaseDraft>('purchase', false)

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(availableDraft.form)
    // A draft saved before the batch fields existed has no batchNo/expiryDate
    // on its lines. Restoring it raw would leave them undefined, which turns
    // the batch inputs into uncontrolled fields and makes line.batchNo.trim()
    // throw in the pre-post duplicate-lot check. Drafts live in localStorage,
    // so this is not hypothetical: anyone mid-purchase at deploy time has one.
    setLines((availableDraft.lines || []).map(l => ({ ...EMPTY_BATCH_LINE, ...l })))
    acknowledgeResume()
  }

  useEffect(() => {
    loadProducts(); loadSuppliers(); loadAccounts(); loadNextRef()
    // branch_id/branch_code ride along so the voucher can stamp the branch of
    // the receiving location (mirrors salesInvoicePost / GRN attribution).
    supabase.from('branches').select('id,code,name,city,is_default').eq('is_active', true).order('code')
      .then(({ data }) => { if (data) setBranchList(data) })
    supabase.from('stock_locations').select('id,code,name,branch_id,branch_code').eq('is_active', true).order('code')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          // Locked users get their assigned location. Unrestricted users
          // default to godown (1002) where most purchases land.
          if (userLoc.defaultLocationCode && data.find(l => l.code === userLoc.defaultLocationCode)) {
            set('location_code', userLoc.defaultLocationCode)
          } else {
            const wh = data.find(l => l.code === '1002') || data[0]
            if (wh) set('location_code', wh.code)
          }
        }
      })
  }, [])

  // Auto-save — skip while ref is initializing or form is empty
  useEffect(() => {
    if (!form.ref || form.ref.includes('????')) return
    const hasAnything =
      form.supplier.trim().length > 0 ||
      form.invoiceRef.trim().length > 0 ||
      form.notes.trim().length > 0 ||
      lines.some(l => l.productId || l.qty !== 1 || l.unitCost > 0)
    if (!hasAnything) return
    saveDraft({ form, lines })
  }, [form, lines, saveDraft])

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, cost_price, qty_on_hand, tax_code, vat_rate, tracks_batches, shelf_life_days').eq('is_active', true).eq('is_service', false).order('name')
    if (data) setProducts(data)
  }
  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name, balance_tzs').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }
  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, type, category, balance').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }
  const loadNextRef = async () => {
    const newRef = await nextRef('purchase')
    set('ref', newRef)
  }

  const addLine = () => setLines([...lines, { productId: '', description: '', qty: 1, unitCost: 0, amount: 0, ...EMPTY_BATCH_LINE }])
  const removeLine = (i: number) => setLines(lines.length > 1 ? lines.filter((_, idx) => idx !== i) : lines)

  const updateLine = (i: number, field: keyof PurchaseLine, value: string | number) => {
    const newLines = [...lines]
    newLines[i] = { ...newLines[i], [field]: value as never }
    if (field === 'productId') {
      const p = products.find(pp => pp.id === value)
      if (p) {
        newLines[i].description = p.name
        if (newLines[i].unitCost === 0) newLines[i].unitCost = p.cost_price || 0
      }
      // Batch defaults follow the product, so switching the product on a line
      // must not leave the previous product's lot code sitting there.
      if (tracksBatches(p)) {
        newLines[i].batchNo    = suggestBatchNo(form.ref, i + 1)
        newLines[i].expiryDate = defaultExpiryFrom(form.date, p?.shelf_life_days)
      } else {
        newLines[i].batchNo    = ''
        newLines[i].expiryDate = ''
      }
    }
    // Recalculate on EVERY field, not just qty/unitCost.
    //
    // This used to be `if (field === 'qty' || field === 'unitCost')`. Picking a
    // product sets unitCost from the product record but is field 'productId',
    // so amount stayed at 0 until the user happened to touch a number field.
    // The line showed qty 1 × 33,291.05 = 0, and so did the total.
    //
    // Not just cosmetic: post() writes `cost_amount: line.amount` per line and
    // only guards on the GRAND total being > 0. So a two-line purchase where
    // line 1 was nudged and line 2 was not would post, taking line 2's stock in
    // at ZERO cost and dragging the product's weighted average cost down with
    // it. Silently.
    newLines[i].amount = (newLines[i].qty || 0) * (newLines[i].unitCost || 0)
    setLines(newLines)
  }

  const taxCfg = taxSnapshotFromSettings(settings.tax)
  // Recovery has to be switched on at company level before any of this is
  // offered. A tenant that is not VAT registered never sees the question.
  const vatAvailable = taxCfg.vatEnabled && (settings.tax?.input_vat_recovery_enabled ?? true)

  // Default to how this company usually buys, but the user still confirms it
  // on every purchase.
  useEffect(() => {
    if (!vatAvailable) { setForm(f => f.vatMode === 'none' ? f : { ...f, vatMode: 'none' }); return }
    setForm(f => ({ ...f, vatMode: (settings.tax?.purchase_costs_include_vat ?? true) ? 'inclusive' : 'exclusive' }))
  }, [vatAvailable, settings.tax?.purchase_costs_include_vat])

  const lineTax = lines.map(l => {
    const prod = products.find(p => p.id === l.productId)
    if (!vatAvailable || form.vatMode === 'none' || !prod) {
      return { gross: l.amount || 0, net: l.amount || 0, vat: 0 }
    }
    return resolvePurchaseVat(l.amount || 0, prod as any, taxCfg, form.vatMode === 'inclusive')
  })

  // net    capitalised into stock and into weighted average cost
  // vat    recoverable, goes to 1150
  // gross  what the supplier is owed and what leaves the bank
  const netTotal   = lineTax.reduce((s, r) => s + r.net, 0)
  const vatTotal   = lineTax.reduce((s, r) => s + r.vat, 0)
  const grossTotal = lineTax.reduce((s, r) => s + r.gross, 0)
  // Kept so existing guards and labels below keep reading the figure that
  // actually leaves the account.
  const totalCost = grossTotal

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type)
  }

  // Bank/Cash accounts to choose from for "Pay now"
  // Note: Excludes inventory account 1110 (which would create Dr Inventory / Cr Inventory and silently zero out)
  // Pay From must offer cash and bank accounts, nothing else.
  //
  // This used to guess by account code, assuming 1100/1101 = cash on hand,
  // 112x = bank, 113x = mobile money. That is somebody else's chart of
  // accounts. In ours, cash and bank live in 10xx (1010 Cash in Hand, 1020
  // M-Pesa, 1030 CRDB) and 11xx is INVENTORY. So the filter matched 1100
  // INVENTORY, 1120 Goods in Transit, 1121 GRN Interim and 1130 Inventory
  // Write-down Reserve — precisely the wrong accounts — and offered them as
  // places to pay a supplier from. The type fallback never rescued it either,
  // because our cash accounts are type 'asset', not 'bank' or 'cash'.
  //
  // category is the discriminator the rest of the app already uses
  // (CashReceipt, CashPayment). Match them rather than inventing a rule.
  const bankCashAccounts = accounts.filter(a => a.category === 'Cash & Bank')

  // Showing the balance next to the account is a control, not a nicety. Paying
  // 55m out of an account holding 41m is the kind of thing you want to see
  // BEFORE you post, not when the balance sheet goes red later.
  const payAcct = accounts.find(a => a.id === form.payAccount)
  const overdrawn = !!payAcct && form.paymentMode !== 'credit' && totalCost > 0 && (payAcct.balance || 0) < totalCost

  const post = async () => {
    if (!form.supplier) { showToast('Please select a supplier', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Please add at least one product', 'error'); return }
    // Catch the silent-skip bug: lines with qty/cost typed but no product picked
    const incompleteLines = lines.filter(l => !l.productId && (l.qty > 0 || l.unitCost > 0 || l.description.trim() !== ''))
    if (incompleteLines.length > 0) {
      showToast(`${incompleteLines.length} line(s) have data but no product selected. Pick from the product dropdown or remove the line.`, 'error')
      return
    }
    if (totalCost <= 0) { showToast('Total must be greater than zero', 'error'); return }
    if (form.paymentMode !== 'credit' && !form.payAccount) {
      showToast('Select the cash/bank account you paid from', 'error'); return
    }
    // Not just the disabled button above. A stale form state or a mode set
    // before permissions loaded must not be able to post money out.
    if (form.paymentMode !== 'credit' && !canSettle) {
      showToast('You can receive on account, but settling from cash or bank needs the accounting.create permission', 'error'); return
    }
    if (!user) { showToast('You must be signed in', 'error'); return }
    // Defence in depth: locked users cannot receive purchases into another location.
    if (!userLoc.canPostFrom(form.location_code)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot receive a purchase into ${form.location_code}.`, 'error')
      return
    }

    // ── Batch validation (101-103) ─────────────────────────────────────────
    // Checked BEFORE setPosting so a blank lot code costs the user a toast,
    // not a half-written voucher. receive_batch raises on an empty batch_no,
    // and it is called deep inside the posting loop after the journal and
    // voucher header are already committed.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.productId) continue
      const prod = products.find(p => p.id === line.productId)
      const problem = validateBatchLine(
        tracksBatches(prod),
        { batchNo: line.batchNo, expiryDate: line.expiryDate },
        prod?.name || `Line ${i + 1}`
      )
      if (problem) { showToast(problem, 'error'); return }
    }
    // Two lines of the same product sharing one batch number would merge into
    // a single lot with one expiry date, quietly. receive_batch tops up by
    // design, so this cannot be caught downstream.
    const seenLots = new Set<string>()
    for (const line of lines) {
      if (!line.productId || !line.batchNo.trim()) continue
      const key = `${line.productId}::${line.batchNo.trim().toLowerCase()}`
      if (seenLots.has(key)) {
        const prod = products.find(p => p.id === line.productId)
        showToast(`Two lines use batch ${line.batchNo.trim()} for ${prod?.name || 'the same product'}. Give each delivery its own batch number, or combine them into one line.`, 'error')
        return
      }
      seenLots.add(key)
    }
    if (!activeCompany?.id && lines.some(l => tracksBatches(products.find(p => p.id === l.productId)))) {
      showToast('No active company. Reload and try again before receiving batch-tracked stock.', 'error')
      return
    }

    if (posting) return  // double-submit guard: a second click during posting posts twice (Aisha's PCT-10-0001, twice in 0.9s)
    setPosting(true)

    try {
      // Resolve key accounts
      const inventoryAcct = accounts.find(a => a.code === '1110')
      const apAcct = accounts.find(a => a.code === '2010')
      if (!inventoryAcct) {
        const codes = accounts.filter(a => a.type === 'asset').slice(0, 8).map(a => a.code).join(', ')
        throw new Error(`Inventory account (code 1110) not found in Chart of Accounts. Asset accounts present: ${codes || 'none'}. Add 1110 = Inventory in Chart of Accounts and try again.`)
      }
      if (form.paymentMode === 'credit' && !apAcct) throw new Error('Accounts Payable (2010) not found in Chart of Accounts. Add it and try again.')
      // Sanity: pay account must not be the inventory account itself
      if (form.paymentMode !== 'credit' && form.payAccount === inventoryAcct.id) {
        throw new Error('You selected the Inventory account as the pay-from account. Pick a Cash or Bank account instead.')
      }

      const supplierObj = suppliers.find(s => s.id === form.supplier)
      const supplierName = supplierObj?.name || 'Supplier'
      const isCredit = form.paymentMode === 'credit'

      // ─── Create journal ────────────────────────────────────────────────
      // Credit purchase: Dr Inventory / Cr Accounts Payable
      // Cash purchase:   Dr Inventory / Cr Bank or Cash
      // Branch of the receiving location — stamped on the journal AND the
      // voucher so ledger reports and voucher books agree.
      const rcvLoc = locations.find(l => l.code === form.location_code)
      const rcvBranch = rcvLoc ? branchNameOf(rcvLoc, branchList) || null : null
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Purchase — ${supplierName} — ${form.ref}`,
        journal_type: 'purchase',
        source_type: 'purchase',
        source_ref: form.ref,
        posted_by: user.full_name,
        status: 'posted',
        branch: rcvBranch,
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const creditAcctId = isCredit ? apAcct!.id : form.payAccount
      const creditAcctLabel = isCredit ? `AP — ${supplierName}` : `Paid via ${accounts.find(a => a.id === form.payAccount)?.name || ''}`

      // Only the goods figure is capitalised into stock. Recoverable VAT is
      // an asset in its own right at 1150, where it offsets what is owed on
      // sales. The supplier is credited the gross, so the journal balances.
      let vatInputAcct: typeof accounts[number] | undefined
      if (vatTotal > 0) {
        vatInputAcct = accounts.find(a => a.code === '1150')
        if (!vatInputAcct) {
          throw new Error('VAT Input account (1150) not found in the Chart of Accounts. Add it, or set this purchase to "No VAT", then post again.')
        }
      }

      const jLines: any[] = [
        { journal_id: journal.id, line_number: 1, account_id: inventoryAcct.id, description: `Stock purchase — ${form.ref}`, debit: netTotal, credit: 0 },
      ]
      if (vatTotal > 0 && vatInputAcct) {
        jLines.push({ journal_id: journal.id, line_number: 2, account_id: vatInputAcct.id, description: `Input VAT — ${form.ref}`, debit: vatTotal, credit: 0 })
      }
      jLines.push({ journal_id: journal.id, line_number: jLines.length + 1, account_id: creditAcctId, description: creditAcctLabel, debit: 0, credit: grossTotal })

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances via RPC
      const balanceUpdates = [
        supabase.rpc('update_account_balance', { p_account_id: inventoryAcct.id, p_debit: netTotal, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: creditAcctId, p_debit: 0, p_credit: grossTotal }),
      ]
      if (vatTotal > 0 && vatInputAcct) {
        balanceUpdates.push(supabase.rpc('update_account_balance', { p_account_id: vatInputAcct.id, p_debit: vatTotal, p_credit: 0 }))
      }
      await Promise.all(balanceUpdates)

      // ─── Create the voucher ─────────────────────────────────────────────
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'purchase',
        posting_date: form.date,
        branch: rcvBranch,
        due_date: isCredit && form.dueDate ? form.dueDate : null,
        description: `Purchase — ${supplierName}${form.invoiceRef ? ` — Inv ${form.invoiceRef}` : ''}`,
        subtotal: netTotal,
        // input_vat_amount, NOT vat_amount. On a voucher, vat_amount is OUTPUT
        // VAT charged on a sale; input_vat_amount is the recoverable tax on a
        // purchase. VATReport.tsx keys the input side of the return off this
        // column, so writing the wrong one makes every purchase invisible to
        // the return while still posting correctly to 1150.
        input_vat_amount: vatTotal,
        total_amount: grossTotal,
        // Derived from the account actually credited, so the voucher can never
        // claim 'Cash' while the money left CRDB.
        payment_method: isCredit ? 'On Account' : methodFromAccount(accounts.find(a => a.id === form.payAccount)),
        status: 'posted',
        supplier_id: form.supplier,
        journal_id: journal.id,
        notes: form.notes,
        posted_by: user.full_name,
      }).select('id').single()
      if (vErr || !voucher) throw new Error(vErr?.message || 'Voucher insert failed')

      // ─── Stock + ledger ─────────────────────────────────────────────────
      const selectedLoc = locations.find(l => l.code === form.location_code)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue

        // Weighted average cost, on the NET figure.
        // This is the part that would stay quietly wrong if only the journal
        // were fixed: recoverable VAT is not part of what the goods cost, so
        // letting it into cost_price would inflate COGS and understate margin
        // on every future sale of this product, forever.
        const lineIdx = lines.indexOf(line)
        const lineNet = lineTax[lineIdx]?.net ?? line.amount
        const netUnitCost = line.qty > 0 ? lineNet / line.qty : 0

        const newQty = prod.qty_on_hand + line.qty
        const newAvgCost = newQty > 0
          ? ((prod.qty_on_hand * prod.cost_price) + lineNet) / newQty
          : netUnitCost

        await supabase.from('products')
          .update({ qty_on_hand: newQty, cost_price: newAvgCost })
          .eq('id', line.productId)

        // ── Batch receipt (101-103) ──────────────────────────────────────
        // Runs BEFORE the ledger entry so the movement can name its lot.
        // Untracked products skip this entirely and post exactly as before.
        //
        // Unit cost passed is the NET figure, matching what goes into the
        // weighted average above. Recoverable VAT is not part of what the
        // goods cost, and stock_batches.unit_cost feeds the value-at-risk
        // figure on the expiry report.
        let batchId: string | null = null
        if (tracksBatches(prod) && selectedLoc && activeCompany?.id) {
          const rb = await receiveBatch({
            companyId:  activeCompany.id,
            productId:  line.productId,
            locationId: selectedLoc.id,
            batchNo:    line.batchNo,
            qty:        line.qty,
            unitCost:   netUnitCost,
            expiryDate: line.expiryDate || null,
            supplierId: form.supplier || null,
            sourceRef:  form.ref,
          })
          if (!rb.success) throw new Error(`Batch receipt failed for ${prod.name}: ${rb.error || 'unknown'}`)
          batchId = rb.batchId || null
        }

        const lr11 = await postLedgerEntry({
          product_id: line.productId,
          entry_type: 'purchase',
          document_type: 'purchase',
          document_ref: form.ref,
          posting_date: form.date,
          qty: line.qty,
          cost_amount: lineNet,
          location: selectedLoc || null,
          batch_id: batchId,
        })
        if (!lr11.success) throw new Error('Stock ledger write failed: ' + (lr11.error || 'unknown'))

        // Mirror into product_locations
        if (selectedLoc) {
          const { data: pl } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const newLocQty = (pl?.qty_on_hand ?? 0) + line.qty
          const { error: ck116 } = await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
          if (ck116) throw new Error('product_locations write failed: ' + ck116.message)
        }

        const { error: ck115 } = await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id,
          line_number: i + 1,
          product_id: line.productId,
          description: line.description,
          qty: line.qty,
          unit_cost: line.unitCost,
          subtotal: line.amount,
          total: line.amount,
        })
        if (ck115) throw new Error('voucher_lines write failed: ' + ck115.message)
      }

      // ─── Supplier-side accounting ────────────────────────────────────────
      if (isCredit) {
        // Credit purchase: increase supplier balance + create open AP entry
        if (supplierObj) {
          await supabase.from('suppliers')
            .update({ balance_tzs: (supplierObj.balance_tzs || 0) + totalCost })
            .eq('id', form.supplier)
        }
        const { error: vleErr } = await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplier,
          posting_date: form.date,
          document_type: 'invoice',
          document_ref: form.ref,
          description: `Purchase — ${supplierName}${form.invoiceRef ? ` (Inv ${form.invoiceRef})` : ''}`,
          amount_tzs: totalCost,
          remaining_amount: totalCost,
          is_open: true,
          due_date: form.dueDate || null,
          journal_id: journal.id,
        })
        // A failed AP entry means the debt would vanish from AP Aging while
        // the journal says it exists — never swallow it.
        if (vleErr) throw new Error('Supplier ledger entry failed: ' + vleErr.message)
      } else {
        // Cash/bank purchase: closed entry so the supplier statement shows
        // the activity. document_type must be in the schema's allowed set
        // (invoice / credit_note / payment / refund) — the old 'cash_purchase'
        // value violated the CHECK constraint and silently dropped the row.
        const { error: vleErr } = await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplier,
          posting_date: form.date,
          document_type: 'invoice',
          document_ref: form.ref,
          description: `Cash Purchase (paid at posting) — ${supplierName}${form.invoiceRef ? ` (Inv ${form.invoiceRef})` : ''}`,
          amount_tzs: 0,             // No outstanding amount; settled at point of purchase
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
        })
        if (vleErr) throw new Error('Supplier ledger entry failed: ' + vleErr.message)
      }

      showToast(
        isCredit
          ? `${form.ref} posted · Stock added · Supplier balance updated · Dr Inventory / Cr AP`
          : `${form.ref} posted · Stock added · Paid from ${accounts.find(a => a.id === form.payAccount)?.name || 'account'}`
      )
      clearDraft()
      setTimeout(() => onNav('__refresh' as Page), 1200)  // stay here, fresh form — a clerk posts several in a row

    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage
      title="Purchase Voucher"
      icon=""
      subtitle="One-shot — stock + supplier liability in one entry"
      color="rgba(133,194,190,.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : (form.paymentMode === 'credit' ? 'Post on Account' : 'Post & Pay')}
      journalNote={
        form.paymentMode === 'credit'
          ? 'Dr Inventory (1110) · Cr Accounts Payable (2010) · Stock updated immediately · Open AP entry created'
          : `Dr Inventory (1110) · Cr ${payAcct ? `${payAcct.name} (${payAcct.code})` : 'the account you pick below'} · Stock updated immediately · No open AP`
      }
    >
      {availableDraft && draftAgeMs !== null && (
        <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
      )}

      <div className="form-row">
        <FG label="Ref">
          <input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }} />
        </FG>
        <FG label="Date" req>
          <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} />
        </FG>
        <FG label="Receive at Location" req>
          <select
            className="form-input"
            value={form.location_code}
            onChange={e => set('location_code', e.target.value)}
            disabled={userLoc.isLocked}
            title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
          >
            {locations.map(l => {
              const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === l.code
              return (
                <option key={l.id} value={l.code} disabled={!isMine}>
                  {l.code} — {l.name}{!isMine ? ' (not assigned)' : ''}
                </option>
              )
            })}
          </select>
        </FG>
      </div>

      <div className="form-row">
        <FG label="Supplier" req>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="form-input" style={{ flex: 1 }} value={form.supplier} onChange={e => set('supplier', e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.balance_tzs > 0 ? ` (owes TZS ${s.balance_tzs.toLocaleString()})` : ''}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setShowNewSupplier(true)}>+ New</button>
          </div>
          <QuickAddSupplier open={showNewSupplier} onClose={() => setShowNewSupplier(false)}
            onCreated={sNew => {
              setSuppliers(prev => [...prev, sNew as any].sort((a, b) => a.name.localeCompare(b.name)))
              set('supplier', sNew.id)
            }} />
        </FG>
        <FG label="Supplier Invoice #">
          <input className="form-input" value={form.invoiceRef} onChange={e => set('invoiceRef', e.target.value)} placeholder="Optional" />
        </FG>
      </div>

      {/* VAT on this purchase. Asked every time rather than assumed, because a
          registered business buys from registered wholesalers AND from
          suppliers who issue no VAT invoice. Hidden entirely when the company
          is not VAT registered. */}
      {vatAvailable && (
        <div style={{ marginTop: 14, marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            VAT on this purchase
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              { key: 'none' as VatMode,      label: 'No VAT',          sub: 'Supplier gave no VAT invoice' },
              { key: 'inclusive' as VatMode, label: 'Included',        sub: 'Costs already contain VAT' },
              { key: 'exclusive' as VatMode, label: 'Added on top',    sub: 'VAT added to costs typed' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => set('vatMode', opt.key)}
                style={{
                  flex: '1 1 150px', textAlign: 'left', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 10,
                  background: form.vatMode === opt.key ? 'rgba(var(--accent-rgb),.10)' : 'var(--surface2)',
                  border: `1px solid ${form.vatMode === opt.key ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: form.vatMode === opt.key ? 'var(--accent)' : 'var(--text)' }}>{opt.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{opt.sub}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            {form.vatMode === 'none'
              ? 'The whole amount goes into stock cost. Nothing is claimed back.'
              : 'Only the goods figure enters stock value and cost averages. The VAT goes to 1150, where it offsets what you owe on sales.'}
          </div>
        </div>
      )}

      {/* Payment mode toggle */}
      <div style={{ marginTop: 14, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([
            { key: 'now' as PaymentMode, label: 'Paid now', sub: 'Pick the account below' },
            { key: 'credit' as PaymentMode, label: 'On Account', sub: 'Pay later' },
          ]).map(opt => {
            const locked = opt.key !== 'credit' && !canSettle
            return (
            <button
              key={opt.key}
              type="button"
              disabled={locked}
              title={locked ? 'Needs the accounting.create permission — you can receive on account instead' : undefined}
              onClick={() => { if (!locked) set('paymentMode', opt.key) }}
              style={{
                flex: '1 1 140px',
                background: form.paymentMode === opt.key ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1px solid ${form.paymentMode === opt.key ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--r)',
                padding: '10px 14px',
                cursor: locked ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: locked ? 0.4 : 1,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: form.paymentMode === opt.key ? 'var(--accent)' : 'var(--text)' }}>{opt.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{locked ? 'No permission' : opt.sub}</div>
            </button>
          )})}
        </div>
        {vatAvailable && form.vatMode !== 'none' && grossTotal > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12, display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text3)' }}>
              <span>Goods (into stock)</span><span style={{ fontFamily: 'var(--mono)' }}>{netTotal.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text3)' }}>
              <span>Input VAT &rarr; 1150 (recoverable)</span><span style={{ fontFamily: 'var(--mono)' }}>{vatTotal.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text)' }}>
              <span>Supplier is owed</span><span style={{ fontFamily: 'var(--mono)' }}>{grossTotal.toLocaleString()}</span>
            </div>
          </div>
        )}
        {!canSettle && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            You can receive goods on account, which records what is owed to the supplier. Settling from cash or
            bank needs the accounting.create permission, so the stock and the money stay separate jobs.
          </div>
        )}
      </div>

      {/* Conditional fields based on payment mode */}
      {form.paymentMode === 'credit' && (
        <div className="form-row" style={{ marginTop: 14 }}>
          <FG label="Due Date">
            <input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </FG>
        </div>
      )}
      {form.paymentMode !== 'credit' && (
        <div className="form-row" style={{ marginTop: 14 }}>
          <FG label="Pay From" req>
            <select className="form-input" value={form.payAccount} onChange={e => set('payAccount', e.target.value)}>
              <option value="">— Select account —</option>
              {bankCashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name} · {tzs(a.balance || 0)}</option>
              ))}
            </select>
            {payAcct && (
              <div style={{ fontSize: 11, marginTop: 6, color: overdrawn ? 'var(--red)' : 'var(--text3)', lineHeight: 1.6 }}>
                {overdrawn
                  ? `${payAcct.name} holds ${tzs(payAcct.balance || 0)} but this purchase is ${tzs(totalCost)}. Posting it will take the account negative — check you are paying from the right place.`
                  : `${payAcct.name} holds ${tzs(payAcct.balance || 0)} · ${tzs((payAcct.balance || 0) - totalCost)} after this purchase`}
              </div>
            )}
          </FG>
        </div>
      )}

      {/* Product lines */}
      <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Items Purchased</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>+ Add line</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Description</th>
                <th style={{ width: 80, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 130, textAlign: 'right' }}>Unit Cost</th>
                <th style={{ width: 140, textAlign: 'right' }}>Subtotal</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const lineProd = products.find(p => p.id === line.productId)
                const lineTracked = tracksBatches(lineProd)
                const lineDays = daysToExpiry(line.expiryDate)
                return (
                <Fragment key={i}>
                <tr>
                  <td>
                    <select className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Select —</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.sku} — {p.name} (in stock: {p.qty_on_hand})</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Item description" />
                  </td>
                  <td>
                    <input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.qty} min={1} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                  </td>
                  <td>
                    <input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.unitCost} min={0} step="0.01" onChange={e => updateLine(i, 'unitCost', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                    {Math.round(line.amount).toLocaleString()}
                  </td>
                  <td>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
                    )}
                  </td>
                </tr>
                {/* ── Batch sub-row (101-103) ────────────────────────────
                    Only for products with tracks_batches on. Everything
                    else keeps the single-row layout it has always had. */}
                {lineTracked && (
                  <tr style={{ background: 'var(--surface2)' }}>
                    <td colSpan={6} style={{ padding: '8px 14px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Batch</span>
                        <input
                          className="form-input"
                          style={{ fontSize: 12, padding: '6px 8px', width: 170, fontFamily: 'var(--mono)' }}
                          value={line.batchNo}
                          placeholder="Lot / batch no."
                          onChange={e => updateLine(i, 'batchNo', e.target.value)}
                        />
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Expires</span>
                        <input
                          type="date"
                          className="form-input"
                          style={{ fontSize: 12, padding: '6px 8px', width: 165, fontFamily: 'var(--mono)' }}
                          value={line.expiryDate}
                          onChange={e => updateLine(i, 'expiryDate', e.target.value)}
                        />
                        {lineDays !== null && lineDays < 0 && (
                          <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>
                            Already expired. It will be received but skipped when picking stock for a sale.
                          </span>
                        )}
                        {lineDays !== null && lineDays >= 0 && lineDays <= 30 && (
                          <span style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600 }}>
                            Short dated, {lineDays} day{lineDays === 1 ? '' : 's'} left. It will be sold first.
                          </span>
                        )}
                        {!line.expiryDate && (
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                            No expiry date. This lot is treated as never urgent and sells after every dated one.
                          </span>
                        )}
                      </div>
                      <GuideTip>This delivery becomes its own batch. The batch number is filled in from the voucher reference so you can post without hunting for a code, but if the carton has a printed lot number, type that instead so it matches the physical box. The expiry date is filled from this product's shelf life; change it if the carton says otherwise. When you sell, Tarakimu picks the batch expiring soonest first, even if it arrived later, so old stock leaves before it becomes a write-off. Two different lots in one delivery need two lines.</GuideTip>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface2)' }}>
                <td colSpan={4} style={{ fontWeight: 700, padding: '10px 14px' }}>Total Purchase Value</td>
                <td className="td-right td-mono" style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', padding: '10px 14px' }}>{tzs(totalCost)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <FG label="Notes">
        <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional — delivery notes, batch info, etc." />
      </FG>

      {/* What this voucher does — explainer */}
      <div style={{ background: 'rgba(133,194,190,.05)', border: '1px solid rgba(133,194,190,.15)', borderRadius: 'var(--r)', padding: '12px 14px', marginTop: 14, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4, fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>What this does</div>
        <div>Stock enters your inventory immediately at the unit cost shown. Average cost recalculated automatically.</div>
        {form.paymentMode === 'credit'
          ? <div>Supplier balance increases by the total — settle later via Payment Voucher or Bank Transfer.</div>
          : <div>Money leaves the selected account at posting — no separate payment voucher needed.</div>
        }
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
