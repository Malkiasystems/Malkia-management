// ════════════════════════════════════════════════════════════════════════════
// api/_lib/beem.ts
//
// Beem Africa SMS transport + Tanzania phone normalization + OTP hashing.
// Beem is used ONLY to deliver the SMS. Generation, hashing, and verification
// are ours (see auth-send-otp / auth-verify-otp).
//
// ENV (server-side, set in Vercel — never VITE_ prefixed):
//   BEEM_API_KEY      Beem API key      (profile > authentication information)
//   BEEM_SECRET_KEY   Beem secret key
//   BEEM_SENDER_ID    Approved Sender Name, e.g. MALKIA (needs TCRA approval)
//   OTP_PEPPER        Long random string. Codes are HMAC'd with it before
//                     storage, so a leaked DB row still can't reveal the code.
// ════════════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual, randomInt } from 'crypto'

const BEEM_SEND_URL = 'https://apisms.beem.africa/v1/send'

/**
 * Normalize a Tanzanian number to Beem's format: 255XXXXXXXXX, digits only.
 * Handles the shapes already on file (e.g. "+255 748 551 008") plus locals
 * like "0748551008" and "748551008".
 * Returns null if it can't produce a plausible 12-digit 255 number.
 */
export function normalizeTZ(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '') // strip +, spaces, dashes
  if (d.startsWith('255')) {
    // already country-coded
  } else if (d.startsWith('0') && d.length === 10) {
    d = '255' + d.slice(1)               // 0748551008 -> 255748551008
  } else if (d.length === 9) {
    d = '255' + d                        // 748551008 -> 255748551008
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
  try {
    expected = hashCode(submitted)
  } catch {
    return false
  }
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

/**
 * Send an SMS via Beem. Throws on transport/config failure so the caller can
 * decide how to surface it. Resolves when Beem accepts the request.
 */
export async function sendSMS(msisdn: string, message: string): Promise<void> {
  const apiKey = process.env.BEEM_API_KEY
  const secretKey = process.env.BEEM_SECRET_KEY
  const senderId = process.env.BEEM_SENDER_ID
  if (!apiKey || !secretKey || !senderId) {
    throw new Error('Beem is not configured (BEEM_API_KEY / BEEM_SECRET_KEY / BEEM_SENDER_ID)')
  }

  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64')
  const res = await fetch(BEEM_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_addr: senderId,
      encoding: 0,
      message,
      recipients: [{ recipient_id: '1', dest_addr: msisdn }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Beem send failed (${res.status}): ${text.slice(0, 200)}`)
  }
}
