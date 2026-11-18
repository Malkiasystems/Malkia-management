// wa-invoice v1 (18 Nov 2026): the sales-invoice (ANKARA) PDF sender, split out
// of wa-receipt so that changes to the invoice never touch the cash-sale
// receipt path. Same renderer as wa-receipt v15 (faithful A4 port of the
// on-screen MalkiaInvoice template, fed by the SAME
// system_settings.invoice_template row, live ledger figures and salesperson
// codes) with ONE change: the "Received by / Signature / Date received" block
// is replaced by a "Digital copy, no signature needed" notice. The printed
// invoice from MalkiaOS keeps its signing area; that is the copy the customer
// or their transport agent signs on delivery.
// Caption and Meta template (wa_template_invoice_pdf) are unchanged.
// v2 (18 Nov 2026): (1) the invoice status gets its own line, so a long
// "PARTIAL · 1,245,000 outstanding" no longer prints over its label;
// (2) long invoices flow onto further pages instead of stopping at 12 lines
// ("...and N more lines") or crowding the footer. A one-page invoice looks
// the same as before apart from the status line.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1"
import fontkit from "npm:@pdf-lib/fontkit@1.1.1"
import { PNG } from "npm:pngjs@7.0.0"
import { Buffer } from "node:buffer"

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-internal-key",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

async function isStaff(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false
  const { data } = await sb.auth.getUser(authHeader.slice(7))
  const u = data?.user
  if (!u) return false
  const { data: byId } = await sb.from("users").select("id").eq("id", u.id).eq("is_active", true).maybeSingle()
  if (byId) return true
  if (!u.email) return false
  const { data: byEmail } = await sb.from("users").select("id").ilike("email", u.email).eq("is_active", true).maybeSingle()
  return !!byEmail
}

const FONT_URLS: Record<string, string> = {
  syne: "https://unpkg.com/@expo-google-fonts/syne@0.4.2/800ExtraBold/Syne_800ExtraBold.ttf",
  syneB: "https://unpkg.com/@expo-google-fonts/syne@0.4.2/700Bold/Syne_700Bold.ttf",
  mono: "https://unpkg.com/@expo-google-fonts/dm-mono@0.4.2/400Regular/DMMono_400Regular.ttf",
  monoM: "https://unpkg.com/@expo-google-fonts/dm-mono@0.4.2/500Medium/DMMono_500Medium.ttf",
  body: "https://unpkg.com/@expo-google-fonts/instrument-sans@0.4.2/400Regular/InstrumentSans_400Regular.ttf",
  bodySB: "https://unpkg.com/@expo-google-fonts/instrument-sans@0.4.2/600SemiBold/InstrumentSans_600SemiBold.ttf",
  bodyIt: "https://unpkg.com/@expo-google-fonts/instrument-sans@0.4.2/400Regular_Italic/InstrumentSans_400Regular_Italic.ttf",
}
let fontCache: Record<string, Uint8Array | null> | null = null
async function loadFonts(): Promise<Record<string, Uint8Array | null>> {
  if (fontCache) return fontCache
  const out: Record<string, Uint8Array | null> = {}
  await Promise.all(Object.entries(FONT_URLS).map(async ([k, url]) => {
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 6000)
      const r = await fetch(url, { signal: ac.signal })
      clearTimeout(t)
      out[k] = r.ok ? new Uint8Array(await r.arrayBuffer()) : null
    } catch { out[k] = null }
  }))
  fontCache = out
  return out
}

const fmtDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "") }

// Wording shown on the digital copy in place of the signing area.
const DIGITAL_COPY_HEAD = "DIGITAL COPY · NO SIGNATURE NEEDED"
const DIGITAL_COPY_BODY = "This invoice was sent to you digitally and does not need a signature. Please sign the printed invoice when the goods reach you. If a transport agent receives the goods for you, the agent signs the printed invoice on your behalf."

