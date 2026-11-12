// ════════════════════════════════════════════════════════════════════════════
// HRMPayslips.tsx
//
// Generates and downloads payslip PDFs. Two big changes from the previous
// version:
//
// 1. jsPDF is now bundled via npm (`import { jsPDF } from 'jspdf'`) instead of
//    being lazy-loaded from cdnjs. The CDN loader was the source of the
//    "Failed to load jsPDF" toast users were seeing — Vercel's CSP and ad
//    blockers occasionally blocked the script tag. Bundling removes that
//    failure mode entirely.
//
// 2. The PDF is redesigned to follow the Malkia Maternity voice — deep teal
//    accent, soft layout, "Reimagining Motherhood" footer. All visual choices
//    are pulled from the payslip_template config in system_settings, so the
//    super admin can tune logo, colors, toggles, and footer text without
//    touching code (see HRMPayslipTemplate page).
//
// New features:
//   • Logo at the top of the header (URL configurable, with size + position)
//   • Year-to-date totals column (gross, PAYE, NSSF, net) — pulled by
//     querying earlier payroll runs in the same fiscal year (April → March)
//   • Per-employee notes — editable on each card, saved to hrm_payroll_lines.notes,
//     printed on the payslip when the toggle is on
//   • Optional signature block, employer-cost section, advance-recovery detail
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { jsPDF } from 'jspdf'
import { supabase, getActiveCompany } from '../../lib/supabase'
import Toast from '../../components/Toast'
import { sendWhatsAppPayslip } from '../../lib/wa'
import {
  loadPayslipTemplate,
  hexToRgb,
  logoToDataUrl,
  type PayslipTemplate,
} from '../../lib/payslipTemplate'
import type { HRMProps } from './hrmTypes'
import { DEPT_COLORS } from './hrmTypes'

