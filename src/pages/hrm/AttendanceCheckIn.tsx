// ============================================================================
// AttendanceCheckIn.tsx — the staff phone side.
//
// Pick your name, type the code from the shop screen, done. Everything that
// makes this hard to cheat lives SERVER-SIDE in attendance_punch():
//   · the code proves you can see the shop screen right now
//   · this phone welds to your name on first use (hrm_devices)
//   · one phone cannot punch a second person within 10 minutes
//   · GPS distance is recorded and flagged, never blocked
// The device id is a random UUID minted once into localStorage. Clearing it
// does not help a cheat: the fresh id simply binds to whoever uses it first,
// and the old binding still blocks their name on any other phone.
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const DEVICE_KEY = 'malkia.attendance.device'
function deviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_KEY)
    if (!d) { d = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, d) }
    return d
  } catch { return 'no-storage' }
}

interface Emp { id: string; full_name: string }

export default function AttendanceCheckIn() {
  const [emps, setEmps] = useState<Emp[]>([])
  const [empId, setEmpId] = useState(() => { try { return localStorage.getItem('malkia.attendance.emp') || '' } catch { return '' } })
  const [code, setCode] = useState(() => {
    // Deep link from the kiosk QR: #/attendance-checkin?c=123456. The code
    // is only ever 45 seconds old, so prefilling it is the same trust as
    // the user typing what the screen shows.
    const m = window.location.hash.match(/[?&]c=(\d{6})/)
    return m ? m[1] : ''
  })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string; late?: boolean } | null>(null)

  useEffect(() => {
    supabase.from('hrm_employees').select('id, full_name').eq('is_active', true).order('full_name')
      .then(({ data }) => data && setEmps(data as Emp[]))
  }, [])

  const punch = async () => {
    if (!empId) { setResult({ ok: false, msg: 'Choose your name' }); return }
    if (code.trim().length !== 6) { setResult({ ok: false, msg: 'Enter the 6-digit code from the shop screen' }); return }
    setBusy(true); setResult(null)
    try { localStorage.setItem('malkia.attendance.emp', empId) } catch { /* private mode */ }

    // GPS is best-effort with a short timeout: a punch must not hang on a
    // phone with location off. The server flags no_gps rather than refusing.
    const pos: { lat: number | null; lng: number | null } = { lat: null, lng: null }
    if (navigator.geolocation) {
      await new Promise<void>(resolve => {
        const t = setTimeout(resolve, 4000)
        navigator.geolocation.getCurrentPosition(
          p => { pos.lat = p.coords.latitude; pos.lng = p.coords.longitude; clearTimeout(t); resolve() },
          () => { clearTimeout(t); resolve() },
          { enableHighAccuracy: false, timeout: 3500, maximumAge: 60000 }
        )
      })
    }

    const { data, error } = await supabase.rpc('attendance_punch', {
      p_employee_id: empId, p_device_id: deviceId(), p_code: code.trim(),
      p_lat: pos.lat, p_lng: pos.lng,
    })
    setBusy(false); setCode('')
    if (error) { setResult({ ok: false, msg: error.message }); return }
    if (!data?.ok) { setResult({ ok: false, msg: data?.error || 'Punch refused' }); return }
    setResult({
      ok: true, late: !!data.late,
      msg: data.type === 'in'
        ? `Checked in at ${data.time}${data.late ? ' — marked late' : ''}. Karibu kazini, ${String(data.name).split(' ')[0]}!`
        : `Checked out at ${data.time}. Safe journey home.`,
    })
  }

  return (
    <div className="page" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="page-header"><h1 className="page-title">Check In / Out</h1></div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase' }}>Your name</label>
          <select className="form-input" value={empId} onChange={e => setEmpId(e.target.value)} style={{ marginTop: 6 }}>
            <option value="">— Select —</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase' }}>Code from the shop screen</label>
          <input className="form-input" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="000000"
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 28, letterSpacing: 10, textAlign: 'center', fontWeight: 700 }} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }}
          disabled={busy} onClick={punch}>
          {busy ? 'Punching…' : 'Punch'}
        </button>
        {result && (
          <div style={{
            padding: '12px 14px', borderRadius: 10, fontSize: 13, textAlign: 'center',
            background: result.ok ? (result.late ? 'rgba(255,211,42,.12)' : 'rgba(0,229,160,.12)') : 'rgba(255,71,87,.12)',
            border: `1px solid ${result.ok ? (result.late ? 'var(--amber, #d4a017)' : 'var(--green, #16a34a)') : 'var(--red, #dc2626)'}`,
            color: result.ok ? (result.late ? 'var(--amber, #b8860b)' : 'var(--green, #15803d)') : 'var(--red, #dc2626)',
          }}>{result.msg}</div>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.6 }}>
        First punch of the day checks you in; the last one checks you out.
        This phone becomes yours after the first punch — a different phone will
        refuse your name until a manager re-assigns it.
      </div>
    </div>
  )
}
