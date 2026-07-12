// ════════════════════════════════════════════════════════════════════════════
// api/auth-otp-selftest.ts
//
// Admin-only diagnostic for the SMS login OTP setup. It answers two questions
// without ever exposing a secret value:
//   1. Are the required env vars present in this deployment?
//   2. Does NextSMS actually deliver an SMS to a real number right now?
//
// It NEVER prints key/secret/pepper values — only booleans for whether they
// exist. The Sender ID is shown because it is not secret (recipients see it)
// and confirming the approved name is useful.
//
// Gated to admins (settings.users or super admin) because a test send costs
// money and hits a third party. DELETE this file, or leave it — it does
// nothing without an admin token — once setup is confirmed.
// ════════════════════════════════════════════════════════════════════════════

import { makeAdmin, resolveCaller } from './_lib/supabaseAdmin'
import { normalizeTZ, sendSMS, maskPhone } from './_lib/sms'

const SUPER_ADMIN_THRESHOLD = 40

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const companyId: string = (req.body && req.body.companyId) || 'malkia-wellness'
    const admin = makeAdmin(companyId)
    if (!admin) return res.status(500).json({ error: `Server not configured for company "${companyId}"` })

    // Must be a valid, active caller...
    const gate = await resolveCaller(admin, req.headers?.authorization)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error })

    // ...and an admin. Load permissions for the check.
    const { data: permRow } = await admin
      .from('users').select('permissions').eq('id', gate.user.id).maybeSingle()
    const perms: string[] = Array.isArray(permRow?.permissions) ? permRow!.permissions : []
    const isAdmin = perms.length >= SUPER_ADMIN_THRESHOLD || perms.includes('settings.users')
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' })

    // 1. Env presence — booleans only. Sender ID value shown (not secret).
    // Auth can come EITHER as NEXTSMS_USERNAME + NEXTSMS_PASSWORD, OR as a
    // ready-made NEXTSMS_AUTH value. Either satisfies the auth requirement.
    const hasUserPass = !!process.env.NEXTSMS_USERNAME && !!process.env.NEXTSMS_PASSWORD
    const hasAuthBlob = !!process.env.NEXTSMS_AUTH
    const env = {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXTSMS_USERNAME: !!process.env.NEXTSMS_USERNAME,
      NEXTSMS_PASSWORD: !!process.env.NEXTSMS_PASSWORD,
      NEXTSMS_AUTH: hasAuthBlob,
      auth_ok: hasUserPass || hasAuthBlob,
      NEXTSMS_SENDER_ID_present: !!process.env.NEXTSMS_SENDER_ID,
      NEXTSMS_SENDER_ID_value: process.env.NEXTSMS_SENDER_ID || null,
      NEXTSMS_SEND_URL: process.env.NEXTSMS_SEND_URL || '(default) https://messaging-service.co.tz/api/sms/v1/text/single',
      OTP_PEPPER: !!process.env.OTP_PEPPER,
    }
    const allPresent =
      env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY &&
      env.auth_ok && env.NEXTSMS_SENDER_ID_present && env.OTP_PEPPER

    // 2. Optional live send. Only when a testPhone is supplied.
    const testPhoneRaw: string | undefined = req.body?.testPhone
    let sms: any = { attempted: false }
    if (testPhoneRaw) {
      const msisdn = normalizeTZ(testPhoneRaw)
      if (!msisdn) {
        sms = { attempted: true, ok: false, error: `Could not normalize "${testPhoneRaw}" to a 255XXXXXXXXX number` }
      } else if (!allPresent) {
        sms = { attempted: true, ok: false, error: 'Env vars missing — fix those before sending', to: maskPhone(msisdn) }
      } else {
        try {
          await sendSMS(msisdn, 'MalkiaOS test message. If you received this, SMS OTP is ready to enable.')
          sms = { attempted: true, ok: true, to: maskPhone(msisdn) }
        } catch (e: any) {
          sms = { attempted: true, ok: false, to: maskPhone(msisdn), error: e?.message || 'send failed' }
        }
      }
    }

    return res.status(200).json({ env, allPresent, sms })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
