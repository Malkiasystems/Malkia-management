import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useCategories } from '../lib/useCategories'
import CategoryFilter from '../components/CategoryFilter'
import { makeCategoryPredicate } from '../components/CategoryFilter'
import Toast from '../components/Toast'

interface Sale {
  ref: string
  description: string
  total_amount: number
  subtotal: number
  payment_method: string
  posting_date: string
  status: string
  customers: { name: string; whatsapp: string } | null
  voucher_lines: { products: { category: string } | null }[]
}

interface ArchiveSale {
  id: string
  month: string
  year: number
  sales: number
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function SalesRegister() {
  const [activeTab, setActiveTab] = useState<'live' | 'historical'>('live')
  
  // Live data state
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [filterCat, setFilterCat] = useState('all')
  const { categories } = useCategories()

  // Historical data state
  const [archiveData, setArchiveData] = useState<ArchiveSale[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState(2025)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { loadSales() }, [])
  useEffect(() => { if (activeTab === 'historical') loadArchive() }, [activeTab, selectedYear])

  const loadSales = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vouchers')
      .select('ref, description, total_amount, subtotal, payment_method, posting_date, status, customers(name, whatsapp), voucher_lines(products(category))')
      .in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', fromDate)
      .lte('posting_date', toDate)
      .order('posting_date', { ascending: false })
    if (!error && data) setSales(data as any)
    setLoading(false)
  }

