import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'

interface Props {
  breadcrumb: string
  onNav: (p: Page) => void
  onBack: () => void
  canGoBack: boolean
}

export default function Topbar({ breadcrumb, onNav, onBack, canGoBack }: Props) {
  const { user, signOut } = useAuth()

  const handleLogout = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await signOut()
    }
  }

  return (
    <div style={styles.topbar}>
      <div style={styles.left}>
        <div style={styles.logo} onClick={() => onNav('dashboard')}>
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="45" fill="#85c2be"/>
            <path d="M30 65 L50 35 L70 65" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="50" cy="28" r="6" fill="#f7a6ad"/>
          </svg>
          <span style={styles.logoText}>MalkiaOS</span>
        </div>

        {canGoBack && (
          <button style={styles.backBtn} onClick={onBack}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
        )}

        <div style={styles.breadcrumb}>
          <span style={styles.company}>Wellness Group</span>
          <span style={styles.separator}>›</span>
          <span style={styles.page}>{breadcrumb}</span>
        </div>
      </div>

      <div style={styles.center}>
        <div style={styles.search}>
          <svg width="16" height="16" fill="none" stroke="var(--text3)" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input 
            type="text" 
            placeholder="Search everything — vouchers, products, customers, pages..."
            style={styles.searchInput}
          />
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.fyBadge}>FY 2025-26</div>
        
        <div style={styles.userSection}>
          <div style={styles.avatar}>
            {user?.initials || 'U'}
          </div>
          <div style={styles.userInfo}>
            <div style={styles.userName}>{user?.full_name || 'User'}</div>
            <div style={styles.userRole}>
              {user?.is_approver ? 'Approver' : 'Team Member'}
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout} title="Sign out">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    gap: 20,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    minWidth: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
  },
  logoText: {
    fontFamily: 'Syne, sans-serif',
    fontWeight: 700,
    fontSize: 18,
    color: 'var(--text)',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text2)',
    fontSize: 12,
    cursor: 'pointer',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
  },
  company: {
    color: 'var(--text3)',
  },
  separator: {
    color: 'var(--text3)',
  },
  page: {
    color: 'var(--text)',
    fontWeight: 500,
  },
  center: {
    flex: 1,
    maxWidth: 500,
  },
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text)',
    fontSize: 13,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  fyBadge: {
    padding: '6px 12px',
    background: '#85c2be',
    color: '#000',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'DM Mono, monospace',
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #85c2be, #f7a6ad)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
    color: '#000',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  userName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text)',
  },
  userRole: {
    fontSize: 11,
    color: 'var(--text3)',
  },
  logoutBtn: {
    padding: 8,
    background: 'transparent',
    border: 'none',
    color: 'var(--text3)',
    cursor: 'pointer',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
}
