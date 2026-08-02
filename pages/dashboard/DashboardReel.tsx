// ============================================================================
// DashboardReel.tsx — "The Ledger Reel"
// Auto-advancing chapter view of the admin dashboard: Accounts, Inventory,
// Customers, Team. One chapter fills the stage at a time and the deck turns
// itself every 9 seconds.
//
// Two deliberate signatures, both borrowed from the accounting world:
//   1. The chapter spine — a ruled margin down the left. The active chapter's
//      thread fills with "ink" top to bottom; when the ink reaches the foot,
//      the page turns. The thread IS the timer: its CSS animation's
//      onAnimationEnd drives the advance, so indicator and pager can never
//      drift apart. Hover, focus, or touch pauses the ink.
//   2. The T-account — the Accounts chapter renders the month as an actual
//      T: debits ruled left, credits right, bars growing outward from the
//      centre spine, net struck at the foot.
//
// Interaction: click a chapter on the spine, swipe horizontally, or use the
// arrow keys. prefers-reduced-motion disables the auto-advance and slide
// entirely — the reel becomes a calm manual pager.
//
// Presentation only. Data arrives via useDashboard (unchanged); financial
// figures render only when the caller says the viewer may see them.
// ============================================================================

import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Page } from '../../lib/types'
import type { DashboardData, FinancialData, OperationsData } from '../../lib/dashboardTypes'
import { tzs } from '../../lib/utils'
import { CountUp, DeltaTag } from './dashboardUi'

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const DWELL_MS = 9000

