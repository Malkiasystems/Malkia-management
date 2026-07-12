// ════════════════════════════════════════════════════════════════════════════
// api/auth-verify-otp.ts
//
// Step 3 of login. Client submits { challengeId, code } with its Bearer token.
// We validate against the stored hash in constant time, enforce expiry and an
// attempt cap, and consume the challenge on success.
//
// The challenge MUST belong to the calling user — we never trust the client's
// claim about whose code it is; we match challenge.user_id to the resolved
// caller. This stops a logged-in low-priv session from verifying someone
// else's challenge.
// ════════════════════════════════════════════════════════════════════════════

import { makeAdmin, resolveCaller } from './_lib/supabaseAdmin'
import { codeMatches } from './_lib/sms'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body || {}
    const companyId: string = body.companyId || 'malkia-wellness'
    const challengeId: string = (body.challengeId || '').toString()
    const code: string = (body.code || '').toString().trim()

    if (!challengeId) return res.status(400).json({ error: 'Missing challenge' })
    if (!/^\d{4,8}$/.test(code)) return res.status(400).json({ error: 'Enter the numeric code from the SMS' })

    const admin = makeAdmin(companyId)
    if (!admin) return res.status(500).json({ error: `Server not configured for company "${companyId}"` })

    const gate = await resolveCaller(admin, req.headers?.authorization)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error })
    const user = gate.user

    const { data: ch, error: chErr } = await admin
      .from('otp_challenges')
      .select('id, user_id, code_hash, attempts, max_attempts, expires_at, consumed_at, phone')
      .eq('id', challengeId)
      .maybeSingle()

    if (chErr) return res.status(500).json({ error: 'Lookup failed: ' + chErr.message })
    if (!ch || ch.user_id !== user.id) return res.status(404).json({ error: 'Code not found. Request a new one.' })
    if (ch.consumed_at) return res.status(400).json({ error: 'This code was already used. Request a new one.' })
    if (new Date(ch.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Code expired. Request a new one.' })
    if (ch.attempts >= ch.max_attempts) return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' })

    if (!codeMatches(code, ch.code_hash)) {
      const attempts = ch.attempts + 1
      await admin.from('otp_challenges').update({ attempts }).eq('id', ch.id)
      const left = ch.max_attempts - attempts
      return res.status(401).json({
        error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.',
        attemptsLeft: Math.max(0, left),
      })
    }

    // Success: consume the challenge and record the verification.
    const now = new Date().toISOString()
    await admin.from('otp_challenges').update({ consumed_at: now }).eq('id', ch.id)
    await admin.from('users').update({ last_login_otp_at: now, phone_verified_at: now }).eq('id', user.id)

    return res.status(200).json({ ok: true })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
