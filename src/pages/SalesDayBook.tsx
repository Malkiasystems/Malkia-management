import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { useCategories } from '../lib/useCategories'
import CategoryFilter, { makeCategoryPredicate } from '../components/CategoryFilter'

interface Sale {
  id: string
  ref: string
  posting_date: string
  description: string
  total_amount: number
  vat_amount: number
  subtotal: number
  payment_method: string
  status: string
  notes: string
  posted_by: string
  customers: { name: string; whatsapp: string; pregnancy_stage: string; crown_points: number } | null
  voucher_lines: {
    id: string
    qty: number
    unit_price: number
    unit_cost: number
    total: number
    vat_amount: number
    products: { name: string; sku: string; category: string } | null
  }[]
}


export default function SalesDayBook() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'detail' | 'summary'>('summary')

  // Filters
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [voucherType, setVoucherType] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchRef, setSearchRef] = useState('')
  const [searchCustomer, setSearchCustomer] = useState('')
  const [searchProduct, setSearchProduct] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [searchPayment, setSearchPayment] = useState('')
  const [searchSalesperson, setSearchSalesperson] = useState('')
  const { categories: _cats } = useCategories()
  const catPredicate = makeCategoryPredicate(filterCat, _cats)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => { loadSales() }, [])

  const loadSales = async (from?: string, to?: string) => {
    setLoading(true)
    const f = from || fromDate
    const t = to || toDate
    let query = supabase
      .from('vouchers')
      .select(`
        id, ref, posting_date, description, total_amount, vat_amount, subtotal,
        payment_method, status, notes, posted_by,
        customers (name, whatsapp, pregnancy_stage, crown_points),
        voucher_lines (
          id, qty, unit_price, unit_cost, total, vat_amount,
          products (name, sku, category)
        )
      `)
      .in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', f)
      .lte('posting_date', t)
      .order('posting_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (voucherType !== 'all') query = query.eq('type', voucherType)
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (!error && data) setSales(data as any)
    setLoading(false)
  }

  // Client-side filtering
  const filtered = sales.filter(s => {
    const custName = (s.customers as any)?.name?.toLowerCase() || ''
    const custWa = (s.customers as any)?.whatsapp || ''
    const products = (s.voucher_lines || []).map((l: any) => l.products?.name?.toLowerCase() || '').join(' ')
    const payment = s.payment_method?.toLowerCase() || ''
    const salesperson = s.posted_by?.toLowerCase() || ''

    if (searchRef && !s.ref.toLowerCase().includes(searchRef.toLowerCase())) return false
    if (searchCustomer && !custName.includes(searchCustomer.toLowerCase()) && !custWa.includes(searchCustomer)) return false
    if (searchProduct && !products.includes(searchProduct.toLowerCase())) return false
    if (filterCat !== 'all' && !(s.voucher_lines || []).some((l: any) => l.products && catPredicate(l.products.category))) return false
    if (searchPayment && !payment.includes(searchPayment.toLowerCase())) return false
    if (searchSalesperson && !salesperson.includes(searchSalesperson.toLowerCase())) return false
    return true
  })

  // Totals
  const totalRevenue = filtered.reduce((s, v) => s + (v.total_amount || 0), 0)
  const totalVat = filtered.reduce((s, v) => s + (v.vat_amount || 0), 0)
  const totalNet = totalRevenue - totalVat
  const totalCost = filtered.reduce((s: number, sale: any) => s + (sale.voucher_lines || []).reduce((acc: number, l: any) => acc + ((l.unit_cost || 0) * (l.qty || 0)), 0), 0)
  const totalMargin = totalNet - totalCost
  const marginPct = totalNet > 0 ? Math.round((totalMargin / totalNet) * 100) : 0
  const podCount = filtered.filter(s => s.status === 'draft').length
  const postedCount = filtered.filter(s => s.status === 'posted').length

  // Payment split
  const paymentSplit: Record<string, number> = {}
  filtered.forEach(s => {
    const methods = (s.payment_method || 'Cash').split('+')
    methods.forEach(m => { const key = m.trim(); paymentSplit[key] = (paymentSplit[key] || 0) + (s.total_amount || 0) / methods.length })
  })

  const clearFilters = () => {
    setSearchRef(''); setSearchCustomer(''); setSearchProduct('')
    setFilterCat('all'); setSearchPayment(''); setSearchSalesperson('')
    setVoucherType('all'); setStatusFilter('all')
  }

  const activeFilters = [searchRef, searchCustomer, searchProduct, searchPayment, searchSalesperson].filter(Boolean).length +
    (filterCat !== 'all' ? 1 : 0) +
    (voucherType !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)

  // ═══════════════════════════════════════════════════════════════════
  // EXPORT FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════
  
  const exportExcel = () => {
    // Build data rows
    const rows: any[][] = []
    
    // Header
    rows.push(['MALKIA WELLNESS GROUP'])
    rows.push(['Sales Day Book'])
    rows.push([`Period: ${fromDate} to ${toDate}`])
    rows.push([`Generated: ${new Date().toLocaleString()}`])
    rows.push([])
    
    // Column headers
    rows.push(['Date', 'Ref', 'Customer', 'WhatsApp', 'Products', 'Payment', 'Status', 'Subtotal', 'VAT', 'Total', 'Posted By'])
    
    // Data rows
    filtered.forEach(s => {
      const products = (s.voucher_lines || []).map((l: any) => `${l.qty}x ${l.products?.name || 'Unknown'}`).join(', ')
      rows.push([
        s.posting_date,
        s.ref,
        (s.customers as any)?.name || 'Walk-in',
        (s.customers as any)?.whatsapp || '',
        products,
        s.payment_method || 'Cash',
        s.status === 'posted' ? 'Posted' : 'POD',
        s.subtotal || 0,
        s.vat_amount || 0,
        s.total_amount || 0,
        s.posted_by || ''
      ])
    })
    
    // Totals row
    rows.push([])
    rows.push(['', '', '', '', '', '', 'TOTALS:', totalNet, totalVat, totalRevenue, ''])
    
    // Convert to CSV then to Excel-compatible format
    const csvContent = rows.map(row => 
      row.map(cell => {
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
          return `"${cell.replace(/"/g, '""')}"`
        }
        return cell
      }).join(',')
    ).join('\n')
    
    // Add BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Sales_Day_Book_${fromDate}_to_${toDate}.xls`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    // Create printable HTML
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Day Book</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 10px; padding: 20px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { font-size: 16px; margin-bottom: 4px; }
          .header p { font-size: 11px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; font-size: 9px; }
          td { font-size: 9px; }
          .right { text-align: right; }
          .mono { font-family: monospace; }
          .totals { background: #f9f9f9; font-weight: bold; }
          .posted { color: green; }
          .pod { color: orange; }
          .summary { margin-top: 20px; display: flex; gap: 20px; }
          .summary-box { border: 1px solid #ddd; padding: 10px; flex: 1; }
          .summary-box h3 { font-size: 10px; margin-bottom: 6px; }
          .summary-box .value { font-size: 14px; font-weight: bold; }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MALKIA WELLNESS GROUP</h1>
          <p>Sales Day Book</p>
          <p>Period: ${fromDate} to ${toDate}</p>
          <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref</th>
              <th>Customer</th>
              <th>Products</th>
              <th>Payment</th>
              <th>Status</th>
              <th class="right">Subtotal</th>
              <th class="right">VAT</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(s => {
              const products = (s.voucher_lines || []).map((l: any) => `${l.qty}x ${l.products?.name || '?'}`).join(', ')
              return `
                <tr>
                  <td class="mono">${s.posting_date}</td>
                  <td class="mono">${s.ref}</td>
                  <td>${(s.customers as any)?.name || 'Walk-in'}</td>
                  <td>${products}</td>
                  <td>${s.payment_method || 'Cash'}</td>
                  <td class="${s.status === 'posted' ? 'posted' : 'pod'}">${s.status === 'posted' ? '✓ Posted' : 'POD'}</td>
                  <td class="right mono">${(s.subtotal || 0).toLocaleString()}</td>
                  <td class="right mono">${(s.vat_amount || 0).toLocaleString()}</td>
                  <td class="right mono">${(s.total_amount || 0).toLocaleString()}</td>
                </tr>
              `
            }).join('')}
            <tr class="totals">
              <td colspan="6" class="right">TOTALS:</td>
              <td class="right mono">${totalNet.toLocaleString()}</td>
              <td class="right mono">${totalVat.toLocaleString()}</td>
              <td class="right mono">${totalRevenue.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="summary">
          <div class="summary-box">
            <h3>Transactions</h3>
            <div class="value">${filtered.length}</div>
          </div>
          <div class="summary-box">
            <h3>Gross Revenue</h3>
            <div class="value">TZS ${totalRevenue.toLocaleString()}</div>
          </div>
          <div class="summary-box">
            <h3>VAT Collected</h3>
            <div class="value">TZS ${totalVat.toLocaleString()}</div>
          </div>
          <div class="summary-box">
            <h3>Net Revenue</h3>
            <div class="value">TZS ${totalNet.toLocaleString()}</div>
          </div>
          <div class="summary-box">
            <h3>Gross Margin</h3>
            <div class="value">${marginPct}%</div>
          </div>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `
    
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
    }
  }

  return (
    <div className="page">
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-title">Sales Day Book</div>
          <div className="page-sub">
            All sales transactions · {filtered.length} vouchers · <span className="sync-dot"></span> Live
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => loadSales()} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={exportPDF} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Export PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Export Excel</button>
        </div>
      </div>

      {/* DATE + VIEW CONTROLS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>From</span>
          <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>To</span>
          <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent' }} value={toDate} onChange={e => setToDate(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => loadSales()}>Load</button>
        </div>

        {/* Quick date presets */}
        {[
          { label: 'Today', from: new Date().toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
          { label: 'This Week', from: new Date(Date.now() - 6*86400000).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
          { label: 'This Month', from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
        ].map(p => (
          <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => { setFromDate(p.from); setToDate(p.to); loadSales(p.from, p.to) }}>{p.label}</button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowFilters(!showFilters)} className="btn btn-ghost btn-sm" style={{ position: 'relative' }}>
            Filters
            {activeFilters > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: 'var(--accent)', borderRadius: '50%', fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{activeFilters}</span>}
          </button>
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            <button onClick={() => setView('summary')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: view === 'summary' ? 'var(--accent)' : 'transparent', color: view === 'summary' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}>Summary</button>
            <button onClick={() => setView('detail')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: view === 'detail' ? 'var(--accent)' : 'transparent', color: view === 'detail' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}>Detail</button>
          </div>
        </div>
      </div>

      {/* FILTER PANEL */}
      {showFilters && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700 }}>Filters</div>
            {activeFilters > 0 && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>× Clear all filters</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Voucher Ref</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="e.g. CS-0001" value={searchRef} onChange={e => setSearchRef(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Customer / WhatsApp</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="Name or number" value={searchCustomer} onChange={e => setSearchCustomer(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Product</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="Product name" value={searchProduct} onChange={e => setSearchProduct(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Category / Group</div>
              <CategoryFilter value={filterCat} onChange={setFilterCat} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Payment Method</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="Cash, M-Pesa, Bank" value={searchPayment} onChange={e => setSearchPayment(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Salesperson</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="e.g. Joe, Lilian" value={searchSalesperson} onChange={e => setSearchSalesperson(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Voucher Type</div>
              <select className="form-input" style={{ fontSize: 12 }} value={voucherType} onChange={e => setVoucherType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="cash_sale">Cash Sale</option>
                <option value="sales_invoice">Sales Invoice</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
              <select className="form-input" style={{ fontSize: 12 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="posted">Posted</option>
                <option value="draft">POD Pending</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card green"><div className="stat-label">Gross Revenue</div><div className="stat-value">{totalRevenue >= 1000000 ? (totalRevenue/1000000).toFixed(2)+'M' : (totalRevenue/1000).toFixed(0)+'K'}</div><div className="stat-change up">{filtered.length} vouchers</div></div>
        <div className="stat-card blue"><div className="stat-label">Net Revenue (excl. VAT)</div><div className="stat-value">{totalNet >= 1000000 ? (totalNet/1000000).toFixed(2)+'M' : (totalNet/1000).toFixed(0)+'K'}</div><div className="stat-change up">After VAT</div></div>
        <div className="stat-card amber"><div className="stat-label">VAT Collected</div><div className="stat-value">{tzs(totalVat)}</div><div className="stat-change down">Payable to TRA</div></div>
        <div className="stat-card yellow"><div className="stat-label">Gross Margin</div><div className="stat-value">{marginPct}%</div><div className="stat-change up">{tzs(totalMargin)}</div></div>
      </div>

      {/* PAYMENT SPLIT + STATUS */}
      <div className="grid g2" style={{ marginBottom: 20 }}>
        <div className="card card-sm">
          <div className="card-title" style={{ marginBottom: 12 }}>Payment Split</div>
          {Object.keys(paymentSplit).length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>No data</div>
          ) : Object.entries(paymentSplit).map(([method, amount], i) => {
            const pct = totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text3)' }}>{method.includes('Cash') ? '' : method.includes('Pesa') || method.includes('pesa') ? '' : ''} {method}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(amount)} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span></span>
                </div>
                <div style={{ height: 5, background: 'var(--surface3)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: method.includes('Cash') ? 'var(--green)' : method.includes('Pesa') || method.includes('pesa') ? 'var(--blue)' : 'var(--accent)', borderRadius: 3 }}></div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="card card-sm">
          <div className="card-title" style={{ marginBottom: 12 }}>Voucher Status</div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <div style={{ flex: 1, background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 'var(--r)', padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--display)' }}>{postedCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Posted ✓</div>
            </div>
            <div style={{ flex: 1, background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.2)', borderRadius: 'var(--r)', padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--yellow)', fontFamily: 'var(--display)' }}>{podCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>POD Pending </div>
            </div>
            <div style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--display)' }}>{filtered.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total</div>
            </div>
          </div>
          {filtered.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Avg sale: <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(Math.round(totalRevenue / filtered.length))}</span> ·
              Avg margin: <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 600 }}> {marginPct}%</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SUMMARY VIEW ────────────────────────── */}
      {view === 'summary' && (
        <div className="card">
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">Sales Register — Summary</div>
              <div className="card-sub">{filtered.length} transactions · {fromDate} to {toDate}</div>
            </div>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No sales found for this period and filters.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher No</th>
                    <th>Customer</th>
                    <th>WhatsApp</th>
                    <th>Payment / Bank</th>
                    <th>Salesperson</th>
                    <th>Status</th>
                    <th className="td-right">Amount (TZS)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>{s.posting_date}</td>
                      <td className="td-mono td-amber">{s.ref}</td>
                      <td className="td-bold">{(s.customers as any)?.name || '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--wa)', fontSize: 11 }}>{(s.customers as any)?.whatsapp || '—'}</td>
                      <td>
                        <span className={`pill ${s.payment_method?.includes('Cash') ? 'pill-green' : s.payment_method?.includes('M-Pesa') ? 'pill-blue' : s.payment_method?.includes('Mixx') ? 'pill-yellow' : s.payment_method?.includes('NMB') ? 'pill-blue' : s.payment_method?.includes('CRDB') ? 'pill-green' : s.payment_method?.includes('POS') ? 'pill-gray' : 'pill-amber'}`} style={{ fontSize: 10 }}>
                          {s.payment_method?.includes('Cash') ? '' : s.payment_method?.includes('M-Pesa') ? '' : s.payment_method?.includes('Mixx') ? '' : s.payment_method?.includes('NMB') ? '' : s.payment_method?.includes('CRDB') ? '' : s.payment_method?.includes('POS') ? '' : ''} {s.payment_method}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{s.posted_by || '—'}</td>
                      <td><span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`} style={{ fontSize: 10 }}>{s.status === 'draft' ? 'POD' : 'Posted ✓'}</span></td>
                      <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{s.total_amount?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={6} className="td-bold" style={{ padding: '12px 14px' }}>TOTALS — {filtered.length} transactions</td>
                    <td></td>
                    <td className="td-right td-mono td-green" style={{ fontSize: 15, fontWeight: 800, padding: '12px 14px' }}>{totalRevenue.toLocaleString()}</td>
                  </tr>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <td colSpan={6} style={{ padding: '4px 14px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>VAT (18% incl.)</td>
                    <td></td>
                    <td className="td-right td-mono td-amber" style={{ fontSize: 12, padding: '4px 14px' }}>{totalVat.toLocaleString()}</td>
                  </tr>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <td colSpan={6} style={{ padding: '4px 14px 12px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Net Revenue (excl. VAT)</td>
                    <td></td>
                    <td className="td-right td-mono" style={{ fontSize: 12, color: 'var(--blue)', padding: '4px 14px 12px' }}>{totalNet.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL VIEW ─────────────────────────── */}
      {view === 'detail' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No sales found for this period and filters.</div>
          ) : (
            filtered.map((s, i) => {
              const custMargin = (s.voucher_lines || []).reduce((acc: number, l: any) => acc + ((l.unit_price - l.unit_cost) * l.qty), 0)
              const custNet = (s.total_amount || 0) - (s.vat_amount || 0)
              const custMarginPct = custNet > 0 ? Math.round((custMargin / custNet) * 100) : 0
              return (
                <div key={i} className="card" style={{ borderLeft: `3px solid ${s.status === 'draft' ? 'var(--yellow)' : 'var(--green)'}` }}>
                  {/* Voucher Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{s.ref}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{s.posting_date} · {s.posted_by}</div>
                      </div>
                      <span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`}>{s.status === 'draft' ? 'POD Pending' : 'Posted ✓'}</span>
                      <span className={`pill ${s.payment_method?.includes('Cash') ? 'pill-green' : s.payment_method?.includes('M-Pesa') ? 'pill-blue' : s.payment_method?.includes('Mixx') ? 'pill-yellow' : s.payment_method?.includes('NMB') ? 'pill-blue' : s.payment_method?.includes('CRDB') ? 'pill-green' : s.payment_method?.includes('POS') ? 'pill-gray' : 'pill-amber'}`}>
                        {s.payment_method?.includes('Cash') ? '' : s.payment_method?.includes('M-Pesa') ? '' : s.payment_method?.includes('Mixx') ? '' : s.payment_method?.includes('NMB') ? '' : s.payment_method?.includes('CRDB') ? '' : s.payment_method?.includes('POS') ? '' : ''} {s.payment_method}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{tzs(s.total_amount || 0)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>incl. VAT {tzs(s.vat_amount || 0)}</div>
                      <div style={{ fontSize: 11, color: s.status === 'draft' ? 'var(--yellow)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {s.status === 'draft' ? 'Receipt pending' : '✓ Receipted'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                    {/* Customer */}
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Customer</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{(s.customers as any)?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--wa)', fontFamily: 'var(--mono)' }}>{(s.customers as any)?.whatsapp || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{(s.customers as any)?.pregnancy_stage || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4, fontFamily: 'var(--mono)' }}>{((s.customers as any)?.crown_points || 0).toLocaleString()} pts</div>
                    </div>

                    {/* Financial Summary */}
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Financials</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                        <span style={{ color: 'var(--text3)' }}>Gross</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(s.total_amount || 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                        <span style={{ color: 'var(--text3)' }}>VAT</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(s.vat_amount || 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                        <span style={{ color: 'var(--text3)' }}>Net</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{tzs(custNet)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                        <span style={{ color: 'var(--text3)' }}>Margin</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>{custMarginPct}% · {tzs(custMargin)}</span>
                      </div>
                      {s.notes && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}> {s.notes}</div>}
                    </div>

                    {/* Crown Points + CRM */}
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>CRM & Loyalty</div>
                      <div style={{ fontSize: 13, color: 'var(--yellow)', fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 6 }}>
                        +{Math.round((s.total_amount || 0) / 1000)} Crown pts earned
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total pts: {((s.customers as any)?.crown_points || 0).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>WhatsApp receipt {s.status === 'draft' ? 'pending' : 'sent'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Posted by: {s.posted_by}</div>
                    </div>
                  </div>

                  {/* Line Items */}
                  {(s.voucher_lines || []).length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr style={{ background: 'var(--surface3)' }}>
                            <th>SKU</th><th>Product</th><th>Category</th>
                            <th className="td-right" style={{ width: 60 }}>Qty</th>
                            <th className="td-right" style={{ width: 120 }}>Unit Cost</th>
                            <th className="td-right" style={{ width: 120 }}>Unit Price</th>
                            <th className="td-right" style={{ width: 80 }}>Margin</th>
                            <th className="td-right" style={{ width: 130 }}>Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(s.voucher_lines as any[]).map((l, li) => {
                            const linePct = l.unit_price > 0 ? Math.round(((l.unit_price - l.unit_cost) / l.unit_price) * 100) : 0
                            return (
                              <tr key={li}>
                                <td className="td-mono td-amber" style={{ fontSize: 11 }}>{l.products?.sku || '—'}</td>
                                <td className="td-bold" style={{ fontSize: 12 }}>{l.products?.name || '—'}</td>
                                <td style={{ fontSize: 11, color: 'var(--text3)' }}>{l.products?.category || '—'}</td>
                                <td className="td-right td-mono" style={{ fontSize: 12 }}>{l.qty}</td>
                                <td className="td-right td-mono" style={{ fontSize: 12, color: 'var(--text3)' }}>{(l.unit_cost || 0).toLocaleString()}</td>
                                <td className="td-right td-mono" style={{ fontSize: 12 }}>{(l.unit_price || 0).toLocaleString()}</td>
                                <td className="td-right" style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{linePct}%</td>
                                <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{(l.total || 0).toLocaleString()}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* DETAIL TOTALS FOOTER */}
          {filtered.length > 0 && !loading && (
            <div style={{ background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 'var(--r)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>
                Period Totals — {fromDate} to {toDate} · {filtered.length} transactions
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Gross Revenue', value: tzs(totalRevenue), color: 'var(--green)' },
                  { label: 'VAT (18% incl.)', value: tzs(totalVat), color: 'var(--accent)' },
                  { label: 'Net Revenue', value: tzs(totalNet), color: 'var(--blue)' },
                  { label: 'Cost of Goods', value: tzs(totalCost), color: 'var(--red)' },
                  { label: 'Gross Margin', value: `${tzs(totalMargin)} (${marginPct}%)`, color: 'var(--green)' },
                  { label: 'Avg per Sale', value: tzs(Math.round(totalRevenue / filtered.length)), color: 'var(--text)' },
                ].map((item, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
