// @ts-nocheck
// circle-alerts v2: the two Malkia Circle WhatsApp notices.
//   question_alert  a mother asked a question -> each approved midwife is told
//   answer_ready    a midwife answered        -> the mother who asked is told (only if she ticked the box)
// The database queues a row in circle_wa_outbox and pokes this function.
//
// POST {action:"run"}       no login needed. Sends whatever is queued. It takes no input that
//                           changes who gets what, so calling it from outside can only speed
//                           up messages that were already going to be sent.
// POST {action:"status"}    staff. Switches, counts and the latest rows.
// POST {action:"set", key, on}            administrators. Turn an alert on or off.
// POST {action:"test", kind, phone, name} administrators. Queue one test message and send it.
// Messages go out through wa-send, so the no-contact gate and the inbox log apply as usual.
// A row that cannot be sent within 24 hours expires: a late alert is worse than none.
// v2: a Whisper's answer notice links to Circle, not to the question, and the status list
//     never says which mother a notice went to, so staff cannot work out who whispered.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

const TEMPLATE = { question_alert: "malkia_circle_question_alert_sw", answer_ready: "malkia_circle_answer_ready_sw" }
const SETTING = { question_alert: "alert_question_on", answer_ready: "alert_answer_on" }
const SITE = "https://www.malkia.co.tz"

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

