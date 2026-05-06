import { useState, useEffect, useRef } from 'react'
import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { supabase } from '../lib/supabase'

interface Props {
  breadcrumb: string
  onNav: (p: Page) => void
  onBack: () => void
  canGoBack: boolean
}

// Pages that can be searched
const SEARCHABLE_PAGES: { page: Page; label: string; keywords: string }[] = [
  { page: 'dashboard', label: 'Dashboard', keywords: 'home overview stats' },
  { page: 'cash-sale', label: 'New Cash Sale', keywords: 'sell pos point of sale' },
  { page: 'sales-day-book', label: 'Sales Day Book', keywords: 'sales register transactions' },
  { page: 'inventory', label: 'Inventory', keywords: 'stock products items' },
  { page: 'customers', label: 'Customers', keywords: 'clients contacts' },
  { page: 'chart-of-accounts', label: 'Chart of Accounts', keywords: 'ledger accounts coa' },
  { page: 'vouchers', label: 'Vouchers Hub', keywords: 'receipts payments' },
  { page: 'reports', label: 'Reports Hub', keywords: 'analytics' },
  { page: 'pnl', label: 'Profit & Loss', keywords: 'income statement' },
  { page: 'balance-sheet', label: 'Balance Sheet', keywords: 'assets liabilities' },
  { page: 'trial-balance', label: 'Trial Balance', keywords: 'tb' },
  { page: 'banks', label: 'Banks & Accounts', keywords: 'bank accounts' },
  { page: 'settings', label: 'Settings', keywords: 'config preferences' },
  { page: 'petty-cash', label: 'Petty Cash', keywords: 'expenses' },
  { page: 'cash-payment', label: 'Payment Voucher', keywords: 'pay expense cash bank' },
  { page: 'cash-receipt', label: 'Cash Receipt', keywords: 'receive money' },
  { page: 'credit-note', label: 'Credit Note', keywords: 'refund return' },
  { page: 'opening-stock', label: 'Opening Stock', keywords: 'initial inventory' },
  { page: 'stock-adjustment', label: 'Stock Adjustment', keywords: 'adjust inventory' },
  { page: 'users', label: 'User Management', keywords: 'team staff employees' },
  { page: 'crm-hub', label: 'CRM Hub', keywords: 'customer relations' },
]

interface SearchResult {
  type: 'page' | 'voucher' | 'product' | 'customer'
  id: string
  title: string
  subtitle: string
  page?: Page
}

export default function Topbar({ breadcrumb, onNav, onBack, canGoBack }: Props) {
  const { user, signOut } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut: Cmd+K or Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Search when query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setShowResults(false)
      return
    }

    const search = async () => {
      setLoading(true)
      const q = query.toLowerCase()
      const allResults: SearchResult[] = []

      // Search pages
      const matchedPages = SEARCHABLE_PAGES.filter(p => 
        p.label.toLowerCase().includes(q) || p.keywords.toLowerCase().includes(q)
      ).slice(0, 3)
      
      matchedPages.forEach(p => {
        allResults.push({ type: 'page', id: p.page, title: p.label, subtitle: 'Page', page: p.page })
      })

      // Search vouchers
      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('id, ref, type, total_amount, posting_date')
        .or(`ref.ilike.%${q}%,description.ilike.%${q}%`)
        .order('posting_date', { ascending: false })
        .limit(4)
      
      vouchers?.forEach(v => {
        allResults.push({
          type: 'voucher',
          id: v.id,
          title: v.ref,
          subtitle: `${v.type} · TZS ${(v.total_amount || 0).toLocaleString()} · ${v.posting_date}`,
        })
      })

      // Search products
      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, selling_price, qty_on_hand')
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(4)
      
      products?.forEach(p => {
        allResults.push({
          type: 'product',
          id: p.id,
          title: p.name,
          subtitle: `${p.sku} · TZS ${(p.selling_price || 0).toLocaleString()} · Stock: ${p.qty_on_hand || 0}`,
        })
      })

      // Search customers
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, whatsapp, crown_points')
        .or(`name.ilike.%${q}%,whatsapp.ilike.%${q}%`)
        .limit(4)
      
      customers?.forEach(c => {
        allResults.push({
          type: 'customer',
          id: c.id,
          title: c.name,
          subtitle: `${c.whatsapp || 'No phone'} · ${c.crown_points || 0} Crown pts`,
        })
      })

      setResults(allResults)
      setShowResults(true)
      setSelectedIndex(0)
      setLoading(false)
    }

    const debounce = setTimeout(search, 200)
    return () => clearTimeout(debounce)
  }, [query])

  const handleSelect = (result: SearchResult) => {
    setQuery('')
    setShowResults(false)
    
    if (result.type === 'page' && result.page) {
      onNav(result.page)
    } else if (result.type === 'voucher') {
      // Navigate to sales day book (could enhance to go to specific voucher)
      onNav('sales-day-book')
    } else if (result.type === 'product') {
      onNav('inventory')
    } else if (result.type === 'customer') {
      onNav('customers')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setShowResults(false)
    }
  }

  const handleLogout = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await signOut()
    }
  }

  const typeIconPath: Record<string, string> = {
    page: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
    voucher: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    product: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    customer: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  }
  const getTypeIcon = (type: string) => {
    const d = typeIconPath[type] || 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35'
    return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={d}/></svg>
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
        <div ref={searchRef} style={{ position: 'relative' }}>
          <div style={styles.search}>
            <svg width="16" height="16" fill="none" stroke="var(--text3)" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <input 
              ref={inputRef}
              type="text" 
              placeholder="Search everything... ⌘K"
              style={styles.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => query && setShowResults(true)}
              onKeyDown={handleKeyDown}
            />
            {loading && <span style={{ fontSize: 10, color: 'var(--text3)' }}>...</span>}
          </div>

          {/* Search Results Dropdown */}
          {showResults && results.length > 0 && (
            <div style={styles.dropdown}>
              {results.map((r, i) => (
                <div 
                  key={`${r.type}-${r.id}`}
                  style={{
                    ...styles.resultItem,
                    background: i === selectedIndex ? 'var(--surface2)' : 'transparent',
                  }}
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span style={styles.resultIcon}>{getTypeIcon(r.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.resultTitle}>{r.title}</div>
                    <div style={styles.resultSub}>{r.subtitle}</div>
                  </div>
                  <span style={styles.resultType}>{r.type}</span>
                </div>
              ))}
            </div>
          )}

          {showResults && query && results.length === 0 && !loading && (
            <div style={styles.dropdown}>
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                No results for "{query}"
              </div>
            </div>
          )}
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
    color: 'var(--text3)',
    fontSize: 12,
    cursor: 'pointer',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    minWidth: 0,
  },
  company: {
    color: 'var(--text3)',
    whiteSpace: 'nowrap',
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
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    zIndex: 1000,
    maxHeight: 400,
    overflowY: 'auto',
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
  },
  resultIcon: {
    fontSize: 16,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultSub: {
    fontSize: 11,
    color: 'var(--text3)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultType: {
    fontSize: 9,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    fontFamily: 'DM Mono, monospace',
    padding: '2px 6px',
    background: 'var(--surface2)',
    borderRadius: 4,
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
