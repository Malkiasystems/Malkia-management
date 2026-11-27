import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { monthBounds, prorate, proratedGross } from './proration'
import { exportPayroll, type PayrollExportLine } from './hrmExport'
import Toast from '../../components/Toast'
import type { HRMProps } from './hrmTypes'
import { computePayrollLine, DEFAULT_HR_SETTINGS } from './hrmTypes'

interface PayLine {
  empId: string; name: string; title: string; code: string; contractType: string
  prorataNote: string | null
  gross: number; nssfEnabled: boolean; payeEnabled: boolean; sdlEnabled: boolean
  allowances: number; deductions: number; advanceDeduction: number; bonus: number; notes: string
  paye: number; nssfEe: number; nssfEr: number; sdl: number; net: number; band: string
}

export default function HRMPayroll({ onNav: _onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const operation = useRef<{ signature: string; id: string } | null>(null)
  const [previousRun, setPreviousRun] = useState<string | null>(null)
  const isSelfMode = hrmMode === 'self'
  const request = useRef(0)
  const [loadedPeriod, setLoadedPeriod] = useState('')
  const [lines, setLines] = useState<PayLine[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [exporting, setExporting] = useState(false)
  const [posting, setPosting] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [settings, setSettings] = useState(DEFAULT_HR_SETTINGS)

  useEffect(() => {
    load()
    return () => { request.current++ }
  }, [period, isSelfMode, linkedEmployeeId])

  const load = async () => {
    const current = ++request.current
    setLoadedPeriod('')
    setLines([])
    setLoading(true)
    if (!period || (isSelfMode && !linkedEmployeeId)) { setLoading(false); return }
    const bounds = monthBounds(period)
    let staff = supabase.from('hrm_employees').select('*').eq('is_active', true)
    let advances = supabase.from('hrm_salary_advances').select('id, employee_id, monthly_deduction, remaining, status').in('status', ['active','cleared']).lte('issued_date', bounds.end)
    let leave = supabase.from('hrm_leave_requests').select('employee_id,start_date,end_date')
      .eq('status', 'approved').eq('leave_type', 'unpaid').lte('start_date', bounds.end).gte('end_date', bounds.start)
    if (isSelfMode) {
      staff = staff.eq('id', linkedEmployeeId)
      advances = advances.eq('employee_id', linkedEmployeeId)
      leave = leave.eq('employee_id', linkedEmployeeId)
    }
    const [empRes, settRes, advRes, leaveRes, runRes] = await Promise.all([
      staff.order('full_name'), supabase.from('system_settings').select('value').eq('key', 'hr_settings').maybeSingle(), advances, leave,
      supabase.from('hrm_payroll_runs').select('id').eq('period', period).eq('status','posted').maybeSingle(),
    ])
    if (current !== request.current) return
    const failure = empRes.error || settRes.error || advRes.error || leaveRes.error || runRes.error
    if (failure) {
      setToast('Could not load this payroll: ' + failure.message)
      setToastType('error'); setLoading(false); return
    }
    const emps = empRes.data || []
    let s = DEFAULT_HR_SETTINGS
    if (settRes.data?.value) {
      try {
        const raw = settRes.data.value
        s = { ...DEFAULT_HR_SETTINGS, ...(typeof raw === 'string' ? JSON.parse(raw) : raw) }
      } catch {
        setToast('Payroll settings could not be read. Check HRM Settings before posting.')
        setToastType('error'); setLoading(false); return
      }
    }
    setSettings(s)
    const restored: Record<string, number> = {}
    const runId: string | null = runRes.data?.id ?? null
    if (runId) {
      let oldLines = supabase.from('hrm_payroll_lines').select('advance_recoveries').eq('payroll_run_id',runId)
      if (isSelfMode) oldLines = oldLines.eq('employee_id', linkedEmployeeId)
      const earlier = await oldLines
      if (current !== request.current) return
      if (earlier.error) { setToast(earlier.error.message); setToastType('error'); setLoading(false); return }
      for (const row of earlier.data || []) {
        for (const [id, amount] of Object.entries(row.advance_recoveries || {})) restored[id] = Number(amount)
      }
    }
    setPreviousRun(runId)
    const advMap: Record<string, number> = {}
    for (const a of advRes.data || []) {
      if (a.status !== 'active' && !restored[a.id]) continue
      const owed = Number(a.remaining) + (restored[a.id] || 0)
      const due = Math.max(0, Math.min(Number(a.monthly_deduction), owed))
      advMap[a.employee_id] = (advMap[a.employee_id] || 0) + due
    }

    const computed = emps.flatMap(emp => {
      const unpaid = (leaveRes.data || []).filter(row => row.employee_id === emp.id)
        .map(row => ({ start: row.start_date, end: row.end_date }))
      const worked = prorate(period, emp.start_date, emp.end_date, unpaid)
      if (!worked.inMonth) return []
      const gross = proratedGross(emp.gross_salary || 0, worked)
      const advDed = advMap[emp.id] || 0
      const payeOn = emp.paye_enabled !== false  // default true for backwards compat
      const sdlOn = emp.sdl_enabled !== false
      const r = computePayrollLine(gross, emp.nssf_enabled, s.nssf_ee_rate, s.nssf_er_rate, s.sdl_rate, 0, 0, advDed, payeOn, sdlOn, 0)
      return {
        empId: emp.id, name: emp.full_name, title: emp.job_title, code: emp.emp_code,
        contractType: emp.contract_type, gross, prorataNote: worked.note,
        nssfEnabled: emp.nssf_enabled, payeEnabled: payeOn, sdlEnabled: sdlOn,
        allowances: 0, deductions: 0, advanceDeduction: advDed, bonus: 0, notes: '',
        paye: r.paye, nssfEe: r.nssfEe, nssfEr: r.nssfEr, sdl: r.sdl, net: r.net, band: r.band,
      }
    })
    setLoadedPeriod(period)
    setLines(computed)
    setLoading(false)
  }

  const recalcLine = (i: number, newGross: number) => {
    const nl = [...lines]
    const line = nl[i]
    const r = computePayrollLine(newGross, line.nssfEnabled, settings.nssf_ee_rate, settings.nssf_er_rate, settings.sdl_rate, line.allowances, line.deductions, line.advanceDeduction, line.payeEnabled, line.sdlEnabled, line.bonus || 0)
    nl[i] = { ...line, gross: newGross, paye: r.paye, nssfEe: r.nssfEe, nssfEr: r.nssfEr, sdl: r.sdl, net: r.net, band: r.band }
    setLines(nl)
  }

  // Bonus is added on top of net (untaxed, Malkia policy). Re-run the line so
  // net reflects the new bonus; gross/PAYE/NSSF are unchanged by design.
  const setBonus = (i: number, newBonus: number) => {
    const nl = [...lines]
    const line = nl[i]
    const r = computePayrollLine(line.gross, line.nssfEnabled, settings.nssf_ee_rate, settings.nssf_er_rate, settings.sdl_rate, line.allowances, line.deductions, line.advanceDeduction, line.payeEnabled, line.sdlEnabled, newBonus)
    nl[i] = { ...line, bonus: newBonus, net: r.net }
    setLines(nl)
  }

  const totals = lines.reduce((acc, l) => ({
    gross: acc.gross + l.gross, paye: acc.paye + l.paye,
    nssfEe: acc.nssfEe + l.nssfEe, nssfEr: acc.nssfEr + l.nssfEr,
    sdl: acc.sdl + l.sdl, net: acc.net + l.net,
    advDed: acc.advDed + l.advanceDeduction, bonus: acc.bonus + (l.bonus || 0),
  }), { gross: 0, paye: 0, nssfEe: 0, nssfEr: 0, sdl: 0, net: 0, advDed: 0, bonus: 0 })

  const postPayroll = async () => {
    if (!canManage || isSelfMode || posting || loading || loadedPeriod !== period || !lines.length) return
    const negative = lines.find(line => line.net < 0)
    if (negative) {
      setToast(negative.name + ' has negative net pay. Review their deductions.')
      setToastType('error')
      return
    }
    if (previousRun && !window.confirm('Replace the posted payroll for ' + period +
      '? Its accounting entries will be reversed and the earlier payslips retained in history. Review any salaries or payslips already sent.')) return
    const payload = lines.map(l => ({
      employee_id: l.empId, gross: l.gross, paye: l.paye, nssf_ee: l.nssfEe, nssf_er: l.nssfEr,
      sdl: l.sdl, net_pay: l.net, advance_deduction: l.advanceDeduction, bonus: l.bonus || 0,
      notes: l.notes.trim() || null,
    }))
    const signature = JSON.stringify([period, previousRun, payload])
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() }
    setPosting(true)
    try {
      const { data: ref, error } = await supabase.rpc('post_hrm_payroll', {
        p_period: period, p_previous: previousRun, p_operation: operation.current.id, p_lines: payload,
      })
      if (error) throw error
      setToast('Payroll ' + period + ' posted as ' + ref)
      setToastType('success')
      await load()
    } catch (err) {
      setToast(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Could not confirm payroll posting. Recompute before retrying.')
      setToastType('error')
    } finally {
      setPosting(false)
    }
  }

  const downloadRegister = async (kind: 'preview' | 'posted') => {
    if (!canManage || isSelfMode || posting || exporting || loading || period !== loadedPeriod) return
    setExporting(true)
    try {
      if (kind === 'preview') {
        await exportPayroll(period, kind, lines)
        return
      }
      if (!previousRun) throw new Error('No posted payroll for this month.')
      const recorded: PayrollExportLine[] = []
      let reference = ''
      let expected = 0
      do {
        const result = await supabase.from('hrm_payroll_lines')
          .select('employee_id,gross,allowances,bonus,paye,nssf_ee,advance_deduction,deductions,net_pay,nssf_er,sdl,notes,employee:hrm_employees(emp_code,full_name),run:hrm_payroll_runs!inner(journal_ref)', { count: 'exact' })
          .eq('payroll_run_id', previousRun).eq('run.status', 'posted').eq('run.period', period)
          .order('id').range(recorded.length, recorded.length + 499)
        if (result.error) throw result.error
        if (!result.data?.length || result.count === null || (recorded.length && expected !== result.count)) {
          throw new Error('Posted payroll changed or is unavailable. Recompute and try again.')
        }
        expected = result.count
        for (const row of result.data) {
          const emp = Array.isArray(row.employee) ? row.employee[0] : row.employee
          const run = Array.isArray(row.run) ? row.run[0] : row.run
          reference = run?.journal_ref || ''
          recorded.push({
            code: emp?.emp_code || row.employee_id, name: emp?.full_name || '', gross: row.gross,
            allowances: row.allowances, bonus: row.bonus, paye: row.paye, nssfEe: row.nssf_ee,
            advanceDeduction: row.advance_deduction, deductions: row.deductions, net: row.net_pay,
            nssfEr: row.nssf_er, sdl: row.sdl, notes: row.notes,
          })
        }
      } while (recorded.length < expected)
      recorded.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code))
      await exportPayroll(period, kind, recorded, reference)
    } catch (error) {
      setToast(error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not export payroll. Please try again.')
      setToastType('error')
    } finally {
      setExporting(false)
    }
  }

  // Self mode: show only own line
  const displayLines = isSelfMode && linkedEmployeeId
    ? lines.filter(l => l.empId === linkedEmployeeId)
    : lines

  const bandColor = (b: string) => b === '30%' ? '#ef4444' : b === '25%' ? '#f59e0b' : b === '20%' ? '#3b82f6' : b === '8%' ? '#22c55e' : 'var(--text3)'
  const fmt = (n: number) => n.toLocaleString()

  const displayTotals = displayLines.reduce((acc, l) => ({
    gross: acc.gross + l.gross, paye: acc.paye + l.paye,
    nssfEe: acc.nssfEe + l.nssfEe, nssfEr: acc.nssfEr + l.nssfEr,
    sdl: acc.sdl + l.sdl, net: acc.net + l.net,
    advDed: acc.advDed + l.advanceDeduction, bonus: acc.bonus + (l.bonus || 0),
  }), { gross: 0, paye: 0, nssfEe: 0, nssfEr: 0, sdl: 0, net: 0, advDed: 0, bonus: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{isSelfMode ? 'My Payroll' : 'Payroll Run'}</div>
          <div className="page-sub">{isSelfMode ? 'Your salary breakdown' : `TRA 2024 PAYE bands · NSSF optional per employee · SDL ${settings.sdl_rate}% · Posting records salaries and deductions. Bank payments and WhatsApp delivery are separate.`}</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>
            <span>Month</span>
            <input type="month" disabled={posting || exporting} value={period} onChange={e => setPeriod(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', outline: 'none' }} />
          </div>
          <button className="btn btn-ghost btn-sm" disabled={posting || exporting} onClick={load}>Recompute</button>
          {!isSelfMode && canManage && <>
            <button className="btn btn-ghost btn-sm" disabled={loading || posting || exporting || loadedPeriod !== period || !lines.length}
              onClick={() => downloadRegister('preview')}>Export preview (.xlsx)</button>
            {previousRun && loadedPeriod === period && <button className="btn btn-ghost btn-sm" disabled={loading || posting || exporting}
              onClick={() => downloadRegister('posted')}>Export posted (.xlsx)</button>}
          </>}
          {canManage && <button className="btn btn-primary btn-sm" onClick={postPayroll} disabled={posting || exporting || loading || loadedPeriod !== period || !lines.length}>{posting ? 'Posting...' : 'Post Journal'}</button>}
        </div>
      </div>

      {/* PAYE Reference — hide in self mode */}
      {!isSelfMode && (
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', background: '#6366f108', border: '1px solid #6366f133' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Tanzania PAYE Bands 2024 (TRA) - Monthly</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
          <span>0-270K: <strong>0%</strong></span>
          <span>270K-520K: <strong>8%</strong></span>
          <span>520K-760K: <strong>20%</strong></span>
          <span>760K-1M: <strong>25%</strong></span>
          <span>Above 1M: <strong>30%</strong></span>
          <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>NSSF: Ee {settings.nssf_ee_rate}% + Er {settings.nssf_er_rate}% (when enrolled) · SDL: {settings.sdl_rate}%</span>
        </div>
      </div>
      )}

      {/* KPI Strip — hide in self mode */}
      {!isSelfMode && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,140px),1fr))', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#6366f1' }}>{loading ? '...' : fmt(displayTotals.gross)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Gross (TZS)</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #ef4444' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444' }}>{loading ? '...' : fmt(displayTotals.paye)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>PAYE</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{loading ? '...' : fmt(displayTotals.nssfEe)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Ee NSSF</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid var(--accent)' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{loading ? '...' : fmt(displayTotals.net)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Net Pay</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #a78bfa' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#a78bfa' }}>{loading ? '...' : fmt(displayTotals.nssfEr + displayTotals.sdl)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Er Costs</div></div>
      </div>
      )}

      {/* Payroll Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{isSelfMode ? `My Salary — ${period}` : `Employee Payroll - ${period}`}</div>
          {!isSelfMode && <div style={{ fontSize: 10, color: 'var(--text3)' }}>Edit gross to recalculate live</div>}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1000 }}>
              <thead><tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text3)' }}>EMPLOYEE</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: 'var(--text3)' }}>GROSS</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#ef4444' }}>PAYE</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#f59e0b' }}>NSSF Ee</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: 'var(--text3)' }}>Adv. Ded</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#22c55e' }}>BONUS</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: 'var(--accent)', fontWeight: 800 }}>NET PAY</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#a78bfa' }}>Er NSSF</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#a78bfa' }}>SDL</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, color: 'var(--text3)' }}>BAND</th>
              </tr></thead>
              <tbody>
                {displayLines.map((l, i) => (
                  <tr key={l.empId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}><div style={{ fontWeight: 700 }}>{l.name}</div>{l.prorataNote && <div style={{fontSize: 11, color: 'var(--accent)'}}>{l.prorataNote}</div>}<div style={{ fontSize: 10, color: 'var(--text3)' }}>{l.title} · {l.code}{!l.nssfEnabled ? ' · No NSSF' : ''}{!l.payeEnabled ? ' · No PAYE' : ''}{!l.sdlEnabled ? ' · No SDL' : ''}</div>
                      {!isSelfMode && (
                        <input
                          value={l.notes || ''}
                          onChange={e => { const nl = [...lines]; nl[i] = { ...nl[i], notes: e.target.value }; setLines(nl) }}
                          placeholder="Payslip note for this employee (optional)"
                          title="Printed on this employee's payslip as a note from HR"
                          style={{ marginTop: 5, width: 230, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 7px', borderRadius: 5, fontSize: 10.5 }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      {isSelfMode
                        ? <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt(l.gross)}</span>
                        : <input type="number" value={l.gross} onChange={e => recalcLine(i, parseFloat(e.target.value) || 0)} style={{ width: 110, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 5, fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right' }} />
                      }
                    </td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: '#ef4444' }}>{fmt(l.paye)}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: l.nssfEe > 0 ? '#f59e0b' : 'var(--text3)' }}>{l.nssfEe > 0 ? fmt(l.nssfEe) : '---'}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: l.advanceDeduction > 0 ? '#ef4444' : 'var(--text3)' }}>{l.advanceDeduction > 0 ? `(${fmt(l.advanceDeduction)})` : '---'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      {isSelfMode
                        ? <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: (l.bonus || 0) > 0 ? '#22c55e' : 'var(--text3)' }}>{(l.bonus || 0) > 0 ? fmt(l.bonus) : '---'}</span>
                        : <input type="number" value={l.bonus || 0} onChange={e => setBonus(i, parseFloat(e.target.value) || 0)} style={{ width: 100, background: 'var(--surface2)', border: '1px solid var(--border)', color: (l.bonus || 0) > 0 ? '#22c55e' : 'var(--text)', padding: '5px 8px', borderRadius: 5, fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right' }} />}
                    </td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--accent)' }}>{fmt(l.net)}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: l.nssfEr > 0 ? '#a78bfa' : 'var(--text3)' }}>{l.nssfEr > 0 ? fmt(l.nssfEr) : '---'}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: '#a78bfa' }}>{fmt(l.sdl)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}><span style={{ fontSize: 10, background: `${bandColor(l.band)}22`, color: bandColor(l.band), padding: '2px 8px', borderRadius: 4 }}>{l.band}</span></td>
                  </tr>
                ))}
              </tbody>
              {!isSelfMode && (
              <tfoot>
                <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 800, fontSize: 12 }}>TOTALS</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800 }}>{fmt(totals.gross)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#ef4444' }}>{fmt(totals.paye)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#f59e0b' }}>{fmt(totals.nssfEe)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#ef4444' }}>{totals.advDed > 0 ? `(${fmt(totals.advDed)})` : '---'}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#22c55e' }}>{totals.bonus > 0 ? fmt(totals.bonus) : '---'}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--accent)' }}>{fmt(totals.net)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#a78bfa' }}>{fmt(totals.nssfEr)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#a78bfa' }}>{fmt(totals.sdl)}</td>
                  <td></td>
                </tr>
              </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
