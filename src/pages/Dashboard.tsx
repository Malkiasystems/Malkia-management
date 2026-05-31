// ============================================================================
// Dashboard.tsx
// CEO dashboard shell. Decides what to show from the viewer's permission, then
// composes the financial (gated) and operational sections. Current-month data
// via useDashboard. Header, greeting, and action buttons preserved from the
// original. Sensitive data is gated by dashboard.view_financials OR super admin,
// and is not fetched at all for users who lack it.
// ============================================================================

import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { useDashboard } from '../lib/useDashboard'
import DashboardFinancial from './dashboard/DashboardFinancial'
import DashboardOperations from './dashboard/DashboardOperations'

interface Props { onNav: (p: Page) => void }

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard({ onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const canViewFinancials = can('dashboard.view_financials') || isSuperAdmin()
  const { data, loading, error, reload } = useDashboard(canViewFinancials)

  const firstName = user?.full_name?.split(' ')[0] || 'there'

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
          <button className="btn btn-ghost btn-sm" onClick={reload} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg> Refresh
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav('cash-sale')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg> New Cash Sale
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav('vouchers')}>+ New Voucher</button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text3)', padding: 40, textAlign: 'center' }}>Loading dashboard…</div>}
      {error && !loading && <div className="card" style={{ color: '#ef4444' }}>Failed to load: {error}</div>}

      {data && !loading && (
        <>
          {canViewFinancials && data.financial && (
            <DashboardFinancial fin={data.financial} monthLabel={data.monthLabel} />
          )}
          <DashboardOperations ops={data.operations} monthLabel={data.monthLabel} />
        </>
      )}
    </div>
  )
}
