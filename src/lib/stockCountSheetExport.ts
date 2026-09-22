/**
 * Stock Count Sheet Export
 * ─────────────────────────────────────────────────────────────────────────
 * Prints a BLANK physical count sheet: every active product, one row each,
 * with an empty ruled box per stock location for the counter to write the
 * quantity found on the shelf. Letterheaded like every other official
 * Malkia document (same report_templates source as the Stock Summary and
 * Valuation Report) with the marketing footer from the receipt settings.
 *
 * DELIBERATELY BLIND: system quantities are NOT printed. If the paper
 * says the system expects 40, the counter's eye finds 40. A blank box
 * forces a real count — the same philosophy the Stock Count workflow
 * (StockCount.tsx) already uses for its per-count sheets. This sheet is
 * the lighter companion: no count record needed, print and go. Enter the
 * figures through Stock Count afterwards to post the adjustments.
 *
 * Rows are grouped by category with a shaded divider row, because a
 * physical count walks the shelves category by category, not A to Z
 * across the whole store.
 *
 * Uses the same popup-then-iframe print helper as everything else, so
 * popup blockers cannot make the button appear dead.
 */

import { supabase } from './supabase'
import { printHtmlDocument } from './printDocument'

export interface CountSheetItem {
  sku: string
  name: string
  category: string
  unit?: string
}

export interface CountSheetLocation {
  code: string
  name: string
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

interface MarketingFooter { website: string; instagram: string }
const DEFAULT_FOOTER: MarketingFooter = { website: 'www.malkia.co.tz', instagram: '@malkia_tz' }

/** Same source as stockReportExport: system_settings.report_templates.
 *  Never throws — a misconfigured row must not block a stock count. */
async function loadTemplate(): Promise<ReportTemplate> {
  try {
    const { data } = await supabase
      .from('system_settings').select('value').eq('key', 'report_templates').maybeSingle()
    if (data?.value && typeof data.value === 'object') {
      return { ...DEFAULT_TEMPLATE, ...(data.value as Partial<ReportTemplate>) }
    }
  } catch { /* defaults below */ }
  return DEFAULT_TEMPLATE
}

/** Website + Instagram handle come from the receipt template settings,
 *  the same place every customer-facing document reads them, so the
 *  footer stays consistent if the handle ever changes. The value is
 *  stored as a JSON string by ReceiptTemplate.tsx, hence the parse. */
async function loadFooter(): Promise<MarketingFooter> {
  try {
    const { data } = await supabase
      .from('system_settings').select('value').eq('key', 'receipt_template').maybeSingle()
    let v: unknown = data?.value
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = null } }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      return {
        website: typeof o.website === 'string' && o.website ? o.website : DEFAULT_FOOTER.website,
        instagram: typeof o.instagram === 'string' && o.instagram ? o.instagram : DEFAULT_FOOTER.instagram,
      }
    }
  } catch { /* defaults below */ }
  return DEFAULT_FOOTER
}

