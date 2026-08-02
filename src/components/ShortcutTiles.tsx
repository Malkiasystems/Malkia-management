// ============================================================================
// ShortcutTiles.tsx
// Four large tiles under the dashboard greeting: two actions and two figures.
// The first click of the day should not require reading a chart first.
//
// The Tarakimu build fetches its tile numbers from a dashboard_cues RPC. That
// function does not exist here, and adding one would mean a migration for data
// the dashboard has already loaded. These read straight from the same
// useDashboard payload the cards below use, so the numbers cannot disagree
// with the page they sit on, and no round trip is added.
//
// Financial tiles are hidden entirely, not blanked, for viewers without
// dashboard.view_financials. A greyed-out tile still tells you a number exists.
// ============================================================================

import type { Page } from '../lib/types'
import type { FinancialData } from '../lib/dashboardTypes'

interface Props {
  onNav: (p: Page) => void
  fin?: FinancialData | null
  canViewFinancials: boolean
}

const short = (n: number): string => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 10_000 ? 0 : 1)}K`
  return `${Math.round(n)}`
}

const ICON: Record<string, string> = {
  till: 'M2 7h20v10H2z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 12h.01 M18 12h.01',
  invoice: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  bank: 'M3 21h18 M4 18h16 M5 10h14 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M5 6l7-3 7 3v4H5z',
  owed: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
}

export default function ShortcutTiles({ onNav, fin, canViewFinancials }: Props) {
  const showMoney = canViewFinancials && !!fin

  const tiles: { key: string; label: string; icon: string; value: string; page: Page }[] = [
    { key: 'cash-sale', label: 'New Cash Sale', icon: 'till', value: '', page: 'cash-sale' },
    { key: 'invoice', label: 'New Invoice', icon: 'invoice', value: '', page: 'sales-invoice' },
  ]

  if (showMoney && fin) {
    tiles.push({ key: 'banks', label: 'Banks', icon: 'bank', value: short(fin.cashPosition), page: 'banks' })
    tiles.push({ key: 'owed', label: 'Money Owed', icon: 'owed', value: short(fin.ar.total), page: 'customers' })
  } else {
    tiles.push({ key: 'inventory', label: 'Inventory', icon: 'bank', value: '', page: 'inventory' })
    tiles.push({ key: 'customers', label: 'Customers', icon: 'owed', value: '', page: 'customers' })
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--text3)',
      }}>
        <span>Shortcuts</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {tiles.map(t => (
          <div
            key={t.key}
            className="sc-tile"
            onClick={() => onNav(t.page)}
            style={{
              cursor: 'pointer', borderRadius: 14, padding: '18px 18px 16px',
              background: 'var(--accent-solid, var(--accent))',
              border: '1px solid var(--border2)',
              minHeight: 116, display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
            <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ opacity: .9 }}>
              <path d={ICON[t.icon]} />
            </svg>
            <div>
              {t.value && (
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700,
                  color: '#fff', lineHeight: 1.05, letterSpacing: '-.5px',
                }}>{t.value}</div>
              )}
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.92)',
                marginTop: t.value ? 4 : 0,
              }}>{t.label}</div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .sc-tile { transition: transform .15s cubic-bezier(.2,.8,.3,1), box-shadow .15s ease; }
        .sc-tile:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -18px rgba(0,0,0,.85), 0 0 18px var(--accent-dim); }
        .sc-tile:active { transform: translateY(0) scale(.985); }
        @media (prefers-reduced-motion: reduce) { .sc-tile:hover, .sc-tile:active { transform: none; } }
      `}</style>
    </div>
  )
}