// Compact TZS for hero figures: 4,520,000 → "4.52M", 380,000 → "380K".
const short = (n: number): string => {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1_000_000_000) return s + (a / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B'
  if (a >= 1_000_000) return s + (a / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  if (a >= 10_000) return s + Math.round(a / 1_000) + 'K'
  return s + a.toLocaleString()
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V']

interface Props {
  data: DashboardData
  canViewFinancials: boolean
  onNav: (p: Page) => void
  /** Admin branch chooser: the branch whose SALES the figures reflect, or
   *  null for company-wide. Ledger/cash/team are always company-wide. */
  branchLabel?: string | null
}

export default function DashboardReel({ data, canViewFinancials, onNav, branchLabel = null }: Props) {
  const [idx, setIdx] = useState(0)
  const [hover, setHover] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragX = useRef<number | null>(null)
  const reduced = useMemo(reducedMotion, [])

  const fin = canViewFinancials ? data.financial : null
  const ops = data.operations

  const chapters: { key: string; label: string; page: Page; body: ReactNode }[] = [
    { key: 'accounts', label: 'Accounts', page: 'pnl', body: <AccountsChapter fin={fin} ops={ops} monthLabel={data.monthLabel} branchLabel={branchLabel} /> },
    { key: 'inventory', label: 'Inventory', page: 'inventory', body: <InventoryChapter ops={ops} fin={fin} /> },
    { key: 'customers', label: 'Customers', page: 'customers', body: <CustomersChapter ops={ops} fin={fin} /> },
    { key: 'team', label: 'Team', page: 'hrm', body: <TeamChapter ops={ops} fin={fin} monthLabel={data.monthLabel} /> },
  ]
  // Chapter V — Branches is intentionally absent. It reads ops.branchSales,
  // which the multi-branch build populates and this one does not. Everything
  // else in the reel is branch-agnostic.

  const go = (i: number) => setIdx(((i % chapters.length) + chapters.length) % chapters.length)
  const paused = hover || dragging

  // Swipe: a horizontal drag of 60px+ turns the page. Vertical scrolling is
  // untouched because we only read the X axis.
  const onPointerDown = (e: React.PointerEvent) => { dragX.current = e.clientX; setDragging(true) }
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragX.current !== null) {
      const dx = e.clientX - dragX.current
      if (dx <= -60) go(idx + 1)
      else if (dx >= 60) go(idx - 1)
    }
    dragX.current = null
    setDragging(false)
  }

  return (
    <div
      className="arl"
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Business overview"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setDragging(false); dragX.current = null }}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1) }
      }}
    >
      <style>{ARL_CSS}</style>

      {/* ── The chapter spine ─────────────────────────────────────────── */}
      <div className="arl-rail" role="tablist" aria-label="Chapters">
        {chapters.map((c, i) => {
          const active = i === idx
          const done = i < idx
          return (
            <button
              key={c.key}
              role="tab"
              aria-selected={active}
              className={'arl-tab' + (active ? ' is-active' : '')}
              onClick={() => go(i)}
            >
              <span className="arl-roman">{ROMAN[i]}</span>
              <span className="arl-tabname">{c.label}</span>
              <span className="arl-track">
                {active && !reduced && (
                  <span
                    key={`thread-${idx}`}
                    className="arl-thread"
                    style={{ animationDuration: `${DWELL_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                    onAnimationEnd={() => go(idx + 1)}
                  />
                )}
                {(done || (active && reduced)) && <span className="arl-thread arl-thread-full" />}
              </span>
            </button>
          )
        })}
        <div className="arl-folio">{String(idx + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}</div>
      </div>

      {/* ── The stage ─────────────────────────────────────────────────── */}
      <div
        className="arl-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragX.current = null; setDragging(false) }}
      >
        <div
          className="arl-strip"
          style={{ transform: `translateX(-${idx * 100}%)`, transition: reduced ? 'none' : undefined }}
        >
          {chapters.map((c, i) => (
            <section key={c.key} className={'arl-panel' + (i === idx ? ' is-live' : '')} aria-hidden={i !== idx}>
              {c.body}
              <button className="arl-open" tabIndex={i === idx ? 0 : -1} onClick={() => onNav(c.page)}>
                Open {c.label} <span aria-hidden="true">→</span>
              </button>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Chapter I · Accounts — the T-account ─────────────────────────────────────
function AccountsChapter({ fin, ops, monthLabel, branchLabel }: { fin: FinancialData | null; ops: OperationsData; monthLabel: string; branchLabel?: string | null }) {
  if (!fin) {
    // Viewer lacks dashboard.view_financials: show the operational sales tier
    // only, exactly the data they already see today. No P&L reaches them.
    const cashPct = ops.sales.total > 0 ? (ops.sales.cash / ops.sales.total) * 100 : 0
    return (
      <div className="arl-grid">
        <div>
          <div className="arl-eyebrow">Sales · {monthLabel}{branchLabel ? ` · ${branchLabel}` : ''}</div>
          <div className="arl-hero"><CountUp value={ops.sales.total} format={n => short(n)} /></div>
          <div className="arl-heronote">{ops.sales.count} sales posted this month</div>
          <div className="arl-splitbar" title={`Cash ${tzs(ops.sales.cash)} · Credit ${tzs(ops.sales.credit)}`}>
            <span style={{ width: `${cashPct}%` }} />
          </div>
          <div className="arl-splitlegend">
            <span><i className="arl-dot" style={{ background: 'var(--green)' }} /> Cash {short(ops.sales.cash)}</span>
            <span><i className="arl-dot" style={{ background: 'var(--blue)' }} /> Credit {short(ops.sales.credit)}</span>
          </div>
        </div>
        <div className="arl-side">
          <div className="arl-note">Profit and expense figures are visible to holders of the financial dashboard permission.</div>
        </div>
      </div>
    )
  }

  const dr = [...fin.pnlBreakdown.cogs, ...fin.pnlBreakdown.expenses].sort((a, b) => b.value - a.value)
  const cr = [...fin.pnlBreakdown.revenue].sort((a, b) => b.value - a.value)
  const drTotal = dr.reduce((s, l) => s + l.value, 0)
  const crTotal = cr.reduce((s, l) => s + l.value, 0)
  const maxLine = Math.max(1, ...dr.slice(0, 3).map(l => l.value), ...cr.slice(0, 3).map(l => l.value))
  const net = crTotal - drTotal
  const row = (l: { name: string; value: number }, side: 'dr' | 'cr') => (
    <div key={side + l.name} className={`arl-trow arl-${side}`}>
      <span className="arl-tname" title={l.name}>{l.name}</span>
      <span className="arl-tamt">{short(l.value)}</span>
      <span className="arl-tbar" style={{ width: `${Math.max(4, (l.value / maxLine) * 100)}%` }} />
    </div>
  )

  return (
    <div className="arl-grid">
      <div>
        <div className="arl-eyebrow">Accounts · {monthLabel}{branchLabel ? ' · Company-wide ledger' : ''}</div>
        <div className="arl-hero" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
          <CountUp value={net} format={n => (net >= 0 ? '+' : '') + short(net >= 0 ? n : -Math.abs(n))} />
        </div>
        <div className="arl-heronote">
          net this month <DeltaTag deltaPct={fin.netProfit.deltaPct} />
        </div>

        {/* The T-account. Debits ruled left of the spine, credits right. */}
        <div className="arl-t" role="img" aria-label={`T account: debits ${tzs(drTotal)}, credits ${tzs(crTotal)}`}>
          <div className="arl-thead">
            <span>Dr · money out</span>
            <span>Cr · money in</span>
          </div>
          <div className="arl-tbody">
            <div className="arl-tcol arl-tcol-dr">{dr.slice(0, 3).map(l => row(l, 'dr'))}</div>
            <div className="arl-tcol">{cr.slice(0, 3).map(l => row(l, 'cr'))}</div>
          </div>
          <div className="arl-tfoot">
            <span>{short(drTotal)}</span>
            <span className="arl-tfootlabel">totals</span>
            <span>{short(crTotal)}</span>
          </div>
        </div>
      </div>

      <div className="arl-side">
        <SideStat label="Cash position" value={short(fin.cashPosition)} tone="var(--green)" />
        <SideStat label="Owed by customers" value={short(fin.ar.total)} tone="var(--blue)" sub={`${fin.ar.customerCount} customers`} />
        <SideStat label="Gross margin" value={`${fin.marginPct.toFixed(1)}%`} tone="var(--accent)" />
      </div>
    </div>
  )
}

// ── Chapter II · Inventory ───────────────────────────────────────────────────
function InventoryChapter({ ops, fin }: { ops: OperationsData; fin: FinancialData | null }) {
  const inv = ops.inventory
  const healthy = Math.max(0, inv.products - inv.lowStock - inv.outOfStock)
  const maxCat = Math.max(1, ...ops.categoryBreakdown.map(c => c.count))
  return (
    <div className="arl-grid">
      <div>
        <div className="arl-eyebrow">Inventory</div>
        <div className="arl-hero"><CountUp value={inv.products} format={n => Math.round(n).toLocaleString()} /></div>
        <div className="arl-heronote">
          active products · {healthy} healthy
          {inv.lowStock > 0 && <span className="arl-chip" style={{ color: 'var(--yellow)', background: 'var(--yellow-dim)' }}>{inv.lowStock} low</span>}
          {inv.outOfStock > 0 && <span className="arl-chip" style={{ color: 'var(--red)', background: 'var(--red-dim)' }}>{inv.outOfStock} out</span>}
        </div>
        <div className="arl-cats">
          {ops.categoryBreakdown.slice(0, 5).map(c => (
            <div key={c.category} className="arl-catrow">
              <span className="arl-catname" title={c.category}>{c.category}</span>
              <span className="arl-catbar"><span style={{ width: `${(c.count / maxCat) * 100}%` }} /></span>
              <span className="arl-catn">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="arl-side">
        {fin && <SideStat label="Stock value" value={short(fin.inventoryValue)} tone="var(--accent)" />}
        <div className="arl-sidelabel">Reorder next</div>
        {ops.stockAlerts.length === 0 && <div className="arl-note">Nothing below its reorder point.</div>}
        {ops.stockAlerts.slice(0, 4).map(a => (
          <div key={a.name} className="arl-alert">
            <span className="arl-alertname" title={a.name}>{a.name}</span>
            <span className="arl-alertqty" style={{ color: a.qty_on_hand <= 0 ? 'var(--red)' : 'var(--yellow)' }}>
              {a.qty_on_hand} / {a.reorder_point}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Chapter III · Customers ──────────────────────────────────────────────────
function CustomersChapter({ ops, fin }: { ops: OperationsData; fin: FinancialData | null }) {
  const crm = ops.crm
  const aging = fin?.ar.aging
  const agingTotal = aging ? aging.current + aging.d31_60 + aging.d61_90 + aging.d90plus : 0
  const seg = (v: number) => (agingTotal > 0 ? `${(v / agingTotal) * 100}%` : '0%')
  return (
    <div className="arl-grid">
      <div>
        <div className="arl-eyebrow">Customers</div>
        <div className="arl-hero"><CountUp value={crm.retailCustomers} format={n => Math.round(n).toLocaleString()} /></div>
        <div className="arl-heronote">
          retail customers
          {crm.newRetailThisMonth > 0 && <span className="arl-chip" style={{ color: 'var(--green)', background: 'var(--green-dim)' }}>+{crm.newRetailThisMonth} this month</span>}
        </div>
        <div className="arl-trio">
          <div><b>{crm.b2bProspects}</b><span>live B2B prospects</span></div>
          <div><b style={{ color: crm.b2bOverdue > 0 ? 'var(--red)' : undefined }}>{crm.b2bOverdue}</b><span>follow-ups overdue</span></div>
          <div><b style={{ color: crm.b2bWonThisMonth > 0 ? 'var(--green)' : undefined }}>{crm.b2bWonThisMonth}</b><span>won this month</span></div>
        </div>
      </div>
      <div className="arl-side">
        {fin && aging && (
          <>
            <SideStat label="Owed by customers" value={short(fin.ar.total)} tone="var(--blue)" />
            <div className="arl-sidelabel">Age of the money</div>
            <div className="arl-aging" title={`0–30: ${tzs(aging.current)} · 31–60: ${tzs(aging.d31_60)} · 61–90: ${tzs(aging.d61_90)} · 90+: ${tzs(aging.d90plus)}`}>
              <span style={{ width: seg(aging.current), background: 'var(--green)' }} />
              <span style={{ width: seg(aging.d31_60), background: 'var(--yellow)' }} />
              <span style={{ width: seg(aging.d61_90), background: 'var(--accent)' }} />
              <span style={{ width: seg(aging.d90plus), background: 'var(--red)' }} />
            </div>
            <div className="arl-aginglegend">
              <span>0–30</span><span>31–60</span><span>61–90</span><span>90+</span>
            </div>
            {fin.ar.top[0] && (
              <div className="arl-note" style={{ marginTop: 10 }}>
                Largest balance: <b style={{ color: 'var(--text)' }}>{fin.ar.top[0].name}</b> · {short(fin.ar.top[0].amount)}
              </div>
            )}
          </>
        )}
        {!fin && <div className="arl-note">Balances owed are visible to holders of the financial dashboard permission.</div>}
      </div>
    </div>
  )
}

// ── Chapter IV · Team — the roster ───────────────────────────────────────────
function TeamChapter({ ops, fin, monthLabel }: { ops: OperationsData; fin: FinancialData | null; monthLabel: string }) {
  const { headcount, onLeave } = ops.hrm
  // The roster: one tile per person, on-leave tiles hollow. Capped at 48 so a
  // large team doesn't wallpaper the panel.
  const tiles = Math.min(headcount, 48)
  const overflow = headcount - tiles
  return (
    <div className="arl-grid">
      <div>
        <div className="arl-eyebrow">Team</div>
        <div className="arl-hero"><CountUp value={headcount} format={n => Math.round(n).toLocaleString()} /></div>
        <div className="arl-heronote">
          on the payroll
          {onLeave > 0 && <span className="arl-chip" style={{ color: 'var(--yellow)', background: 'var(--yellow-dim)' }}>{onLeave} on leave today</span>}
          {onLeave === 0 && headcount > 0 && <span className="arl-chip" style={{ color: 'var(--green)', background: 'var(--green-dim)' }}>full house today</span>}
        </div>
        <div className="arl-roster" aria-hidden="true">
          {Array.from({ length: tiles }).map((_, i) => (
            <span key={i} className={'arl-seat' + (i >= tiles - Math.min(onLeave, tiles) ? ' is-away' : '')} />
          ))}
          {overflow > 0 && <span className="arl-seatmore">+{overflow}</span>}
        </div>
      </div>
      <div className="arl-side">
        {fin && <SideStat label={`Payroll · ${monthLabel}`} value={short(fin.payrollCost)} tone="var(--accent)" />}
        {ops.approvalsPending > 0 && (
          <SideStat label="Awaiting approval" value={String(ops.approvalsPending)} tone="var(--yellow)" sub="requests in the queue" />
        )}
        {!fin && ops.approvalsPending === 0 && <div className="arl-note">All quiet — nothing waiting on a decision.</div>}
      </div>
    </div>
  )
}


// ── Small shared pieces ──────────────────────────────────────────────────────
function SideStat({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className="arl-sidestat">
      <div className="arl-sidelabel">{label}</div>
      <div className="arl-sideval" style={{ color: tone }}>{value}</div>
      {sub && <div className="arl-sidesub">{sub}</div>}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Scoped by the arl- prefix; tokens come from the app's :root so the reel is
// unmistakably part of AtlasOS rather than a bolt-on.
const ARL_CSS = `
.arl { display: flex; gap: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--rl); overflow: hidden; outline: none; }
.arl:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }

/* The chapter spine */
.arl-rail { display: flex; flex-direction: column; gap: 2px; padding: 18px 0 14px; width: 148px; flex-shrink: 0; background: var(--surface2); border-right: 1px solid var(--border); }
.arl-tab { display: grid; grid-template-columns: 26px 1fr 2px; align-items: center; gap: 8px; padding: 12px 0 12px 14px; background: none; border: none; cursor: pointer; text-align: left; color: var(--text3); }
.arl-tab:hover { color: var(--text2); }
.arl-tab.is-active { color: var(--text); }
.arl-roman { font-family: var(--mono); font-size: 10px; letter-spacing: 1px; opacity: .7; }
.arl-tabname { font-family: var(--display); font-size: 13px; font-weight: 700; letter-spacing: .2px; }
.arl-track { position: relative; width: 2px; height: 100%; min-height: 30px; background: var(--border2); border-radius: 2px; justify-self: end; }
.arl-thread { position: absolute; top: 0; left: 0; width: 100%; background: var(--accent); border-radius: 2px; animation-name: arlInkV; animation-timing-function: linear; animation-fill-mode: forwards; }
.arl-thread-full { height: 100%; animation: none; opacity: .45; }
@keyframes arlInkV { from { height: 0; } to { height: 100%; } }
.arl-folio { margin-top: auto; padding: 12px 14px 0; font-family: var(--mono); font-size: 10px; color: var(--text3); letter-spacing: 1.5px; }

/* The stage */
.arl-stage { flex: 1; overflow: hidden; touch-action: pan-y; }
.arl-strip { display: flex; width: 100%; height: 100%; transition: transform .55s cubic-bezier(.22,.8,.24,1); }
.arl-panel { flex: 0 0 100%; min-width: 0; padding: 26px 28px 20px; display: flex; flex-direction: column; min-height: 400px; }
.arl-open { margin-top: auto; align-self: flex-start; background: none; border: none; cursor: pointer; font-family: var(--mono); font-size: 11px; letter-spacing: .5px; color: var(--text3); padding: 8px 0 0; }
.arl-open:hover { color: var(--accent); }

/* Chapter interior */
.arl-grid { display: grid; grid-template-columns: 1fr 220px; gap: 28px; align-items: start; }
.arl-eyebrow { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: var(--text3); margin-bottom: 8px; }
.arl-hero { font-family: var(--display); font-weight: 800; font-size: clamp(38px, 5vw, 58px); letter-spacing: -2px; line-height: 1; font-variant-numeric: tabular-nums; }
.arl-panel.is-live .arl-hero, .arl-panel.is-live .arl-heronote { animation: arlRise .45s cubic-bezier(.22,.8,.24,1) both; }
.arl-panel.is-live .arl-heronote { animation-delay: .08s; }
@keyframes arlRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.arl-heronote { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--text2); }
.arl-chip { font-family: var(--mono); font-size: 10px; padding: 2px 8px; border-radius: 20px; }

/* T-account */
.arl-t { margin-top: 22px; max-width: 560px; }
.arl-thead { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text3); padding-bottom: 6px; border-bottom: 1.5px solid var(--border2); }
.arl-tbody { display: grid; grid-template-columns: 1fr 1fr; }
.arl-tcol { padding: 8px 0 8px 12px; }
.arl-tcol-dr { border-right: 1.5px solid var(--border2); padding: 8px 12px 8px 0; }
.arl-trow { position: relative; display: flex; align-items: baseline; gap: 8px; padding: 5px 0; font-size: 12px; }
.arl-dr { flex-direction: row-reverse; text-align: right; }
.arl-tname { color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.arl-tamt { font-family: var(--mono); font-size: 11.5px; color: var(--text); flex-shrink: 0; }
.arl-tbar { position: absolute; bottom: 1px; height: 2px; border-radius: 2px; opacity: .8; }
.arl-dr .arl-tbar { right: 0; background: var(--red); }
.arl-cr .arl-tbar { left: 0; background: var(--green); }
.arl-tfoot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; border-top: 1.5px solid var(--border2); padding-top: 7px; font-family: var(--mono); font-size: 12px; }
.arl-tfoot span:first-child { text-align: right; color: var(--red); }
.arl-tfoot span:last-child { color: var(--green); }
.arl-tfootlabel { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text3); }

/* Sales split (no-permission Accounts view) */
.arl-splitbar { margin-top: 20px; height: 8px; max-width: 420px; border-radius: 6px; background: var(--blue-dim); overflow: hidden; }
.arl-splitbar span { display: block; height: 100%; background: var(--green); border-radius: 6px; }
.arl-splitlegend { display: flex; gap: 18px; margin-top: 8px; font-size: 11px; color: var(--text2); font-family: var(--mono); }
.arl-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }

/* Inventory category bars */
.arl-cats { margin-top: 22px; max-width: 480px; display: flex; flex-direction: column; gap: 8px; }
.arl-catrow { display: grid; grid-template-columns: 120px 1fr 34px; align-items: center; gap: 10px; font-size: 11.5px; }
.arl-catname { color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arl-catbar { height: 6px; background: var(--surface3); border-radius: 4px; overflow: hidden; }
.arl-catbar span { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
.arl-catn { font-family: var(--mono); font-size: 11px; color: var(--text3); text-align: right; }

/* Customers trio */
.arl-trio { display: flex; gap: 26px; margin-top: 24px; flex-wrap: wrap; }
.arl-trio > div { display: flex; flex-direction: column; gap: 3px; }
.arl-trio b { font-family: var(--display); font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
.arl-trio span { font-size: 10.5px; color: var(--text3); }
.arl-aging { display: flex; height: 8px; border-radius: 6px; overflow: hidden; background: var(--surface3); }
.arl-aginglegend { display: flex; justify-content: space-between; margin-top: 5px; font-family: var(--mono); font-size: 9px; color: var(--text3); }

/* Team roster */
.arl-roster { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 24px; max-width: 420px; align-items: center; }
.arl-seat { width: 14px; height: 14px; border-radius: 4px; background: var(--accent); opacity: .85; }
.arl-seat.is-away { background: transparent; border: 1.5px solid var(--yellow); opacity: .8; }
.arl-seatmore { font-family: var(--mono); font-size: 10px; color: var(--text3); margin-left: 4px; }

/* Right column */
.arl-side { display: flex; flex-direction: column; gap: 14px; padding-top: 26px; }
.arl-sidestat { border-left: 2px solid var(--border2); padding-left: 12px; }
.arl-sidelabel { font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text3); }
.arl-sideval { font-family: var(--display); font-size: 20px; font-weight: 800; letter-spacing: -.5px; margin-top: 3px; }
.arl-sidesub { font-size: 10.5px; color: var(--text3); margin-top: 2px; }
.arl-alert { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; padding: 3px 0; }
.arl-alertname { color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.arl-alertqty { font-family: var(--mono); font-size: 11px; flex-shrink: 0; }
.arl-note { font-size: 11.5px; color: var(--text3); line-height: 1.6; }

/* Narrow screens: the spine folds into a top strip; ink runs horizontally. */
@media (max-width: 760px) {
  .arl { flex-direction: column; }
  .arl-rail { flex-direction: row; width: 100%; padding: 10px 12px; border-right: none; border-bottom: 1px solid var(--border); align-items: center; }
  .arl-tab { grid-template-columns: 1fr; grid-template-rows: auto 2px; gap: 5px; padding: 4px 8px; flex: 1; }
  .arl-roman { display: none; }
  .arl-tabname { font-size: 11.5px; text-align: center; }
  .arl-track { width: 100%; height: 2px; min-height: 0; justify-self: stretch; }
  .arl-thread { animation-name: arlInkH; height: 100%; }
  @keyframes arlInkH { from { width: 0; } to { width: 100%; } }
  .arl-thread-full { width: 100%; height: 100%; }
  .arl-folio { display: none; }
  .arl-grid { grid-template-columns: 1fr; gap: 18px; }
  .arl-panel { padding: 20px 18px 16px; min-height: 0; }
  .arl-side { padding-top: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .arl-strip { transition: none; }
  .arl-panel.is-live .arl-hero, .arl-panel.is-live .arl-heronote { animation: none; }
}
`
