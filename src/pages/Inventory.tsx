import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { getStatus } from '../lib/utils'

interface DBProduct {
  id: string; sku: string; name: string; category: string;
  cost_price: number; selling_price: number; qty_on_hand: number; reorder_point: number;
}

export default function Inventory() {
  const [products, setProducts] = useState<DBProduct[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { loadProducts() }, [])

  const loadProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, category, cost_price, selling_price, qty_on_hand, reorder_point')
      .eq('is_active', true)
      .order('name')
    if (!error && data) setProducts(data)
    setLoading(false)
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const totalValue = products.reduce((s, p) => s + p.cost_price * p.qty_on_hand, 0)
  const lowStock = products.filter(p => getStatus(p.qty_on_hand, p.reorder_point) !== 'ok').length
  const colors: Record<string, string> = { ok: 'var(--green)', low: 'var(--yellow)', critical: 'var(--red)' }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📦 Inventory</div>
          <div className="page-sub">
            Stock management · {products.length} products · DSM HQ · <span className="sync-dot"></span> Live Supabase
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadProducts}>🔄 Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setToast('Add Product — coming soon')}>+ Add Product</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Products</div><div className="stat-value">{products.length}</div><div className="stat-change up">▲ Active SKUs</div></div>
        <div className="stat-card green"><div className="stat-label">Stock Value</div><div className="stat-value">TZS {(totalValue / 1000000).toFixed(1)}M</div><div className="stat-change up">▲ At cost</div></div>
        <div className="stat-card yellow"><div className="stat-label">Low Stock</div><div className="stat-value">{lowStock}</div><div className="stat-change down">▼ Reorder soon</div></div>
        <div className="stat-card red"><div className="stat-label">Out of Stock</div><div className="stat-value">{products.filter(p => p.qty_on_hand === 0).length}</div><div className="stat-change down">▼ Action needed</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Products — Stock Levels</div>
            <div className="card-sub">Live from Supabase · Updates after every GRN and Sale</div>
          </div>
          <input className="form-input" style={{ width: 200, padding: '6px 10px', fontSize: 12 }} placeholder="🔍 Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading products…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th><th>Product Name</th><th>Category</th>
                  <th className="td-right">Qty</th><th className="td-right">Reorder</th>
                  <th className="td-right">Cost (TZS)</th><th className="td-right">Price (TZS)</th>
                  <th className="td-right">Value</th><th>Level</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const s = getStatus(p.qty_on_hand, p.reorder_point)
                  const pct = Math.min(100, Math.round((p.qty_on_hand / (p.reorder_point * 2)) * 100))
                  return (
                    <tr key={i}>
                      <td className="td-mono td-amber">{p.sku}</td>
                      <td className="td-bold">{p.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.category}</td>
                      <td className="td-right td-mono" style={{ color: colors[s], fontWeight: 600 }}>{p.qty_on_hand}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{p.reorder_point}</td>
                      <td className="td-right td-mono">{p.cost_price.toLocaleString()}</td>
                      <td className="td-right td-mono">{p.selling_price.toLocaleString()}</td>
                      <td className="td-right td-mono">{(p.cost_price * p.qty_on_hand).toLocaleString()}</td>
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
        )}
      </div>
      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </div>
  )
}
