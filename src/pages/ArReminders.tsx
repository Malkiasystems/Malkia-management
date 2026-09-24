// ============================================================================
// ArReminders.tsx — payment reminders for accounts receivable, over
// WhatsApp Web. (Joe, 24 Sep 2026.)
//
// SCHEDULE, driven by customers.credit_days from the credit policy:
//   Tier A  (7-day terms)        remind from 2 days before due      [pre2]
//   Tier B  (14-day terms)       remind from 4 days before due      [pre4]
//   Tier C / CONTRACT (longer)   7 days [pre7], 3 [pre3], 1 [pre1]
//   Anything past due            OVERDUE tab, firmer template
//
// HONESTY ABOUT THE DATA: per-invoice settlement is not tracked, so an
// invoice "needing a reminder" means: posted sales invoice, effective due
// date inside the tier's window, AND the customer currently carries a
// balance. If they have paid but the balance sits elsewhere, the accountant
// sees the balance right on the row and skips it — the human stays in the
// loop, which is the point of a WhatsApp-Web-first version.
//
// Effective due date = the invoice's own due_date, else posting_date +
// the customer's credit_days (pre-policy invoices often carry no due date).
//
// Every send is one click: opens wa.me with the message prefilled, and
// logs to ar_reminders so the same stage is never queued twice. When the
// WhatsApp API arrives, the sender changes and this page becomes review-
// and-approve; the schedule and the log stay exactly as they are.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import Toast from '../components/Toast'

interface Cust {
  id: string; name: string; phone: string | null
  balance: number; credit_tier: string | null; credit_days: number | null
  contact_person: string | null
}
interface Inv {
  id: string; ref: string; customer_id: string
  posting_date: string; due_date: string | null; total_amount: number
}
interface Sent { invoice_ref: string; stage: string; sent_at: string }

type Stage = 'pre7' | 'pre4' | 'pre3' | 'pre2' | 'pre1' | 'overdue'

const fmtTzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString()
const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 0715... -> 255715..., keeps 255..., strips separators. */
function waNumber(raw: string | null): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('255')) return d
  if (d.startsWith('0')) return '255' + d.slice(1)
  return d
}

