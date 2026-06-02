/**
 * KPI Scorecard module — shared types.
 * Mirrors tables created in migration 009_kpi_scorecards.sql.
 */
import type { Direction } from './kpiScoring'

export type KpiValueType = 'percent' | 'currency' | 'number'
export type AssignmentStatus = 'draft' | 'self_rated' | 'approved' | 'rejected'

export interface KpiTemplate {
  id: string
  name: string
  role_label: string | null
  prp_pool: number
  payout_cap: number
  sales_gate: number
  sales_kra: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface KpiKra {
  id: string
  template_id: string
  name: string
  weight: number
  sort_order: number
  created_at?: string
  kpis?: KpiKpi[]   // hydrated client-side
}

export interface KpiKpi {
  id: string
  kra_id: string
  name: string
  direction: Direction
  value_type: KpiValueType
  default_target: number | null
  sort_order: number
  created_at?: string
}

export interface KpiAssignment {
  id: string
  template_id: string | null
  template_name: string | null
  employee_id: string
  period: string
  prp_pool: number
  payout_cap: number
  sales_gate: number
  sales_kra: string | null
  status: AssignmentStatus
  overall_score: number | null
  rating: string | null
  gross_prp: number | null
  final_prp: number | null
  gate_pass: boolean | null
  employee_notes: string | null
  manager_notes: string | null
  self_submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  employee?: { id: string; full_name: string; job_title?: string; department?: string }
  lines?: KpiAssignmentLine[]
}

export interface KpiAssignmentLine {
  id: string
  assignment_id: string
  kra: string
  kra_weight: number
  kpi: string
  direction: Direction
  value_type: KpiValueType
  target: number | null
  self_actual: number | null
  actual: number | null
  sort_order: number
}

// ── value display helpers (percent stored as fraction internally) ──
export function toDisplay(v: number | null, type: KpiValueType): string {
  if (v === null || v === undefined || Number.isNaN(v)) return ''
  if (type === 'percent') return `${+(v * 100).toFixed(1)}`
  return `${v}`
}
export function fromInput(raw: string, type: KpiValueType): number | null {
  if (raw === '' || raw === null || raw === undefined) return null
  const n = parseFloat(raw)
  if (Number.isNaN(n)) return null
  return type === 'percent' ? n / 100 : n
}
export function formatValue(v: number | null, type: KpiValueType): string {
  if (v === null || v === undefined) return '—'
  if (type === 'percent') return `${+(v * 100).toFixed(1)}%`
  if (type === 'currency') return `${Math.round(v).toLocaleString()} TZS`
  return `${v}`
}
