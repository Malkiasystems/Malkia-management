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
          <svg width="34" height="34" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="45" fill="#85c2be" />
            <path d="M30 65 L50 35 L70 65" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="28" r="6" fill="#f7a6ad" />
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
