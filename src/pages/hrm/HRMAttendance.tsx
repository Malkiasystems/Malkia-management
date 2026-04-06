import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, AttendanceEntry, Employee } from './hrmTypes'

export default function HRMAttendance({ onNav: _onNav }: HRMProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [todayStatus, setTodayStatus] = useState<Record<string, AttendanceEntry>>({})
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [form, setForm] = useState({ employee_id: '', date: new Date().toISOString().split('T')[0], clock_in: '', clock_out: '', entry_type: 'office', notes: '' })

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    load()
    const timer = setInterval(() => setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' })), 1000)
    return () => clearInterval(timer)
  }, [])

  const load = async () => {
    setLoading(true)
    const [empRes, todayRes, logRes] = await Promise.all([
      supabase.from('hrm_employees').select('*').eq('is_active', true).order('full_name'),
      supabase.from('hrm_attendance').select('*').eq('date', today),
      supabase.from('hrm_attendance').select('*, employee:hrm_employees(id, full_name)').order('date', { ascending: false }).limit(30),
    ])
    setEmployees(empRes.data || [])
    setEntries(logRes.data || [])
    const statusMap: Record<string, AttendanceEntry> = {}
    ;(todayRes.data || []).forEach((e: AttendanceEntry) => { statusMap[e.employee_id] = e })
    setTodayStatus(statusMap)
    setLoading(false)
  }

  const clockIn = async (empId: string) => {
    const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit' })
    const { error } = await supabase.from('hrm_attendance').insert({
      employee_id: empId, date: today, clock_in: now, entry_type: 'office', status: 'present',
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Clocked in'); setToastType('success'); load()
  }

  const clockOut = async (empId: string) => {
    const entry = todayStatus[empId]
    if (!entry) return
    const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit' })
    // Calculate hours
    const [inH, inM] = (entry.clock_in || '08:00').split(':').map(Number)
    const [outH, outM] = now.split(':').map(Number)
    const hours = Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10
    await supabase.from('hrm_attendance').update({ clock_out: now, hours }).eq('id', entry.id)
    setToast('Clocked out'); setToastType('success'); load()
  }

  const logEntry = async () => {
    if (!form.employee_id || !form.date) { setToast('Select employee and date'); setToastType('error'); return }
    let hours: number | null = null
    if (form.clock_in && form.clock_out) {
      const [inH, inM] = form.clock_in.split(':').map(Number)
      const [outH, outM] = form.clock_out.split(':').map(Number)
      hours = Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10
    }
    const { error } = await supabase.from('hrm_attendance').insert({
      employee_id: form.employee_id, date: form.date, clock_in: form.clock_in || null,
      clock_out: form.clock_out || null, hours, entry_type: form.entry_type,
      status: form.entry_type === 'leave' ? 'on_leave' : 'present', notes: form.notes || null,
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Attendance logged'); setToastType('success'); setShowModal(false); load()
  }

  const statusColor: Record<string, string> = { present: '#22c55e', absent: '#ef4444', on_leave: '#3b82f6', late: '#f59e0b' }
  const typeColor: Record<string, string> = { office: 'var(--surface2)', field: '#f59e0b22', remote: '#3b82f622', consultation: '#f59e0b22', leave: '#3b82f622' }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Attendance</div><div className="page-sub">Live clock-in/out · Daily log · Session tracking</div></div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(true)}>Log Entry</button>
        </div>
      </div>

      {/* Live Clock Panel */}
      <div className="card" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ fontSize: 12, fontWeight: 800 }}>Today - Live Status</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{clock || '--:--:--'}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>EAT (UTC+3)</div>
          </div>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>Loading...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(employees.length, 5)},1fr)`, gap: 10 }}>
            {employees.map(emp => {
              const status = todayStatus[emp.id]
              const isIn = status && status.clock_in && !status.clock_out
              const isDone = status && status.clock_out
              return (
                <div key={emp.id} className="card" style={{ padding: 10, textAlign: 'center', borderTop: `3px solid ${isIn ? '#22c55e' : isDone ? 'var(--text3)' : 'var(--accent)'}` }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{emp.full_name.split(' ')[0]}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: isIn ? '#22c55e' : isDone ? 'var(--text3)' : 'var(--text3)', marginBottom: 6 }}>
                    {isIn ? `IN ${status.clock_in}` : isDone ? `${status.clock_in}-${status.clock_out}` : 'Not in yet'}
                  </div>
                  {isDone && <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>{status.hours || 0}h</div>}
                  {!status ? (
                    <button onClick={() => clockIn(emp.id)} style={{ width: '100%', background: 'var(--accent)', border: 'none', color: '#000', padding: 5, borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clock In</button>
                  ) : isIn ? (
                    <button onClick={() => clockOut(emp.id)} style={{ width: '100%', background: '#ef444422', border: '1px solid #ef444444', color: '#ef4444', padding: 5, borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clock Out</button>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--text3)', padding: 5 }}>Done</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Log Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Employee</th><th style={{ textAlign: 'center' }}>In</th><th style={{ textAlign: 'center' }}>Out</th><th style={{ textAlign: 'center' }}>Hours</th><th style={{ textAlign: 'center' }}>Type</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--text3)' }}>{e.date}</td>
                  <td style={{ fontWeight: 600 }}>{(e.employee as any)?.full_name}</td>
                  <td className="td-mono" style={{ textAlign: 'center' }}>{e.clock_in || '---'}</td>
                  <td className="td-mono" style={{ textAlign: 'center' }}>{e.clock_out || '---'}</td>
                  <td className="td-mono" style={{ textAlign: 'center' }}>{e.hours ? `${e.hours}h` : '---'}</td>
                  <td style={{ textAlign: 'center' }}><span style={{ fontSize: 10, background: typeColor[e.entry_type] || 'var(--surface2)', padding: '2px 7px', borderRadius: 4 }}>{e.entry_type}</span></td>
                  <td style={{ textAlign: 'center' }}><span style={{ fontSize: 10, background: `${statusColor[e.status] || '#aaa'}22`, color: statusColor[e.status] || '#aaa', padding: '2px 7px', borderRadius: 4 }}>{e.status}</span></td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text3)' }}>No attendance records yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Entry Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 420, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Log Attendance Entry</div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Employee *</label><select style={inputStyle} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}><option value="">Select...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Date *</label><input type="date" style={inputStyle} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Type</label><select style={inputStyle} value={form.entry_type} onChange={e => setForm({ ...form, entry_type: e.target.value })}><option value="office">Office</option><option value="field">Field Sales</option><option value="consultation">Consultation</option><option value="remote">Remote</option><option value="leave">Leave</option></select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Clock In</label><input type="time" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.clock_in} onChange={e => setForm({ ...form, clock_in: e.target.value })} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Clock Out</label><input type="time" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.clock_out} onChange={e => setForm({ ...form, clock_out: e.target.value })} /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={logEntry}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
