// @ts-nocheck
// circle-weekly v2: the week-by-week lessons and guides for Malkia Circle.
// New in v2: automatic sending.
// POST {action:"run"}   no login needed, because it can only do one thing: send the lessons
//        the database has already queued (service_sends, filled by service_plan_sends on
//        Monday, Wednesday and Saturday at 10:00, and when a mother joins). It cannot choose
//        who gets what. Each row is taken through service_send_claim, so two runs at the
//        same moment never send the same lesson twice.
// POST {action:"test", lesson_id, phone, name}  staff with the Services or Circle Messages permission.
//        Sends ONE lesson or guide to the number given, exactly as a mother would get it.
//        Works on a draft too, so wording and file can be checked before review.
// POST {action:"set_open", on}                  administrators. Opens or closes joining.
//        Opening is refused until at least one lesson is Ready and Meta has approved a
//        weekly template, so no mother can join a service that cannot send.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

const TPL = { lesson_image: "malkia_circle_weekly_img_sw", lesson_pdf: "malkia_circle_weekly_sw", guide_pdf: "malkia_circle_guide_sw" }

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
  const admin = perms.length >= 40
  return { id: row.id, name: row.full_name, admin, page: admin || perms.includes("crm.konnect") || perms.includes("crm.services") }
}

const clean = (s, max) => {
  const t = String(s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t
}
const firstName = (s, fallback) => clean(String(s || "").trim().split(/\s+/)[0] || "", 30) || fallback

async function approvedSid(name) {
  const { data: t } = await sb.from("wa_templates").select("id, sid, status").eq("name", name).eq("is_active", true).maybeSingle()
  if (!t || !t.sid) return null
  if (t.status === "approved") return t.sid
  try {
    const auth = "Basic " + btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID") || ""}:${Deno.env.get("TWILIO_AUTH_TOKEN") || ""}`)
    const r = await fetch(`https://content.twilio.com/v1/Content/${t.sid}/ApprovalRequests`, { headers: { authorization: auth } })
    const j = await r.json().catch(() => ({}))
    if (String((j && j.whatsapp && j.whatsapp.status) || "").toLowerCase() === "approved") {
      await sb.from("wa_templates").update({ status: "approved", checked_at: new Date().toISOString() }).eq("id", t.id)
      return t.sid
    }
  } catch (_e) { /* not approved yet */ }
  return null
}

// One lesson or guide to one number. Returns { ok } or { error } in plain words.
async function sendLesson(lesson, phone, name, purpose) {
  const isGuide = lesson.kind === "guide"
  if (isGuide && lesson.media_kind !== "pdf") return { error: "A guide must be a PDF. The approved guide message cannot carry an image." }
  const tplName = isGuide ? TPL.guide_pdf : lesson.media_kind === "image" ? TPL.lesson_image : TPL.lesson_pdf
  const sid = await approvedSid(tplName)
  if (!sid) return { error: `Meta has not approved the message "${tplName}" yet. Nothing was sent.` }
  const { data: signed, error: sErr } = await sb.storage.from("circle-lessons").createSignedUrl(lesson.file_path, 60 * 60 * 24 * 2)
  if (sErr || !signed || !signed.signedUrl) return { error: `The file could not be opened: ${(sErr && sErr.message) || "no link"}` }
  const who = firstName(name, "Mama")
  const topic = clean(lesson.topic, 120)
  let vars, text
  if (isGuide) {
    vars = { "1": who, "2": topic, "3": signed.signedUrl }
    text = `Habari ${who}, mwongozo wako wa ${topic} umeambatishwa. Uhifadhi kwenye simu yako au uuchapishe. Resources nyingine za ujauzito zipo ndani ya Malkia Circle.`
  } else {
    vars = { "1": who, "2": String(lesson.week), "3": topic, "4": signed.signedUrl }
    text = lesson.media_kind === "image"
      ? `Habari ${who}, uko wiki ya ${lesson.week} ya ujauzito. Leo tunaangalia: ${topic}. Ukiwa na swali lolote, liulize ndani ya Malkia Circle. Akina mama wenzako na wakunga wetu watakujibu.`
      : `Habari ${who}, uko wiki ya ${lesson.week} ya ujauzito. Leo tunaangalia: ${topic}. Maelezo yameambatishwa hapa. Ukiwa na swali lolote, liulize ndani ya Malkia Circle. Akina mama wenzako na wakunga wetu watakujibu.`
  }
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-key": Deno.env.get("WA_INTERNAL_KEY") || "" },
    body: JSON.stringify({ phone, purpose, name, body: text, source: "circle", content_sid: sid, variables: vars }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return { error: String((j && j.error) || `wa-send ${r.status}`).slice(0, 300) }
  return { ok: true, twilio_sid: j.twilio_sid || null, text }
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

// Send what is queued. Stops after about 40 seconds; the database sweep (every 10
// minutes) calls again if anything is still waiting.
async function runQueue() {
  const started = Date.now()
  let sent = 0, failed = 0, dropped = 0
  while (Date.now() - started < 40000) {
    const { data: rows, error } = await sb.rpc("service_send_claim", { p_limit: 10 })
    if (error) return { error: error.message, sent, failed, dropped }
    if (!rows || !rows.length) break
    for (const r of rows) {
      try {
        if (!r.still_on) {
          // she stopped or was paused after this was queued: it was never sent, so it leaves no trace
          await sb.from("service_sends").delete().eq("id", r.id)
          dropped++
        } else if (!r.lesson) {
          await sb.from("service_sends").update({ status: "failed", error: "The lesson is no longer marked Ready." }).eq("id", r.id)
          failed++
        } else {
          const out = await sendLesson(r.lesson, r.phone, r.name || "", "system")
          if (out.error) {
            await sb.from("service_sends").update({ status: "failed", error: String(out.error).slice(0, 300) }).eq("id", r.id)
            failed++
          } else {
            await sb.from("service_sends").update({ status: "sent", twilio_sid: out.twilio_sid, sent_at: new Date().toISOString(), error: null }).eq("id", r.id)
            sent++
          }
        }
      } catch (e) {
        await sb.from("service_sends").update({ status: "failed", error: String((e && e.message) || e).slice(0, 300) }).eq("id", r.id)
        failed++
      }
      await sleep(250)
    }
  }
  return { ok: true, sent, failed, dropped }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  let b = {}
  try { b = await req.json() } catch (_e) { return json({ error: "bad json" }, 400) }
  const action = String(b.action || "")

  if (action === "run") {
    try { return json(await runQueue()) } catch (e) { return json({ error: String((e && e.message) || e) }, 500) }
  }

  const who = await caller(req.headers.get("authorization"))
  if (!who || !who.page) return json({ error: "You need the Services or Circle Messages permission." }, 403)

  try {
    if (action === "test") {
      const phone = String(b.phone || "").trim()
      if (!phone) return json({ error: "Give the number to send the test to." }, 400)
      const { data: lesson } = await sb.from("circle_lessons").select("*").eq("id", String(b.lesson_id || "")).maybeSingle()
      if (!lesson) return json({ error: "That lesson no longer exists." }, 404)
      const out = await sendLesson(lesson, phone, String(b.name || who.name || ""), "system")
      if (out.error) return json({ error: out.error }, 409)
      return json({ ok: true, sent_text: out.text })
    }

    if (action === "set_open") {
      if (!who.admin) return json({ error: "Only an administrator can open or close joining." }, 403)
      const on = b.on === true
      if (on) {
        const { count } = await sb.from("circle_lessons").select("id", { count: "exact", head: true }).eq("kind", "lesson").eq("status", "ready")
        if (!count) return json({ error: "No lesson is marked Ready yet. Joining stays closed, so no mother joins a service that cannot send." }, 409)
        const okTpl = (await approvedSid(TPL.lesson_image)) || (await approvedSid(TPL.lesson_pdf))
        if (!okTpl) return json({ error: "Meta has not approved a weekly message yet. Joining stays closed." }, 409)
      }
      const { error } = await sb.from("circle_msg_settings").upsert({ key: "weekly_open", value: on ? "true" : "false", updated_at: new Date().toISOString() }, { onConflict: "key" })
      if (error) return json({ error: error.message }, 500)
      const { data: svc } = await sb.from("services").update({ is_open: on, updated_at: new Date().toISOString() }).eq("slug", "weekly").select("id").maybeSingle()
      await sb.from("service_events").insert({ service_id: (svc && svc.id) || null, action: on ? "joining_opened" : "joining_closed", by_user: who.id, by_name: who.name })
      return json({ ok: true, open: on })
    }

    return json({ error: `unknown action ${action}` }, 400)
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500)
  }
})
