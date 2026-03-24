import { useState } from 'react'
import { ACCOUNTS } from '../lib/data'

const ALL_ACCTS = [
  ...ACCOUNTS,
  { id:'x1', code:'1060', name:'VAT Receivable (Input Tax)', type:'asset' as const, category:'Tax', balance:42000 },
  { id:'x2', code:'1120', name:'Goods in Transit', type:'asset' as const, category:'Inventory', balance:0 },
  { id:'x3', code:'3040', name:'Opening Stock Equity', type:'equity' as const, category:'Equity', balance:0 },
  { id:'x4', code:'5090', name:'Inventory Adjustment — Cost Variance', type:'cogs' as const, category:'COGS', balance:0 },
  { id:'x5', code:'6011', name:'Salaries — Part-Time / Casual', type:'expense' as const, category:'People', balance:0 },
  { id:'x6', code:'6120', name:'Utilities — Electricity & Water', type:'expense' as const, category:'Premises', balance:0 },
  { id:'x7', code:'6211', name:'Influencer & Content Costs', type:'expense' as const, category:'Marketing', balance:0 },
  { id:'x8', code:'6412', name:'Packaging Materials', type:'expense' as const, category:'Logistics', balance:0 },
  { id:'x9', code:'6511', name:'Professional Fees (Legal/Audit)', type:'expense' as const, category:'Admin', balance:0 },
  { id:'x10', code:'7012', name:'FX Gain/Loss — Unrealised', type:'other' as const, category:'FX', balance:0 },
]

const TYPE_COLOR: Record<string, string> = {
  asset: 'pill-blue', liability: 'pill-red', equity: 'pill-gray',
  revenue: 'pill-green', cogs: 'pill-amber', expense: 'pill-amber', other: 'pill-gray'
}

export default function ChartOfAccounts() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = ALL_ACCTS.filter(a =>
    (filter === 'all' || a.type === filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.code.includes(search))
  ).sort((a, b) => a.code.localeCompare(b.code))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📂 Chart of Accounts</div>
          <div className="page-sub">Full double-entry COA · NAV/Business Central structure · {ALL_ACCTS.length} accounts</div>
        </div>
        <div className="page-actions">
          <input
            className="form-input"
            style={{ width: 200, padding: '6px 10px', fontSize: 12 }}
            placeholder="🔍 Search accounts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
                <td><span className={`pill ${TYPE_COLOR[a.type]}`}>{a.type.charAt(0).toUpperCase() + a.type.slice(1)}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text3)' }}>{a.category}</td>
                <td className={`td-right td-mono ${a.balance >= 0 ? 'td-green' : 'td-red'}`}>
                  {a.balance < 0 ? `(${Math.abs(a.balance).toLocaleString()})` : a.balance.toLocaleString()}
                </td>
                <td><span className="pill pill-green">Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
