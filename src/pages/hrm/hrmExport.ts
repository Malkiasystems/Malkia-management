import type { Employee } from './hrmTypes'
import { CONTRACT_LABELS } from './hrmTypes'

type Cell = string | number

async function downloadSheet(name: string, filename: string, headers: string[], rows: Cell[][]) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  sheet['!cols'] = headers.map((label, i) => ({
    wch: rows.reduce((width, row) => Math.max(width, Math.min(45, String(row[i]).length + 2)), label.length + 2),
  }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, name)
  XLSX.writeFile(book, filename + '.xlsx')
}

export function exportEmployees(employees: Employee[], status: string) {
  return downloadSheet('Employees', 'Malkia-employees-' + status,
    ['Employee ID', 'Name', 'Department', 'Job title', 'Contract', 'Start date', 'Contract end', 'Status', 'Gross salary (TZS)'],
    employees.map(e => [e.emp_code, e.full_name, e.department || '', e.job_title || '', CONTRACT_LABELS[e.contract_type] || '',
      e.start_date || '', e.end_date || '', e.is_active ? 'Active' : 'Inactive', Number(e.gross_salary || 0)]))
}

export interface PayrollExportLine {
  code: string
  name: string
  gross: number
  allowances: number
  bonus: number
  paye: number
  nssfEe: number
  advanceDeduction: number
  deductions: number
  net: number
  nssfEr: number
  sdl: number
  notes: string
}

export function exportPayroll(period: string, kind: 'preview' | 'posted', lines: PayrollExportLine[], reference = '') {
  const amountKeys = ['gross', 'allowances', 'bonus', 'paye', 'nssfEe', 'advanceDeduction', 'deductions', 'net', 'nssfEr', 'sdl'] as const
  const headers = ['Month', 'Register', 'Journal ref', 'Employee ID', 'Name', 'Gross', 'Allowances', 'Bonus', 'PAYE',
    'Employee NSSF', 'Advance recovery', 'Other deductions', 'Net pay', 'Employer NSSF', 'SDL', 'Payslip note']
  const rows = lines.map(line => [period, kind, reference, line.code, line.name, ...amountKeys.map(k => Number(line[k] || 0)), line.notes || ''])
  rows.push([period, kind, reference, '', 'TOTAL (TZS)', ...amountKeys.map(k => lines.reduce((sum, line) => sum + Number(line[k] || 0), 0)), ''])
  return downloadSheet('Monthly payroll (TZS)', `Malkia-payroll-${period}-${kind}`, headers, rows)
}
