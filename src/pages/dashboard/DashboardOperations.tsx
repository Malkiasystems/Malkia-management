// ============================================================================
// DashboardOperations.tsx
// Operational tier, visible to everyone. Sales, inventory, HRM headcount, CRM,
// approvals, and the preserved Recent Transactions / Stock Alerts / Stock by
// Category sections that were on the original dashboard.
// ============================================================================

import type { OperationsData } from '../../lib/dashboardTypes'
import { tzs } from '../../lib/utils'

const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const p: Record<string, React.ReactNode> = {
    cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    box: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
    heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{p[name] || <circle cx="12" cy="12" r="10" />}</svg>
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }
const label: React.CSSProperties = { fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px' }
const big: React.CSSProperties = { fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', margin: '4px 0' }
const sub: React.CSSProperties = { fontSize: 11, color: 'var(--text3)' }

export default function DashboardOperations({ ops, monthLabel }: { ops: OperationsData; monthLabel: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...label, fontSize: 11 }}>Operations · {monthLabel}</div>

      {/* Operational stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={label}>Sales this month</div><Icon name="cart" color="#5EA8A2" /></div>
          <div style={{ ...big, color: '#5EA8A2' }}>{tzs(ops.sales.total)}</div>
          <div style={sub}>{ops.sales.count} txns · cash {tzs(ops.sales.cash)} · credit {tzs(ops.sales.credit)}</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={label}>Inventory</div><Icon name="box" color="#3b82f6" /></div>
          <div style={{ ...big, color: '#3b82f6' }}>{ops.inventory.products}</div>
          <div style={sub}>products · <span style={{ color: ops.inventory.outOfStock ? '#ef4444' : 'var(--text3)' }}>{ops.inventory.outOfStock} out</span> · {ops.inventory.lowStock} low</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={label}>Team</div><Icon name="users" color="#8b5cf6" /></div>
          <div style={{ ...big, color: '#8b5cf6' }}>{ops.hrm.headcount}</div>
          <div style={sub}>active · {ops.hrm.onLeave} on leave today</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={label}>CRM</div><Icon name="heart" color="#ec4899" /></div>
          <div style={{ ...big, color: '#ec4899' }}>{ops.crm.retailCustomers}</div>
          <div style={sub}>mamas · +{ops.crm.newRetailThisMonth} new · B2B {ops.crm.b2bProspects} prospects{ops.crm.b2bOverdue ? `, ${ops.crm.b2bOverdue} overdue` : ''}</div>
        </div>
      </div>

      {/* Approvals + B2B won strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {ops.approvalsPending > 0 && (
          <div style={{ ...card, flex: 1, minWidth: 200, borderColor: '#e0a45855' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={label}>Pending approvals</div><Icon name="check" color="#e0a458" /></div>
            <div style={{ ...big, color: '#e0a458' }}>{ops.approvalsPending}</div>
            <div style={sub}>awaiting your decision</div>
          </div>
        )}
        <div style={{ ...card, flex: 1, minWidth: 200 }}>
          <div style={label}>B2B won this month</div>
          <div style={{ ...big, color: '#10b981' }}>{ops.crm.b2bWonThisMonth}</div>
          <div style={sub}>new wholesale accounts converted</div>
        </div>
      </div>

      {/* Preserved sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Recent Transactions</div>
          {ops.recentVouchers.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 8 }}>{v.ref}</span>{v.description}
              </div>
              <div style={{ fontFamily: 'var(--mono)', color: '#5EA8A2' }}>{tzs(v.total_amount)}</div>
            </div>
          ))}
          {ops.recentVouchers.length === 0 && <div style={sub}>No recent transactions.</div>}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Stock Alerts</div>
          {ops.stockAlerts.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <span>{s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: s.qty_on_hand <= 0 ? '#ef4444' : '#e0a458' }}>
                {s.qty_on_hand} left{s.qty_on_hand <= 0 ? ' · CRITICAL' : ''}
              </span>
            </div>
          ))}
          {ops.stockAlerts.length === 0 && <div style={sub}>All stock healthy.</div>}
        </div>
      </div>

      {ops.categoryBreakdown.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Stock by Category</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {ops.categoryBreakdown.map((c, i) => (
              <div key={i} style={{ fontSize: 12.5 }}>
                <span style={{ color: 'var(--text3)' }}>{c.category}: </span>
                <span style={{ fontWeight: 700 }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
