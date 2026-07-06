import React, { useState, useEffect } from 'react'
import type { Page } from '../lib/types'
import { useAuth, canAccessPage } from '../lib/useAuth'
import { getActiveCompany, supabase } from '../lib/supabase'

const VOUCHER_PAGES: Page[] = [
  'vouchers', 'cash-sale', 'cash-payment', 'cash-receipt', 'bank-payment',
  'bank-receipt', 'bank-transfer', 'petty-cash', 'contra', 'sales-invoice',
  'quotation', 'sales-return', 'debit-note', 'credit-note', 'purchase-order',
  'grn', 'purchase', 'purchase-invoice', 'purchase-return', 'opening-stock',
  'stock-adjustment', 'stock-transfer', 'journal-entry', 'internal-use',
  'proforma', 'proformas-list', 'posted-vouchers'
]

const SALES_PAGES: Page[] = ['cash-sale', 'sales-invoice', 'sales-invoices-list', 'sales-day-book', 'sales-register', 'sales-return', 'quotation', 'debit-note', 'credit-note', 'proforma', 'proformas-list']

const IMPORT_PAGES: Page[] = ['import-register', 'import-order']

const CRM_PAGES: Page[] = ['crm', 'crm-hub', 'crm-inbox', 'crm-automations', 'crm-preorders', 'crm-referrals', 'crm-loyalty', 'crm-feedback', 'crm-upsell', 'crm-customers']

const SETTINGS_PAGES: Page[] = ['settings', 'users', 'approvals', 'audit-trail', 'accounting-settings', 'whatsapp-settings', 'location-settings', 'inventory-settings', 'receipt-template', 'invoice-template', 'report-templates', 'company-finance-settings', 'users-access-settings', 'sales-inventory-settings', 'templates-hub', 'integrations-settings', 'regional-backup-settings', 'display-settings']

const HRM_PAGES: Page[] = ['hrm', 'hrm-employees', 'hrm-assets', 'hrm-payroll', 'hrm-payslips', 'hrm-payslip-template', 'hrm-leave', 'hrm-attendance', 'hrm-performance', 'hrm-recruitment', 'hrm-events', 'hrm-settings', 'hrm-kpi']

