// ════════════════════════════════════════════════════════════════════════════
// whatsappTemplates.ts
//
// Pure helpers for the WhatsApp Templates feature:
//   • TemplateCategory + WhatsAppTemplate types
//   • mergeTemplate(body, customer) → resolved string with placeholders filled
//   • buildWhatsAppUrl(phone, message) → wa.me URL ready to open
//   • Placeholder catalog with descriptions for the editor UI
//
// No supabase calls in here. All DB work happens in the page component.
// ════════════════════════════════════════════════════════════════════════════

import { formatPhone } from './whatsapp'

// ─── Types ─────────────────────────────────────────────────────────────────

export type TemplateCategory =
  | 'onboarding'
  | 'check_in'
  | 'feedback'
  | 'birthday'
  | 'crown_reward'
  | 'win_back'
  | 'referral'
  | 'pregnancy_tips'
  | 'postpartum_tips'
  | 'general'

export interface WhatsAppTemplate {
  id: string
  name: string
  category: TemplateCategory
  body: string
  is_transactional: boolean
  is_active: boolean
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

// Shape of the customer data needed to merge. Kept narrow so callers can
// pass any object as long as it has these fields; avoids coupling to the
// full CustomerRecord shape.
export interface MergeCustomer {
  id: string
  name: string
  whatsapp?: string | null
  phone?: string | null
  ambassador_code?: string | null
  life_stage?: string | null
  edd?: string | null
  delivery_date?: string | null
  crown_points?: number | null
  stage_paused?: boolean | null
}


// ─── Placeholder catalog ───────────────────────────────────────────────────
// Shown in the editor as a clickable reference. Each entry has a token, a
// description, and a sample value used when rendering the live preview.

export const PLACEHOLDERS: Array<{ token: string; description: string; sample: string }> = [
  { token: '{{customer_name}}',         description: 'Full name',                                   sample: 'Mama Amina Hassan' },
  { token: '{{customer_first_name}}',   description: 'First word of the name',                      sample: 'Amina' },
  { token: '{{ambassador_code}}',       description: 'Customer ambassador code',                    sample: 'MAL-AMINHAS37' },
  { token: '{{life_stage}}',            description: 'Life stage in human-readable form',           sample: 'pregnancy' },
  { token: '{{pregnancy_week}}',        description: 'Current pregnancy week, computed from EDD',   sample: '28' },
  { token: '{{baby_age_months}}',       description: 'Baby age in months, from delivery_date',      sample: '3' },
  { token: '{{crown_points}}',          description: 'Raw integer points balance',                  sample: '1250' },
  { token: '{{crown_balance_formatted}}',description: 'Formatted with thousands separator and pts', sample: '1,250 pts' },
]


// ─── Category metadata for the UI ─────────────────────────────────────────

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  onboarding:      'Onboarding',
  check_in:        'Check-in',
  feedback:        'Feedback',
  birthday:        'Birthday',
  crown_reward:    'Crown reward',
  win_back:        'Win-back',
  referral:        'Referral',
  pregnancy_tips:  'Pregnancy tips',
  postpartum_tips: 'Postpartum tips',
  general:         'General',
}

export const CATEGORY_ORDER: TemplateCategory[] = [
  'onboarding', 'check_in', 'feedback', 'birthday',
  'crown_reward', 'referral', 'win_back',
  'pregnancy_tips', 'postpartum_tips', 'general',
]


// ─── Merge engine ─────────────────────────────────────────────────────────

/**
 * Compute pregnancy week from EDD. A full term is 40 weeks; the start of
 * gestation is EDD minus 280 days. Returns null if no EDD or out-of-range.
 */
function pregnancyWeekFromEdd(edd: string | null | undefined): string {
  if (!edd) return ''
  const eddDate = new Date(edd)
  if (isNaN(eddDate.getTime())) return ''
  const gestationStart = new Date(eddDate)
  gestationStart.setDate(gestationStart.getDate() - 280)
  const now = new Date()
  const daysSinceStart = Math.floor((now.getTime() - gestationStart.getTime()) / (1000 * 60 * 60 * 24))
  const weeks = Math.floor(daysSinceStart / 7)
  if (weeks < 1 || weeks > 42) return ''  // out of plausible range, just blank it
  return String(weeks)
}

/**
 * Compute baby age in months from delivery_date.
 */
function babyAgeMonthsFromDeliveryDate(deliveryDate: string | null | undefined): string {
  if (!deliveryDate) return ''
  const d = new Date(deliveryDate)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  if (months < 0) return ''
  return String(months)
}

/**
 * Format a points balance as "1,250 pts".
 */
