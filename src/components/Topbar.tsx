import { useState, useEffect, useRef } from 'react'
import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { supabase } from '../lib/supabase'
import { matchPages } from '../lib/pageDirectory'

interface Props {
  breadcrumb: string
  onNav: (p: Page) => void
  onBack: () => void
  canGoBack: boolean
}

// Where each voucher type opens when picked from search.
const VOUCHER_PAGE: Record<string, Page> = {
  cash_sale: 'sales-day-book', sales_invoice: 'sales-day-book', sales_return: 'sales-day-book',
  stock_transfer: 'stock-transfer-register',
  grn: 'purchase-register', purchase: 'purchase-register', purchase_invoice: 'purchase-register', purchase_return: 'purchase-register',
  cash_payment: 'payment-register', payment: 'payment-register',
  cash_receipt: 'payment-register', bank_receipt: 'payment-register',
}

interface SearchResult {
  type: 'page' | 'voucher' | 'product' | 'customer'
  id: string
  title: string
  subtitle: string
  page?: Page
  icon?: string
}

// ── Recent jumps ────────────────────────────────────────────────────────────
// The last few things opened THROUGH search, per browser. Shown when the box
// is focused before typing, so the second visit to anything is one keystroke.
const RECENT_KEY = 'malkia.search.recent'
const loadRecents = (): SearchResult[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
const pushRecent = (r: SearchResult) => {
  try {
    const list = [r, ...loadRecents().filter(x => !(x.type === r.type && x.id === r.id))].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch { /* private mode */ }
}

// Section metadata: order, heading, and tint per result type.
const SECTION: Record<SearchResult['type'], { order: number; label: string; tint: string }> = {
  page:     { order: 0, label: 'Pages',     tint: 'var(--accent)' },
  voucher:  { order: 1, label: 'Vouchers',  tint: 'var(--blue)' },
  product:  { order: 2, label: 'Products',  tint: 'var(--green)' },
  customer: { order: 3, label: 'Customers', tint: 'var(--yellow)' },
}

// Title with the matched fragment struck in the accent colour.
function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<span style={{ color: 'var(--accent)' }}>{text.slice(i, i + q.length)}</span>{text.slice(i + q.length)}</>
}

export default function Topbar({ breadcrumb, onNav, onBack, canGoBack }: Props) {
  const { user, signOut } = useAuth()
  const [showPwd, setShowPwd] = useState(false)
  const [curPwd, setCurPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confPwd, setConfPwd] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const changePassword = async () => {
    setPwdMsg(null)
    if (!newPwd || newPwd.length < 8) { setPwdMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return }
    if (newPwd !== confPwd) { setPwdMsg({ ok: false, text: 'New passwords do not match.' }); return }
    setPwdBusy(true)
    // Confirm identity by re-checking the current password, then update it.
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email
    if (!email) { setPwdBusy(false); setPwdMsg({ ok: false, text: 'Could not read your session — log in again.' }); return }
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: curPwd })
    if (signInErr) { setPwdBusy(false); setPwdMsg({ ok: false, text: 'Current password is incorrect.' }); return }
    const { error: updErr } = await supabase.auth.updateUser({ password: newPwd })
    setPwdBusy(false)
    if (updErr) { setPwdMsg({ ok: false, text: 'Failed: ' + updErr.message }); return }
    setPwdMsg({ ok: true, text: 'Password changed. Use the new one next time you log in.' })
    setCurPwd(''); setNewPwd(''); setConfPwd('')
  }
  const pwdInput = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14 }

  const [logins, setLogins] = useState<{ logged_in_at: string; user_agent: string | null }[]>([])
  const loadLogins = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email
    if (!email) { setLogins([]); return }
    const { data } = await supabase.from('login_events')
      .select('logged_in_at, user_agent')
      .ilike('user_email', email)
      .order('logged_in_at', { ascending: false }).limit(8)
    setLogins(data || [])
  }
  const deviceOf = (ua: string | null): string => {
    if (!ua) return 'Unknown device'
    const b = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser'
    const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
    return os ? `${b} · ${os}` : b
  }
  const fmtLogin = (s: string): string => { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
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

      // Sanitize for PostgREST .or(): commas, parentheses and * break the
      // filter string and would otherwise silently kill a whole result type.
      const safe = q.replace(/[,()*]/g, ' ').trim()
      const isStock = user?.workspace_role === 'stock'

      // Pages — the full app directory, not a hand-picked subset.
      matchPages(q, 6).forEach(p => {
        allResults.push({ type: 'page', id: p.page, title: p.label, subtitle: p.module, page: p.page, icon: p.icon })
      })

      if (safe) {
        // Products (active only). Money hidden for money-blind stock users.
        try {
          const { data: products } = await supabase
            .from('products')
            .select('id, name, sku, selling_price, qty_on_hand, category')
            .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,category.ilike.%${safe}%`)
            .eq('is_active', true)
            .limit(5)
          products?.forEach(p => {
            allResults.push({
              type: 'product',
              id: p.id,
              title: p.name,
              subtitle: isStock
                ? `${p.sku || ''} · Stock: ${p.qty_on_hand || 0}`
                : `${p.sku || ''} · TZS ${(p.selling_price || 0).toLocaleString()} · Stock: ${p.qty_on_hand || 0}`,
            })
          })
        } catch { /* keep other result types alive */ }

        // Vouchers and customers carry money / PII — skip for stock users.
        if (!isStock) {
          try {
            const { data: vouchers } = await supabase
              .from('vouchers')
              .select('id, ref, type, total_amount, posting_date')
              .or(`ref.ilike.%${safe}%,description.ilike.%${safe}%,type.ilike.%${safe}%`)
              .order('posting_date', { ascending: false })
              .limit(5)
            vouchers?.forEach(v => {
              allResults.push({
                type: 'voucher',
                id: v.id,
                title: v.ref,
                subtitle: `${v.type} · TZS ${(v.total_amount || 0).toLocaleString()} · ${v.posting_date}`,
                page: VOUCHER_PAGE[v.type] || 'sales-day-book',
              })
            })
          } catch { /* ignore */ }

          try {
            const { data: customers } = await supabase
              .from('customers')
              .select('id, name, whatsapp, phone, customer_number, code, crown_points')
              .or(`name.ilike.%${safe}%,whatsapp.ilike.%${safe}%,phone.ilike.%${safe}%,customer_number.ilike.%${safe}%,code.ilike.%${safe}%,email.ilike.%${safe}%`)
              .limit(5)
            customers?.forEach(c => {
              allResults.push({
                type: 'customer',
                id: c.id,
                title: c.name,
                subtitle: `${c.whatsapp || c.phone || 'No phone'} · ${c.crown_points || 0} Crown pts`,
              })
            })
          } catch { /* ignore */ }
        }
      }

      allResults.sort((a, b) => SECTION[a.type].order - SECTION[b.type].order)
      setResults(allResults)
      setShowResults(true)
      setSelectedIndex(0)
      setLoading(false)
    }

    const debounce = setTimeout(search, 200)
    return () => clearTimeout(debounce)
  }, [query])

  // Empty box + focus = recent jumps, so returning to anything is instant.
  const showRecents = () => {
    if (query.trim()) return
    const rec = loadRecents()
    if (rec.length) { setResults(rec); setShowResults(true); setSelectedIndex(0) }
  }

  const handleSelect = (result: SearchResult) => {
    pushRecent(result)
    setQuery('')
    setShowResults(false)
    
    if (result.type === 'page' && result.page) {
      onNav(result.page)
    } else if (result.type === 'voucher') {
      onNav(result.page || 'sales-day-book')
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
  const getTypeIcon = (r: { type: string; icon?: string }) => {
    const d = r.icon || typeIconPath[r.type] || 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35'
    return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={d}/></svg>
  }

  return (
    <div style={styles.topbar} className="app-topbar">
      <div style={styles.left}>
        <div style={styles.logo} onClick={() => onNav('dashboard')}>
          {/* Malkia mother-and-child mark, black per brand direction.
              Traced from the designer's artwork; same drawing as the favicon
              (which runs white on a black disc for tab contrast). */}
          <svg width="28" height="28" viewBox="0 0 501 501" fill="#0d0d0d" aria-label="Malkia">
            <g transform="translate(0.000000,501.000000) scale(0.100000,-0.100000)"><path d="M2720 4100 c-336 -72 -585 -268 -795 -625 -140 -238 -269 -585 -322 -870 -31 -168 -26 -581 8 -621 14 -18 49 -5 54 20 2 11 7 74 10 140 15 291 101 487 304 686 155 153 325 264 690 455 258 134 345 185 472 275 143 102 186 158 196 256 11 101 -28 188 -105 239 -93 61 -337 83 -512 45z M3210 3477 c-264 -154 -360 -208 -500 -282 -198 -104 -269 -148 -410 -253 -261 -196 -467 -449 -526 -647 -19 -64 -25 -246 -10 -319 l7 -39 39 64 c137 228 422 405 686 425 101 7 233 -7 325 -35 69 -22 73 -17 38 58 -23 51 -58 96 -181 232 -47 53 -98 113 -112 133 -97 143 25 313 201 277 222 -44 416 42 498 221 34 75 54 195 35 211 -3 2 -43 -18 -90 -46z M2431 2330 c-210 -45 -416 -183 -534 -358 -75 -111 -109 -259 -89 -392 49 -336 368 -604 804 -675 109 -18 295 -20 370 -4 72 15 164 60 220 109 43 37 108 123 108 142 0 4 -30 -7 -67 -26 -150 -76 -288 -102 -482 -93 -420 21 -757 251 -813 555 -24 129 23 268 128 381 145 157 336 241 519 227 166 -12 304 -68 408 -166 76 -70 111 -78 147 -33 31 40 19 69 -60 144 -80 77 -194 138 -317 170 -89 23 -274 33 -342 19z M2443 2096 c-73 -18 -174 -72 -247 -132 -114 -94 -175 -219 -162 -336 31 -299 404 -525 835 -505 260 12 454 111 527 269 26 57 29 73 28 158 -1 76 -7 110 -29 170 -28 78 -99 203 -133 233 -18 17 -20 17 -36 -8 -37 -56 -122 -81 -190 -56 -13 6 -50 35 -81 66 -120 120 -343 182 -512 141z m430 -329 c12 -13 27 -32 33 -43 11 -18 12 -18 25 9 26 58 104 75 138 31 33 -41 26 -84 -28 -192 -26 -53 -59 -126 -71 -162 -13 -36 -27 -69 -31 -74 -19 -21 -94 79 -137 181 -48 112 -48 218 -1 256 28 23 46 22 72 -6z"/></g>
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

        <div style={styles.breadcrumb} className="tb-breadcrumb">
          <span style={styles.company} className="tb-company">Wellness Group</span>
          <span style={styles.separator}>›</span>
          <span style={styles.page}>{breadcrumb}</span>
        </div>
      </div>

      <div style={styles.center} className="tb-search">
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
              onFocus={() => { if (query) setShowResults(true); else showRecents() }}
              onKeyDown={handleKeyDown}
            />
            {loading && <span style={{ fontSize: 10, color: 'var(--text3)' }}>...</span>}
          </div>

          {/* Search Results Dropdown */}
          {showResults && results.length > 0 && (
            <div style={styles.dropdown}>
              {!query.trim() && (
                <div style={styles.sectionHead}>
                  <span style={{ color: 'var(--text3)' }}>Recent</span>
                </div>
              )}
              {results.map((r, i) => {
                const sec = SECTION[r.type]
                const firstOfSection = query.trim() !== '' && (i === 0 || results[i - 1].type !== r.type)
                return (
                  <div key={`${r.type}-${r.id}`}>
                    {firstOfSection && (
                      <div style={styles.sectionHead}>
                        <span style={{ color: sec.tint }}>{sec.label}</span>
                        <span style={styles.sectionRule} />
                      </div>
                    )}
                    <div
                      style={{
                        ...styles.resultItem,
                        background: i === selectedIndex ? 'var(--surface2)' : 'transparent',
                        borderLeft: `2px solid ${i === selectedIndex ? sec.tint : 'transparent'}`,
                      }}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIndex(i)}
                    >
                      <span style={{ ...styles.resultIcon, color: sec.tint }}>{getTypeIcon(r)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.resultTitle}><Highlight text={r.title} q={query.trim()} /></div>
                        <div style={styles.resultSub}>{r.subtitle}</div>
                      </div>
                      {i === selectedIndex && (
                        <svg width="12" height="12" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                      )}
                    </div>
                  </div>
                )
              })}
              <div style={styles.hintBar}>
                <span><b style={styles.kbd}>↑↓</b> navigate</span>
                <span><b style={styles.kbd}>Enter</b> open</span>
                <span><b style={styles.kbd}>Esc</b> close</span>
              </div>
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

      <div style={styles.right} className="tb-right">
        <div style={styles.fyBadge} className="tb-fy">FY 2025-26</div>
        
        <div style={styles.userSection}>
          <div style={styles.avatar}>
            {user?.initials || 'U'}
          </div>
          <div style={styles.userInfo} className="tb-userinfo">
            <div style={styles.userName}>{user?.full_name || 'User'}</div>
            <div style={styles.userRole}>
              {user?.is_approver ? 'Approver' : 'Team Member'}
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={() => { setShowPwd(true); setPwdMsg(null); setCurPwd(''); setNewPwd(''); setConfPwd(''); loadLogins() }} title="My account">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>
          <button style={styles.logoutBtn} onClick={handleLogout} title="Sign out">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {showPwd && (
        <div onClick={() => setShowPwd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 380, maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>My Account</div>
              <button onClick={() => setShowPwd(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>Recent sign-ins</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>If you see a sign-in you don't recognise, change your password below.</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {logins.length === 0
                  ? <div style={{ padding: 10, fontSize: 12, color: 'var(--text3)' }}>No sign-in history yet.</div>
                  : logins.map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontSize: 12, borderTop: i ? '1px solid var(--border)' : 'none', background: i === 0 ? 'var(--surface2)' : 'transparent' }}>
                      <span style={{ color: 'var(--text)' }}>{fmtLogin(l.logged_in_at)}{i === 0 ? '  (most recent)' : ''}</span>
                      <span style={{ color: 'var(--text3)' }}>{deviceOf(l.user_agent)}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>Change password</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} placeholder="Current password" style={pwdInput} />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password (min 8 characters)" style={pwdInput} />
              <input type="password" value={confPwd} onChange={e => setConfPwd(e.target.value)} placeholder="Confirm new password" style={pwdInput}
                onKeyDown={e => e.key === 'Enter' && changePassword()} />
              {pwdMsg && <div style={{ fontSize: 12, color: pwdMsg.ok ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}>{pwdMsg.text}</div>}
              <button onClick={changePassword} disabled={pwdBusy}
                style={{ padding: '10px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                {pwdBusy ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
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
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, flexShrink: 0,
    background: 'var(--surface2)', borderRadius: 6,
  },
  sectionHead: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px 4px',
    fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: 1.5,
  },
  sectionRule: { flex: 1, height: 1, background: 'var(--border)' },
  hintBar: {
    display: 'flex', gap: 14, justifyContent: 'flex-end',
    padding: '7px 12px', borderTop: '1px solid var(--border)',
    fontSize: 10, color: 'var(--text3)', position: 'sticky' as const, bottom: 0,
    background: 'var(--surface)',
  },
  kbd: {
    fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 9,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '1px 5px', marginRight: 3,
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
