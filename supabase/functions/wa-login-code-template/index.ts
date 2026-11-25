// @ts-nocheck
// wa-login-code-template v1: creates the one-time login-code WhatsApp template and
// sends it to Meta for approval. Kept apart from wa-templates so that function,
// which the invoice, receipt and waiting-list messages depend on, is not touched.
//
// A login-code ("authentication") template is unlike the others: Meta writes the
// wording itself in the template's language. We only choose the language (Swahili),
// the "do not share this code" line, the expiry shown, and the copy-code button.
//
// POST {}   Administrators only. Creates the template, asks Meta to approve it,
//           records it in wa_templates under the slot "login_code" so it shows on
//           the WhatsApp Templates page, and saves its id where the Circle code
//           sender reads it (system_settings.wa_template_login_code).
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

const NAME = "malkia_login_code_sw"
const EXPIRY_MINUTES = 10

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
  return { id: row.id, name: row.full_name, admin: perms.length >= 40 }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  const who = await caller(req.headers.get("authorization"))
  if (!who) return json({ error: "Sign in to MalkiaOS again (your session has ended)." }, 403)
  if (!who.admin) return json({ error: "Only an administrator can submit a template to Meta." }, 403)

  try {
    const { data: have } = await sb.from("wa_templates").select("id, name, status").eq("slot", "login_code").eq("is_active", true).maybeSingle()
    if (have && have.status !== "rejected") return json({ error: `The login-code message already exists (${have.name}, ${have.status}). It does not need to be sent again.` }, 409)

    // A rejected one keeps its name at Meta, so a second try needs a new name.
    const { count } = await sb.from("wa_templates").select("id", { count: "exact", head: true }).eq("slot", "login_code")
    const name = count ? `${NAME}_v${count + 1}` : NAME

    const c = await twilio("POST", "https://content.twilio.com/v1/Content", {
      friendly_name: name, language: "sw",
      types: { "whatsapp/authentication": { add_security_recommendation: true, code_expiration_minutes: EXPIRY_MINUTES, actions: [{ type: "COPY_CODE", copy_code_text: "Nakili namba" }] } },
    })
    if (!c.ok || !c.body || !c.body.sid) return json({ error: `The provider refused the template: ${(c.body && c.body.message) || c.status}` }, 502)
    const a = await twilio("POST", `https://content.twilio.com/v1/Content/${c.body.sid}/ApprovalRequests/whatsapp`, { name, category: "AUTHENTICATION" })

    if (have) await sb.from("wa_templates").update({ is_active: false }).eq("slot", "login_code")
    const row = {
      slot: "login_code", name, sid: c.body.sid, category: "AUTHENTICATION", language: "sw",
      body: `Meta writes this message itself, in Swahili: the code, a line telling the person not to share it, and that it expires in ${EXPIRY_MINUTES} minutes.`,
      samples: {}, buttons: [{ title: "Nakili namba", id: "copy" }], has_media: false,
      status: a.ok ? mapStatus(a.body && a.body.status) : "unknown",
      rejection_reason: a.ok ? null : `Submission to Meta failed: ${(a.body && a.body.message) || a.status}`,
      is_active: true, submitted_by: who.id, submitted_by_name: who.name, checked_at: new Date().toISOString(),
    }
    const { data: saved, error: insErr } = await sb.from("wa_templates").insert(row).select("*").maybeSingle()
    if (insErr) return json({ error: `Created at the provider (${c.body.sid}) but not recorded here: ${insErr.message}` }, 500)
    await sb.from("system_settings").upsert({ key: "wa_template_login_code", value: JSON.stringify({ sid: c.body.sid, name, expiry_minutes: EXPIRY_MINUTES }) }, { onConflict: "key" })
    return json({ ok: true, submitted: a.ok, template: saved })
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500)
  }
})
