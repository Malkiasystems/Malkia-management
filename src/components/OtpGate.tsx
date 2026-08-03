// ─── OtpGate ───────────────────────────────────────────────────────────────
// The code-entry screen shown after a correct password when the user has SMS
// MFA enabled. It sends a code on mount, takes the 6-digit entry, verifies,
// and calls onVerified(). onCancel() signs out and returns to the password
// screen (used for "wrong account" / "use a different login").
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { useLoginOtp, markMfaVerified } from '../lib/useLoginOtp'

interface Props {
  userId: string
  onVerified: () => void
  onCancel: () => void
}

export default function OtpGate({ userId, onVerified, onCancel }: Props) {
  const { send, verify, busy, error, setError } = useLoginOtp()
  const [challengeId, setChallengeId] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(true)
  const startedRef = useRef(false)

  const requestCode = useCallback(async () => {
    setSending(true)
    try {
      const r = await send()
      if (!r.required) { onVerified(); return }   // no phone on file -> no MFA
      setChallengeId(r.challengeId || '')
      setSentTo(r.sentTo || '')
      setCooldown(60)
    } catch { /* error surfaced by hook */ }
    finally { setSending(false) }
  }, [send, onVerified])

  // Send once on mount (guard against React StrictMode double-invoke).
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    requestCode()
  }, [requestCode])

  // Resend cooldown tick.
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const submit = async () => {
    if (code.length < 4 || !challengeId) return
    const ok = await verify(challengeId, code)
    if (ok) { markMfaVerified(userId); onVerified() }
    else setCode('')
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <svg width="34" height="34" viewBox="76 76 349 349" fill="#85c2be" aria-label="Malkia">
              <g transform="translate(0.000000,501.000000) scale(0.100000,-0.100000)"><path d="M2720 4100 c-336 -72 -585 -268 -795 -625 -140 -238 -269 -585 -322 -870 -31 -168 -26 -581 8 -621 14 -18 49 -5 54 20 2 11 7 74 10 140 15 291 101 487 304 686 155 153 325 264 690 455 258 134 345 185 472 275 143 102 186 158 196 256 11 101 -28 188 -105 239 -93 61 -337 83 -512 45z M3210 3477 c-264 -154 -360 -208 -500 -282 -198 -104 -269 -148 -410 -253 -261 -196 -467 -449 -526 -647 -19 -64 -25 -246 -10 -319 l7 -39 39 64 c137 228 422 405 686 425 101 7 233 -7 325 -35 69 -22 73 -17 38 58 -23 51 -58 96 -181 232 -47 53 -98 113 -112 133 -97 143 25 313 201 277 222 -44 416 42 498 221 34 75 54 195 35 211 -3 2 -43 -18 -90 -46z M2431 2330 c-210 -45 -416 -183 -534 -358 -75 -111 -109 -259 -89 -392 49 -336 368 -604 804 -675 109 -18 295 -20 370 -4 72 15 164 60 220 109 43 37 108 123 108 142 0 4 -30 -7 -67 -26 -150 -76 -288 -102 -482 -93 -420 21 -757 251 -813 555 -24 129 23 268 128 381 145 157 336 241 519 227 166 -12 304 -68 408 -166 76 -70 111 -78 147 -33 31 40 19 69 -60 144 -80 77 -194 138 -317 170 -89 23 -274 33 -342 19z M2443 2096 c-73 -18 -174 -72 -247 -132 -114 -94 -175 -219 -162 -336 31 -299 404 -525 835 -505 260 12 454 111 527 269 26 57 29 73 28 158 -1 76 -7 110 -29 170 -28 78 -99 203 -133 233 -18 17 -20 17 -36 -8 -37 -56 -122 -81 -190 -56 -13 6 -50 35 -81 66 -120 120 -343 182 -512 141z m430 -329 c12 -13 27 -32 33 -43 11 -18 12 -18 25 9 26 58 104 75 138 31 33 -41 26 -84 -28 -192 -26 -53 -59 -126 -71 -162 -13 -36 -27 -69 -31 -74 -19 -21 -94 79 -137 181 -48 112 -48 218 -1 256 28 23 46 22 72 -6z"/></g>
            </svg>
        </div>

        <h1 style={styles.title}>Verify it's you</h1>
        <p style={styles.sub}>
          {sending
            ? 'Sending a code by SMS...'
            : sentTo
              ? <>We sent a 6-digit code to <b>{sentTo}</b>. Enter it below.</>
              : 'Enter the code from the SMS.'}
        </p>

        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={e => { setError(''); setCode(e.target.value.replace(/\D/g, '')) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="------"
          style={styles.codeInput}
          autoFocus
        />

        {error && <div style={styles.error}>{error}</div>}

        <button style={styles.primary} onClick={submit} disabled={busy || code.length < 4 || !challengeId}>
          {busy ? 'Checking...' : 'Verify & continue'}
        </button>

        <div style={styles.row}>
          <button
            style={{ ...styles.link, opacity: cooldown > 0 || sending ? 0.5 : 1 }}
            disabled={cooldown > 0 || sending}
            onClick={requestCode}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
          <button style={styles.link} onClick={onCancel}>Use a different account</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 },
  card: { width: '100%', maxWidth: 380, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, textAlign: 'center' },
  logo: { marginBottom: 14 },
  title: { fontFamily: 'var(--display, Syne, sans-serif)', fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' },
  sub: { fontSize: 13, color: 'var(--text3)', margin: '0 0 20px', lineHeight: 1.5 },
  codeInput: {
    width: '100%', textAlign: 'center', fontFamily: 'var(--mono, monospace)',
    fontSize: 30, letterSpacing: 10, padding: '12px 0', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', outline: 'none',
  },
  error: { fontSize: 12, color: 'var(--red, #dc2626)', marginTop: 10 },
  primary: {
    width: '100%', marginTop: 16, padding: '12px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  row: { display: 'flex', justifyContent: 'space-between', marginTop: 16 },
  link: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', padding: 4 },
}
