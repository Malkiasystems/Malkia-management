// ─── useLoginOtp ───────────────────────────────────────────────────────────
// Client side of the SMS login OTP. Talks to /api/auth-send-otp and
// /api/auth-verify-otp using the CURRENT Supabase session token (which exists
// because the password step already passed).
//
// The marker below is what gates the app after a reload: it lives in
// sessionStorage, so it clears when the browser tab closes and the user must
// re-verify on the next session. It is intentionally NOT localStorage.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { supabase, getActiveCompany } from './supabase'

const MFA_MARKER_KEY = 'malkia_mfa_ok'

export function markMfaVerified(userId: string) {
  try { sessionStorage.setItem(MFA_MARKER_KEY, userId) } catch { /* ignore */ }
}
export function isMfaVerifiedThisSession(userId: string): boolean {
  try { return sessionStorage.getItem(MFA_MARKER_KEY) === userId } catch { return false }
}
export function clearMfaVerified() {
  try { sessionStorage.removeItem(MFA_MARKER_KEY) } catch { /* ignore */ }
}

async function authedPost(path: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Your session expired. Please sign in again.')
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...body, companyId: getActiveCompany().id }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json
}

export interface SendResult {
  required: boolean
  challengeId?: string
  sentTo?: string
  expiresInSec?: number
}

export function useLoginOtp() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** Request a code. Returns required:false when the user has no phone/MFA. */
  const send = useCallback(async (): Promise<SendResult> => {
    setBusy(true); setError('')
    try {
      return await authedPost('/api/auth-send-otp', {})
    } catch (e: any) {
      setError(e?.message || 'Could not send code'); throw e
    } finally { setBusy(false) }
  }, [])

  /** Verify a code against a challenge. Returns true on success. */
  const verify = useCallback(async (challengeId: string, code: string): Promise<boolean> => {
    setBusy(true); setError('')
    try {
      const r = await authedPost('/api/auth-verify-otp', { challengeId, code })
      return !!r.ok
    } catch (e: any) {
      setError(e?.message || 'Verification failed'); return false
    } finally { setBusy(false) }
  }, [])

  return { send, verify, busy, error, setError }
}