const HRM_SUB: { label: string; page: Page; icon: string }[] = [
  { label: 'Dashboard', page: 'hrm',             icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { label: 'Employees', page: 'hrm-employees',   icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { label: 'Payroll',   page: 'hrm-payroll',      icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { label: 'Leave',     page: 'hrm-leave',        icon: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' },
  { label: 'Attend',    page: 'hrm-attendance',   icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6v6l4 2' },
  { label: 'Events',    page: 'hrm-events',       icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18' },
  { label: 'KPIs',      page: 'hrm-kpi',          icon: 'M3 3v18h18 M7 14l4-4 3 3 5-6' },
]

const SETTINGS_SUB: { label: string; page: Page; icon: string }[] = [
  { label: 'General',     page: 'settings',        icon: 'M12 3a9 9 0 0 0-9 9v1h6v-1a3 3 0 0 1 6 0v1h6v-1a9 9 0 0 0-9-9zM3 14v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4' },
  { label: 'Users',       page: 'users',           icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
  { label: 'Approvals',   page: 'approvals',       icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { label: 'Audit Trail', page: 'audit-trail',     icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4' },
  { label: 'Accounting',  page: 'accounting-settings', icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { label: 'Reports',     page: 'report-templates', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8' },
]

const VOUCHERS_SUB: { label: string; page: Page; icon: string }[] = [
  { label: 'All Vouchers', page: 'vouchers',         icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z' },
  { label: 'Posted',       page: 'posted-vouchers',  icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4' },
]

const INVENTORY_SUB: { label: string; page: Page; icon: string }[] = [
  { label: 'Inventory', page: 'inventory',                icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12.01l8.73-5.05 M12 22.08V12' },
  { label: 'Pending Transfers', page: 'stock-transfer-approvals', icon: 'M7 16V4 M3 8l4-4 4 4 M17 8v12 M21 16l-4 4-4-4' },
  { label: 'Dispatch', page: 'dispatch', icon: 'M1 3h13v13H1z M14 8h4l3 3v5h-7 M5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
  { label: 'Movements', page: 'stock-movements', icon: 'M3 3v18h18 M7 14l4-4 4 4 4-6' },
]

const SALES_SUB: { label: string; page: Page; icon: string }[] = [
  { label: 'Cash Sale',     page: 'cash-sale',           icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  { label: 'Sales Invoice', page: 'sales-invoice',        icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { label: 'Invoices',      page: 'sales-invoices-list',  icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6' },
  { label: 'Proformas',     page: 'proformas-list',       icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15h6' },
  { label: 'Day Book',      page: 'sales-day-book',       icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { label: 'Register',      page: 'sales-register',       icon: 'M18 20V10M12 20V4M6 20v-6' },
]

const CRM_SUB: { label: string; page: Page; icon: string }[] = [
  { label: 'Hub',         page: 'crm-hub',         icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { label: 'Inbox',       page: 'crm-inbox',       icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
  { label: 'Automations', page: 'crm-automations', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { label: 'Pre-Orders',  page: 'crm-preorders',   icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
  { label: 'Referrals',   page: 'crm-referrals',   icon: 'M18 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98' },
  { label: 'Crown',       page: 'crm-loyalty',     icon: 'M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM3 20h18' },
  { label: 'Feedback',    page: 'crm-feedback',    icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { label: 'Upsell',      page: 'crm-upsell',      icon: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6' },
]

interface SidebarProps { current: Page; onNav: (p: Page) => void; stockMode?: boolean }

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
    suppliers: <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    ship:      <svg {...p}><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>,
    inventory: <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    reports:   <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    services:  <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.1 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.64a16 16 0 0 0 6.29 6.29l1.46-1.46a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    konnect:   <svg {...p}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
    crm:       <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>,
    hrm:       <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    import:    <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    investors: <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
    settings:  <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  }
  const icon = icons[name] ?? icons['home']
  return <>{icon}</>
}

export default function Sidebar({ current, onNav, stockMode }: SidebarProps) {
  const [salesOpen, setSalesOpen] = useState(false)
  const [crmOpen, setCrmOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hrmOpen, setHrmOpen] = useState(false)
  const [vouchersOpen, setVouchersOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  
  const { permissions } = useAuth()

  // Live count of transfers waiting to be received (in transit), so the
  // destination sees a badge instead of having to hunt for the page.
  const [incomingCount, setIncomingCount] = useState(0)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const { count } = await supabase
          .from('stock_transfer_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_transit')
        if (alive && typeof count === 'number') setIncomingCount(count)
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [current])
  const company = getActiveCompany()
  const CRM_HIDDEN = new Set(['services', 'konnect', 'crm'])

  // ── Stock Manager workspace sidebar ────────────────────────────────
  // A completely separate, minimal nav for workspace_role='stock'. The full
  // sidebar below is left exactly as-is (non-regression). Items still respect
  // the user's permissions, so a missing permission hides its icon.
  if (stockMode) {
    const STOCK_NAV: { label: string; page: Page; icon: string }[] = [
      { label: 'Home',      page: 'stock-dashboard',          icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10' },
      { label: 'Inventory', page: 'inventory',                icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12.01l8.73-5.05 M12 22.08V12' },
      { label: 'Receive',   page: 'grn',                      icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3' },
      { label: 'Transfer',  page: 'stock-transfer',           icon: 'M16 3h5v5 M21 3l-7 7 M8 21H3v-5 M3 21l7-7' },
      { label: 'Approvals', page: 'stock-transfer-approvals', icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
      { label: 'Dispatch',  page: 'dispatch',                 icon: 'M1 3h13v13H1z M14 8h4l3 3v5h-7 M5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
      { label: 'Movements', page: 'stock-movements',           icon: 'M3 3v18h18 M7 14l4-4 4 4 4-6' },
      { label: 'Register',  page: 'stock-transfer-register',  icon: 'M18 20V10 M12 20V4 M6 20v-6' },
    ]
    const visibleStockNav = STOCK_NAV.filter(it => canAccessPage(it.page, permissions))

    return (
      <div style={{
        width: 'var(--sidebar)', background: 'var(--surface)',
        borderRight: '1px solid var(--border)', display: 'flex',
        flexDirection: 'column', alignItems: 'center',
        padding: '10px 0', flexShrink: 0, overflowY: 'auto', scrollbarWidth: 'none',
        position: 'relative'
      }}>
        {visibleStockNav.map(it => {
          const active = current === it.page
          return (
            <div
              key={it.page}
              onClick={() => onNav(it.page)}
              style={{
                width: 52, height: 52, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                borderRadius: 10,
                borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                background: active ? 'var(--accent-dim)' : 'transparent',
                transition: 'all .15s', margin: '1px 0', cursor: 'pointer'
              }}
            >
              <svg width="20" height="20" fill="none" stroke={active ? 'var(--accent)' : 'var(--text3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d={it.icon} />
              </svg>
              <span style={{
                fontSize: 8, fontWeight: 600,
                color: active ? 'var(--accent)' : 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '.4px'
              }}>{it.label}</span>
            </div>
          )
        })}

        {/* Company indicator */}
        <div style={{ marginTop: 'auto', padding: '12px 4px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: company.color, margin: '0 auto 4px' }} />
          <div style={{ fontSize: 7, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px', lineHeight: 1.3 }}>
            {company.shortName}
          </div>
        </div>
      </div>
    )
  }

  // Build NAV dynamically based on company
  const NAV: (
    | { icon: string; label: string; page: Page; hasSub?: boolean; coming?: boolean; badge?: number }
    | { sep: true }
  )[] = [
    { icon: 'home',      label: 'Home',      page: 'dashboard' as Page },
    { sep: true },
    { icon: 'vouchers',  label: 'Vouchers',  page: 'vouchers' as Page, hasSub: true },
    { icon: 'accounts',  label: 'Accounts',  page: 'chart-of-accounts' as Page },
    { icon: 'bank',      label: 'Banks',     page: 'banks' as Page },
    { icon: 'sales',     label: 'Sales',     page: 'sales' as Page,     hasSub: true },
    { icon: 'customers', label: 'Customers', page: 'customers' as Page },
    { icon: 'suppliers', label: 'Suppliers', page: 'suppliers' as Page },
    { icon: 'ship',     label: 'Imports',   page: 'import-register' as Page },
    { icon: 'inventory', label: 'Inventory', page: 'inventory' as Page, hasSub: true },
    // Bundles only for companies that don't hide them
    ...(!company.hideBundles ? [{ icon: 'inventory', label: 'Bundles', page: 'bundles' as Page }] : []),
    { icon: 'reports',   label: 'Reports',   page: 'reports' as Page },
    { sep: true },
    // Investors only for companies that show them
    ...(company.showInvestors ? [{ icon: 'investors', label: 'Investors', page: 'investors-hub' as Page }] : []),
    { icon: 'services',  label: 'Services',  page: 'coming-soon' as Page, coming: true },
    { icon: 'konnect',   label: 'Konnect',   page: 'coming-soon' as Page, coming: true },
    { icon: 'crm',       label: 'CRM',       page: 'crm-hub' as Page,    hasSub: true },
    { icon: 'hrm',       label: 'HRM',       page: 'hrm' as Page,       hasSub: true },
    { sep: true },
    { icon: 'import',    label: 'Data Import', page: 'data-import' as Page },
    { icon: 'settings',  label: 'Settings',  page: 'settings' as Page, hasSub: true },
  ]

  // Filter NAV based on company (hide CRM for wholesale)
  const filteredNav = company.hideCRM
    ? NAV.filter(item => !('icon' in item && CRM_HIDDEN.has(item.icon || '')))
    : NAV

  const isSalesActive = SALES_PAGES.includes(current)
  const isCrmActive = CRM_PAGES.includes(current)
  const isSettingsActive = SETTINGS_PAGES.includes(current)
  const isHrmActive = HRM_PAGES.includes(current)
  
  // Filter NAV items based on permissions
  const canAccess = (page: Page) => canAccessPage(page, permissions)
  
  // Filter sub-menu items
  const visibleSalesSub = SALES_SUB.filter(sub => canAccess(sub.page))
  const visibleCrmSub = CRM_SUB.filter(sub => canAccess(sub.page))
  const visibleSettingsSub = SETTINGS_SUB.filter(sub => canAccess(sub.page))
  const visibleHrmSub = HRM_SUB.filter(sub => canAccess(sub.page))
  const visibleVouchersSub = VOUCHERS_SUB.filter(sub => canAccess(sub.page))
  const visibleInventorySub = INVENTORY_SUB.filter(sub => canAccess(sub.page))

  return (
    <div style={{
      width: 'var(--sidebar)', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', alignItems: 'center',
      padding: '10px 0', flexShrink: 0, overflowY: 'auto', scrollbarWidth: 'none',
      position: 'relative'
    }}>
      {filteredNav.map((item, i) => {
        if ('sep' in item && item.sep) return (
          <div key={i} style={{ width: 36, height: 1, background: 'var(--border)', margin: '6px 0' }} />
        )

        // Narrow type: after sep guard, item must be a nav item
        if (!('page' in item)) return null
        const navItem = item as { icon: string; label: string; page: Page; hasSub?: boolean; coming?: boolean; badge?: number }

        // Skip items user can't access (except coming soon items)
        if (!navItem.coming && navItem.page && !canAccess(navItem.page as Page)) {
          // For parent items (Sales, CRM, Settings), check if any sub-items are accessible
          if (navItem.page === 'sales' && visibleSalesSub.length === 0) return null
          if (navItem.page === 'crm-hub' && visibleCrmSub.length === 0) return null
          if (navItem.page === 'settings' && visibleSettingsSub.length === 0) return null
          if (navItem.page === 'hrm' && visibleHrmSub.length === 0) return null
          if (navItem.page === 'inventory' && visibleInventorySub.length === 0) return null
          // For non-parent items, just skip
          if (!['sales', 'crm-hub', 'settings', 'hrm', 'vouchers', 'inventory'].includes(navItem.page as string)) return null
        }

        const isVoucherActive = VOUCHER_PAGES.includes(current)
        const isImportActive = IMPORT_PAGES.includes(current)
        const active =
          current === navItem.page ||
          (navItem.page === 'vouchers' && isVoucherActive && !isSalesActive && !isCrmActive && !isSettingsActive && !isHrmActive) ||
          (navItem.page === 'sales' && isSalesActive) ||
          (navItem.page === 'import-register' && isImportActive) ||
          (navItem.page === 'crm-hub' && isCrmActive) ||
          (navItem.page === 'settings' && isSettingsActive) ||
          (navItem.page === 'hrm' && isHrmActive)

        const isSalesItem = navItem.page === 'sales'
        const isCrmItem = navItem.page === 'crm-hub'
        const isSettingsItem = navItem.page === 'settings'
        const isHrmItem = navItem.page === 'hrm'
        const isVouchersItem = navItem.page === 'vouchers'
        const isInventoryItem = navItem.page === 'inventory'

        return (
          <div key={i} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              onClick={() => {
                if (navItem.coming || !navItem.page) return
                if (isSalesItem) {
                  setSalesOpen(o => !o)
                  setVouchersOpen(false); setInventoryOpen(false); setCrmOpen(false); setSettingsOpen(false); setHrmOpen(false)
                  onNav('sales')
                } else if (isVouchersItem) {
                  setVouchersOpen(o => !o)
                  setSalesOpen(false); setInventoryOpen(false); setCrmOpen(false); setSettingsOpen(false); setHrmOpen(false)
                  onNav('vouchers')
                } else if (isInventoryItem) {
                  setInventoryOpen(o => !o)
                  setVouchersOpen(false); setSalesOpen(false); setCrmOpen(false); setSettingsOpen(false); setHrmOpen(false)
                  onNav('inventory')
                } else if (isCrmItem) {
                  setCrmOpen(o => !o)
                  setVouchersOpen(false); setInventoryOpen(false); setSalesOpen(false); setSettingsOpen(false); setHrmOpen(false)
                  onNav('crm-hub')
                } else if (isSettingsItem) {
                  setSettingsOpen(o => !o)
                  setVouchersOpen(false); setInventoryOpen(false); setSalesOpen(false); setCrmOpen(false); setHrmOpen(false)
                  onNav('settings')
                } else if (isHrmItem) {
                  setHrmOpen(o => !o)
                  setVouchersOpen(false); setInventoryOpen(false); setSalesOpen(false); setCrmOpen(false); setSettingsOpen(false)
                  onNav('hrm')
                } else {
                  setVouchersOpen(false); setInventoryOpen(false); setSalesOpen(false); setCrmOpen(false); setSettingsOpen(false); setHrmOpen(false)
                  onNav(navItem.page)
                }
              }}
              style={{
                width: 52, height: 52, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                borderRadius: 10,
                borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                background: active ? 'var(--accent-dim)' : 'transparent',
                opacity: navItem.coming ? 0.4 : 1,
                transition: 'all .15s', margin: '1px 0',
                position: 'relative', cursor: navItem.coming ? 'default' : 'pointer'
              }}>
              <span style={{ fontSize: 18 }}><SideIcon name={navItem.icon || 'home'} active={active} /></span>
              <span style={{
                fontSize: 8, fontWeight: 600,
                color: active ? 'var(--accent)' : 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '.4px'
              }}>{navItem.label}</span>

              {Boolean(isSalesItem || isVouchersItem || isInventoryItem || isCrmItem || isSettingsItem || isHrmItem) && (
                <span style={{ 
                  position:'absolute', right:4, top:'50%', 
                  transform:`translateY(-50%) rotate(${(isSalesItem && salesOpen) || (isVouchersItem && vouchersOpen) || (isInventoryItem && inventoryOpen) || (isCrmItem && crmOpen) || (isSettingsItem && settingsOpen) || (isHrmItem && hrmOpen) ? 90 : 0}deg)`, 
                  transition:'transform .2s', color:'var(--text3)', fontSize:8 
                }}>›</span>
              )}

              {navItem.badge && (
                <span style={{
                  position: 'absolute', top: 5, right: 6, minWidth: 14, height: 14,
                  background: 'var(--red)', borderRadius: 7, fontSize: 7, fontWeight: 800,
                  color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '0 3px'
                }}>{navItem.badge}</span>
              )}

              {navItem.coming && (
                <span style={{
                  position: 'absolute', top: 4, right: 2, background: 'var(--surface3)',
                  border: '1px solid var(--border)', borderRadius: 3, fontSize: 6,
                  fontFamily: 'var(--mono)', color: 'var(--text3)', padding: '1px 3px'
                }}>SOON</span>
              )}
            </div>

            {/* Inventory sub-menu */}
            {Boolean(isInventoryItem) && (inventoryOpen || current === 'inventory' || current === 'stock-transfer' || current === 'stock-transfer-outgoing' || current === 'stock-transfer-approvals' || current === 'dispatch' || current === 'stock-movements') && visibleInventorySub.length > 0 && (
              <div style={{ width:'100%', background:'var(--surface2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'4px 0' }}>
                {visibleInventorySub.map(sub => {
                  const subActive = current === sub.page
                  const subBadge = sub.page === 'stock-transfer-approvals' ? (incomingCount || 0) : 0
                  return (
                    <div key={sub.page} onClick={() => onNav(sub.page)}
                      style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', padding:'6px 4px', cursor:'pointer',
                        background: subActive ? 'var(--accent-dim)' : 'transparent',
                        borderLeft: `2px solid ${subActive ? 'var(--accent)' : 'transparent'}`,
                      }}>
                      <svg width="14" height="14" fill="none" stroke={subActive?'var(--accent)':'var(--text3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d={sub.icon}/>
                      </svg>
                      <span style={{ fontSize:7, fontWeight:600, color:subActive?'var(--accent)':'var(--text3)', textTransform:'uppercase', letterSpacing:'.3px', marginTop:2, textAlign:'center', lineHeight:1.2 }}>{sub.label}</span>
                      {subBadge > 0 && (
                        <span style={{ position:'absolute', top:2, right:8, minWidth:14, height:14, padding:'0 3px', borderRadius:7, background:'var(--accent)', color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{subBadge}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Vouchers sub-menu */}
            {Boolean(isVouchersItem) && (vouchersOpen || current === 'vouchers' || current === 'posted-vouchers') && visibleVouchersSub.length > 0 && (
              <div style={{ width:'100%', background:'var(--surface2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'4px 0' }}>
                {visibleVouchersSub.map(sub => {
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

            {/* Sales sub-menu */}
            {Boolean(isSalesItem) && (salesOpen || isSalesActive) && visibleSalesSub.length > 0 && (
              <div style={{ width:'100%', background:'var(--surface2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'4px 0' }}>
                {visibleSalesSub.map(sub => {
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

            {/* CRM sub-menu */}
            {Boolean(isCrmItem) && (crmOpen || isCrmActive) && visibleCrmSub.length > 0 && (
              <div style={{ width:'100%', background:'var(--surface2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'4px 0' }}>
                {visibleCrmSub.map(sub => {
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

            {/* Settings sub-menu */}
            {Boolean(isSettingsItem) && (settingsOpen || isSettingsActive) && visibleSettingsSub.length > 0 && (
              <div style={{ width:'100%', background:'var(--surface2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'4px 0' }}>
                {visibleSettingsSub.map(sub => {
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

            {/* HRM sub-menu */}
            {Boolean(isHrmItem) && (hrmOpen || isHrmActive) && visibleHrmSub.length > 0 && (
              <div style={{ width:'100%', background:'var(--surface2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'4px 0' }}>
                {visibleHrmSub.map(sub => {
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

      {/* Company indicator */}
      <div style={{ marginTop: 'auto', padding: '12px 4px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: company.color, margin: '0 auto 4px' }} />
        <div style={{ fontSize: 7, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px', lineHeight: 1.3 }}>
          {company.shortName}
        </div>
      </div>
    </div>
  )
}
