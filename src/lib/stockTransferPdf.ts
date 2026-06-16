/**
 * Stock Transfer Note
 * ─────────────────────────────────────────────────────────────────────────
 * Prints a branded delivery-note style document for a stock transfer, using
 * the same approach as stockReportExport (a print-ready window where the user
 * picks "Save as PDF"). Consistent feel, free pagination, zero new deps.
 *
 * showValues=false hides all cost/value figures, so a money-blind Stock
 * Manager can still produce a proper transfer note without seeing cost data.
 */

import { supabase } from './supabase'

export interface TransferNoteLine {
  name: string
  sku?: string
  qty: number
  cost?: number   // unit cost; shown only when showValues
}

export interface TransferNoteData {
  ref: string
  date: string
  fromLabel: string
  toLabel: string
  notes?: string
  postedBy?: string
  lines: TransferNoteLine[]
  showValues?: boolean
}

interface ReportTemplate {
  logo_url: string | null
  logo_width: number
  company_name: string
  company_tagline: string
  primary_color: string
}

const DEFAULT_TEMPLATE: ReportTemplate = {
  logo_url: null,
  logo_width: 120,
  company_name: 'Malkia Wellness Group Ltd',
  company_tagline: 'Reimagining Motherhood',
  primary_color: '#85c2be',
}

async function loadTemplate(): Promise<ReportTemplate> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'report_templates')
      .maybeSingle()
    if (data?.value && typeof data.value === 'object') {
      return { ...DEFAULT_TEMPLATE, ...(data.value as Partial<ReportTemplate>) }
    }
  } catch {
    // swallow — defaults below
  }
  return DEFAULT_TEMPLATE
}

