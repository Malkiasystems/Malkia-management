import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { printStockTransferNote } from '../../lib/stockTransferPdf'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface TxLine { productId: string; qty: number; cost: number }
interface StockLocation { id: string; code: string; name: string; branch_code: string }

export default function StockTransfer({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const userLoc = useUserLocation()
  // Super-admin only: post both legs at once (skip the accept step).
  const [instant, setInstant] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<{id:string;name:string;cost_price:number;qty_on_hand:number}[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [fromLocStocks, setFromLocStocks] = useState<Record<string, number>>({})
  const [lines, setLines] = useState<TxLine[]>([{ productId: '', qty: 1, cost: 0 }])
  const [form, setForm] = useState({ date: today(), ref: '', fromLocation: '', toLocation: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  // Reload per-location stock whenever the source location changes
  useEffect(() => {
    const loadFromLocStock = async () => {
      if (!form.fromLocation) { setFromLocStocks({}); return }
      const { data } = await supabase
        .from('product_locations')
        .select('product_id, qty_on_hand')
        .eq('location_code', form.fromLocation)
      const map: Record<string, number> = {}
      ;(data || []).forEach((r: any) => { map[r.product_id] = r.qty_on_hand || 0 })
      setFromLocStocks(map)
    }
    loadFromLocStock()
  }, [form.fromLocation])

  const loadData = async () => {
    const [{ data: prods }, { data: locs }] = await Promise.all([
      supabase.from('products').select('id, name, cost_price, qty_on_hand').eq('is_active', true).order('name'),
      supabase.from('stock_locations').select('id, code, name, branch_code').eq('is_active', true).order('code'),
    ])
    if (prods) setProducts(prods)
    // Use nextRef from refs.ts — handles count internally with fallback
    const stpRef = await nextRef('stock_transfer')
    if (locs && locs.length > 0) {
      setLocations(locs)
      // Locked users get their own location forced as the source. The
      // destination defaults to a different location (or stays equal — the
      // form will prompt them to change it). Unrestricted users see the
      // first two locations as a sensible default pair.
      const defaultFrom = userLoc.defaultLocationCode && locs.find(l => l.code === userLoc.defaultLocationCode)
        ? userLoc.defaultLocationCode
        : locs[0].code
      const defaultTo = locs.find(l => l.code !== defaultFrom)?.code ?? defaultFrom
      setForm(f => ({ ...f, ref: stpRef, fromLocation: defaultFrom, toLocation: defaultTo }))
    } else {
      setForm(f => ({ ...f, ref: stpRef }))
    }
  }

  const updateLine = (i: number, field: keyof TxLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) nl[i].cost = p.cost_price
    }
    setLines(nl)
  }

  const totalValue = lines.reduce((s, l) => s + l.qty * l.cost, 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }
  const fromLoc = locations.find(l => l.code === form.fromLocation)
  const toLoc = locations.find(l => l.code === form.toLocation)

  const post = async () => {
    if (!form.fromLocation || !form.toLocation) { showToast('Select From and To locations', 'error'); return }
    if (form.fromLocation === form.toLocation) { showToast('From and To locations cannot be the same', 'error'); return }
    if (lines.every(l => !l.productId || !l.qty)) { showToast('Add at least one product', 'error'); return }
    if (!fromLoc || !toLoc) { showToast('Invalid locations', 'error'); return }
    if (!user) { showToast('You must be signed in', 'error'); return }
    // Defence in depth: locked users can only transfer OUT of their own
    // location. To pull stock FROM somewhere else they must use the Transfer
    // Request flow (which an approver at that source will execute).
    if (!userLoc.canTransferFrom(form.fromLocation)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}, so you can only dispatch from there. Ask someone at ${form.fromLocation} to send the stock to you.`, 'error')
      return
    }
    setPosting(true)
    try {
      const fromLabel = `${fromLoc.code} — ${fromLoc.name}`
      const toLabel = `${toLoc.code} — ${toLoc.name}`

      const validLines = lines.filter(l => l.productId && l.qty)
      const productIds = [...new Set(validLines.map(l => l.productId))]

      // Fresh product cost + names for the dispatch payload and the printed note.
      const { data: freshProducts } = await supabase
        .from('products').select('id, name, cost_price').in('id', productIds)
      const prodById: Record<string, { id: string; name: string; cost_price: number }> = {}
      ;(freshProducts || []).forEach((p: any) => { prodById[p.id] = p })

      const payloadLines = validLines.map(l => ({
        productId: l.productId,
        qty: l.qty,
        cost: prodById[l.productId]?.cost_price || 0,
      }))

      // Atomic dispatch. Posts the OUT leg now and marks the transfer
      // in-transit; the destination must accept before stock lands there.
      // A super admin may post instantly (both legs) via the toggle.
      const { data: res, error: rpcErr } = await supabase.rpc('dispatch_stock_transfer', {
        p_ref: form.ref,
        p_user_id: user.id,
        p_from_location_id: fromLoc.id,
        p_to_location_id: toLoc.id,
        p_lines: payloadLines,
        p_notes: form.notes || null,
        p_instant: instant && isSuperAdmin(),
      })
      if (rpcErr) throw new Error(rpcErr.message)
      if (!res?.success) throw new Error(res?.error || 'Transfer failed')

      const completed = res.status === 'completed'
      showToast(
        completed
          ? `${form.ref} transferred · ${fromLabel} → ${toLabel}`
          : `${form.ref} dispatched · ${fromLabel} → ${toLabel} · awaiting acceptance at ${toLoc.code}`
      )

      // Branded dispatch/transfer note. Best-effort: a blocked pop-up must
      // never undo a successful post. Money hidden for stock-workspace users.
      try {
        await printStockTransferNote({
          ref: form.ref, date: form.date, fromLabel, toLabel,
          notes: form.notes, postedBy: user.full_name,
          showValues: user?.workspace_role !== 'stock',
          lines: validLines.map(l => ({
            name: prodById[l.productId]?.name || l.productId,
            qty: l.qty, cost: prodById[l.productId]?.cost_price || 0,
          })),
        })
      } catch (e) {
        console.error('Transfer note print failed (non-blocking):', e)
      }

      setTimeout(() => onNav(completed ? 'stock-transfer-register' : 'stock-transfer-approvals'), 1500)
    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Stock Transfer" icon="" subtitle="Move stock between locations — total inventory unchanged" color="rgba(61,139,255,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Confirm Transfer'}
      journalNote="Item ledger updated · Location balances updated · Total stock unchanged">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        {/* For locked users: explain that this page is for OUTBOUND transfers
            from their own location only. To pull stock IN from elsewhere they
            must use the Transfer Request flow (which an approver at the source
            executes for them). The banner doubles as a nav shortcut. */}
        {userLoc.isLocked && (
          <div style={{ background: '#3d8bff14', border: '1px solid #3d8bff44', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              You are locked to <strong style={{ color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{userLoc.defaultLocationCode}</strong>. You can only dispatch stock OUT from here. Stock other locations send you appears under Incoming Transfers, where you accept it.
            </div>
            <button
              onClick={() => onNav('stock-transfer-approvals')}
              style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Incoming Transfers
            </button>
          </div>
        )}
        <div className="form-row">
          <FG label="From Location" req>
            <select
              className="form-input"
              value={form.fromLocation}
              onChange={e => set('fromLocation', e.target.value)}
              disabled={userLoc.isLocked}
              title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode} — locked users cannot pick another source. Use Transfer Request to pull stock from elsewhere.` : ''}
            >
              <option value="">— Select source —</option>
              {locations.map(l => {
                const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === l.code
                return (
                  <option key={l.id} value={l.code} disabled={!isMine}>
                    {l.code} — {l.name}{!isMine ? ' (use Transfer Request)' : ''}
                  </option>
                )
              })}
            </select>
          </FG>
          <FG label="To Location" req>
            <select className="form-input" value={form.toLocation} onChange={e => set('toLocation', e.target.value)}>
              <option value="">— Select destination —</option>
              {locations.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name}</option>)}
            </select>
          </FG>
        </div>
        {fromLoc && toLoc && form.fromLocation !== form.toLocation && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{fromLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fromLoc.name}</div>
            </div>
            <svg width="32" height="16" viewBox="0 0 32 16" fill="none"><path d="M0 8h28M22 2l8 6-8 6" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round"/></svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{toLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{toLoc.name}</div>
            </div>
          </div>
        )}
        {form.fromLocation === form.toLocation && form.fromLocation && (
          <div style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--mono)' }}>From and To cannot be the same location</div>
        )}
        <FG label="Notes"><input className="form-input" placeholder="e.g. Restocking front office from warehouse" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
          Stock leaves the source now and sits <strong style={{ color: 'var(--blue)' }}>in transit</strong>. It only lands at {form.toLocation || 'the destination'} once someone there accepts it in <strong>Incoming Transfers</strong>.
        </div>
        {isSuperAdmin() && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={instant} onChange={e => setInstant(e.target.checked)} />
            Post instantly — skip the acceptance step (super-admin override)
          </label>
        )}
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Items to Transfer</div>
        {lines.map((line, i) => {
          const atSource = line.productId ? (fromLocStocks[line.productId] ?? 0) : null
          const overLimit = atSource != null && line.qty > atSource
          return (
            <div key={i}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, marginBottom: overLimit ? 4 : 8, alignItems: 'center' }}>
                <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                  <option value="">— Select product —</option>
                  {products.map(p => {
                    const a = fromLocStocks[p.id] ?? 0
                    const total = p.qty_on_hand
                    const elsewhere = Math.max(0, total - a)
                    const elsewhereNote = elsewhere > 0 ? ` (${elsewhere} at other locations)` : ''
                    return (
                      <option key={p.id} value={p.id} disabled={a <= 0}>
                        {p.name} · {a} at {form.fromLocation || 'source'}{elsewhereNote}
                      </option>
                    )
                  })}
                </select>
                <input type="number" className="form-input" style={{ textAlign: 'center', borderColor: overLimit ? 'var(--red)' : undefined }} min={1} max={atSource ?? undefined} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
              </div>
              {overLimit && (
                <div style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'var(--mono)', marginBottom: 8, paddingLeft: 4 }}>
                  Only {atSource} available at {form.fromLocation} — reduce qty
                </div>
              )}
            </div>
          )
        })}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', qty: 1, cost: 0 }])}>+ Add item</button>
        {totalValue > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: 'var(--text3)' }}>Transfer value at cost</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{tzs(totalValue)}</span>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
