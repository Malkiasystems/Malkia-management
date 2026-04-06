import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { tzs } from '../../lib/utils'
import type { HRMProps, Employee } from './hrmTypes'
import { CONTRACT_LABELS, CONTRACT_COLORS, DEPT_COLORS } from './hrmTypes'

export default function HRMDashboard({ onNav }: HRMProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, fullTime: 0, contract: 0, intern: 0, payroll: 0, onLeave: 0, assetsOut: 0 })
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [empRes, leaveRes, assetRes, evtRes] = await Promise.all([
      supabase.from('hrm_employees').select('*').eq('is_active', true).order('full_name'),
      supabase.from('hrm_leave_requests').select('employee_id').eq('status', 'approved')
        .gte('start_date', new Date().toISOString().split('T')[0])
        .lte('start_date', new Date().toISOString().split('T')[0]),
      supabase.from('hrm_assets').select('id').eq('status', 'assigned'),
      supabase.from('hrm_events').select('*').gte('event_date', new Date().toISOString().split('T')[0]).order('event_date').limit(5),
    ])
    const emps = empRes.data || []
    setEmployees(emps)
    setEvents(evtRes.data || [])
    setStats({
      total: emps.length,
      fullTime: emps.filter(e => e.contract_type === 'full_time').length,
      contract: emps.filter(e => e.contract_type === 'fixed_term' || e.contract_type === 'consultant').length,
      intern: emps.filter(e => e.contract_type === 'intern').length,
      payroll: emps.reduce((s, e) => s + (e.gross_salary || 0), 0),
      onLeave: leaveRes.data?.length || 0,
      assetsOut: assetRes.data?.length || 0,
    })
    setLoading(false)
  }

  const expiringContracts = employees.filter(e => {
    if (!e.end_date) return false
    const diff = (new Date(e.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff <= 90
  })

  const statCards = [
    { label: 'Total Staff', value: stats.total, color: '#6366f1' },
    { label: 'Full-time', value: stats.fullTime, color: '#22c55e' },
    { label: 'Contract', value: stats.contract, color: '#f59e0b' },
    { label: 'Intern', value: stats.intern, color: '#a78bfa' },
    { label: 'Payroll/mo', value: stats.payroll >= 1000000 ? (stats.payroll / 1000000).toFixed(1) + 'M' : (stats.payroll / 1000).toFixed(0) + 'K', color: '#ef4444' },
    { label: 'Assets Out', value: stats.assetsOut, color: '#3b82f6' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">HR Dashboard</div>
          <div className="page-sub">Malkia Wellness Group Ltd · {stats.total} employees · Live from Supabase</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => onNav('hrm-employees')}>Employees</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav('hrm-payroll')}>Payroll</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav('hrm-employees')}>+ New Employee</button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
        {statCards.map((s, i) => (
          <div key={i} className="card" style={{ padding: 14, textAlign: 'center', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Staff Overview */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Staff Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 80px', padding: '8px 18px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>
            <span>Employee</span><span>Dept</span><span>Type</span><span style={{ textAlign: 'right' }}>Gross</span>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading...</div>
          ) : employees.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No employees yet. Add your first team member.</div>
          ) : employees.map(emp => (
            <div key={emp.id} onClick={() => onNav('hrm-employees')} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 80px', padding: '11px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: 'pointer', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${DEPT_COLORS[emp.department] || '#6366f1'}22`, color: DEPT_COLORS[emp.department] || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{emp.initials}</div>
                <div style={{ fontWeight: 700 }}>{emp.full_name}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{emp.department}</div>
              <div><span style={{ fontSize: 10, background: `${CONTRACT_COLORS[emp.contract_type] || '#aaa'}22`, color: CONTRACT_COLORS[emp.contract_type] || '#aaa', padding: '1px 5px', borderRadius: 4 }}>{CONTRACT_LABELS[emp.contract_type] || emp.contract_type}</span></div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{(emp.gross_salary || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Quick Access */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Quick Access</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Employees', page: 'hrm-employees' as const },
                { label: 'Asset Allocation', page: 'hrm-assets' as const },
                { label: 'Leave Management', page: 'hrm-leave' as const },
                { label: 'Performance', page: 'hrm-performance' as const },
                { label: 'Events & Birthdays', page: 'hrm-events' as const },
                { label: 'Recruitment', page: 'hrm-recruitment' as const },
              ].map(item => (
                <button key={item.page} onClick={() => onNav(item.page)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>{item.label}</button>
              ))}
            </div>
          </div>

          {/* Upcoming Events / Alerts */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Alerts & Upcoming</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {expiringContracts.map(emp => (
                <div key={emp.id} style={{ padding: '8px 10px', background: '#ef444411', border: '1px solid #ef444433', borderRadius: 6, fontSize: 11 }}>
                  <div style={{ fontWeight: 700, color: '#ef4444' }}>{emp.full_name} - Contract Renewal</div>
                  <div style={{ color: 'var(--text3)', fontSize: 10 }}>Expires {emp.end_date}</div>
                </div>
              ))}
              {events.slice(0, 3).map((evt, i) => (
                <div key={i} style={{ padding: '8px 10px', background: '#6366f111', border: '1px solid #6366f133', borderRadius: 6, fontSize: 11 }}>
                  <div style={{ fontWeight: 700, color: '#6366f1' }}>{evt.title}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 10 }}>{evt.event_date}</div>
                </div>
              ))}
              {expiringContracts.length === 0 && events.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>No upcoming alerts</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
