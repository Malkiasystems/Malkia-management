// accountBrand.tsx
// ─────────────────────────────────────────────────────────────────────────────
// One definition of how a Cash & Bank account looks: its glyph, its colour and
// the name to show. Extracted from Banks.tsx so the same NMB blue and the same
// M-Pesa red appear wherever an account is offered — the Banks page, the Sales
// Invoice deposit picker, and anything added later.
//
// Resolution order, deliberately: the tenant's own choice wins, then the
// seeded code map, then a neutral fallback derived from the account's nature.
// A tenant who renamed their till or picked a brand colour sees that
// everywhere, not just on the page where they set it.
// ─────────────────────────────────────────────────────────────────────────────

export interface BrandableAccount {
  code: string
  name?: string | null
  nature?: string | null
  display_color?: string | null
}

export interface AccountBrand {
  color: string
  iconName: string
  shortName: string
  bg: string
  accentBg: string
}

/** Decoration mapped to seeded GL codes. Styling only: the account list is
 *  fetched by category, so an account whose code is absent here still renders
 *  through the nature fallback below. */
export const BANK_CONFIG: Record<string, { shortName: string; iconName: string; color: string }> = {
  '1000': { shortName: 'Cash on Hand', iconName: 'cash',   color: '#4ade80' },
  '1010': { shortName: 'Cash Till',    iconName: 'cash',   color: '#4ade80' },
  '1020': { shortName: 'M-Pesa',       iconName: 'mobile', color: '#f87171' },
  '1021': { shortName: 'Mixx by YAS',  iconName: 'mobile', color: '#facc15' },
  '1022': { shortName: 'NMB Bank',     iconName: 'bank',   color: '#60a5fa' },
  '1030': { shortName: 'CRDB Bank',    iconName: 'bank',   color: '#34d399' },
  '1031': { shortName: 'CRDB USD',     iconName: 'bank',   color: '#a78bfa' },
  '1040': { shortName: 'Petty Cash',   iconName: 'cash',   color: '#fb923c' },
}

export const iconForNature = (nature: string | null | undefined): string => {
  if (nature === 'mobile_money') return 'mobile'
  if (nature === 'traditional_bank') return 'bank'
  if (nature === 'cash') return 'cash'
  return 'bank'
}

export const defaultColorForNature = (nature: string | null | undefined): string => {
  if (nature === 'mobile_money') return '#f87171'
  if (nature === 'traditional_bank') return '#60a5fa'
  if (nature === 'cash') return '#4ade80'
  return '#85c2be'
}

export const hexToTint = (hex: string, alpha: string = '18'): string => {
  const clean = hex.startsWith('#') ? hex : `#${hex}`
  return `${clean}${alpha}`
}

/** Resolve everything needed to draw an account tile. */
export function accountBrand(acct: BrandableAccount): AccountBrand {
  const color =
    acct.display_color ||
    BANK_CONFIG[acct.code]?.color ||
    defaultColorForNature(acct.nature)

  const iconName =
    acct.nature ? iconForNature(acct.nature) :
    BANK_CONFIG[acct.code]?.iconName ||
    'bank'

  // The tenant's saved name ALWAYS wins. The seeded shortName is only a
  // fallback for rows that somehow have no name — it used to take precedence,
  // which made renames save correctly but keep displaying the old label.
  const shortName = acct.name || BANK_CONFIG[acct.code]?.shortName || 'Account'

  return { color, iconName, shortName, bg: hexToTint(color, '18'), accentBg: hexToTint(color, '28') }
}

export const AccountIcon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const s = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'bank') return <svg {...s} viewBox="0 0 24 24"><path d="M3 10L12 3l9 7"/><rect x="5" y="10" width="3" height="8"/><rect x="10.5" y="10" width="3" height="8"/><rect x="16" y="10" width="3" height="8"/><path d="M2 18h20"/></svg>
  if (name === 'cash') return <svg {...s} viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>
  if (name === 'mobile') return <svg {...s} viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/></svg>
  if (name === 'card') return <svg {...s} viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>
  return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
}

/**
 * A selectable account tile: icon chip, name, code. Used by the Sales Invoice
 * deposit picker in place of a plain <select>, so choosing where the money
 * lands looks the same as it does at the till.
 */
export function AccountTile({
  account, selected, disabled, onSelect,
}: {
  account: BrandableAccount
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const b = accountBrand(account)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      title={`${account.code} — ${b.shortName}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
        padding: '8px 10px', borderRadius: 10, minWidth: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        background: selected ? b.accentBg : 'var(--surface2)',
        border: `1px solid ${selected ? b.color : 'var(--border)'}`,
        transition: 'background .12s ease, border-color .12s ease',
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 7, flex: 'none',
        display: 'grid', placeItems: 'center', background: b.bg,
      }}>
        <AccountIcon name={b.iconName} size={16} color={b.color} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 12, fontWeight: 700,
          color: selected ? b.color : 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{b.shortName}</span>
        <span style={{ display: 'block', fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
          {account.code}
        </span>
      </span>
    </button>
  )
}
