// @ts-nocheck
// wa-templates v3: WhatsApp templates managed from MalkiaOS.
// v2 added the two invoice messages that carry the invoice PDF (thank-you, part paid).
// v3 lets a template with no fixed use carry a PDF too (attach_pdf), for guides and
//    weekly lessons. Nothing changes for the slots that already exist.
//
// POST { action: "list" }      WhatsApp Inbox permission. Every registered template with
//                              Meta's current decision (refreshed from the provider).
// POST { action: "create", slot, name, category, body, samples, buttons, attach_pdf }
//                              Administrators only. Checks the draft against Meta's rules,
//                              creates it, asks Meta to approve it, records it.
// Wording cannot be edited after submission (Meta's rule): a change is a new template.
// Slots that can be created here: back_in_stock, invoice_thanks_pdf, invoice_part_pdf, or none.
// The receipt, credit-invoice and payslip templates are tied to code, so they are listed but
// not replaced. A PDF template gets the file as one extra blank after the wording's own blanks.
// Meta's sample file is a real invoice PDF for the invoice slots, and a plain one-page
// sample document for a template with no fixed use.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

const KNOWN = { wa_template_receipt_text: "receipt_text", wa_template_receipt_pdf: "receipt_pdf", wa_template_invoice_pdf: "invoice_pdf", wa_template_payslip: "payslip", wa_template_back_in_stock: "back_in_stock", wa_template_invoice_thanks_pdf: "invoice_thanks_pdf", wa_template_invoice_part_pdf: "invoice_part_pdf" }
const CREATABLE_SLOTS = ["back_in_stock", "invoice_thanks_pdf", "invoice_part_pdf"]
// PDF slots: how many blanks the wording itself has. The file is the next blank after them.
const PDF_SLOTS = { invoice_thanks_pdf: 2, invoice_part_pdf: 5 }
const PDF_BLANKS = {
  invoice_thanks_pdf: "{{1}} invoice number, {{2}} total",
  invoice_part_pdf: "{{1}} invoice number, {{2}} total, {{3}} amount paid, {{4}} balance, {{5}} when the balance is due",
}

async function caller(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null
  const { data } = await sb.auth.getUser(authHeader.slice(7))
  const u = data && data.user
  if (!u) return null
  const cols = "id, is_active, full_name, permissions"
  let { data: row } = await sb.from("users").select(cols).eq("id", u.id).maybeSingle()
  if (!row && u.email) { const r2 = await sb.from("users").select(cols).ilike("email", u.email).maybeSingle(); row = r2.data }
  if (!row || !row.is_active) return null
  const perms = Array.isArray(row.permissions) ? row.permissions : []
  return { id: row.id, name: row.full_name, admin: perms.length >= 40, inbox: perms.length >= 40 || perms.includes("crm.inbox") }
}

