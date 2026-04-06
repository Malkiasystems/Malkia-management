import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, PayrollLine } from './hrmTypes'
import { DEPT_COLORS } from './hrmTypes'

export default function HRMPayslips({ onNav }: HRMProps) {
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [period])

  const load = async () => {
    setLoading(true)
    const { data: runs } = await supabase.from('hrm_payroll_runs').select('id').eq('period', period).order('created_at', { ascending: false }).limit(1)
    if (!runs || runs.length === 0) { setLines([]); setLoading(false); return }
    const { data } = await supabase.from('hrm_payroll_lines').select('*, employee:hrm_employees(id, full_name, initials, job_title, department, contract_type)').eq('payroll_run_id', runs[0].id)
    setLines(data || [])
    setLoading(false)
  }

  const fmt = (n: number) => (n || 0).toLocaleString()

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Payslips</div><div className="page-sub">Auto-generated from payroll run · Downloadable</div></div>
        <div className="page-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>
            <span>Month</span>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', outline: 'none' }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading payslips...</div>
      ) : lines.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>---</div>
          <div style={{ fontSize: 14 }}>No payroll run found for {period}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Process payroll first in the Payroll page</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => onNav('hrm-payroll')}>Go to Payroll</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {lines.map((l: any) => {
            const emp = l.employee
            const color = DEPT_COLORS[emp?.department] || '#6366f1'
            return (
              <div key={l.id} className="card" style={{ borderTop: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{emp?.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{emp?.job_title} · {period}</div>
                  </div>
                  <span style={{ fontSize: 10, background: l.payslip_sent ? '#22c55e22' : '#f59e0b22', color: l.payslip_sent ? '#22c55e' : '#f59e0b', padding: '2px 8px', borderRadius: 4 }}>{l.payslip_sent ? 'Sent' : 'Pending'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Gross</span><span style={{ fontFamily: 'var(--mono)' }}>{fmt(l.gross)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>PAYE</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.paye)})</span></div>
                  {l.nssf_ee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>NSSF</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.nssf_ee)})</span></div>}
                  {l.advance_deduction > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Advance</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.advance_deduction)})</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: 5 }}><span>Net Pay</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(l.net_pay)}</span></div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && <Toast message={toast} type="success" onClose={() => setToast('')} />}
    </div>
  )
}
