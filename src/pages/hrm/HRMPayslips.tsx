import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { getActiveCompany } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps } from './hrmTypes'
import { DEPT_COLORS } from './hrmTypes'

declare const window: any

// ── jsPDF loader (CDN, cached after first load) ──────────
let jsPDFLoaded = false
const loadJsPDF = (): Promise<void> => {
  if (jsPDFLoaded && window.jspdf) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js'
    s.onload = () => { jsPDFLoaded = true; resolve() }
    s.onerror = () => reject(new Error('Failed to load jsPDF'))
    document.head.appendChild(s)
  })
}

interface PayslipData {
  id: string
  gross: number
  allowances: number
  deductions: number
  advance_deduction: number
  paye: number
  nssf_ee: number
  nssf_er: number
  sdl: number
  net_pay: number
  payslip_sent: boolean
  employee: {
    id: string
    full_name: string
    initials: string
    emp_code: string
    job_title: string
    department: string
    contract_type: string
    bank_name: string | null
    bank_account: string | null
    nssf_number: string | null
    tin_number: string | null
  }
}

export default function HRMPayslips({ onNav, hrmMode = 'company', linkedEmployeeId }: HRMProps) {
  const isSelfMode = hrmMode === 'self'
  const [lines, setLines] = useState<PayslipData[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [generating, setGenerating] = useState<string | null>(null)

  useEffect(() => { load() }, [period])

  const load = async () => {
    setLoading(true)
    const { data: runs } = await supabase.from('hrm_payroll_runs').select('id').eq('period', period).order('created_at', { ascending: false }).limit(1)
    if (!runs || runs.length === 0) { setLines([]); setLoading(false); return }
    let query = supabase.from('hrm_payroll_lines')
      .select('*, employee:hrm_employees(id, full_name, initials, emp_code, job_title, department, contract_type, bank_name, bank_account, nssf_number, tin_number)')
      .eq('payroll_run_id', runs[0].id)
    if (isSelfMode && linkedEmployeeId) {
      query = query.eq('employee_id', linkedEmployeeId)
    }
    const { data } = await query
    setLines((data || []) as PayslipData[])
    setLoading(false)
  }

  const fmt = (n: number) => (n || 0).toLocaleString()
  const company = getActiveCompany()

  // ── PDF GENERATION ─────────────────────────────────────
  const generatePayslipPDF = useCallback(async (slip: PayslipData) => {
    await loadJsPDF()
    const { jsPDF } = window.jspdf
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const emp = slip.employee
    const w = 210
    const periodLabel = new Date(period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    // Colors
    const accent = [99, 102, 241]   // #6366f1
    const dark = [30, 30, 30]
    const gray = [120, 120, 120]
    const lightBg = [245, 245, 250]

    // ── HEADER BAR ───────────────────────
    doc.setFillColor(...accent)
    doc.rect(0, 0, w, 36, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(company.name, 15, 16)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('PAYSLIP', 15, 24)
    doc.text(periodLabel, 15, 30)
    doc.setFontSize(9)
    doc.text(`Ref: PAY-${period.replace('-', '')}`, w - 15, 16, { align: 'right' })
    doc.text(`Printed: ${new Date().toLocaleDateString('en-GB')}`, w - 15, 22, { align: 'right' })
    doc.text('CONFIDENTIAL', w - 15, 30, { align: 'right' })

    // ── EMPLOYEE INFO BOX ────────────────
    let y = 44
    doc.setFillColor(...lightBg)
    doc.roundedRect(15, y, w - 30, 30, 3, 3, 'F')
    doc.setTextColor(...dark)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(emp.full_name, 22, y + 9)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...gray)
    doc.text(`${emp.emp_code}  ·  ${emp.job_title}  ·  ${emp.department}`, 22, y + 16)
    const bankInfo = [emp.bank_name, emp.bank_account].filter(Boolean).join(' · ') || 'No bank on file'
    const taxInfo = [emp.tin_number ? `TIN: ${emp.tin_number}` : null, emp.nssf_number ? `NSSF: ${emp.nssf_number}` : null].filter(Boolean).join('  ·  ') || ''
    doc.text(`Bank: ${bankInfo}${taxInfo ? '  ·  ' + taxInfo : ''}`, 22, y + 23)

    // ── EARNINGS TABLE ───────────────────
    y = 82
    doc.setTextColor(...accent)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('EARNINGS', 15, y)
    y += 6
    doc.setDrawColor(220, 220, 220)
    doc.line(15, y, w - 15, y)
    y += 6

    const earningsRows: [string, number][] = [
      ['Basic Salary', slip.gross],
    ]
    if (slip.allowances > 0) earningsRows.push(['Allowances', slip.allowances])

    doc.setTextColor(...dark)
    doc.setFontSize(10)
    for (const [label, val] of earningsRows) {
      doc.setFont('helvetica', 'normal')
      doc.text(label, 20, y)
      doc.setFont('helvetica', 'bold')
      doc.text(`TZS ${val.toLocaleString()}`, w - 20, y, { align: 'right' })
      y += 7
    }

    // Total Earnings
    doc.setDrawColor(...accent)
    doc.line(15, y, w - 15, y)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...accent)
    doc.text('Total Earnings', 20, y)
    const totalEarnings = slip.gross + slip.allowances
    doc.text(`TZS ${totalEarnings.toLocaleString()}`, w - 20, y, { align: 'right' })

    // ── DEDUCTIONS TABLE ─────────────────
    y += 14
    doc.setTextColor([239, 68, 68] as any)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('DEDUCTIONS', 15, y)
    y += 6
    doc.setDrawColor(220, 220, 220)
    doc.line(15, y, w - 15, y)
    y += 6

    const dedRows: [string, number][] = []
    if (slip.paye > 0) dedRows.push(['PAYE (Income Tax)', slip.paye])
    if (slip.nssf_ee > 0) dedRows.push(['NSSF (Employee 10%)', slip.nssf_ee])
    if (slip.deductions > 0) dedRows.push(['Other Deductions', slip.deductions])
    if (slip.advance_deduction > 0) dedRows.push(['Salary Advance Recovery', slip.advance_deduction])

    doc.setTextColor(...dark)
    doc.setFontSize(10)
    for (const [label, val] of dedRows) {
      doc.setFont('helvetica', 'normal')
      doc.text(label, 20, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(239, 68, 68)
      doc.text(`(TZS ${val.toLocaleString()})`, w - 20, y, { align: 'right' })
      doc.setTextColor(...dark)
      y += 7
    }

    if (dedRows.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...gray)
      doc.text('No deductions', 20, y)
      y += 7
    }

    const totalDed = slip.paye + slip.nssf_ee + slip.deductions + slip.advance_deduction
    doc.setDrawColor(239, 68, 68)
    doc.line(15, y, w - 15, y)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(239, 68, 68)
    doc.text('Total Deductions', 20, y)
    doc.text(`(TZS ${totalDed.toLocaleString()})`, w - 20, y, { align: 'right' })

    // ── NET PAY BOX ──────────────────────
    y += 12
    doc.setFillColor(...accent)
    doc.roundedRect(15, y, w - 30, 18, 3, 3, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('NET PAY', 22, y + 12)
    doc.setFontSize(14)
    doc.text(`TZS ${slip.net_pay.toLocaleString()}`, w - 22, y + 12, { align: 'right' })

    // ── EMPLOYER COSTS (info) ────────────
    y += 28
    doc.setTextColor(...gray)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const erCosts = []
    if (slip.nssf_er > 0) erCosts.push(`NSSF Employer: TZS ${slip.nssf_er.toLocaleString()}`)
    if (slip.sdl > 0) erCosts.push(`SDL: TZS ${slip.sdl.toLocaleString()}`)
    if (erCosts.length > 0) {
      doc.text(`Employer contributions (not deducted from salary): ${erCosts.join(' · ')}`, 15, y)
      y += 5
    }

    // ── FOOTER ───────────────────────────
    y = 275
    doc.setDrawColor(220, 220, 220)
    doc.line(15, y, w - 15, y)
    y += 5
    doc.setTextColor(...gray)
    doc.setFontSize(7)
    doc.text(`${company.name} · This is a computer-generated payslip and does not require a signature.`, w / 2, y, { align: 'center' })
    doc.text(`Generated by MalkiaOS · ${new Date().toISOString()}`, w / 2, y + 4, { align: 'center' })

    return doc
  }, [period, company])

  const downloadOne = async (slip: PayslipData) => {
    setGenerating(slip.id)
    try {
      const doc = await generatePayslipPDF(slip)
      doc.save(`Payslip_${slip.employee.emp_code}_${period}.pdf`)
      setToast(`Payslip downloaded for ${slip.employee.full_name}`)
      setToastType('success')
    } catch (err: any) {
      setToast(err.message || 'PDF generation failed'); setToastType('error')
    }
    setGenerating(null)
  }

  const downloadAll = async () => {
    setGenerating('all')
    try {
      await loadJsPDF()
      for (const slip of lines) {
        const doc = await generatePayslipPDF(slip)
        doc.save(`Payslip_${slip.employee.emp_code}_${period}.pdf`)
      }
      setToast(`${lines.length} payslips downloaded`)
      setToastType('success')
    } catch (err: any) {
      setToast(err.message || 'Bulk download failed'); setToastType('error')
    }
    setGenerating(null)
  }

  // Totals
  const totals = lines.reduce((acc, l) => ({
    gross: acc.gross + l.gross, paye: acc.paye + l.paye,
    nssf: acc.nssf + l.nssf_ee, net: acc.net + l.net_pay,
  }), { gross: 0, paye: 0, nssf: 0, net: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">{isSelfMode ? 'My Payslips' : 'Payslips'}</div><div className="page-sub">{isSelfMode ? 'Your monthly payslip PDFs' : 'Auto-generated from payroll run · PDF download per employee or bulk'}</div></div>
        <div className="page-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>
            <span>Month</span>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', outline: 'none' }} />
          </div>
          {lines.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={downloadAll} disabled={generating === 'all'}>
              {generating === 'all' ? 'Generating...' : `Download All (${lines.length})`}
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {lines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#6366f1' }}>{fmt(totals.gross)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Gross</div></div>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #ef4444' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444' }}>{fmt(totals.paye)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total PAYE</div></div>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{fmt(totals.nssf)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total NSSF</div></div>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid var(--accent)' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{fmt(totals.net)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Net Pay</div></div>
        </div>
      )}

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
          {lines.map((l) => {
            const emp = l.employee
            const color = DEPT_COLORS[emp?.department] || '#6366f1'
            return (
              <div key={l.id} className="card" style={{ borderTop: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{emp?.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{emp?.emp_code} · {emp?.job_title} · {period}</div>
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
                <button onClick={() => downloadOne(l)} disabled={generating === l.id} style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {generating === l.id ? 'Generating...' : 'Download PDF'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