  const loadArchive = async () => {
    setArchiveLoading(true)
    const { data, error } = await supabase
      .from('sales_archive')
      .select('*')
      .eq('year', selectedYear)
      .order('id')
    if (!error && data) {
      // Sort by month order
      const sorted = data.sort((a, b) => MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
      setArchiveData(sorted)
    }
    setArchiveLoading(false)
  }

  const importArchiveData = async () => {
    if (!importText.trim()) return
    
    try {
      const lines = importText.trim().split('\n')
      const records: { month: string; year: number; sales: number }[] = []
      
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim())
        if (parts.length >= 3) {
          const month = parts[0]
          const year = parseInt(parts[1])
          const sales = parseFloat(parts[2].replace(/,/g, ''))
          
          if (MONTHS.includes(month) && year >= 2023 && year <= 2025 && !isNaN(sales)) {
            records.push({ month, year, sales })
          }
        }
      }
      
      if (records.length === 0) {
        setToast({ msg: 'No valid records found. Format: Month,Year,Amount', type: 'error' })
        return
      }
      
      const { error } = await supabase.from('sales_archive').upsert(records, { onConflict: 'month,year' })
      
      if (error) throw error
      
      setToast({ msg: `Imported ${records.length} records`, type: 'success' })
      setShowImport(false)
      setImportText('')
      loadArchive()
    } catch (err: any) {
      setToast({ msg: err.message || 'Import failed', type: 'error' })
    }
  }

  const catPredicate = makeCategoryPredicate(filterCat, categories)
  const filtered = filterCat === 'all' ? sales : sales.filter(s =>
    (s.voucher_lines || []).some(l => l.products && catPredicate(l.products.category))
  )
  const totalRevenue = filtered.reduce((s, v) => s + (v.total_amount || 0), 0)

  const archiveTotal = archiveData.reduce((s, a) => s + (a.sales || 0), 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Sales Register</div>
          <div className="page-sub">
            {activeTab === 'live' ? 'All cash sales · Live from Supabase · ' : 'Historical archive · 2023-2025 · '}
            <span className="sync-dot"></span>
          </div>
        </div>
        {activeTab === 'live' && (
          <div className="page-actions">
            <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ color: 'var(--text3)' }}>to</span>
            <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ width: 180 }} />
            <button className="btn btn-primary btn-sm" onClick={loadSales}>Load</button>
          </div>
        )}
        {activeTab === 'historical' && (
          <div className="page-actions">
            <select className="form-input" style={{ width: 120 }} value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
              <option value={2023}>2023</option>
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => setShowImport(true)}>+ Import Data</button>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('live')}
          style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'live' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'live' ? 'var(--accent)' : 'var(--text3)',
            fontWeight: activeTab === 'live' ? 600 : 400, fontSize: 13
          }}
        >
          Live (2026+)
        </button>
        <button
          onClick={() => setActiveTab('historical')}
          style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'historical' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'historical' ? 'var(--accent)' : 'var(--text3)',
            fontWeight: activeTab === 'historical' ? 600 : 400, fontSize: 13
          }}
        >
          Historical (2023-2025)
        </button>
      </div>

      {/* Live Tab */}
      {activeTab === 'live' && (
        <>
          <div className="grid g3" style={{ marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Total Sales</div><div className="stat-value">{filtered.length}</div><div className="stat-change up">Transactions</div></div>
            <div className="stat-card amber"><div className="stat-label">Revenue</div><div className="stat-value">TZS {(totalRevenue / 1000).toFixed(0)}K</div><div className="stat-change up">Total</div></div>
            <div className="stat-card blue"><div className="stat-label">Avg Sale</div><div className="stat-value">TZS {filtered.length > 0 ? (totalRevenue / filtered.length / 1000).toFixed(0) : 0}K</div><div className="stat-change up">Per transaction</div></div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Ref</th><th>Customer</th><th>WhatsApp</th>
                  <th>Payment</th><th className="td-right">Total (TZS)</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : sales.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No sales found for this period.</td></tr>
                ) : (
                  filtered.map((s, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>{s.posting_date}</td>
                      <td className="td-mono td-amber">{s.ref}</td>
                      <td className="td-bold">{s.customers?.name || s.description}</td>
                      <td className="td-mono" style={{ color: 'var(--wa)', fontSize: 11 }}>{s.customers?.whatsapp || '—'}</td>
                      <td><span className={`pill ${s.payment_method === 'cash' ? 'pill-green' : s.payment_method === 'mpesa' ? 'pill-blue' : 'pill-amber'}`}>{s.payment_method}</span></td>
                      <td className="td-right td-mono td-green">{s.total_amount?.toLocaleString()}</td>
                      <td><span className="pill pill-green">{s.status}</span></td>
                    </tr>
                  ))
                )}
                {!loading && sales.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={5} className="td-bold">TOTALS</td>
                    <td className="td-right td-mono td-green">{totalRevenue.toLocaleString()}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Historical Tab */}
      {activeTab === 'historical' && (
        <>
          <div className="grid g3" style={{ marginBottom: 20 }}>
            <div className="stat-card amber">
              <div className="stat-label">Year</div>
              <div className="stat-value">{selectedYear}</div>
              <div className="stat-change">Historical Data</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">Months Recorded</div>
              <div className="stat-value">{archiveData.length}</div>
              <div className="stat-change up">of 12</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-label">Annual Total</div>
              <div className="stat-value">TZS {(archiveTotal / 1000000).toFixed(1)}M</div>
              <div className="stat-change up">Gross Sales</div>
            </div>
          </div>

          {/* Import Modal */}
          {showImport && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
              <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 500 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Import Historical Sales</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                  Paste CSV data: Month,Year,Amount<br />
                  Example: January,2023,15234500
                </div>
                <textarea
                  className="form-input"
                  style={{ width: '100%', height: 200, fontFamily: 'var(--mono)', fontSize: 12 }}
                  placeholder="January,2023,15234500&#10;February,2023,18456200&#10;March,2023,12890000"
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => { setShowImport(false); setImportText('') }}>Cancel</button>
                  <button className="btn btn-primary" onClick={importArchiveData}>Import</button>
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Month</th>
                  <th>Year</th>
                  <th className="td-right">Sales (TZS)</th>
                </tr>
              </thead>
              <tbody>
                {archiveLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : archiveData.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No data for {selectedYear}. Click "Import Data" to add.</td></tr>
                ) : (
                  archiveData.map((a, i) => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{i + 1}</td>
                      <td className="td-bold">{a.month}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{a.year}</td>
                      <td className="td-right td-mono td-green" style={{ fontSize: 14 }}>{a.sales.toLocaleString()}</td>
                    </tr>
                  ))
                )}
                {!archiveLoading && archiveData.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={3} className="td-bold">ANNUAL TOTAL</td>
                    <td className="td-right td-mono td-green" style={{ fontSize: 15 }}>{archiveTotal.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, padding: 16, background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text3)' }}>
            <strong>Note:</strong> This is read-only historical data from Tally (2023-2025). It does not affect your current accounting, Trial Balance, or PnL. For live transactions, use the "Live (2026+)" tab.
          </div>
        </>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
