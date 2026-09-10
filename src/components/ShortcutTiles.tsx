// ============================================================================
// ShortcutTiles.tsx
// Role Center cues, in the Dynamics NAV sense: a square tile carrying a live
// number with the label ON the tile. "Customers" is a menu item; "Customers
// 1,490" is a fact you can act on. Design ported from the Tarakimu build at
// Joe's request (style only); the data plumbing stays Malkia's own.
//
// The Tarakimu build fetches its numbers from a dashboard_cues RPC. That
// function does not exist here, and adding one would mean a migration for
// data the dashboard has already loaded. Every figure and every tile body
// below reads from the same useDashboard payload the cards underneath use,
// so the tiles can never disagree with the page they sit on, and no round
// trip is added.
//
// Tiles marked `alert` turn red when their number is non-zero: money past
// due, stock below reorder, approvals waiting. Everything else wears the
// brand gradient. That is Navision's own convention: the eye finds the
// problem without reading a single label.
//
// Financial tiles are hidden entirely, not blanked, for viewers without
// dashboard.view_financials. A greyed-out tile still tells you a number
// exists. They are removed from the Edit library too, for the same reason.
//
// Customisable: Edit removes tiles you never use and offers the rest. Saved
// per user in localStorage as a plain string[] of ids, so moving this to a
// synced column on `users` later is a lift, not a rewrite.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Page } from '../lib/types'
import type { FinancialData, OperationsData } from '../lib/dashboardTypes'

interface Props {
  onNav: (p: Page) => void
  fin?: FinancialData | null
  ops?: OperationsData | null
  canViewFinancials: boolean
  userId?: string | null
}

interface TileDef {
  /** Stable key. NOT the label (renaming would orphan saved lists) and NOT
   *  the page (Products and Low Stock could share one). This is stored. */
  id: string
  label: string
  page: Page
  icon: string
  /** the tile carries money and needs financial permission */
  financial?: boolean
  /** non-zero is bad: tile turns red */
  alert?: boolean
}

