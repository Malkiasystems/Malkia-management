import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useAuth } from '../../lib/useAuth'
import { checkApprovalRequired, submitForApproval } from '../../lib/useApproval'
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; qty_on_hand: number; cost_price: number }
interface AdjLine { productId: string; qty: number; reason: string }
interface StockLocation { id: string; code: string; name: string; branch_code: string }

export default function StockAdjustment({ onNav }: Props) {
  const userLoc = useUserLocation()
  const { user, isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [lines, setLines] = useState<AdjLine[]>([{ productId: '', qty: 1, reason: '' }])
  const [form, setForm] = useState({ date: today(), ref: '', type: 'increase', reason: 'count', notes: '', locationCode: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadProducts(); loadLocations(); loadNextRef() }, [])

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, qty_on_hand, cost_price').eq('is_active', true).eq('is_service', false).order('name')
    if (data) setProducts(data)
  }

  const loadLocations = async () => {
    const { data } = await supabase.from('stock_locations').select('id, code, name, branch_code').order('code')
    if (data && data.length > 0) {
      setLocations(data)
      const defaultLoc =
        (userLoc.defaultLocationCode && data.find(l => l.code === userLoc.defaultLocationCode)) ||
        data.find(l => l.code === '1002' || /warehouse|godown/i.test(l.name)) ||
        data[0]
      setForm(f => ({ ...f, locationCode: defaultLoc.code }))
    }
  }

  const loadNextRef = async () => {
    const ref = await nextRef('stock_adjustment')
    setForm(f => ({ ...f, ref }))
  }

  const updateLine = (i: number, k: keyof AdjLine, v: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [k]: v as never }; setLines(nl)
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (lines.every(l => !l.productId)) { showToast('Please select at least one product', 'error'); return }
    if (!user) { showToast('You must be signed in', 'error'); return }
    // Defence in depth: locked users cannot adjust stock at another location.
    if (!userLoc.canPostFrom(form.locationCode)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot adjust stock at ${form.locationCode}.`, 'error')
      return
    }

    // ─── Approval gate ─────────────────────────────────────────────────
    // Any stock adjustment is sensitive. Totals are computed from cost price ×
    // qty for the approval threshold check.
    const totalCost = lines.reduce((sum, l) => {
      const prod = products.find(p => p.id === l.productId)
      return sum + (prod ? l.qty * prod.cost_price : 0)
    }, 0)

    const check = await checkApprovalRequired('stock_adjustment', {
      value: totalCost,
      quantity: lines.reduce((s, l) => s + (l.qty || 0), 0),
      meta: { type: form.type, reason: form.reason },
    })

    const canBypass = check.superAdminBypass && isSuperAdmin()
    if (check.requiresApproval && check.blockPosting && !canBypass) {
      await submitStockAdjustmentForApproval(totalCost, check.reason || 'Approval required')
      return
    }

    if (posting) return  // double-submit guard: a second click during posting posts twice (Aisha's PCT-10-0001, twice in 0.9s)
    setPosting(true)

    try {
      // 5082 is the real write-off account. This line used to look for '5080',
      // which does not exist in the chart of accounts, so writeoffId came back
      // undefined and the `&& writeoffId` guard below silently skipped the
      // journal. 6850 is new in migration 028 and carries count/adjustment
      // variance, which is NOT the same thing as a deliberate write-off.
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['1110', '5082', '6850'])
      const inventoryId = acctData?.find(a => a.code === '1110')?.id
      const writeoffId  = acctData?.find(a => a.code === '5082')?.id
      const varianceId  = acctData?.find(a => a.code === '6850')?.id
      if (!inventoryId) throw new Error('Inventory account 1110 not found')
      // Fail BEFORE touching stock, not silently after. A missing account is a
      // setup problem, and posting the stock half of a transaction while
      // dropping the accounting half is what put 90m of adjustments outside
      // the ledger in the first place.
      const counterId = form.type === 'writeoff' ? writeoffId : varianceId
      if (!counterId) throw new Error(
        form.type === 'writeoff'
          ? 'Write-off account 5082 not found — run migration 028'
          : 'Stock Variance account 6850 not found — run migration 028'
      )

      const { error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'stock_adjustment', posting_date: form.date,
        description: `Stock Adjustment — ${form.type} — ${form.reason}`,
        status: 'posted', posted_by: user.full_name, notes: form.notes,
      })  
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      const selectedLoc = locations.find(l => l.code === form.locationCode)

      for (const line of lines) {
        if (!line.productId || !line.qty) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue

        const qtyChange = form.type === 'increase' ? line.qty : -line.qty
        const costAmount = Math.abs(line.qty) * prod.cost_price
        const newQty = prod.qty_on_hand + qtyChange

        await supabase.from('products').update({ qty_on_hand: newQty }).eq('id', line.productId)

        const lr15 = await postLedgerEntry({
          product_id: line.productId,
          entry_type: form.type === 'writeoff' ? 'write_off' : form.type === 'increase' ? 'positive_adjustment' : 'negative_adjustment',
          document_type: 'stock_adjustment', document_ref: form.ref,
          posting_date: form.date, qty: qtyChange, cost_amount: costAmount,
          location: selectedLoc || null,
        })
        if (!lr15.success) throw new Error('Stock ledger write failed: ' + (lr15.error || 'unknown'))

        // Mirror the adjustment into product_locations so location balances stay accurate
        if (selectedLoc) {
          const { data: pl } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const currentLocQty = pl?.qty_on_hand ?? 0
          const newLocQty = Math.max(0, currentLocQty + qtyChange)
          const { error: ck122 } = await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
          if (ck122) throw new Error('product_locations write failed: ' + ck122.message)
        }

        // Journal for EVERY adjustment type, not just write-offs.
        //
        // This block used to read `if (form.type === 'writeoff' && writeoffId)`,
        // so increases and decreases posted nothing at all. That is why 46
        // increases (70,843,588.88) and 39 decreases (19,462,350.67) moved the
        // warehouse and never moved the balance sheet.
        //
        //   increase  → Dr Inventory  / Cr Stock Variance   (found stock)
        //   decrease  → Dr Variance   / Cr Inventory        (shrinkage)
        //   writeoff  → Dr Write-offs / Cr Inventory        (damaged goods)
        //
        // post_journal_transaction (migration 028) does journal + lines +
        // balance updates in ONE transaction and rejects unbalanced entries.
        // If it throws, the catch below surfaces it instead of leaving the
        // stock moved and the books untouched.
        //
        // Zero-cost lines are skipped. A product with no cost_price has no
        // value to move, so the journal would be 0/0 — which the RPC would
        // happily accept (0 debits do equal 0 credits) and post as noise.
        // Worth knowing: 23 of your 39 historical negative adjustments have
        // cost_amount = 0, meaning those products carry quantity with no cost
        // price set. That is a product data gap to fix on the product, not
        // something an empty journal would paper over.
        if (costAmount > 0) {
          const isInbound = form.type === 'increase'
          const counterLabel = form.type === 'writeoff' ? 'Write-off' : 'Stock variance'
          const { error: jErr } = await supabase.rpc('post_journal_transaction', {
            p_ref: 'JV-' + form.ref + '-' + (lines.indexOf(line) + 1),
            p_posting_date: form.date,
            p_description: `${counterLabel} — ${prod.name} — ${form.reason}`,
            p_journal_type: 'stock_adjustment',
            p_source_type: 'stock_adjustment',
            p_source_ref: form.ref,
            p_posted_by: user.full_name,
            p_branch: null,
            p_lines: isInbound
              ? [
                  { account_id: inventoryId, description: `Stock found — ${prod.name}`, debit: costAmount, credit: 0 },
                  { account_id: counterId,   description: `Variance credit — ${prod.name}`, debit: 0, credit: costAmount },
                ]
              : [
                  { account_id: counterId,   description: `${counterLabel} — ${prod.name}`, debit: costAmount, credit: 0 },
                  { account_id: inventoryId, description: `Inventory reduced — ${prod.name}`, debit: 0, credit: costAmount },
                ],
          })
          if (jErr) throw new Error('Journal: ' + jErr.message)
        }
      }

      showToast(`${form.ref} posted · Stock and accounts both updated`)
      onNav('__refresh' as Page)  // stay here, fresh form — a clerk posts several in a row
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  // ─── Approval submission ───────────────────────────────────────────────
  const submitStockAdjustmentForApproval = async (totalCost: number, reason: string) => {
    if (!user) return
    if (posting) return  // double-submit guard: a second click during posting posts twice (Aisha's PCT-10-0001, twice in 0.9s)
    setPosting(true)
    try {
      // Create the pending voucher row
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'stock_adjustment', posting_date: form.date,
        description: `Stock Adjustment — ${form.type} — ${form.reason}`,
        status: 'pending_approval', posted_by: user.full_name, notes: form.notes,
        total_amount: totalCost, subtotal: totalCost,
      }).select('id').single()
      if (vErr) throw new Error('Pending voucher: ' + vErr.message)

      // Build snapshot
      const snapshot = {
        form: {
          date: form.date, ref: form.ref,
          type: form.type as 'increase' | 'decrease',
          reason: form.reason, notes: form.notes,
          locationCode: form.locationCode,
        },
        lines: lines
          .filter(l => l.productId && l.qty > 0)
          .map(l => {
            const prod = products.find(p => p.id === l.productId)
            const unitCost = prod?.cost_price || 0
            return { productId: l.productId, qty: l.qty, unitCost, amount: l.qty * unitCost }
          }),
        total: totalCost,
      }

      const res = await submitForApproval({
        typeCode: 'stock_adjustment',
        referenceType: 'voucher',
        referenceId: voucher!.id,
        referenceNumber: form.ref,
        summary: `Stock ${form.type} · ${form.reason} · ${snapshot.lines.length} products`,
        requestedValue: totalCost,
        payload: snapshot,
        requestedBy: user.id,
      })
      if (!res.success) {
        await supabase.from('vouchers').delete().eq('id', voucher!.id)
        throw new Error(res.error || 'Submission failed')
      }

      // Don't redirect to /approvals — that's approver-only and would
      // show an Access Denied screen to non-approvers. Stay in the
      // vouchers hub instead so the submitter can keep working.
      const approverPhrase = res.assignedToName ? ` · Sent to ${res.assignedToName}` : ''
      showToast(`Submitted for approval · ${reason}${approverPhrase}`, 'success')
      setTimeout(() => onNav('__refresh' as Page), 1500)  // stay here, fresh form — a clerk posts several in a row
    } catch (e: any) {
      showToast(e.message || 'Submission failed', 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Stock Adjustment" icon="" subtitle="Correct stock quantities — physical count, damage, write-off" color="rgba(255,71,87,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Adjustment'}
      journalNote={
        form.type === 'writeoff' ? 'Dr Write-off (5082) · Cr Inventory (1110) · P&L impact'
        : form.type === 'increase' ? 'Dr Inventory (1110) · Cr Stock Variance (6850) · P&L impact'
        : 'Dr Stock Variance (6850) · Cr Inventory (1110) · P&L impact'
      }>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Adjustment Type" req>
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="increase">Increase Stock</option>
              <option value="decrease"> Decrease Stock</option>
              <option value="writeoff">Write-off (Damaged/Expired)</option>
            </select>
          </FG>
          <FG label="Reason">
            <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
              <option value="count">Physical Count Correction</option>
              <option value="damaged">Damaged Goods</option>
              <option value="expired">Expired Products</option>
              <option value="theft">Theft / Shrinkage</option>
              <option value="opening">Opening Stock Entry</option>
            </select>
          </FG>
        </div>
        <div className="form-row">
          <FG label="Submitted By">
            <input className="form-input" readOnly value={user?.full_name || ''} style={{ background: 'var(--surface2)', cursor: 'default' }} />
          </FG>
          <FG label="Location" req>
            <select
              className="form-input"
              value={form.locationCode}
              onChange={e => set('locationCode', e.target.value)}
              disabled={userLoc.isLocked}
              title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
            >
              {locations.length === 0 && <option value="">— Loading —</option>}
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
          <FG label="Notes"><input className="form-input" placeholder="Reason for adjustment" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Products to Adjust</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                <option value="">— Select product —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} (Current: {p.qty_on_hand})</option>)}
              </select>
            </div>
            <div style={{ width: 80 }}>
              <input type="number" className="form-input" style={{ fontSize: 12, textAlign: 'center' }} placeholder="Qty" min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
            </div>
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, paddingBottom: 8 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', qty: 1, reason: '' }])}>+ Add product</button>
        <div style={{ background: form.type === 'writeoff' ? 'var(--red-dim)' : form.type === 'increase' ? 'var(--green-dim)' : 'var(--yellow-dim)', border: `1px solid ${form.type === 'writeoff' ? 'var(--red)' : form.type === 'increase' ? 'var(--green)' : 'var(--yellow)'}`, borderRadius: 'var(--r)', padding: 12, marginTop: 12, fontSize: 11 }}>
          {form.type === 'increase' && <span style={{ color: 'var(--green)' }}>Stock found · Dr Inventory (1110) / Cr Stock Variance (6850) · P&L impact</span>}
          {form.type === 'decrease' && <span style={{ color: 'var(--yellow)' }}>Stock short · Dr Stock Variance (6850) / Cr Inventory (1110) · P&L impact</span>}
          {form.type === 'writeoff' && <span style={{ color: 'var(--red)' }}>Stock written off · Dr Write-off (5082) / Cr Inventory (1110) · P&L impact</span>}
        </div>
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