const escapeHtml = (s: string | undefined | null): string => {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

const fmtQty = (n: number): string =>
  (n == null || isNaN(n)) ? '0' : Number(Math.abs(n)).toLocaleString(undefined, { maximumFractionDigits: 2 })

const fmtMoney = (n: number | undefined): string =>
  (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString()

/**
 * Opens a branded print window for a single stock transfer. Best-effort:
 * if the browser blocks the pop-up, the caller is told to allow pop-ups.
 * Never throws back to the caller in a way that should block a post.
 */
export async function printStockTransferNote(data: TransferNoteData): Promise<void> {
  // Open the window FIRST (synchronously) so it stays tied to the user's
  // click and is less likely to be blocked, then fill it after the async
  // template load.
  const win = window.open('', '_blank')
  if (!win) {
    alert('Could not open the transfer note — please allow pop-ups for this site, then use the PDF button in the Stock Transfer Register.')
    return
  }
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading…</title></head><body style="font-family:sans-serif;padding:40px;color:#666">Preparing transfer note…</body></html>')

  const tpl = await loadTemplate()
  const pc = tpl.primary_color || '#85c2be'
  const now = new Date().toLocaleString('en-GB')
  const showValues = !!data.showValues

  const totalQty = data.lines.reduce((s, l) => s + Math.abs(l.qty || 0), 0)
  const totalValue = data.lines.reduce((s, l) => s + Math.abs(l.qty || 0) * (l.cost || 0), 0)

  const rowsHtml = data.lines.map((l, i) => {
    const value = Math.abs(l.qty || 0) * (l.cost || 0)
    return `<tr>
      <td class="num mono" style="color:#aaa">${i + 1}</td>
      <td class="mono">${escapeHtml(l.sku || '')}</td>
      <td>${escapeHtml(l.name)}</td>
      <td class="num"><strong>${fmtQty(l.qty)}</strong></td>
      ${showValues ? `<td class="num">${fmtMoney(l.cost)}</td><td class="num">${fmtMoney(value)}</td>` : ''}
    </tr>`
  }).join('')

  const colCount = showValues ? 6 : 4
  const totalsHtml = `<tr class="total-row">
    <td colspan="3"><strong>TOTAL · ${data.lines.length} item${data.lines.length === 1 ? '' : 's'}</strong></td>
    <td class="num"><strong>${fmtQty(totalQty)}</strong></td>
    ${showValues ? `<td></td><td class="num"><strong>${fmtMoney(totalValue)}</strong></td>` : ''}
  </tr>`

  const logoHtml = tpl.logo_url
    ? `<img src="${tpl.logo_url}" alt="Logo" style="width:${tpl.logo_width}px;height:auto;object-fit:contain" />`
    : `<div class="logo-mark"><div class="logo-inner"></div></div>`

  win.document.open()
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transfer Note ${escapeHtml(data.ref)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Instrument Sans','Helvetica Neue',sans-serif;color:#1a1a1a;background:#fff}
      .page{max-width:820px;margin:0 auto}
      .header{display:flex;justify-content:space-between;align-items:center;padding:24px 40px;background:${pc};color:#fff}
      .logo-area{display:flex;align-items:center;gap:14px}
      .logo-mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}
      .logo-inner{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.5)}
      .company-name{font-family:'Syne',serif;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff}
      .company-sub{font-size:10px;color:rgba(255,255,255,.75);margin-top:3px}
      .doc-title{font-family:'Syne',serif;font-size:22px;font-weight:800;text-align:right;color:#fff}
      .doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);text-align:right;margin-top:4px;line-height:1.6}
      .content{padding:24px 40px}
      .route{display:flex;align-items:stretch;gap:14px;margin-bottom:22px}
      .loc{flex:1;background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:12px 14px}
      .loc-label{font-family:'DM Mono',monospace;font-size:8.5px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
      .loc-val{font-size:14px;font-weight:600}
      .arrow{display:flex;align-items:center;font-size:22px;color:${pc};font-weight:800}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:22px}
      th{text-align:left;padding:7px 8px;background:#f5f5f5;border-bottom:2px solid #ddd;font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#888}
      td{padding:7px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top}
      .num{text-align:right;font-family:'DM Mono',monospace}
      .mono{font-family:'DM Mono',monospace}
      .total-row td{background:#f5f5f5;padding:9px 8px;border-top:2px solid #ddd;border-bottom:none;font-size:12px}
      .notes{font-size:11px;color:#555;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:26px}
      .sigs{display:flex;gap:40px;margin-top:36px}
      .sig{flex:1}
      .sig-line{border-top:1px solid #999;margin-top:34px;padding-top:6px;font-size:10px;color:#777;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
      .footer{margin-top:30px;padding-top:14px;border-top:1px solid #eee;font-size:9.5px;color:#999;display:flex;justify-content:space-between}
      @media print{
        @page{size:A4 portrait;margin:10mm}
        .header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }
    </style>
  </head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(tpl.company_name)}</div>
            <div class="company-sub">${escapeHtml(tpl.company_tagline)} · Stock Transfer Note</div>
          </div>
        </div>
        <div>
          <div class="doc-title">Transfer Note</div>
          <div class="doc-meta">
            Ref: ${escapeHtml(data.ref)}<br>
            Date: ${escapeHtml(data.date)}<br>
            Printed: ${now}${data.postedBy ? `<br>By: ${escapeHtml(data.postedBy)}` : ''}
          </div>
        </div>
      </div>

      <div class="content">
        <div class="route">
          <div class="loc"><div class="loc-label">From</div><div class="loc-val">${escapeHtml(data.fromLabel)}</div></div>
          <div class="arrow">&rarr;</div>
          <div class="loc"><div class="loc-label">To</div><div class="loc-val">${escapeHtml(data.toLabel)}</div></div>
        </div>

        <table>
          <thead><tr>
            <th style="width:36px;text-align:right">#</th>
            <th style="width:90px">SKU</th>
            <th>Product</th>
            <th style="width:70px;text-align:right">Qty</th>
            ${showValues ? '<th style="width:90px;text-align:right">Unit Cost</th><th style="width:100px;text-align:right">Value</th>' : ''}
          </tr></thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="${colCount}" style="text-align:center;color:#999;padding:20px">No items.</td></tr>`}
            ${totalsHtml}
          </tbody>
        </table>

        ${data.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(data.notes)}</div>` : ''}

        <div class="sigs">
          <div class="sig"><div class="sig-line">Released by (name &amp; signature)</div></div>
          <div class="sig"><div class="sig-line">Received by (name &amp; signature)</div></div>
        </div>

        <div class="footer">
          <span>${escapeHtml(tpl.company_name)} · Stock Transfer Note ${escapeHtml(data.ref)}</span>
          <span>Total stock unchanged — internal movement only</span>
        </div>
      </div>
    </div>
    <script>
      const ready = () => { try { window.focus(); window.print(); } catch(e){} }
      const img = document.querySelector('img')
      if (img && !img.complete) {
        img.addEventListener('load', ready); img.addEventListener('error', ready)
        setTimeout(ready, 2000)
      } else if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(ready).catch(ready)
      } else { setTimeout(ready, 400) }
    </script>
  </body></html>`)
  win.document.close()
}