const escapeHtml = (s: string | undefined | null): string => {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

/**
 * Open the print dialog with the count sheet. Returns immediately; the
 * spawned window handles printing (paper or Save as PDF).
 */
export async function exportStockCountSheet(
  items: CountSheetItem[],
  locations: CountSheetLocation[],
  opts: { generatedBy?: string } = {},
): Promise<void> {
  if (items.length === 0) {
    alert('Nothing to print — there are no active products.')
    return
  }

  const tpl = await loadTemplate()
  const foot = await loadFooter()
  const pc = tpl.primary_color || '#85c2be'
  const now = new Date().toLocaleString('en-GB')

  // Category-grouped, name-sorted: the order you walk the shelves in.
  const sorted = [...items].sort((a, b) =>
    (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''))

  // With no locations configured the sheet still works: one unlabelled
  // count column. With many, the boxes narrow; four or fewer keeps them
  // comfortably writable on A4 landscape.
  const locs: CountSheetLocation[] = locations.length > 0
    ? locations
    : [{ code: '', name: 'Count' }]

  const locHeaderHtml = locs.map(l =>
    `<th class="cnt" title="${escapeHtml(l.name)}">${escapeHtml(l.code || l.name)}</th>`).join('')

  let rowNo = 0
  let lastCat = '\u0000'
  const bodyRows: string[] = []
  for (const it of sorted) {
    const cat = it.category || 'Uncategorised'
    if (cat !== lastCat) {
      lastCat = cat
      bodyRows.push(
        `<tr class="cat-row"><td colspan="${4 + locs.length + 2}">${escapeHtml(cat)}</td></tr>`)
    }
    rowNo++
    const boxes = locs.map(() => `<td class="box"></td>`).join('')
    bodyRows.push(`<tr>
      <td class="num mono dim">${rowNo}</td>
      <td class="mono">${escapeHtml(it.sku)}</td>
      <td>${escapeHtml(it.name)}</td>
      <td class="mono dim">${escapeHtml(it.unit || '')}</td>
      ${boxes}
      <td class="box total-box"></td>
      <td class="box remarks-box"></td>
    </tr>`)
  }

  const logoHtml = tpl.logo_url
    ? `<img src="${tpl.logo_url}" alt="Logo" style="width:${tpl.logo_width}px;height:auto;object-fit:contain" />`
    : `<div class="logo-mark"><div class="logo-inner"></div></div>`

  // The locations box the counters tick as they cover each store/shelf.
  const locLegend = locations.length > 0 ? `
    <div class="loc-box">
      <div class="loc-box-title">Locations on this sheet — tick each when its column is fully counted</div>
      <div class="loc-box-items">
        ${locations.map(l => `<span class="loc-item"><span class="tick"></span><strong>${escapeHtml(l.code)}</strong> ${escapeHtml(l.name)}</span>`).join('')}
      </div>
    </div>` : ''

  const printRes = printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Physical Stock Count Sheet</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Instrument Sans','Helvetica Neue',sans-serif;color:#1a1a1a;background:#fff}
      .page{max-width:1100px;margin:0 auto}
      .header{display:flex;justify-content:space-between;align-items:center;padding:24px 40px;background:${pc};color:#fff}
      .logo-area{display:flex;align-items:center;gap:14px}
      .logo-mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}
      .logo-inner{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.5)}
      .company-name{font-family:'Syne',serif;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff}
      .company-sub{font-size:10px;color:rgba(255,255,255,.75);margin-top:3px}
      .doc-title{font-family:'Syne',serif;font-size:22px;font-weight:800;text-align:right;color:#fff}
      .doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);text-align:right;margin-top:4px;line-height:1.6}
      .content{padding:22px 40px}
      .count-meta{display:flex;gap:24px;margin-bottom:14px;font-size:11px}
      .count-meta .fld{display:flex;align-items:baseline;gap:8px}
      .count-meta .lbl{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.8px}
      .count-meta .line{display:inline-block;min-width:150px;border-bottom:1px solid #999}
      .loc-box{border:1.5px solid ${pc};border-radius:8px;padding:10px 14px;margin-bottom:16px;background:#fbfefe}
      .loc-box-title{font-family:'DM Mono',monospace;font-size:9px;color:#777;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px}
      .loc-box-items{display:flex;flex-wrap:wrap;gap:16px;font-size:11px}
      .loc-item{display:flex;align-items:center;gap:7px}
      .tick{display:inline-block;width:13px;height:13px;border:1.5px solid #888;border-radius:3px}
      table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed}
      th{padding:7px 6px;background:#f5f5f5;border:1px solid #ccc;font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#666;text-align:left}
      th.cnt{text-align:center;width:${locs.length > 3 ? 66 : 82}px;background:#eef6f5}
      th.tot{text-align:center;width:70px}
      th.rem{width:110px}
      td{padding:6px;border:1px solid #d8d8d8;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      td.box{background:#fff;height:26px}
      td.total-box{background:#f7fbfa}
      .num{text-align:right;font-family:'DM Mono',monospace}
      .mono{font-family:'DM Mono',monospace}
      .dim{color:#999}
      .cat-row td{background:${pc}22;border:1px solid #ccc;font-family:'Syne',serif;font-weight:800;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#333;padding:5px 8px}
      .sig-grid{display:flex;gap:28px;margin-top:26px;page-break-inside:avoid}
      .sig{flex:1}
      .sig .role{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.8px;margin-bottom:26px}
      .sig .line{border-bottom:1px solid #888;margin-bottom:5px}
      .sig .cap{font-size:9px;color:#999}
      .footer{margin-top:20px;padding-top:12px;border-top:1px solid #eee;font-size:9.5px;color:#999;display:flex;justify-content:space-between}
      @media print{
        .content{padding:16px 24px}
        @page{size:A4 landscape;margin:8mm 6mm}
        .header,.cat-row td,th.cnt,td.total-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        thead{display:table-header-group}
        tr{page-break-inside:avoid}
      }
    </style>
  </head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(tpl.company_name)}</div>
            <div class="company-sub">${escapeHtml(tpl.company_tagline)} · Official Document</div>
          </div>
        </div>
        <div>
          <div class="doc-title">Physical Stock Count Sheet</div>
          <div class="doc-meta">
            Printed: ${now}<br>
            ${sorted.length} items · ${locations.length || 1} location${(locations.length || 1) === 1 ? '' : 's'}${opts.generatedBy ? `<br>Prepared by: ${escapeHtml(opts.generatedBy)}` : ''}
          </div>
        </div>
      </div>

      <div class="content">
        <div class="count-meta">
          <span class="fld"><span class="lbl">Count date</span><span class="line"></span></span>
          <span class="fld"><span class="lbl">Count team</span><span class="line" style="min-width:260px"></span></span>
          <span class="fld"><span class="lbl">Sheet</span><span class="line" style="min-width:60px"></span><span style="color:#999">of</span><span class="line" style="min-width:60px"></span></span>
        </div>

        ${locLegend}

        <table>
          <thead><tr>
            <th style="width:34px;text-align:right">#</th>
            <th style="width:78px">SKU</th>
            <th>Product</th>
            <th style="width:52px">Unit</th>
            ${locHeaderHtml}
            <th class="tot">Total</th>
            <th class="rem">Remarks</th>
          </tr></thead>
          <tbody>${bodyRows.join('')}</tbody>
        </table>

        <div class="sig-grid">
          <div class="sig"><div class="role">Counted by</div><div class="line"></div><div class="cap">Name, signature &amp; date</div></div>
          <div class="sig"><div class="role">Checked by</div><div class="line"></div><div class="cap">Name, signature &amp; date</div></div>
          <div class="sig"><div class="role">Entered into MalkiaOS by</div><div class="line"></div><div class="cap">Name, signature &amp; date</div></div>
        </div>

        <div class="footer">
          <span>${escapeHtml(tpl.company_name)} · ${escapeHtml(foot.website)} · ${escapeHtml(foot.instagram)}</span>
          <span>Count quantities by hand — system figures are intentionally not shown</span>
        </div>
      </div>
    </div>
    <script>
      // Fire the print dialog once the logo (the slow asset) has settled.
      const ready = () => { try { window.focus(); window.print(); } catch(e){} }
      const img = document.querySelector('img')
      if (img && !img.complete) {
        img.addEventListener('load', ready)
        img.addEventListener('error', ready)
        setTimeout(ready, 2000)
      } else if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(ready).catch(ready)
      } else {
        setTimeout(ready, 400)
      }
    </script>
  </body></html>`)
  if (!printRes.ok && printRes.error) alert(printRes.error)
}
