import { useState } from 'react'
import { PRODUCTS } from '../lib/data'
import { getStatus } from '../lib/utils'
import Toast from '../components/Toast'

export default function Inventory() {
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')

  const filtered = PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const totalValue = PRODUCTS.reduce((s, p) => s + p.cost * p.qty, 0)
  const lowStock = PRODUCTS.filter(p => getStatus(p.qty, p.reorder) !== 'ok').length
  const colors: Record<string, string> = { ok: 'var(--green)', low: 'var(--yellow)', critical: 'var(--red)' }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📦 Inventory</div>
          <div className="page-sub">Stock management · {PRODUCTS.length} products · DSM HQ</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setToast('Add Product — coming when Supabase is wired')}>+ Add Product</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Products</div><div className="stat-value">{PRODUCTS.length}</div><div className="stat-change up">▲ Active SKUs</div></div>
        <div className="stat-card green"><div className="stat-label">Stock Value</div><div className="stat-value">TZS {(totalValue / 1000000).toFixed(1)}M</div><div className="stat-change up">▲ At cost</div></div>
        <div className="stat-card yellow"><div className="stat-label">Low Stock</div><div className="stat-value">{lowStock}</div><div className="stat-change down">▼ Reorder soon</div></div>
        <div className="stat-card red"><div className="stat-label">Out of Stock</div><div className="stat-value">{PRODUCTS.filter(p => p.qty === 0).length}</div><div className="stat-change down">▼ Action needed</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Products — Stock Levels</div>
          <input
            className="form-input"
            style={{ width: 200, padding: '6px 10px', fontSize: 12 }}
            placeholder="🔍 Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>SKU</th><th>Product Name</th><th>Category</th><th className="td-right">Qty</th><th className="td-right">Reorder</th><th className="td-right">Cost (TZS)</th><th className="td-right">Price (TZS)</th><th className="td-right">Value</th><th>Level</th></tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const s = getStatus(p.qty, p.reorder)
                const pct = Math.min(100, Math.round((p.qty / (p.reorder * 2)) * 100))
                return (
                  <tr key={i}>
                    <td className="td-mono td-amber">{p.sku}</td>
                    <td className="td-bold">{p.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.category}</td>
                    <td className="td-right td-mono" style={{ color: colors[s], fontWeight: 600 }}>{p.qty}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{p.reorder}</td>
                    <td className="td-right td-mono">{p.cost.toLocaleString()}</td>
                    <td className="td-right td-mono">{p.price.toLocaleString()}</td>
                    <td className="td-right td-mono">{(p.cost * p.qty).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div className="stock-bar"><div className={`stock-fill ${s}`} style={{ width: `${pct}%` }}></div></div>
                        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: colors[s], textTransform: 'uppercase' }}>{s}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </div>
  )
}
