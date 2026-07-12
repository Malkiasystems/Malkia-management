// ─── MobileNav ─────────────────────────────────────────────────────────────
// Phone-only navigation. Renders nothing on desktop (App gates it on
// useIsMobile). Two parts:
//   1. A fixed bottom tab bar with the 5 destinations you actually reach for
//      on the go — driven by permissions, so a stock-only user never sees
//      links they can't open.
//   2. A slide-up drawer ("Menu") listing the full app, grouped, also
//      permission-gated via canAccessPage.
//
// Deliberately additive: it does NOT touch Sidebar.tsx or Topbar.tsx. The
// desktop rail is hidden on mobile purely by CSS (.app-sidebar-desktop).
// Nothing desktop-side changes behaviour.
// ───────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type { Page } from '../lib/types'
import { useAuth, canAccessPage } from '../lib/useAuth'

interface Props {
  current: Page
  onNav: (p: Page) => void
  /** When true, mirror the desktop stock-workspace sidebar: a restricted,
      stock-only nav with the stock dashboard as home. */
  stockMode?: boolean
}

const P = { fill: 'none', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }

const ICONS: Record<string, React.ReactNode> = {
  home:      <svg {...P}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  inventory: <svg {...P}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  sale:      <svg {...P}><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>,
  customers: <svg {...P}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  menu:      <svg {...P}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  dispatch:  <svg {...P}><path d="M1 3h13v13H1z M14 8h4l3 3v5h-7 M5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>,
  approvals: <svg {...P}><path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  invoice:   <svg {...P}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8"/></svg>,
  movements: <svg {...P}><path d="M3 3v18h18 M7 14l4-4 4 4 4-6"/></svg>,
  reports:   <svg {...P}><path d="M9 17V9 M13 17V5 M17 17v-3 M3 21h18"/></svg>,
  crm:       <svg {...P}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  hrm:       <svg {...P}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>,
  settings:  <svg {...P}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  accounts:  <svg {...P}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  banks:     <svg {...P}><path d="M3 10L12 3l9 7 M2 18h20"/><rect x="5" y="10" width="3" height="8"/><rect x="16" y="10" width="3" height="8"/></svg>,
  suppliers: <svg {...P}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  imports:   <svg {...P}><path d="M1 3h13v13H1z M14 8h4l3 3v5h-7"/></svg>,
  receive:   <svg {...P}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3"/></svg>,
  transfer:  <svg {...P}><path d="M16 3h5v5 M21 3l-7 7 M8 21H3v-5 M3 21l7-7"/></svg>,
  register:  <svg {...P}><path d="M18 20V10 M12 20V4 M6 20v-6"/></svg>,
}

// Bottom bar: the 5 hottest destinations. "Menu" always shows (opens drawer).
const TABS: { key: string; label: string; page: Page }[] = [
  { key: 'home',      label: 'Home',    page: 'dashboard' },
  { key: 'inventory', label: 'Stock',   page: 'inventory' },
  { key: 'sale',      label: 'Sell',    page: 'cash-sale' },
  { key: 'customers', label: 'People',  page: 'customers' },
]

// Full drawer, grouped. Every entry gated by canAccessPage at render.
const GROUPS: { title: string; items: { key: string; label: string; page: Page }[] }[] = [
  { title: 'Overview', items: [
    { key: 'home', label: 'Dashboard', page: 'dashboard' },
  ]},
  { title: 'Sales', items: [
    { key: 'sale', label: 'Cash Sale', page: 'cash-sale' },
    { key: 'invoice', label: 'Sales Invoice', page: 'sales-invoice' },
    { key: 'invoice', label: 'Invoices', page: 'sales-invoices-list' },
    { key: 'approvals', label: 'Pay Approvals', page: 'payment-approvals' },
    { key: 'customers', label: 'Customers', page: 'customers' },
  ]},
  { title: 'Inventory', items: [
    { key: 'inventory', label: 'Inventory', page: 'inventory' },
    { key: 'dispatch', label: 'Dispatch', page: 'dispatch' },
    { key: 'approvals', label: 'Pending Transfers', page: 'stock-transfer-approvals' },
    { key: 'movements', label: 'Stock Movements', page: 'stock-movements' },
    { key: 'inventory', label: 'Stock Count', page: 'stock-count' },
  ]},
  { title: 'Money', items: [
    { key: 'accounts', label: 'Accounts', page: 'chart-of-accounts' },
    { key: 'banks', label: 'Banks', page: 'banks' },
    { key: 'reports', label: 'Reports', page: 'reports' },
  ]},
  { title: 'Partners', items: [
    { key: 'suppliers', label: 'Suppliers', page: 'suppliers' },
    { key: 'imports', label: 'Imports', page: 'import-register' },
    { key: 'crm', label: 'CRM', page: 'crm-hub' },
    { key: 'hrm', label: 'HRM', page: 'hrm' },
  ]},
  { title: 'System', items: [
    { key: 'settings', label: 'Settings', page: 'settings' },
  ]},
]