// ── INVOICE (ANKARA) — faithful A4 port of InvoiceTemplate.tsx ────────────────
const hex = (h: string) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ""); return m ? rgb(parseInt(m[1],16)/255, parseInt(m[2],16)/255, parseInt(m[3],16)/255) : rgb(0.52,0.76,0.74) }
const mix = (c: any, t: number) => rgb(c.red + (1-c.red)*(1-t), c.green + (1-c.green)*(1-t), c.blue + (1-c.blue)*(1-t))
function wrapBy(font: any, text: string, size: number, maxW: number): string[] {
  const words = String(text).split(" "); const out: string[] = []; let line = ""
  for (const w of words) { const t2 = line ? line + " " + w : w
    if (font.widthOfTextAtSize(t2, size) > maxW && line) { out.push(line); line = w } else line = t2 }
  if (line) out.push(line); return out
}
function spCodeFor(roster: { full_name: string; emp_code?: string | null }[], fullName: string): string {
  if (!fullName?.trim()) return ""
  const norm = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase()
  const baseCode = (fn: string) => { const t2 = fn.trim().split(/\s+/); const first = t2[0] || ""; const last = t2.length > 1 ? t2[t2.length-1] : first
    return { first, last, base: t2.length > 1 ? (first[0]+last[0]).toUpperCase() : first.slice(0,2).toUpperCase() } }
  const people = roster.some(r => norm(r.full_name) === norm(fullName)) ? roster : [...roster, { full_name: fullName }]
  const sorted = [...people].sort((a, b) => ((a.emp_code || "￿").localeCompare(b.emp_code || "￿", undefined, { numeric: true })) || a.full_name.localeCompare(b.full_name))
  const taken = new Set<string>(); const out = new Map<string, string>()
  for (const p of sorted) { const key = norm(p.full_name); if (out.has(key)) continue
    const { first, last, base } = baseCode(p.full_name); let code = base
    if (taken.has(code)) { let assigned = ""
      for (let n = 2; n <= first.length; n++) { const cand = `${first.slice(0,n).toUpperCase()}.${(last[0]||"").toUpperCase()}`; if (!taken.has(cand)) { assigned = cand; break } }
      if (!assigned) { let i = 2; while (taken.has(`${base}${i}`)) i++; assigned = `${base}${i}` }
      code = assigned }
    taken.add(code); out.set(key, code) }
  return out.get(norm(fullName)) || ""
}

