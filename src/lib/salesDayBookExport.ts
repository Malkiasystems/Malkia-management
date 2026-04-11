/**
 * Sales Day Book export functions
 * Extracted from SalesDayBook.tsx — pure functions that receive all data as arguments
 */

export interface SDBSale {
  id: string; ref: string; posting_date: string; description: string
  total_amount: number; subtotal: number; payment_method: string
  payment_split?: Record<string, number> | null
  status: string; notes: string; posted_by: string
  customers: { name: string; whatsapp: string; pregnancy_stage: string; crown_points: number } | null
  voucher_lines: { id: string; qty: number; unit_price: number; unit_cost: number; total: number; products: { name: string; sku: string; category: string } | null }[]
}

export interface SDBExpense {
  ref: string; description: string; total_amount: number; payment_method: string; notes: string
}

export interface SDBCreditNote {
  ref: string; description: string; total_amount: number; posting_date: string
}

export interface SDBTemplateSettings {
  logo_url: string | null; logo_position: string; logo_width: number
  company_name: string; company_tagline: string; primary_color: string
}

export interface ExportData {
  filtered: SDBSale[]
  expenses: SDBExpense[]
  creditNotes: SDBCreditNote[]
  paymentSplit: Record<string, number>
  expenseSplit: Record<string, number>
  totalRevenue: number
  totalExpenses: number
  totalCreditNotes: number
  netSales: number
  totalCost: number
  totalMargin: number
  marginPct: number
  fromDate: string
  toDate: string
  tplSettings: SDBTemplateSettings
}

export function exportCSV(data: ExportData) {
  const { filtered, totalRevenue, fromDate, toDate } = data
  if (filtered.length === 0) return
  const headers = ['Date','Ref','Customer','WhatsApp','Payment','Salesperson','Status','Amount (TZS)']
  const rows = filtered.map(s => [
    s.posting_date,
    s.ref,
    `"${(s.customers as any)?.name || s.description || ''}"`,
    (s.customers as any)?.whatsapp || '',
    s.payment_method || '',
    s.posted_by || '',
    s.status || '',
    String(s.total_amount || 0),
  ])
  rows.push(['TOTALS','','','','','','',String(totalRevenue)])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `Sales_Day_Book_${fromDate}_to_${toDate}.csv`; a.click()
}

