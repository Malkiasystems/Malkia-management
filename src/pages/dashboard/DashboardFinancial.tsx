// ============================================================================
// DashboardFinancial.tsx
// Sensitive tier. Rendered only when the viewer has dashboard.view_financials
// (the parent decides; this component assumes data.financial is non-null).
// Current-month P&L with vs-last-month deltas, plus cash, inventory value,
// payroll, AR aging, and AP/debt.
// ============================================================================

import type { FinancialData, MoneyDelta } from '../../lib/dashboardTypes'
import { tzs } from '../../lib/utils'

const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const p: Record<string, React.ReactNode> = {
    up: <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />,
    down: <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />,
    wallet: <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></>,
    box: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
    arrowDownLeft: <><line x1="17" y1="7" x2="7" y2="17" /><polyline points="17 17 7 17 7 7" /></>,
    arrowUpRight: <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{p[name] || <circle cx="12" cy="12" r="10" />}</svg>
}

function Delta({ d, invert = false }: { d: MoneyDelta; invert?: boolean }) {
  if (d.deltaPct === null) return <span style={{ fontSize: 11, color: 'var(--text3)' }}>no prior month</span>
  const good = invert ? d.deltaPct < 0 : d.deltaPct >= 0
  const color = good ? '#10b981' : '#ef4444'
  return (
    <span style={{ fontSize: 11, color, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      <Icon name={d.deltaPct >= 0 ? 'up' : 'down'} size={12} color={color} />
      {Math.abs(d.deltaPct).toFixed(0)}% vs last month
    </span>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }
const label: React.CSSProperties = { fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px' }
const big: React.CSSProperties = { fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', margin: '4px 0' }

export default function DashboardFinancial({ fin, monthLabel }: { fin: FinancialData; monthLabel: string }) {
  const neg = (n: number) => n < 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
      <div style={{ ...label, fontSize: 11, color: 'var(--accent)' }}>Financials · {monthLabel}</div>

      {/* Monthly P&L cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={label}>Revenue</div>
          <div style={{ ...big, color: '#5EA8A2' }}>{tzs(fin.revenue.current)}</div>
          <Delta d={fin.revenue} />
        </div>
        <div style={card}>
          <div style={label}>Gross Profit · {fin.marginPct.toFixed(0)}% margin</div>
          <div style={{ ...big, color: neg(fin.grossProfit.current) ? '#ef4444' : '#10b981' }}>{tzs(fin.grossProfit.current)}</div>
          <Delta d={fin.grossProfit} />
        </div>
        <div style={card}>
          <div style={label}>Operating Expenses</div>
          <div style={{ ...big, color: '#e0a458' }}>{tzs(fin.expenses.current)}</div>
          <Delta d={fin.expenses} invert />
        </div>
        <div style={card}>
          <div style={label}>Net Profit</div>
          <div style={{ ...big, color: neg(fin.netProfit.current) ? '#ef4444' : '#10b981' }}>{tzs(fin.netProfit.current)}</div>
          <Delta d={fin.netProfit} />
        </div>
      </div>

      {/* Position + AR + AP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={label}>Cash Position</div><Icon name="wallet" color="#5EA8A2" />
          </div>
          <div style={{ ...big, color: '#5EA8A2' }}>{tzs(fin.cashPosition)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Tills, mobile money &amp; banks · Inventory {tzs(fin.inventoryValue)} · Payroll/mo {tzs(fin.payrollCost)}</div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={label}>Receivables ({fin.ar.customerCount})</div><Icon name="arrowDownLeft" color="#3b82f6" />
          </div>
          <div style={{ ...big, color: '#3b82f6' }}>{tzs(fin.ar.total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            0-30: {tzs(fin.ar.aging.current)} · 90+: <span style={{ color: fin.ar.aging.d90plus > 0 ? '#ef4444' : 'var(--text3)' }}>{tzs(fin.ar.aging.d90plus)}</span>
            {fin.ar.top[0] && <div>Top: {fin.ar.top[0].name} {tzs(fin.ar.top[0].amount)}</div>}
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={label}>Payables &amp; Debt</div><Icon name="arrowUpRight" color="#ef4444" />
          </div>
          <div style={{ ...big, color: '#ef4444' }}>{tzs(fin.ap.suppliers + fin.ap.loans)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Suppliers {tzs(fin.ap.suppliers)} · Loans {tzs(fin.ap.loans)}</div>
        </div>
      </div>
    </div>
  )
}
