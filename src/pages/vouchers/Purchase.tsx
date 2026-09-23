import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; cost_price: number; qty_on_hand: number }
interface DBSupplier { id: string; name: string; balance_tzs: number }
interface DBAccount { id: string; code: string; name: string; type: string; category: string | null; balance: number | null }
interface PurchaseLine { productId: string; description: string; qty: number; unitCost: number; amount: number }

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

// ── Searchable product picker ────────────────────────────────────────────
// Replaces the raw <select> on purchase lines (Joe, 23 Sep): with 60+ SKUs
// a dropdown is scrolling homework. Type any part of the SKU, name or
// category and pick from the shrinking list. Self-contained: input +
// absolute list, closes on pick, Escape, or clicking elsewhere.
function ProductPicker({ products, value, onChange }: {
  products: { id: string; sku: string; name: string; category?: string; qty_on_hand?: number }[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const sel = products.find(p => p.id === value)
  const needle = q.trim().toLowerCase()
  const hits = needle
    ? products.filter(p =>
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        (p.category || '').toLowerCase().includes(needle)).slice(0, 40)
    : products.slice(0, 40)
  const pick = (id: string) => { onChange(id); setOpen(false); setQ('') }
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="form-input"
        style={{ fontSize: 12, padding: '6px 8px' }}
        placeholder="Type to search product…"
        value={open ? q : (sel ? `${sel.sku} — ${sel.name}` : '')}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQ('') }
          if (e.key === 'Enter' && open && hits.length > 0) { e.preventDefault(); pick(hits[0].id) }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40,
          maxHeight: 240, overflowY: 'auto', marginTop: 2,
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 8, boxShadow: '0 10px 28px rgba(0,0,0,.4)',
        }}>
          {hits.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text3)' }}>No product matches "{q}"</div>
          )}
          {hits.map(p => (
            <div key={p.id}
              onMouseDown={e => { e.preventDefault(); pick(p.id) }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{p.sku}</span> {p.name}
              </span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', flexShrink: 0 }}>{p.qty_on_hand ?? 0} in stock</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Purchase({ onNav }: Props) {
  const { user, can } = useAuth()

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
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  // Quick-add supplier, inline (Joe's request, 23 Sep): same insert shape
  // and SUP-XXX code sequence as the Suppliers page, so rows created here
  // are indistinguishable from ones created there.
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaName, setQaName] = useState('')
  const [qaPhone, setQaPhone] = useState('')
  const [qaContact, setQaContact] = useState('')
  const [qaSaving, setQaSaving] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [locations, setLocations] = useState<{id:string;code:string;name:string}[]>([])

  const [lines, setLines] = useState<PurchaseLine[]>([{ productId: '', description: '', qty: 1, unitCost: 0, amount: 0 }])
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
    setLines(availableDraft.lines)
    acknowledgeResume()
  }

  useEffect(() => {
    loadProducts(); loadSuppliers(); loadAccounts(); loadNextRef()
    supabase.from('stock_locations').select('id,code,name').eq('is_active', true).order('code')
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
    const { data } = await supabase.from('products').select('id, sku, name, cost_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) setProducts(data)
  }
  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name, balance_tzs').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }

  const quickAddSupplier = async () => {
    if (!qaName.trim()) return
    setQaSaving(true)
    try {
      // Same SUP-XXX sequence the Suppliers page uses; a code collision on
      // simultaneous adds is caught by the insert and just needs a retry.
      const { data: lastRow } = await supabase.from('suppliers')
        .select('code').order('code', { ascending: false }).limit(1)
      const lastNum = lastRow?.[0]?.code ? parseInt(String(lastRow[0].code).replace('SUP-', '')) || 0 : 0
      const code = `SUP-${String(lastNum + 1).padStart(3, '0')}`
      const { data: created, error } = await supabase.from('suppliers').insert({
        code, name: qaName.trim(),
        contact_person: qaContact.trim() || null,
        phone: qaPhone.trim() || null,
        email: null, address: null,
        payment_terms: 'COD',
        is_supplier: true, is_vendor: false,
        is_active: true,
      }).select('id, name, balance_tzs').single()
      if (error || !created) throw new Error(error?.message || 'Insert failed')
      setSuppliers(prev => [...prev, { ...created, balance_tzs: created.balance_tzs ?? 0 }].sort((a, b) => a.name.localeCompare(b.name)))
      set('supplier', created.id)
      setShowQuickAdd(false); setQaName(''); setQaPhone(''); setQaContact('')
    } catch (err: any) {
      alert('Could not add supplier: ' + (err?.message || err))
    } finally {
      setQaSaving(false)
    }
  }
  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, type, category, balance').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }
  const loadNextRef = async () => {
    const newRef = await nextRef('purchase')
    set('ref', newRef)
  }

  const addLine = () => setLines([...lines, { productId: '', description: '', qty: 1, unitCost: 0, amount: 0 }])
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

  const totalCost = lines.reduce((s, l) => s + (l.amount || 0), 0)

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
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Purchase — ${supplierName} — ${form.ref}`,
        journal_type: 'purchase',
        source_type: 'purchase',
        source_ref: form.ref,
        posted_by: user.full_name,
        status: 'posted',
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const creditAcctId = isCredit ? apAcct!.id : form.payAccount
      const creditAcctLabel = isCredit ? `AP — ${supplierName}` : `Paid via ${accounts.find(a => a.id === form.payAccount)?.name || ''}`

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: inventoryAcct.id, description: `Stock purchase — ${form.ref}`, debit: totalCost, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: creditAcctId, description: creditAcctLabel, debit: 0, credit: totalCost },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances via RPC
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: inventoryAcct.id, p_debit: totalCost, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: creditAcctId, p_debit: 0, p_credit: totalCost }),
      ])

      // ─── Create the voucher ─────────────────────────────────────────────
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'purchase',
        posting_date: form.date,
        due_date: isCredit && form.dueDate ? form.dueDate : null,
        description: `Purchase — ${supplierName}${form.invoiceRef ? ` — Inv ${form.invoiceRef}` : ''}`,
        total_amount: totalCost,
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

        // Weighted average cost
        const newQty = prod.qty_on_hand + line.qty
        const newAvgCost = newQty > 0
          ? ((prod.qty_on_hand * prod.cost_price) + (line.qty * line.unitCost)) / newQty
          : line.unitCost

        await supabase.from('products')
          .update({ qty_on_hand: newQty, cost_price: newAvgCost })
          .eq('id', line.productId)

        await postLedgerEntry({
          product_id: line.productId,
          entry_type: 'purchase',
          document_type: 'purchase',
          document_ref: form.ref,
          posting_date: form.date,
          qty: line.qty,
          cost_amount: line.amount,
          location: selectedLoc || null,
        })

        // Mirror into product_locations
        if (selectedLoc) {
          const { data: pl } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const newLocQty = (pl?.qty_on_hand ?? 0) + line.qty
          await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }

        await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id,
          line_number: i + 1,
          product_id: line.productId,
          description: line.description,
          qty: line.qty,
          unit_cost: line.unitCost,
          subtotal: line.amount,
          total: line.amount,
        })
      }

      // ─── Supplier-side accounting ────────────────────────────────────────
      if (isCredit) {
        // Credit purchase: increase supplier balance + create open AP entry
        if (supplierObj) {
          await supabase.from('suppliers')
            .update({ balance_tzs: (supplierObj.balance_tzs || 0) + totalCost })
            .eq('id', form.supplier)
        }
        await supabase.from('vendor_ledger_entries').insert({
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
      } else {
        // Cash/bank purchase: log a closed entry against the supplier so their statement shows the activity
        await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplier,
          posting_date: form.date,
          document_type: 'cash_purchase',
          document_ref: form.ref,
          description: `Cash Purchase — ${supplierName}${form.invoiceRef ? ` (Inv ${form.invoiceRef})` : ''}`,
          amount_tzs: 0,             // No outstanding amount; settled at point of purchase
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
        })
      }

      showToast(
        isCredit
          ? `${form.ref} posted · Stock added · Supplier balance updated · Dr Inventory / Cr AP`
          : `${form.ref} posted · Stock added · Paid from ${accounts.find(a => a.id === form.payAccount)?.name || 'account'}`
      )
      clearDraft()
      setTimeout(() => onNav('vouchers'), 1200)

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
          <select className="form-input" value={form.supplier}
            onChange={e => {
              // The last option is the quick-add door: picking it opens the
              // inline mini-form instead of selecting, so nobody abandons a
              // half-typed purchase to go register a supplier first.
              if (e.target.value === '__add_new__') { setShowQuickAdd(true); return }
              set('supplier', e.target.value)
            }}>
            <option value="">— Select supplier —</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.balance_tzs > 0 ? ` (owes TZS ${s.balance_tzs.toLocaleString()})` : ''}
              </option>
            ))}
            <option value="__add_new__">＋ Add new supplier…</option>
          </select>
          {showQuickAdd && (
            <div style={{ marginTop: 8, padding: '12px 14px', border: '1px solid var(--accent)', borderRadius: 10, background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--accent)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Quick-add supplier
              </div>
              <input className="form-input" placeholder="Supplier name *" value={qaName} onChange={e => setQaName(e.target.value)} autoFocus />
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" placeholder="Phone / WhatsApp" value={qaPhone} onChange={e => setQaPhone(e.target.value)} style={{ flex: 1 }} />
                <input className="form-input" placeholder="Contact person" value={qaContact} onChange={e => setQaContact(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowQuickAdd(false); setQaName(''); setQaPhone(''); setQaContact('') }}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={qaSaving || !qaName.trim()} onClick={quickAddSupplier}>
                  {qaSaving ? 'Adding…' : 'Add & select'}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                Registered active with default terms — complete the full profile on the Suppliers page later.
              </div>
            </div>
          )}
        </FG>
        <FG label="Supplier Invoice #">
          <input className="form-input" value={form.invoiceRef} onChange={e => set('invoiceRef', e.target.value)} placeholder="Optional" />
        </FG>
      </div>

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
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <ProductPicker products={products} value={line.productId} onChange={id => updateLine(i, 'productId', id)} />
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
              ))}
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
        {/* The natural place to reach after filling the last row is right
            HERE, not back up at the section header. The header button
            stays for muscle memory; this one is where the hand already is. */}
        <button type="button" onClick={addLine}
          style={{ width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 8,
                   border: '1px dashed var(--border2)', background: 'transparent',
                   color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }}>
          ＋ Add line
        </button>
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

      {/* Floating action bar: on a form this tall the Post button at the
          top is a scroll away exactly when you are done. Sticky at the
          bottom of the scroll, it is always one thumb away, with the
          total beside it so what you are committing to is in view. */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 30, marginTop: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 16px', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border2)',
        boxShadow: '0 -8px 24px rgba(0,0,0,.35)',
      }}>
        <div>
          <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)' }}>Total purchase value</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(totalCost)}</div>
        </div>
        <button type="button" className="btn btn-primary" disabled={posting} onClick={post}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          {posting ? 'Posting…' : (form.paymentMode === 'credit' ? 'Post on Account' : 'Post & Pay')}
        </button>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