export function exportPDF(data: ExportData) {
  const {
    filtered, expenses, creditNotes, paymentSplit, expenseSplit,
    totalRevenue, totalExpenses, totalCreditNotes, netSales,
    fromDate, toDate, tplSettings,
  } = data
  if (filtered.length === 0) return

  const now = new Date().toLocaleString('en-GB')
  const t = tplSettings
  const pc = t.primary_color || '#85c2be'

  const logoHtml = t.logo_url
    ? `<img src="${t.logo_url}" alt="Logo" style="width:${t.logo_width}px;height:auto;object-fit:contain" />`
    : `<div class="logo-mark"><div class="logo-inner"></div></div>`
  const logoAlign = t.logo_position === 'center' ? 'center' : t.logo_position === 'right' ? 'flex-end' : 'flex-start'

  const bankingRows = Object.entries(paymentSplit).map(([method, amount]) => {
    const pct = totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(0) : '0'
    return `<tr><td>${method}</td><td class="num">${Math.round(amount).toLocaleString()}</td><td class="num">${pct}%</td></tr>`
  }).join('')

  const expenseRows = expenses.map(e =>
    `<tr><td class="ref">${e.ref}</td><td>${e.description || '—'}</td><td>${e.payment_method || 'Cash'}</td><td class="num">${(e.total_amount || 0).toLocaleString()}</td></tr>`
  ).join('')

  const tableRows = filtered.map(s =>
    `<tr>
      <td>${s.posting_date}</td>
      <td class="ref">${s.ref}</td>
      <td>${(s.customers as any)?.name || '—'}</td>
      <td class="mono">${(s.customers as any)?.whatsapp || '—'}</td>
      <td><span class="pill ${s.payment_method?.includes('Cash') ? 'pill-g' : s.payment_method?.includes('M-Pesa') ? 'pill-b' : 'pill-a'}">${s.payment_method || '—'}</span></td>
      <td>${s.posted_by || '—'}</td>
      <td><span class="pill ${s.status === 'posted' ? 'pill-g' : 'pill-y'}">${s.status === 'draft' ? 'POD' : 'Posted'}</span></td>
      <td class="num">${(s.total_amount || 0).toLocaleString()}</td>
    </tr>`
  ).join('')

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Day Book</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Instrument Sans','Helvetica Neue',sans-serif;color:#1a1a1a;padding:0;background:#fff}
      .page{max-width:1000px;margin:0 auto;padding:0}
      .header{display:flex;justify-content:space-between;align-items:center;padding:24px 40px;background:${pc};color:#fff}
      .logo-area{display:flex;align-items:center;gap:14;justify-content:${logoAlign}}
      .logo-mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}
      .logo-inner{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.5)}
      .company-name{font-family:'Syne',serif;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff}
      .company-sub{font-size:10px;color:rgba(255,255,255,.75);margin-top:3px}
      .doc-title{font-family:'Syne',serif;font-size:22px;font-weight:800;text-align:right;color:#fff}
      .doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);text-align:right;margin-top:4px;line-height:1.6}
      .content{padding:28px 40px}
      .stats{display:flex;gap:12px;margin-bottom:24px}
      .stat{flex:1;background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:14px 16px}
      .stat-label{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      .stat-val{font-family:'DM Mono',monospace;font-size:18px;font-weight:700}
      .stat-val.green{color:#1a7a4a} .stat-val.blue{color:#2563eb} .stat-val.amber{color:#d48744} .stat-val.red{color:#c0392b}
      .section-title{font-family:'Syne',serif;font-size:13px;font-weight:700;margin-bottom:10px;color:#333}
      .split-grid{display:flex;gap:20px;margin-bottom:24px}
      .split-grid>div{flex:1}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{text-align:left;padding:8px 10px;background:#f5f5f5;border-bottom:2px solid #ddd;font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#888}
      td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
      .num{text-align:right;font-family:'DM Mono',monospace}
      .ref{font-family:'DM Mono',monospace;color:#D48744;font-weight:600}
      .mono{font-family:'DM Mono',monospace;font-size:10px;color:#888}
      .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}
      .pill-g{background:#e6f9f0;color:#1a7a4a} .pill-b{background:#e8f0fe;color:#2563eb}
      .pill-a{background:#fff3e0;color:#d48744} .pill-y{background:#fef9e7;color:#b8860b}
      .total-row{background:#f5f5f5;font-weight:700}
      .total-row td{padding:10px;border-top:2px solid #ddd}
      .footer{margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;display:flex;justify-content:space-between}
      @media print{body{padding:0}.content{padding:20px 30px}@page{margin:10mm 8mm}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style>
  </head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          ${logoHtml}
          <div>
            <div class="company-name">${t.company_name}</div>
            <div class="company-sub">${t.company_tagline} · Sales Day Book</div>
          </div>
        </div>
        <div>
          <div class="doc-title">Sales Day Book</div>
          <div class="doc-meta">Period: ${fromDate} to ${toDate}<br>Generated: ${now}<br>${filtered.length} transactions</div>
        </div>
      </div>

      <div class="content">
      <div class="stats">
        <div class="stat"><div class="stat-label">Gross Sales</div><div class="stat-val green">TZS ${totalRevenue.toLocaleString()}</div></div>
        <div class="stat"><div class="stat-label">Credit Notes</div><div class="stat-val" style="color:${totalCreditNotes > 0 ? '#c0392b' : '#999'}">${totalCreditNotes > 0 ? '(TZS ' + totalCreditNotes.toLocaleString() + ')' : 'None'}</div></div>
        <div class="stat"><div class="stat-label">Net Sales</div><div class="stat-val green">TZS ${netSales.toLocaleString()}</div></div>
        <div class="stat"><div class="stat-label">Expenses</div><div class="stat-val red">TZS ${totalExpenses.toLocaleString()}</div></div>
        <div class="stat" style="background:${(netSales - totalExpenses) >= 0 ? '#f0faf7' : '#fef2f2'};border-color:${(netSales - totalExpenses) >= 0 ? pc + '40' : '#fca5a540'}"><div class="stat-label">Net Position</div><div class="stat-val" style="color:${(netSales - totalExpenses) >= 0 ? '#1a7a4a' : '#c0392b'}">TZS ${(netSales - totalExpenses).toLocaleString()}</div></div>
      </div>

      <div class="split-grid">
        <div>
          <div class="section-title">Banking Summary</div>
          <table><thead><tr><th>Method / Bank</th><th class="num">Received (TZS)</th><th class="num">Share</th></tr></thead>
          <tbody>${bankingRows}</tbody>
          <tfoot><tr class="total-row"><td>Total Received</td><td class="num">${totalRevenue.toLocaleString()}</td><td class="num">100%</td></tr></tfoot>
          </table>
        </div>
        <div>
          <div class="section-title">Expense Summary</div>
          ${expenses.length > 0 ? `
            <table><thead><tr><th>Ref</th><th>Description</th><th>Paid From</th><th class="num">Amount (TZS)</th></tr></thead>
            <tbody>${expenseRows}</tbody>
            <tfoot><tr class="total-row"><td colspan="3">Total Expenses</td><td class="num">${totalExpenses.toLocaleString()}</td></tr></tfoot>
            </table>
            ${Object.keys(expenseSplit).length > 1 ? `
              <div style="margin-top:12px;font-size:10px;color:#888;font-family:'DM Mono',monospace">
                ${Object.entries(expenseSplit).map(([m, a]) => `${m}: TZS ${Math.round(a).toLocaleString()}`).join(' · ')}
              </div>
            ` : ''}
          ` : '<div style="font-size:12px;color:#bbb;padding:16px 0">No expenses recorded for this period.</div>'}
        </div>
      </div>

      <div class="section-title">Transaction Detail</div>
      <table>
        <thead><tr><th>Date</th><th>Ref</th><th>Customer</th><th>WhatsApp</th><th>Payment</th><th>Salesperson</th><th>Status</th><th class="num">Amount (TZS)</th></tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr class="total-row"><td colspan="7">Sales Subtotal — ${filtered.length} transactions</td><td class="num">${totalRevenue.toLocaleString()}</td></tr>
          ${creditNotes.length > 0 ? `
            ${creditNotes.map(c => `<tr style="color:#c0392b"><td>${c.posting_date}</td><td class="ref" style="color:#c0392b">${c.ref}</td><td colspan="5">${c.description || 'Credit Note'}</td><td class="num">(${(c.total_amount || 0).toLocaleString()})</td></tr>`).join('')}
            <tr style="background:#fef2f2;font-weight:700"><td colspan="7">Total Credit Notes</td><td class="num" style="color:#c0392b">(${totalCreditNotes.toLocaleString()})</td></tr>
          ` : ''}
          <tr style="background:#e6f9f0;font-weight:800"><td colspan="7" style="padding:12px 10px;font-size:13px">NET SALES</td><td class="num" style="padding:12px 10px;font-size:15px;color:#1a7a4a">${netSales.toLocaleString()}</td></tr>
        </tfoot>
      </table>

      <div class="footer">
        <div>${t.company_name} · Dar es Salaam, Tanzania</div>
        <div>Generated ${now} · MalkiaOS</div>
      </div>
      </div>
    </div>
  </body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 600)
}
