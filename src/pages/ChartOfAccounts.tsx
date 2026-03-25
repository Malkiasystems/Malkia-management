import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Account {
  id: string; code: string; name: string; type: string;
  category: string; balance: number; is_active: boolean
}

const TYPE_COLOR: Record<string, string> = {
  asset: 'pill-blue', liability: 'pill-red', equity: 'pill-gray',
  revenue: 'pill-green', cogs: 'pill-amber', expense: 'pill-amber', other: 'pill-gray'
}

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAccounts() }, [])

  const loadAccounts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name, type, category, balance, is_active')
      .order('code')
    if (data) setAccounts(data)
    setLoading(false)
  }

  const filtered = accounts.filter(a =>
    (filter === 'all' || a.type === filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.code.includes(search))
  ).filter(a => a.type !== 'heading' && a.type !== 'end_total' && a.type !== 'begin_total')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Chart of Accounts</div>
          <div className="page-sub">Live balances from Supabase · {accounts.length} accounts · <span className="sync-dot"></span></div>
        </div>
        <div className="page-actions">
          <input className="form-input" style={{ width: 200, padding: '6px 10px', fontSize: 12 }} placeholder=" Search accounts…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={loadAccounts} style={ display:"flex",alignItems:"center",gap:6 }><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh</button>
          <button className="btn btn-primary btn-sm">+ New Account</button>
        </div>
      </div>

      <div className="tabs">
        {['all', 'asset', 'liability', 'equity', 'revenue', 'cogs', 'expense', 'other'].map(t => (
          <button key={t} className={`tab ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading accounts…</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Code</th><th>Account Name</th><th>Type</th><th>Category</th><th className="td-right">Balance (TZS)</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={i}>
                  <td className="td-mono td-amber">{a.code}</td>
                  <td className="td-bold">{a.name}</td>
                  <td><span className={`pill ${TYPE_COLOR[a.type] || 'pill-gray'}`}>{a.type.charAt(0).toUpperCase() + a.type.slice(1)}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{a.category}</td>
                  <td className={`td-right td-mono ${a.balance >= 0 ? 'td-green' : 'td-red'}`}>
                    {a.balance < 0 ? `(${Math.abs(a.balance).toLocaleString()})` : a.balance.toLocaleString()}
                  </td>
                  <td><span className={`pill ${a.is_active ? 'pill-green' : 'pill-gray'}`}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
