// ════════════════════════════════════════════════════════════════════════════
// api/auth-send-otp.ts
//
// Step 2 of login. The client has already passed the password (it holds a
// valid Supabase session). It calls this with its Bearer token to request an
// SMS code. We generate, hash, store, and send the code. The code itself is
// NEVER returned to the client.
//
// Rate limits (per user):
//   - at most 1 send per 60 seconds (cooldown)
//   - at most 5 sends per rolling hour
// ════════════════════════════════════════════════════════════════════════════

import { makeAdmin, resolveCaller } from './_lib/supabaseAdmin'
import { normalizeTZ, generateCode, hashCode, sendSMS, maskPhone } from './_lib/sms'

const OTP_TTL_MINUTES = 5
const RESEND_COOLDOWN_SEC = 60
const MAX_SENDS_PER_HOUR = 5

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const companyId: string = (req.body && req.body.companyId) || 'malkia-wellness'
    const admin = makeAdmin(companyId)
    if (!admin) return res.status(500).json({ error: `Server not configured for company "${companyId}"` })

    const gate = await resolveCaller(admin, req.headers?.authorization)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error })
    const user = gate.user

    // Phased rollout: no phone means no OTP. The client treats "not required"
    // as "let them straight in", so users without a number are never blocked.
    const msisdn = normalizeTZ(user.phone)
    if (!msisdn) {
      return res.status(200).json({ required: false, reason: 'no_phone' })
    }

    const nowIso = new Date().toISOString()
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    // Rate limit: recent sends for this user.
    const { data: recent, error: recentErr } = await admin
      .from('otp_challenges')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('purpose', 'login')
      .gte('created_at', hourAgo)
      .order('created_at', { ascending: false })

    if (recentErr) return res.status(500).json({ error: 'Rate-limit check failed: ' + recentErr.message })

    if (recent && recent.length >= MAX_SENDS_PER_HOUR) {
      return res.status(429).json({ error: 'Too many codes requested. Try again later.' })
    }
    if (recent && recent.length > 0) {
      const last = new Date(recent[0].created_at).getTime()
      const waited = (Date.now() - last) / 1000
      if (waited < RESEND_COOLDOWN_SEC) {
        return res.status(429).json({ error: `Please wait ${Math.ceil(RESEND_COOLDOWN_SEC - waited)}s before requesting another code.` })
      }
    }

    // Generate + store (hashed).
    const code = generateCode()
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString()
    const ip = (req.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim() || null

    const { data: challenge, error: insErr } = await admin
      .from('otp_challenges')
      .insert({
        user_id: user.id,
        phone: msisdn,
        code_hash: hashCode(code),
        purpose: 'login',
        expires_at: expiresAt,
        created_at: nowIso,
        ip,
      })
      .select('id')
      .single()

    if (insErr || !challenge) return res.status(500).json({ error: 'Could not create code: ' + (insErr?.message || 'unknown') })

    // Send. If the SMS transport fails, delete the challenge so it doesn't count against
    // the rate limit, and surface the error.
    try {
      await sendSMS(msisdn, `Your MalkiaOS login code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. Do not share it.`)
    } catch (e: any) {
      await admin.from('otp_challenges').delete().eq('id', challenge.id)
      return res.status(502).json({ error: 'Could not send SMS: ' + (e?.message || 'transport error') })
    }

    return res.status(200).json({
      required: true,
      challengeId: challenge.id,
      sentTo: maskPhone(msisdn),
      expiresInSec: OTP_TTL_MINUTES * 60,
    })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
