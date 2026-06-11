// ════════════════════════════════════════════════════════════════════════════
// StockDashboard.tsx
//
// Home surface for the Stock Manager workspace (users.workspace_role = 'stock').
// QUANTITIES ONLY — no money is shown anywhere on this page.
//
// Data/reads live in useStockDashboard.ts; types in stockDashboardTypes.ts.
// This file is UI + local state only.
// ════════════════════════════════════════════════════════════════════════════

import { useAuth } from '../lib/useAuth'
import { useUserLocation } from '../lib/useUserLocation'
import { useStockDashboard } from '../lib/useStockDashboard'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

const numberFmt = (n: number) => n.toLocaleString('en-US')

export default function StockDashboard({ onNav }: Props) {
  const { user } = useAuth()
  const userLoc = useUserLocation()
  const { data, loading, error, reload } = useStockDashboard(userLoc.defaultLocationId)

  const firstName = (user?.full_name || '').split(' ')[0] || 'there'
  const locLabel = data?.locationName
    ? `${data.locationCode} — ${data.locationName}`
    : (userLoc.loading ? 'Loading location…' : 'All locations')

  const quickActions: { label: string; page: Page; icon: string }[] = [
    { label: 'Receive Goods', page: 'grn', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12.01l8.73-5.05 M12 22.08V12' },
    { label: 'Transfer Stock', page: 'stock-transfer', icon: 'M16 3h5v5 M21 3l-7 7 M8 21H3v-5 M3 21l7-7' },
    { label: 'Request Stock', page: 'stock-transfer-request', icon: 'M12 5v14 M5 12h14' },
    { label: 'View Inventory', page: 'inventory', icon: 'M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Habari, {firstName} 👋</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
            Stock at <strong style={{ color: 'var(--text)' }}>{locLabel}</strong>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => reload()} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--red)', marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>Could not load some figures: {error}</div>
        </div>
      )}

      {/* Stat tiles — quantities only */}
      <div className="grid g4" style={{ gap: 14, marginBottom: 18 }}>
        <div className="stat-card">
          <div className="stat-label">Products Carried</div>
          <div className="stat-value">{loading ? '—' : numberFmt(data?.totalSkus ?? 0)}</div>
          <div className="stat-change">SKUs at this location</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Units on Hand</div>
          <div className="stat-value">{loading ? '—' : numberFmt(data?.totalUnits ?? 0)}</div>
          <div className="stat-change">Total quantity</div>
        </div>
        <div className={`stat-card${(data?.lowStockCount ?? 0) > 0 ? ' yellow' : ''}`}>
          <div className="stat-label">Low Stock</div>
          <div className="stat-value">{loading ? '—' : numberFmt(data?.lowStockCount ?? 0)}</div>
          <div className="stat-change">At or below reorder point</div>
        </div>
        <div className={`stat-card${(data?.outOfStockCount ?? 0) > 0 ? ' red' : ''}`}>
          <div className="stat-label">Out of Stock</div>
          <div className="stat-value">{loading ? '—' : numberFmt(data?.outOfStockCount ?? 0)}</div>
          <div className="stat-change">{(data?.outOfStockCount ?? 0) > 0 ? 'Action needed' : 'All stocked'}</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Quick Actions</div>
        <div className="grid g4" style={{ gap: 12 }}>
          {quickActions.map(a => (
            <button
              key={a.page}
              onClick={() => onNav(a.page)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '18px 10px', borderRadius: 10, cursor: 'pointer',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text)', transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={a.icon} />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid g2" style={{ gap: 18, alignItems: 'start' }}>
        {/* Low stock list */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Reorder Watchlist</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>lowest first</span>
          </div>
          {loading ? (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 0' }}>Loading…</div>
          ) : (data?.lowStockItems.length ?? 0) === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 0' }}>Nothing at or below reorder point. 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data!.lowStockItems.map(it => (
                <div key={it.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13 }}>{it.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: it.qty <= 0 ? 'var(--red)' : 'var(--yellow)' }}>
                    {numberFmt(it.qty)} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>/ {numberFmt(it.reorderPoint)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: pending transfers + recent receipts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Transfers</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => onNav('stock-transfer-approvals')}
                style={{ flex: 1, textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, cursor: 'pointer' }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: (data?.pendingTransfersOut ?? 0) > 0 ? 'var(--accent)' : 'var(--text)' }}>
                  {loading ? '—' : numberFmt(data?.pendingTransfersOut ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Awaiting your approval</div>
              </button>
              <button
                onClick={() => onNav('stock-transfer-register')}
                style={{ flex: 1, textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, cursor: 'pointer' }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                  {loading ? '—' : numberFmt(data?.pendingTransfersIn ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Incoming requests pending</div>
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Recent Receipts (GRN)</div>
            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 0' }}>Loading…</div>
            ) : (data?.recentReceipts.length ?? 0) === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 0' }}>No goods received yet at this location.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data!.recentReceipts.map(r => (
                  <div key={r.ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{r.ref}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.date} · {r.lineCount} {r.lineCount === 1 ? 'item' : 'items'}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>+{numberFmt(r.totalQty)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
