import { useState, useEffect } from 'react'
import { supabase, getActiveCompany } from '../lib/supabase'
import OtpGate from '../components/OtpGate'
import { markMfaVerified } from '../lib/useLoginOtp'

interface Props { onLogin: () => void }

// Company logo uploaded in Settings → Display → Login Branding.
// Stored as a data URL in system_settings (key 'branding') so it renders
// before sign-in with no storage buckets or extra requests to configure.
function useBrandLogo() {
  const [logo, setLogo] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'branding').maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return
        try {
          const v = JSON.parse(data.value)
          if (v.logo && typeof v.logo === 'string' && v.logo.startsWith('data:image/')) setLogo(v.logo)
        } catch { /* unbranded fallback */ }
      }, () => {})
  }, [])
  return logo
}

export default function Login({ onLogin }: Props) {
  const company = getActiveCompany()
  const logo = useBrandLogo()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfaUserId, setMfaUserId] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Email or password is incorrect.' : authError.message)
      setLoading(false); return
    }

    const { data: userData, error: userError } = await supabase
      .from('users').select('id, is_active, mfa_enabled')
      .eq('email', email.toLowerCase()).single()

    if (userError || !userData) {
      setError('This account is not registered in MalkiaOS. Contact your administrator.')
      await supabase.auth.signOut(); setLoading(false); return
    }
    if (!userData.is_active) {
      setError('Your account has been deactivated. Contact your administrator.')
      await supabase.auth.signOut(); setLoading(false); return
    }

    supabase.from('login_events').insert({
      user_email: email.toLowerCase(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }).then(() => {}, () => {})

    setLoading(false)
    if (userData.mfa_enabled) { setMfaUserId(userData.id); return }
    onLogin()
  }

  const cancelMfa = async () => {
    await supabase.auth.signOut()
    setMfaUserId(null); setPassword(''); setError('')
  }

  if (mfaUserId) {
    return <OtpGate userId={mfaUserId}
      onVerified={() => { markMfaVerified(mfaUserId); onLogin() }} onCancel={cancelMfa} />
  }

  return (
    <div style={st.container}>
      {/* ambient brand glow */}
      <div style={st.glowTeal} />
      <div style={st.glowMaroon} />

      <div style={st.card}>
        <div style={st.logoWrap}>
          {logo ? (
            <img src={logo} alt={company.name} style={st.logoImg} />
          ) : (
            <svg width="64" height="64" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" fill="#5EA8A2" />
              <path d="M30 65 L50 35 L70 65" stroke="#fff" strokeWidth="6"
                strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx="50" cy="28" r="6" fill="#f7a6ad" />
            </svg>
          )}
        </div>

        <h1 style={st.title}>MalkiaOS</h1>
        <div style={st.tagline}>Your Partner in Motherhood</div>
        <div style={st.divider} />
        <p style={st.subtitle}>Sign in to continue</p>

        <form onSubmit={handleLogin} style={st.form}>
          {error && <div style={st.error}>{error}</div>}

          <div style={st.field}>
            <label style={st.label}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@malkia.co.tz" style={st.input} required autoFocus
              autoComplete="email" />
          </div>

          <div style={st.field}>
            <label style={st.label}>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                style={{ ...st.input, paddingRight: 74 }} required autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw(s => !s)} style={st.pwToggle}
                tabIndex={-1}>{showPw ? 'Hide' : 'Show'}</button>
            </div>
          </div>

          <button type="submit" disabled={loading}
            style={{ ...st.button, opacity: loading ? 0.75 : 1, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={st.footer}>{company.name} · Dar es Salaam</p>
      </div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(1200px 700px at 70% -10%, #10201f 0%, #0a0f10 45%, #070a0b 100%)',
    padding: 20, position: 'relative', overflow: 'hidden',
  },
  glowTeal: {
    position: 'absolute', width: 480, height: 480, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(94,168,162,0.14) 0%, transparent 70%)',
    top: -140, right: '12%', pointerEvents: 'none',
  },
  glowMaroon: {
    position: 'absolute', width: 420, height: 420, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(94,34,48,0.22) 0%, transparent 70%)',
    bottom: -160, left: '8%', pointerEvents: 'none',
  },
  card: {
    width: '100%', maxWidth: 420, borderRadius: 20, padding: '44px 40px',
    background: 'linear-gradient(180deg, rgba(30,36,40,0.92) 0%, rgba(22,27,30,0.96) 100%)',
    border: '1px solid rgba(94,168,162,0.22)',
    boxShadow: '0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)', textAlign: 'center' as const, position: 'relative',
  },
  logoWrap: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 18, minHeight: 64,
  },
  logoImg: { maxHeight: 76, maxWidth: 220, objectFit: 'contain' as const },
  title: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 34, fontWeight: 700, color: '#f2f4f5', margin: 0, letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 11, color: '#C8A96E', letterSpacing: 2.4, textTransform: 'uppercase' as const,
    marginTop: 6, fontWeight: 600,
  },
  divider: {
    width: 56, height: 2, margin: '18px auto 14px',
    background: 'linear-gradient(90deg, transparent, #5EA8A2, transparent)',
  },
  subtitle: { fontSize: 13.5, color: '#8d979c', margin: '0 0 22px' },
  form: { display: 'flex', flexDirection: 'column' as const, gap: 18 },
  field: { textAlign: 'left' as const },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#9aa4a8',
    marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  input: {
    width: '100%', padding: '13px 15px', fontSize: 15, borderRadius: 11,
    border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(9,13,14,0.85)',
    color: '#eef1f2', outline: 'none', boxSizing: 'border-box' as const,
  },
  pwToggle: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', color: '#5EA8A2', fontSize: 12,
    fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, padding: '6px 8px',
  },
  button: {
    width: '100%', padding: '14px 24px', fontSize: 15, fontWeight: 700, borderRadius: 11,
    border: 'none', marginTop: 6, color: '#04211f',
    background: 'linear-gradient(135deg, #6fb8b2 0%, #5EA8A2 60%, #4c948e 100%)',
    boxShadow: '0 8px 22px rgba(94,168,162,0.25)', transition: 'transform .12s, opacity .2s',
  },
  error: {
    padding: '11px 14px', borderRadius: 10, background: 'rgba(229,100,93,0.10)',
    border: '1px solid rgba(229,100,93,0.35)', color: '#e5645d', fontSize: 13,
    textAlign: 'left' as const,
  },
  footer: { marginTop: 30, fontSize: 11.5, color: '#5c666b', letterSpacing: 0.4 },
}
