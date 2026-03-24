import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

export default function ReportsHub({ onNav }: Props) {
  const SECTIONS = [
    {
      title: 'Financial Statements', reports: [
        { name: 'Profit & Loss', icon: '📊', page: 'pnl' as Page, desc: 'Income vs expenses' },
        { name: 'Trial Balance', icon: '📋', page: 'trial-balance' as Page, desc: 'All account balances' },
      ]
    },
    {
      title: 'Registers', reports: [
        { name: 'Sales Register', icon: '🛒', page: 'sales-register' as Page, desc: 'All sales in date order' },
        { name: 'Purchase Register', icon: '🏭', page: 'purchase-register' as Page, desc: 'All purchase transactions' },
        { name: 'Payment Register', icon: '💸', page: 'payment-register' as Page, desc: 'All payments made' },
      ]
    },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📈 Reports</div>
          <div className="page-sub">Financial statements and registers — all live from transactions</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm">🖨️ Print</button>
          <button className="btn btn-primary btn-sm">📥 Export</button>
        </div>
      </div>

      {SECTIONS.map((section, si) => (
        <div key={si} style={{ marginBottom: 24 }}>
          <div className="section-label">
            <div className="section-bar"></div>
            <div className="section-title-txt">{section.title}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {section.reports.map((r, ri) => (
              <div key={ri} className="card card-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => onNav(r.page)}>
                <div style={{ width: 36, height: 36, background: 'var(--accent-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{r.icon}</div>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
