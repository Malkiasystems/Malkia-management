import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'

interface StockItem { id: string; sku: string; name: string; category: string; unit: string; qty_on_hand: number; cost_price: number; selling_price: number; value: number; potential_revenue: number; margin: number }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

export default function StockValuationReport() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [filterCat, setFilterCat] = useState('all')
  const [asAt] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('products').select('id, sku, name, category, unit, qty_on_hand, cost_price, selling_price').eq('is_active', true).order('category').order('name')
    if (data) {
      setItems(data.map(p => ({
        ...p,
        value: p.qty_on_hand * p.cost_price,
        potential_revenue: p.qty_on_hand * p.selling_price,
        margin: p.selling_price > 0 ? Math.round(((p.selling_price - p.cost_price) / p.selling_price) * 100) : 0,
      })))
    }
    setLoading(false)
  }

  const categories = ['all', ...new Set(items.map(i => i.category))]
  const filtered = filterCat === 'all' ? items : items.filter(i => i.category === filterCat)
  const totalValue = filtered.reduce((s, i) => s + i.value, 0)
  const totalRevPotential = filtered.reduce((s, i) => s + i.potential_revenue, 0)
  const totalPotentialGP = totalRevPotential - totalValue
  const avgMargin = filtered.length > 0 ? Math.round(filtered.reduce((s, i) => s + i.margin, 0) / filtered.length) : 0
  const zeroStock = filtered.filter(i => i.qty_on_hand === 0).length
  const lowStock = filtered.filter(i => i.qty_on_hand > 0 && i.qty_on_hand <= 10).length

  const exportCSV = () => {
    const rows = [['SKU','Product','Category','Unit','Qty on Hand','Cost Price','Selling Price','Stock Value (Cost)','Potential Revenue','Margin %']]
    filtered.forEach(i => rows.push([i.sku, `"${i.name}"`, i.category, i.unit, String(i.qty_on_hand), String(i.cost_price), String(i.selling_price), String(i.value), String(i.potential_revenue), String(i.margin)+'%']))
    rows.push(['','TOTALS','','',String(filtered.reduce((s,i)=>s+i.qty_on_hand,0)),'','',String(totalValue),String(totalRevPotential),''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`Stock_Valuation_${asAt}.csv`; a.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Stock Valuation</div>
          <div className="page-sub">Current inventory at cost · {filtered.length} products · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <select className="form-input" style={{ fontSize:12,padding:'6px 10px' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <div style={{ position:'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setShowExport(!showExport)}><Ic n="pdf" /> Export</button>
            {showExport && (
              <div style={{ position:'absolute',top:'100%',right:0,marginTop:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',boxShadow:'0 8px 32px rgba(0,0,0,.4)',zIndex:50,minWidth:190,overflow:'hidden' }}>
                <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12 }} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><Ic n="csv" s={13} c="var(--green)" /> Export CSV / Excel</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card blue"><div className="stat-label">Stock Value (Cost)</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalValue)}</div><div className="stat-change">At average cost</div></div>
        <div className="stat-card green"><div className="stat-label">Potential Revenue</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalRevPotential)}</div><div className="stat-change">At selling price</div></div>
        <div className="stat-card amber"><div className="stat-label">Potential GP</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalPotentialGP)}</div><div className="stat-change">Avg margin {avgMargin}%</div></div>
        <div className="stat-card red"><div className="stat-label">Stock Alerts</div><div className="stat-value">{zeroStock + lowStock}</div><div className="stat-change">{zeroStock} out · {lowStock} low</div></div>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Unit</th><th className="td-right">Qty</th><th className="td-right">Cost Price</th><th className="td-right">Sell Price</th><th className="td-right">Margin</th><th className="td-right">Stock Value</th><th className="td-right">Rev Potential</th></tr></thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={i} style={{ opacity: item.qty_on_hand === 0 ? 0.5 : 1 }}>
                    <td className="td-mono td-amber" style={{ fontSize:11 }}>{item.sku}</td>
                    <td className="td-bold" style={{ fontSize:12 }}>{item.name}</td>
                    <td style={{ fontSize:11,color:'var(--text3)' }}>{item.category}</td>
                    <td style={{ fontSize:11,color:'var(--text3)' }}>{item.unit}</td>
                    <td className="td-right td-mono" style={{ fontWeight:600,color:item.qty_on_hand===0?'var(--red)':item.qty_on_hand<=10?'var(--yellow)':'var(--green)' }}>{item.qty_on_hand}</td>
                    <td className="td-right td-mono" style={{ fontSize:12 }}>{item.cost_price.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ fontSize:12 }}>{item.selling_price.toLocaleString()}</td>
                    <td className="td-right" style={{ fontSize:11,fontFamily:'var(--mono)',color:item.margin>=40?'var(--green)':item.margin>=20?'var(--yellow)':'var(--red)',fontWeight:600 }}>{item.margin}%</td>
                    <td className="td-right td-mono" style={{ fontSize:12,fontWeight:600,color:'var(--blue)' }}>{item.value.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ fontSize:12,color:'var(--green)' }}>{item.potential_revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                  <td colSpan={4} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>TOTALS — {filtered.length} products</td>
                  <td className="td-right td-mono" style={{ padding:'12px 14px' }}>{filtered.reduce((s,i)=>s+i.qty_on_hand,0)}</td>
                  <td></td><td></td><td></td>
                  <td className="td-right td-mono" style={{ color:'var(--blue)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(totalValue)}</td>
                  <td className="td-right td-mono" style={{ color:'var(--green)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(totalRevPotential)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