function formatCrownBalance(points: number | null | undefined): string {
  if (points === null || points === undefined) return '0 pts'
  return `${points.toLocaleString('en-US')} pts`
}

/**
 * The merge step. Replaces all {{token}} placeholders in the template body
 * with values resolved from the customer. Missing data → empty string (per
 * Joe's spec: if a placeholder can't be resolved, send without it rather
 * than leaving the raw token visible).
 *
 * Returns the merged message AND a list of any placeholder tokens that
 * resolved to empty so the UI can warn the user before they send.
 */
export interface MergeResult {
  body: string
  emptyPlaceholders: string[]
}

export function mergeTemplate(body: string, customer: MergeCustomer): MergeResult {
  const firstName = (customer.name || '').trim().split(/\s+/)[0] || ''
  const values: Record<string, string> = {
    '{{customer_name}}':          customer.name || '',
    '{{customer_first_name}}':    firstName,
    '{{ambassador_code}}':        customer.ambassador_code || '',
    '{{life_stage}}':             customer.life_stage || '',
    '{{pregnancy_week}}':         pregnancyWeekFromEdd(customer.edd),
    '{{baby_age_months}}':        babyAgeMonthsFromDeliveryDate(customer.delivery_date),
    '{{crown_points}}':           customer.crown_points !== null && customer.crown_points !== undefined
                                    ? String(customer.crown_points) : '0',
    '{{crown_balance_formatted}}': formatCrownBalance(customer.crown_points),
  }

  const empties: string[] = []
  let result = body
  for (const [token, value] of Object.entries(values)) {
    if (result.includes(token)) {
      if (!value) empties.push(token)
      // Replace all occurrences (split/join is faster + safer than a global regex
      // for arbitrary user text)
      result = result.split(token).join(value)
    }
  }

  // Light cleanup: if any token had an empty value and was followed by a
  // space + punctuation (e.g. "uko wiki ya  sasa"), collapse the double
  // space into a single space.
  result = result.replace(/ {2,}/g, ' ')

  return { body: result, emptyPlaceholders: empties }
}


// ─── WhatsApp URL builder ─────────────────────────────────────────────────

/**
 * Build a WhatsApp pre-filled message URL.
 *
 * IMPORTANT: We use api.whatsapp.com/send instead of wa.me. Both endpoints
 * exist but they differ in how they handle the `text` parameter:
 *   - wa.me/<phone>?text=<msg>     — Landing page intended for short ASCII
 *                                    links. Strips or mangles emojis and
 *                                    other non-BMP UTF-8 in some browsers,
 *                                    especially when opened via window.open
 *                                    from another tab.
 *   - api.whatsapp.com/send?phone=<phone>&text=<msg>
 *                                    Legacy programmatic endpoint that
 *                                    reliably preserves UTF-8 including
 *                                    emoji (U+1F000+). This is what
 *                                    Customer.io / Trengo / Manychat use.
 *
 * Phone is normalized via formatPhone (Tanzania-aware) then stripped of
 * the leading + because the endpoint wants digits only.
 *
 * Returns null if the phone is empty or normalizes to something too short
 * to be a real number, or if the resulting URL would exceed 3,500 chars
 * (WhatsApp's effective limit on pre-filled message length).
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null
  const normalized = formatPhone(phone).replace(/[^0-9]/g, '')
  if (normalized.length < 9) return null  // too short to be a real intl number
  const encoded = encodeURIComponent(message)
  const url = `https://api.whatsapp.com/send?phone=${normalized}&text=${encoded}`
  // Defensive cap: WhatsApp truncates pre-filled messages somewhere around
  // 3,500-4,000 chars post-encoding. If we're approaching that, prefer
  // null and let the UI surface a "message too long" error.
  if (url.length > 3500) return null
  return url
}


// ─── Validation helpers ───────────────────────────────────────────────────

/**
 * Template body soft limits. wa.me query strings start to break around
 * 2,000 chars on some platforms after URL-encoding (which doubles spaces,
 * emoji, etc.). We warn at 1,200 and hard-block at 1,500 in the editor.
 */
export const TEMPLATE_BODY_WARN_LENGTH = 1200
export const TEMPLATE_BODY_MAX_LENGTH = 1500

/**
 * Returns the list of placeholder tokens used in a template body, in order
 * of first appearance. Useful for the editor's "this template uses:" chip.
 */
export function extractUsedPlaceholders(body: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const re = /\{\{[a-z_]+\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (!seen.has(m[0])) {
      seen.add(m[0])
      found.push(m[0])
    }
  }
  return found
}
