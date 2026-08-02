// src/pages/ProductProfit.tsx — which products earn their shelf space.
// GMROI = margin earned in the period per shilling currently tied up in stock.
import { useEffect, useState } from 'react'
import { localIso } from '../lib/utils'
import { supabase } from '../lib/supabase'

interface Row { product_name: string; qty_sold: number; revenue: number; cost: number
  margin: number; stock_qty: number; stock_value: number; gmroi: number | null; days_of_stock: number | null }
const fmt = (n: number | null) => n === null ? '—' : Math.round(n).toLocaleString('en-US')

export default function ProductProfit() {
  const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth() - 2, 1)
  const [from, setFrom] = useState(localIso(start))
  const [to, setTo] = useState(localIso(d))
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('product_gmroi', { p_from: from, p_to: to })
    if (error) setError(error.message)
    else setRows(((data || []) as any[]).map(r => ({ ...r,
      qty_sold: +r.qty_sold, revenue: +r.revenue, cost: +r.cost, margin: +r.margin,
      stock_qty: +r.stock_qty, stock_value: +r.stock_value,
      gmroi: r.gmroi === null ? null : +r.gmroi,
      days_of_stock: r.days_of_stock === null ? null : +r.days_of_stock })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const sorted = [...rows].sort((a, b) => (b.gmroi ?? -1) - (a.gmroi ?? -1))
  const dead = rows.filter(r => r.qty_sold === 0 && r.stock_value > 0)

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Product Profitability</h1>
          <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
            GMROI: margin earned per shilling sitting in stock · reorder the top, flush the bottom
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 145 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text3)' }}>to</span>
          <input type="date" className="form-input" style={{ width: 145 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
        </div>
      </div>

      {dead.length > 0 && (
        <div style={{ margin: '16px 0 0', padding: 12, borderRadius: 10, border: '1px solid var(--gold, #C8A96E)', fontSize: 13 }}>
          ⚠ {dead.length} product(s) sold ZERO units this period while holding TZS {fmt(dead.reduce((s, r) => s + r.stock_value, 0))} of stock.
          That is frozen cash. They are at the bottom of the table.
        </div>
      )}

      {loading ? <div style={{ padding: 40, color: 'var(--text3)' }}>Loading…</div>
      : error ? <div style={{ padding: 20, color: 'var(--red)' }}>{error}</div>
      : (
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: 'var(--text3)', textAlign: 'right' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Product</th>
              <th style={{ padding: '8px 6px' }}>Sold</th>
              <th style={{ padding: '8px 6px' }}>Margin</th>
              <th style={{ padding: '8px 6px' }}>Stock value</th>
              <th style={{ padding: '8px 6px' }}>GMROI</th>
              <th style={{ padding: '8px 6px' }}>Days of stock</th>
            </tr></thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.product_name} style={{ borderTop: '1px solid var(--border)',
                  background: r.qty_sold === 0 && r.stock_value > 0 ? 'rgba(229,100,93,.06)' : undefined }}>
                  <td style={{ padding: '7px 6px' }}>{r.product_name}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.qty_sold)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--mono)',
                    color: r.margin < 0 ? 'var(--red)' : 'inherit' }}>{fmt(r.margin)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.stock_value)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700,
                    color: (r.gmroi ?? 0) >= 1 ? 'var(--green)' : 'var(--gold, #C8A96E)' }}>
                    {r.gmroi === null ? '—' : r.gmroi.toFixed(2)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--mono)',
                    color: (r.days_of_stock ?? 0) > 90 ? 'var(--red)' : 'inherit' }}>{fmt(r.days_of_stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
            GMROI above 1.0 = the product returned more margin this period than the cash currently frozen in its stock.
            Red days-of-stock (90+) = you bought too deep. Note: costs use the sale line's unit_cost where recorded,
            falling back to current cost_price — pre-cutover cost data is thin, so treat margins as indicative until August.
          </div>
        </div>
      )}
    </div>
  )
}
