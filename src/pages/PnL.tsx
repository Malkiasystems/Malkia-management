import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface AccountBalance { code: string; name: string; type: string; balance: number }

export default function PnL() {
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('current')

  useEffect(() => { loadPnL() }, [])

  const loadPnL = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('code, name, type, balance')
      .in('type', ['revenue', 'cogs', 'expense', 'other'])
      .eq('is_active', true)
      .order('code')
    if (data) setAccounts(data)
    setLoading(false)
  }

  const revenue = accounts.filter(a => a.type === 'revenue')
  const cogs = accounts.filter(a => a.type === 'cogs')
  const expenses = accounts.filter(a => a.type === 'expense')

  const totalRevenue = revenue.reduce((s, a) => s + Math.abs(a.balance), 0)
  const totalCogs = cogs.reduce((s, a) => s + Math.abs(a.balance), 0)
  const grossProfit = totalRevenue - totalCogs
  const totalExpenses = expenses.reduce((s, a) => s + Math.abs(a.balance), 0)
  const netProfit = grossProfit - totalExpenses
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0'

  const Row = ({ label, value, indent, bold, negative }: { label: string; value: number; indent?: boolean; bold?: boolean; negative?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 14 : 12, fontWeight: bold ? 700 : 400, padding: bold ? '10px 0' : '5px 0', borderTop: bold ? '1px solid var(--border2)' : 'none', marginTop: bold ? 6 : 0 }}>
      <span style={{ color: indent ? 'var(--text3)' : 'var(--text)', paddingLeft: indent ? 16 : 0 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', color: negative ? 'var(--red)' : value >= 0 ? 'var(--green)' : 'var(--red)' }}>
        {negative ? `(${Math.abs(value).toLocaleString()})` : value.toLocaleString()}
      </span>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Profit & Loss</div>
          <div className="page-sub">Cumulative · All posted transactions · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <select className="form-input" style={{ width: 160, padding: '6px 10px', fontSize: 12 }} value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="current">Cumulative (All time)</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={loadPnL} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh</button>
          <button className="btn btn-ghost btn-sm" style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print</button>
          <button className="btn btn-primary btn-sm" style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.09"/></svg> Export PDF</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)' }}>Loading P&L…</div>
      ) : (
        <div className="grid g2">
          <div className="card">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: 1 }}>Revenue</div>
            {revenue.filter(a => Math.abs(a.balance) > 0).map((a, i) => (
              <Row key={i} label={`${a.code} — ${a.name}`} value={Math.abs(a.balance)} indent />
            ))}
            {revenue.filter(a => Math.abs(a.balance) > 0).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 16 }}>No revenue posted yet</div>}
            <Row label="Total Revenue" value={totalRevenue} bold />

            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginTop: 20, marginBottom: 14, letterSpacing: 1 }}>Cost of Goods Sold</div>
            {cogs.filter(a => Math.abs(a.balance) > 0).map((a, i) => (
              <Row key={i} label={`${a.code} — ${a.name}`} value={Math.abs(a.balance)} indent negative />
            ))}
            {cogs.filter(a => Math.abs(a.balance) > 0).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 16 }}>No COGS posted yet</div>}
            <Row label="Total COGS" value={totalCogs} bold negative />
            <Row label="Gross Profit" value={grossProfit} bold />
          </div>

          <div className="card">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: 1 }}>Operating Expenses</div>
            {expenses.filter(a => Math.abs(a.balance) > 0).map((a, i) => (
              <Row key={i} label={`${a.code} — ${a.name}`} value={Math.abs(a.balance)} indent negative />
            ))}
            {expenses.filter(a => Math.abs(a.balance) > 0).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 16 }}>No expenses posted yet</div>}
            <Row label="Total Expenses" value={totalExpenses} bold negative />

            <div style={{ height: 1, background: 'var(--border2)', margin: '20px 0' }}></div>

            <div style={{ background: netProfit >= 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${netProfit >= 0 ? 'rgba(0,229,160,.2)' : 'rgba(255,71,87,.2)'}`, borderRadius: 'var(--r)', padding: 16 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Net Profit — All Time</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 800, color: netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                TZS {Math.abs(netProfit).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                Margin: {margin}% · Revenue: TZS {totalRevenue.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
