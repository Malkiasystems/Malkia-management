import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'

interface PaymentRecord { ref: string; type: string; posting_date: string; description: string; total_amount: number; payment_method: string; status: string; notes: string }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

export default function PaymentRegister() {
  const [records, setRecords] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => { load() }, [])

  const load = async (from?: string, to?: string) => {
    const f = from || fromDate
    const t = to || toDate
    setLoading(true)
    const { data } = await supabase.from('vouchers')
      .select('ref, type, posting_date, description, total_amount, payment_method, status, notes')
      .in('type', ['cash_payment', 'petty_cash', 'bank_transfer', 'contra', 'cash_receipt'])
      .gte('posting_date', f).lte('posting_date', t)
      .order('posting_date', { ascending: false })
    if (data) setRecords(data as PaymentRecord[])
    setLoading(false)
  }

  const filtered = typeFilter === 'all' ? records : records.filter(r => r.type === typeFilter)
  const totalOut = filtered.filter(r => ['cash_payment','petty_cash'].includes(r.type)).reduce((s,r)=>s+(r.total_amount||0),0)
  const totalIn = filtered.filter(r => r.type === 'cash_receipt').reduce((s,r)=>s+(r.total_amount||0),0)
  const net = totalIn - totalOut

  const exportCSV = () => {
    const rows = [['Date','Ref','Type','Description','Payment Method','Amount (TZS)','Status']]
    filtered.forEach(r => rows.push([r.posting_date,r.ref,r.type,`"${r.description}"`,r.payment_method||'',String(r.total_amount||0),r.status]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`Payment_Register_${fromDate}_to_${toDate}.csv`; a.click()
  }

  const TYPE_LABEL: Record<string,string> = { cash_payment:'Cash Payment', petty_cash:'Petty Cash', bank_transfer:'Bank Transfer', contra:'Contra', cash_receipt:'Cash Receipt' }
  const TYPE_COLOR: Record<string,string> = { cash_payment:'pill-red', petty_cash:'pill-yellow', bank_transfer:'pill-blue', contra:'pill-gray', cash_receipt:'pill-green' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Payment Register</div><div className="page-sub">All cash and bank movements · <span className="sync-dot"></span> Live</div></div>
        <div className="page-actions">
          <div style={{ display:'flex',alignItems:'center',gap:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'5px 10px' }}>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ fontSize:11,color:'var(--text3)' }}>to</span>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={() => load()}>Load</button>
          </div>
          <select className="form-input" style={{ fontSize:12,padding:'6px 10px' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="cash_payment">Cash Payments</option>
            <option value="petty_cash">Petty Cash</option>
            <option value="bank_transfer">Bank Transfers</option>
            <option value="cash_receipt">Cash Receipts</option>
            <option value="contra">Contra Entries</option>
          </select>
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => load()}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={exportCSV}><Ic n="csv" /> Export CSV</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card red"><div className="stat-label">Total Paid Out</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalOut)}</div></div>
        <div className="stat-card green"><div className="stat-label">Total Received</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalIn)}</div></div>
        <div className={`stat-card ${net>=0?'green':'red'}`}><div className="stat-label">Net Flow</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(net)}</div></div>
        <div className="stat-card blue"><div className="stat-label">Transactions</div><div className="stat-value">{filtered.length}</div></div>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Description</th><th>Method</th><th className="td-right">Amount (TZS)</th><th>Status</th></tr></thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{r.posting_date}</td>
                    <td className="td-mono td-amber" style={{ fontSize:11 }}>{r.ref}</td>
                    <td><span className={`pill ${TYPE_COLOR[r.type]||'pill-gray'}`} style={{ fontSize:9 }}>{TYPE_LABEL[r.type]||r.type}</span></td>
                    <td style={{ fontSize:11,color:'var(--text2)',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.description}</td>
                    <td style={{ fontSize:11,color:'var(--text3)' }}>{r.payment_method||'—'}</td>
                    <td className="td-right td-mono" style={{ fontSize:12,fontWeight:600,color:r.type==='cash_receipt'?'var(--green)':'var(--red)' }}>{(r.total_amount||0).toLocaleString()}</td>
                    <td><span className={`pill ${r.status==='posted'?'pill-green':'pill-gray'}`} style={{ fontSize:9 }}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                  <td colSpan={5} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>TOTALS — {filtered.length} records</td>
                  <td className="td-right td-mono" style={{ color:net>=0?'var(--green)':'var(--red)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(net)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
