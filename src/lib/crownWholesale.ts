import { supabase } from './supabase'

/* Malkia Crown for wholesalers (migration 098).

   A wholesaler earns points on the money they actually pay. Points are turned
   into a credit note that lowers what they owe on their next order.

   Everything that matters is decided in the database: who may see or change
   what, how points are worked out, and the credit note posting, which is all
   or nothing. This file only calls those functions and holds the agreed
   WhatsApp wordings. */

export interface CrownSettings {
  is_on: boolean
  start_date: string | null
  tzs_per_point: number          // shillings paid to earn 1 point
  point_value_tzs: number        // what 1 point is worth
  min_redeem_points: number
  block_if_overdue: boolean
  discount_account_code: string
  updated_at: string
}

export interface CrownMember {
  customer_id: string
  name: string
  code: string | null
  whatsapp: string | null
  credit_tier: string | null
  no_contact: boolean
  is_active: boolean
  enrolled_at: string
  welcome_sent_at: string | null
  statement_sent_at: string | null
  ar_balance: number
  points: number
  earned: number
  redeemed: number
  earned_since_statement: number
  last_earn_date: string | null
  overdue: boolean
}

export interface CrownOverview {
  role: 'manage' | 'view'
  settings: CrownSettings
  wholesalers_total: number
  members: CrownMember[]
  totals: { points_outstanding: number; points_earned: number; credit_notes: number; credit_notes_value: number }
}

export interface CrownCandidate { customer_id: string; name: string; code: string | null; whatsapp: string | null; credit_tier: string | null; paid_90d: number }
export interface CrownActivity { id: string; customer_id: string; name: string; kind: 'earn' | 'reversal' | 'redeem' | 'adjust'; points: number; source_ref: string | null; entry_date: string | null; base_amount: number | null; note: string | null; created_at: string }
export interface CrownRedemption { id: string; customer_id: string; name: string; whatsapp: string | null; points: number; amount: number; voucher_ref: string; note: string | null; created_at: string; created_by_name: string | null; wa_sent_at: string | null; points_left: number }
export interface CrownRedeemResult { redemption_id: string; ref: string; points: number; amount: number; points_left: number; customer: string; customer_balance: number }

// Every call returns the database's own message when it fails.
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const crownOverview = () => rpc<CrownOverview>('crown_ws_overview')
export const crownCandidates = () => rpc<CrownCandidate[]>('crown_ws_candidates')
export const crownActivity = (customerId: string | null, limit = 200) => rpc<CrownActivity[]>('crown_ws_activity', { p_customer: customerId, p_limit: limit })
export const crownRedemptions = () => rpc<CrownRedemption[]>('crown_ws_redemption_list', { p_limit: 200 })
export const crownPaid90d = () => rpc<number>('crown_ws_paid_90d')
export const crownSaveSettings = (patch: Partial<CrownSettings>) => rpc<CrownSettings>('crown_ws_save_settings', { p: patch })
export const crownEnroll = (ids: string[]) => rpc<number>('crown_ws_enroll', { p_customer_ids: ids })
export const crownSetActive = (customerId: string, active: boolean) => rpc<null>('crown_ws_set_active', { p_customer: customerId, p_active: active })
export const crownAdjust = (customerId: string, points: number, note: string) => rpc<number>('crown_ws_adjust', { p_customer: customerId, p_points: points, p_note: note })
export const crownRedeem = (customerId: string, points: number, note: string) => rpc<CrownRedeemResult>('crown_ws_redeem', { p_customer: customerId, p_points: points, p_note: note || null })
export const crownMarkSent = (kind: CrownMessageKind, customerId: string | null, redemptionId: string | null) =>
  rpc<null>('crown_ws_mark_sent', { p_kind: kind, p_customer: customerId, p_redemption: redemptionId })

/* ── WhatsApp ──────────────────────────────────────────────────────────────
   Three messages. Each must be approved by Meta before it can be sent, and
   Meta does not allow the wording to change after it is submitted, so read
   them carefully first. The blanks are filled by the system per wholesaler. */

export type CrownMessageKind = 'welcome' | 'points' | 'credit'

export interface CrownTemplateDef {
  kind: CrownMessageKind
  name: string
  category: 'MARKETING' | 'UTILITY'
  label: string
  when: string
  blanks: string[]
  body: string
  samples: Record<string, string>
}

