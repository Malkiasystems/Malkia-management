// @ts-nocheck
// wa-payslip v1: deliver one employee's payslip over WhatsApp.
// POST { line_id }  (hrm_payroll_lines.id of a POSTED run)
// Renders the payslip server-side (pdf-lib port of HRMPayslips, fed by the same
// system_settings.payslip_template row), vaults it in the private "payslips"
// bucket, and ships it through wa-send: freeform inside the 24h window, the
// approved malkia_payslip_sw template outside it. The caption carries no
// figures; amounts exist only inside the PDF. Caller must be an active user
// with the explicit hrm.confidential grant for Company HRM.
// wa-send itself is untouched: this function resolves the route and passes an
// explicit content_sid, so the live receipt gateway carries no new risk.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1"
import { PNG } from "npm:pngjs@7.0.0"
import { Buffer } from "node:buffer"

const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-internal-key",
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

// renderPayslipPdf: server-side twin of HRMPayslips.generatePayslipPDF.
// Coordinates are millimetres from the top-left, exactly as in the jsPDF
// original, converted to PDF points here. Plain JS so the identical text runs
// in Node (local proof) and in the Deno edge function.
async function renderPayslipPdf(lib, d) {
  const { PDFDocument, StandardFonts, rgb } = lib
  const T = d.template
  const doc = await PDFDocument.create()
  const PW = 595.28, PH = 841.89, MM = 72 / 25.4, w = 210
  const page = doc.addPage([PW, PH])
  const F = {
    n: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
  }

  const hexArr = (h) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || '')
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [15, 118, 110]
  }
  const C = (a) => rgb(a[0] / 255, a[1] / 255, a[2] / 255)
  const tint = (a, t) => [0, 1, 2].map((i) => Math.round(a[i] + (255 - a[i]) * t))
  // Standard PDF fonts only encode Latin-1. Map the common typographic
  // characters and drop anything else (emoji in an HR note must not crash a send).
  const safe = (v) => String(v == null ? '' : v)
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
  const num = (n) => Math.round(Number(n) || 0).toLocaleString('en-US')
  const widthMm = (font, str, size) => font.widthOfTextAtSize(safe(str), size) / MM

  const text = (v, x, y, size, font, color, align) => {
    const str = safe(v)
    if (!str) return
    let px = x * MM
    if (align === 'right') px -= font.widthOfTextAtSize(str, size)
    else if (align === 'center') px -= font.widthOfTextAtSize(str, size) / 2
    page.drawText(str, { x: px, y: PH - y * MM, size, font, color: C(color) })
  }
  const rect = (x, y, ww, h, color) =>
    page.drawRectangle({ x: x * MM, y: PH - (y + h) * MM, width: ww * MM, height: h * MM, color: C(color) })
  const rrect = (x, y, ww, h, r, color) => {
    const W = ww * MM, H = h * MM, R = Math.min(r * MM, W / 2, H / 2)
    const p = `M ${R} 0 H ${W - R} A ${R} ${R} 0 0 1 ${W} ${R} V ${H - R} A ${R} ${R} 0 0 1 ${W - R} ${H} H ${R} A ${R} ${R} 0 0 1 0 ${H - R} V ${R} A ${R} ${R} 0 0 1 ${R} 0 Z`
    page.drawSvgPath(p, { x: x * MM, y: PH - y * MM, color: C(color) })
  }
  const line = (x1, y1, x2, y2, color, lw) =>
    page.drawLine({ start: { x: x1 * MM, y: PH - y1 * MM }, end: { x: x2 * MM, y: PH - y2 * MM }, thickness: lw * MM, color: C(color) })
  const dot = (x, y, r, color) => page.drawCircle({ x: x * MM, y: PH - y * MM, size: r * MM, color: C(color) })
  const wrap = (font, v, size, maxMm) => {
    const out = []
    for (const para of String(v == null ? '' : v).split(/\r?\n/)) {
      let cur = ''
      for (const word of safe(para).split(' ')) {
        const t2 = cur ? cur + ' ' + word : word
        if (cur && widthMm(font, t2, size) > maxMm) { out.push(cur); cur = word } else cur = t2
      }
      out.push(cur)
    }
    return out
  }

  const accent = hexArr(T.accentColor), secondary = hexArr(T.secondaryColor)
  const dark = [30, 30, 30], gray = [120, 120, 120], lightBg = [248, 250, 252]
  const veryLight = [236, 245, 244], white = [255, 255, 255], red = [220, 38, 38]
  const accentSoft = tint(accent, 0.85), accentLightText = tint(accent, 0.7)
  const DEPT = { Management: '#6366f1', Operations: '#f7a6ad', Clinical: '#f59e0b', Sales: '#22c55e', Marketing: '#3b82f6' }
  const MID = '  \u00b7  '
  const s = d.slip, emp = d.emp
  const n = (k) => Number(s[k]) || 0

  // HEADER: solid accent band, white mark, white text (matches the invoice)
  const headerH = 40
  rect(0, 0, w, headerH, accent)
  let textStartX = 15
  if (d.logoBytes) {
    try {
      const img = await doc.embedPng(d.logoBytes)
      let lw = Number(T.logoWidthMm) || 15
      let lh = (img.height / img.width) * lw
      const maxH = headerH - 8
      if (lh > maxH) { lw = lw * (maxH / lh); lh = maxH }
      page.drawImage(img, { x: 15 * MM, y: PH - ((headerH - lh) / 2 + lh) * MM, width: lw * MM, height: lh * MM })
      textStartX = 15 + lw + 8
    } catch (_e) { /* text-only header */ }
  }
  text(d.companyName, textStartX, 18, 16, F.b, white)
  if (T.headerTagline) text(T.headerTagline, textStartX, 24, 8.5, F.n, accentLightText)
  text('PAYSLIP', w - 15, 15, 8, F.n, accentLightText, 'right')
  text(String(d.periodLabel).toUpperCase(), w - 15, 21, 11, F.b, white, 'right')
  text(`Ref: PAY-${String(d.period).replace('-', '')}`, w - 15, 26, 7.5, F.n, accentLightText, 'right')
  text(`Issued: ${d.issued}`, w - 15, 30, 7.5, F.n, accentLightText, 'right')

  // EMPLOYEE CARD
  let y = headerH + 10
  rrect(15, y, w - 30, 30, 3, lightBg)
  dot(22, y + 8, 2, hexArr(DEPT[emp.department] || T.accentColor))
  text(emp.full_name, 27, y + 9, 13, F.b, dark)
  text([emp.emp_code, emp.job_title, emp.department].filter(Boolean).join(MID), 27, y + 15, 8.5, F.n, gray)
  text(`Bank: ${[emp.bank_name, emp.bank_account].filter(Boolean).join(' \u00b7 ') || 'Cash'}`, 27, y + 21, 8.5, F.n, gray)
  const nssfNo = String(emp.nssf_number || '').replace(/^\s*NSSF[\s\-:]*/i, '')
  const taxInfo = [emp.tin_number ? `TIN ${emp.tin_number}` : null, nssfNo ? `NSSF ${nssfNo}` : null].filter(Boolean).join(MID)
  if (taxInfo) text(taxInfo, 27, y + 26.5, 8.5, F.n, gray)
  y += 38

  // EARNINGS / DEDUCTIONS
  const colW = (w - 30 - 6) / 2, leftX = 15, rightX = leftX + colW + 6, blockY = y
  text('EARNINGS', leftX, blockY, 9.5, F.b, accent)
  line(leftX, blockY + 1.8, leftX + colW, blockY + 1.8, accent, 0.6)
  let ly = blockY + 8
  const earn = [['Basic Salary', n('gross')]]
  if (n('allowances') > 0) earn.push(['Allowances', n('allowances')])
  if (n('bonus') > 0) earn.push(['Bonus (untaxed)', n('bonus')])
  for (const [label, val] of earn) {
    text(label, leftX, ly, 9.5, F.n, dark)
    text(num(val), leftX + colW, ly, 9.5, F.b, dark, 'right')
    ly += 6.5
  }
  const totalEarnings = n('gross') + n('allowances') + n('bonus')
  line(leftX, ly - 2, leftX + colW, ly - 2, gray, 0.2)
  ly += 1
  text('Total Earnings', leftX, ly + 3, 10, F.b, accent)
  text(num(totalEarnings), leftX + colW, ly + 3, 10, F.b, accent, 'right')
  const earningsEnd = ly + 4

  text('DEDUCTIONS', rightX, blockY, 9.5, F.b, red)
  line(rightX, blockY + 1.8, rightX + colW, blockY + 1.8, red, 0.6)
  let ry = blockY + 8
  const ded = []
  if (n('paye') > 0) ded.push(['PAYE (Income Tax)', n('paye')])
  if (n('nssf_ee') > 0) ded.push(['NSSF (Employee 10%)', n('nssf_ee')])
  if (n('deductions') > 0) ded.push(['Other Deductions', n('deductions')])
  if (T.showAdvanceDetail && n('advance_deduction') > 0) ded.push(['Salary Advance Recovery', n('advance_deduction')])
  if (ded.length === 0) {
    text('No deductions this period', rightX, ry, 9.5, F.i, gray)
    ry += 6.5
  } else {
    for (const [label, val] of ded) {
      text(label, rightX, ry, 9.5, F.n, dark)
      text(num(val), rightX + colW, ry, 9.5, F.b, red, 'right')
      ry += 6.5
    }
  }
  const totalDed = n('paye') + n('nssf_ee') + n('deductions') + n('advance_deduction')
  line(rightX, ry - 2, rightX + colW, ry - 2, gray, 0.2)
  ry += 1
  text('Total Deductions', rightX, ry + 3, 10, F.b, red)
  text(num(totalDed), rightX + colW, ry + 3, 10, F.b, red, 'right')
  y = Math.max(earningsEnd, ry + 4) + 8

  // NET PAY HERO
  rrect(15, y, w - 30, 22, 4, accent)
  text('NET PAY', 22, y + 9, 9, F.n, white)
  text(`TZS ${num(n('net_pay'))}`, w - 22, y + 14, 20, F.b, white, 'right')
  text(`for ${d.periodLabel}`, 22, y + 16, 7.5, F.n, white)
  y += 26

  // TAKE-HOME BREAKDOWN BAR
  if (totalEarnings > 0) {
    const segs = [
      ['Net', n('net_pay'), accent],
      ['PAYE', n('paye'), red],
      ['NSSF', n('nssf_ee'), [245, 158, 11]],
      ['Other', n('deductions') + n('advance_deduction'), gray],
    ].filter((g) => g[1] > 0)
    const barX = 15, barW = w - 30, barH = 5
    let sx = barX
    for (const [, val, col] of segs) {
      const sw = barW * (val / totalEarnings)
      rrect(sx, y, Math.max(sw, 1), barH, 1, col)
      sx += sw
    }
    y += barH + 4
    let lx = barX
    for (const [label, val, col] of segs) {
      dot(lx + 1, y - 0.8, 1, col)
      const txt = `${label} ${Math.round((val / totalEarnings) * 100)}%`
      text(txt, lx + 3.5, y, 6.5, F.n, gray)
      lx += widthMm(F.n, txt, 6.5) + 10
    }
    y += 6
  }

  // YTD + LEAVE: side-by-side strips
  {
    const stripW = (w - 30 - 6) / 2, stripH = 22
    if (T.showYTD) {
      const ytd = d.ytd || { gross: n('gross'), net: n('net_pay') }
      rrect(15, y, d.leave ? stripW : w - 30, stripH, 3, accentSoft)
      text('YEAR-TO-DATE', 20, y + 5, 7.5, F.b, accent)
      text(`Since ${d.fySince}`, 20, y + 9, 6, F.n, gray)
      text('Gross', 20, y + 15, 7, F.n, gray)
      text(num(ytd.gross), 20, y + 20, 9, F.b, accent)
      text('Net', 20 + stripW / 2, y + 15, 7, F.n, gray)
      text(num(ytd.net), 20 + stripW / 2, y + 20, 9, F.b, accent)
    }
    const lv = d.leave
    if (lv) {
      const lvX = 15 + stripW + 6
      const ent = Number(lv.annual_entitlement) || 0, sickEnt = Number(lv.sick_entitlement) || 0
      const annualLeft = ent - (Number(lv.annual_taken) || 0) - (Number(lv.annual_pending) || 0)
      const sickLeft = sickEnt - (Number(lv.sick_taken) || 0)
      rrect(lvX, y, stripW, stripH, 3, veryLight)
      text('LEAVE BALANCE', lvX + 5, y + 5, 7.5, F.b, secondary)
      text(`FY ${String(lv.fiscal_year || '').replace(/^FY\s*/i, '')}`, lvX + 5, y + 9, 6, F.n, gray)
      text('Annual', lvX + 5, y + 15, 7, F.n, gray)
      text(`${annualLeft} / ${ent} days`, lvX + 5, y + 20, 9, F.b, dark)
      text('Sick', lvX + stripW / 2, y + 15, 7, F.n, gray)
      text(`${sickLeft} / ${sickEnt} days`, lvX + stripW / 2, y + 20, 9, F.b, dark)
    }
    if (T.showYTD || lv) y += stripH + 6
  }

  // EMPLOYER CONTRIBUTIONS: only when there are any
  if (T.showEmployerCosts) {
    const er = []
    if (n('nssf_er') > 0) er.push(`NSSF Employer ${num(n('nssf_er'))}`)
    if (n('sdl') > 0) er.push(`SDL ${num(n('sdl'))}`)
    if (er.length > 0) {
      rrect(15, y, w - 30, 9, 2, veryLight)
      text('EMPLOYER CONTRIBUTIONS', 20, y + 4, 7, F.b, secondary)
      text(er.join(MID), 20, y + 7.5, 7.5, F.n, gray)
      text('(paid by employer, not deducted from your salary)', w - 20, y + 7.5, 6, F.n, gray, 'right')
      y += 14
    }
  }

  // NOTE FROM HR: only when present
  if (T.showEmployeeNotes && s.notes && String(s.notes).trim()) {
    const lines = wrap(F.n, String(s.notes).trim(), 8.5, w - 40).slice(0, 8)
    const noteH = lines.length * 4.5 + 10
    rrect(15, y, w - 30, noteH, 2, veryLight)
    text('NOTE FROM HR', 20, y + 4.5, 7, F.b, secondary)
    lines.forEach((l, i) => text(l, 20, y + 9.5 + i * 3.45, 8.5, F.n, dark))
    y += noteH + 4
  }

  // SIGNATURE BLOCK
  if (T.showSignatureBlock) {
    const sigY = Math.max(y, 245)
    line(20, sigY + 10, 80, sigY + 10, gray, 0.2)
    line(w - 80, sigY + 10, w - 20, sigY + 10, gray, 0.2)
    text('Prepared by', 20, sigY + 14, 7.5, F.n, gray)
    text('Received by employee', w - 80, sigY + 14, 7.5, F.n, gray)
    y = sigY + 18
  }

  // APPRECIATION LINE: directly under the content, never into the footer
  text('Tunajivunia kuwa na wewe katika timu ya Malkia. Asante.', w / 2, Math.min(y + 6, 276), 9.5, F.b, accent, 'center')

  // FOOTER
  const footerY = 280
  line(15, footerY, w - 15, footerY, accent, 0.3)
  if (T.footerTagline) text(T.footerTagline, w / 2, footerY + 5, 8, F.i, accent, 'center')
  if (T.footerSmallPrint) {
    wrap(F.n, T.footerSmallPrint, 6.5, w - 30).slice(0, 2)
      .forEach((l, i) => text(l, w / 2, footerY + 9 + i * 2.6, 6.5, F.n, gray, 'center'))
  }
  text(`${d.companyName} \u00b7 Generated by MalkiaOS \u00b7 ${d.generatedAt}`, w / 2, footerY + 14, 6, F.n, gray, 'center')

  return await doc.save()
}

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const MONTHS_SW = ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"]

