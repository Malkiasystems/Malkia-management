// ════════════════════════════════════════════════════════════════════════════
// StockCount.tsx
// Physical stock count / verification. Create a count (all items, or only items
// SOLD or MOVED in a period, at a location), which snapshots system stock and
// builds a blind count sheet. Print it, count, enter the figures, review the
// variances, and settle — settling posts stock adjustments so the system matches
// what you physically counted. Count corrections adjust quantity only (no P&L),
// mirroring the Stock Adjustment voucher's "increase/decrease" behaviour.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { postLedgerEntry } from '../lib/itemLedger'
import { renderElementToPdfBlob } from '../lib/customerDocuments'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface Loc { id: string; code: string; name: string }
interface CountRow { id: string; ref: string | null; name: string | null; location_code: string | null; scope: string | null; scope_detail: string | null; status: string; created_at: string | null; settled_at: string | null }
interface Line { id: string; product_id: string; sku: string | null; product_name: string | null; category: string | null; unit_cost: number; system_qty: number; counted_qty: number | null; settled: boolean }

function fmt(s: string | null) { if (!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function iso(d: Date) { const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
function weekAgo() { const d = new Date(); d.setDate(d.getDate() - 7); return iso(d) }

export default function StockCount({ onNav: _onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const canSettle = isSuperAdmin() || can('inventory.adjust')

  const [view, setView] = useState<'list' | 'detail'>('list')
  const [counts, setCounts] = useState<CountRow[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  // new-count form
  const [showNew, setShowNew] = useState(false)
  const [nfLoc, setNfLoc] = useState('')
  const [nfScope, setNfScope] = useState<'all' | 'sold' | 'moved' | 'category'>('all')
  const [nfFrom, setNfFrom] = useState(weekAgo())
  const [nfTo, setNfTo] = useState(iso(new Date()))
  const [nfCategory, setNfCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  // detail
  const [active, setActive] = useState<CountRow | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [entry, setEntry] = useState<Record<string, string>>({})

  const loadList = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('stock_counts').select('*').order('created_at', { ascending: false }).limit(100)
    setCounts((data || []) as CountRow[]); setLoading(false)
  }, [])

  useEffect(() => {
    loadList()
    supabase.from('stock_locations').select('id, code, name').eq('is_active', true).order('code').then(({ data }) => {
      setLocations((data || []) as Loc[]); if (data && data[0]) setNfLoc(data[0].code)
    })
    supabase.from('products').select('category').eq('is_active', true).then(({ data }) => {
      setCategories(Array.from(new Set((data || []).map((p: any) => p.category).filter(Boolean))).sort())
    })
  }, [loadList])

  const createCount = async () => {
    const loc = locations.find(l => l.code === nfLoc)
    if (!loc) { flash('Pick a location.', 'err'); return }
    setBusy(true)
    try {
      // 1. resolve in-scope product ids
      let productIds: string[] | null = null
      if (nfScope === 'sold' || nfScope === 'moved') {
        let q = supabase.from('item_ledger_entries').select('product_id').gte('posting_date', nfFrom).lte('posting_date', nfTo).limit(5000)
        if (nfScope === 'sold') q = q.eq('entry_type', 'sale')
        const { data: led } = await q
        productIds = Array.from(new Set((led || []).map((r: any) => r.product_id).filter(Boolean)))
        if (productIds.length === 0) { setBusy(false); flash('No items ' + nfScope + ' in that period.', 'err'); return }
      }
      // 2. load products
      let pq = supabase.from('products').select('id, sku, name, category, cost_price, qty_on_hand').eq('is_active', true)
      if (nfScope === 'category' && nfCategory) pq = pq.eq('category', nfCategory)
      if (productIds) pq = pq.in('id', productIds)
      const { data: prods } = await pq
      if (!prods || prods.length === 0) { setBusy(false); flash('No products in scope.', 'err'); return }
      // 3. snapshot location qty
      const ids = prods.map((p: any) => p.id)
      const { data: pls } = await supabase.from('product_locations').select('product_id, qty_on_hand').eq('location_id', loc.id).in('product_id', ids)
      const locQty = new Map<string, number>()
      ;(pls || []).forEach((r: any) => locQty.set(r.product_id, r.qty_on_hand || 0))
      // 4. insert count + lines
      const ref = 'CNT-' + iso(new Date()).replace(/-/g, '') + '-' + Math.floor(Math.random() * 900 + 100)
      const label = nfScope === 'all' ? 'All items' : nfScope === 'category' ? nfCategory : `${nfScope} ${nfFrom}→${nfTo}`
      const { data: cnt, error: cErr } = await supabase.from('stock_counts').insert({
        ref, name: `${loc.code} · ${label}`, location_code: loc.code, location_id: loc.id,
        scope: nfScope, scope_detail: label, period_from: (nfScope === 'sold' || nfScope === 'moved') ? nfFrom : null,
        period_to: (nfScope === 'sold' || nfScope === 'moved') ? nfTo : null, status: 'open',
        counted_by_name: user?.full_name || null,
      }).select('*').single()
      if (cErr || !cnt) throw new Error(cErr?.message || 'Create failed')
      const lineRows = prods.map((p: any) => ({
        count_id: cnt.id, product_id: p.id, sku: p.sku, product_name: p.name, category: p.category,
        unit_cost: p.cost_price || 0, system_qty: locQty.get(p.id) ?? 0, counted_qty: null, settled: false,
      }))
      await supabase.from('stock_count_lines').insert(lineRows)
      setBusy(false); setShowNew(false)
      flash(`Count ${ref} created — ${lineRows.length} items`)
      openCount(cnt as CountRow)
      loadList()
    } catch (e: any) { setBusy(false); flash('Failed: ' + (e?.message || 'unknown'), 'err') }
  }

  const openCount = async (c: CountRow) => {
    setActive(c); setView('detail'); setLoading(true)
    const { data } = await supabase.from('stock_count_lines').select('*').eq('count_id', c.id).order('product_name')
    const ls = (data || []) as Line[]
    setLines(ls)
    const e: Record<string, string> = {}
    ls.forEach(l => { if (l.counted_qty != null) e[l.id] = String(l.counted_qty) })
    setEntry(e); setLoading(false)
  }

  const saveCounts = async () => {
    setBusy(true)
    const updates = lines.filter(l => entry[l.id] !== undefined && entry[l.id] !== '').map(l => ({ id: l.id, counted_qty: parseFloat(entry[l.id]) }))
    for (const u of updates) await supabase.from('stock_count_lines').update({ counted_qty: u.counted_qty }).eq('id', u.id)
    setBusy(false)
    setLines(prev => prev.map(l => entry[l.id] !== undefined && entry[l.id] !== '' ? { ...l, counted_qty: parseFloat(entry[l.id]) } : l))
    flash('Counts saved')
  }

  const settle = async () => {
    if (!active) return
    const disc = lines.filter(l => l.counted_qty != null && l.counted_qty !== l.system_qty && !l.settled)
    if (disc.length === 0) { flash('No unsettled discrepancies.', 'err'); return }
    if (!confirm(`Settle ${disc.length} discrepancies? This posts stock adjustments to make the system match your counts.`)) return
    setBusy(true)
    try {
      const loc = locations.find(l => l.code === active.location_code)

      // Settling a count moves stock, so it must move the accounts too. This
      // page had no journal code at all, which is part of why account 1110
      // drifted away from the stock module. Resolve the accounts up front and
      // fail here rather than halfway through the loop with stock already
      // changed and nothing in the ledger.
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['1110', '6850'])
      const inventoryId = acctData?.find(a => a.code === '1110')?.id
      const varianceId = acctData?.find(a => a.code === '6850')?.id
      if (!inventoryId) throw new Error('Inventory account 1110 not found')
      if (!varianceId) throw new Error('Stock Variance account 6850 not found — run migration 028')

      for (const l of disc) {
        const qtyChange = (l.counted_qty as number) - l.system_qty
        const cost = Math.abs(qtyChange) * (l.unit_cost || 0)
        const { data: prod } = await supabase.from('products').select('qty_on_hand').eq('id', l.product_id).maybeSingle()
        await supabase.from('products').update({ qty_on_hand: (prod?.qty_on_hand ?? 0) + qtyChange }).eq('id', l.product_id)
        await postLedgerEntry({
          product_id: l.product_id, entry_type: qtyChange > 0 ? 'positive_adjustment' : 'negative_adjustment',
          document_type: 'stock_adjustment', document_ref: active.ref || 'count', posting_date: iso(new Date()),
          qty: qtyChange, cost_amount: cost, location: loc ? { id: loc.id, code: loc.code } : null,
        })

        // Counted more than the system knew  → Dr Inventory / Cr Variance
        // Counted less                       → Dr Variance  / Cr Inventory
        // Skipped when unit_cost is 0: there is no value to move, so the
        // journal would be a meaningless 0/0 entry. A zero-cost product is a
        // data gap to fix on the product record itself.
        if (cost > 0) {
          const { error: jErr } = await supabase.rpc('post_journal_transaction', {
            p_ref: 'JV-' + (active.ref || 'COUNT') + '-' + l.id.slice(0, 8),
            p_posting_date: iso(new Date()),
            p_description: `Stock count variance — ${l.product_name || 'product'} — ${active.ref || ''}`,
            p_journal_type: 'stock_adjustment',
            p_source_type: 'stock_count',
            p_source_ref: active.ref || 'count',
            p_posted_by: user?.full_name || 'system',
            p_branch: null,
            p_lines: qtyChange > 0
              ? [
                  { account_id: inventoryId, description: `Count surplus — ${l.product_name || ''}`, debit: cost, credit: 0 },
                  { account_id: varianceId, description: `Variance credit — ${l.product_name || ''}`, debit: 0, credit: cost },
                ]
              : [
                  { account_id: varianceId, description: `Count shortfall — ${l.product_name || ''}`, debit: cost, credit: 0 },
                  { account_id: inventoryId, description: `Inventory reduced — ${l.product_name || ''}`, debit: 0, credit: cost },
                ],
          })
          if (jErr) throw new Error('Journal: ' + jErr.message)
        }

        if (loc) {
          const { data: pl } = await supabase.from('product_locations').select('qty_on_hand').eq('product_id', l.product_id).eq('location_id', loc.id).maybeSingle()
          await supabase.from('product_locations').upsert(
            { product_id: l.product_id, location_id: loc.id, location_code: loc.code, qty_on_hand: Math.max(0, (pl?.qty_on_hand ?? 0) + qtyChange), last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' })
        }
        await supabase.from('stock_count_lines').update({ settled: true }).eq('id', l.id)
      }
      await supabase.from('stock_counts').update({ status: 'settled', settled_at: new Date().toISOString(), settled_by_name: user?.full_name || null }).eq('id', active.id)
      setBusy(false)
      flash(`Settled ${disc.length} discrepancies — stock and accounts both updated`)
      setLines(prev => prev.map(l => disc.find(d => d.id === l.id) ? { ...l, settled: true } : l))
      setActive({ ...active, status: 'settled' }); loadList()
    } catch (e: any) { setBusy(false); flash('Failed: ' + (e?.message || 'unknown'), 'err') }
  }

  const printSheet = async () => {
    if (!active) return
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:28px;background:#fff;color:#1a1a1a;font-family:Arial,sans-serif;font-size:12px'
    const rows = lines.map(l => `<tr><td style="padding:6px;border-top:1px solid #eee">${l.sku || ''}</td><td style="padding:6px;border-top:1px solid #eee">${l.product_name || ''}</td><td style="padding:6px;border-top:1px solid #eee">${l.category || ''}</td><td style="padding:10px 6px;border-top:1px solid #eee;border-left:1px solid #ccc;width:90px"></td></tr>`).join('')
    el.innerHTML = `
      <div style="border-bottom:2px solid #5EA8A2;padding-bottom:10px;margin-bottom:6px">
        <div style="font-size:18px;font-weight:800;color:#5E2230">Stock Count Sheet</div>
        <div style="color:#666">${active.ref} · ${active.name || ''} · ${new Date().toLocaleDateString('en-GB')}</div></div>
      <div style="font-size:10px;color:#888;margin-bottom:10px">Blind count — write the physical quantity you count in the right column. Do not guess from the system.</div>
      <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f4f4f4">
        <th style="padding:6px;text-align:left">SKU</th><th style="padding:6px;text-align:left">Product</th><th style="padding:6px;text-align:left">Category</th><th style="padding:6px;text-align:center;border-left:1px solid #ccc">Counted</th></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:20px;font-size:11px;color:#666">Counted by: ______________  Signature: ______________  Date: __________</div>`
    document.body.appendChild(el)
    try { const blob = await renderElementToPdfBlob(el); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${active.ref}-count-sheet.pdf`; a.click() }
    finally { document.body.removeChild(el) }
  }

  // ─── LIST VIEW ─────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div><h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Stock Count</h1>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Count physical stock, review variances, and settle to match the system.</p></div>
          <button onClick={() => setShowNew(true)} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+ New Count</button>
        </div>

        {showNew && (
          <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 440, maxWidth: '92%' }}>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>New Count</div>
              <label style={lbl}>Location</label>
              <select value={nfLoc} onChange={e => setNfLoc(e.target.value)} style={sel}>{locations.map(l => <option key={l.code} value={l.code}>{l.code} — {l.name}</option>)}</select>
              <label style={lbl}>What to count</label>
              <select value={nfScope} onChange={e => setNfScope(e.target.value as any)} style={sel}>
                <option value="all">All items</option>
                <option value="sold">Only items sold in a period</option>
                <option value="moved">Only items moved in a period</option>
                <option value="category">A category</option>
              </select>
              {(nfScope === 'sold' || nfScope === 'moved') && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input type="date" value={nfFrom} onChange={e => setNfFrom(e.target.value)} style={{ ...sel, marginBottom: 0 }} />
                  <span style={{ color: 'var(--text3)' }}>to</span>
                  <input type="date" value={nfTo} onChange={e => setNfTo(e.target.value)} style={{ ...sel, marginBottom: 0 }} />
                </div>
              )}
              {nfScope === 'category' && (
                <select value={nfCategory} onChange={e => setNfCategory(e.target.value)} style={sel}><option value="">Choose category…</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={createCount} disabled={busy} style={{ flex: 1, padding: 10, borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{busy ? 'Creating…' : 'Create & snapshot'}</button>
                <button onClick={() => setShowNew(false)} style={{ padding: 10, borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          : counts.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>No counts yet. Start one with New Count.</div>
            : <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: 'var(--surface2)' }}>{['Ref', 'Scope', 'Created', 'Status', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                <tbody>{counts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{c.ref}</td>
                    <td style={{ padding: '9px 12px' }}>{c.name}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text3)' }}>{fmt(c.created_at)}</td>
                    <td style={{ padding: '9px 12px' }}><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: c.status === 'settled' ? 'rgba(22,163,74,.15)' : 'rgba(217,119,6,.15)', color: c.status === 'settled' ? 'var(--green, #16a34a)' : 'var(--yellow, #d97706)' }}>{c.status === 'settled' ? 'Settled' : 'Open'}</span></td>
                    <td style={{ padding: '9px 12px' }}><button onClick={() => openCount(c)} style={{ padding: '5px 12px', borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Open</button></td>
                  </tr>))}</tbody>
              </table>
            </div>}
        {toast && <div style={toastS(toast.type)}>{toast.msg}</div>}
      </div>
    )
  }

  // ─── DETAIL VIEW ───────────────────────────────────────────────────────────
  const counted = lines.filter(l => l.counted_qty != null).length
  const disc = lines.filter(l => l.counted_qty != null && l.counted_qty !== l.system_qty)
  const isOpen = active?.status !== 'settled'
  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => { setView('list'); loadList() }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>← All counts</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, fontFamily: 'var(--mono)' }}>{active?.ref}</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>{active?.name} · {counted}/{lines.length} counted · {disc.length} variances</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={printSheet} style={ghost}>🖨 Count Sheet</button>
          {isOpen && <button onClick={saveCounts} disabled={busy} style={ghost}>{busy ? '…' : 'Save counts'}</button>}
          {isOpen && canSettle && <button onClick={settle} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--green, #16a34a)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Settle discrepancies</button>}
        </div>
      </div>

      {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div> : (
        <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--surface2)' }}>
              <th style={thL}>Product</th><th style={thR}>System</th><th style={thR}>Counted</th><th style={thR}>Variance</th>
            </tr></thead>
            <tbody>{lines.map(l => {
              const c = l.counted_qty
              const v = c != null ? c - l.system_qty : null
              return (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', background: v && v !== 0 ? 'rgba(217,119,6,.06)' : undefined }}>
                  <td style={{ padding: '8px 12px' }}><div style={{ fontWeight: 600 }}>{l.product_name}</div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{l.sku}</div></td>
                  <td style={{ ...tdR, color: 'var(--text3)' }}>{l.system_qty}</td>
                  <td style={{ ...tdR }}>
                    {isOpen && !l.settled
                      ? <input type="number" value={entry[l.id] ?? ''} onChange={e => setEntry(s => ({ ...s, [l.id]: e.target.value }))}
                          style={{ width: 70, padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, textAlign: 'right' }} />
                      : (c ?? '—')}
                  </td>
                  <td style={{ ...tdR, fontWeight: 700, color: v == null ? 'var(--text3)' : v === 0 ? 'var(--green, #16a34a)' : v > 0 ? 'var(--accent)' : 'var(--red, #dc2626)' }}>
                    {v == null ? '' : v === 0 ? '✓' : (v > 0 ? '+' : '') + v}{l.settled ? ' ·settled' : ''}
                  </td>
                </tr>)
            })}</tbody>
          </table>
        </div>
      )}
      {toast && <div style={toastS(toast.type)}>{toast.msg}</div>}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4, margin: '8px 0 4px' }
const sel: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, marginBottom: 10 }
const ghost: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }
const thL: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }
const thR: React.CSSProperties = { ...thL, textAlign: 'right' }
const tdR: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }
const toastS = (t: 'ok' | 'err'): React.CSSProperties => ({ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, color: '#fff', background: t === 'ok' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 13, zIndex: 3000 })