async function twilio(method, url, body) {
  const auth = "Basic " + btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID") || ""}:${Deno.env.get("TWILIO_AUTH_TOKEN") || ""}`)
  const r = await fetch(url, { method, headers: { authorization: auth, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, ok: r.status >= 200 && r.status < 300, body: j }
}

const mapStatus = (s) => {
  const v = String(s || "").toLowerCase()
  if (v === "approved" || v === "rejected" || v === "paused" || v === "disabled") return v
  if (v === "received" || v === "pending" || v === "unsubmitted") return "pending"
  return "unknown"
}

const blankNumbers = (body) => [...new Set([...String(body || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b)
// A template with no fixed use that carries a PDF chosen at send time.
const wantsOwnPdf = (d) => !d.slot && d.attach_pdf === true

// Meta's rules that can be checked before submitting. Returns a list of problems in plain words.
function problems(d) {
  const out = []
  const name = String(d.name || "")
  if (!/^[a-z][a-z0-9_]{2,60}$/.test(name)) out.push("The name must be lowercase letters, numbers and underscores, starting with a letter (for example malkia_back_in_stock_sw).")
  if (!["MARKETING", "UTILITY"].includes(d.category)) out.push("Choose whether this is a marketing or a service message.")
  const body = String(d.body || "")
  if (body.trim().length < 10) out.push("The message is too short.")
  if (body.length > 1024) out.push(`The message is ${body.length} characters; the limit is 1,024.`)
  if (/\n\n\n/.test(body)) out.push("Use at most one blank line between paragraphs.")
  const uniq = blankNumbers(body)
  uniq.forEach((n, i) => { if (n !== i + 1) out.push(`Blanks must be numbered {{1}}, {{2}}, {{3}} in order with none skipped (found {{${n}}} where {{${i + 1}}} was expected).`) })
  if (/\{\{[^}]*\}\}\s*\{\{/.test(body)) out.push("Two blanks cannot sit next to each other; put words between them.")
  if (/^\s*\{\{/.test(body)) out.push("The message cannot start with a blank.")
  if (/\}\}\s*$/.test(body)) out.push("The message cannot end with a blank.")
  if (/\{\{(?!\s*\d+\s*\}\})/.test(body)) out.push("A blank must be written as a number in double braces, like {{1}}.")
  const samples = d.samples || {}
  uniq.forEach((n) => { if (!String(samples[String(n)] || "").trim()) out.push(`Give an example for blank {{${n}}}; Meta requires one.`) })
  const buttons = Array.isArray(d.buttons) ? d.buttons : []
  if (buttons.length > 3) out.push("At most 3 buttons.")
  const seen = new Set()
  buttons.forEach((b, i) => {
    const t = String((b && b.title) || "").trim()
    if (!t) out.push(`Button ${i + 1} has no label.`)
    if (t.length > 20) out.push(`Button "${t}" is ${t.length} characters; the limit is 20.`)
    if (seen.has(t.toLowerCase())) out.push(`Two buttons have the same label "${t}".`)
    seen.add(t.toLowerCase())
  })
  if (d.slot && !CREATABLE_SLOTS.includes(d.slot)) out.push("This kind of template cannot be created from here.")
  if (d.slot === "back_in_stock" && uniq.length !== 4) out.push("The waiting-list message needs exactly four blanks, in this order: {{1}} customer name, {{2}} product, {{3}} discount percent, {{4}} price after discount.")
  if (d.slot && PDF_SLOTS[d.slot] !== undefined) {
    if (uniq.length !== PDF_SLOTS[d.slot]) out.push(`This invoice message needs exactly ${PDF_SLOTS[d.slot]} blanks, in this order: ${PDF_BLANKS[d.slot]}. The invoice PDF is attached automatically.`)
    if (buttons.length) out.push("A message that carries the invoice PDF cannot have buttons.")
  }
  if (wantsOwnPdf(d) && buttons.length) out.push("A message that carries a PDF cannot have buttons. Remove the buttons or untick the PDF.")
  return [...new Set(out)]
}

async function refresh(row) {
  if (!row.sid) return row
  const s = await twilio("GET", `https://content.twilio.com/v1/Content/${row.sid}/ApprovalRequests`)
  if (!s.ok) return row
  const w = (s.body && s.body.whatsapp) || {}
  const patch = { status: mapStatus(w.status), rejection_reason: w.rejection_reason || null, meta_category: w.category || row.meta_category || null, checked_at: new Date().toISOString() }
  await sb.from("wa_templates").update(patch).eq("id", row.id)
  return { ...row, ...patch }
}

// Templates created before this screen existed live only in system_settings; bring them into the register once.
async function importExisting() {
  const { data: settings } = await sb.from("system_settings").select("key, value").in("key", Object.keys(KNOWN))
  for (const s of settings || []) {
    let v = null
    try { v = typeof s.value === "string" ? JSON.parse(s.value) : s.value } catch (_e) { v = null }
    if (!v || !v.sid) continue
    const { data: have } = await sb.from("wa_templates").select("id").eq("sid", v.sid).maybeSingle()
    if (have) continue
    const c = await twilio("GET", `https://content.twilio.com/v1/Content/${v.sid}`)
    const types = (c.body && c.body.types) || {}
    const t = types["twilio/quick-reply"] || types["twilio/media"] || types["twilio/text"] || {}
    await sb.from("wa_templates").insert({
      slot: KNOWN[s.key], name: v.name || (c.body && c.body.friendly_name) || s.key, sid: v.sid,
      language: (c.body && c.body.language) || "sw", body: t.body || "", samples: (c.body && c.body.variables) || {},
      buttons: Array.isArray(t.actions) ? t.actions.map((a) => ({ title: a.title, id: a.id })) : [],
      has_media: !!types["twilio/media"], status: "unknown", is_active: true, submitted_by_name: "set up before this screen",
    })
  }
}

// Meta needs a sample of the attached file. Use the newest invoice PDF that exists, signed for 30 days.
async function sampleInvoicePdfUrl() {
  const { data: refs } = await sb.from("vouchers").select("ref").eq("type", "sales_invoice").eq("status", "posted").order("created_at", { ascending: false }).limit(15)
  for (const r of refs || []) {
    const { data } = await sb.storage.from("receipts").createSignedUrl(`${r.ref}/Ankara-${r.ref}.pdf`, 60 * 60 * 24 * 30)
    if (data && data.signedUrl) return data.signedUrl
  }
  return null
}

// A plain one-page PDF, built by hand (ASCII only, so string length equals byte length).
function plainSamplePdf() {
  const stream = "BT /F1 22 Tf 72 760 Td (Malkia Circle) Tj ET\nBT /F1 13 Tf 72 730 Td (Sample document for template review.) Tj ET\nBT /F1 13 Tf 72 708 Td (The real guide or lesson is attached when the message is sent.) Tj ET"
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let pdf = "%PDF-1.4\n"
  const offs = []
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  offs.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n" })
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

// The sample for a template with no fixed use: stored once, signed for 30 days.
async function sampleDocumentPdfUrl() {
  const path = "_samples/malkia-document-sample.pdf"
  const up = await sb.storage.from("receipts").upload(path, new Blob([plainSamplePdf()], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" })
  if (up.error) return null
  const { data } = await sb.storage.from("receipts").createSignedUrl(path, 60 * 60 * 24 * 30)
  return (data && data.signedUrl) || null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  const who = await caller(req.headers.get("authorization"))
  if (!who || !who.inbox) return json({ error: "You need the WhatsApp Inbox permission to see templates." }, 403)
  let b
  try { b = await req.json() } catch (_e) { return json({ error: "bad json" }, 400) }
  const action = (b && b.action) || "list"

  try {
    if (action === "list") {
      await importExisting()
      const { data: rows, error } = await sb.from("wa_templates").select("*").order("created_at", { ascending: false })
      if (error) return json({ error: error.message }, 500)
      const out = []
      for (const r of rows || []) out.push(await refresh(r))
      return json({ ok: true, can_create: who.admin, templates: out })
    }

    if (action === "check") return json({ ok: true, problems: problems(b) })

    if (action === "create") {
      if (!who.admin) return json({ error: "Only an administrator can submit a template to Meta." }, 403)
      const draft = {
        slot: b.slot || null, name: String(b.name || "").trim(), category: String(b.category || "").toUpperCase(),
        body: String(b.body || "").replace(/\r\n/g, "\n").trim(), samples: b.samples || {},
        buttons: (Array.isArray(b.buttons) ? b.buttons : []).map((x, i) => ({ title: String((x && x.title) || "").trim(), id: String((x && x.id) || `b${i + 1}`).replace(/[^a-z0-9_]/gi, "").slice(0, 20) || `b${i + 1}` })),
        attach_pdf: !b.slot && b.attach_pdf === true,
      }
      const bad = problems(draft)
      if (bad.length) return json({ error: "The draft does not meet Meta's rules.", problems: bad }, 400)
      const { data: clash } = await sb.from("wa_templates").select("id").eq("name", draft.name).maybeSingle()
      if (clash) return json({ error: `A template named ${draft.name} already exists. Wording cannot be changed after submission, so give the new version a new name (for example add _v2).` }, 409)

      const isPdf = !!draft.slot && PDF_SLOTS[draft.slot] !== undefined
      const ownPdf = wantsOwnPdf(draft)
      let variables = draft.samples
      let types
      if (isPdf) {
        const fileBlank = String(PDF_SLOTS[draft.slot] + 1)
        const sampleUrl = await sampleInvoicePdfUrl()
        if (!sampleUrl) return json({ error: "No stored invoice PDF was found to give Meta as a sample. Send one invoice by WhatsApp first, then try again." }, 409)
        variables = { ...draft.samples, [fileBlank]: sampleUrl }
        types = { "twilio/media": { body: draft.body, media: [`{{${fileBlank}}}`] } }
      } else if (ownPdf) {
        const fileBlank = String(blankNumbers(draft.body).length + 1)
        const sampleUrl = await sampleDocumentPdfUrl()
        if (!sampleUrl) return json({ error: "The sample PDF for Meta could not be prepared. Nothing was sent. Try again." }, 500)
        variables = { ...draft.samples, [fileBlank]: sampleUrl }
        types = { "twilio/media": { body: draft.body, media: [`{{${fileBlank}}}`] } }
      } else {
        types = draft.buttons.length
          ? { "twilio/quick-reply": { body: draft.body, actions: draft.buttons.map((x) => ({ title: x.title, id: x.id })) } }
          : { "twilio/text": { body: draft.body } }
      }
      const c = await twilio("POST", "https://content.twilio.com/v1/Content", { friendly_name: draft.name, language: "sw", variables, types })
      if (!c.ok || !c.body || !c.body.sid) return json({ error: `The provider refused the template: ${(c.body && c.body.message) || c.status}` }, 502)
      const a = await twilio("POST", `https://content.twilio.com/v1/Content/${c.body.sid}/ApprovalRequests/whatsapp`, { name: draft.name, category: draft.category })

      if (draft.slot) await sb.from("wa_templates").update({ is_active: false }).eq("slot", draft.slot)
      const row = {
        slot: draft.slot, name: draft.name, sid: c.body.sid, category: draft.category, language: "sw", body: draft.body,
        samples: draft.samples, buttons: draft.buttons, has_media: isPdf || ownPdf,
        status: a.ok ? mapStatus(a.body && a.body.status) : "unknown",
        rejection_reason: a.ok ? null : `Submission to Meta failed: ${(a.body && a.body.message) || a.status}`,
        is_active: true, submitted_by: who.id, submitted_by_name: who.name, checked_at: new Date().toISOString(),
      }
      const { data: saved, error: insErr } = await sb.from("wa_templates").insert(row).select("*").maybeSingle()
      if (insErr) return json({ error: `Created at the provider (${c.body.sid}) but not recorded here: ${insErr.message}` }, 500)
      if (draft.slot) {
        await sb.from("system_settings").upsert({ key: `wa_template_${draft.slot}`, value: JSON.stringify({ sid: c.body.sid, name: draft.name }) }, { onConflict: "key" })
      }
      return json({ ok: true, submitted: a.ok, template: saved })
    }

    return json({ error: `unknown action ${action}` }, 400)
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500)
  }
})
