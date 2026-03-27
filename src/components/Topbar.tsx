import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Page } from '../lib/types'

interface TopbarProps {
  breadcrumb: string
  onNav: (p: Page) => void
  currentPage?: Page
  onBack?: () => void
  canGoBack?: boolean
}

interface SearchResult {
  type: 'voucher' | 'product' | 'customer' | 'account'
  ref?: string
  name: string
  sub?: string
  page: Page
  amount?: number
}

const TYPE_COLOR: Record<string, string> = {
  voucher: 'var(--accent)', product: 'var(--blue)',
  customer: 'var(--yellow)', account: 'var(--green)'
}
const TYPE_LABEL: Record<string, string> = {
  voucher: 'TXN', product: 'ITEM', customer: 'CUST', account: 'ACCT'
}

export default function Topbar({ breadcrumb, onNav, currentPage }: TopbarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on page change
  useEffect(() => { setShowDrop(false); setQuery('') }, [currentPage])

  const search = async (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 2) { setResults([]); setShowDrop(false); return }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const q = val.trim()
      const all: SearchResult[] = []

      // 1. Vouchers — search by ref and description
      const { data: vouchers } = await supabase.from('vouchers')
        .select('ref, type, description, total_amount, status')
        .or(`ref.ilike.%${q}%,description.ilike.%${q}%`)
        .eq('status', 'posted')
        .order('posting_date', { ascending: false })
        .limit(5)
      if (vouchers) vouchers.forEach(v => all.push({
        type: 'voucher', ref: v.ref, name: v.ref,
        sub: v.description || v.type, page: 'vouchers' as Page,
        amount: v.total_amount
      }))

      // 2. Products — search by name and SKU
      const { data: products } = await supabase.from('products')
        .select('id, name, sku, qty_on_hand, selling_price')
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .eq('is_active', true).limit(4)
      if (products) products.forEach(p => all.push({
        type: 'product', name: p.name,
        sub: `${p.sku} · Stock: ${p.qty_on_hand} · TZS ${p.selling_price?.toLocaleString()}`,
        page: 'inventory' as Page
      }))

      // 3. Customers — search by name, company, whatsapp, customer_number
      const { data: customers } = await supabase.from('customers')
        .select('name, company, customer_number, customer_type, whatsapp')
        .or(`name.ilike.%${q}%,company.ilike.%${q}%,customer_number.ilike.%${q}%,whatsapp.ilike.%${q}%`)
        .eq('is_active', true).limit(4)
      if (customers) customers.forEach(c => all.push({
        type: 'customer',
        name: c.company || c.name,
        sub: `${c.customer_number || ''} · ${c.customer_type === 'debtor' ? 'Debtor' : 'Cash Contact'}${c.whatsapp ? ' · ' + c.whatsapp : ''}`,
        page: 'customers' as Page
      }))

      // 4. Accounts — search by code and name
      const { data: accounts } = await supabase.from('accounts')
        .select('code, name, type, balance')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
        .eq('is_active', true).limit(4)
      if (accounts) accounts.forEach(a => all.push({
        type: 'account', ref: a.code, name: a.name,
        sub: `${a.code} · ${a.type}`,
        page: 'chart-of-accounts' as Page, amount: a.balance
      }))

      setResults(all)
      setShowDrop(all.length > 0)
      setSearching(false)
    }, 280)
  }

  const select = (r: SearchResult) => {
    onNav(r.page)
    setShowDrop(false)
    setQuery('')
  }

  return (
    <div style={{
      height: 'var(--topbar)', background: 'var(--surface)',
      borderBottom: '1px solid var(--border)', display: 'flex',
      alignItems: 'center', padding: '0 16px', gap: 14, flexShrink: 0
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
        <div onClick={() => onNav('dashboard')} style={{
          width: 30, height: 30, background: 'var(--accent)', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}>
          <svg width="16" height="16" viewBox="0 0 22 22" fill="white">
            <circle cx="11" cy="7.5" r="4.5" />
            <path d="M2 20c0-5 4-9 9-9s9 4 9 9" />
          </svg>
        </div>
        <div onClick={() => onNav('dashboard')} style={{
          fontFamily: 'var(--display)', fontSize: 16, fontWeight: 800,
          color: 'var(--text)', cursor: 'pointer'
        }}>
          Malkia<span style={{ color: 'var(--accent)' }}>OS</span>
        </div>
      </div>

      {/* Back button */}
      {canGoBack && onBack && (
        <button onClick={onBack} style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text3)',
          fontSize: 12, flexShrink: 0, transition: 'all .15s'
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
      )}

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        Wellness Group <span style={{ opacity: .4 }}>›</span>{' '}
        <span style={{ color: 'var(--text2)' }}>{breadcrumb}</span>
      </div>

      {/* Global Search */}
      <div ref={searchRef} style={{ flex: 1, maxWidth: 420, margin: '0 auto', position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text3)', pointerEvents: 'none', display: 'flex', alignItems: 'center'
        }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </span>
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length > 0 && setShowDrop(true)}
          placeholder="Search vouchers, products, customers, accounts…"
          style={{
            width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', padding: '7px 36px 7px 32px',
            color: 'var(--text)', fontSize: 12, outline: 'none',
            transition: 'border-color .15s'
          }}
          onFocusCapture={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
          onBlurCapture={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
        />
        {searching && (
          <span style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)'
          }}>…</span>
        )}

        {/* Results dropdown */}
        {showDrop && results.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--accent)',
            borderRadius: 10, zIndex: 9999, boxShadow: '0 12px 40px rgba(0,0,0,.5)',
            overflow: 'hidden', maxHeight: 400, overflowY: 'auto'
          }}>
            {/* Group by type */}
            {(['voucher', 'product', 'customer', 'account'] as const).map(type => {
              const group = results.filter(r => r.type === type)
              if (group.length === 0) return null
              return (
                <div key={type}>
                  <div style={{
                    padding: '6px 12px 4px', fontSize: 9, fontFamily: 'var(--mono)',
                    color: TYPE_COLOR[type], textTransform: 'uppercase', letterSpacing: 1,
                    background: 'var(--surface2)', borderBottom: '1px solid var(--border)'
                  }}>{TYPE_LABEL[type]} — {type === 'voucher' ? 'Transactions' : type === 'product' ? 'Products' : type === 'customer' ? 'Customers' : 'Accounts'}</div>
                  {group.map((r, i) => (
                    <div key={i} onClick={() => select(r)}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', display: 'flex',
                        justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: '1px solid var(--border)', transition: 'background .1s'
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                          {r.ref && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: TYPE_COLOR[type], marginRight: 8 }}>{r.ref}</span>}
                          {r.name}
                        </div>
                        {r.sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{r.sub}</div>}
                      </div>
                      {r.amount !== undefined && r.amount > 0 && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginLeft: 12 }}>
                          {r.amount.toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            <div style={{ padding: '7px 12px', fontSize: 10, color: 'var(--text3)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>ESC to close</span>
            </div>
          </div>
        )}
      </div>

      {/* Right section */}
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
