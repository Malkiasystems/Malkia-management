// ============================================================================
// DashboardOperations.tsx
// Operational tier, visible to everyone. Sales, inventory, HRM headcount, CRM,
// approvals, and the preserved Recent Transactions / Stock Alerts / Stock by
// Category sections. Presentation upgraded: count-up numbers, tone glow cards,
// duotone icons, entrance stagger. Data reads unchanged.
// ============================================================================

import type { CSSProperties, ReactNode } from 'react'
import type { OperationsData } from '../../lib/dashboardTypes'
import { tzs } from '../../lib/utils'
import { CountUp, DuoIcon } from './dashboardUi'

const label: CSSProperties = { fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px' }
const big: CSSProperties = { fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', margin: '4px 0', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }
const sub: CSSProperties = { fontSize: 11, color: 'var(--text3)' }

function OpCard({ title, tone, icon, value, format, children, d }: {
  title: string; tone: string; icon: string; value: number
  format?: (n: number) => string; children: ReactNode; d: number
}) {
  return (
    <div className="card kpi dash-anim" style={{ '--kpi-tone': tone, '--d': d, padding: 16 } as CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={label}>{title}</div>
        <DuoIcon name={icon} tone={tone} size={30} />
      </div>
      <div style={{ ...big, color: tone }}>
        <CountUp value={value} format={format ?? (n => Math.round(n).toLocaleString())} />
      </div>
      <div style={sub}>{children}</div>
    </div>
  )
}

export default function DashboardOperations({ ops, monthLabel }: { ops: OperationsData; monthLabel: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="dash-anim" style={{ ...label, fontSize: 11, '--d': 11 } as CSSProperties}>Operations · {monthLabel}</div>

      {/* Operational stat cards — staggered left to right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <OpCard title="Sales this month" tone="var(--accent)" icon="cart" value={ops.sales.total} format={tzs} d={12}>
          {ops.sales.count} txns · cash {tzs(ops.sales.cash)} · credit {tzs(ops.sales.credit)}
        </OpCard>
        <OpCard title="Inventory" tone="var(--blue)" icon="crate" value={ops.inventory.products} d={13}>
          products · <span style={{ color: ops.inventory.outOfStock ? 'var(--red)' : 'var(--text3)' }}>{ops.inventory.outOfStock} out</span> · {ops.inventory.lowStock} low
        </OpCard>
        <OpCard title="Team" tone="var(--blue)" icon="people" value={ops.hrm.headcount} d={14}>
          active · {ops.hrm.onLeave} on leave today
        </OpCard>
        <OpCard title="CRM" tone="var(--accent)" icon="heart" value={ops.crm.retailCustomers} d={15}>
          customers · +{ops.crm.newRetailThisMonth} new · B2B {ops.crm.b2bProspects} prospects{ops.crm.b2bOverdue ? `, ${ops.crm.b2bOverdue} overdue` : ''}
        </OpCard>
      </div>

      {/* Approvals + B2B won strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {ops.approvalsPending > 0 && (
          <div className="card kpi dash-anim" style={{ flex: 1, minWidth: 200, padding: 16, borderColor: 'color-mix(in srgb, var(--yellow) 35%, var(--border))', '--kpi-tone': 'var(--yellow)', '--d': 16 } as CSSProperties}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={label}>Pending approvals</div>
              <DuoIcon name="stamp" tone="var(--yellow)" size={30} />
            </div>
            <div style={{ ...big, color: 'var(--yellow)' }}><CountUp value={ops.approvalsPending} format={n => Math.round(n).toString()} /></div>
            <div style={sub}>awaiting your decision</div>
          </div>
        )}
        <div className="card kpi dash-anim" style={{ flex: 1, minWidth: 200, padding: 16, '--kpi-tone': 'var(--green)', '--d': 17 } as CSSProperties}>
          <div style={label}>B2B won this month</div>
          <div style={{ ...big, color: 'var(--green)' }}><CountUp value={ops.crm.b2bWonThisMonth} format={n => Math.round(n).toString()} /></div>
          <div style={sub}>new wholesale accounts converted</div>
        </div>
      </div>

      {/* Preserved sections */}
      <div className="dash-anim" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, '--d': 18 } as CSSProperties}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Recent Transactions</div>
          {ops.recentVouchers.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 8 }}>{v.ref}</span>{v.description}
              </div>
              <div style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(v.total_amount)}</div>
            </div>
          ))}
          {ops.recentVouchers.length === 0 && <div style={sub}>No recent transactions.</div>}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Stock Alerts</div>
          {ops.stockAlerts.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <span>{s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: s.qty_on_hand <= 0 ? 'var(--red)' : 'var(--yellow)' }}>
                {s.qty_on_hand} left{s.qty_on_hand <= 0 ? ' · CRITICAL' : ''}
              </span>
            </div>
          ))}
          {ops.stockAlerts.length === 0 && <div style={sub}>All stock healthy.</div>}
        </div>
      </div>

      {ops.categoryBreakdown.length > 0 && (
        <div className="card dash-anim" style={{ padding: 16, '--d': 19 } as CSSProperties}>
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
