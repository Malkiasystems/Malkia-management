// ════════════════════════════════════════════════════════════════════════════
// bankStatementExport.ts
//
// Bank / cash account statement exports: CSV, Excel, branded PDF.
// Pure functions that receive all data as arguments, same shape as
// expenseRegisterExport.ts and salesDayBookExport.ts.
//
// Callers must pass rows in CHRONOLOGICAL order with each row's own
// running balance. The old in-page CSV export recomputed the running column
// over the display array — which is sorted newest-first — starting from
// zero, so every exported balance was cumulative-backwards. Moving the
// export here, fed by the same per-row running_balance the screen shows,
// retires that bug in all three formats at once.
//
// The Time column comes from journal_lines.created_at. posting_date is a DATE
// with no time component, so without it two entries on the same day are
// indistinguishable on paper and unorderable on screen.
//
// Exports are ALWAYS chronological regardless of any on-screen column sort.
// A statement is an accounting document; date order is the only correct
// order for one.
// ════════════════════════════════════════════════════════════════════════════

import * as XLSX from 'xlsx'
import { printHtmlDocument } from './printDocument'

export interface StatementExportRow {
  date: string
  /** Clock time the entry was recorded, pre-formatted by the caller (e.g. "13:52").
   *  posting_date is a DATE and carries no time, so this comes from
   *  journal_lines.created_at via entryTime(). */
  time?: string
  ref: string
  type: string
  description: string
  moneyIn: number      // 0 when none
  moneyOut: number     // 0 when none
  balance: number      // this entry's running balance for the period
}

export interface StatementExportMeta {
  accountName: string
  accountCode: string
  accountNumber?: string | null
  fromDate: string
  toDate: string
  totalIn: number
  totalOut: number
  netFlow: number
  count: number
}

const HEAD = ['Date', 'Time', 'Reference', 'Type', 'Description', 'Money In (TZS)', 'Money Out (TZS)', 'Balance (TZS)']
const money = (n: number) => Math.round(n).toLocaleString()

const fileStamp = (m: StatementExportMeta) =>
  `${m.accountName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-statement-${m.fromDate}-to-${m.toDate}`

// ─── CSV ─────────────────────────────────────────────────────────────────────
export function exportStatementCSV(rows: StatementExportRow[], meta: StatementExportMeta) {
  const escape = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map(r =>
    [r.date, r.time || '', r.ref, r.type, r.description, r.moneyIn || '', r.moneyOut || '', r.balance]
      .map(escape).join(',')
  )
  const csv = [HEAD.map(escape).join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileStamp(meta)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Excel ───────────────────────────────────────────────────────────────────
export function exportStatementExcel(rows: StatementExportRow[], meta: StatementExportMeta) {
  const aoa: (string | number)[][] = [
    [`${meta.accountName} — Statement`],
    [`GL ${meta.accountCode}${meta.accountNumber ? ` · A/C ${meta.accountNumber}` : ''}`],
    [`Period: ${meta.fromDate} to ${meta.toDate}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    HEAD,
    ...rows.map(r => [r.date, r.time || '', r.ref, r.type, r.description, r.moneyIn || '', r.moneyOut || '', r.balance]),
    [],
    ['', '', '', '', '', 'Money In', meta.totalIn],
    ['', '', '', '', '', 'Money Out', meta.totalOut],
    ['', '', '', '', '', 'Net Flow', meta.netFlow],
    ['', '', '', '', '', 'Entries', meta.count],
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 44 },
    { wch: 15 }, { wch: 15 }, { wch: 16 },
  ]
  const wb = XLSX.utils.book_new()
  // Sheet names cap at 31 chars and reject : \ / ? * [ ]
  const sheet = meta.accountName.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Statement'
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  XLSX.writeFile(wb, `${fileStamp(meta)}.xlsx`)
}

// ─── PDF (branded print window) ──────────────────────────────────────────────
export function exportStatementPDF(rows: StatementExportRow[], meta: StatementExportMeta): { ok: boolean; error?: string } {
  const bodyRows = rows.map(r => `
    <tr>
      <td class="mono">${esc(r.date)}</td>
      <td class="mono">${esc(r.time || '—')}</td>
      <td class="mono">${esc(r.ref)}</td>
      <td>${esc(r.type)}</td>
      <td>${esc(r.description)}</td>
      <td class="num in">${r.moneyIn ? money(r.moneyIn) : '—'}</td>
      <td class="num out">${r.moneyOut ? `(${money(r.moneyOut)})` : '—'}</td>
      <td class="num">${money(r.balance)}</td>
    </tr>`).join('')

  const res = printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(meta.accountName)} — Statement</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;padding:24px}
      .brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #5EA8A2;padding-bottom:12px;margin-bottom:16px}
      .brand h1{font-size:20px;color:#5E2230}
      .brand .co{font-size:13px;color:#5EA8A2;font-weight:700;letter-spacing:.5px}
      .meta{font-size:11px;color:#555}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#5EA8A2;color:#fff;text-align:left;padding:6px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
      th.num{text-align:right}
      td{padding:5px 7px;border-bottom:1px solid #eee}
      tr:nth-child(even) td{background:#f7faf9}
      .num{text-align:right;font-variant-numeric:tabular-nums;font-family:'DM Mono',monospace}
      .mono{font-family:'DM Mono',monospace}
      .in{color:#0a7d4f}.out{color:#a02525}
      .totals{margin-top:16px;display:flex;gap:28px;justify-content:flex-end;font-size:12px}
      .totals b{color:#5E2230}
      @media print{ body{padding:0} @page{size:A4 portrait;margin:12mm} }
    </style></head><body>
    <div class="brand">
      <div>
        <div class="co">MALKIA WELLNESS GROUP</div>
        <h1>${esc(meta.accountName)} — Statement</h1>
        <div class="meta">GL ${esc(meta.accountCode)}${meta.accountNumber ? ` · A/C ${esc(meta.accountNumber)}` : ''}</div>
      </div>
      <div class="meta" style="text-align:right">
        Period: ${esc(meta.fromDate)} to ${esc(meta.toDate)}<br>
        Generated: ${esc(new Date().toLocaleString())}<br>
        ${meta.count} entries
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Date</th><th>Time</th><th>Reference</th><th>Type</th><th>Description</th>
        <th class="num">Money In</th><th class="num">Money Out</th><th class="num">Balance</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="totals">
      <div>Money In: <b>TZS ${money(meta.totalIn)}</b></div>
      <div>Money Out: <b>(TZS ${money(meta.totalOut)})</b></div>
      <div>Net Flow: <b>TZS ${money(meta.netFlow)}</b></div>
    </div>
  </body></html>`)
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}
