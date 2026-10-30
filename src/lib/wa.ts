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
