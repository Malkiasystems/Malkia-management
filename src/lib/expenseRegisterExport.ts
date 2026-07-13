// ─── expenseRegisterExport ─────────────────────────────────────────────────
// Excel (.xlsx) and PDF export for the Expense Register transactions.
// Excel uses SheetJS (already used elsewhere in the app). PDF uses a branded
// print window — the same approach as the Stock Report and Sales Day Book —
// so pagination and "Save as PDF" come free from the browser.
// ───────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx'

export interface ExpenseExportRow {
  date: string
  ref: string
  type: string
  vendor: string
  category: string
  description: string
  method: string
  amount: number
  status: string
  postedBy: string
}

export interface ExpenseExportMeta {
  title: string          // e.g. "Expense Register"
  fromDate: string
  toDate: string
  cashOut: number
  bankOut: number
  totalOut: number
  count: number
}

const HEAD = ['Date', 'Ref', 'Type', 'Vendor / Payee', 'Category', 'Description', 'Method', 'Amount (TZS)', 'Status', 'Posted By']
const money = (n: number) => Math.round(n).toLocaleString()
const fileStamp = (m: ExpenseExportMeta) => `${m.title.replace(/\s+/g, '_')}_${m.fromDate}_to_${m.toDate}`

// ─── Excel ───────────────────────────────────────────────────────────────────
export function exportExpenseExcel(rows: ExpenseExportRow[], meta: ExpenseExportMeta) {
  const aoa: (string | number)[][] = [
    [meta.title],
    [`Period: ${meta.fromDate} to ${meta.toDate}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    HEAD,
    ...rows.map(r => [r.date, r.ref, r.type, r.vendor, r.category, r.description, r.method, r.amount, r.status, r.postedBy]),
    [],
    ['', '', '', '', '', '', 'Cash Out', meta.cashOut],
    ['', '', '', '', '', '', 'Bank Out', meta.bankOut],
    ['', '', '', '', '', '', 'Total Paid Out', meta.totalOut],
    ['', '', '', '', '', '', 'Records', meta.count],
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 24 },
    { wch: 34 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 16 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
  XLSX.writeFile(wb, `${fileStamp(meta)}.xlsx`)
}

// ─── PDF (branded print window) ──────────────────────────────────────────────
export function exportExpensePDF(rows: ExpenseExportRow[], meta: ExpenseExportMeta) {
  const win = window.open('', '_blank')
  if (!win) return

  const bodyRows = rows.map(r => `
    <tr>
      <td class="mono">${esc(r.date)}</td>
      <td class="mono">${esc(r.ref)}</td>
      <td>${esc(r.type)}</td>
      <td>${esc(r.vendor)}</td>
      <td>${esc(r.category)}</td>
      <td>${esc(r.description)}</td>
      <td>${esc(r.method)}</td>
      <td class="num">${money(r.amount)}</td>
      <td>${esc(r.status)}</td>
      <td>${esc(r.postedBy)}</td>
    </tr>`).join('')

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;padding:24px}
      .brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #5EA8A2;padding-bottom:12px;margin-bottom:16px}
      .brand h1{font-size:22px;color:#5E2230}
      .brand .co{font-size:13px;color:#5EA8A2;font-weight:700;letter-spacing:.5px}
      .meta{font-size:11px;color:#555;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#5EA8A2;color:#fff;text-align:left;padding:6px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
      td{padding:5px 7px;border-bottom:1px solid #eee}
      tr:nth-child(even) td{background:#f7faf9}
      .num{text-align:right;font-variant-numeric:tabular-nums;font-family:'DM Mono',monospace}
      .mono{font-family:'DM Mono',monospace}
      tfoot td{border-top:2px solid #5EA8A2;font-weight:700;font-size:11px;padding-top:8px}
      .totals{margin-top:16px;display:flex;gap:28px;justify-content:flex-end;font-size:12px}
      .totals b{color:#5E2230}
      @media print{ body{padding:0} @page{size:A4 landscape;margin:12mm} }
    </style></head><body>
    <div class="brand">
      <div><div class="co">MALKIA WELLNESS GROUP</div><h1>${esc(meta.title)}</h1></div>
      <div class="meta" style="text-align:right">Period: ${esc(meta.fromDate)} to ${esc(meta.toDate)}<br>Generated: ${esc(new Date().toLocaleString())}<br>${meta.count} records</div>
    </div>
    <table>
      <thead><tr>${HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="totals">
      <div>Cash Out: <b>TZS ${money(meta.cashOut)}</b></div>
      <div>Bank Out: <b>TZS ${money(meta.bankOut)}</b></div>
      <div>Total Paid Out: <b>TZS ${money(meta.totalOut)}</b></div>
    </div>
  </body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}
