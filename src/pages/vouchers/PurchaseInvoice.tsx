import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import FirstRunSpotlight from '../../components/FirstRunSpotlight'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useSettings } from '../../lib/settingsLoader'
import { resolvePurchaseVat, taxSnapshotFromSettings } from '../../lib/vatEngine'
import { GuideTip } from '../../components/GuideMode'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import { branchNameOf } from '../../lib/branchLocations'
import type { BranchLite } from '../../lib/branchLocations'
import type { Page } from '../../lib/types'

// ════════════════════════════════════════════════════════════════════════
// Purchase Invoice — standalone supplier invoice, GRN-free.
//
// History: this voucher used to be the second leg of a 3-way match. GRN
// received the goods (Dr Inventory / Cr 1121 GRN Interim) and this page
// cleared the interim (Dr 1121 / Cr AP). The GRN voucher has since been
// retired from the OS, so the interim leg no longer exists to clear —
// posting Dr 1121 here would just park value in a dead account forever.
//
// Now: this is a complete purchase document in its own right.
//   On Account:  Dr Inventory (1110) · Cr Accounts Payable (2010)
//                → open vendor ledger entry, supplier balance up, due date
//   Paid now:    Dr Inventory (1110) · Cr the cash/bank/mobile account paid
//                from → closed vendor ledger entry, nothing outstanding
// Stock moves at posting (weighted-average cost, item ledger, per-location
// quantities) because a debit to Inventory without the shelves moving would
// drift the books away from physical stock.
//
// Same journal shape and permission split as the Purchase voucher: anyone
// on the page can record the debt honestly; settling money out requires
// accounting.create.
// ════════════════════════════════════════════════════════════════════════

interface Props { onNav: (p: Page) => void }
interface DBSupplier { id: string; name: string; balance_tzs: number; currency: string }
interface DBProduct {
  id: string; name: string; sku: string; cost_price: number; qty_on_hand: number
  // VAT tagging (076) — decides whether this line carries recoverable input VAT
  tax_code?: string | null; vat_rate?: number | null; price_includes_vat?: boolean | null
}
interface DBAccount { id: string; code: string; name: string; type: string; category: string | null; balance: number | null }
interface InvLine { productId: string; desc: string; qty: number; unitCost: number; amount: number }

type PaymentMode = 'credit' | 'now'

// Label a payment by the account it came from — same convention as Purchase,
// CashReceipt and SalesInvoice: 101x/1040 cash, 102x mobile money, 103x bank.
function methodFromAccount(a?: { code: string; name: string } | null): string {
  if (!a) return 'Paid'
  const c = a.code
  if (c.startsWith('101') || c === '1040') return 'Cash'
  if (c.startsWith('102')) return 'Mobile Money'
  if (c.startsWith('103')) return 'Bank'
  return a.name
}

