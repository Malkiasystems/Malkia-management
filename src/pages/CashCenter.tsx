// src/pages/CashCenter.tsx
// Cash Command Center — Scaling Up cash tools in one screen.
// Tabs: Today · 13-Week Forecast · Cash Cycle · Power of One
//
// WIRING (only you can do these, same as always):
//  1. Route: add to your router, e.g. case 'cash-center': return <CashCenter/>
//  2. Sidebar link: add under Reports or Banks — label "Cash Center".
//     (Purchase.tsx trap: a page with no link does not exist. Add the link.)
//
// Data notes, honest ones:
//  - Forecast inflows use an 8-week sales run-rate + simple AR spread. It is a
//    planning tool, not a promise. Until the 1-Aug cutover, expense-side data
//    is thin because historical expenses are under-recorded; the forecast's
//    outflows come from recurring_expenses, so KEEP THAT TABLE CURRENT.
//  - Cycle metrics need COGS to be posted (5xxx). Pre-cutover these are
//    indicative; they become true once August books are clean.

import { useState } from 'react'
import { useCashCenter } from '../hooks/useCashCenter'

const C = {
  teal: '#5EA8A2', maroon: '#5E2230', gold: '#C8A96E',
  green: 'var(--green, #3fb98f)', red: 'var(--red, #e5645d)',
  text3: 'var(--text3, #8b979d)', surface: 'var(--surface, #14181a)',
  surface2: 'var(--surface2, #1b2023)', border: 'var(--border, #252b2f)',
}
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US')
const fmtD = (n: number | null) => (n === null ? '—' : `${Math.round(n)} days`)

type Tab = 'today' | 'forecast' | 'cycle' | 'power'

