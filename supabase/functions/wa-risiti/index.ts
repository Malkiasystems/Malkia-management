// wa-risiti v1 (18 Nov 2026): the cash-sale receipt (RISITI) PDF sender, split
// out of wa-receipt v15 so that receipt changes never touch wa-receipt, which
// stays live as the fallback. Same A5 design, caption and Meta template
// (wa_template_receipt_pdf) as wa-receipt v15, with ONE change: the
// "Jiunge na Malkia Circle" link carries a personal code (?i=...), so the join
// page opens with the customer's name and WhatsApp number already filled in.
// Customers who are already Circle members, and any failure while creating the
// code, get the plain link exactly as before.
// Sales invoices are refused here: wa-invoice sends those.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "npm:pdf-lib@1.17.1"
import fontkit from "npm:@pdf-lib/fontkit@1.1.1"
import QR from "npm:qrcode@1.5.4"

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

let markBytes: Uint8Array | null = null
async function loadMark(): Promise<Uint8Array | null> {
  if (markBytes) return markBytes
  try {
    const { data } = await sb.storage.from("receipts").download("_assets/mark-white.png")
    if (data) markBytes = new Uint8Array(await data.arrayBuffer())
  } catch { /* logoless */ }
  return markBytes
}

const TEAL = rgb(0.522, 0.761, 0.745)
const TEAL_DK = rgb(0.29, 0.5, 0.49)
const BLUSH = rgb(0.969, 0.651, 0.678)
const BLUSH_SOFT = rgb(0.992, 0.937, 0.945)
const TEAL_SOFT = rgb(0.937, 0.969, 0.965)
const INK = rgb(0.1, 0.1, 0.1)
const DARK = rgb(0.102, 0.102, 0.102)
const GREY = rgb(0.53, 0.55, 0.57)
const GREY_LT = rgb(0.78, 0.76, 0.76)
const ROW_ALT = rgb(0.98, 0.985, 0.983)
const LINE = rgb(0.93, 0.91, 0.91)
const WHITE = rgb(1, 1, 1)
const mm = (x: number) => x * 2.8346
const fmtDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "") }

const TIPS: Record<string, string> = {
  "Belts": "Vaa belly binder saa 8 hadi 12 kwa siku; anza siku ya 3 baada ya kujifungua.",
  "Pumps": "Kamua kwa utulivu: picha ya mtoto wako karibu husaidia maziwa kutoka zaidi.",
  "Pillows": "Lala na mto umbo la C: upande mmoja magotini, mwingine ukishikilia tumbo.",
  "Pads": "Badilisha pad kila saa 3 hadi 4 siku za mwanzo; usafi huzuia maambukizi.",
  "Skin Care & Cosmetics": "Paka mara mbili kwa siku, asubuhi na kabla ya kulala, kwa matokeo bora.",
  "Maternity Bras": "Bra isibane: ukubwa hubadilika ujauzitoni. Faraja kwanza, kipimo baadaye.",
  "Baby Products": "Mbebe mtoto ngozi-kwa-ngozi mara kwa mara; humtuliza na husaidia kunyonyesha.",
  "Kits & Packages": "Andaa begi la hospitali kufikia wiki ya 36: nguo, pads, vitu vya mtoto tayari.",
  "Outfits": "Chagua nguo zinazopumua; mwili wako unafanya kazi kubwa, upe faraja.",
  default: "Kila mama anastahili mwongozo wa mkunga katika safari yake.",
}

// ── Personal Circle join link ────────────────────────────────────────────────
const PLAIN_JOIN_URL = "https://malkia.co.tz/join?src=risiti"
const newToken = () => {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789"
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  let s = ""
  for (const x of b) s += abc[x % abc.length]
  return s
}
// Returns the join URL for this customer. Never throws: any problem, or a
// customer who is already a Circle member, yields the plain link.
async function joinUrlFor(cust: any, voucherRef: string): Promise<{ url: string; personal: boolean }> {
  try {
    const custId = cust?.id
    const last9 = String(cust?.whatsapp || "").replace(/\D/g, "").slice(-9)
    if (!custId || last9.length !== 9) return { url: PLAIN_JOIN_URL, personal: false }
    const { data: member } = await sb.from("circle_profiles").select("user_id").ilike("whatsapp", `%${last9}`).limit(1)
    if (member && member.length) return { url: PLAIN_JOIN_URL, personal: false }
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
    const { data: old } = await sb.from("circle_invites").select("token").eq("customer_id", custId).gt("created_at", since).order("created_at", { ascending: false }).limit(1)
    let token = old && old.length ? String(old[0].token) : ""
    if (!token) {
      token = newToken()
      const { error } = await sb.from("circle_invites").insert({ token, customer_id: custId, voucher_ref: voucherRef })
      if (error) return { url: PLAIN_JOIN_URL, personal: false }
    }
    return { url: `${PLAIN_JOIN_URL}&i=${token}`, personal: true }
  } catch {
    return { url: PLAIN_JOIN_URL, personal: false }
  }
}

