// ============================================================================
// Dashboard.tsx
// CEO dashboard shell. Decides what to show from the viewer's permission, then
// composes the financial (gated) and operational sections. Current-month data
// via useDashboard. Sensitive data is gated by dashboard.view_financials OR
// super admin, and is not fetched at all for users who lack it.
//
// Presentation layer ported from the Tarakimu build: staggered entrance,
// gradient name sweep, radar live dot, icon micro-motion, layout-matched
// loading skeletons, and the rotating reel view. Data paths unchanged.
//
// Deliberately NOT ported: the onboarding checklist, the shortcuts panel and
// the branch selector. All three are multi-tenant or multi-branch features
// that do not exist here.
// ============================================================================

import type { CSSProperties } from 'react'
import type { Page } from '../lib/types'
import { useState } from 'react'
import { useAuth } from '../lib/useAuth'
import ApprovalNag from '../components/ApprovalNag'
import { useDashboard } from '../lib/useDashboard'
import DashboardFinancial from './dashboard/DashboardFinancial'
import DashboardOperations from './dashboard/DashboardOperations'
import DashboardReel from './dashboard/DashboardReel'
import { Ic } from './dashboard/dashboardUi'
import ShortcutTiles from '../components/ShortcutTiles'

interface Props { onNav: (p: Page) => void }

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Layout-matched skeleton: the same grid shapes as the loaded page, so the
// content does not jump when the data lands.
function Skeleton() {
  return (
    <div aria-hidden="true">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div className="skel" style={{ height: 10, width: '55%' }} />
            <div className="skel" style={{ height: 24, width: '70%', margin: '10px 0 8px' }} />
            <div className="skel" style={{ height: 10, width: '45%' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[0, 1, 2].map(i => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div className="skel" style={{ height: 10, width: '40%' }} />
            <div className="skel" style={{ height: 24, width: '60%', margin: '10px 0 8px' }} />
            <div className="skel" style={{ height: 10, width: '80%' }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="skel" style={{ height: 12, width: '30%', marginBottom: 12 }} />
        <div className="skel" style={{ height: 90, width: '100%' }} />
      </div>
    </div>
  )
}

export default function Dashboard({ onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const canViewFinancials = can('dashboard.view_financials') || isSuperAdmin()
  const { data, loading, error, reload } = useDashboard(canViewFinancials)

  const [view, setView] = useState<'reel' | 'grid'>(() => {
    try { return localStorage.getItem('malkia.dash.view') === 'grid' ? 'grid' : 'reel' } catch { return 'reel' }
  })
  const flipView = () => {
    const next = view === 'reel' ? 'grid' : 'reel'
    setView(next)
    try { localStorage.setItem('malkia.dash.view', next) } catch { /* private mode */ }
  }

  const firstName = user?.full_name?.split(' ')[0] || 'there'

  return (
    <>
    <ApprovalNag onNav={onNav} />
    <div className="page">
      <div className="page-header dash-anim" style={{ '--d': 0 } as CSSProperties}>
        <div>
          <div className="page-title">
            {greeting()}, <span className="grad-name">{firstName}</span>
          </div>
          <div className="page-sub">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' '}· DSM HQ · <span className="sync-dot live-dot"></span> Live
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={flipView} title={view === 'reel' ? 'Show every section at once' : 'Return to the rotating chapter view'}>
            {view === 'reel' ? 'Grid view' : 'Reel view'}
          </button>
          <button className="btn btn-ghost btn-sm btn-spin-icon" onClick={reload} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ic name="refresh" size={13} /> Refresh
          </button>
          <button className="btn btn-ghost btn-sm btn-nudge-icon" onClick={() => onNav('cash-sale')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ic name="till" size={13} /> New Cash Sale
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav('vouchers')}>+ New Voucher</button>
        </div>
      </div>

      {/* Shortcuts sit between the greeting and the dashboard proper. */}
      <div className="dash-anim" style={{ '--d': 1 } as CSSProperties}>
        <ShortcutTiles onNav={onNav} fin={data?.financial} canViewFinancials={canViewFinancials} />
      </div>

      {loading && <Skeleton />}
      {error && !loading && <div className="card" style={{ color: 'var(--red)' }}>Failed to load: {error}</div>}

      {data && !loading && view === 'reel' && (
        <div className="dash-anim" style={{ '--d': 2 } as CSSProperties}>
          <DashboardReel data={data} canViewFinancials={canViewFinancials} onNav={onNav} />
        </div>
      )}

      {data && !loading && view === 'grid' && (
        <>
          {canViewFinancials && data.financial && (
            <DashboardFinancial fin={data.financial} monthLabel={data.monthLabel} />
          )}
          <DashboardOperations ops={data.operations} monthLabel={data.monthLabel} />
        </>
      )}
    </div>
    </>
  )
}
