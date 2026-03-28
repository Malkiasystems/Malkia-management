import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useCategories } from '../lib/useCategories'
import CategoryFilter from '../components/CategoryFilter'
import { makeCategoryPredicate } from '../components/CategoryFilter'

interface Sale {
  ref: string
  description: string
  total_amount: number
  vat_amount: number
  subtotal: number
  payment_method: string
  posting_date: string
  status: string
  customers: { name: string; whatsapp: string } | null
  voucher_lines: { products: { category: string } | null }[]
}

export default function SalesRegister() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [filterCat, setFilterCat] = useState('all')
  const { categories } = useCategories()

  useEffect(() => { loadSales() }, [])

  const loadSales = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vouchers')
      .select('ref, description, total_amount, vat_amount, subtotal, payment_method, posting_date, status, customers(name, whatsapp), voucher_lines(products(category))')
      .in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', fromDate)
      .lte('posting_date', toDate)
      .order('posting_date', { ascending: false })
    if (!error && data) setSales(data as any)
    setLoading(false)
  }

  const catPredicate = makeCategoryPredicate(filterCat, categories)
  const filtered = filterCat === 'all' ? sales : sales.filter(s =>
    (s.voucher_lines || []).some(l => l.products && catPredicate(l.products.category))
  )
  const totalRevenue = filtered.reduce((s, v) => s + (v.total_amount || 0), 0)
  const totalVat = filtered.reduce((s, v) => s + (v.vat_amount || 0), 0)
  const totalNet = totalRevenue - totalVat

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Sales Register</div>
          <div className="page-sub">All cash sales · Live from Supabase · <span className="sync-dot"></span></div>
        </div>
        <div className="page-actions">
          <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ color: 'var(--text3)' }}>to</span>
          <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} />
          <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ width: 180 }} />
          <button className="btn btn-primary btn-sm" onClick={loadSales}>Load</button>
          <button className="btn btn-ghost btn-sm" style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.09"/></svg> Export</button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card green"><div className="stat-label">Total Sales</div><div className="stat-value">{filtered.length}</div><div className="stat-change up">Transactions</div></div>
        <div className="stat-card amber"><div className="stat-label">Gross Revenue</div><div className="stat-value">TZS {(totalRevenue / 1000).toFixed(0)}K</div><div className="stat-change up">Inc. VAT</div></div>
        <div className="stat-card blue"><div className="stat-label">Net Revenue</div><div className="stat-value">TZS {(totalNet / 1000).toFixed(0)}K</div><div className="stat-change up">Excl. VAT</div></div>
        <div className="stat-card red"><div className="stat-label">VAT Collected</div><div className="stat-value">TZS {(totalVat / 1000).toFixed(0)}K</div><div className="stat-change down">Payable to TRA</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Ref</th><th>Customer</th><th>WhatsApp</th>
              <th>Payment</th><th className="td-right">Net (TZS)</th>
              <th className="td-right">VAT</th><th className="td-right">Total (TZS)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading…</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No sales found for this period.</td></tr>
            ) : (
              filtered.map((s, i) => (
                <tr key={i}>
                  <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>{s.posting_date}</td>
                  <td className="td-mono td-amber">{s.ref}</td>
                  <td className="td-bold">{s.customers?.name || s.description}</td>
                  <td className="td-mono" style={{ color: 'var(--wa)', fontSize: 11 }}>{s.customers?.whatsapp || '—'}</td>
                  <td><span className={`pill ${s.payment_method === 'cash' ? 'pill-green' : s.payment_method === 'mpesa' ? 'pill-blue' : 'pill-amber'}`}>{s.payment_method}</span></td>
                  <td className="td-right td-mono">{(s.total_amount - s.vat_amount).toLocaleString()}</td>
                  <td className="td-right td-mono td-amber">{s.vat_amount?.toLocaleString()}</td>
                  <td className="td-right td-mono td-green">{s.total_amount?.toLocaleString()}</td>
                  <td><span className="pill pill-green">{s.status}</span></td>
                </tr>
              ))
            )}
            {!loading && sales.length > 0 && (
              <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                <td colSpan={5} className="td-bold">TOTALS</td>
                <td className="td-right td-mono td-bold">{totalNet.toLocaleString()}</td>
                <td className="td-right td-mono td-amber">{totalVat.toLocaleString()}</td>
                <td className="td-right td-mono td-green">{totalRevenue.toLocaleString()}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