async function renderReceiptPdf(v: any, cust: any, phone: string, joinUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit as any)
  const W = mm(148), H = mm(210)
  const page = doc.addPage([W, H])
  const annots: any[] = []
  const link = (x: number, y1: number, w: number, h: number, url: string) => {
    annots.push(doc.context.register(doc.context.obj({
      Type: "Annot", Subtype: "Link", Rect: [x, y1, x + w, y1 + h],
      Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    })))
  }
  const fb = await loadFonts()
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold)
  const obl = await doc.embedFont(StandardFonts.HelveticaOblique)
  const courier = await doc.embedFont(StandardFonts.Courier)
  const courierB = await doc.embedFont(StandardFonts.CourierBold)
  const syne = fb.syne ? await doc.embedFont(fb.syne, { subset: true }) : helvB
  const syneB = fb.syneB ? await doc.embedFont(fb.syneB, { subset: true }) : helvB
  const mono = fb.mono ? await doc.embedFont(fb.mono, { subset: true }) : courier
  const monoM = fb.monoM ? await doc.embedFont(fb.monoM, { subset: true }) : courierB

  let mark: any = null
  const mb = await loadMark()
  if (mb) {
    try { mark = await doc.embedPng(mb) } catch { mark = null; markBytes = null }
  }

  const card = (x: number, yTop: number, w: number, h: number, r: number, color: any, opts: any = {}) => {
    const d = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
    page.drawSvgPath(d, { x, y: yTop, color, ...opts })
  }
  const rightText = (txt: string, xRight: number, y: number, size: number, font: any, color: any) =>
    page.drawText(txt, { x: xRight - font.widthOfTextAtSize(txt, size), y, size, font, color })
  const drawSpaced = (txt: string, x: number, y: number, size: number, font: any, color: any, extra: number) => {
    let cx = x
    for (const ch of txt) { page.drawText(ch, { x: cx, y, size, font, color }); cx += font.widthOfTextAtSize(ch, size) + extra }
  }
  const rightSpaced = (txt: string, xRight: number, y: number, size: number, font: any, color: any, extra: number) => {
    let w = 0
    for (const ch of txt) w += font.widthOfTextAtSize(ch, size) + extra
    w -= extra
    drawSpaced(txt, xRight - w, y, size, font, color, extra)
  }

  const headH = mm(42)
  page.drawRectangle({ x: 0, y: H - headH, width: W, height: headH, color: TEAL })
  const markH = mm(22)
  let wx = mm(12)
  if (mark) {
    const markW = markH * (mark.width / mark.height)
    page.drawImage(mark, { x: mm(12), y: H - mm(29), width: markW, height: markH })
    wx = mm(12) + markW + mm(5)
  }
  page.drawText("Malkia", { x: wx, y: H - mm(13), size: 15.5, font: syne, color: WHITE })
  page.drawText("Maternity", { x: wx, y: H - mm(19.5), size: 15.5, font: syne, color: WHITE })
  drawSpaced("REIMAGINING MOTHERHOOD", wx, H - mm(25), 5.6, monoM, WHITE, 0.9)
  page.drawText("Igesa Road, Sinza, Dar es Salaam", { x: wx, y: H - mm(30.5), size: 6.5, font: mono, color: TEAL_SOFT })
  page.drawText("WhatsApp +255 750 333 111 · www.malkia.co.tz", { x: wx, y: H - mm(34.5), size: 6.5, font: mono, color: TEAL_SOFT })
  link(wx, H - mm(36), mm(62), mm(4), "https://www.malkia.co.tz?src=risiti")
  rightSpaced("RISITI", W - mm(12), H - mm(10.5), 6, monoM, rgb(0.92, 0.98, 0.97), 1.6)
  rightText(v.ref, W - mm(12), H - mm(17.5), 14.5, syne, WHITE)
  rightText(`Tarehe: ${fmtDate(v.posting_date)}`, W - mm(12), H - mm(25), 7, monoM, rgb(0.95, 1, 1))
  rightText(`Malipo: ${v.payment_method || ""}`, W - mm(12), H - mm(30), 7, monoM, rgb(0.95, 1, 1))
  rightText(`Mteja: ${String(cust?.name || "Mama").split(" ")[0]}`, W - mm(12), H - mm(35), 7, monoM, rgb(0.95, 1, 1))

  const stage = String(cust?.pregnancy_stage || "").toLowerCase()
  const stageMsg = (stage.includes("pregnant") || stage.includes("wks") || stage.includes("week"))
    ? "Unafanya jambo kubwa, Mama. Kila hatua yako ina maana."
    : (stage.includes("post"))
    ? "Kazi ngumu zaidi haionekani. Tunakuona, na tupo pamoja nawe."
    : "Umama unastahili bora zaidi. Ndiyo maana Malkia ipo."
  let y = H - headH - mm(3.5)
  card(mm(12), y, W - mm(24), mm(10), mm(2), BLUSH_SOFT)
  page.drawRectangle({ x: mm(12), y: y - mm(10), width: mm(1.2), height: mm(10), color: BLUSH })
  page.drawText(stageMsg, { x: mm(16), y: y - mm(6.5), size: 8.5, font: obl, color: rgb(0.35, 0.22, 0.22) })

  y -= mm(13.5)
  card(mm(12), y, W - mm(24), mm(13), mm(2.5), rgb(0.965, 0.965, 0.96))
  drawSpaced("MTEJA", mm(16), y - mm(4.8), 6, monoM, GREY_LT, 1.4)
  page.drawText(String(cust?.name || "Mama"), { x: mm(16), y: y - mm(10), size: 11, font: syneB, color: INK })
  if (cust?.pregnancy_stage) rightText(String(cust.pregnancy_stage), W - mm(16), y - mm(4.8), 6.5, monoM, TEAL_DK)
  rightText(String(phone), W - mm(16), y - mm(9.8), 7, mono, GREY)

  y -= mm(16.5)
  const tX = mm(12), tW = W - mm(24)
  page.drawRectangle({ x: tX, y: y - mm(6.5), width: tW, height: mm(6.5), color: DARK })
  drawSpaced("BIDHAA", tX + mm(3), y - mm(4.5), 6, monoM, WHITE, 1.3)
  rightSpaced("KIASI", tX + tW - mm(30), y - mm(4.5), 6, monoM, WHITE, 1.3)
  rightSpaced("JUMLA (TZS)", tX + tW - mm(3), y - mm(4.5), 6, monoM, WHITE, 1.3)
  y -= mm(6.5)
  const lines: any[] = (v.voucher_lines || []).slice(0, 8)
  let rowIdx = 0
  for (const l of lines) {
    const name = String(l.products?.name || "Bidhaa").slice(0, 38)
    const gross = Number(l.subtotal ?? (l.qty * (l.unit_price || 0)))
    const net = Number(l.total || 0)
    const hasDisc = gross > net + 0.5
    const rowH = hasDisc ? mm(11.5) : mm(9)
    if (rowIdx % 2 === 1) page.drawRectangle({ x: tX, y: y - rowH, width: tW, height: rowH, color: ROW_ALT })
    page.drawText(String(rowIdx + 1).padStart(2, "0"), { x: tX + mm(3), y: y - mm(5), size: 7, font: monoM, color: TEAL })
    page.drawText(name, { x: tX + mm(10), y: y - mm(4.5), size: 8.5, font: syneB, color: INK })
    page.drawText(`@ ${Number(l.unit_price || 0).toLocaleString("en-US")}`, { x: tX + mm(10), y: y - mm(7.8), size: 6.3, font: mono, color: GREY_LT })
    rightText(`x${l.qty}`, tX + tW - mm(30), y - mm(5.4), 8, mono, GREY)
    if (hasDisc) {
      const g = Math.round(gross).toLocaleString("en-US")
      rightText(g, tX + tW - mm(3), y - mm(3.6), 6.3, mono, GREY_LT)
      const gw = mono.widthOfTextAtSize(g, 6.3)
      page.drawLine({ start: { x: tX + tW - mm(3) - gw, y: y - mm(3) }, end: { x: tX + tW - mm(3), y: y - mm(3) }, thickness: 0.5, color: GREY_LT })
      rightText(net.toLocaleString("en-US"), tX + tW - mm(3), y - mm(7.6), 9.5, monoM, INK)
      page.drawText(`Punguzo: umeokoa ${Math.round(gross - net).toLocaleString("en-US")}`, { x: tX + mm(10), y: y - mm(10.6), size: 6.2, font: monoM, color: TEAL_DK })
    } else {
      rightText(net.toLocaleString("en-US"), tX + tW - mm(3), y - mm(5.6), 9.5, monoM, INK)
    }
    y -= rowH
    page.drawLine({ start: { x: tX, y }, end: { x: tX + tW, y }, thickness: 0.4, color: LINE })
    rowIdx++
  }
  if ((v.voucher_lines || []).length > 8) {
    y -= mm(5)
    page.drawText(`...na bidhaa ${(v.voucher_lines || []).length - 8} zaidi`, { x: tX + mm(10), y, size: 7, font: obl, color: GREY })
    y -= mm(2)
  }

  y -= mm(4)
  card(mm(12), y, W - mm(24), mm(14), mm(3), TEAL_SOFT)
  drawSpaced("JUMLA IMELIPWA", mm(16), y - mm(6), 6, monoM, GREY, 1.4)
  page.drawText(String(v.payment_method || ""), { x: mm(16), y: y - mm(10.5), size: 6.5, font: mono, color: GREY_LT })
  rightText(`TZS ${Number(v.total_amount || 0).toLocaleString("en-US")}`, W - mm(16), y - mm(10), 16, syne, INK)
  y -= mm(17.5)

  const earned = Math.round(Number(v.total_amount || 0) / 1000)
  const balance = Number(cust?.crown_points || 0) + earned
  card(mm(12), y, W - mm(24), mm(14), mm(3), DARK)
  drawSpaced("POINTI ZA CROWN", mm(16), y - mm(5.3), 6, monoM, rgb(0.5, 0.5, 0.5), 1.4)
  page.drawText(`+${earned}`, { x: mm(16), y: y - mm(11.3), size: 13, font: syne, color: BLUSH })
  page.drawText("kwa ununuzi huu", { x: mm(16) + syne.widthOfTextAtSize(`+${earned}`, 13) + mm(2.5), y: y - mm(10.8), size: 6.5, font: mono, color: rgb(0.55, 0.55, 0.55) })
  rightSpaced("SALIO", W - mm(16), y - mm(5.3), 6, monoM, rgb(0.5, 0.5, 0.5), 1.4)
  rightText(`${balance.toLocaleString("en-US")} pts`, W - mm(16), y - mm(11.3), 10.5, monoM, WHITE)
  y -= mm(17.5)

  const cat = String(lines[0]?.products?.category || "default")
  const tip = TIPS[cat] || TIPS.default
  card(mm(12), y, W - mm(24), mm(17), mm(2.5), TEAL_SOFT)
  page.drawRectangle({ x: mm(12), y: y - mm(17), width: mm(1.2), height: mm(17), color: TEAL })
  drawSpaced("KIDOKEZO CHA MKUNGA", mm(16), y - mm(4.8), 6, monoM, TEAL_DK, 1.4)
  page.drawText(tip, { x: mm(16), y: y - mm(8.6), size: 7.5, font: obl, color: rgb(0.3, 0.38, 0.38) })
  page.drawText("Pata vidokezo kama hiki kila wiki kutoka kwa wakunga wetu, BURE.", { x: mm(16), y: y - mm(12), size: 6.8, font: helv, color: GREY })
  page.drawText("Jiunge na Malkia Circle leo: malkia.co.tz/join", { x: mm(16), y: y - mm(15.4), size: 8, font: syneB, color: TEAL_DK })
  link(mm(16), y - mm(16.8), mm(92), mm(4.2), joinUrl)
  y -= mm(20.5)

  const qrPayload = "https://shop.malkia.co.tz?src=risiti-qr"
  const q = QR.create(qrPayload, { errorCorrectionLevel: "M" })
  link(mm(12), y - mm(22), W - mm(24), mm(22), "https://shop.malkia.co.tz?src=risiti-tap")
  const n = q.modules.size
  card(mm(12), y, W - mm(24), mm(22), mm(3), BLUSH_SOFT)
  const qrSize = mm(17), cell = qrSize / n, qx = mm(15.5), qyTop = y - mm(2.5)
  page.drawRectangle({ x: qx - 1.5, y: qyTop - qrSize - 1.5, width: qrSize + 3, height: qrSize + 3, color: WHITE })
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (q.modules.get(r, c)) page.drawRectangle({ x: qx + c * cell, y: qyTop - (r + 1) * cell, width: cell, height: cell, color: INK })
  }
  page.drawText("Duka Mtandao la Malkia", { x: mm(38), y: y - mm(6.6), size: 9.5, font: syneB, color: INK })
  page.drawText('Scan QR hii kutembelea "Duka Mtandao" la Malkia', { x: mm(38), y: y - mm(10.4), size: 7.3, font: helv, color: GREY })
  page.drawText("kwenye shop.malkia.co.tz", { x: mm(38), y: y - mm(13.4), size: 7.3, font: helv, color: GREY })
  page.drawText("Pata Pointi za Crown MARA MBILI kwa oda za mtandaoni!", { x: mm(38), y: y - mm(17), size: 7.2, font: syneB, color: TEAL_DK })
  page.drawText("Asante kwa kuwa sehemu ya familia ya Malkia", { x: mm(38), y: y - mm(20.3), size: 6.8, font: obl, color: rgb(0.85, 0.42, 0.48) })

  const efdY = Math.max(mm(12.3), y - mm(25.5))
  page.drawText("Hii ni nakala ya kidigitali. Wasiliana nasi kwa risiti ya EFD.", { x: mm(12), y: efdY, size: 5.8, font: mono, color: GREY_LT })
  page.drawRectangle({ x: 0, y: 0, width: W, height: mm(10), color: DARK })
  page.drawText("@malkia_tz · www.malkia.co.tz", { x: mm(12), y: mm(4), size: 6.5, font: mono, color: rgb(0.55, 0.55, 0.55) })
  rightText("Malkia Wellness Group Ltd · P.O. Box 53622 DSM", W - mm(12), mm(4), 6, mono, rgb(0.45, 0.45, 0.45))

  if (annots.length) page.node.set(PDFName.of("Annots"), doc.context.obj(annots))
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
    .select("ref, type, posting_date, payment_method, total_amount, due_date, payment_terms, notes, salesperson_id, posted_by, customers(id, name, company, contact_person, address, tin_number, balance, whatsapp, pregnancy_stage, crown_points), voucher_lines(qty, unit_price, subtotal, total, discount_pct, description, products(name, sku, category))")
    .eq("ref", ref).maybeSingle()
  if (vErr) return json({ error: `db: ${vErr.message}` }, 500)
  if (!v) return json({ error: `voucher ${ref} not found` }, 404)
  if (v.type === "sales_invoice") return json({ error: `${ref} is a sales invoice (wa-risiti sends cash-sale receipts only; use wa-invoice)`, code: "not_cash_sale" }, 400)
  const cust: any = Array.isArray(v.customers) ? v.customers[0] : v.customers
  const phone = cust?.whatsapp
  if (!phone) return json({ error: "customer has no whatsapp number" }, 400)

  const join = await joinUrlFor(cust, v.ref)
  const bytes = await renderReceiptPdf(v, cust, String(phone), join.url)
  const path = `${v.ref}/Risiti-${v.ref}.pdf`
  const { error: upErr } = await sb.storage.from("receipts").upload(path, bytes, { contentType: "application/pdf", upsert: true })
  if (upErr) return json({ error: `storage: ${upErr.message}` }, 500)
  const { data: signed, error: sErr } = await sb.storage.from("receipts").createSignedUrl(path, 60 * 60 * 24 * 7)
  if (sErr || !signed?.signedUrl) return json({ error: `sign: ${sErr?.message || "no url"}` }, 500)

  const totalFmt = Number(v.total_amount || 0).toLocaleString("en-US")
  const caption = `Risiti yako ${v.ref} · Jumla TZS ${totalFmt}. Asante kwa kuwa sehemu ya familia ya Malkia 💕`
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-key": internalKey },
    body: JSON.stringify({
      phone, purpose: "receipt", name: cust?.name, body: caption, media_url: signed.signedUrl, source: "malkiaos",
      tpl: { key: "wa_template_receipt_pdf", vars: { "1": v.ref, "2": totalFmt, "3": signed.signedUrl } },
    }),
  })
  const rj = await r.json().catch(() => ({}))
  if (!r.ok) return json({ error: rj?.error || `wa-send ${r.status}`, pdf: path }, 502)
  return json({ ok: true, pdf: path, twilio_sid: rj.twilio_sid, mode: rj.mode, personal_join_link: join.personal })
})
