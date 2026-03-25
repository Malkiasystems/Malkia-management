import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { getStatus } from '../lib/utils'

interface DBProduct {
  id: string; sku: string; name: string; category: string;
  cost_price: number; selling_price: number; qty_on_hand: number; reorder_point: number;
  unit: string; is_active: boolean;
}

const CATEGORIES = ['Feeding', 'Postpartum', 'Comfort', 'Supplements', 'Skincare', 'Other']
const UNITS = ['Piece', 'Pack', 'Bottle', 'Tube', 'Box', 'Set']

const EMPTY_FORM = { sku: '', name: '', category: 'Feeding', unit: 'Piece', cost_price: '', selling_price: '', qty_on_hand: '0', reorder_point: '10' }

export default function Inventory() {
  const [products, setProducts] = useState<DBProduct[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState<DBProduct | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadProducts() }, [])

  const loadProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, category, cost_price, selling_price, qty_on_hand, reorder_point, unit, is_active')
      .eq('is_active', true)
      .order('name')
    if (!error && data) setProducts(data)
    setLoading(false)
  }

  const openAdd = () => {
    setEditProduct(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (p: DBProduct) => {
    setEditProduct(p)
    setForm({
      sku: p.sku, name: p.name, category: p.category, unit: p.unit,
      cost_price: p.cost_price.toString(), selling_price: p.selling_price.toString(),
      qty_on_hand: p.qty_on_hand.toString(), reorder_point: p.reorder_point.toString(),
    })
    setShowModal(true)
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const save = async () => {
    if (!form.sku.trim()) { showToast('SKU is required', 'error'); return }
    if (!form.name.trim()) { showToast('Product name is required', 'error'); return }
    if (!form.cost_price || !form.selling_price) { showToast('Cost and selling price required', 'error'); return }
    setSaving(true)

    const payload = {
      sku: form.sku.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      cost_price: parseFloat(form.cost_price),
      selling_price: parseFloat(form.selling_price),
      qty_on_hand: parseFloat(form.qty_on_hand) || 0,
      reorder_point: parseFloat(form.reorder_point) || 10,
      costing_method: 'average',
      is_active: true,
    }

    try {
      if (editProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id)
        if (error) throw new Error(error.message)
        showToast(`${form.name} updated successfully`)
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw new Error(error.message)
        showToast(`${form.name} added to inventory`)
      }
      setShowModal(false)
      loadProducts()
    } catch (err: any) {
      showToast('' + (err.message || 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (p: DBProduct) => {
    if (!confirm(`Remove ${p.name} from active inventory?`)) return
    await supabase.from('products').update({ is_active: false }).eq('id', p.id)
    showToast(`${p.name} removed from active inventory`)
    loadProducts()
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
          <div className="page-title">Inventory</div>
          <div className="page-sub">
            {products.length} products · DSM HQ · <span className="sync-dot"></span> Live Supabase
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadProducts} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Product</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Products</div><div className="stat-value">{products.length}</div><div className="stat-change up">Active SKUs</div></div>
        <div className="stat-card green"><div className="stat-label">Stock Value</div><div className="stat-value">TZS {(totalValue / 1000000).toFixed(1)}M</div><div className="stat-change up">At cost</div></div>
        <div className="stat-card yellow"><div className="stat-label">Low Stock</div><div className="stat-value">{lowStock}</div><div className="stat-change down">Reorder soon</div></div>
        <div className="stat-card red"><div className="stat-label">Out of Stock</div><div className="stat-value">{products.filter(p => p.qty_on_hand === 0).length}</div><div className="stat-change down">Action needed</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Products — Stock Levels</div>
            <div className="card-sub">Click any row to edit · Updates after every GRN and Sale</div>
          </div>
          <input className="form-input" style={{ width: 200, padding: '6px 10px', fontSize: 12 }} placeholder=" Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading products…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th><th>Product Name</th><th>Category</th><th>Unit</th>
                  <th className="td-right">Qty</th><th className="td-right">Reorder</th>
                  <th className="td-right">Cost (TZS)</th><th className="td-right">Price (TZS)</th>
                  <th className="td-right">Value</th><th>Level</th><th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const s = getStatus(p.qty_on_hand, p.reorder_point)
                  const pct = Math.min(100, Math.round((p.qty_on_hand / (p.reorder_point * 2)) * 100))
                  return (
                    <tr key={i} style={{ cursor: 'pointer' }} onClick={() => openEdit(p)}>
                      <td className="td-mono td-amber">{p.sku}</td>
                      <td className="td-bold">{p.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.category}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.unit}</td>
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
                      <td onClick={e => { e.stopPropagation(); deactivate(p) }} style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }}></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {editProduct ? ' Edit Product' : '+ Add New Product'}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20 }}>×</button>
            </div>

            <div className="form-row">
              <FG label="SKU" req><input className="form-input" placeholder="e.g. MK-009" value={form.sku} onChange={e => set('sku', e.target.value)} /></FG>
              <FG label="Unit"><select className="form-input" value={form.unit} onChange={e => set('unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></FG>
            </div>

            <FG label="Product Name" req><input className="form-input" placeholder="e.g. Maternity Support Belt" value={form.name} onChange={e => set('name', e.target.value)} /></FG>

            <FG label="Category" req>
              <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </FG>

            <div className="form-row">
              <FG label="Cost Price (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} /></FG>
              <FG label="Selling Price (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={form.selling_price} onChange={e => set('selling_price', e.target.value)} /></FG>
            </div>

            <div className="form-row">
              <FG label="Opening Qty"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={form.qty_on_hand} onChange={e => set('qty_on_hand', e.target.value)} /></FG>
              <FG label="Reorder Point"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="10" value={form.reorder_point} onChange={e => set('reorder_point', e.target.value)} /></FG>
            </div>

            {form.cost_price && form.selling_price && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 16, fontSize: 12, fontFamily: 'var(--mono)' }}>
                Margin: <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                  {Math.round(((parseFloat(form.selling_price) - parseFloat(form.cost_price)) / parseFloat(form.selling_price)) * 100)}%
                </span> · Markup: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  TZS {(parseFloat(form.selling_price) - parseFloat(form.cost_price)).toLocaleString()}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editProduct ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
