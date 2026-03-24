import type { Page } from '../lib/types'

interface TopbarProps {
  breadcrumb: string
  onNav: (p: Page) => void
}

export default function Topbar({ breadcrumb, onNav }: TopbarProps) {
  return (
    <div style={{
      height: 'var(--topbar)', background: 'var(--surface)',
      borderBottom: '1px solid var(--border)', display: 'flex',
      alignItems: 'center', padding: '0 16px', gap: 14, flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
        <div
          onClick={() => onNav('dashboard')}
          style={{
            width: 30, height: 30, background: 'var(--accent)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
          <svg width="16" height="16" viewBox="0 0 22 22" fill="white">
            <circle cx="11" cy="7.5" r="4.5" />
            <path d="M2 20c0-5 4-9 9-9s9 4 9 9" />
          </svg>
        </div>
        <div
          onClick={() => onNav('dashboard')}
          style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 800, color: 'var(--text)', cursor: 'pointer' }}>
          Malkia<span style={{ color: 'var(--accent)' }}>OS</span>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        Wellness Group <span style={{ opacity: .4 }}>›</span>{' '}
        <span style={{ color: 'var(--text2)' }}>{breadcrumb}</span>
      </div>

      <div style={{ flex: 1, maxWidth: 400, margin: '0 auto', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>🔍</span>
        <input
          placeholder="Search transactions, products, accounts…"
          style={{
            width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', padding: '7px 36px 7px 32px',
            color: 'var(--text)', fontSize: 12, outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <span style={{
          background: 'var(--yellow-dim)', border: '1px solid var(--yellow)',
          borderRadius: 6, padding: '3px 9px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--yellow)'
        }}>FY 2025–26</span>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer'
        }}>
          <div style={{
            width: 24, height: 24, background: 'linear-gradient(135deg,var(--accent),#e05c3a)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--display)', fontSize: 10, fontWeight: 700, color: '#fff'
          }}>JG</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>Joe Gembe</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Super Admin</div>
          </div>
        </div>
      </div>
    </div>
  )
}