export default function PurchaseInvoice({ onNav }: Props) {
  const { user, can } = useAuth()
  // Recording the liability is open to anyone on the page; moving money needs
  // accounting.create — mirrors the Purchase voucher's split of jobs.
  const canSettle = can('accounting.create')
  const userLoc = useUserLocation()
  const { settings } = useSettings()

  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  const [products, setProducts] = useState<DBProduct[]>([])
  const [prereqChecked, setPrereqChecked] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [locations, setLocations] = useState<{id:string;code:string;name:string;branch_id?:string|null;branch_code?:string|null}[]>([])
  const [branchList, setBranchList] = useState<BranchLite[]>([])
  const [lines, setLines] = useState<InvLine[]>([{ productId: '', desc: '', qty: 1, unitCost: 0, amount: 0 }])
  const [form, setForm] = useState({
    date: today(), dueDate: '', ref: '', supplier: '',
    supplierRef: '', poRef: '',
    paymentMode: 'credit' as PaymentMode,
    payAccount: '',
    location_code: '1002',
    notes: '',
    // Supplier invoices vary: some quote a net line plus VAT, some quote one
    // tax-inclusive figure. Seeded from settings, overridable per document
    // because the same tenant buys from both kinds of supplier.
    costsIncludeVat: 'default' as 'default' | 'inclusive' | 'exclusive',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence ─────────────────────────────────────────────────
  // Old drafts saved before the GRN-free rework may carry a grnRef key;
  // spreading them into this form simply drops it.
  type PIDraft = { form: typeof form; lines: InvLine[] }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<PIDraft>('purchase-invoice', false)

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(f => ({ ...f, ...availableDraft.form }))
    setLines(availableDraft.lines)
    acknowledgeResume()
  }

  useEffect(() => {
    loadSuppliers(); loadProducts(); loadAccounts(); loadNextRef()
    // branch_id/branch_code ride along so the voucher can stamp the branch of
    // the receiving location (same attribution as Purchase and Sales Invoice).
    supabase.from('branches').select('id,code,name,city,is_default').eq('is_active', true).order('code')
      .then(({ data }) => { if (data) setBranchList(data) })
    supabase.from('stock_locations').select('id,code,name,branch_id,branch_code').eq('is_active', true).order('code')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          if (userLoc.defaultLocationCode && data.find(l => l.code === userLoc.defaultLocationCode)) {
            set('location_code', userLoc.defaultLocationCode)
          } else {
            const wh = data.find(l => l.code === '1002') || data[0]
            if (wh) set('location_code', wh.code)
          }
        }
      })
  }, [])

  // Auto-save once the user types anything meaningful
  useEffect(() => {
    if (!form.ref) return
    const hasAnything =
      form.supplier.trim().length > 0 ||
      form.supplierRef.trim().length > 0 ||
      form.notes.trim().length > 0 ||
      lines.some(l => l.productId || l.desc || l.qty !== 1 || l.unitCost > 0)
    if (!hasAnything) return
    saveDraft({ form, lines })
  }, [form, lines, saveDraft])

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name, balance_tzs, currency').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, sku, cost_price, qty_on_hand, tax_code, vat_rate, price_includes_vat').eq('is_active', true).eq('is_service', false).order('name')
    if (data) setProducts(data)
    setPrereqChecked(true)
  }

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, type, category, balance').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('purchase_invoice')
    setForm(f => ({ ...f, ref }))
  }

  const updateLine = (i: number, field: keyof InvLine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val as never }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].desc = p.name; nl[i].unitCost = p.cost_price; nl[i].amount = nl[i].qty * p.cost_price }
    }
    if (field === 'qty' || field === 'unitCost') nl[i].amount = nl[i].qty * nl[i].unitCost
    setLines(nl)
  }

  // ── Input VAT (076) ──────────────────────────────────────────────────────
  // VAT paid to suppliers is recoverable, so it must NOT sit inside the
  // inventory cost. Left there it inflates the weighted average cost, which
  // inflates COGS on every future sale of that item and never shows up as an
  // out-of-balance journal. Exempt purchases are the exception: that tax is
  // genuinely part of the cost because it can never be claimed back.
  const taxCfg = taxSnapshotFromSettings(settings.tax)
  const recoveryOn = taxCfg.vatEnabled && (settings.tax?.input_vat_recovery_enabled ?? true)
  const costsIncludeVat = form.costsIncludeVat === 'default'
    ? (settings.tax?.purchase_costs_include_vat ?? true)
    : form.costsIncludeVat === 'inclusive'

  const lineTax = lines.map(l => {
    const prod = products.find(p => p.id === l.productId)
    if (!recoveryOn || !prod) {
      return { gross: l.amount, net: l.amount, vat: 0, taxCode: 'none' as const, rate: 0 }
    }
    return resolvePurchaseVat(l.amount, prod, taxCfg, costsIncludeVat)
  })

  // What the supplier is owed, and what we capitalise into stock.
  const total = lineTax.reduce((s, r) => s + r.gross, 0)
  const inputVatTotal = lineTax.reduce((s, r) => s + r.vat, 0)
  const netGoodsTotal = lineTax.reduce((s, r) => s + r.net, 0)

  const bankCashAccounts = accounts.filter(a => a.category === 'Cash & Bank')
  // Balance shown before posting is a control, not a nicety.
  const payAcct = accounts.find(a => a.id === form.payAccount)
  const overdrawn = !!payAcct && form.paymentMode !== 'credit' && total > 0 && (payAcct.balance || 0) < total

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.supplier) { showToast('Please select a supplier', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Please add at least one product line', 'error'); return }
    const incompleteLines = lines.filter(l => !l.productId && (l.qty > 1 || l.unitCost > 0 || l.desc.trim() !== ''))
    if (incompleteLines.length > 0) {
      showToast(`${incompleteLines.length} line(s) have data but no product selected. Pick from the product dropdown or remove the line.`, 'error')
      return
    }
    if (total <= 0) { showToast('Total amount must be greater than zero', 'error'); return }
    if (form.paymentMode !== 'credit' && !form.payAccount) {
      showToast('Select the cash/bank account you paid from', 'error'); return
    }
    if (form.paymentMode !== 'credit' && !canSettle) {
      showToast('You can record the invoice on account, but settling from cash or bank needs the accounting.create permission', 'error'); return
    }
    if (!user) { showToast('You must be signed in', 'error'); return }
    if (!userLoc.canPostFrom(form.location_code)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot receive stock into ${form.location_code}.`, 'error')
      return
    }
    if (posting) return  // double-submit guard: a second click during posting posts twice (Aisha's PCT-10-0001, twice in 0.9s)
    setPosting(true)

    try {
      // Resolve key accounts — Dr Inventory always; Cr AP or the pay account.
      const inventoryAcct = accounts.find(a => a.code === '1110')
      const apAcct = accounts.find(a => a.code === '2010')
      if (!inventoryAcct) throw new Error('Inventory account (1110) not found in Chart of Accounts. Add it and try again.')
      if (form.paymentMode === 'credit' && !apAcct) throw new Error('Accounts Payable (2010) not found in Chart of Accounts. Add it and try again.')
      if (form.paymentMode !== 'credit' && form.payAccount === inventoryAcct.id) {
        throw new Error('You selected the Inventory account as the pay-from account. Pick a Cash or Bank account instead.')
      }

      const supplierObj = suppliers.find(s => s.id === form.supplier)
      const supplierName = supplierObj?.name || 'Supplier'
      const isCredit = form.paymentMode === 'credit'

      // ─── Journal ────────────────────────────────────────────────────────
      // On Account: Dr Inventory (1110) / Cr Accounts Payable (2010)
      // Paid now:   Dr Inventory (1110) / Cr cash・bank・mobile account
      // Branch of the receiving location — stamped on the journal AND the
      // voucher so ledger reports and voucher books agree.
      const rcvLoc = locations.find(l => l.code === form.location_code)
      const rcvBranch = rcvLoc ? branchNameOf(rcvLoc, branchList) || null : null
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Purchase Invoice — ${supplierName} — ${form.ref}`,
        journal_type: 'purchase_invoice',
        source_type: 'purchase_invoice',
        source_ref: form.ref,
        posted_by: user.full_name,
        status: 'posted',
        branch: rcvBranch,
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const creditAcctId = isCredit ? apAcct!.id : form.payAccount
      const creditAcctLabel = isCredit ? `AP — ${supplierName} — ${form.ref}` : `Paid via ${accounts.find(a => a.id === form.payAccount)?.name || ''}`

      // Dr Inventory at NET cost, Dr 1150 for the recoverable tax, Cr the
      // supplier or the pay account for the gross. When recovery is off,
      // inputVatTotal is zero and this collapses to the original two lines.
      const vatInputAcct = accounts.find(a => a.code === '1150')
      if (inputVatTotal > 0 && !vatInputAcct) {
        throw new Error('VAT Input account (1150) not found in the Chart of Accounts. Run migration 076 or add it, then post again.')
      }

      const purchaseJLines: Record<string, unknown>[] = [
        { journal_id: journal.id, line_number: 1, account_id: inventoryAcct.id, description: `Stock — Purchase Invoice ${form.ref}`, debit: netGoodsTotal, credit: 0, supplier_id: form.supplier },
      ]
      if (inputVatTotal > 0 && vatInputAcct) {
        purchaseJLines.push({ journal_id: journal.id, line_number: 2, account_id: vatInputAcct.id, description: `Input VAT — ${form.ref}`, debit: inputVatTotal, credit: 0, supplier_id: form.supplier })
      }
      purchaseJLines.push({ journal_id: journal.id, line_number: purchaseJLines.length + 1, account_id: creditAcctId, description: creditAcctLabel, debit: 0, credit: total, supplier_id: form.supplier })

      {
        const dr = purchaseJLines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
        const cr = purchaseJLines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
        if (Math.abs(dr - cr) > 0.5) {
          throw new Error(`Journal does not balance (Dr ${dr.toLocaleString()} vs Cr ${cr.toLocaleString()}). Nothing was posted.`)
        }
      }

      const { error: jlErr } = await supabase.from('journal_lines').insert(purchaseJLines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: inventoryAcct.id, p_debit: netGoodsTotal, p_credit: 0 }),
        ...(inputVatTotal > 0 && vatInputAcct
          ? [supabase.rpc('update_account_balance', { p_account_id: vatInputAcct.id, p_debit: inputVatTotal, p_credit: 0 })]
          : []),
        supabase.rpc('update_account_balance', { p_account_id: creditAcctId, p_debit: 0, p_credit: total }),
      ])

      // ─── Voucher ────────────────────────────────────────────────────────
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'purchase_invoice',
        posting_date: form.date,
        due_date: isCredit && form.dueDate ? form.dueDate : null,
        description: `Purchase Invoice — ${supplierName}${form.supplierRef ? ` — Inv ${form.supplierRef}` : ''}`,
        total_amount: total,
        subtotal: netGoodsTotal,
        input_vat_amount: inputVatTotal,
        payment_method: isCredit ? 'On Account' : methodFromAccount(accounts.find(a => a.id === form.payAccount)),
        status: 'posted',
        branch: rcvBranch,
        supplier_id: form.supplier,
        journal_id: journal.id,
        notes: [form.notes, form.poRef ? `PO: ${form.poRef}` : ''].filter(Boolean).join(' · ') || null,
        posted_by: user.full_name,
      }).select('id').single()
      if (vErr || !voucher) throw new Error(vErr?.message || 'Voucher insert failed')

      // ─── Stock + ledger ─────────────────────────────────────────────────
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue

        // Weighted average cost — on the NET cost, never the gross. Averaging
        // in recoverable VAT would permanently inflate this product's cost
        // basis and every COGS figure derived from it.
        const lt = lineTax[i]
        const netLineCost = lt.net
        const netUnitCost = line.qty > 0 ? netLineCost / line.qty : line.unitCost
        const newQty = prod.qty_on_hand + line.qty
        const newAvgCost = newQty > 0
          ? ((prod.qty_on_hand * prod.cost_price) + netLineCost) / newQty
          : netUnitCost

        await supabase.from('products')
          .update({ qty_on_hand: newQty, cost_price: newAvgCost })
          .eq('id', line.productId)

        const lr14 = await postLedgerEntry({
          product_id: line.productId,
          entry_type: 'purchase',
          document_type: 'purchase_invoice',
          document_ref: form.ref,
          posting_date: form.date,
          qty: line.qty,
          cost_amount: netLineCost,
          location: rcvLoc || null,
        })
        if (!lr14.success) throw new Error('Stock ledger write failed: ' + (lr14.error || 'unknown'))

        // Mirror into product_locations
        if (rcvLoc) {
          const { data: pl } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', rcvLoc.id).maybeSingle()
          const newLocQty = (pl?.qty_on_hand ?? 0) + line.qty
          const { error: ck121 } = await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: rcvLoc.id, location_code: rcvLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
          if (ck121) throw new Error('product_locations write failed: ' + ck121.message)
        }

        const { error: ck120 } = await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id,
          line_number: i + 1,
          product_id: line.productId,
          description: line.desc,
          qty: line.qty,
          unit_cost: netUnitCost,
          subtotal: netLineCost,
          input_vat_amount: lt.vat,
          tax_code: lt.taxCode,
          vat_rate: lt.rate,
          total: lt.gross,
        })
        if (ck120) throw new Error('voucher_lines write failed: ' + ck120.message)
      }

      // ─── Supplier-side accounting ───────────────────────────────────────
      if (isCredit) {
        if (supplierObj) {
          await supabase.from('suppliers')
            .update({ balance_tzs: (supplierObj.balance_tzs || 0) + total })
            .eq('id', form.supplier)
        }
        const { error: vleErr } = await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplier,
          posting_date: form.date,
          document_type: 'invoice',
          document_ref: form.ref,
          description: `Purchase Invoice — ${supplierName}${form.supplierRef ? ` (Inv ${form.supplierRef})` : ''}`,
          amount_tzs: total,
          remaining_amount: total,
          is_open: true,
          due_date: form.dueDate || null,
          journal_id: journal.id,
        })
        // A failed AP entry means the debt would vanish from AP Aging while
        // the journal says it exists — never swallow it.
        if (vleErr) throw new Error('Supplier ledger entry failed: ' + vleErr.message)
      } else {
        // Settled at posting — closed entry so the supplier statement shows
        // the activity. document_type must be one of the schema's allowed set
        // (invoice / credit_note / payment / refund) — the old 'cash_purchase'
        // value violated the CHECK constraint and silently dropped the row.
        const { error: vleErr } = await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplier,
          posting_date: form.date,
          document_type: 'invoice',
          document_ref: form.ref,
          description: `Purchase Invoice (paid at posting) — ${supplierName}${form.supplierRef ? ` (Inv ${form.supplierRef})` : ''}`,
          amount_tzs: 0,
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
        })
        if (vleErr) throw new Error('Supplier ledger entry failed: ' + vleErr.message)
      }

      showToast(
        isCredit
          ? `${form.ref} posted · Stock added · Dr Inventory / Cr AP · Supplier balance updated`
          : `${form.ref} posted · Stock added · Paid from ${accounts.find(a => a.id === form.payAccount)?.name || 'account'}`
      )
      clearDraft()
      setTimeout(() => onNav('__refresh' as Page), 1200)  // stay here, fresh form — a clerk posts several in a row

    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Purchase Invoice" icon="" subtitle="Supplier invoice — stock in, pay now or on account" color="rgba(168,85,247,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : (form.paymentMode === 'credit' ? 'Post on Account' : 'Post & Pay')}
      journalNote={
        form.paymentMode === 'credit'
          ? 'Dr Inventory (1110) · Cr Accounts Payable (2010) · Stock updated immediately · Open AP entry created'
          : `Dr Inventory (1110) · Cr ${payAcct ? `${payAcct.name} (${payAcct.code})` : 'the account you pick below'} · Stock updated immediately · No open AP`
      }>

      {availableDraft && draftAgeMs !== null && (
        <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Invoice Details</div>
            <div className="form-row">
              <FG label="Invoice No" req><input className="form-input" value={form.ref} readOnly  /></FG>
              <FG label="Invoice Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <div className="form-row">
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
              <FG label="Related PO Ref"><input className="form-input" placeholder="PO-0001" value={form.poRef} onChange={e => set('poRef', e.target.value)} /></FG>
            </div>
            <GuideTip>The invoiced goods enter stock at this location, and the voucher carries that location's branch for branch reports.</GuideTip>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Supplier</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} — Balance: TZS {(s.balance_tzs || 0).toLocaleString()}</option>)}
              </select>
            </FG>
            <FG label="Supplier Invoice Reference">
              <input className="form-input" placeholder="Supplier's own invoice number" value={form.supplierRef} onChange={e => set('supplierRef', e.target.value)} />
            </FG>
            <FG label="Notes">
              <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </FG>
          </div>
        </div>
      </div>

      {/* Payment mode — pay the supplier now, or record the debt */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Payment</div>
        <GuideTip>On Account records what you owe the supplier and tracks it until settled. Paid now takes the money out of the chosen account immediately.</GuideTip>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {([
            { key: 'credit' as PaymentMode, label: 'On Account', sub: 'Record as debt — pay later' },
            { key: 'now' as PaymentMode, label: 'Paid now', sub: 'Pick the account below' },
          ]).map(opt => {
            const locked = opt.key !== 'credit' && !canSettle
            return (
            <button
              key={opt.key}
              type="button"
              disabled={locked}
              title={locked ? 'Needs the accounting.create permission — you can record on account instead' : undefined}
              onClick={() => { if (!locked) set('paymentMode', opt.key) }}
              style={{
                flex: '1 1 160px',
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
                    ? `${payAcct.name} holds ${tzs(payAcct.balance || 0)} but this invoice is ${tzs(total)}. Posting it will take the account negative — check you are paying from the right place.`
                    : `${payAcct.name} holds ${tzs(payAcct.balance || 0)} · ${tzs((payAcct.balance || 0) - total)} after this invoice`}
                </div>
              )}
            </FG>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Invoice Lines</div>
        <GuideTip>Each line adds the product into stock at its invoiced cost. Cost prices re-average automatically.</GuideTip>
        <div className="table-wrap" style={{ marginBottom: 8, marginTop: 8 }}>
          <table>
            <thead><tr><th>Product</th><th>Description</th><th style={{ width: 80, textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right', width: 150 }}>Unit Cost (TZS)</th><th style={{ textAlign: 'right', width: 150 }}>Amount (TZS)</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Select product —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name} (in stock: {p.qty_on_hand})</option>)}
                    </select>
                  </td>
                  <td><input className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.desc} onChange={e => updateLine(i, 'desc', e.target.value)} placeholder="Description" /></td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'center' }} value={line.qty} min={1} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.unitCost} onChange={e => updateLine(i, 'unitCost', parseFloat(e.target.value) || 0)} /></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{line.amount.toLocaleString()}</td>
                  <td><button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', desc: '', qty: 1, unitCost: 0, amount: 0 }])}>+ Add Line</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <div style={{ width: 300, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
            {/* The split only appears when there is a split to show. A tenant
                without recovery sees the same single line as before 076. */}
            {inputVatTotal > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text2)' }}>
                  <span>Goods (into stock at cost)</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{netGoodsTotal.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text2)' }}>
                  <span>Input VAT → 1150 (recoverable)</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{inputVatTotal.toLocaleString()}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: inputVatTotal > 0 ? 6 : 0, paddingTop: inputVatTotal > 0 ? 8 : 0, borderTop: inputVatTotal > 0 ? '1px solid var(--border2)' : 'none' }}>
              <span>{inputVatTotal > 0 ? 'Payable to Supplier' : 'Invoice Total'}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(total)}</span>
            </div>
            {inputVatTotal > 0 && (
              <GuideTip>Only the goods figure enters your stock value and cost averages. The VAT goes to account 1150 where it offsets what you owe on sales. That is why the stock value rises by less than what you paid the supplier.</GuideTip>
            )}
          </div>
        </div>

        {/* Convention override. Most supplier invoices show net plus VAT, most
            shelf prices do not, and the same tenant buys from both kinds. */}
        {recoveryOn && (
          <div className="form-row" style={{ marginTop: 12 }}>
            <FG label="Supplier prices on this invoice">
              <select className="form-input" value={form.costsIncludeVat} onChange={e => set('costsIncludeVat', e.target.value)}>
                <option value="default">Company default ({(settings.tax?.purchase_costs_include_vat ?? true) ? 'VAT inclusive' : 'VAT exclusive'})</option>
                <option value="inclusive">VAT inclusive — VAT is inside the unit costs</option>
                <option value="exclusive">VAT exclusive — VAT added on top of unit costs</option>
              </select>
              <GuideTip>Match this to the paper invoice in front of you. If the supplier shows a net line and a separate VAT line, choose exclusive and key the net unit costs. If they quote one all-in figure, choose inclusive. Getting it wrong misstates both your stock cost and your VAT claim by the same amount.</GuideTip>
            </FG>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
        After posting: Inventory (1110) increases{inputVatTotal > 0 ? ' at net cost · VAT Input (1150) increases' : ''} · {form.paymentMode === 'credit' ? 'AP Suppliers (2010) increases · Open vendor ledger entry · Supplier balance updated' : `${payAcct ? payAcct.name : 'Pay account'} decreases · Vendor ledger shows the settled purchase`} · Stock quantities and average costs updated
      </div>

      <FirstRunSpotlight
        when={prereqChecked && suppliers.length === 0}
        spot="nav-suppliers"
        title="Add your first supplier"
        message="A Purchase Invoice records stock you bought from someone. Create the supplier first — their statement, balance, and AP aging all hang off that record."
        ctaLabel="Take me to Suppliers"
        onCta={() => onNav('suppliers')}
        dismissKey="purchaseinvoice-suppliers"
      />
      <FirstRunSpotlight
        when={prereqChecked && suppliers.length > 0 && products.length === 0}
        spot="nav-inventory"
        title="Now add your first product"
        message="Supplier created — now the invoice needs products to receive into stock. Create at least one product, then record what you bought."
        ctaLabel="Take me to Products"
        onCta={() => onNav('inventory')}
        dismissKey="purchaseinvoice-products"
      />
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
