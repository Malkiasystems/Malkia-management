import { PRODUCTS } from '../lib/data'
import { greeting, getStatus } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

export default function Dashboard({ onNav }: Props) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{greeting()}, Joe 👋</div>
          <div className="page-sub">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' '}· DSM HQ · <span className="sync-dot"></span> Live
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => onNav('cash-sale')}>💵 Cash Sale</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav('vouchers')}>+ New Voucher</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card amber"><span className="stat-icon">💰</span><div className="stat-label">Revenue — Mar 2026</div><div className="stat-value">4.25M</div><div className="stat-change up">▲ +18% vs Feb</div></div>
        <div className="stat-card green"><span className="stat-icon">📊</span><div className="stat-label">Net Profit — Mar</div><div className="stat-value">1.82M</div><div className="stat-change up">▲ Margin 43%</div></div>
        <div className="stat-card blue"><span className="stat-icon">📦</span><div className="stat-label">Products in Stock</div><div className="stat-value">{PRODUCTS.length}</div><div className="stat-change down">▼ 3 low stock</div></div>
        <div className="stat-card red"><span className="stat-icon">⚠️</span><div className="stat-label">Pending Vouchers</div><div className="stat-value">7</div><div className="stat-change down">▼ Needs attention</div></div>
      </div>

      <div className="grid g32" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">Recent Transactions</div><div className="card-sub">Last posted vouchers</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('reports')}>View all</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ref</th><th>Description</th><th>Type</th><th className="td-right">Amount (TZS)</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td className="td-mono td-amber">CS-0042</td><td>Cash Sale — Amina Hassan</td><td><span className="pill pill-green">Receipt</span></td><td className="td-right td-mono td-green">185,000</td><td><span className="pill pill-green">Posted</span></td></tr>
                <tr><td className="td-mono td-amber">PV-0031</td><td>Supplier payment — Meditech</td><td><span className="pill pill-red">Payment</span></td><td className="td-right td-mono td-red">420,000</td><td><span className="pill pill-green">Posted</span></td></tr>
                <tr><td className="td-mono td-amber">GRN-0018</td><td>Breast pumps — 20 units received</td><td><span className="pill pill-blue">GRN</span></td><td className="td-right td-mono td-blue">1,200,000</td><td><span className="pill pill-green">Posted</span></td></tr>
                <tr><td className="td-mono td-amber">CS-0041</td><td>Cash Sale — Grace Mwanza</td><td><span className="pill pill-green">Receipt</span></td><td className="td-right td-mono td-green">95,000</td><td><span className="pill pill-green">Posted</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card-sm">
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">⚠️ Stock Alerts</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav('inventory')}>Manage</button>
            </div>
            {PRODUCTS.filter(p => getStatus(p.qty, p.reorder) !== 'ok').map((p, i) => {
              const s = getStatus(p.qty, p.reorder)
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: `var(--${s === 'critical' ? 'red' : 'yellow'}-dim)`,
                  border: `1px solid rgba(${s === 'critical' ? '255,71,87' : '255,211,42'},.2)`,
                  borderRadius: 8, marginBottom: 6
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)' }}>{p.name}</span>
                  <span className={`pill pill-${s === 'critical' ? 'red' : 'yellow'}`} style={{ fontSize: 10 }}>{p.qty} left · {s.toUpperCase()}</span>
                </div>
              )
            })}
          </div>

          <div className="card card-sm">
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">P&L Snapshot</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav('pnl')}>Full report</button>
            </div>
            {[{ l: 'Revenue', v: '4,250,000', c: 'td-green' }, { l: 'Cost of Goods', v: '(1,680,000)', c: 'td-red' }, { l: 'Operating Exp', v: '(750,000)', c: 'td-red' }].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text3)' }}>{r.l}</span>
                <span className={`td-mono ${r.c}`}>{r.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, padding: '10px 0 0' }}>
              <span>Net Profit</span>
              <span className="td-mono" style={{ color: 'var(--green)' }}>1,820,000</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid g4">
        {[
          { icon: '💵', label: 'New Cash Sale', page: 'cash-sale' as Page, color: 'rgba(212,135,74,.12)' },
          { icon: '🚛', label: 'New GRN', page: 'grn' as Page, color: 'rgba(251,146,60,.12)' },
          { icon: '📊', label: 'P&L Report', page: 'pnl' as Page, color: 'rgba(0,229,160,.12)' },
          { icon: '📒', label: 'Chart of Accounts', page: 'chart-of-accounts' as Page, color: 'rgba(168,85,247,.12)' },
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