// Stock-workspace nav — mirrors STOCK_NAV in Sidebar.tsx. Keep in sync.
const STOCK_TABS: { key: string; label: string; page: Page }[] = [
  { key: 'home',      label: 'Home',     page: 'stock-dashboard' },
  { key: 'inventory', label: 'Stock',    page: 'inventory' },
  { key: 'receive',   label: 'Receive',  page: 'grn' },
  { key: 'dispatch',  label: 'Dispatch', page: 'dispatch' },
]
const STOCK_DRAWER: { key: string; label: string; page: Page }[] = [
  { key: 'home',      label: 'Stock Dashboard', page: 'stock-dashboard' },
  { key: 'inventory', label: 'Inventory',       page: 'inventory' },
  { key: 'receive',   label: 'Receive (GRN)',   page: 'grn' },
  { key: 'transfer',  label: 'Transfer',        page: 'stock-transfer' },
  { key: 'approvals', label: 'Approvals',       page: 'stock-transfer-approvals' },
  { key: 'dispatch',  label: 'Dispatch',        page: 'dispatch' },
  { key: 'movements', label: 'Movements',       page: 'stock-movements' },
  { key: 'register',  label: 'Transfer Register', page: 'stock-transfer-register' },
]

export default function MobileNav({ current, onNav, stockMode }: Props) {
  const { permissions, user } = useAuth()
  const [drawer, setDrawer] = useState(false)

  const allowed = (p: Page) => canAccessPage(p, permissions)
  const go = (p: Page) => { setDrawer(false); onNav(p) }

  const tabs = (stockMode ? STOCK_TABS : TABS).filter(t => allowed(t.page))

  return (
    <>
      {/* ── Bottom tab bar ─────────────────────────────────────────────── */}
      <nav className="mobile-tabbar">
        {tabs.map(t => {
          const active = current === t.page
          return (
            <button key={t.page} className={`mtab ${active ? 'mtab-active' : ''}`} onClick={() => go(t.page)}>
              <span className="mtab-ic">{ICONS[t.key]}</span>
              <span className="mtab-lbl">{t.label}</span>
            </button>
          )
        })}
        <button className={`mtab ${drawer ? 'mtab-active' : ''}`} onClick={() => setDrawer(d => !d)}>
          <span className="mtab-ic">{ICONS.menu}</span>
          <span className="mtab-lbl">Menu</span>
        </button>
      </nav>

      {/* ── Full menu drawer ───────────────────────────────────────────── */}
      {drawer && (
        <div className="mobile-drawer-backdrop" onClick={() => setDrawer(false)}>
          <div className="mobile-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="mobile-drawer-avatar">{user?.initials || 'U'}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{user?.full_name || 'User'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{user?.is_approver ? 'Approver' : 'Team Member'}</div>
                </div>
              </div>
              <button className="mobile-drawer-close" onClick={() => setDrawer(false)}>✕</button>
            </div>

            <div className="mobile-drawer-body">
              {stockMode ? (
                // Stock workspace: single flat, restricted list — matches the
                // desktop stock sidebar. No money / sales / settings groups.
                <div className="mobile-drawer-group">
                  <div className="mobile-drawer-group-title">Stock</div>
                  {STOCK_DRAWER.filter(it => allowed(it.page)).map((it, i) => (
                    <button
                      key={`${it.page}-${i}`}
                      className={`mobile-drawer-item ${current === it.page ? 'mobile-drawer-item-active' : ''}`}
                      onClick={() => go(it.page)}
                    >
                      <span className="mobile-drawer-item-ic">{ICONS[it.key]}</span>
                      {it.label}
                    </button>
                  ))}
                </div>
              ) : (
                GROUPS.map(g => {
                  const items = g.items.filter(it => allowed(it.page))
                  if (items.length === 0) return null
                  return (
                    <div key={g.title} className="mobile-drawer-group">
                      <div className="mobile-drawer-group-title">{g.title}</div>
                      {items.map((it, i) => (
                        <button
                          key={`${it.page}-${i}`}
                          className={`mobile-drawer-item ${current === it.page ? 'mobile-drawer-item-active' : ''}`}
                          onClick={() => go(it.page)}
                        >
                          <span className="mobile-drawer-item-ic">{ICONS[it.key]}</span>
                          {it.label}
                        </button>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