const DEFAULT_TEMPLATE = {
  accentColor: "#0F766E", secondaryColor: "#7C3AED",
  logoUrl: "", logoWidthMm: 15, logoPosition: "left", logoPaddingMm: 7,
  headerTagline: "Reimagining Motherhood",
  footerTagline: "Reimagining Motherhood",
  footerSmallPrint: "This is a computer-generated payslip and does not require a signature. Please keep for your records.",
  showEmployerCosts: true, showAdvanceDetail: true, showYTD: true,
  showSignatureBlock: false, showEmployeeNotes: true,
}

// same normalisation wa-send applies, so the window check sees the same number
function e164(raw) {
  const d = String(raw || "").replace(/[^\d+]/g, "")
  if (/^\+[1-9]\d{6,14}$/.test(d)) return d
  const n = d.replace(/^\+/, "")
  if (/^0\d{9}$/.test(n)) return "+255" + n.slice(1)
  if (/^255\d{9}$/.test(n)) return "+" + n
  if (/^[67]\d{8}$/.test(n)) return "+255" + n
  if (/^2550\d{9}$/.test(n)) return "+255" + n.slice(4)
  return null
}

async function windowOpen(phone) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data } = await sb.from("wa_messages").select("id").eq("phone", phone).eq("direction", "in").gte("created_at", since).limit(1)
  return !!(data && data.length)
}

