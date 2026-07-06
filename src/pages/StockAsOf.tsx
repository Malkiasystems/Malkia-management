// ════════════════════════════════════════════════════════════════════════════
// StockAsOf.tsx
// Point-in-time stock. Pick a date and time and the page reconstructs every
// product's quantity as it stood at that instant, by replaying the stock ledger
// up to that moment (via the stock_as_of() function). Shows quantity, cost, and
// value at cost, filterable by category and location, with a CSV export.
// Useful for month-end, audits, or settling "what was in the warehouse on X".
// ════════════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }

interface Prod { id: string; sku: string; name: string; category: string; unit: string; cost_price: number }
interface Row { id: string; sku: string; name: string; category: string; unit: string; qty: number; cost: number; value: number; byLoc: Record<string, number> }

const tzs = (n: number) => n.toLocaleString('en-TZ', { maximumFractionDigits: 0 })

function defaultTs(): string {
  // datetime-local wants 'YYYY-MM-DDTHH:mm' in local time
  const d = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function StockAsOf({ onNav: _onNav }: Props) {
  const [ts, setTs] = useState(defaultTs())
  const [rows, setRows] = useState<Row[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [fCat, setFCat] = useState('all')
  const [fLoc, setFLoc] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    // chosen local time -> ISO for the query
    const iso = new Date(ts).toISOString()
    const [{ data: bal, error: e1 }, { data: prods, error: e2 }] = await Promise.all([
      supabase.rpc('stock_as_of', { p_ts: iso }),
      supabase.from('products').select('id, sku, name, category, unit, cost_price').eq('is_active', true),
    ])
    if (e1 || e2) { setLoading(false); setErr((e1 || e2)?.message || 'Load failed'); return }
    const pById = new Map<string, Prod>()
    ;(prods || []).forEach((p: any) => pById.set(p.id, p))

    // sum balances per product + collect per-location
    const agg = new Map<string, { total: number; byLoc: Record<string, number> }>()
    const locs = new Set<string>()
    ;(bal || []).forEach((b: any) => {
      const code = b.location_code || '—'; locs.add(code)
      const cur = agg.get(b.product_id) || { total: 0, byLoc: {} }
      cur.total += Number(b.qty) || 0
      cur.byLoc[code] = (cur.byLoc[code] || 0) + (Number(b.qty) || 0)
      agg.set(b.product_id, cur)
    })
    const out: Row[] = []
    agg.forEach((v, pid) => {
      const p = pById.get(pid)
      if (!p) return
      out.push({ id: pid, sku: p.sku, name: p.name, category: p.category, unit: p.unit,
        qty: v.total, cost: p.cost_price, value: v.total * p.cost_price, byLoc: v.byLoc })
    })
    out.sort((a, b) => b.value - a.value)
    setRows(out); setLocations(Array.from(locs).sort()); setLoaded(true); setLoading(false)
  }, [ts])

  const cats = Array.from(new Set(rows.map(r => r.category).filter(Boolean))).sort()
  const visible = rows.filter(r => {
    if (fCat !== 'all' && r.category !== fCat) return false
    if (search.trim() && !(`${r.sku} ${r.name}`.toLowerCase().includes(search.trim().toLowerCase()))) return false
    return true
  })
  const qtyOf = (r: Row) => fLoc === 'all' ? r.qty : (r.byLoc[fLoc] || 0)
  const valOf = (r: Row) => qtyOf(r) * r.cost
  const shown = visible.filter(r => qtyOf(r) !== 0)
  const totalValue = shown.reduce((s, r) => s + valOf(r), 0)
  const totalUnits = shown.reduce((s, r) => s + qtyOf(r), 0)

  const exportCsv = () => {
    const head = ['SKU', 'Product', 'Category', 'Unit', 'Qty as of', 'Cost', 'Value']
    const body = shown.map(r => [r.sku, `"${r.name}"`, r.category, r.unit, qtyOf(r), r.cost, Math.round(valOf(r))].join(','))
    const csv = [head.join(','), ...body, `,,,,${totalUnits},,${Math.round(totalValue)}`].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `stock-as-of-${ts.replace(/[:T]/g, '-')}.csv`; a.click()
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Stock as of Date</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Pick a moment and see stock as it stood then, reconstructed from the ledger. Value is at cost.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0' }}>
        <label style={{ fontSize: 12, color: 'var(--text3)' }}>As of</label>
        <input type="datetime-local" value={ts} onChange={e => setTs(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }} />
        <button onClick={load} disabled={loading}
          style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          {loading ? 'Reconstructing…' : 'Load'}
        </button>
        {loaded && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, width: 160 }} />
            <select value={fCat} onChange={e => setFCat(e.target.value)} style={sel}>
              <option value="all">All categories</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fLoc} onChange={e => setFLoc(e.target.value)} style={sel}>
              <option value="all">All locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={exportCsv} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>CSV</button>
          </div>
        )}
      </div>

      {err && <div style={{ padding: 12, borderRadius: 8, background: 'rgba(220,38,38,.1)', border: '1px solid var(--red, #dc2626)', color: 'var(--red, #dc2626)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {loaded && !loading && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4 }}>Stock value at cost</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>TZS {tzs(totalValue)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>as of {new Date(ts).toLocaleString('en-GB')}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4 }}>Total units</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)' }}>{tzs(totalUnits)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{shown.length} products with stock</div>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface2)' }}>
                {['SKU', 'Product', 'Category', 'Qty', 'Cost', 'Value'].map(h => (
                  <th key={h} style={{ textAlign: ['Qty', 'Cost', 'Value'].includes(h) ? 'right' : 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)' }}>{r.sku}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text3)' }}>{r.category}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{qtyOf(r)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(r.cost)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{tzs(valOf(r))}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>No stock at that moment for this filter.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Reconstructed from ledger movements recorded up to the chosen time. Accurate from when the ledger became the system of record.</div>
        </>
      )}

      {!loaded && !loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Pick a date and time, then Load to reconstruct stock as it stood then.</div>
      )}
    </div>
  )
}

const sel: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }
