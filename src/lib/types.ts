export type Page =
  | 'dashboard' | 'vouchers' | 'chart-of-accounts'
  | 'cash-sale' | 'cash-payment' | 'cash-receipt'
  | 'bank-payment' | 'bank-receipt' | 'bank-transfer'
  | 'petty-cash' | 'contra' | 'sales-invoice' | 'proforma' | 'proformas-list' | 'quotation'
  | 'sales-return' | 'debit-note' | 'credit-note'
  | 'purchase-order' | 'grn' | 'purchase' | 'purchase-invoice' | 'purchase-return'
  | 'opening-stock' | 'stock-adjustment' | 'stock-transfer' | 'journal-entry' | 'import-order'
  | 'stock-transfer-request' | 'stock-transfer-approvals'
  | 'internal-use' | 'internal-use-report'
  | 'sales' | 'inventory' | 'reports' | 'pnl'
  | 'sales-register' | 'sales-day-book' | 'sales-invoices-list' | 'trial-balance' | 'balance-sheet'
  | 'ar-aging' | 'ap-aging' | 'stock-valuation'
  | 'purchase-register' | 'payment-register' | 'expense-register' | 'stock-transfer-register' | 'import-register' | 'customers' | 'customer-statement'
  | 'receipt-template' | 'invoice-template'
  | 'whatsapp-settings' | 'location-settings'
  | 'inventory-settings' | 'pricelist-template' | 'proforma-template'
  | 'banks' | 'settings' | 'data-import' | 'coming-soon' | 'bundles'
  | 'stock-levels' | 'suppliers' | 'stock-movements'
  // CRM Module Pages
  | 'crm' | 'crm-hub' | 'crm-inbox' | 'crm-automations' | 'crm-preorders'
  | 'crm-referrals' | 'crm-ambassador'  // crm-referrals kept as alias; new code uses crm-ambassador
  | 'crm-loyalty' | 'crm-feedback' | 'crm-upsell'
  | 'crm-customers' | 'crm-command-center'
  // Settings Pages
  | 'accounting-settings' | 'display-settings' | 'report-templates'
  | 'company-finance-settings' | 'users-access-settings' | 'sales-inventory-settings'
  | 'templates-hub' | 'integrations-settings' | 'regional-backup-settings'
  // User Management & Approvals
  | 'users' | 'approvals' | 'approvals-settings'
  // Investors Module
  | 'investors' | 'investors-hub' | 'investors-portfolio' | 'investors-reports'
  // Bundles
  | 'bundles'
  // HRM Module Pages
  | 'hrm' | 'hrm-employees' | 'hrm-assets' | 'hrm-payroll' | 'hrm-payslips'
  | 'hrm-payslip-template'
  | 'hrm-leave' | 'hrm-attendance' | 'hrm-performance' | 'hrm-recruitment'
  | 'hrm-events' | 'hrm-settings'

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  cost: number
  price: number
  qty: number
  reorder: number
}

export interface Account {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense' | 'other'
  category: string
  balance: number
}

export interface Supplier {
  id: string
  name: string
  currency: string
  balance: number
}

export interface Customer {
  name: string
  stage: string
  last: string
  ai: string
  points: number
}

// ============================================================================
// CRM Customer Journey types (Session 1 migration 007)
// ============================================================================
// These types model the structured customer journey data added in
// 007_crm_customer_journey.sql. Page-level files (Customers.tsx, CRMHub.tsx,
// etc.) currently declare their own local Customer interfaces for DB rows;
// the types below are the canonical formal shapes those should converge on
// in Sessions 2-5.

/** Top-level life stage. NULL until manually classified by CRM team. */
export type LifeStage = 'ttc' | 'pregnancy' | 'postpartum' | 'parenting'

/** Sub-stage codes, computed from anchor dates by compute_life_substage(). */
export type LifeSubstage =
  | 'ttc_early' | 'ttc_extended' | 'ttc_long'
  | 'pregnancy_t1' | 'pregnancy_t2' | 'pregnancy_t3'
  | 'postpartum_acute' | 'postpartum_recovery' | 'postpartum_transition'
  | 'parenting_infant' | 'parenting_toddler' | 'parenting_school'

/** Relationship stage: where she is with Malkia operationally. */
export type RelationshipStage =
  | 'inquiry' | 'onboarding' | 'check_in'
  | 'crown' | 'ambassador' | 're_engagement'

/** Reason a profile is paused (sensitive exit protocol). Free-text in DB but
 *  these are the recommended values for consistency. */
export type StagePausedReason =
  | 'pregnancy_loss' | 'infant_loss' | 'personal_request' | 'do_not_contact' | 'other'

/**
 * Canonical Customer shape from the customers table after migration 007.
 * Page-level local Customer interfaces should converge on this in Sessions 2-5.
 */
export interface CustomerRecord {
  id: string
  customer_number: string
  name: string
  company?: string | null
  contact_person?: string | null
  customer_type: 'cash' | 'debtor'
  segment?: string | null
  whatsapp?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  credit_limit: number
  credit_period: number
  payment_terms?: string | null
  balance: number
  crown_points: number
  is_active: boolean
  last_purchase_date?: string | null
  last_purchase_amount?: number | null
  notes?: string | null
  created_at: string

  // Legacy free-text descriptor preserved from pre-007 schema.
  // Used by receipts and exports. e.g. "28 weeks Pregnant", "1 month postpartum".
  pregnancy_stage_legacy?: string | null

  // Structured life stage (new in 007)
  life_stage: LifeStage | null
  life_substage: LifeSubstage | null

  // Anchor dates that drive substage computation
  ttc_start_date?: string | null
  expected_due_date?: string | null
  actual_delivery_date?: string | null

  // Relationship stage
  relationship_stage: RelationshipStage | null

  // Stage management / graduation tracking
  previous_life_stage: LifeStage | null
  current_stage_entered_at?: string | null
  graduation_count: number
  pregnancy_count: number
  is_returning_customer: boolean

  // Ownership
  owner_user_id?: string | null

  // Sensitive exit
  stage_paused: boolean
  stage_paused_reason?: string | null
  stage_paused_at?: string | null
  stage_paused_by?: string | null

  // Ambassador program
  ambassador_code: string
  referred_by_customer_id?: string | null

  // Existing tier field; for Session 1 we keep single-tier semantics
  // (all members are simply "crown"). Field reserved for future tiering.
  crown_tier?: string | null
}

/** Append-only audit log of life-stage transitions. */
export interface CustomerStageHistory {
  id: string
  customer_id: string
  from_stage: LifeStage | null
  to_stage: LifeStage
  transitioned_at: string
  transitioned_by?: string | null
  notes?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

/** Maps life_stage (+ optional substage) to recommended products. */
export interface StageProductRecommendation {
  id: string
  life_stage: LifeStage
  life_substage: LifeSubstage | null
  product_id: string
  priority: number
  notes?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Catalog entry for manually awarding Crown points (UGC, tagging, events). */
export interface CrownManualAwardCatalogEntry {
  id: string
  reason_code: CrownAwardReasonCode | string
  label: string
  description?: string | null
  default_points: number
  requires_approval: boolean
  approval_threshold?: number | null
  is_active: boolean
  icon?: string | null
}

/** Canonical reason codes for Crown point awards. */
export type CrownAwardReasonCode =
  | 'purchase'              // automatic from cash sale / invoice
  | 'ugc_submission'        // user-generated content
  | 'tag_permission'        // allowed Malkia to tag her
  | 'event_attendance'      // attended a Malkia event
  | 'photo_testimonial'
  | 'video_testimonial'
  | 'birthday_bonus'
  | 'graduation_milestone'  // automatic on life-stage graduation
  | 'feedback_completion'
  | 'referral_conversion'   // her referred friend purchased
  | 'goodwill_adjustment'   // service make-good
  | 'manual_correction'     // always requires approval
  | 'other'

/** Crown points log row (matches crown_points_log after 007). */
export interface CrownPointsLogEntry {
  id: string
  customer_id: string
  points: number
  type: 'earn' | 'redeem'
  reason_code?: CrownAwardReasonCode | string | null
  reason_note?: string | null
  source_voucher_id?: string | null
  awarded_by_user_id?: string | null
  requires_approval: boolean
  approval_status?: 'pending' | 'approved' | 'rejected' | null
  approval_request_id?: string | null
  created_at: string
}

/** Crown points earning rules (read from crm_settings 'crown' category). */
export interface CrownEarningRules {
  /** Base earning rate: `points` per `per_tzs` TZS spent. */
  earning_rate: { points: number; per_tzs: number }
  /** Minimum purchase amount to earn any points. */
  minimum_purchase: { tzs: number }
  /** Optional cap on points per single transaction (null = uncapped). */
  max_points_per_txn: { cap: number | null }
  /** Value of 1 point in TZS at redemption time. */
  redemption_value: { tzs_per_point: number }
  /** Manual awards above this absolute point amount require approval. */
  manual_approval_threshold: { points: number }
}

/** Display-friendly labels for life stages. */
export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  ttc: 'TTC',
  pregnancy: 'Pregnancy',
  postpartum: 'Postpartum',
  parenting: 'Parenting',
}

/** Display-friendly labels for sub-stages. */
export const LIFE_SUBSTAGE_LABELS: Record<LifeSubstage, string> = {
  ttc_early: 'TTC · early (0-6 months)',
  ttc_extended: 'TTC · extended (6-12 months)',
  ttc_long: 'TTC · long (12+ months)',
  pregnancy_t1: 'Pregnancy · 1st trimester',
  pregnancy_t2: 'Pregnancy · 2nd trimester',
  pregnancy_t3: 'Pregnancy · 3rd trimester',
  postpartum_acute: 'Postpartum · acute (0-2 weeks)',
  postpartum_recovery: 'Postpartum · recovery (2-6 weeks)',
  postpartum_transition: 'Postpartum · transition (6-12 weeks)',
  parenting_infant: 'Parenting · infant (0-12 months)',
  parenting_toddler: 'Parenting · toddler (1-3 years)',
  parenting_school: 'Parenting · school age (3+ years)',
}

/** Display labels for relationship stages. */
export const RELATIONSHIP_STAGE_LABELS: Record<RelationshipStage, string> = {
  inquiry: 'Inquiry',
  onboarding: 'Onboarding',
  check_in: 'Check-in',
  crown: 'Crown',
  ambassador: 'Malkia Ambassador',
  re_engagement: 'Re-engagement',
}

/**
 * Client-side mirror of the SQL compute_life_substage() function.
 * Useful for UI display before the DB has stored the latest value.
 * Returns null if anchor date is missing or stage has no substage.
 */
export function computeLifeSubstage(
  stage: LifeStage | null,
  anchorDate: string | null,
  today: Date = new Date()
): LifeSubstage | null {
  if (!stage || !anchorDate) return null
  const anchor = new Date(anchorDate)
  if (isNaN(anchor.getTime())) return null

  const msPerDay = 24 * 60 * 60 * 1000
  const daysDiff = Math.floor((today.getTime() - anchor.getTime()) / msPerDay)
  const monthsDiff = Math.floor(
    (today.getFullYear() - anchor.getFullYear()) * 12 +
    (today.getMonth() - anchor.getMonth())
  )

  if (stage === 'ttc') {
    if (monthsDiff < 6) return 'ttc_early'
    if (monthsDiff < 12) return 'ttc_extended'
    return 'ttc_long'
  }

  if (stage === 'pregnancy') {
    // anchor here is expected_due_date; positive daysUntilDue if still future
    const daysUntilDue = -daysDiff
    let week = 40 - Math.max(0, Math.floor(daysUntilDue / 7))
    week = Math.max(1, Math.min(42, week))
    if (week <= 13) return 'pregnancy_t1'
    if (week <= 27) return 'pregnancy_t2'
    return 'pregnancy_t3'
  }

  if (stage === 'postpartum') {
    const weeksSince = Math.floor(daysDiff / 7)
    if (weeksSince < 2) return 'postpartum_acute'
    if (weeksSince < 6) return 'postpartum_recovery'
    return 'postpartum_transition'
  }

  if (stage === 'parenting') {
    if (monthsDiff < 12) return 'parenting_infant'
    if (monthsDiff < 36) return 'parenting_toddler'
    return 'parenting_school'
  }

  return null
}

/**
 * Returns the relevant anchor date for a given life stage.
 * Pregnancy uses due date; Postpartum and Parenting both use delivery date.
 */
export function anchorDateFor(
  stage: LifeStage | null,
  customer: Pick<CustomerRecord, 'ttc_start_date' | 'expected_due_date' | 'actual_delivery_date'>
): string | null {
  if (!stage) return null
  switch (stage) {
    case 'ttc':        return customer.ttc_start_date ?? null
    case 'pregnancy':  return customer.expected_due_date ?? null
    case 'postpartum': return customer.actual_delivery_date ?? null
    case 'parenting':  return customer.actual_delivery_date ?? null
  }
}

/**
 * Friendly display string for receipts/exports.
 * e.g. "28 weeks pregnant", "3 weeks postpartum", "baby 8 months"
 * Returns the legacy free-text if present and no structured stage exists.
 */
export function formatLifeStageDisplay(
  customer: Pick<
    CustomerRecord,
    'life_stage' | 'expected_due_date' | 'actual_delivery_date' | 'ttc_start_date' | 'pregnancy_stage_legacy'
  >,
  today: Date = new Date()
): string {
  // Fall back to legacy free-text if no structured data
  if (!customer.life_stage) return customer.pregnancy_stage_legacy ?? ''

  const msPerDay = 24 * 60 * 60 * 1000
  const stage = customer.life_stage

  if (stage === 'pregnancy' && customer.expected_due_date) {
    const due = new Date(customer.expected_due_date)
    const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / msPerDay)
    let week = 40 - Math.max(0, Math.floor(daysUntilDue / 7))
    week = Math.max(1, Math.min(42, week))
    return `${week} weeks pregnant`
  }

