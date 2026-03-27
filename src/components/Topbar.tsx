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

interface Result {
  type: string
  label: string
  sub: string
  page: Page
  amount?: number
}

const COLORS: Record<string, string> = {
  voucher: 'var(--accent)',
  product: '#3d8bff',
  customer: '#d4a032',
  account: '#00e5a0',
  report: '#f7a6ad',
}

const LABELS: Record<string, string> = {
  voucher: 'TXN', product: 'ITEM', customer: 'CUST', account: 'ACCT', report: 'PAGE',
}

const PAGES: { name: string; page: Page; desc: string }[] = [
  { name: 'Sales Day Book', page: 'sales-day-book', desc: 'Daily sales summary' },
  { name: 'Sales Register', page: 'sales-register', desc: 'All sales transactions' },
  { name: 'Purchase Register', page: 'purchase-register', desc: 'All purchase transactions' },
  { name: 'Payment Register', page: 'payment-register', desc: 'All payments made' },
  { name: 'Stock Transfer Register', page: 'stock-transfer-register', desc: 'All stock movements' },
  { name: 'P&L Report', page: 'pl-report', desc: 'Profit and loss statement' },
  { name: 'Balance Sheet', page: 'balance-sheet', desc: 'Assets and liabilities' },
  { name: 'Trial Balance', page: 'trial-balance', desc: 'Account balances' },
  { name: 'VAT Report', page: 'vat-report', desc: 'VAT collected and paid' },
  { name: 'Chart of Accounts', page: 'chart-of-accounts', desc: 'All GL accounts' },
  { name: 'Customers', page: 'customers', desc: 'Customer accounts and ledgers' },
  { name: 'Inventory', page: 'inventory', desc: 'Stock levels and movements' },
  { name: 'Banks', page: 'banks', desc: 'Bank accounts and balances' },
  { name: 'Settings', page: 'settings', desc: 'System configuration' },
  { name: 'Cash Sale', page: 'cash-sale', desc: 'Point of sale — counter sales' },
  { name: 'Sales Invoice', page: 'sales-invoice', desc: 'Credit sales to debtors' },
  { name: 'Stock Transfer', page: 'stock-transfer', desc: 'Move stock between locations' },
  { name: 'Stock Adjustment', page: 'stock-adjustment', desc: 'Correct stock quantities' },
  { name: 'GRN', page: 'grn', desc: 'Receive goods from suppliers' },
  { name: 'Purchase Invoice', page: 'purchase-invoice', desc: 'Supplier bill entry' },
  { name: 'Journal Entry', page: 'journal-entry', desc: 'Manual journal posting' },
]