const LIBRARY: TileDef[] = [
  { id: 'cash-sale',  label: 'New Cash Sale', page: 'cash-sale' as Page,     icon: 'M2 7h20v13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z M2 7l2-4h16l2 4 M12 11v6 M9 14h6' },
  { id: 'invoice',    label: 'New Invoice',   page: 'sales-invoice' as Page, icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8' },
  { id: 'banks',      label: 'Banks',         page: 'banks' as Page,         icon: 'M3 10L12 3l9 7 M5 10v8 M10.5 10v8 M16 10v8 M2 18h20', financial: true },
  { id: 'money-owed', label: 'Money Owed',    page: 'customers' as Page,     icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', financial: true },
  { id: 'overdue',    label: 'Overdue',       page: 'customers' as Page,     icon: 'M12 8v5 M12 17h.01 M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', financial: true, alert: true },
  { id: 'low-stock',  label: 'Low Stock',     page: 'inventory' as Page,     icon: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7', alert: true },
  { id: 'approvals',  label: 'Approvals',     page: 'approvals' as Page,     icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', alert: true },
  { id: 'customers',  label: 'Customers',     page: 'customers' as Page,     icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { id: 'products',   label: 'Products',      page: 'inventory' as Page,     icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12.01l8.73-5.05 M12 22.08V12' },
  { id: 'pnl',        label: 'Profit & Loss', page: 'pnl' as Page,           icon: 'M3 3v18h18 M7 14l4-4 3 3 5-6', financial: true },
  { id: 'vouchers',   label: 'All Vouchers',  page: 'vouchers' as Page,      icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2' },
]

// The morning glance, in five: what did we sell, what is in the bank, who
// owes us, what is late, what is running out. One action and four facts;
// two of the facts turn red when they need a human.
const DEFAULTS = ['cash-sale', 'banks', 'money-owed', 'overdue', 'low-stock']
// Without financial permission the briefing is operational: the two entry
// actions, the shelf, and the approval queue.
const DEFAULTS_OPS = ['cash-sale', 'invoice', 'low-stock', 'approvals']

const keyFor = (u?: string | null) => `malkia.shortcuts.${u || 'anon'}`

/** 7,211,899 becomes 7.2M. The full figure does not fit on a square this
 *  size and nobody reading a cue needs the shillings. */
function compact(n: number): string {
  if (!isFinite(n)) return '0'
  const a = Math.abs(n)
  if (a >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B'
  if (a >= 1_000_000)     return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (a >= 1_000)         return (n / 1_000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}

function Glyph({ d, size = 15, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => <path key={i} d={i === 0 ? seg : 'M' + seg} />)}
    </svg>
  )
}

export default function ShortcutTiles({ onNav, fin, ops, canViewFinancials, userId }: Props) {
  const storageKey = keyFor(userId)
  const showMoney = canViewFinancials
  const EDITION_DEFAULTS = showMoney ? DEFAULTS : DEFAULTS_OPS

  const [editing, setEditing] = useState(false)
  const [chosen, setChosen] = useState<string[]>(EDITION_DEFAULTS)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      const saved = raw ? JSON.parse(raw) : null
      setChosen(Array.isArray(saved) && saved.length ? saved : EDITION_DEFAULTS)
    } catch { setChosen(EDITION_DEFAULTS) }
    // EDITION_DEFAULTS is derived from a stable permission for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const persist = (next: string[]) => {
    setChosen(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* private mode */ }
  }

  const byId = useMemo(() => {
    const m = new Map<string, TileDef>()
    LIBRARY.forEach(t => m.set(t.id, t))
    return m
  }, [])

  // Financial tiles never render, never appear in Edit, for viewers without
  // the permission, even if an old saved list names them.
  const permitted = (t: TileDef) => showMoney || !t.financial
  const active = chosen.map(id => byId.get(id)).filter((t): t is TileDef => !!t && permitted(t))
  const available = LIBRARY.filter(t => permitted(t) && !chosen.includes(t.id))

  // ── The numbers, straight off the dashboard payload ─────────────────────
  const pastDue = fin ? fin.ar.aging.d31_60 + fin.ar.aging.d61_90 + fin.ar.aging.d90plus : 0
  const lowCount = ops ? ops.inventory.lowStock + ops.inventory.outOfStock : 0

  const valueFor = (t: TileDef): string | null => {
    switch (t.id) {
      case 'cash-sale':  return ops ? compact(ops.salesToday ?? 0) : null
      case 'banks':      return fin ? compact(fin.cashPosition) : null
      case 'money-owed': return fin ? compact(fin.ar.total) : null
      case 'overdue':    return fin ? compact(pastDue) : null
      case 'low-stock':  return ops ? String(lowCount) : null
      case 'approvals':  return ops ? String(ops.approvalsPending) : null
      case 'customers':  return ops ? String(ops.crm.retailCustomers) : null
      case 'products':   return ops ? String(ops.inventory.products) : null
      default:           return null
    }
  }

  const hotFor = (t: TileDef): boolean => {
    if (!t.alert) return false
    if (t.id === 'overdue')   return pastDue > 0
    if (t.id === 'low-stock') return lowCount > 0
    if (t.id === 'approvals') return (ops?.approvalsPending ?? 0) > 0
    return false
  }

  // Small factual caption sitting opposite the big number.
  const CAPTIONS: Record<string, string> = {
    'cash-sale': 'today', 'banks': 'cash position', 'money-owed': 'owed to you',
    'overdue': 'past 30 days', 'low-stock': 'below reorder', 'approvals': 'waiting',
    'customers': 'retail', 'products': 'active', 'invoice': '',
  }

  // ── Tile bodies ──────────────────────────────────────────────────────────
  // The squares earn their size by carrying more than one number. Each body
  // renders ONLY from the payload already in hand and vanishes gracefully
  // when its data is absent, so a partial load degrades to the plain tile.
  const body = (t: TileDef): ReactNode => {
    if (t.id === 'cash-sale') {
      const week = ops?.sales7d
      if (!week || week.length === 0 || week.every(v => !v)) return null
      const max = Math.max(...week, 1)
      return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: '100%', paddingBottom: 2 }}
             title={`Last 7 days: ${week.map(v => compact(v)).join(' · ')}`}>
          {week.map((v, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: 2,
              height: `${Math.max(6, (v / max) * 100)}%`,
              background: i === week.length - 1 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.32)',
            }} />
          ))}
        </div>
      )
    }
    if (t.id === 'banks') {
      const banks = fin?.bankTop
      if (!banks || banks.length === 0) return null
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', height: '100%' }}>
          {banks.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'rgba(255,255,255,.78)' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.n}</span>
              <span style={{ fontFamily: 'var(--mono)', flexShrink: 0 }}>{compact(Number(b.b))}</span>
            </div>
          ))}
        </div>
      )
    }
    if (t.id === 'money-owed') {
      const debtors = fin?.ar.customerCount ?? 0
      if (!debtors) return null
      return (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', fontSize: 11.5, color: 'rgba(255,255,255,.78)', lineHeight: 1.5 }}>
          {debtors} customer{debtors === 1 ? '' : 's'} hold{debtors === 1 ? 's' : ''} an open balance
        </div>
      )
    }
    if (t.id === 'overdue') {
      if (!pastDue) return (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>
          Nothing past due
        </div>
      )
      return (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', fontSize: 11.5, color: 'rgba(255,255,255,.85)', lineHeight: 1.5 }}>
          TZS {compact(pastDue)} older than 30 days
        </div>
      )
    }
    if (t.id === 'low-stock') {
      const names = ops?.stockAlerts
      if (!names) return null
      if (names.length === 0) return (
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>
          Everything above reorder
        </div>
      )
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', height: '100%' }}>
          {names.slice(0, 3).map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,.78)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {p.name}</div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Shortcuts
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        {editing && (
          <button type="button" onClick={() => persist(EDITION_DEFAULTS)}
            style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
                     padding: '3px 9px', borderRadius: 6, marginRight: 8,
                     color: 'var(--text2)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
            Reset to defaults
          </button>
        )}
        <button type="button" onClick={() => setEditing(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                   color: editing ? 'var(--accent)' : 'var(--text3)', fontSize: 10.5, fontFamily: 'var(--mono)' }}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* auto-fit + minmax: tiles share the full row width so the strip
          always ends flush at the right edge, whatever the count. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {active.map(t => {
          const val = valueFor(t)
          const hot = hotFor(t)
          return (
            <div key={t.id} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { if (!editing) onNav(t.page) }}
                title={t.label}
                style={{
                  // aspectRatio, not a fixed height: the grid decides the
                  // width, so only a ratio keeps the tile square at every
                  // screen size, phone or desktop.
                  width: '100%', aspectRatio: '1 / 1', borderRadius: 10, padding: '13px 14px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  alignItems: 'stretch', cursor: editing ? 'default' : 'pointer',
                  border: 'none', textAlign: 'left',
                  // Brand gradient from the theme's own accent family, so the
                  // strip follows Daylight, Midnight or anything else. Alerts
                  // wear the same red on every theme: red is a fact.
                  background: hot
                    ? 'linear-gradient(160deg, #b4442f, #8c2f20)'
                    : 'linear-gradient(160deg, var(--accent2), var(--accent-solid, var(--accent2)))',
                  boxShadow: '0 6px 16px rgba(0,0,0,.25)',
                  opacity: editing ? 0.75 : 1,
                  transition: 'transform .12s ease, box-shadow .12s ease',
                }}
                onMouseEnter={e => { if (!editing) e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
              >
                {/* Header: icon and label, bold, ON the tile. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Glyph d={t.icon} size={14} color="rgba(255,255,255,.85)" />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', letterSpacing: '.01em' }}>
                    {t.label}
                  </span>
                </div>
                {/* Body: sparkline, account list or fact line, per tile. */}
                <div style={{ flex: 1, minHeight: 0, margin: '8px 0' }}>
                  {body(t)}
                </div>
                {/* Footer: quiet caption left, the big number right. */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(255,255,255,.5)' }}>
                    {CAPTIONS[t.id] || ''}
                  </span>
                  <span style={{
                    fontSize: val && val.length > 4 ? 20 : 26, fontWeight: 800, color: '#fff',
                    lineHeight: 1, letterSpacing: '-.02em', textAlign: 'right',
                    fontFamily: 'var(--mono)',
                  }}>
                    {val ?? ''}
                  </span>
                </div>
              </button>
              {editing && (
                <button
                  type="button"
                  aria-label={`Remove ${t.label}`}
                  onClick={() => persist(chosen.filter(c => c !== t.id))}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                    borderRadius: '50%', border: '1px solid var(--border)',
                    background: 'var(--red)', color: '#fff', fontSize: 12, lineHeight: 1,
                    cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
                  }}
                >×</button>
              )}
            </div>
          )
        })}

        {active.length === 0 && !editing && (
          <span style={{ fontSize: 12, color: 'var(--text3)', gridColumn: '1 / -1' }}>No shortcuts. Press Edit to add some.</span>
        )}
      </div>

      {editing && available.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 8, fontFamily: 'var(--mono)' }}>Tap to add</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {available.map(t => (
              <button key={t.id} type="button" onClick={() => persist(chosen.includes(t.id) ? chosen : [...chosen, t.id])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8,
                  background: 'transparent', border: '1px dashed var(--border)',
                  color: 'var(--text3)', fontSize: 12, cursor: 'pointer',
                }}>
                <Glyph d={t.icon} size={13} color="var(--text3)" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
