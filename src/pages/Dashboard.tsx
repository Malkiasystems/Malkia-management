import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { greeting, getStatus, tzs } from '../lib/utils'
import type { Page } from '../lib/types'
import { useCategories } from '../lib/useCategories'
import { useAuth } from '../lib/useAuth'
import { useRecurringExpenses } from '../lib/useRecurringExpenses'

interface Props { onNav: (p: Page) => void }

interface Stats {
  totalRevenue: number
  totalCogs: number
  netProfit: number
  productCount: number
  lowStockCount: number
  pendingVouchers: number
}

interface RecentVoucher {
  ref: string
  description: string
  type: string
  total_amount: number
  status: string
  posting_date: string
}

interface LowStockProduct {
  name: string
  qty_on_hand: number
  reorder_point: number
}

export default function Dashboard({ onNav }: Props) {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats>({ totalRevenue: 0, totalCogs: 0, netProfit: 0, productCount: 0, lowStockCount: 0, pendingVouchers: 0 })
  const [recentVouchers, setRecentVouchers] = useState<RecentVoucher[]>([])
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([])
  const [catBreakdown, setCatBreakdown] = useState<{name:string;count:number;value:number}[]>([])
  const [loading, setLoading] = useState(true)
  const { categories } = useCategories()
  const { unpaid: unpaidRecurring } = useRecurringExpenses()

  // Get first name from full name
  const firstName = user?.full_name?.split(' ')[0] || 'there'

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    setLoading(true)
    await Promise.all([loadStats(), loadRecentVouchers(), loadLowStock(), loadCategoryBreakdown()])
    setLoading(false)
  }

  const loadStats = async () => {
    // Revenue from accounts
    const { data: revenueAcct } = await supabase.from('accounts').select('balance').eq('code', '4010').single()
    const { data: cogsAcct } = await supabase.from('accounts').select('balance').eq('code', '5010').single()
    const { data: products } = await supabase.from('products').select('qty_on_hand, reorder_point').eq('is_active', true)
    const { count: voucherCount } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('status', 'draft')

    const revenue = Math.abs(revenueAcct?.balance || 0)
    const cogs = cogsAcct?.balance || 0
    const productList = products || []

    setStats({
      totalRevenue: revenue,
      totalCogs: cogs,
      netProfit: revenue - cogs,
      productCount: productList.length,
      lowStockCount: productList.filter(p => getStatus(p.qty_on_hand, p.reorder_point) !== 'ok').length,
      pendingVouchers: voucherCount || 0,
    })
  }

  const loadRecentVouchers = async () => {
    const { data } = await supabase
      .from('vouchers')
      .select('ref, description, type, total_amount, status, posting_date')
      .eq('status', 'posted')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setRecentVouchers(data)
  }

  const loadLowStock = async () => {
    const { data } = await supabase
      .from('products')
      .select('name, qty_on_hand, reorder_point')
      .eq('is_active', true)
      .order('qty_on_hand')
      .limit(5)
    if (data) setLowStock(data.filter(p => getStatus(p.qty_on_hand, p.reorder_point) !== 'ok'))
  }

  const loadCategoryBreakdown = async () => {
    const { data } = await supabase
      .from('products')
      .select('category, qty_on_hand, cost_price')
      .eq('is_active', true)
    if (!data) return
    const map: Record<string, {count:number;value:number}> = {}
    data.forEach(p => {
      const cat = p.category || 'Uncategorised'
      if (!map[cat]) map[cat] = { count: 0, value: 0 }
      map[cat].count++
      map[cat].value += (p.qty_on_hand || 0) * (p.cost_price || 0)
    })
    const sorted = Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value)
    setCatBreakdown(sorted)
  }

  const fmt = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(0) + 'K' : n.toLocaleString()

  const TYPE_PILL: Record<string, string> = {
    cash_sale: 'pill-green', cash_payment: 'pill-red', grn: 'pill-blue',
    purchase_invoice: 'pill-amber', journal: 'pill-gray', bank_transfer: 'pill-blue',
  }
  const TYPE_LABEL: Record<string, string> = {
    cash_sale: 'Sale', cash_payment: 'Payment', grn: 'GRN',
    purchase_invoice: 'Purchase', journal: 'Journal', bank_transfer: 'Transfer',
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{greeting()}, {firstName}</div>
          <div className="page-sub">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' '}· DSM HQ · <span className="sync-dot"></span> Live
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadDashboard} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav('cash-sale')} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg> New Cash Sale</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav('vouchers')}>+ New Voucher</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card amber">
          
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">{loading ? '…' : fmt(stats.totalRevenue)}</div>
          <div className="stat-change up">From posted sales</div>
        </div>
        <div className="stat-card green">
          
          <div className="stat-label">Gross Profit</div>
          <div className="stat-value">{loading ? '…' : fmt(stats.netProfit)}</div>
          <div className="stat-change up">Revenue minus COGS</div>
        </div>
        <div className="stat-card blue">
          
          <div className="stat-label">Products in Stock</div>
          <div className="stat-value">{loading ? '…' : stats.productCount}</div>
          <div className="stat-change down">↓ {stats.lowStockCount} low stock</div>
        </div>
        <div className="stat-card red">
          
          <div className="stat-label">Draft Vouchers</div>
          <div className="stat-value">{loading ? '…' : stats.pendingVouchers}</div>
          <div className="stat-change down">Needs attention</div>
        </div>
      </div>

      <div className="grid g32" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent Transactions</div>
              <div className="card-sub">Last posted vouchers · Live from Supabase</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('reports')}>View all</button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : recentVouchers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>No transactions yet. Post your first voucher.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ref</th><th>Description</th><th>Type</th><th className="td-right">Amount (TZS)</th><th>Status</th></tr></thead>
                <tbody>
                  {recentVouchers.map((v, i) => (
                    <tr key={i}>
                      <td className="td-mono td-amber">{v.ref}</td>
                      <td style={{ fontSize: 12 }}>{v.description}</td>
                      <td><span className={`pill ${TYPE_PILL[v.type] || 'pill-gray'}`}>{TYPE_LABEL[v.type] || v.type}</span></td>
                      <td className="td-right td-mono td-green">{v.total_amount?.toLocaleString()}</td>
                      <td><span className="pill pill-green">{v.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card-sm">
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">Stock Alerts</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav('inventory')}>Manage</button>
            </div>
            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>Loading…</div>
            ) : lowStock.length === 0 ? (
              <div style={{ color: 'var(--green)', fontSize: 12 }}>All products have sufficient stock</div>
            ) : (
              lowStock.map((p, i) => {
                const s = getStatus(p.qty_on_hand, p.reorder_point)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: `var(--${s === 'critical' ? 'red' : 'yellow'}-dim)`, border: `1px solid rgba(${s === 'critical' ? '255,71,87' : '255,211,42'},.2)`, borderRadius: 8, marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)' }}>{p.name}</span>
                    <span className={`pill pill-${s === 'critical' ? 'red' : 'yellow'}`} style={{ fontSize: 10 }}>{p.qty_on_hand} left · {s.toUpperCase()}</span>
                  </div>
                )
              })
            )}
          </div>

          {/* Category Breakdown */}
          <div className="card card-sm">
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">Stock by Category</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav('stock-valuation')}>Full report</button>
            </div>
            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>Loading…</div>
            ) : catBreakdown.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>No products yet</div>
            ) : (
              catBreakdown.slice(0, 6).map((cat, i) => {
                const catMeta = categories.find(c => c.name === cat.name)
                const color = catMeta?.color || '#85c2be'
                const maxVal = catBreakdown[0]?.value || 1
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                        {cat.name}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 10 }}>
                        {cat.count} SKU · {(cat.value / 1000).toFixed(0)}K
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((cat.value / maxVal) * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="card card-sm">
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">P&L Snapshot</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav('pnl')}>Full report</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)' }}>Revenue</span>
              <span className="td-mono td-green">{loading ? '…' : stats.totalRevenue.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)' }}>Cost of Goods</span>
              <span className="td-mono td-red">{loading ? '…' : `(${stats.totalCogs.toLocaleString()})`}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, padding: '10px 0 0' }}>
              <span>Gross Profit</span>
              <span className="td-mono" style={{ color: stats.netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>{loading ? '…' : stats.netProfit.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recurring expense alert */}
      {unpaidRecurring && unpaidRecurring.filter((u: any) => u.is_due).length > 0 && (
        <div className="card card-sm" style={{ marginBottom: 16, borderLeft: '3px solid var(--yellow)', cursor: 'pointer' }} onClick={() => onNav('payment-register')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {unpaidRecurring.filter((u: any) => u.is_due).length} recurring expense{unpaidRecurring.filter((u: any) => u.is_due).length > 1 ? 's' : ''} due
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {unpaidRecurring.filter((u: any) => u.is_due).slice(0, 3).map((u: any) => u.name).join(' · ')}
                {unpaidRecurring.filter((u: any) => u.is_due).length > 3 && ` + ${unpaidRecurring.filter((u: any) => u.is_due).length - 3} more`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>
                {tzs(unpaidRecurring.filter((u: any) => u.is_due).reduce((s: number, u: any) => s + u.amount, 0))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>Total due</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid g4">
        {[
          { icon: '', label: 'New Cash Sale', page: 'cash-sale' as Page, color: 'rgba(212,135,74,.12)' },
          { icon: '', label: 'New GRN', page: 'grn' as Page, color: 'rgba(251,146,60,.12)' },
          { icon: '', label: 'P&L Report', page: 'pnl' as Page, color: 'rgba(0,229,160,.12)' },
          { icon: '', label: 'Chart of Accounts', page: 'chart-of-accounts' as Page, color: 'rgba(168,85,247,.12)' },
        ].map((item, i) => (
          <div key={i} className="card card-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => onNav(item.page)}>
            <div style={{ width: 40, height: 40, background: item.color, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{item.icon}</div>
            <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