  if (stage === 'postpartum' && customer.actual_delivery_date) {
    const delivered = new Date(customer.actual_delivery_date)
    const days = Math.floor((today.getTime() - delivered.getTime()) / msPerDay)
    if (days < 14) return `${days} days postpartum`
    const weeks = Math.floor(days / 7)
    return `${weeks} weeks postpartum`
  }

  if (stage === 'parenting' && customer.actual_delivery_date) {
    const delivered = new Date(customer.actual_delivery_date)
    const months = (today.getFullYear() - delivered.getFullYear()) * 12 +
                   (today.getMonth() - delivered.getMonth())
    if (months < 24) return `baby ${months} month${months === 1 ? '' : 's'}`
    const years = Math.floor(months / 12)
    return `child ${years} year${years === 1 ? '' : 's'}`
  }

  if (stage === 'ttc' && customer.ttc_start_date) {
    const start = new Date(customer.ttc_start_date)
    const months = (today.getFullYear() - start.getFullYear()) * 12 +
                   (today.getMonth() - start.getMonth())
    return `TTC · ${months} month${months === 1 ? '' : 's'}`
  }

  // Stage classified but no anchor date yet
  return LIFE_STAGE_LABELS[stage]
}

export interface LineItem {
  productId: string
  desc: string
  qty: number
  price: number
  amount: number
}

export interface JournalLine {
  account: string
  dr: number
  cr: number
  desc: string
}