interface PayslipData {
  id: string
  gross: number
  allowances: number
  deductions: number
  advance_deduction: number
  bonus: number
  paye: number
  nssf_ee: number
  nssf_er: number
  sdl: number
  net_pay: number
  payslip_sent: boolean
  payslip_wa_message_id?: string | null
  notes: string | null
  employee: {
    id: string
    whatsapp?: string | null
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

// Year-to-date totals — summed from earlier payroll runs in the same FY.
interface YTD { gross: number; paye: number; nssf: number; net: number }

// ─── Fiscal year helpers ─────────────────────────────────────────────────
// Tanzania convention: FY runs April 1 → March 31. So if the period is
// "2026-08", the FY started "2026-04". If period is "2026-02", the FY
// started "2025-04". Used to bound the YTD query.
function fyStartFromPeriod(period: string): string {
  const [yStr, mStr] = period.split('-')
  const y = parseInt(yStr); const m = parseInt(mStr)
  const fyStartYear = m >= 4 ? y : y - 1
  return `${fyStartYear}-04`
}

export default function HRMPayslips({ onNav, hrmMode = 'company', linkedEmployeeId }: HRMProps) {
  const isSelfMode = hrmMode === 'self'
  const [lines, setLines] = useState<PayslipData[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [generating, setGenerating] = useState<string | null>(null)
  // YTD by employee id, computed once per period change.
  const [ytdByEmp, setYtdByEmp] = useState<Record<string, YTD>>({})
  const [leaveByEmp, setLeaveByEmp] = useState<Record<string, any>>({})
  const [waStatus, setWaStatus] = useState<Record<string, { status: string; error: string | null }>>({})
  const [sending, setSending] = useState<string | null>(null)
  // Notes draft state — a tiny edit buffer keyed by line.id.
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)
  // Cached template + logo data URL — loaded once per page mount, refreshed
  // whenever the user opens the template settings page and comes back.
  const [template, setTemplate] = useState<PayslipTemplate | null>(null)
  const [logoData, setLogoData] = useState<{ dataUrl: string; width: number; height: number } | null>(null)

  useEffect(() => { load() }, [period])
  useEffect(() => { reloadTemplate() }, [])

  const reloadTemplate = useCallback(async () => {
    const t = await loadPayslipTemplate()
    setTemplate(t)
    if (t.logoUrl) {
      const ld = await logoToDataUrl(t.logoUrl)
      setLogoData(ld)
    } else {
      setLogoData(null)
    }
  }, [])

  const load = async () => {
    setLoading(true)
    const { data: runs } = await supabase
      .from('hrm_payroll_runs').select('id').eq('period', period)
      .order('created_at', { ascending: false }).limit(1)

    if (!runs || runs.length === 0) { setLines([]); setYtdByEmp({}); setLoading(false); return }

    let query = supabase.from('hrm_payroll_lines')
      .select('id, gross, allowances, deductions, advance_deduction, bonus, paye, nssf_ee, nssf_er, sdl, net_pay, payslip_sent, payslip_wa_message_id, notes, employee:hrm_employees(id, whatsapp, full_name, initials, emp_code, job_title, department, contract_type, bank_name, bank_account, nssf_number, tin_number)')
      .eq('payroll_run_id', runs[0].id)
    if (isSelfMode && linkedEmployeeId) {
      query = query.eq('employee_id', linkedEmployeeId)
    }
    const { data, error: loadErr } = await query
    if (loadErr) {
      // Never swallow this: a failed query used to look exactly like "no payslips".
      setToast('Could not load payslips: ' + loadErr.message); setToastType('error')
    }
    const slips = (data || []) as unknown as PayslipData[]
    setLines(slips)

    // Real delivery state for slips already sent over WhatsApp (from wa_messages)
    const msgIds = slips.map(sl => sl.payslip_wa_message_id).filter(Boolean) as string[]
    if (msgIds.length > 0) {
      const { data: msgs } = await supabase.from('wa_messages').select('id, status, error').in('id', msgIds)
      const st: Record<string, { status: string; error: string | null }> = {}
      ;(msgs || []).forEach((m: any) => { st[m.id] = { status: m.status, error: m.error } })
      setWaStatus(st)
    } else {
      setWaStatus({})
    }

    // Initialise the notes draft buffer from the loaded values
    const draft: Record<string, string> = {}
    slips.forEach(s => { draft[s.id] = s.notes || '' })
    setNotesDraft(draft)

    // Compute YTD per employee — only if we have any slips on screen
    if (slips.length > 0) {
      const fyStart = fyStartFromPeriod(period)
      const empIds = slips.map(s => s.employee.id)
      // Bound the query: all payroll lines for this employee where the run
      // period is between fyStart and current period (inclusive).
      const { data: ytdRows } = await supabase
        .from('hrm_payroll_lines')
        .select('employee_id, gross, paye, nssf_ee, net_pay, hrm_payroll_runs!inner(period)')
        .in('employee_id', empIds)
        .gte('hrm_payroll_runs.period', fyStart)
        .lte('hrm_payroll_runs.period', period)

      const acc: Record<string, YTD> = {}
      ;(ytdRows || []).forEach((r: any) => {
        const id = r.employee_id
        if (!acc[id]) acc[id] = { gross: 0, paye: 0, nssf: 0, net: 0 }
        acc[id].gross += r.gross || 0
        acc[id].paye += r.paye || 0
        acc[id].nssf += r.nssf_ee || 0
        acc[id].net += r.net_pay || 0
      })
      setYtdByEmp(acc)

      // Leave balances for the leave strip. fiscal_year is free text, so take
      // the row for this fiscal year when one exists, otherwise the latest row.
      const fyYear = fyStart.slice(0, 4)
      const { data: lvRows } = await supabase
        .from('hrm_leave_balances')
        .select('employee_id, fiscal_year, annual_entitlement, annual_taken, annual_pending, sick_entitlement, sick_taken')
        .in('employee_id', empIds)
      const lv: Record<string, any> = {}
      ;[...(lvRows || [])]
        .sort((a: any, b: any) => String(a.fiscal_year || '').localeCompare(String(b.fiscal_year || '')))
        .forEach((r: any) => {
          const cur = lv[r.employee_id]
          if (!cur || !String(cur.fiscal_year || '').includes(fyYear)) lv[r.employee_id] = r
        })
      setLeaveByEmp(lv)
    }
    setLoading(false)
  }

  const fmt = (n: number) => (n || 0).toLocaleString()
  // Payslips always carry the group trademark, never a legal entity name.
  // Salaries are paid by Malkia Wellness Group Ltd and some staff are hired by
  // Malkia Brands Ltd (refunded later); to spare employees that confusion the
  // payslip shows only the "Malkia Maternity Group" trademark. Invoices and
  // receipts are unaffected — they keep their legal entity name.
  const company = { ...getActiveCompany(), name: 'Malkia Maternity Group' }

  // ─── Notes editing ────────────────────────────────────────────────
  const saveNote = async (lineId: string) => {
    setSavingNote(lineId)
    const newValue = (notesDraft[lineId] || '').trim() || null
    const { error } = await supabase
      .from('hrm_payroll_lines').update({ notes: newValue }).eq('id', lineId)
    setSavingNote(null)
    if (error) {
      setToast('Failed to save note: ' + error.message); setToastType('error'); return
    }
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, notes: newValue } : l))
    setToast('Note saved'); setToastType('success')
  }

  // ─── PDF GENERATION ───────────────────────────────────────────────
  const generatePayslipPDF = useCallback(async (slip: PayslipData) => {
    if (!template) throw new Error('Template not loaded')

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const emp = slip.employee
    const w = 210
    const periodLabel = new Date(period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const accent = hexToRgb(template.accentColor)
    const secondary = hexToRgb(template.secondaryColor)
    const dark: [number, number, number] = [30, 30, 30]
    const gray: [number, number, number] = [120, 120, 120]
    const lightBg: [number, number, number] = [248, 250, 252]
    const veryLight: [number, number, number] = [236, 245, 244]
    // Soft tint of accent for the YTD strip — built by lightening accent
    // toward white. Same hue, gentler weight.
    const accentSoft: [number, number, number] = [
      Math.round(accent[0] + (255 - accent[0]) * 0.85),
      Math.round(accent[1] + (255 - accent[1]) * 0.85),
      Math.round(accent[2] + (255 - accent[2]) * 0.85),
    ]

    // ── HEADER ───────────────────────────────────────────────────────
    // Solid teal band with the white brand mark on the left and white text,
    // matching the sales-invoice identity so documents read as one set.
    const white: [number, number, number] = [255, 255, 255]
    const accentLightText: [number, number, number] = [
      Math.round(accent[0] + (255 - accent[0]) * 0.7),
      Math.round(accent[1] + (255 - accent[1]) * 0.7),
      Math.round(accent[2] + (255 - accent[2]) * 0.7),
    ]
    const headerH = 40
    doc.setFillColor(...accent)
    doc.rect(0, 0, w, headerH, 'F')

    // White mark on the left, sized to the band. The logo stored in the
    // payslip template is the white mark on transparent, so it reads on teal.
    let textStartX = 15
    if (logoData) {
      let logoW = template.logoWidthMm
      let logoH = (logoData.height / logoData.width) * logoW
      // A tall mark must never overflow the band: fit it to the header height.
      const maxLogoH = headerH - 8
      if (logoH > maxLogoH) { logoW = logoW * (maxLogoH / logoH); logoH = maxLogoH }
      const logoY = (headerH - logoH) / 2
      try {
        doc.addImage(logoData.dataUrl, 'PNG', 15, logoY, logoW, logoH)
      } catch { /* bad data URL — text-only fallback */ }
      textStartX = 15 + logoW + 8
    }

    // Company name + tagline in white
    {
      doc.setTextColor(...white)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(company.name, textStartX, 18)
      if (template.headerTagline) {
        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...accentLightText)
        doc.text(template.headerTagline, textStartX, 24)
      }
    }

    // Right-side meta (PAYSLIP / period / ref) in white on the teal band.
    {
      doc.setTextColor(...accentLightText)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('PAYSLIP', w - 15, 15, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...white)
      doc.setFontSize(11)
      doc.text(periodLabel.toUpperCase(), w - 15, 21, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...accentLightText)
      doc.setFontSize(7.5)
      doc.text(`Ref: PAY-${period.replace('-', '')}`, w - 15, 26, { align: 'right' })
      doc.text(`Issued: ${new Date().toLocaleDateString('en-GB')}`, w - 15, 30, { align: 'right' })
    }

    // ── EMPLOYEE CARD ────────────────────────────────────────────────
    let y = headerH + 10
    doc.setFillColor(...lightBg)
    doc.roundedRect(15, y, w - 30, 30, 3, 3, 'F')
    // Department dot — uses the same colour palette as the on-screen card
    // for visual continuity.
    const deptColor = hexToRgb(DEPT_COLORS[emp.department] || template.accentColor)
    doc.setFillColor(...deptColor)
    doc.circle(22, y + 8, 2, 'F')

    doc.setTextColor(...dark)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(emp.full_name, 27, y + 9)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...gray)
    doc.text(`${emp.emp_code}  ·  ${emp.job_title}  ·  ${emp.department}`, 27, y + 15)
    const bankInfo = [emp.bank_name, emp.bank_account].filter(Boolean).join(' · ') || 'Cash'
    doc.text(`Bank: ${bankInfo}`, 27, y + 21)
    const taxInfo = [
      emp.tin_number ? `TIN ${emp.tin_number}` : null,
      emp.nssf_number ? `NSSF ${String(emp.nssf_number).replace(/^\s*NSSF[\s\-:]*/i, '')}` : null,
    ].filter(Boolean).join('  ·  ')
    if (taxInfo) doc.text(taxInfo, 27, y + 26.5)

    y += 38

    // ── EARNINGS / DEDUCTIONS — TWO-COLUMN LAYOUT ───────────────────
    // Two side-by-side blocks, then a unified totals strip below. This
    // is more scannable than the old single-column stack and reads
    // naturally on a 1-page A4.
    const colW = (w - 30 - 6) / 2  // total width minus margins minus 6mm gap
    const leftX = 15
    const rightX = leftX + colW + 6
    const blockY = y

    // Left: EARNINGS
    doc.setTextColor(...accent); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
    doc.text('EARNINGS', leftX, blockY)
    doc.setDrawColor(...accent); doc.setLineWidth(0.6)
    doc.line(leftX, blockY + 1.8, leftX + colW, blockY + 1.8)

    let ly = blockY + 8
    const earningsRows: [string, number][] = [['Basic Salary', slip.gross]]
    if (slip.allowances > 0) earningsRows.push(['Allowances', slip.allowances])
    if (slip.bonus > 0) earningsRows.push(['Bonus (untaxed)', slip.bonus])

    doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(9.5)
    for (const [label, val] of earningsRows) {
      doc.text(label, leftX, ly)
      doc.setFont('helvetica', 'bold')
      doc.text(val.toLocaleString(), leftX + colW, ly, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      ly += 6.5
    }
    const totalEarnings = slip.gross + slip.allowances + (slip.bonus || 0)
    doc.setDrawColor(...gray); doc.setLineWidth(0.2)
    doc.line(leftX, ly - 2, leftX + colW, ly - 2)
    ly += 1
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent); doc.setFontSize(10)
    doc.text('Total Earnings', leftX, ly + 3)
    doc.text(totalEarnings.toLocaleString(), leftX + colW, ly + 3, { align: 'right' })
    const earningsBlockEnd = ly + 4

    // Right: DEDUCTIONS
    doc.setTextColor(220, 38, 38); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
    doc.text('DEDUCTIONS', rightX, blockY)
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.6)
    doc.line(rightX, blockY + 1.8, rightX + colW, blockY + 1.8)

    let ry = blockY + 8
    const dedRows: [string, number][] = []
    if (slip.paye > 0) dedRows.push(['PAYE (Income Tax)', slip.paye])
    if (slip.nssf_ee > 0) dedRows.push(['NSSF (Employee 10%)', slip.nssf_ee])
    if (slip.deductions > 0) dedRows.push(['Other Deductions', slip.deductions])
    if (template.showAdvanceDetail && slip.advance_deduction > 0) dedRows.push(['Salary Advance Recovery', slip.advance_deduction])

    doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(9.5)
    if (dedRows.length === 0) {
      doc.setTextColor(...gray); doc.setFont('helvetica', 'italic')
      doc.text('No deductions this period', rightX, ry)
      ry += 6.5
    } else {
      for (const [label, val] of dedRows) {
        doc.text(label, rightX, ry)
        doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38)
        doc.text(val.toLocaleString(), rightX + colW, ry, { align: 'right' })
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark)
        ry += 6.5
      }
    }
    const totalDed = slip.paye + slip.nssf_ee + slip.deductions + slip.advance_deduction
    doc.setDrawColor(...gray); doc.setLineWidth(0.2)
    doc.line(rightX, ry - 2, rightX + colW, ry - 2)
    ry += 1
    doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38); doc.setFontSize(10)
    doc.text('Total Deductions', rightX, ry + 3)
    doc.text(totalDed.toLocaleString(), rightX + colW, ry + 3, { align: 'right' })
    const dedBlockEnd = ry + 4

    y = Math.max(earningsBlockEnd, dedBlockEnd) + 8

    // ── NET PAY HERO ─────────────────────────────────────────────────
    // Big rounded bar in the accent colour. The number that matters most.
    doc.setFillColor(...accent)
    doc.roundedRect(15, y, w - 30, 22, 4, 4, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('NET PAY', 22, y + 9)
    doc.setFontSize(20); doc.setFont('helvetica', 'bold')
    doc.text(`TZS ${slip.net_pay.toLocaleString()}`, w - 22, y + 14, { align: 'right' })
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
    doc.text(`for ${periodLabel}`, 22, y + 16)

    y += 26

    // ── TAKE-HOME BREAKDOWN BAR ─────────────────────────────────────
    // Stacked proportion bar over total earnings (incl. bonus): what the
    // employee keeps vs what was deducted, at a glance.
    {
      const barTotal = slip.gross + slip.allowances + (slip.bonus || 0)
      if (barTotal > 0) {
        const segs: [string, number, [number, number, number]][] = [
          ['Net', slip.net_pay, accent],
          ['PAYE', slip.paye, [220, 38, 38]],
          ['NSSF', slip.nssf_ee, [245, 158, 11]],
          ['Other', slip.deductions + slip.advance_deduction, [120, 120, 120]],
        ].filter(s => (s[1] as number) > 0) as [string, number, [number, number, number]][]
        const barX = 15, barW = w - 30, barH = 5
        let sx = barX
        for (const [, val, col] of segs) {
          const sw = barW * (val / barTotal)
          doc.setFillColor(...col)
          doc.roundedRect(sx, y, Math.max(sw, 1), barH, 1, 1, 'F')
          sx += sw
        }
        y += barH + 4
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
        let lx = barX
        for (const [label, val, col] of segs) {
          doc.setFillColor(...col); doc.circle(lx + 1, y - 0.8, 1, 'F')
          doc.setTextColor(...gray)
          const txt = `${label} ${Math.round((val / barTotal) * 100)}%`
          doc.text(txt, lx + 3.5, y)
          lx += doc.getTextWidth(txt) + 10
        }
        y += 6
      }
    }

    // ── YTD + LEAVE: side-by-side strips ────────────────────────────
    {
      const stripW = (w - 30 - 6) / 2
      const stripH = 22
      // YTD (left)
      if (template.showYTD) {
        const ytd = ytdByEmp[emp.id] || { gross: slip.gross, paye: slip.paye, nssf: slip.nssf_ee, net: slip.net_pay }
        doc.setFillColor(...accentSoft)
        doc.roundedRect(15, y, leaveByEmp[emp.id] ? stripW : w - 30, stripH, 3, 3, 'F')
        doc.setTextColor(...accent); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
        doc.text('YEAR-TO-DATE', 20, y + 5)
        doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
        doc.text(`Since ${fyStartFromPeriod(period).replace('-', '/')}`, 20, y + 9)
        doc.setFontSize(7); doc.setTextColor(...gray); doc.text('Gross', 20, y + 15)
        doc.setTextColor(...accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(ytd.gross.toLocaleString(), 20, y + 20)
        doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text('Net', 20 + stripW / 2, y + 15)
        doc.setTextColor(...accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(ytd.net.toLocaleString(), 20 + stripW / 2, y + 20)
      }
      // Leave (right) — only if we have a balance row
      const lv = leaveByEmp[emp.id]
      if (lv) {
        const lvX = 15 + stripW + 6
        const annualLeft = (lv.annual_entitlement || 0) - (lv.annual_taken || 0) - (lv.annual_pending || 0)
        const sickLeft = (lv.sick_entitlement || 0) - (lv.sick_taken || 0)
        doc.setFillColor(...veryLight)
        doc.roundedRect(lvX, y, stripW, stripH, 3, 3, 'F')
        doc.setTextColor(...secondary); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
        doc.text('LEAVE BALANCE', lvX + 5, y + 5)
        doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
        doc.text(`FY ${String(lv.fiscal_year || '').replace(/^FY\s*/i, '')}`, lvX + 5, y + 9)
        doc.setFontSize(7); doc.setTextColor(...gray); doc.text('Annual', lvX + 5, y + 15)
        doc.setTextColor(...dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`${annualLeft} / ${lv.annual_entitlement || 0} days`, lvX + 5, y + 20)
        doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text('Sick', lvX + stripW / 2, y + 15)
        doc.setTextColor(...dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`${sickLeft} / ${lv.sick_entitlement || 0} days`, lvX + stripW / 2, y + 20)
      }
      if (template.showYTD || lv) y += stripH + 6
    }

    // ── EMPLOYER COSTS (info) ───────────────────────────────────────
    if (template.showEmployerCosts) {
      const erParts: string[] = []
      if (slip.nssf_er > 0) erParts.push(`NSSF Employer ${slip.nssf_er.toLocaleString()}`)
      if (slip.sdl > 0) erParts.push(`SDL ${slip.sdl.toLocaleString()}`)
      if (erParts.length > 0) {
        doc.setFillColor(...veryLight)
        doc.roundedRect(15, y, w - 30, 9, 2, 2, 'F')
        doc.setTextColor(...secondary); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
        doc.text('EMPLOYER CONTRIBUTIONS', 20, y + 4)
        doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
        doc.text(erParts.join('  ·  '), 20, y + 7.5)
        doc.setTextColor(...gray); doc.setFontSize(6)
        doc.text('(paid by employer, not deducted from your salary)', w - 20, y + 7.5, { align: 'right' })
        y += 14
      }
    }

    // ── EMPLOYEE NOTES ──────────────────────────────────────────────
    // Free-form per-period note set by HR. Wrapped to 80 chars/line.
    if (template.showEmployeeNotes && slip.notes && slip.notes.trim()) {
      const noteLines = doc.splitTextToSize(slip.notes.trim(), w - 40)
      const noteH = noteLines.length * 4.5 + 10
      doc.setFillColor(...veryLight)
      doc.roundedRect(15, y, w - 30, noteH, 2, 2, 'F')
      doc.setTextColor(...secondary); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
      doc.text('NOTE FROM HR', 20, y + 4.5)
      doc.setTextColor(...dark); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
      doc.text(noteLines, 20, y + 9.5)
      y += noteH + 4
    }

    // ── SIGNATURE BLOCK ─────────────────────────────────────────────
    if (template.showSignatureBlock) {
      const sigY = Math.max(y, 245)
      doc.setDrawColor(...gray); doc.setLineWidth(0.2)
      doc.line(20, sigY + 10, 80, sigY + 10)
      doc.line(w - 80, sigY + 10, w - 20, sigY + 10)
      doc.setTextColor(...gray); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
      doc.text('Prepared by', 20, sigY + 14)
      doc.text('Received by employee', w - 80, sigY + 14)
      y = sigY + 18
    }

    // ── APPRECIATION LINE ───────────────────────────────────────────
    // Warm note to the employee, kept on the PDF (not the WhatsApp caption)
    // so it stays private to the person reading their own slip.
    doc.setTextColor(...accent); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
    doc.text('Tunajivunia kuwa na wewe katika timu ya Malkia. Asante.', w / 2, Math.min(y + 6, 276), { align: 'center' })

    // ── FOOTER ──────────────────────────────────────────────────────
    const footerY = 280
    doc.setDrawColor(...accent); doc.setLineWidth(0.3)
    doc.line(15, footerY, w - 15, footerY)
    if (template.footerTagline) {
      doc.setTextColor(...accent); doc.setFontSize(8); doc.setFont('helvetica', 'italic')
      doc.text(template.footerTagline, w / 2, footerY + 5, { align: 'center' })
    }
    if (template.footerSmallPrint) {
      doc.setTextColor(...gray); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
      const smallLines = doc.splitTextToSize(template.footerSmallPrint, w - 30)
      doc.text(smallLines, w / 2, footerY + 9, { align: 'center' })
    }
    doc.setTextColor(...gray); doc.setFontSize(6)
    doc.text(`${company.name} · Generated by MalkiaOS · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, w / 2, footerY + 14, { align: 'center' })

    return doc
  }, [period, company, template, logoData, ytdByEmp, leaveByEmp])

  const downloadOne = async (slip: PayslipData) => {
    setGenerating(slip.id)
    try {
      const doc = await generatePayslipPDF(slip)
      doc.save(`Payslip_${slip.employee.emp_code}_${period}.pdf`)
      setToast(`Payslip downloaded for ${slip.employee.full_name}`); setToastType('success')
    } catch (err: any) {
      setToast(err.message || 'PDF generation failed'); setToastType('error')
    }
    setGenerating(null)
  }

  const downloadAll = async () => {
    setGenerating('all')
    try {
      for (const slip of lines) {
        const doc = await generatePayslipPDF(slip)
        doc.save(`Payslip_${slip.employee.emp_code}_${period}.pdf`)
      }
      setToast(`${lines.length} payslips downloaded`); setToastType('success')
    } catch (err: any) {
      setToast(err.message || 'Bulk download failed'); setToastType('error')
    }
    setGenerating(null)
  }

  // ─── WhatsApp delivery ─────────────────────────────────────────────
  // The server (wa-payslip) renders the PDF itself and sends it; the browser
  // never uploads a salary document. Delivery state comes from wa_messages.
  const sendOne = async (slip: PayslipData) => {
    if (!slip.employee?.whatsapp) {
      setToast(`${slip.employee?.full_name} has no WhatsApp number on file`); setToastType('error'); return
    }
    setSending(slip.id)
    try {
      const res = await sendWhatsAppPayslip(slip.id)
      setToast(`Payslip sent to ${slip.employee.full_name} (${res.mode === 'template' ? 'approved template' : 'open chat window'})`); setToastType('success')
      await load()
    } catch (err: any) {
      setToast(`Send failed for ${slip.employee?.full_name}: ${err?.message || 'unknown error'}`); setToastType('error')
    }
    setSending(null)
  }

  const sendAll = async () => {
    const withWa = lines.filter(l => l.employee?.whatsapp)
    const without = lines.filter(l => !l.employee?.whatsapp)
    if (withWa.length === 0) { setToast('No employee in this run has a WhatsApp number'); setToastType('error'); return }
    const msg = `Send ${withWa.length} payslip${withWa.length === 1 ? '' : 's'} for ${period} by WhatsApp?` +
      (without.length ? `\n\nNo WhatsApp number (will be skipped): ${without.map(l => l.employee?.full_name).join(', ')}` : '')
    if (!window.confirm(msg)) return
    setSending('all')
    let ok = 0
    const failed: string[] = []
    for (const slip of withWa) {
      try { await sendWhatsAppPayslip(slip.id); ok++ } catch { failed.push(slip.employee?.full_name || '?') }
    }
    setSending(null)
    await load()
    const parts = [`${ok} sent`]
    if (failed.length) parts.push(`${failed.length} failed (${failed.join(', ')})`)
    if (without.length) parts.push(`${without.length} skipped, no WhatsApp number`)
    setToast(parts.join(' · ')); setToastType(failed.length ? 'error' : 'success')
  }

  // Totals
  const totals = lines.reduce((acc, l) => ({
    gross: acc.gross + l.gross, paye: acc.paye + l.paye,
    nssf: acc.nssf + l.nssf_ee, net: acc.net + l.net_pay,
  }), { gross: 0, paye: 0, nssf: 0, net: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{isSelfMode ? 'My Payslips' : 'Payslips'}</div>
          <div className="page-sub">{isSelfMode ? 'Your monthly payslip PDFs' : 'Auto-generated from payroll run · PDF download or WhatsApp delivery, per employee or bulk'}</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>
            <span>Month</span>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', outline: 'none' }} />
          </div>
          {!isSelfMode && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('hrm-payslip-template')} title="Configure logo, colors, footer, toggles">
              Template
            </button>
          )}
          {lines.length > 0 && !isSelfMode && (
            <button className="btn btn-ghost btn-sm" onClick={sendAll} disabled={sending !== null} title="Send every payslip in this run to the employee's own WhatsApp number">
              {sending === 'all' ? 'Sending…' : 'Send All by WhatsApp'}
            </button>
          )}
          {lines.length > 0 && !isSelfMode && (
            <button className="btn btn-primary btn-sm" onClick={downloadAll} disabled={generating === 'all'}>
              {generating === 'all' ? 'Generating...' : `Download All (${lines.length})`}
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {lines.length > 0 && !isSelfMode && (
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
          <div style={{ fontSize: 14 }}>No payslip found for {period}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{isSelfMode ? 'Payroll has not been processed for this period yet' : 'Process payroll first in the Payroll page'}</div>
          {!isSelfMode && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => onNav('hrm-payroll')}>Go to Payroll</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {lines.map((l) => {
            const emp = l.employee
            const color = DEPT_COLORS[emp?.department] || '#6366f1'
            const draft = notesDraft[l.id] ?? ''
            const dirty = (l.notes || '') !== draft.trim()
            return (
              <div key={l.id} className="card" style={{ borderTop: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{emp?.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{emp?.emp_code} · {emp?.job_title} · {period}</div>
                  </div>
                  {(() => {
                    const ws = l.payslip_wa_message_id ? waStatus[l.payslip_wa_message_id] : undefined
                    const b = !l.payslip_sent ? { t: 'Not sent', c: '#f59e0b' }
                      : !ws ? { t: 'Sent', c: '#22c55e' }
                      : ws.status === 'failed' ? { t: 'Failed', c: '#ef4444' }
                      : ws.status === 'read' ? { t: 'Read ✓✓', c: '#3b82f6' }
                      : ws.status === 'delivered' ? { t: 'Delivered ✓✓', c: '#22c55e' }
                      : { t: 'Sent ✓', c: '#22c55e' }
                    return <span title={ws?.error || ''} style={{ fontSize: 10, background: `${b.c}22`, color: b.c, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{b.t}</span>
                  })()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Gross</span><span style={{ fontFamily: 'var(--mono)' }}>{fmt(l.gross)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>PAYE</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.paye)})</span></div>
                  {l.nssf_ee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>NSSF</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.nssf_ee)})</span></div>}
                  {l.advance_deduction > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Advance</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.advance_deduction)})</span></div>}
                  {l.bonus > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Bonus</span><span style={{ fontFamily: 'var(--mono)', color: '#22c55e' }}>{fmt(l.bonus)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: 5 }}><span>Net Pay</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(l.net_pay)}</span></div>
                </div>

                {/* Per-employee note editor — admin only */}
                {!isSelfMode && (
                  <div style={{ marginBottom: 10 }}>
                    <textarea
                      placeholder="Note for this period (optional, shown on PDF)"
                      value={draft}
                      onChange={e => setNotesDraft(prev => ({ ...prev, [l.id]: e.target.value }))}
                      style={{
                        width: '100%', resize: 'vertical', minHeight: 36,
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 11, padding: 6, borderRadius: 4,
                        fontFamily: 'inherit',
                      }}
                    />
                    {dirty && (
                      <button
                        onClick={() => saveNote(l.id)}
                        disabled={savingNote === l.id}
                        style={{
                          marginTop: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700,
                          borderRadius: 4, border: 'none', background: 'var(--accent)',
                          color: '#fff', cursor: 'pointer',
                        }}
                      >
                        {savingNote === l.id ? 'Saving…' : 'Save note'}
                      </button>
                    )}
                  </div>
                )}

                <button onClick={() => downloadOne(l)} disabled={generating === l.id || !template} style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {generating === l.id ? 'Generating...' : (template ? 'Download PDF' : 'Loading…')}
                </button>
                {!isSelfMode && (
                  <button
                    onClick={() => { if (!l.payslip_sent || window.confirm(`Resend ${emp?.full_name}'s payslip by WhatsApp?`)) sendOne(l) }}
                    disabled={sending !== null || !emp?.whatsapp}
                    title={emp?.whatsapp ? `Send to ${emp.whatsapp}` : 'No WhatsApp number on this employee record'}
                    style={{ width: '100%', marginTop: 6, background: emp?.whatsapp ? '#22c55e18' : 'var(--surface2)', border: `1px solid ${emp?.whatsapp ? '#22c55e55' : 'var(--border)'}`, color: emp?.whatsapp ? '#16a34a' : 'var(--text3)', padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: emp?.whatsapp ? 'pointer' : 'not-allowed' }}
                  >
                    {sending === l.id ? 'Sending…' : !emp?.whatsapp ? 'No WhatsApp number' : l.payslip_sent ? 'Resend by WhatsApp' : 'Send by WhatsApp'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