async function renderInvoicePdf(v: any, cust: any, fonts: Record<string, Uint8Array | null>): Promise<Uint8Array> {
  let IS: any = {}
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", "invoice_template").maybeSingle()
    IS = typeof data?.value === "string" ? JSON.parse(data.value) : (data?.value || {})
  } catch { /* defaults below */ }
  IS = {
    company_name: "Malkia Wellness Group Ltd", tagline: "Reimagining Motherhood",
    address: "Dar es Salaam, Tanzania", phone: "", email: "", website: "", tin: "—",
    primary_color: "#85c2be", logo_width: 80, logo_x: 0, logo_y: 0,
    bank_name: "NMB Bank", bank_account_name: "Malkia Wellness Group Ltd",
    bank_account_number: "", bank_branch: "", payment_note: "", footer_note: "",
    label_bill_to: "Bill To", label_invoice: "Tax Invoice",
    label_payment_details: "Payment Details", label_this_invoice: "This Invoice",
    label_account_statement: "Account Statement", label_notes: "Notes",
    label_salesperson: "Salesperson", label_invoiced_by: "Invoiced by",
    show_logo: true, show_bank_details: true, show_salesperson: true,
    show_outstanding_balance: true, show_payment_terms: true, show_notes: true,
    ...IS,
  }
  let spcode = ""
  try {
    const [{ data: roster }, spRes] = await Promise.all([
      sb.from("hrm_employees").select("full_name, emp_code").eq("is_active", true),
      v.salesperson_id ? sb.from("hrm_employees").select("full_name").eq("id", v.salesperson_id).maybeSingle() : Promise.resolve({ data: null } as any),
    ])
    const spName = (spRes as any)?.data?.full_name
    if (spName) spcode = spCodeFor((roster || []) as any, spName)
  } catch { /* falls back to posted_by */ }
  let invRemaining = Number(v.total_amount || 0), invPaid = 0
  try {
    const { data: led } = await sb.from("customer_ledger_entries").select("remaining_amount, amount").eq("document_ref", v.ref).limit(1).maybeSingle()
    if (led) { invRemaining = Number(led.remaining_amount ?? v.total_amount ?? 0); invPaid = Math.max(0, Number(led.amount ?? 0) - invRemaining) }
  } catch { /* defaults */ }
  const statementDate = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit as any)
  const PW = 595.28, PH = 841.89, k = 72 / 96
  const px = (vv: number) => vv * k
  let page = doc.addPage([PW, PH])
  const Y = (topPx: number) => PH - px(topPx)

  const helvB2 = await doc.embedFont(StandardFonts.HelveticaBold)
  const helv2 = await doc.embedFont(StandardFonts.Helvetica)
  const obl2 = await doc.embedFont(StandardFonts.HelveticaOblique)
  const cour2 = await doc.embedFont(StandardFonts.Courier)
  const courB2 = await doc.embedFont(StandardFonts.CourierBold)
  const syne = fonts.syne ? await doc.embedFont(fonts.syne, { subset: true }) : helvB2
  const mono = fonts.mono ? await doc.embedFont(fonts.mono, { subset: true }) : cour2
  const monoM = fonts.monoM ? await doc.embedFont(fonts.monoM, { subset: true }) : courB2
  const body = fonts.body ? await doc.embedFont(fonts.body, { subset: true }) : helv2
  const bodySB = fonts.bodySB ? await doc.embedFont(fonts.bodySB, { subset: true }) : helvB2
  const bodyIt = fonts.bodyIt ? await doc.embedFont(fonts.bodyIt, { subset: true }) : obl2

  const P = hex(IS.primary_color)
  const WHITE = rgb(1, 1, 1), INK = rgb(0.102, 0.102, 0.102)
  const headDim = (o: number) => rgb(1 * o + P.red * (1 - o), 1 * o + P.green * (1 - o), 1 * o + P.blue * (1 - o))
  const G = { aaa: rgb(0.667,0.667,0.667), bbb: rgb(0.733,0.733,0.733), ccc: rgb(0.8,0.8,0.8),
    g888: rgb(0.533,0.533,0.533), g666: rgb(0.4,0.4,0.4), g555: rgb(0.333,0.333,0.333),
    red: rgb(0.753,0.224,0.169), line: rgb(0.941,0.941,0.941), zebra: rgb(0.98,0.98,0.98),
    tableHead: rgb(0.102,0.102,0.102), peach: rgb(1,0.973,0.957), peachLine: rgb(0.941,0.816,0.753) }

  const t = (s: any, x: number, yTop: number, size: number, font: any, color: any) => page.drawText(String(s), { x: px(x), y: Y(yTop) - px(size), size: px(size), font, color })
  const tr = (s: any, xRight: number, yTop: number, size: number, font: any, color: any) => page.drawText(String(s), { x: px(xRight) - font.widthOfTextAtSize(String(s), px(size)), y: Y(yTop) - px(size), size: px(size), font, color })
  const spaced = (s: any, x: number, yTop: number, size: number, font: any, color: any, ls: number) => { let cx = px(x); const sz = px(size); for (const ch of String(s)) { page.drawText(ch, { x: cx, y: Y(yTop) - sz, size: sz, font, color }); cx += font.widthOfTextAtSize(ch, sz) + px(ls) } }
  const spacedW = (s: any, size: number, font: any, ls: number) => { let w = 0; const sz = px(size); for (const ch of String(s)) w += font.widthOfTextAtSize(ch, sz) + px(ls); return w - px(ls) }
  const spacedR = (s: any, xRight: number, yTop: number, size: number, font: any, color: any, ls: number) => { let cx = px(xRight) - spacedW(s, size, font, ls); const sz = px(size); for (const ch of String(s)) { page.drawText(ch, { x: cx, y: Y(yTop) - sz, size: sz, font, color }); cx += font.widthOfTextAtSize(ch, sz) + px(ls) } }
  const rect = (x: number, yTop: number, w: number, h: number, color: any) => page.drawRectangle({ x: px(x), y: Y(yTop + h), width: px(w), height: px(h), color })
  const hline = (x: number, yTop: number, w: number, color: any, th = 1) => page.drawLine({ start: { x: px(x), y: Y(yTop) }, end: { x: px(x + w), y: Y(yTop) }, thickness: px(th), color })
  const vline = (x: number, y1: number, y2: number, color: any) => page.drawLine({ start: { x: px(x), y: Y(y1) }, end: { x: px(x), y: Y(y2) }, thickness: px(1), color })
  const rrect = (x: number, yTop: number, w: number, h: number, r: number, opts: any) => { const d = `M ${px(r)} 0 H ${px(w-r)} A ${px(r)} ${px(r)} 0 0 1 ${px(w)} ${px(r)} V ${px(h-r)} A ${px(r)} ${px(r)} 0 0 1 ${px(w-r)} ${px(h)} H ${px(r)} A ${px(r)} ${px(r)} 0 0 1 0 ${px(h-r)} V ${px(r)} A ${px(r)} ${px(r)} 0 0 1 ${px(r)} 0 Z`; page.drawSvgPath(d, { x: px(x), y: Y(yTop), ...opts }) }

  const total = Number(v.total_amount || 0)
  const currentBalance = Number(cust?.balance || 0)
  const priorBalance = currentBalance - total
  const priorIsCredit = priorBalance < -0.5
  const effRemaining = invRemaining ?? Math.min(total, Math.max(0, currentBalance))
  const effPaid = effRemaining <= 0.5
  const effPartial = !effPaid && (invPaid > 0.5 || effRemaining < total - 0.5)
  const settledByCredit = effPaid && invPaid <= 0.5 && priorIsCredit
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US")

  const metaRows: [string, string, boolean][] = [["Date: ", String(v.posting_date || ""), false]]
  if (IS.show_payment_terms && v.due_date) metaRows.push(["Due: ", String(v.due_date), true])
  if (IS.show_payment_terms && v.payment_terms) metaRows.push(["Terms: ", String(v.payment_terms), false])
  const spShown = spcode || v.posted_by || ""
  if (IS.show_salesperson && spShown) metaRows.push([IS.label_salesperson + ": ", spShown, false])
  if (IS.show_salesperson && spcode && v.posted_by) metaRows.push([IS.label_invoiced_by + ": ", String(v.posted_by), false])
  const rightH = 9 + 4 + 28 + 8 + metaRows.length * 19
  const nameLines = wrapBy(syne, IS.company_name, px(22), px(340))
  const leftH = nameLines.length * 24.2 + 3 + 15 + 8 + 18 * 3
  const headH = 24 + Math.max(rightH, leftH, IS.show_logo && IS.logo_url ? (Number(IS.logo_width || 80) + Number(IS.logo_y || 0)) : 0) + 24
  rect(0, 0, 794, headH, P)

  let textX = 40
  if (IS.show_logo && typeof IS.logo_url === "string" && IS.logo_url.startsWith("data:image")) {
    try {
      const b64 = IS.logo_url.split(",")[1] || ""
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      // Palette PNGs lose their transparency in pdf-lib (corners/cutouts go
      // black). Transcode to straight RGBA first so alpha survives; fall back
      // to the raw bytes if pngjs chokes.
      let img: any
      if (IS.logo_url.includes("png")) {
        try {
          const decoded = PNG.sync.read(Buffer.from(bin))
          const rgba = PNG.sync.write(decoded)
          img = await doc.embedPng(new Uint8Array(rgba))
        } catch {
          img = await doc.embedPng(bin)
        }
      } else {
        img = await doc.embedJpg(bin)
      }
      const w = Number(IS.logo_width || 80), h = w * (img.height / img.width)
      page.drawImage(img, { x: px(40 + Number(IS.logo_x || 0)), y: Y(24 + Number(IS.logo_y || 0) + h), width: px(w), height: px(h) })
      textX = 40 + (Number(IS.logo_width || 80) + Math.min(0, Number(IS.logo_x || 0))) + 16
    } catch { textX = 40 }
  }
  let cy = 24
  for (const l of nameLines) { t(l, textX, cy, 22, syne, WHITE); cy += 24.2 }
  cy += 3
  spaced(String(IS.tagline || "").toUpperCase(), textX, cy, 10, mono, headDim(0.75), 1.5)
  cy += 23
  const addrDim = headDim(0.65)
  t(`${IS.address} · ${IS.phone}`, textX, cy, 10, body, addrDim); cy += 18
  t(`${IS.email} · ${IS.website}`, textX, cy, 10, body, addrDim); cy += 18
  t(`TIN: ${IS.tin}`, textX, cy, 10, body, headDim(0.5))

  let ry = 24
  spacedR(String(IS.label_invoice || "Tax Invoice").toUpperCase(), 754, ry, 9, mono, headDim(0.6), 2); ry += 13
  tr(v.ref, 754, ry, 28, syne, WHITE); ry += 36
  for (const [lab, val, bold] of metaRows) {
    const f = bold ? monoM : mono
    const vw = f.widthOfTextAtSize(String(val), px(10))
    tr(val, 754, ry + 4.5, 10, f, WHITE)
    tr(lab, 754 - vw / k, ry + 4.5, 10, mono, headDim(0.7))
    ry += 19
  }

  let yTop = headH
  const colW = 794 / 2
  const showStmt = !!cust && IS.show_outstanding_balance
  let ly = yTop + 22
  spaced(String(IS.label_bill_to).toUpperCase(), 40, ly, 9, monoM, G.aaa, 2); ly += 19
  const bill = cust?.company || cust?.name || "—"
  for (const l of wrapBy(syne, bill, px(16), px(colW - 80))) { t(l, 40, ly, 16, syne, INK); ly += 18 }
  ly += 3
  if (cust?.contact_person) { t(`Attn: ${cust.contact_person}`, 40, ly, 11, body, G.g666); ly += 14 }
  if (cust?.address) { t(String(cust.address).slice(0, 48), 40, ly, 11, body, G.g888); ly += 18 }
  if (cust?.tin_number) { ly += 6; t(`TIN: ${cust.tin_number}`, 40, ly, 10, mono, G.g888); ly += 10 }
  if (cust?.whatsapp) { ly += 6; t(String(cust.whatsapp), 40, ly, 10, mono, G.aaa); ly += 10 }
  const leftColH = (ly - yTop) + 22
  const stmtH = 208
  const rowH = Math.max(leftColH, showStmt ? stmtH : 0)
  if (showStmt) {
    rect(colW, yTop, colW, rowH, effPaid ? rgb(0.957, 0.984, 0.969) : G.peach)
    vline(colW, yTop, yTop + rowH, G.line)
    const sx = colW + 40, sxr = 794 - 40
    let sy = yTop + 22
    spaced(`${String(IS.label_account_statement).toUpperCase()} — AS OF ${statementDate}`, sx, sy, 9, monoM, G.aaa, 2); sy += 19
    const lab1 = priorIsCredit ? "Prior Balance (credit in customer favour)" : "Prior Balance (before this invoice)"
    const val1 = priorIsCredit ? `(${fmt(Math.abs(priorBalance))})` : fmt(Math.max(0, priorBalance))
    const c1 = priorIsCredit ? rgb(0.176, 0.478, 0.31) : G.g888
    sy += 4; t(lab1, sx, sy, 11, body, c1); tr(val1, sxr, sy, 11, mono, c1); sy += 19
    t(`+ This Invoice (${v.ref})`, sx, sy, 11, body, G.g888); tr(fmt(total), sxr, sy, 11, mono, G.g888); sy += 19
    hline(sx, sy, sxr - sx, G.peachLine); sy += 8
    const owedC = currentBalance > 0 ? G.red : rgb(0.176, 0.478, 0.31)
    t(currentBalance > 0 ? "Total Now Owed" : "Account Balance", sx, sy + 2, 11, bodySB, owedC)
    tr(`TZS ${fmt(currentBalance)}`, sxr, sy, 14, monoM, owedC); sy += 24
    hline(sx, sy, sxr - sx, G.peachLine); sy += 10
    spaced("STATUS OF THIS INVOICE", sx, sy + 1, 10, mono, G.g888, 1); sy += 17
    const stC = effPaid ? rgb(0.176, 0.478, 0.31) : effPartial ? rgb(0.722, 0.525, 0.043) : G.red
    const stT = effPaid ? (settledByCredit ? "SETTLED · covered by account credit" : "PAID IN FULL")
      : effPartial ? `PARTIAL · ${fmt(effRemaining)} outstanding` : `OUTSTANDING · ${fmt(effRemaining)}`
    t(stT, sx, sy, 11, monoM, stC); sy += 19
    t(`Reflects all invoices and payments as of ${statementDate}`, sx, sy, 9, bodyIt, G.aaa)
  }
  hline(0, yTop + rowH, 794, G.line)
  yTop += rowH

  // ── Footer geometry (needed first, to know how much room is left) ────────
  const bandH = 6
  const footTop = 1122.5 - bandH - 16 - 48
  const drawBand = () => {
    for (let i = 0; i < 40; i++) {
      const u = i / 39, tt2 = 1 - Math.abs(u - 0.5) * 2
      const c = rgb(0.102 + (P.red - 0.102) * tt2, 0.102 + (P.green - 0.102) * tt2, 0.102 + (P.blue - 0.102) * tt2)
      rect(794 * u, 1122.5 - bandH, 794 / 39 + 0.5, bandH, c)
    }
  }
  const drawFooter = () => {
    hline(40, footTop, 714, G.line)
    t(IS.footer_note || "", 40, footTop + 14, 10, bodyIt, G.aaa)
    tr(IS.company_name, 754, footTop + 12, 9, monoM, P)
    tr(v.ref, 754, footTop + 25, 9, mono, G.ccc)
    drawBand()
  }

  // ── Paging ──────────────────────────────────────────────────────────────
  // Content must end above `limit`. When something does not fit, close the
  // page with its footer and continue on a fresh page with a slim header.
  const limit = footTop - 12
  const newPage = (): number => {
    drawFooter()
    page = doc.addPage([PW, PH])
    rect(0, 0, 794, 6, P)
    t(IS.company_name, 40, 34, 13, syne, INK)
    tr(v.ref, 754, 34, 13, monoM, INK)
    spaced(`${String(IS.label_invoice || "Tax Invoice").toUpperCase()} \u00b7 CONTINUED`, 40, 54, 9, mono, G.aaa, 1.5)
    hline(40, 74, 714, G.line)
    return 92
  }

  yTop += 20
  const tX = 40, tW = 714
  const cWd = { num: 36, qty: 50, unit: 110, disc: 60, amt: 130 }
  const descW = tW - cWd.num - cWd.qty - cWd.unit - cWd.disc - cWd.amt
  const xDesc = tX + cWd.num, xQty = xDesc + descW + cWd.qty, xUnit = xQty + cWd.unit, xDisc = xUnit + cWd.disc, xAmt = tX + tW
  const drawTableHead = (top: number) => {
    rect(tX, top, tW, 27, G.tableHead)
    const hy = top + 9
    spaced("#", tX + 14, hy, 9, mono, G.ccc, 1)
    spaced("ITEM / DESCRIPTION", xDesc + 12, hy, 9, mono, G.ccc, 1)
    spacedR("QTY", xQty - 12, hy, 9, mono, G.ccc, 1)
    spacedR("UNIT PRICE", xUnit - 12, hy, 9, mono, G.ccc, 1)
    spacedR("DISC", xDisc - 12, hy, 9, mono, G.ccc, 1)
    spacedR("AMOUNT (TZS)", xAmt - 12, hy, 9, mono, G.ccc, 1)
  }
  drawTableHead(yTop)
  yTop += 27
  const lns: any[] = (v.voucher_lines || [])
  lns.forEach((l: any, i: number) => {
    const hasSku = !!l.products?.sku
    const rH = hasSku ? 41 : 32
    if (yTop + rH > limit) { yTop = newPage(); drawTableHead(yTop); yTop += 27 }
    if (i % 2 === 1) rect(tX, yTop, tW, rH, G.zebra)
    const by = yTop + 10
    t(String(i + 1).padStart(2, "0"), tX + 11, by + 1, 11, monoM, P)
    t(String(l.products?.name || l.description || "—").slice(0, 44), xDesc + 12, by, 12, bodySB, INK)
    if (hasSku) t(`SKU: ${l.products.sku}`, xDesc + 12, by + 14, 9, mono, G.bbb)
    tr(String(l.qty), xQty - 12, by, 12, mono, INK)
    tr(fmt(l.unit_price || 0), xUnit - 12, by, 12, mono, INK)
    tr(l.discount_pct ? `${l.discount_pct}%` : "—", xDisc - 12, by + 0.5, 11, mono, G.aaa)
    tr(fmt(l.total || 0), xAmt - 12, by - 0.5, 13, monoM, INK)
    yTop += rH
    hline(tX, yTop, tW, rgb(0.961, 0.961, 0.961))
  })
  {
    // Bank details and the invoice total stay together on one page.
    const has2b = IS.bank2_name && IS.bank2_account_number
    const payH = IS.show_bank_details ? 19 + 14 + (3 + (has2b ? 1 : 0)) * 22 + (IS.payment_note ? 30 : 0) + 14 : 0
    if (yTop + 24 + Math.max(payH, 29 + 45) > limit) yTop = newPage() - 24
  }
  yTop += 24
  const payX = 40, payW = colW - 40 - 24
  const totX = colW + 24, totW = 794 - 40 - totX
  let payBottom = yTop
  if (IS.show_bank_details) {
    spaced(String(IS.label_payment_details).toUpperCase(), payX, yTop, 9, monoM, G.aaa, 2)
    const cardY = yTop + 19
    const has2 = IS.bank2_name && IS.bank2_account_number
    const lines2 = 3 + (has2 ? 1 : 0)
    const noteH = IS.payment_note ? 30 : 0
    const cardH = 14 + lines2 * 22 + noteH + 14
    rrect(payX, cardY, payW, cardH, 8, { color: mix(P, 0.07), borderColor: mix(P, 0.19), borderWidth: px(1) })
    let byy = cardY + 14
    t("A/C Name: ", payX + 16, byy + 1, 11, mono, G.g555)
    t(IS.bank_account_name, payX + 16 + mono.widthOfTextAtSize("A/C Name: ", px(11)) / k, byy + 1, 11, monoM, INK); byy += 22
    t(`${IS.bank_name}: `, payX + 16, byy + 1, 11, mono, G.g555)
    t(IS.bank_account_number, payX + 16 + mono.widthOfTextAtSize(`${IS.bank_name}: `, px(11)) / k, byy, 13, monoM, INK); byy += 22
    if (has2) {
      t(`${IS.bank2_name}: `, payX + 16, byy + 1, 11, mono, G.g555)
      t(IS.bank2_account_number, payX + 16 + mono.widthOfTextAtSize(`${IS.bank2_name}: `, px(11)) / k, byy, 13, monoM, INK); byy += 22
    }
    t(`Branch: ${IS.bank_branch}`, payX + 16, byy + 1, 11, mono, G.g555); byy += 22
    if (IS.payment_note) {
      hline(payX + 16, byy, payW - 32, mix(P, 0.19)); byy += 10
      t(IS.payment_note, payX + 16, byy, 10, bodyIt, P)
    }
    vline(colW, yTop, cardY + cardH, G.line)
    payBottom = cardY + cardH
  }
  spaced(String(IS.label_this_invoice).toUpperCase(), totX, yTop, 9, monoM, G.aaa, 2)
  const tcY = yTop + 29
  rrect(totX, tcY, totW, 45, 8, { color: mix(P, 0.095), borderColor: mix(P, 0.25), borderWidth: px(1.5) })
  t("Invoice Total", totX + 14, tcY + 14.5, 13, syne, INK)
  tr(`TZS ${fmt(total)}`, totX + totW - 14, tcY + 12, 20, monoM, INK)
  yTop = Math.max(payBottom, tcY + 45)

  if (IS.show_notes && v.notes) {
    if (yTop + 20 + 48 > limit) yTop = newPage() - 20
    yTop += 20
    const nH = 48
    rect(40, yTop, 714, nH, rgb(0.976, 0.976, 0.976))
    rect(40, yTop, 3, nH, P)
    spaced(String(IS.label_notes || "Notes").toUpperCase(), 56, yTop + 12, 9, monoM, G.aaa, 1.5)
    t(String(v.notes).slice(0, 110), 56, yTop + 26, 11, body, G.g555)
    yTop += nH
  }

  // ── Digital-copy notice ─────────────────────────────────────────────────
  // wa-receipt v15 drew a "Received by / Signature / Date received" block
  // here. A PDF sent over WhatsApp cannot be signed, and the block made
  // customers think it should be. The printed invoice (MalkiaOS > Print) keeps
  // its signing area and is the one signed on delivery.
  const dcLines = wrapBy(body, DIGITAL_COPY_BODY, px(11), px(714 - 16 - 20))
  const dcH = 13 + 9 + 9 + dcLines.length * 15 + 9
  const drawNotice = (top: number) => {
    rect(40, top, 714, dcH, mix(P, 0.07))
    rect(40, top, 3, dcH, P)
    spaced(DIGITAL_COPY_HEAD, 56, top + 13, 9, monoM, G.g555, 1.5)
    let dcy = top + 13 + 9 + 9
    for (const l of dcLines) { t(l, 56, dcy, 11, body, G.g555); dcy += 15 }
  }
  if (yTop + 26 + dcH > limit) yTop = newPage() - 26
  drawNotice(yTop + 26)
  drawFooter()

  // Page numbers, only when the invoice runs past one page.
  const pages = doc.getPages()
  if (pages.length > 1) {
    pages.forEach((pg: any, i: number) => {
      page = pg
      spaced(`PAGE ${i + 1} OF ${pages.length}`, 40, footTop + 30, 9, mono, G.aaa, 1.5)
    })
  }
  return await doc.save()
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  const internalKey = Deno.env.get("WA_INTERNAL_KEY") || ""
  const okKey = internalKey && req.headers.get("x-internal-key") === internalKey
  if (!okKey && !(await isStaff(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401)

  let b: any
  try { b = await req.json() } catch { return json({ error: "bad json" }, 400) }
  const ref = String(b.ref || "").trim()
  if (!ref) return json({ error: "ref required" }, 400)

  const { data: v, error: vErr } = await sb.from("vouchers")
    .select("ref, type, posting_date, payment_method, total_amount, due_date, payment_terms, notes, salesperson_id, posted_by, customers(name, company, contact_person, address, tin_number, balance, whatsapp, pregnancy_stage, crown_points), voucher_lines(qty, unit_price, subtotal, total, discount_pct, description, products(name, sku, category))")
    .eq("ref", ref).maybeSingle()
  if (vErr) return json({ error: `db: ${vErr.message}` }, 500)
  if (!v) return json({ error: `voucher ${ref} not found` }, 404)
  if (v.type !== "sales_invoice") return json({ error: `${ref} is not a sales invoice (wa-invoice sends invoices only; use wa-receipt for cash sales)` }, 400)
  const cust: any = Array.isArray(v.customers) ? v.customers[0] : v.customers
  const phone = cust?.whatsapp
  if (!phone) return json({ error: "customer has no whatsapp number" }, 400)

  const fonts = await loadFonts()
  const bytes = await renderInvoicePdf(v, cust, fonts)
  const path = `${v.ref}/Ankara-${v.ref}.pdf`
  const { error: upErr } = await sb.storage.from("receipts").upload(path, bytes, { contentType: "application/pdf", upsert: true })
  if (upErr) return json({ error: `storage: ${upErr.message}` }, 500)
  const { data: signed, error: sErr } = await sb.storage.from("receipts").createSignedUrl(path, 60 * 60 * 24 * 7)
  if (sErr || !signed?.signedUrl) return json({ error: `sign: ${sErr?.message || "no url"}` }, 500)
  const totalFmt = Number(v.total_amount || 0).toLocaleString("en-US")
  const dueFmt = v.due_date ? fmtDate(v.due_date) : ""
  const dispName = String(cust?.company || cust?.name || "Mteja")
  const caption = `Ankara yako ${v.ref} · Jumla TZS ${totalFmt}${dueFmt ? ` · Ilipwe ifikapo ${dueFmt}` : ""}. Hifadhi hati hii kwa kumbukumbu zako.`
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-key": internalKey },
    body: JSON.stringify({
      phone, purpose: "invoice", name: dispName, body: caption, media_url: signed.signedUrl, source: "malkiaos",
      tpl: { key: "wa_template_invoice_pdf", vars: { "1": v.ref, "2": totalFmt, "3": signed.signedUrl, "4": dueFmt || "—" } },
    }),
  })
  const rj = await r.json().catch(() => ({}))
  if (!r.ok) return json({ error: rj?.error || `wa-send ${r.status}`, pdf: path }, 502)
  return json({ ok: true, pdf: path, twilio_sid: rj.twilio_sid, mode: rj.mode })
})
