// @ts-nocheck
// circle-otp v1: one-time WhatsApp codes for Malkia Circle.
//
// POST {action:"send", phone, purpose}
//      purpose "join"    a new mother proving her number before an account exists
//              "reset"   a member who forgot her password
//              "verify"  a member who joined before codes existed (needs her login;
//                        the code always goes to the number on her own profile)
//      Makes a code (database rules: 10 minutes, one per minute, 3 per number per hour),
//      sends it with the approved login-code template, and records whether WhatsApp took it.
// POST {action:"confirm", phone, purpose, code, password}
//      Checks the code (5 tries). Then:
//        join    creates her login with the password she chose. If a login for that number
//                was left behind without a profile, it is given the new password instead.
//                The website then signs her in and creates the profile, which uses up the proof.
//        reset   sets the new password on her login.
//        verify  nothing more: the database has marked her number as proved.
//
// The code never reaches the WhatsApp Inbox: the log line says a code was sent, not what it was.
// Every refusal comes back as a sentence a mother can read, with the real reason.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })
const PURPOSES = ["join", "reset", "verify"]

// The approved login-code template, checking with the provider while our record says "waiting".
async function loginCodeSid() {
  const { data: t } = await sb.from("wa_templates").select("id, sid, status").eq("slot", "login_code").eq("is_active", true).maybeSingle()
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

// The signed-in Circle member behind this request, if any.
async function member(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null
  const { data } = await sb.auth.getUser(authHeader.slice(7))
  const u = data && data.user
  if (!u) return null
  const { data: p } = await sb.from("circle_profiles").select("user_id, whatsapp").eq("user_id", u.id).maybeSingle()
  return p || null
}

const ISSUE_SAYS = {
  bad_phone: "Namba ya simu si sahihi. Tumia mfano 07XX XXX XXX.",
  bad_purpose: "Ombi halieleweki. Jaribu tena.",
  has_account: "Namba hii tayari ina akaunti. Ingia badala yake.",
  no_account: "Hakuna akaunti yenye namba hii. Jiunge kwanza.",
  too_many: "Umeomba namba ya uthibitisho mara nyingi. Jaribu tena baada ya saa moja.",
}
const CHECK_SAYS = {
  expired: "Namba ya uthibitisho imeisha muda au haipo. Omba nyingine.",
  locked: "Umekosea mara nyingi. Omba namba mpya ya uthibitisho.",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  let b
  try { b = await req.json() } catch (_e) { return json({ error: "bad json" }, 400) }
  const action = String((b && b.action) || "")
  const purpose = String((b && b.purpose) || "")
  if (!PURPOSES.includes(purpose)) return json({ error: ISSUE_SAYS.bad_purpose, reason: "bad_purpose" }, 400)

  try {
    let phone = String((b && b.phone) || "")
    if (purpose === "verify") {
      const me = await member(req.headers.get("authorization"))
      if (!me) return json({ error: "Ingia kwenye akaunti yako kwanza.", reason: "auth" }, 401)
      phone = me.whatsapp
    }

    if (action === "send") {
      const sid = await loginCodeSid()
      if (!sid) return json({ error: "Huduma ya namba ya uthibitisho bado haijawa tayari. Jaribu tena baadaye.", reason: "not_ready" }, 503)
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
      const { data: iss, error: issErr } = await sb.rpc("circle_otp_issue", { p_phone: phone, p_purpose: purpose, p_ip: ip })
      if (issErr) return json({ error: `Imeshindikana kuandaa namba ya uthibitisho: ${issErr.message}` }, 500)
      if (!iss || !iss.ok) {
        const reason = (iss && iss.reason) || "unknown"
        const say = reason === "wait" ? `Subiri sekunde ${iss.seconds} kisha uombe namba nyingine.` : (ISSUE_SAYS[reason] || `Imeshindikana (${reason}).`)
        return json({ error: say, reason, seconds: iss && iss.seconds }, reason === "wait" || reason === "too_many" ? 429 : 400)
      }
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-send`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-key": Deno.env.get("WA_INTERNAL_KEY") || "" },
        body: JSON.stringify({ phone: iss.phone, purpose: "system", body: "Malkia Circle login code sent (the code itself is not shown here).", source: "circle", content_sid: sid, variables: { "1": iss.code } }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const why = String((j && j.error) || `wa-send ${r.status}`)
        await sb.rpc("circle_otp_sent", { p_id: iss.id, p_ok: false, p_error: why })
        return json({ error: `Imeshindikana kutuma namba kwenye WhatsApp ya namba hii: ${why}. Hakikisha namba ina WhatsApp, kisha jaribu tena.`, reason: "send_failed" }, 502)
      }
      await sb.rpc("circle_otp_sent", { p_id: iss.id, p_ok: true, p_error: null })
      return json({ ok: true, minutes: iss.minutes, to: "0" + String(iss.phone).slice(3, 6) + " XXX " + String(iss.phone).slice(-3) })
    }

    if (action === "confirm") {
      const password = String((b && b.password) || "")
      // Checked first, so a short password does not waste one of her five tries.
      if (purpose !== "verify" && password.length < 6) return json({ error: "Nenosiri liwe na herufi 6 au zaidi.", reason: "bad_password" }, 400)
      const { data: chk, error: chkErr } = await sb.rpc("circle_otp_check", { p_phone: phone, p_purpose: purpose, p_code: String((b && b.code) || "") })
      if (chkErr) return json({ error: `Imeshindikana kuthibitisha: ${chkErr.message}` }, 500)
      if (!chk || !chk.ok) {
        const reason = (chk && chk.reason) || "unknown"
        const say = reason === "wrong" ? `Namba si sahihi. Umebakiza majaribio ${chk.left}.` : (CHECK_SAYS[reason] || `Imeshindikana (${reason}).`)
        return json({ error: say, reason, left: chk && chk.left }, 400)
      }
      if (purpose === "verify") return json({ ok: true })

      const { data: uid, error: uidErr } = await sb.rpc("circle_auth_uid_for_phone", { p_phone: chk.phone })
      if (uidErr) return json({ error: `Namba imethibitishwa lakini akaunti haikupatikana: ${uidErr.message}` }, 500)
      if (purpose === "reset") {
        if (!uid) return json({ error: "Akaunti hii inaingia kwa namba nyingine, ile uliyojiunga nayo. Tumia namba hiyo, au wasiliana na Malkia.", reason: "other_login" }, 400)
        const up = await sb.auth.admin.updateUserById(uid, { password })
        if (up.error) return json({ error: `Namba imethibitishwa lakini nenosiri halikubadilishwa: ${up.error.message}` }, 500)
        return json({ ok: true })
      }
      // join
      if (uid) {
        // A login that already has a profile belongs to a member (she may have changed her
        // number since). Proving the old number must never hand her account to someone else.
        const { data: owned } = await sb.from("circle_profiles").select("user_id").eq("user_id", uid).maybeSingle()
        if (owned) return json({ error: "Namba hii imeunganishwa na akaunti nyingine ya Circle. Ingia kwa akaunti hiyo, au wasiliana na Malkia.", reason: "has_account" }, 400)
        const up = await sb.auth.admin.updateUserById(uid, { password })
        if (up.error) return json({ error: `Namba imethibitishwa lakini akaunti haikuandaliwa: ${up.error.message}` }, 500)
      } else {
        const cr = await sb.auth.admin.createUser({ email: `${chk.phone}@malkia.co.tz`, password, email_confirm: true })
        if (cr.error) return json({ error: `Namba imethibitishwa lakini akaunti haikuanzishwa: ${cr.error.message}` }, 500)
      }
      return json({ ok: true })
    }

    return json({ error: `unknown action ${action}` }, 400)
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500)
  }
})