function daysToDue(due: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

/** Which stage applies right now for this customer's tier and this due
 *  distance; null when the invoice is outside every reminder window. */
function stageFor(creditDays: number, dtd: number): Stage | null {
  if (dtd < 0) return 'overdue'
  if (creditDays <= 7) return dtd <= 2 ? 'pre2' : null
  if (creditDays <= 14) return dtd <= 4 ? 'pre4' : null
  // long-terms customers: three touches
  if (dtd <= 1) return 'pre1'
  if (dtd <= 3) return 'pre3'
  if (dtd <= 7) return 'pre7'
  return null
}

const STAGE_LABEL: Record<Stage, string> = {
  pre7: '7 days before', pre4: '4 days before', pre3: '3 days before',
  pre2: '2 days before', pre1: '1 day before', overdue: 'OVERDUE',
}

function buildMessage(c: Cust, inv: Inv, due: string, stage: Stage): string {
  const who = c.contact_person || c.name
  if (stage === 'overdue') {
    return (
      `Hello ${who},\n\n` +
      `This is a payment follow-up from Malkia Wellness Group Ltd.\n\n` +
      `Invoice ${inv.ref} of ${fmtTzs(inv.total_amount)} was due on ${fmtDate(due)} and remains unsettled. ` +
      `Your account balance stands at ${fmtTzs(c.balance)}.\n\n` +
      `Kindly arrange payment today, or reply with your payment plan so we keep your account in good standing.\n\n` +
      `Payment: M-Pesa / bank as per your invoice. Please use the invoice number as reference.\n\n` +
      `Asante,\nAccounts — Malkia Wellness Group Ltd`
    )
  }
  return (
    `Hello ${who},\n\n` +
    `A friendly reminder from Malkia Wellness Group Ltd.\n\n` +
    `Invoice ${inv.ref} of ${fmtTzs(inv.total_amount)} falls due on ${fmtDate(due)}. ` +
    `Kindly plan the payment so your account stays in good standing.\n\n` +
    `Payment: M-Pesa / bank as per your invoice. Please use the invoice number as reference.\n\n` +
    `Asante kwa ushirikiano,\nAccounts — Malkia Wellness Group Ltd`
  )
}

const Ic = ({ n }: { n: string }) => {
  const p = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (n === 'bell') return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  if (n === 'send') return <svg {...p}><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
  if (n === 'check') return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  if (n === 'alert') return <svg {...p}><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
  return null
}

export default function ArReminders() {
  const { user } = useAuth()
  const [custs, setCusts] = useState<Cust[]>([])
  const [invs, setInvs] = useState<Inv[]>([])
  const [sent, setSent] = useState<Sent[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [tab, setTab] = useState<'upcoming' | 'overdue'>('upcoming')
  const [preview, setPreview] = useState<string | null>(null)  // row key being previewed

  const load = async () => {
    setLoading(true)
    try {
      const [cRes, iRes, sRes] = await Promise.all([
        supabase.from('customers')
          .select('id, name, phone, balance, credit_tier, credit_days, contact_person')
          .eq('customer_type', 'wholesale').gt('balance', 0),
        supabase.from('vouchers')
          .select('id, ref, customer_id, posting_date, due_date, total_amount')
          .eq('type', 'sales_invoice').eq('status', 'posted')
          .gte('posting_date', new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)),
        supabase.from('ar_reminders').select('invoice_ref, stage, sent_at')
          .gte('sent_at', new Date(Date.now() - 90 * 86400000).toISOString()),
      ])
      setCusts((cRes.data || []) as Cust[])
      setInvs((iRes.data || []) as Inv[])
      setSent((sRes.data || []) as Sent[])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    const byCust = new Map(custs.map(c => [c.id, c]))
    const sentSet = new Set(sent.map(s => `${s.invoice_ref}|${s.stage}`))
    const out: {
      key: string; c: Cust; inv: Inv; due: string; dtd: number
      stage: Stage; alreadySent: boolean; wa: string | null; msg: string
    }[] = []
    for (const inv of invs) {
      const c = byCust.get(inv.customer_id)
      if (!c) continue                       // balance 0 or not wholesale
      const cd = c.credit_days || 7
      const due = inv.due_date || (() => {
        const d = new Date(inv.posting_date + 'T00:00:00')
        d.setDate(d.getDate() + cd)
        return d.toISOString().slice(0, 10)
      })()
      const dtd = daysToDue(due)
      if (dtd < -60) continue                // old debt: collected slowly, not spammed
      const stage = stageFor(cd, dtd)
      if (!stage) continue
      const key = `${inv.ref}|${stage}`
      out.push({
        key, c, inv, due, dtd, stage,
        alreadySent: sentSet.has(key),
        wa: waNumber(c.phone),
        msg: buildMessage(c, inv, due, stage),
      })
    }
    out.sort((a, b) => a.dtd - b.dtd || b.inv.total_amount - a.inv.total_amount)
    return out
  }, [custs, invs, sent])

  const upcoming = rows.filter(r => r.stage !== 'overdue')
  const overdue = rows.filter(r => r.stage === 'overdue')
  const shown = tab === 'upcoming' ? upcoming : overdue

  const sendOne = async (r: typeof rows[number]) => {
    if (!r.wa) {
      setToast(`${r.c.name} has no phone number on file — add it on the Customers page first.`)
      setToastType('error'); return
    }
    window.open(`https://wa.me/${r.wa}?text=${encodeURIComponent(r.msg)}`, '_blank', 'noopener')
    // Log the send. Logged as "opened in WhatsApp", which is what we truly
    // know — the accountant still presses Send inside WhatsApp itself.
    const { error } = await supabase.from('ar_reminders').insert({
      customer_id: r.c.id, invoice_ref: r.inv.ref, due_date: r.due,
      amount: r.inv.total_amount, stage: r.stage,
      channel: 'whatsapp_web', sent_by: user?.full_name || user?.email || null,
    })
    if (error) { setToast(`Opened WhatsApp but the log failed: ${error.message}`); setToastType('error') }
    else {
      setSent(prev => [...prev, { invoice_ref: r.inv.ref, stage: r.stage, sent_at: new Date().toISOString() }])
      setToast(`Reminder for ${r.inv.ref} opened in WhatsApp and logged.`)
      setToastType('success')
    }
  }

  return (
    <div className="page" style={{ padding: '18px 22px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ color: 'var(--accent)' }}><Ic n="bell" /></span>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 26, margin: 0 }}>Payment Reminders</h1>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
        WhatsApp reminders per the credit policy: 7-day customers from 2 days before due,
        14-day customers from 4 days, longer terms at 7 / 3 / 1 days. One click opens WhatsApp
        with the message ready; the send is logged so nothing is nagged twice.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={`btn btn-sm ${tab === 'upcoming' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('upcoming')}>
          Falling due ({upcoming.length})
        </button>
        <button className={`btn btn-sm ${tab === 'overdue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('overdue')}
          style={tab !== 'overdue' && overdue.length > 0 ? { color: 'var(--red)' } : undefined}>
          Overdue ({overdue.length})
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>

      {loading && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading receivables…</div>}
      {!loading && shown.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          <Ic n="check" /> Nothing {tab === 'upcoming' ? 'falling due inside a reminder window' : 'overdue'} right now.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map(r => (
          <div key={r.key} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {r.c.name}
                  <span style={{ marginLeft: 8, fontSize: 9.5, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 5, background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    {r.c.credit_tier || '?'} · {r.c.credit_days || 7}d
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>
                  {r.inv.ref} · {fmtTzs(r.inv.total_amount)} · due {fmtDate(r.due)} · balance {fmtTzs(r.c.balance)}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: r.stage === 'overdue' ? 'var(--red)' : 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {r.stage === 'overdue' && <Ic n="alert" />}
                {r.stage === 'overdue' ? `${-r.dtd} days late` : `due in ${r.dtd}d · ${STAGE_LABEL[r.stage]}`}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreview(preview === r.key ? null : r.key)}>
                {preview === r.key ? 'Hide' : 'Preview'}
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: r.alreadySent ? 0.55 : 1 }}
                title={r.wa ? (r.alreadySent ? 'This stage was already sent — sending again anyway is allowed' : 'Open WhatsApp with the message ready') : 'No phone number on file'}
                onClick={() => sendOne(r)}
              >
                <Ic n={r.alreadySent ? 'check' : 'send'} />
                {r.alreadySent ? 'Sent · resend' : 'WhatsApp'}
              </button>
            </div>
            {preview === r.key && (
              <pre style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11.5, whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)', color: 'var(--text2)', lineHeight: 1.6 }}>
                {r.msg}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
