// ════════════════════════════════════════════════════════════════════════════
// api/_lib/sms.ts
//
// SMS transport for NextSMS (Tanzania, messaging-service.co.tz) + Tanzania
// phone normalization + OTP hashing. We generate/hash/verify codes ourselves;
// NextSMS only delivers the message.
//
// NextSMS single-send API:
//   POST https://messaging-service.co.tz/api/sms/v1/text/single
//   Authorization: Basic base64(username:password)
//   Content-Type: application/json, Accept: application/json
//   body: { "from": "<SenderID>", "to": "255XXXXXXXXX", "text": "..." }
//
// ENV (server-side, set in Vercel — never VITE_ prefixed):
//   NEXTSMS_USERNAME   Your NextSMS account username        (for Basic auth)
//   NEXTSMS_PASSWORD   Your NextSMS account password
//   NEXTSMS_AUTH       ALTERNATIVE to the two above: a ready-made auth value
//                      from the dashboard. May be the raw base64 or the full
//                      "Basic xxxx" string. If set, it wins.
//   NEXTSMS_SENDER_ID  Approved Sender Name (NextSMS issues one free)
//   NEXTSMS_SEND_URL   Optional override of the endpoint (defaults below).
//   OTP_PEPPER         Long random string; codes are HMAC'd with it before
//                      storage, so a leaked DB row still can't reveal the code.
// ════════════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual, randomInt } from 'crypto'

const DEFAULT_SEND_URL = 'https://messaging-service.co.tz/api/sms/v1/text/single'

/**
 * Normalize a Tanzanian number to 255XXXXXXXXX (digits only), which NextSMS
 * accepts. Handles "+255 748 551 008", "0748551008", "748551008".
 * Returns null if it can't produce a plausible 12-digit 255 number.
 */
export function normalizeTZ(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (d.startsWith('255')) {
    // already country-coded
  } else if (d.startsWith('0') && d.length === 10) {
    d = '255' + d.slice(1)
  } else if (d.length === 9) {
    d = '255' + d
  } else {
    return null
  }
  return /^255\d{9}$/.test(d) ? d : null
}

/** A 6-digit numeric code, cryptographically random, leading zeros allowed. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** HMAC-SHA256 of the code with the server pepper. Deterministic, keyed. */
export function hashCode(code: string): string {
  const pepper = process.env.OTP_PEPPER
  if (!pepper) throw new Error('OTP_PEPPER is not set')
  return createHmac('sha256', pepper).update(code).digest('hex')
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function codeMatches(submitted: string, storedHash: string): boolean {
  let expected: string
  try { expected = hashCode(submitted) } catch { return false }
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Mask a number for display / logs: 255748551008 -> 255 *** *** 008 */
export function maskPhone(msisdn: string): string {
  if (msisdn.length < 6) return '***'
  return `${msisdn.slice(0, 3)} *** *** ${msisdn.slice(-3)}`
}

/** Build the Authorization header value from env. */
function authHeader(): string | null {
  const pre = process.env.NEXTSMS_AUTH
  if (pre && pre.trim()) {
    const v = pre.trim()
    return /^basic\s/i.test(v) ? v : `Basic ${v}`
  }
  const user = process.env.NEXTSMS_USERNAME
  const pass = process.env.NEXTSMS_PASSWORD
  if (user && pass) return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
  return null
}

/** True when the transport has everything it needs to send. */
export function smsConfigured(): boolean {
  return !!authHeader() && !!process.env.NEXTSMS_SENDER_ID
}

/**
 * Send an SMS via NextSMS. Throws on config/transport failure so the caller
 * can surface it. Resolves when NextSMS accepts the request.
 */
export async function sendSMS(msisdn: string, message: string): Promise<void> {
  const auth = authHeader()
  const sender = process.env.NEXTSMS_SENDER_ID
  if (!auth || !sender) {
    throw new Error('NextSMS is not configured (NEXTSMS_USERNAME/PASSWORD or NEXTSMS_AUTH, and NEXTSMS_SENDER_ID)')
  }
  const url = process.env.NEXTSMS_SEND_URL || DEFAULT_SEND_URL

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ from: sender, to: msisdn, text: message }),
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`NextSMS send failed (${res.status}): ${text.slice(0, 300)}`)
  }
  // NextSMS returns 200 with a JSON body describing per-recipient status.
  // A non-JSON or error-coded body on a 200 is worth surfacing too.
  if (/error|invalid|unauthor/i.test(text) && !/messageId|SENT|PENDING|Queued|success/i.test(text)) {
    throw new Error(`NextSMS rejected the message: ${text.slice(0, 300)}`)
  }
}