export const CROWN_TEMPLATES: CrownTemplateDef[] = [
  {
    kind: 'welcome', name: 'malkia_crown_ws_welcome_sw', category: 'MARKETING',
    label: 'Welcome to Malkia Crown',
    when: 'Sent once when a wholesaler is enrolled. It explains how points are earned and what they are worth.',
    blanks: ['wholesaler name', 'shillings paid to earn 1 point', 'value of 1 point in shillings', 'points needed for a credit note'],
    body: 'Habari {{1}}, karibu kwenye Malkia Crown, mpango wa pointi kwa wauzaji wetu wa jumla.\n\nKila TZS {{2}} unayolipa Malkia inakupa pointi 1 ya Crown. Kila pointi ina thamani ya TZS {{3}}.\n\nPointi zikifika {{4}}, tunazibadilisha kuwa credit note inayopunguza malipo ya oda yako inayofuata.\n\nAsante kwa kuwa mshirika wa Malkia.',
    samples: { '1': 'Mama Asha Shop', '2': '1,000', '3': '10', '4': '5,000' },
  },
  {
    kind: 'points', name: 'malkia_crown_ws_points_sw', category: 'UTILITY',
    label: 'Points statement',
    when: 'Sent when you choose, for example once a month. It tells the wholesaler how many points they have and what they are worth.',
    blanks: ['wholesaler name', 'points earned since the last statement', 'total points', 'value of the total in shillings', 'points needed for a credit note'],
    body: 'Habari {{1}}, hii ni taarifa ya pointi zako za Malkia Crown.\n\nPointi mpya tangu taarifa iliyopita: {{2}}\nJumla ya pointi ulizonazo: {{3}}\nThamani yake: TZS {{4}}\n\nPointi zikifika {{5}} zinabadilishwa kuwa credit note inayopunguza malipo ya oda yako inayofuata.\n\nAsante kwa kuwa mshirika wa Malkia.',
    samples: { '1': 'Mama Asha Shop', '2': '1,250', '3': '6,400', '4': '64,000', '5': '5,000' },
  },
  {
    kind: 'credit', name: 'malkia_crown_ws_credit_sw', category: 'UTILITY',
    label: 'Credit note issued',
    when: 'Sent after points are turned into a credit note. It gives the credit note number and the amount.',
    blanks: ['wholesaler name', 'points converted', 'credit note number', 'credit note amount in shillings', 'points left'],
    body: 'Habari {{1}}, pointi zako {{2}} za Malkia Crown zimebadilishwa kuwa credit note {{3}} yenye thamani ya TZS {{4}}.\n\nKiasi hiki kimepunguzwa kwenye salio la akaunti yako Malkia na kitaonekana kwenye taarifa yako ya akaunti. Pointi zilizobaki: {{5}}.\n\nAsante kwa kuwa mshirika wa Malkia.',
    samples: { '1': 'Mama Asha Shop', '2': '5,000', '3': 'CN-10-0012', '4': '50,000', '5': '1,400' },
  },
]

export const fillTemplate = (body: string, vars: Record<string, string>) =>
  body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => vars[n] ?? `{{${n}}}`)

export const fmtNum = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US')

/** The blanks for one wholesaler, in the order the wording expects. */
export function crownVars(kind: CrownMessageKind, s: CrownSettings, m: { name: string; points: number; earned_since_statement?: number }, r?: { points: number; voucher_ref: string; amount: number; points_left: number }): Record<string, string> {
  // Meta refuses line breaks and long runs of spaces inside a blank.
  const name = (m.name || 'Mshirika').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (kind === 'welcome') return { '1': name, '2': fmtNum(s.tzs_per_point), '3': String(Number(s.point_value_tzs)), '4': fmtNum(s.min_redeem_points) }
  if (kind === 'points') return { '1': name, '2': fmtNum(Math.max(0, m.earned_since_statement || 0)), '3': fmtNum(m.points), '4': fmtNum(m.points * s.point_value_tzs), '5': fmtNum(s.min_redeem_points) }
  if (!r) throw new Error('The credit note details are missing.')
  return { '1': name, '2': fmtNum(r.points), '3': r.voucher_ref, '4': fmtNum(r.amount), '5': fmtNum(r.points_left) }
}

export interface ApprovedTemplate { name: string; sid: string | null; status: string; category: string | null; meta_category?: string | null; rejection_reason?: string | null }

const WA_SEND_URL = 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/wa-send'

/** Send one Crown message from the business number, using the template Meta approved.
    A marketing template goes out as marketing, so the usual consent rule applies to it. */
export async function sendCrownMessage(opts: { def: CrownTemplateDef; tpl: ApprovedTemplate; phone: string; name: string; vars: Record<string, string> }) {
  if (!opts.tpl.sid || opts.tpl.status !== 'approved') throw new Error(`"${opts.def.label}" has not been approved by Meta yet, so it cannot be sent.`)
  if (!opts.phone) throw new Error(`${opts.name} has no WhatsApp number on their customer record.`)
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('Sign in to MalkiaOS again (your session has ended).')
  const category = String(opts.tpl.meta_category || opts.tpl.category || opts.def.category).toUpperCase()
  const r = await fetch(WA_SEND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      phone: opts.phone, name: opts.name, source: 'malkiaos',
      purpose: category === 'MARKETING' ? 'marketing' : 'system',
      body: fillTemplate(opts.def.body, opts.vars),      // what the inbox log shows
      content_sid: opts.tpl.sid, variables: opts.vars,
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const raw = j?.error || `wa-send ${r.status}`
    if (/no marketing consent/i.test(raw)) throw new Error(`${opts.name} has not agreed to receive marketing messages on WhatsApp, so this one was not sent. (WhatsApp sender said: ${raw})`)
    if (/no_contact/i.test(raw)) throw new Error(`${opts.name} asked not to be contacted, so nothing was sent. (WhatsApp sender said: ${raw})`)
    throw new Error(`WhatsApp did not accept the message. Sender said: ${raw}`)
  }
  return j as { ok: true; id: string; twilio_sid: string }
}
