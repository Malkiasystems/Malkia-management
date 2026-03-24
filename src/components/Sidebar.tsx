import type { Page } from '../lib/types'

const VOUCHER_PAGES: Page[] = [
  'vouchers', 'cash-sale', 'cash-payment', 'cash-receipt', 'bank-payment',
  'bank-receipt', 'bank-transfer', 'petty-cash', 'contra', 'sales-invoice',
  'quotation', 'sales-return', 'debit-note', 'credit-note', 'purchase-order',
  'grn', 'purchase-invoice', 'purchase-return', 'opening-stock',
  'stock-adjustment', 'stock-transfer', 'journal-entry'
]

const NAV = [
  { icon: '📊', label: 'Home', page: 'dashboard' as Page },
  { sep: true },
  { icon: '📝', label: 'Vouchers', page: 'vouchers' as Page },
  { icon: '📒', label: 'Accounts', page: 'chart-of-accounts' as Page },
  { icon: '🛒', label: 'Sales', page: 'sales' as Page, badge: '7' },
  { icon: '📦', label: 'Inventory', page: 'inventory' as Page },
  { icon: '📈', label: 'Reports', page: 'reports' as Page },
  { sep: true },
  { icon: '⚕️', label: 'Services', page: 'coming-soon' as Page, coming: true },
  { icon: '💬', label: 'Konnect', page: 'coming-soon' as Page, coming: true },
  { icon: '🌐', label: 'CRM', page: 'coming-soon' as Page, coming: true },
  { icon: '👥', label: 'HRM', page: 'coming-soon' as Page, coming: true },
  { sep: true },
  { icon: '⚙️', label: 'Settings', page: 'settings' as Page },
]

interface SidebarProps {
  current: Page
  onNav: (p: Page) => void
}

export default function Sidebar({ current, onNav }: SidebarProps) {
  return (
    <div style={{
      width: 'var(--sidebar)', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', alignItems: 'center',
      padding: '10px 0', flexShrink: 0, overflowY: 'auto', scrollbarWidth: 'none'
    }}>
      {NAV.map((item, i) => {
        if ('sep' in item && item.sep) return (
          <div key={i} style={{ width: 36, height: 1, background: 'var(--border)', margin: '6px 0' }} />
        )

        const isVoucherActive = VOUCHER_PAGES.includes(current)
        const active =
          current === item.page ||
          (item.page === 'vouchers' && isVoucherActive) ||
          (item.page === 'sales' && current === 'cash-sale')

        return (
          <div
            key={i}
            onClick={() => !item.coming && item.page && onNav(item.page)}
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
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span style={{
              fontSize: 8, fontWeight: 600,
              color: active ? 'var(--accent)' : 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '.4px'
            }}>{item.label}</span>

            {'badge' in item && item.badge && (
              <span style={{
                position: 'absolute', top: 5, right: 6, minWidth: 14, height: 14,
                background: 'var(--red)', borderRadius: 7, fontSize: 7, fontWeight: 800,
                color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: '0 3px'
              }}>{item.badge}</span>
            )}

            {item.coming && (
              <span style={{
                position: 'absolute', top: 4, right: 2, background: 'var(--surface3)',
                border: '1px solid var(--border)', borderRadius: 3, fontSize: 6,
                fontFamily: 'var(--mono)', color: 'var(--text3)', padding: '1px 3px'
              }}>SOON</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
