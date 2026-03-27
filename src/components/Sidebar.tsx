import React, { useState } from 'react'
import type { Page } from '../lib/types'

const VOUCHER_PAGES: Page[] = [
  'vouchers', 'cash-sale', 'cash-payment', 'cash-receipt', 'bank-payment',
  'bank-receipt', 'bank-transfer', 'petty-cash', 'contra', 'sales-invoice',
  'quotation', 'sales-return', 'debit-note', 'credit-note', 'purchase-order',
  'grn', 'purchase-invoice', 'purchase-return', 'opening-stock',
  'stock-adjustment', 'stock-transfer', 'journal-entry'
]

const SALES_SUB: { label: string; page: Page; icon: string }[] = [
  { label: 'Cash Sale',     page: 'cash-sale',      icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  { label: 'Sales Invoice', page: 'sales-invoice',   icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { label: 'Day Book',      page: 'sales-day-book',  icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { label: 'Register',      page: 'sales-register',  icon: 'M18 20V10M12 20V4M6 20v-6' },
]

const NAV = [
  { icon: 'home',      label: 'Home',      page: 'dashboard' as Page },
  { sep: true },
  { icon: 'vouchers',  label: 'Vouchers',  page: 'vouchers' as Page },
  { icon: 'accounts',  label: 'Accounts',  page: 'chart-of-accounts' as Page },
  { icon: 'bank',      label: 'Banks',     page: 'banks' as Page },
  { icon: 'sales',     label: 'Sales',     page: 'sales' as Page,     hasSub: true },
  { icon: 'customers', label: 'Customers', page: 'customers' as Page },
  { icon: 'inventory', label: 'Inventory', page: 'inventory' as Page },
  { icon: 'reports',   label: 'Reports',   page: 'reports' as Page },
  { sep: true },
  { icon: 'services',  label: 'Services',  page: 'coming-soon' as Page, coming: true },
  { icon: 'konnect',   label: 'Konnect',   page: 'coming-soon' as Page, coming: true },
  { icon: 'crm',       label: 'CRM',       page: 'coming-soon' as Page, coming: true },
  { icon: 'hrm',       label: 'HRM',       page: 'coming-soon' as Page, coming: true },
  { sep: true },
  { icon: 'import',    label: 'Data Import', page: 'data-import' as Page },
  { icon: 'settings',  label: 'Settings',  page: 'settings' as Page },
]

interface SidebarProps { current: Page; onNav: (p: Page) => void }

const SideIcon = ({ name, active }: { name: string; active: boolean }) => {
  const c = active ? 'var(--accent)' : 'var(--text3)'
  const p = { width: 20, height: 20, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  const icons: Record<string, React.ReactNode> = {
    home:      <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    vouchers:  <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    accounts:  <svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
    bank:      <svg {...p}><path d="M3 10L12 3l9 7"/><rect x="5" y="10" width="3" height="8"/><rect x="10.5" y="10" width="3" height="8"/><rect x="16" y="10" width="3" height="8"/><path d="M2 18h20"/></svg>,
    sales:     <svg {...p}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
    customers: <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    inventory: <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    reports:   <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    services:  <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.1 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.64a16 16 0 0 0 6.29 6.29l1.46-1.46a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    konnect:   <svg {...p}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
    crm:       <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    hrm:       <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    import:    <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    settings:  <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  }
  const icon = icons[name] ?? icons['home']
  return <>{icon}</>
}

const SALES_PAGES: Page[] = ['cash-sale', 'sales-invoice', 'sales-day-book', 'sales-register', 'sales-return', 'quotation', 'debit-note', 'credit-note']

export default function Sidebar({ current, onNav }: SidebarProps) {
  const [salesOpen, setSalesOpen] = useState(false)

  const isSalesActive = SALES_PAGES.includes(current)

  return (
    <div style={{
      width: 'var(--sidebar)', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', alignItems: 'center',
      padding: '10px 0', flexShrink: 0, overflowY: 'auto', scrollbarWidth: 'none',
      position: 'relative'
    }}>
      {NAV.map((item, i) => {
        if ('sep' in item && item.sep) return (
          <div key={i} style={{ width: 36, height: 1, background: 'var(--border)', margin: '6px 0' }} />
        )

        const isVoucherActive = VOUCHER_PAGES.includes(current)
        const active =
          current === item.page ||
          (item.page === 'vouchers' && isVoucherActive && !isSalesActive) ||
          (item.page === 'sales' && isSalesActive)

        const isSales = item.page === 'sales'

        return (
          <div key={i} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              onClick={() => {
                if (item.coming || !item.page) return
                if (isSales) {
                  setSalesOpen(o => !o)
                  onNav('sales')
                } else {
                  setSalesOpen(false)
                  onNav(item.page)
                }
              }}
              style={{
                width: 52, height: 52, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                borderRadius: 10,
                borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                background: active ? 'var(--accent-dim)' : 'transparent',
                opacity: item.coming ? 0.4 : 1,
                transition: 'all .15s', margin: '1px 0',
                position: 'relative', cursor: item.coming ? 'default' : 'pointer'
              }}>
              <span style={{ fontSize: 18 }}><SideIcon name={item.icon || 'home'} active={active} /></span>
              <span style={{
                fontSize: 8, fontWeight: 600,
                color: active ? 'var(--accent)' : 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '.4px'
              }}>{item.label}</span>

              {Boolean(isSales) && (
                <span style={{ position:'absolute', right:4, top:'50%', transform:`translateY(-50%) rotate(${salesOpen?90:0}deg)`, transition:'transform .2s', color:'var(--text3)', fontSize:8 }}>›</span>
              )}

              {'badge' in item && (item as any).badge && (
                <span style={{
                  position: 'absolute', top: 5, right: 6, minWidth: 14, height: 14,
                  background: 'var(--red)', borderRadius: 7, fontSize: 7, fontWeight: 800,
                  color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '0 3px'
                }}>{(item as any).badge}</span>
              )}

              {item.coming && (
                <span style={{
                  position: 'absolute', top: 4, right: 2, background: 'var(--surface3)',
                  border: '1px solid var(--border)', borderRadius: 3, fontSize: 6,
                  fontFamily: 'var(--mono)', color: 'var(--text3)', padding: '1px 3px'
                }}>SOON</span>
              )}
            </div>

            {/* Sales sub-menu */}
            {Boolean(isSales) && (salesOpen || isSalesActive) && (
              <div style={{ width:'100%', background:'var(--surface2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'4px 0' }}>
                {SALES_SUB.map(sub => {
                  const subActive = current === sub.page
                  return (
                    <div key={sub.page} onClick={() => onNav(sub.page)}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'6px 4px', cursor:'pointer',
                        background: subActive ? 'var(--accent-dim)' : 'transparent',
                        borderLeft: `2px solid ${subActive ? 'var(--accent)' : 'transparent'}`,
                      }}>
                      <svg width="14" height="14" fill="none" stroke={subActive?'var(--accent)':'var(--text3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d={sub.icon}/>
                      </svg>
                      <span style={{ fontSize:7, fontWeight:600, color:subActive?'var(--accent)':'var(--text3)', textTransform:'uppercase', letterSpacing:'.3px', marginTop:2, textAlign:'center', lineHeight:1.2 }}>{sub.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
