import { supabase } from './supabase'

/* Thin client for the wa-send edge function. Staff JWT auth: any active
   MalkiaOS user can send; the function logs everything to wa_messages.
   Reused by the command centre now and by receipt / order hooks next. */
const WA_SEND_URL = 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/wa-send'

export type WaPurpose = 'otp' | 'receipt' | 'order' | 'checkout' | 'tip' | 'support' | 'marketing' | 'system'

export async function sendWhatsApp(opts: { phone: string; body: string; purpose?: WaPurpose; name?: string }) {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('Ingia tena MalkiaOS (session imeisha).')
  const r = await fetch(WA_SEND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ phone: opts.phone, body: opts.body, purpose: opts.purpose || 'support', name: opts.name, source: 'malkiaos' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || `wa-send ${r.status}`)
  return j as { ok: true; id: string; twilio_sid: string }
}

/* Branded PDF receipt: wa-receipt renders the A5 PDF server-side, vaults it
   in the private receipts bucket, and ships it via wa-send as a document. */
const WA_RECEIPT_URL = 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/wa-receipt'

export async function sendWhatsAppReceiptPdf(ref: string) {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('Ingia tena MalkiaOS (session imeisha).')
  const r = await fetch(WA_RECEIPT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ ref }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || `wa-receipt ${r.status}`)
  return j as { ok: true; pdf: string; twilio_sid: string }
}

/* Payslip delivery: wa-payslip renders the payslip server-side from the payroll
   line, vaults it in the private payslips bucket and sends it to the
   employee's own WhatsApp number. Requires payroll rights (hrm.confidential). */
const WA_PAYSLIP_URL = 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/wa-payslip'

export async function sendWhatsAppPayslip(lineId: string) {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('Ingia tena MalkiaOS (session imeisha).')
  const r = await fetch(WA_PAYSLIP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ line_id: lineId }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || `wa-payslip ${r.status}`)
  return j as { ok: true; mode: 'freeform' | 'template'; twilio_sid: string; message_id: string; pdf: string }
}

/* Waiting list: tell a customer the product they asked for is back, from the
   business number. wa-waitlist picks an ordinary message inside the customer's
   24h window and the approved template outside it, logs the message (so it
   shows in the WhatsApp Inbox with delivery ticks) and marks the entry. */
const WA_WAITLIST_URL = 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/wa-waitlist'

export async function sendWaitlistNotice(waitingId: string, percent: number, force = false) {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('Sign in to MalkiaOS again (your session has ended).')
  const r = await fetch(WA_WAITLIST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ waiting_id: waitingId, percent, force }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(j?.error || `wa-waitlist ${r.status}`) as Error & { code?: string }
    err.code = j?.code
    throw err
  }
  return j as { ok: true; mode: 'freeform' | 'template'; message_id: string | null; marked: boolean; percent: number; price: number; retail: number }
}

/* Business-number templates (CRM > WhatsApp Templates): list with Meta's
   decision, check a draft against Meta's rules, submit a new one. */
const WA_TEMPLATES_URL = 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/wa-templates'

export async function waTemplates(payload: Record<string, unknown>) {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('Sign in to MalkiaOS again (your session has ended).')
  const r = await fetch(WA_TEMPLATES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(j?.error || `wa-templates ${r.status}`) as Error & { problems?: string[] }
    err.problems = j?.problems
    throw err
  }
  return j as { ok: true; can_create?: boolean; templates?: any[]; problems?: string[]; submitted?: boolean; template?: any }
}
