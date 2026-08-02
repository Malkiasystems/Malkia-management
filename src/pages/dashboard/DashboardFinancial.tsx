// ============================================================================
// DashboardFinancial.tsx
// Sensitive tier. Rendered only when the viewer has dashboard.view_financials
// (the parent decides; this component assumes data.financial is non-null).
// Same data reads as before — presentation upgraded: count-up values,
// per-card tone glow, hover lift, delta→sparkline, "no prior month" pill.
// ============================================================================

import type { CSSProperties, ReactNode } from 'react'
import type { FinancialData, MoneyDelta, PnlLine } from '../../lib/dashboardTypes'
import { tzs } from '../../lib/utils'
import { CountUp, Spark, DuoIcon, DeltaTag } from './dashboardUi'

const label: CSSProperties = { fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px' }
const big: CSSProperties = { fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', margin: '4px 0', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }

function KpiCard({ d, title, tone, icon, invert, valueTone }: {
  d: MoneyDelta; title: string; tone: string; icon: string; invert?: boolean; valueTone?: string
}) {
  return (
    <div className="card kpi" style={{ '--kpi-tone': tone, padding: 16 } as CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={label}>{title}</div>
          <div style={{ ...big, color: valueTone ?? tone }}>
            <CountUp value={d.current} format={tzs} />
          </div>
          <DeltaTag deltaPct={d.deltaPct} invert={invert} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <DuoIcon name={icon} tone={tone} />
          <Spark prev={d.deltaPct === null ? null : d.previous} current={d.current} tone={tone} />
        </div>
      </div>
    </div>
  )
}

function SnapshotCard({ title, tone, icon, value, children, d }: {
  title: string; tone: string; icon: string; value: number; children: ReactNode; d?: number
}) {
  return (
    <div className="card kpi dash-anim" style={{ '--kpi-tone': tone, '--d': d ?? 0, padding: 16 } as CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={label}>{title}</div>
        <DuoIcon name={icon} tone={tone} size={30} />
      </div>
      <div style={{ ...big, color: tone }}><CountUp value={value} format={tzs} /></div>
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

export default function DashboardFinancial({ fin, monthLabel }: { fin: FinancialData; monthLabel: string }) {
  const neg = (n: number) => n < 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
      <div className="dash-anim" style={{ ...label, fontSize: 11, color: 'var(--accent)', '--d': 2 } as CSSProperties}>
        Financials · {monthLabel}
      </div>

      {/* Monthly P&L KPI row — staggered left to right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="dash-anim" style={{ '--d': 3 } as CSSProperties}>
          <KpiCard d={fin.revenue} title="Revenue" tone="var(--accent)" icon="coins" />
        </div>
        <div className="dash-anim" style={{ '--d': 4 } as CSSProperties}>
          <KpiCard d={fin.grossProfit} title={`Gross Profit · ${fin.marginPct.toFixed(0)}% margin`}
            tone={neg(fin.grossProfit.current) ? 'var(--red)' : 'var(--green)'} icon="scale" />
        </div>
        <div className="dash-anim" style={{ '--d': 5 } as CSSProperties}>
          <KpiCard d={fin.expenses} title="Operating Expenses" tone="var(--yellow)" icon="flame" invert />
        </div>
        <div className="dash-anim" style={{ '--d': 6 } as CSSProperties}>
          <KpiCard d={fin.netProfit} title="Net Profit"
            tone={neg(fin.netProfit.current) ? 'var(--red)' : 'var(--green)'} icon="bolt" />
        </div>
      </div>

      {/* Position + AR + AP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <SnapshotCard title="Cash Position" tone="var(--accent)" icon="vault" value={fin.cashPosition} d={7}>
          Tills, mobile money &amp; banks · Inventory {tzs(fin.inventoryValue)} · Payroll/mo {tzs(fin.payrollCost)}
        </SnapshotCard>

        <SnapshotCard title={`Receivables (${fin.ar.customerCount})`} tone="var(--blue)" icon="inflow" value={fin.ar.total} d={8}>
          0-30: {tzs(fin.ar.aging.current)} · 90+:{' '}
          <span style={{ color: fin.ar.aging.d90plus > 0 ? 'var(--red)' : 'var(--text3)' }}>{tzs(fin.ar.aging.d90plus)}</span>
          {fin.ar.top[0] && <div>Top: {fin.ar.top[0].name} {tzs(fin.ar.top[0].amount)}</div>}
        </SnapshotCard>

        <SnapshotCard title="Payables & Debt" tone="var(--red)" icon="outflow" value={fin.ap.suppliers + fin.ap.loans} d={9}>
          Suppliers {tzs(fin.ap.suppliers)} · Loans {tzs(fin.ap.loans)}
        </SnapshotCard>
      </div>

      {/* Month P&L breakdown by account */}
      <div className="card dash-anim" style={{ padding: 16, '--d': 10 } as CSSProperties}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Profit &amp; Loss · {monthLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          <PnlGroup title="Revenue" lines={fin.pnlBreakdown.revenue} total={fin.revenue.current} color="var(--green)" />
          <PnlGroup title="Cost of Goods Sold" lines={fin.pnlBreakdown.cogs} total={fin.revenue.current - fin.grossProfit.current} color="var(--red)" negative />
          <PnlGroup title="Operating Expenses" lines={fin.pnlBreakdown.expenses} total={fin.expenses.current} color="var(--yellow)" negative />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, fontWeight: 800 }}>
          <span>Net Profit · {monthLabel}</span>
          <span style={{ color: fin.netProfit.current < 0 ? 'var(--red)' : 'var(--green)' }}>{tzs(fin.netProfit.current)}</span>
        </div>
      </div>
    </div>
  )
}

function PnlGroup({ title, lines, total, color, negative = false }: { title: string; lines: PnlLine[]; total: number; color: string; negative?: boolean }) {
  return (
    <div>
      <div style={{ ...label, color }}>{title}</div>
      <div style={{ margin: '6px 0' }}>
        {lines.map(l => (
          <div key={l.code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', gap: 8 }}>
            <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{negative ? `(${tzs(l.value)})` : tzs(l.value)}</span>
          </div>
        ))}
        {lines.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>None this month</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 700, fontSize: 12.5 }}>
        <span>Total</span>
        <span style={{ fontFamily: 'var(--mono)', color }}>{negative ? `(${tzs(total)})` : tzs(total)}</span>
      </div>
    </div>
  )
}