// Payslips are confidential: an active user is not enough, payroll rights are required.
async function hasPayrollRights(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false
  const { data } = await sb.auth.getUser(authHeader.slice(7))
  const u = data && data.user
  if (!u) return false
  const cols = "id, is_active, permissions"
  let { data: row } = await sb.from("users").select(cols).eq("id", u.id).maybeSingle()
  if (!row && u.email) {
    const email = u.email.replace(/[\\%_]/g, "\\$&")
    const r2 = await sb.from("users").select(cols).ilike("email", email).maybeSingle()
    row = r2.data
  }
  if (!row || !row.is_active) return false
  const perms = Array.isArray(row.permissions) ? row.permissions : []
  return perms.includes("hrm.confidential")
}

async function loadLogo(T) {
  if (typeof T.logoUrl === "string" && T.logoUrl.startsWith("data:image/png")) {
    try {
      const bin = Uint8Array.from(atob(T.logoUrl.split(",")[1] || ""), (c) => c.charCodeAt(0))
      // palette PNGs lose transparency in pdf-lib; re-encode as RGBA first
      try { return new Uint8Array(PNG.sync.write(PNG.sync.read(Buffer.from(bin)))) } catch (_e) { return bin }
    } catch (_e) { /* fall through to the stored mark */ }
  }
  try {
    const { data } = await sb.storage.from("receipts").download("_assets/mark-white.png")
    if (data) return new Uint8Array(await data.arrayBuffer())
  } catch (_e) { /* text-only header */ }
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  const internalKey = Deno.env.get("WA_INTERNAL_KEY") || ""
  const okKey = internalKey && req.headers.get("x-internal-key") === internalKey
  if (!okKey && !(await hasPayrollRights(req.headers.get("authorization")))) {
    return json({ error: "Payroll permission required to send payslips" }, 403)
  }

  let b
  try { b = await req.json() } catch (_e) { return json({ error: "bad json" }, 400) }
  const lineId = String((b && b.line_id) || "").trim()
  if (!lineId) return json({ error: "line_id required" }, 400)

  try {
    const { data: l, error: lErr } = await sb.from("hrm_payroll_lines")
      .select("id, gross, allowances, deductions, advance_deduction, bonus, paye, nssf_ee, nssf_er, sdl, net_pay, notes, run:hrm_payroll_runs(period, status, journal_ref), employee:hrm_employees(id, full_name, emp_code, job_title, department, bank_name, bank_account, nssf_number, tin_number, whatsapp)")
      .eq("id", lineId).maybeSingle()
    if (lErr) return json({ error: `db: ${lErr.message}` }, 500)
    if (!l) return json({ error: "payroll line not found" }, 404)
    const run = Array.isArray(l.run) ? l.run[0] : l.run
    const emp = Array.isArray(l.employee) ? l.employee[0] : l.employee
    if (!run || !emp) return json({ error: "payroll line has no run or employee" }, 500)
    if (run.status !== "posted") return json({ error: "payroll run is not posted" }, 409)
    const period = String(run.period || "")
    const pm = /^(\d{4})-(\d{2})$/.exec(period)
    if (!pm) return json({ error: `unexpected payroll period "${period}"` }, 500)
    const yy = Number(pm[1]), mo = Number(pm[2])
    const phone = e164(emp.whatsapp)
    if (!phone) return json({ error: `${emp.full_name} has no valid WhatsApp number` }, 400)

    // template (same row the app's payslip page reads)
    let T = { ...DEFAULT_TEMPLATE }
    try {
      const { data: tr } = await sb.from("system_settings").select("value").eq("key", "payslip_template").maybeSingle()
      const tv = tr && tr.value ? (typeof tr.value === "string" ? JSON.parse(tr.value) : tr.value) : null
      if (tv && typeof tv === "object") T = { ...DEFAULT_TEMPLATE, ...tv }
    } catch (_e) { /* defaults */ }

    // year-to-date (fiscal year starts in April, as in the app)
    const fyStartYear = mo >= 4 ? yy : yy - 1
    const fyStart = `${fyStartYear}-04`
    let ytd = null
    const { data: ytdRows } = await sb.from("hrm_payroll_lines")
      .select("gross, paye, nssf_ee, net_pay, hrm_payroll_runs!inner(period, status)")
      .eq("hrm_payroll_runs.status", "posted")
      .eq("employee_id", emp.id).gte("hrm_payroll_runs.period", fyStart).lte("hrm_payroll_runs.period", period)
    if (ytdRows && ytdRows.length) {
      ytd = { gross: 0, paye: 0, nssf: 0, net: 0 }
      for (const r of ytdRows) {
        ytd.gross += Number(r.gross) || 0; ytd.paye += Number(r.paye) || 0
        ytd.nssf += Number(r.nssf_ee) || 0; ytd.net += Number(r.net_pay) || 0
      }
    }

    // leave balance: the row for this fiscal year if there is one, else the latest
    let leave = null
    const { data: lvRows } = await sb.from("hrm_leave_balances")
      .select("fiscal_year, annual_entitlement, annual_taken, annual_pending, sick_entitlement, sick_taken")
      .eq("employee_id", emp.id)
    if (lvRows && lvRows.length) {
      leave = lvRows.find((r) => String(r.fiscal_year || "").includes(String(fyStartYear)))
        || [...lvRows].sort((a, c) => String(c.fiscal_year || "").localeCompare(String(a.fiscal_year || "")))[0]
    }

    const dar = new Date(Date.now() + 3 * 3600 * 1000).toISOString()
    const bytes = await renderPayslipPdf({ PDFDocument, StandardFonts, rgb }, {
      template: T, companyName: "Malkia Maternity Group", logoBytes: await loadLogo(T),
      period, periodLabel: `${MONTHS_EN[mo - 1]} ${yy}`, fySince: `${fyStartYear}/04`,
      issued: `${dar.slice(8, 10)}/${dar.slice(5, 7)}/${dar.slice(0, 4)}`,
      generatedAt: dar.slice(0, 16).replace("T", " "),
      slip: l, emp, ytd, leave,
    })

    const code = String(emp.emp_code || emp.id).replace(/[^A-Za-z0-9_-]/g, "_")
    // Each corrected run gets its own document. Existing signed links keep
    // pointing to the PDF that was originally delivered to the employee.
    const revision = String(run.journal_ref || "").match(/-R[0-9]+$/)?.[0] || ""
    const path = `${period}/${code}/Payslip-${code}-${period}${revision}.pdf`
    const { error: upErr } = await sb.storage.from("payslips").upload(path, bytes, { contentType: "application/pdf", upsert: true })
    if (upErr) return json({ error: `storage: ${upErr.message}` }, 500)
    const { data: signed, error: sErr } = await sb.storage.from("payslips").createSignedUrl(path, 60 * 60 * 48)
    if (sErr || !signed || !signed.signedUrl) return json({ error: `sign: ${(sErr && sErr.message) || "no url"}` }, 500)

    const rawFirst = String(emp.full_name || "").trim().split(/\s+/)[0] || "Mfanyakazi"
    const first = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase()
    const periodSw = `${MONTHS_SW[mo - 1]} ${yy}`
    const caption = `Habari ${first}, taarifa yako ya malipo (payslip) kwa mwezi ${periodSw} imeambatishwa. Kwa maswali yoyote, wasiliana na HR au Meneja wako.`

    const payload = { phone, purpose: "payslip", name: emp.full_name, body: caption, source: "malkiaos" }
    if (await windowOpen(phone)) {
      payload.media_url = signed.signedUrl
    } else {
      const { data: tRow } = await sb.from("system_settings").select("value").eq("key", "wa_template_payslip").maybeSingle()
      const tv = tRow && tRow.value ? (typeof tRow.value === "string" ? JSON.parse(tRow.value) : tRow.value) : null
      if (!tv || !tv.sid) return json({ error: "24h window is closed and the payslip template is not registered" }, 409)
      payload.content_sid = tv.sid
      payload.variables = { "1": first, "2": periodSw, "3": signed.signedUrl }
    }

    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": internalKey },
      body: JSON.stringify(payload),
    })
    const rj = await r.json().catch(() => ({}))
    if (!r.ok) return json({ error: rj.error || `wa-send ${r.status}`, pdf: path }, 502)

    await sb.from("hrm_payroll_lines")
      .update({ payslip_sent: true, payslip_sent_at: new Date().toISOString(), payslip_wa_message_id: rj.id || null })
      .eq("id", lineId)
    return json({ ok: true, mode: rj.mode, twilio_sid: rj.twilio_sid, message_id: rj.id, pdf: path })
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500)
  }
})
