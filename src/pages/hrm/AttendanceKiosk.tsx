// ============================================================================
// AttendanceKiosk.tsx — the shop screen.
//
// Any old tablet or the counter PC opens this page and leaves it open. It
// shows one large 6-digit code that rotates every 45 seconds, fetched from
// attendance_kiosk_code(). The secret that generates the code never leaves
// the database, so the page itself holds nothing worth stealing, and a
// photo of the screen goes stale before it can be forwarded.
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function AttendanceKiosk() {
  const [code, setCode] = useState('······')
  const [left, setLeft] = useState(0)
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    let alive = true
    const fetchCode = async () => {
      const { data } = await supabase.rpc('attendance_kiosk_code')
      if (alive && data) { setCode(data.code); setLeft(Number(data.seconds_left) || 0) }
    }
    fetchCode()
    const tick = setInterval(() => {
      setClock(new Date())
      setLeft(l => {
        if (l <= 1) { fetchCode(); return 0 }
        return l - 1
      })
    }, 1000)
    return () => { alive = false; clearInterval(tick) }
  }, [])

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 24,
      background: 'var(--bg)', color: 'var(--text)', textAlign: 'center', padding: 24,
    }}>
      <div style={{ fontSize: 15, letterSpacing: 3, color: 'var(--text3)', textTransform: 'uppercase' }}>
        Malkia · Staff Check-In
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontWeight: 800, letterSpacing: 12,
        fontSize: 'clamp(64px, 18vw, 160px)', lineHeight: 1, color: 'var(--accent)',
      }}>
        {code}
      </div>
      {code !== '······' && (
        <img
          alt="Scan to check in"
          width={190} height={190}
          style={{ borderRadius: 12, background: '#fff', padding: 10 }}
          // Third-party QR render of a 45-second code plus a public page URL:
          // nothing durable leaks. If the image fails (offline shop wifi),
          // onError hides it and the digits above remain the whole story.
          src={`https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}#/attendance-checkin?c=${code}`)}`}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div style={{ width: 'min(420px, 80vw)', height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(left / 45) * 100}%`, background: left < 10 ? 'var(--red)' : 'var(--accent)', transition: 'width 1s linear' }} />
      </div>
      <div style={{ fontSize: 14, color: 'var(--text3)' }}>
        Scan the QR with <strong>your own phone</strong>, or open MalkiaOS → Check In and type the code.
        New code every 45 seconds.
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>
        {clock.toLocaleTimeString('en-GB')} · {clock.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  )
}