// Meta does not allow line breaks, tabs or long runs of spaces inside a blank.
const clean = (s, max) => {
  const t = String(s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t
}
const firstName = (s, fallback) => clean(String(s || "").trim().split(/\s+/)[0] || "", 30) || fallback

// The approved template's id, checking with the provider when our record still says "waiting".
async function approvedSid(name) {
  const { data: t } = await sb.from("wa_templates").select("id, sid, status").eq("name", name).eq("is_active", true).maybeSingle()
  if (!t || !t.sid) return null
  if (t.status === "approved") return t.sid
  try {
    const auth = "Basic " + btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID") || ""}:${Deno.env.get("TWILIO_AUTH_TOKEN") || ""}`)
    const r = await fetch(`https://content.twilio.com/v1/Content/${t.sid}/ApprovalRequests`, { headers: { authorization: auth } })
    const j = await r.json().catch(() => ({}))
    const st = String((j && j.whatsapp && j.whatsapp.status) || "").toLowerCase()
    if (st === "approved") {
      await sb.from("wa_templates").update({ status: "approved", checked_at: new Date().toISOString() }).eq("id", t.id)
      return t.sid
    }
  } catch (_e) { /* treat as not approved yet */ }
  return null
}

async function finish(id, patch) {
  await sb.from("circle_wa_outbox").update({ ...patch, done_at: new Date().toISOString() }).eq("id", id)
}

async function sendOne(row, sidCache) {
  // claim it, so two runs at the same moment cannot both send
  const { data: mine } = await sb.from("circle_wa_outbox").update({ status: "sending" }).eq("id", row.id).eq("status", "pending").select("id")
  if (!mine || !mine.length) return "skipped"

  if (!(row.kind in sidCache)) sidCache[row.kind] = await approvedSid(TEMPLATE[row.kind])
  const sid = sidCache[row.kind]
  if (!sid) { await sb.from("circle_wa_outbox").update({ status: "pending", error: "waiting for Meta to approve the template" }).eq("id", row.id); return "waiting" }

  let phone = row.to_phone, name = row.to_name
  if (row.to_user) {
    const { data: p } = await sb.from("circle_profiles").select("name, whatsapp, is_expert, expert_status, expert_alerts").eq("user_id", row.to_user).maybeSingle()
    if (!p || !p.whatsapp) { await finish(row.id, { status: "failed", error: "no WhatsApp number on the profile" }); return "failed" }
    if (row.kind === "question_alert" && !row.is_test && !(p.is_expert && p.expert_status === "approved" && p.expert_alerts)) {
      await finish(row.id, { status: "failed", error: "no longer an approved midwife with alerts on" }); return "failed"
    }
    phone = p.whatsapp; name = p.name
  }
  if (!phone) { await finish(row.id, { status: "failed", error: "no phone number" }); return "failed" }

  let q = null
  if (row.question_id) {
    const r = await sb.from("circle_questions").select("id, title, body, deleted_at, is_whisper").eq("id", row.question_id).maybeSingle()
    q = r.data
    if (!q || q.deleted_at) { await finish(row.id, { status: "failed", error: "the question was removed" }); return "failed" }
  }
  const link = q && !(row.kind === "answer_ready" && q.is_whisper) ? `${SITE}/circle/swali/${q.id}` : `${SITE}/circle`
  let vars, text
  if (row.kind === "question_alert") {
    const who = firstName(name, "Mkunga")
    const excerpt = clean((q && (q.title || q.body)) || "Hili ni jaribio la taarifa ya swali jipya", 120)
    vars = { "1": who, "2": excerpt, "3": link }
    text = `Habari ${who}, kuna swali jipya kwenye Malkia Circle linalosubiri jibu lako: "${excerpt}". Fungua hapa: ${link} na tafadhali lijibu haraka iwezekanavyo.`
  } else {
    const who = firstName(name, "Mama")
    vars = { "1": who, "2": link }
    text = `Habari ${who}, swali lako kwenye Malkia Circle limejibiwa na mkunga wetu. Soma jibu hapa: ${link} Asante kwa kuwa sehemu ya Malkia Circle.`
  }

  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-key": Deno.env.get("WA_INTERNAL_KEY") || "" },
    body: JSON.stringify({ phone, purpose: "system", name, body: text, source: "circle", content_sid: sid, variables: vars }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { await finish(row.id, { status: "failed", error: String((j && j.error) || `wa-send ${r.status}`).slice(0, 300) }); return "failed" }
  await finish(row.id, { status: "sent", twilio_sid: j.twilio_sid || null, error: null })
  return "sent"
}

async function run() {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  await sb.from("circle_wa_outbox").update({ status: "expired", done_at: new Date().toISOString() }).eq("status", "pending").lt("created_at", dayAgo)
  // a run that died mid-send leaves a row "sending"; after 10 minutes call it failed, never resend blind
  const tenMin = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await sb.from("circle_wa_outbox").update({ status: "failed", error: "interrupted while sending", done_at: new Date().toISOString() }).eq("status", "sending").lt("created_at", tenMin)
  const { data: rows } = await sb.from("circle_wa_outbox").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(25)
  const tally = { sent: 0, failed: 0, waiting: 0, skipped: 0 }
  const sidCache = {}
  for (const row of rows || []) {
    try { tally[await sendOne(row, sidCache)]++ }
    catch (e) { await finish(row.id, { status: "failed", error: String((e && e.message) || e).slice(0, 300) }); tally.failed++ }
  }
  return tally
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  let b = {}
  try { b = await req.json() } catch (_e) { b = {} }
  const action = (b && b.action) || "run"

  try {
    if (action === "run") return json({ ok: true, ...(await run()) })

    const who = await caller(req.headers.get("authorization"))
    if (!who) return json({ error: "Sign in to MalkiaOS to see this." }, 403)

    if (action === "status") {
      const { data: settings } = await sb.from("circle_msg_settings").select("key, value, updated_at")
      const { data: recent } = await sb.from("circle_wa_outbox").select("id, kind, is_test, status, error, created_at, done_at, to_user, to_name").order("created_at", { ascending: false }).limit(40)
      const { data: tpl } = await sb.from("wa_templates").select("name, status").in("name", Object.values(TEMPLATE))
      const { data: midwives } = await sb.from("circle_profiles").select("user_id, name, expert_title, expert_alerts").eq("is_expert", true).eq("expert_status", "approved")
      const midwifeName = Object.fromEntries((midwives || []).map((m) => [m.user_id, m.name]))
      const shown = (recent || []).map((r) => ({
        id: r.id, kind: r.kind, is_test: r.is_test, status: r.status, error: r.error, created_at: r.created_at, done_at: r.done_at,
        to: r.is_test ? (r.to_name || "test") : r.kind === "question_alert" ? (midwifeName[r.to_user] || "midwife") : "the mother who asked",
      }))
      return json({ ok: true, can_change: who.admin, settings: settings || [], templates: tpl || [], midwives: midwives || [], recent: shown })
    }

    if (!who.admin) return json({ error: "Only an administrator can change this." }, 403)

    if (action === "set") {
      const key = String(b.key || "")
      if (!Object.values(SETTING).includes(key)) return json({ error: "unknown switch" }, 400)
      const { error } = await sb.from("circle_msg_settings").upsert({ key, value: b.on === true ? "true" : "false", updated_at: new Date().toISOString() }, { onConflict: "key" })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, key, on: b.on === true })
    }

    if (action === "midwife_alerts") {
      const { error } = await sb.from("circle_profiles").update({ expert_alerts: b.on === true }).eq("user_id", String(b.user_id || "")).eq("is_expert", true)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === "test") {
      const kind = String(b.kind || "")
      if (!(kind in TEMPLATE)) return json({ error: "unknown kind" }, 400)
      const phone = String(b.phone || "").trim()
      if (!phone) return json({ error: "Give the number to send the test to." }, 400)
      const { error } = await sb.from("circle_wa_outbox").insert({ kind, is_test: true, to_phone: phone, to_name: String(b.name || who.name || "").trim() || null })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, ...(await run()) })
    }

    return json({ error: `unknown action ${action}` }, 400)
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500)
  }
})