export default function CashCenter() {
  const { loading, error, daily, forecast, cycle, power, reload } = useCashCenter()
  const [tab, setTab] = useState<Tab>('today')

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)}
      className="btn btn-sm"
      style={{
        background: tab === t ? C.teal : 'transparent',
        color: tab === t ? '#04211f' : 'inherit',
        border: `1px solid ${tab === t ? C.teal : C.border}`,
        borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer',
      }}>{label}</button>
  )

  const card: React.CSSProperties = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: 18, marginBottom: 16,
  }
  const kpi: React.CSSProperties = {
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: 16, flex: 1, minWidth: 180,
  }
  const kLabel: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase',
    letterSpacing: 0.6, color: C.text3, marginBottom: 6,
  }

  if (loading) return <div style={{ padding: 40, color: C.text3 }}>Loading cash data…</div>
  if (error) return (
    <div style={{ padding: 40 }}>
      <div style={{ color: C.red, marginBottom: 12 }}>{error}</div>
      <button className="btn" onClick={reload}>Retry</button>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Cash Center</h1>
        <span style={{ color: C.text3, fontSize: 13 }}>Growth sucks cash. Watch it daily.</span>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '16px 0 22px' }}>
        {tabBtn('today', 'Today')}
        {tabBtn('forecast', '13-Week Forecast')}
        {tabBtn('cycle', 'Cash Cycle')}
        {tabBtn('power', 'Power of One')}
      </div>

      {/* ============ TODAY ============ */}
      {tab === 'today' && daily && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ ...kpi, flex: 2 }}>
              <div style={kLabel}>Total cash now (books)</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: C.teal, fontFamily: 'var(--mono)' }}>
                TZS {fmt(daily.totalNow)}
              </div>
            </div>
            <div style={kpi}>
              <div style={kLabel}>Biggest in, last 7 days</div>
              {daily.biggestInWeek ? (
                <>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.green, fontFamily: 'var(--mono)' }}>+{fmt(daily.biggestInWeek.amount)}</div>
                  <div style={{ fontSize: 12, color: C.text3 }}>{daily.biggestInWeek.desc} · {daily.biggestInWeek.date}</div>
                </>
              ) : <div style={{ color: C.text3 }}>none</div>}
            </div>
            <div style={kpi}>
              <div style={kLabel}>Biggest out, last 7 days</div>
              {daily.biggestOutWeek ? (
                <>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.red, fontFamily: 'var(--mono)' }}>-{fmt(daily.biggestOutWeek.amount)}</div>
                  <div style={{ fontSize: 12, color: C.text3 }}>{daily.biggestOutWeek.desc} · {daily.biggestOutWeek.date}</div>
                </>
              ) : <div style={{ color: C.text3 }}>none</div>}
            </div>
          </div>

          <div style={card}>
            <div style={kLabel}>Per account</div>
            {daily.accounts.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                <span>{a.code} · {a.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: a.balance < 0 ? C.red : 'inherit' }}>{fmt(a.balance)}</span>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={kLabel}>Last 30 days, daily net movement</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, marginTop: 10 }}>
              {daily.byDay.map(d => {
                const max = Math.max(...daily.byDay.map(x => Math.abs(x.net)), 1)
                const h = Math.max(4, (Math.abs(d.net) / max) * 100)
                return (
                  <div key={d.date} title={`${d.date}: ${d.net >= 0 ? '+' : ''}${fmt(d.net)} (bal ${fmt(d.runningTotal)})`}
                    style={{ flex: 1, height: `${h}%`, background: d.net >= 0 ? C.green : C.red, borderRadius: 2, opacity: 0.85 }} />
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 8 }}>Green = net in · Red = net out · hover a bar for the date and running balance</div>
          </div>
        </>
      )}

      {/* ============ 13-WEEK FORECAST ============ */}
      {tab === 'forecast' && (
        <>
          <div style={{ ...card, borderColor: forecast.some(w => w.endingCash < 0) ? C.red : C.border }}>
            {forecast.some(w => w.endingCash < 0) ? (
              <div style={{ color: C.red, fontWeight: 700 }}>
                ⚠ Cash goes NEGATIVE in week {forecast.findIndex(w => w.endingCash < 0) + 1} ({forecast.find(w => w.endingCash < 0)?.weekStart}). Act before then: chase AR, delay a purchase, or arrange funding.
              </div>
            ) : (
              <div style={{ color: C.green, fontWeight: 700 }}>
                ✓ Cash stays positive across all 13 weeks on current run-rates and commitments.
              </div>
            )}
          </div>

          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.text3, textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Week</th>
                  <th style={{ padding: '8px 6px' }}>In</th>
                  <th style={{ padding: '8px 6px' }}>Out</th>
                  <th style={{ padding: '8px 6px' }}>Net</th>
                  <th style={{ padding: '8px 6px' }}>Ending cash</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((w, i) => (
                  <tr key={w.weekStart} style={{ borderTop: `1px solid ${C.border}`, background: w.endingCash < 0 ? 'rgba(229,100,93,.08)' : undefined }}>
                    <td style={{ padding: '8px 6px' }}>W{i + 1} · {w.weekStart}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.green }}>{fmt(w.inflow)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.red }}>{fmt(w.outflow)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{w.net >= 0 ? '+' : ''}{fmt(w.net)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: w.endingCash < 0 ? C.red : C.teal }}>{fmt(w.endingCash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...card, fontSize: 12, color: C.text3, lineHeight: 1.7 }}>
            How this is built: inflows = your 8-week sales run-rate, plus AR collected over the next 4 weeks.
            Outflows = your active recurring expenses on their due dates. It does NOT yet include
            one-off purchases, loan repayments you haven't scheduled, or the import shipping due —
            add those as recurring_expenses (even one-off, set a due date) and they appear here.
            Keep recurring_expenses current and this table stays honest.
          </div>
        </>
      )}

      {/* ============ CASH CYCLE ============ */}
      {tab === 'cycle' && cycle && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={kpi}>
              <div style={kLabel}>Stock days</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)' }}>{fmtD(cycle.stockDays)}</div>
              <div style={{ fontSize: 11, color: C.text3 }}>Stock value {fmt(cycle.stockValue)}</div>
            </div>
            <div style={kpi}>
              <div style={kLabel}>Debtor days</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)' }}>{fmtD(cycle.debtorDays)}</div>
              <div style={{ fontSize: 11, color: C.text3 }}>AR {fmt(cycle.arBalance)}</div>
            </div>
            <div style={kpi}>
              <div style={kLabel}>Creditor days</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)' }}>{fmtD(cycle.creditorDays)}</div>
              <div style={{ fontSize: 11, color: C.text3 }}>AP {fmt(cycle.apBalance)}</div>
            </div>
            <div style={{ ...kpi, borderColor: C.teal }}>
              <div style={kLabel}>Cash conversion cycle</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', color: C.teal }}>{fmtD(cycle.cycleDays)}</div>
              <div style={{ fontSize: 11, color: C.text3 }}>Days each shilling is trapped</div>
            </div>
          </div>

          <div style={card}>
            <div style={kLabel}>Where cash sleeps: biggest stock positions</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ color: C.text3 }}><th style={{ textAlign: 'left', padding: '6px' }}>Product</th><th style={{ textAlign: 'right', padding: '6px' }}>Qty</th><th style={{ textAlign: 'right', padding: '6px' }}>Cash tied up</th></tr></thead>
              <tbody>
                {cycle.slowMovers.map(p => (
                  <tr key={p.name} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '6px' }}>{p.name}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(p.qty)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 10 }}>
              Every shilling here is a shilling you cannot spend. The fastest cash-conservation move in Scaling Up:
              sell down the slow movers before ordering more of anything.
            </div>
          </div>

          {(cycle.dailyCOGS === null) && (
            <div style={{ ...card, borderColor: C.gold, fontSize: 13 }}>
              Stock/creditor days need COGS posted to 5xxx accounts. Until the 1-Aug clean books,
              treat these as indicative. They become exact once August transactions flow.
            </div>
          )}
        </>
      )}

      {/* ============ POWER OF ONE ============ */}
      {tab === 'power' && power && (
        <>
          <div style={{ ...card, fontSize: 13, color: C.text3 }}>
            What a 1% or 1-day improvement in each lever is worth to you, per month, in cash.
            Pick the biggest number and go get it. (Monthly revenue {fmt(power.monthlyRevenue)},
            COGS {fmt(power.monthlyCOGS)}, overheads {fmt(power.monthlyOverheads)}.)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { label: 'Raise prices 1%', value: power.price1pct, note: 'Straight to profit, no extra cost' },
              { label: 'Sell 1% more volume', value: power.volume1pct, note: 'Margin on the extra units' },
              { label: 'Cut COGS 1%', value: power.cogs1pct, note: 'Negotiate with suppliers' },
              { label: 'Cut overheads 1%', value: power.overheads1pct, note: 'Rent, salaries, marketing' },
              { label: 'Collect AR 1 day faster', value: power.debtorDay1, note: 'One day of credit sales, freed once' },
              { label: 'Hold 1 day less stock', value: power.stockDay1, note: 'One day of COGS, freed once' },
              { label: 'Pay suppliers 1 day later', value: power.creditorDay1, note: 'Free financing, negotiate terms' },
            ].sort((a, b) => b.value - a.value).map(l => (
              <div key={l.label} style={{ ...kpi }}>
                <div style={kLabel}>{l.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: C.teal }}>+{fmt(l.value)}</div>
                <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>{l.note}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