export default function Topbar({ breadcrumb, onNav, currentPage, onBack, canGoBack }: TopbarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => { setOpen(false); setQuery('') }, [currentPage])

  const handleInput = (val: string) => {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.trim().length < 2) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => { go(val.trim()) }, 300)
  }

  const go = (q: string) => {
    setLoading(true)
    const all: Result[] = []
    const ql = q.toLowerCase()
    let n = 4

    const fin = () => { n--; if (n === 0) { setResults([...all]); setOpen(all.length > 0); setLoading(false) } }

    // Static pages
    PAGES.forEach(p => {
      if (p.name.toLowerCase().includes(ql) || p.desc.toLowerCase().includes(ql))
        all.push({ type: 'report', label: p.name, sub: p.desc, page: p.page })
    })

    supabase.from('vouchers')
      .select('ref, type, description, total_amount, posting_date')
      .or(\`ref.ilike.%\${q}%,description.ilike.%\${q}%,type.ilike.%\${q}%\`)
      .order('posting_date', { ascending: false }).limit(6)
      .then(({ data }) => {
        if (data) data.forEach(v => all.push({
          type: 'voucher', label: v.ref,
          sub: \`\${v.description || v.type} · \${v.posting_date}\`,
          page: 'vouchers' as Page, amount: v.total_amount || undefined,
        }))
        fin()
      }).catch(() => fin())

    supabase.from('products')
      .select('name, sku, qty_on_hand, selling_price')
      .or(\`name.ilike.%\${q}%,sku.ilike.%\${q}%\`)
      .eq('is_active', true).limit(5)
      .then(({ data }) => {
        if (data) data.forEach(p => all.push({
          type: 'product', label: p.name,
          sub: \`\${p.sku || ''} · Stock: \${p.qty_on_hand} · TZS \${(p.selling_price || 0).toLocaleString()}\`,
          page: 'inventory' as Page,
        }))
        fin()
      }).catch(() => fin())

    supabase.from('customers')
      .select('name, company, contact_person, customer_number, customer_type, whatsapp, balance')
      .or(\`name.ilike.%\${q}%,company.ilike.%\${q}%,whatsapp.ilike.%\${q}%,customer_number.ilike.%\${q}%,contact_person.ilike.%\${q}%\`)
      .eq('is_active', true).limit(5)
      .then(({ data }) => {
        if (data) data.forEach(c => {
          const bal: number = c.balance || 0
          all.push({
            type: 'customer', label: c.company || c.name,
            sub: \`\${c.customer_number || ''} · \${c.customer_type === 'debtor' ? 'Debtor' : 'Cash'}  \${c.whatsapp ? '· ' + c.whatsapp : ''}  \${c.contact_person ? '· ' + c.contact_person : ''}\`.trim(),
            page: 'customers' as Page, amount: bal > 0 ? bal : undefined,
          })
        })
        fin()
      }).catch(() => fin())

    supabase.from('accounts')
      .select('code, name, type, balance')
      .or(\`name.ilike.%\${q}%,code.ilike.%\${q}%\`)
      .eq('is_active', true).limit(5)
      .then(({ data }) => {
        if (data) data.forEach(a => {
          const bal: number = a.balance || 0
          all.push({
            type: 'account', label: \`\${a.code} — \${a.name}\`,
            sub: a.type, page: 'chart-of-accounts' as Page,
            amount: bal > 0 ? bal : undefined,
          })
        })
        fin()
      }).catch(() => fin())
  }

  const pick = (r: Result) => { onNav(r.page); setOpen(false); setQuery('') }

  return (
    <div style={{
      height: 'var(--topbar)', background: 'var(--surface)',
      borderBottom: '1px solid var(--border)', display: 'flex',
      alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div onClick={() => onNav('dashboard')} style={{
          width: 28, height: 28, background: 'var(--accent)', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}>
          <svg width="15" height="15" viewBox="0 0 22 22" fill="white">
            <circle cx="11" cy="7.5" r="4.5"/>
            <path d="M2 20c0-5 4-9 9-9s9 4 9 9"/>
          </svg>
        </div>
        <div onClick={() => onNav('dashboard')} style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 800, color: 'var(--text)', cursor: 'pointer', flexShrink: 0 }}>
          Malkia<span style={{ color: 'var(--accent)' }}>OS</span>
        </div>
      </div>

      {canGoBack && onBack && (
        <button onClick={onBack} style={{
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text3)', fontSize: 11,
        }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
      )}

      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
        Wellness Group <span style={{ opacity: .4 }}>›</span>{' '}
        <span style={{ color: 'var(--text2)' }}>{breadcrumb}</span>
      </div>

      <div ref={boxRef} style={{ flex: 1, maxWidth: 480, position: 'relative' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          width="13" height="13" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input value={query} onChange={e => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search everything — vouchers, products, customers, pages…"
          style={{
            width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '7px 10px 7px 30px', color: 'var(--text)',
            fontSize: 12, outline: 'none',
          }}
        />
        {loading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text3)' }}>…</span>}

        {open && results.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 10,
            zIndex: 9999, boxShadow: '0 16px 48px rgba(0,0,0,.6)', maxHeight: 440, overflowY: 'auto',
          }}>
            {(['report', 'voucher', 'product', 'customer', 'account'] as const).map(type => {
              const group = results.filter(r => r.type === type)
              if (!group.length) return null
              const color = COLORS[type]
              return (
                <div key={type}>
                  <div style={{ padding: '5px 12px', fontSize: 9, fontFamily: 'var(--mono)', color, textTransform: 'uppercase', letterSpacing: 1, background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ background: color, color: '#000', borderRadius: 3, padding: '1px 5px', fontWeight: 800 }}>{LABELS[type]}</span>
                    {type === 'report' ? 'Pages & Reports' : type === 'voucher' ? 'Transactions' : type === 'product' ? 'Products' : type === 'customer' ? 'Customers' : 'GL Accounts'}
                  </div>
                  {group.map((r, i) => (
                    <div key={i} onClick={() => pick(r)} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{r.sub}</div>
                      </div>
                      {r.amount !== undefined && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color, marginLeft: 10, flexShrink: 0 }}>{r.amount.toLocaleString()}</div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text3)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>Click to navigate</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
        <span style={{ background: 'var(--yellow-dim)', border: '1px solid var(--yellow)', borderRadius: 6, padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--yellow)' }}>FY 2025–26</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
          <div style={{ width: 24, height: 24, background: 'linear-gradient(135deg,var(--accent),#e05c3a)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 10, fontWeight: 700, color: '#fff' }}>JG</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>Joe Gembe</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Super Admin</div>
          </div>
        </div>
      </div>
    </div>
  )
}
