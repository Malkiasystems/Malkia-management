// src/pages/services/Services.tsx
//
// Services: everything Malkia sells that is not a physical product.
// The first service is the week by week pregnancy lessons on WhatsApp. Consultations and
// courses will be added here as their own service types.
//
// Everything on this page comes from the database functions in migrations/100_services.sql,
// which check the 'crm.services' permission themselves. Rules worth knowing when changing it:
//   - A subscription's status is worked out, never stored (service_sub_status).
//   - While payments are not switched on, nobody is expired for not paying.
//   - WhatsApp numbers reach this page for super admins only; export is super admins only
//     and every export is written down first (services_export_log).
//   - Pause, extend, stop and adding a mother by hand each need a reason.
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { printHtmlDocument } from '../../lib/printDocument'
import type { Page } from '../../lib/types'
import { Icon, CIRCLE_WIDTH } from '../crm/circleUi'

const FN = 'https://ebokhvibnypiomzqimfg.supabase.co/functions/v1/'
async function call(fn: string, payload: Record<string, unknown>) {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('Sign in to MalkiaOS again (your session has ended).')
  const r = await fetch(FN + fn, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || `${fn} ${r.status}`)
  return j
}

type Status = 'free' | 'free_open' | 'active' | 'paused' | 'stopped' | 'expired'
interface Svc {
  id: string; slug: string; kind: 'subscription' | 'booking' | 'course'; name: string; tagline: string | null
  price_tzs: number | null; period_days: number; free_days: number; payments_live: boolean; is_open: boolean
  counts: { on: number; free: number; paying: number; paused: number; stopped: number; expired: number; ending: number }
  lessons_ready: number; lessons_total: number; template_ok: boolean; gaps: { week: number; mothers: number }[]
}
interface Sub {
  id: string; user_id: string; name: string; username: string; member_no: number; is_test: boolean; whatsapp: string | null
  preg_week: number | null; status: Status; started_at: string; rejoined_at: string | null; free_until: string | null; paid_until: string | null
  covered_until: string | null; paused_at: string | null; pause_reason: string | null; stopped_at: string | null; stop_source: 'mother' | 'staff' | 'acha' | null
  added_by_name: string | null; lessons_sent: number
  last_send: { week: number; position: number; topic: string; at: string; status: string } | null
  last_payment: { amount: number; at: string; covers_until: string } | null
}
interface LessonStat { week: number; position: number; topic: string; last_at: string; sent: number; delivered: number; read: number; failed: number; waiting: number }
interface LogRow { id: string; name: string; week: number; position: number; topic: string; trigger: string; at: string; status: string; error: string | null; attempts: number }
interface Pay { id: string; payer_name: string | null; member_no: number | null; amount_tzs: number; provider: string; provider_ref: string | null; channel: string | null; status: string; covers_from: string | null; covers_until: string | null; created_at: string; completed_at: string | null; note: string | null }
interface Candidate { user_id: string; name: string; username: string; member_no: number; preg_week: number | null }
interface Hist { action: string; reason: string | null; days: number | null; by_name: string | null; at: string }
type Act = 'pause' | 'resume' | 'stop' | 'extend'

const STATUS_LABEL: Record<Status, string> = { free: 'Free period', free_open: 'Free until payments start', active: 'Paying', paused: 'Paused', stopped: 'Stopped', expired: 'Expired' }
const STATUS_COLOR: Record<Status, [string, string]> = {
  free: ['#E3F0FB', '#1D4F91'], free_open: ['#E3F0FB', '#1D4F91'], active: ['#E3F4EC', '#14613D'],
  paused: ['#FFF1D6', '#7A4A00'], stopped: ['#ECEFF0', '#4A5654'], expired: ['#FDE7E5', '#9C1F17'],
}
const SEND_LABEL: Record<string, string> = { queued: 'waiting to send', sending: 'sending', sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', cancelled: 'cancelled' }
const SEND_DOT: Record<string, string> = { queued: '#D08A1A', sending: '#D08A1A', sent: '#3B82C4', delivered: '#1E9E62', read: '#1E9E62', failed: '#D43C4A', cancelled: '#8A9593' }
const ACT_LABEL: Record<string, string> = {
  joined: 'Joined from Circle', rejoined: 'Joined again', added_by_staff: 'Added by staff', stopped: 'Stopped from Circle',
  stopped_by_staff: 'Stopped by staff', stopped_acha: 'Stopped (she sent ACHA on WhatsApp)', pause: 'Paused', resume: 'Resumed',
  extend: 'Cover extended', payment: 'Payment received',
}
const tzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString('en-US')
const day = (s?: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const dayTime = (s?: string | null) => s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const local = (p: string) => /^255\d{9}$/.test(p) ? `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : p
function ago(s: string) {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.floor(m / 60)} h ago`
  return day(s)
}
const covered = (s: Sub) => s.status === 'stopped' ? 'Not covered' : s.status === 'free_open' ? 'Until payments start' : s.covered_until ? day(s.covered_until) : 'Not covered'
const lastLesson = (s: Sub) => s.last_send ? `Week ${s.last_send.week}, lesson ${s.last_send.position} · ${SEND_LABEL[s.last_send.status] || s.last_send.status}` : 'None yet'
const stopWord = (s: Sub) => s.status !== 'stopped' ? '' : s.stop_source === 'acha' ? ' (sent ACHA)' : s.stop_source === 'staff' ? ' by staff' : ' by her'

export default function Services({ onNav }: { onNav?: (p: Page) => void }) {
  const [svcs, setSvcs] = useState<Svc[]>([])
  const [isSuper, setIsSuper] = useState(false)
  const [subs, setSubs] = useState<Sub[]>([])
  const [lessons, setLessons] = useState<LessonStat[]>([])
  const [log, setLog] = useState<LogRow[]>([])
  const [pays, setPays] = useState<Pay[]>([])
  const [tab, setTab] = useState<'subs' | 'delivery' | 'payments'>('subs')
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState<'all' | 'on' | 'free' | 'active' | 'paused' | 'ended'>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [act, setAct] = useState<{ sub: Sub; action: Act } | null>(null)
  const [reason, setReason] = useState('')
  const [days, setDays] = useState(30)
  const [adding, setAdding] = useState(false)
  const [candQ, setCandQ] = useState('')
  const [cands, setCands] = useState<Candidate[]>([])
  const [pick, setPick] = useState<Candidate | null>(null)
  const [editing, setEditing] = useState<{ name: string; tagline: string; price: string; free_days: string; period_days: string } | null>(null)
  const [hist, setHist] = useState<{ sub: Sub; rows: Hist[] | null } | null>(null)

  const svc = svcs.find(s => s.slug === 'weekly') || null
  const say = (ok: string, bad = '') => { setNotice(ok); setError(bad); if (ok) setTimeout(() => setNotice(''), 7000) }

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    const { data, error: e1 } = await supabase.rpc('services_overview')
    if (e1) { setError(e1.message); setLoading(false); return }
    const list = ((data as any)?.services || []) as Svc[]
    setSvcs(list); setIsSuper(!!(data as any)?.is_super)
    const w = list.find(s => s.slug === 'weekly')
    if (w) {
      const [a, b, c] = await Promise.all([
        supabase.rpc('services_subscribers', { p_service: w.id }),
        supabase.rpc('services_delivery', { p_service: w.id, p_days: 14 }),
        supabase.rpc('services_payments', { p_service: w.id }),
      ])
      const bad = a.error || b.error || c.error
      if (bad) setError(bad.message)
      setSubs((a.data as Sub[]) || [])
      setLessons(((b.data as any)?.lessons as LessonStat[]) || [])
      setLog(((b.data as any)?.log as LogRow[]) || [])
      setPays((c.data as Pay[]) || [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Find mothers to add by hand, a moment after typing stops.
  useEffect(() => {
    if (!adding || candQ.trim().length < 2) { setCands([]); return }
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('services_candidates', { p_q: candQ.trim() })
      if (e) setError(e.message); else setCands((data as Candidate[]) || [])
    }, 300)
    return () => clearTimeout(t)
  }, [candQ, adding])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return subs.filter(s => {
      if (statusF === 'on' && !['free', 'free_open', 'active'].includes(s.status)) return false
      if (statusF === 'free' && !['free', 'free_open'].includes(s.status)) return false
      if (statusF === 'active' && s.status !== 'active') return false
      if (statusF === 'paused' && s.status !== 'paused') return false
      if (statusF === 'ended' && !['stopped', 'expired'].includes(s.status)) return false
      if (needle && !(`${s.name} ${s.username} ${s.member_no}`.toLowerCase().includes(needle))) return false
      return true
    })
  }, [subs, q, statusF])

  const doAct = async () => {
    if (!act) return
    if (reason.trim().length < 3) { say('', 'Write the reason first.'); return }
    setBusy('act')
    const { error: e } = await supabase.rpc('services_sub_action', { p_sub: act.sub.id, p_action: act.action, p_reason: reason.trim(), p_days: act.action === 'extend' ? days : null })
    setBusy('')
    if (e) { say('', e.message); return }
    const done = { pause: 'paused', resume: 'back on the lessons', stop: 'stopped', extend: `given ${days} more day${days === 1 ? '' : 's'}` }[act.action]
    say(`${act.sub.name} is ${done}.`)
    setAct(null); setReason(''); load(true)
  }

  const doAdd = async () => {
    if (!svc || !pick) return
    if (reason.trim().length < 3) { say('', 'Write how she asked to be added, for example "she asked by phone".'); return }
    setBusy('add')
    const { error: e } = await supabase.rpc('services_add_subscriber', { p_service: svc.id, p_user: pick.user_id, p_reason: reason.trim() })
    setBusy('')
    if (e) { say('', e.message); return }
    say(`${pick.name} was added. Her first lesson goes out now if one is Ready for her week.`)
    setAdding(false); setPick(null); setCandQ(''); setReason(''); load(true)
  }

  const saveSettings = async () => {
    if (!svc || !editing) return
    const price = editing.price.trim() === '' ? null : Math.round(Number(editing.price.replace(/[, ]/g, '')))
    const free = Math.round(Number(editing.free_days)); const period = Math.round(Number(editing.period_days))
    if (editing.name.trim().length < 2) { say('', 'Give the service a name.'); return }
    if (price !== null && (!Number.isFinite(price) || price < 0)) { say('', 'The price must be a number of shillings, or left empty.'); return }
    if (!(free >= 0 && free <= 366) || !(period >= 1 && period <= 366)) { say('', 'Free days must be 0 to 366 and the paid period 1 to 366 days.'); return }
    setBusy('settings')
    const { error: e } = await supabase.rpc('services_update', { p_service: svc.id, p_name: editing.name.trim(), p_tagline: editing.tagline.trim(), p_price: price, p_free_days: free, p_period_days: period })
    setBusy('')
    if (e) { say('', e.message); return }
    say('Settings saved. A change to the free days applies to mothers who join from now on.')
    setEditing(null); load(true)
  }

  const setOpen = async (on: boolean) => {
    if (!svc) return
    if (!window.confirm(on ? 'Open joining? Mothers will see the invitation in Circle and can join the lessons.' : 'Close joining? Mothers already on the lessons keep receiving them. New mothers cannot join.')) return
    setBusy('open')
    try { await call('circle-weekly', { action: 'set_open', on }); say(on ? 'Joining is open.' : 'Joining is closed.') }
    catch (e: any) { say('', e?.message || String(e)) }
    setBusy(''); load(true)
  }

  const retry = async (id: string) => {
    setBusy('retry' + id)
    const { error: e } = await supabase.rpc('services_retry_send', { p_send: id })
    setBusy('')
    if (e) { say('', e.message); return }
    say('That lesson is being sent again.'); setTimeout(() => load(true), 4000)
  }

  const openHist = async (s: Sub) => {
    setHist({ sub: s, rows: null })
    const { data, error: e } = await supabase.rpc('services_history', { p_sub: s.id })
    if (e) { say('', e.message); setHist(null); return }
    setHist({ sub: s, rows: (data as Hist[]) || [] })
  }

  // Export what the open tab shows, as PDF or Excel. Written down first; the file is made only after that.
  const exportTab = async (format: 'pdf' | 'xlsx') => {
    if (!svc) return
    let title = '', head: string[] = [], body: (string | number)[][] = [], widths: number[] = [], confidential = false
    if (tab === 'subs') {
      title = 'Subscribers'; confidential = true
      head = ['Member no', 'Name', 'WhatsApp', 'Pregnancy week', 'Status', 'Joined', 'Covered until', 'Lessons sent', 'Last lesson', 'Last payment (TZS)', 'Last payment date', 'Added by']
      body = rows.map(s => [s.member_no, s.name, s.whatsapp ? local(s.whatsapp) : '', s.preg_week ?? '', STATUS_LABEL[s.status] + stopWord(s), day(s.started_at), covered(s), s.lessons_sent, lastLesson(s), s.last_payment ? s.last_payment.amount : '', s.last_payment ? day(s.last_payment.at) : '', s.added_by_name || ''])
      widths = [10, 26, 16, 12, 26, 14, 20, 10, 34, 16, 16, 20]
    } else if (tab === 'delivery') {
      title = 'Delivery, last 14 days'
      head = ['Week', 'Lesson', 'Topic', 'Last sent', 'Sent', 'Delivered', 'Read', 'Failed', 'Waiting']
      body = lessons.map(l => [l.week, l.position, l.topic, dayTime(l.last_at), l.sent, l.delivered, l.read, l.failed, l.waiting])
      widths = [8, 8, 44, 18, 8, 10, 8, 8, 9]
    } else {
      title = 'Payments'; confidential = true
      head = ['Date', 'Member no', 'Name', 'Amount (TZS)', 'Through', 'Reference', 'Status', 'Covers from', 'Covers until']
      body = pays.map(p => [dayTime(p.completed_at || p.created_at), p.member_no ?? '', p.payer_name || '', p.amount_tzs, p.provider, p.provider_ref || '', p.status, day(p.covers_from), day(p.covers_until)])
      widths = [18, 10, 26, 14, 10, 20, 12, 14, 14]
    }
    if (!body.length) { say('', 'There is nothing in this tab to export.'); return }
    const label = format === 'pdf' ? 'PDF' : 'Excel'
    if (!window.confirm(`Export ${body.length} row${body.length === 1 ? '' : 's'} of ${title.toLowerCase()} as ${label}?${confidential ? '\n\nThe file holds mothers\' names' + (tab === 'subs' ? ' and WhatsApp numbers' : '') + '.' : ''} This export is recorded with your name.`)) return
    setBusy('export')
    const { error: e } = await supabase.rpc('services_export_log', { p_what: `${svc.slug}:${tab}`, p_rows: body.length, p_filters: { format, status: statusF, search: q.trim() || null } })
    if (e) { say('', `Nothing was exported: ${e.message}`); setBusy(''); return }
    const fileBase = `Malkia-Services-${svc.slug}-${tab}-${new Date().toISOString().slice(0, 10)}`
    try {
      if (format === 'xlsx') {
        const ws = XLSX.utils.aoa_to_sheet([head, ...body])
        ws['!cols'] = widths.map(wch => ({ wch }))
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30))
        XLSX.writeFile(wb, `${fileBase}.xlsx`)
        say(`Exported ${body.length} row${body.length === 1 ? '' : 's'} as Excel. The export was recorded.`)
      } else {
        const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const numeric = (v: unknown) => typeof v === 'number'
        const trs = body.map(r => `<tr>${r.map(c => `<td${numeric(c) ? ' class="num"' : ''}>${esc(numeric(c) ? (c as number).toLocaleString('en-US') : c)}</td>`).join('')}</tr>`).join('')
        const res = printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileBase}</title>
          <style>
            @page{size:A4 landscape;margin:12mm}
            *{box-sizing:border-box;margin:0;padding:0}
            body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;padding:8px}
            .brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #5EA8A2;padding-bottom:10px;margin-bottom:12px}
            .brand h1{font-size:20px;color:#5E2230}
            .brand .co{font-size:12px;color:#5EA8A2;font-weight:700;letter-spacing:.5px;text-align:right}
            .meta{font-size:10.5px;color:#555;margin-bottom:12px;line-height:1.5}
            table{width:100%;border-collapse:collapse;font-size:10px}
            th{background:#5EA8A2;color:#fff;text-align:left;padding:6px 7px;font-size:8.5px;text-transform:uppercase;letter-spacing:.3px}
            td{padding:5px 7px;border-bottom:1px solid #eee;vertical-align:top}
            tr:nth-child(even) td{background:#f7faf9}
            tr{break-inside:avoid}
            .num{text-align:right;font-variant-numeric:tabular-nums}
            .foot{margin-top:14px;font-size:9px;color:#777;display:flex;justify-content:space-between;border-top:1px solid #ddd;padding-top:8px}
          </style></head><body>
          <div class="brand"><h1>${esc(svc.name)}: ${esc(title)}</h1><div class="co">MALKIA WELLNESS GROUP LTD<br>Your partner in motherhood</div></div>
          <div class="meta"><b>${body.length}</b> row${body.length === 1 ? '' : 's'}${tab === 'subs' && statusF !== 'all' ? ' &middot; filtered' : ''}${q.trim() && tab === 'subs' ? ` &middot; Search: ${esc(q.trim())}` : ''}<br>Printed ${esc(new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
          <table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${trs}</tbody></table>
          <div class="foot"><span>${confidential ? 'Confidential. Holds mothers\' details. Do not share outside Malkia.' : 'Malkia Wellness Group Ltd'}</span><span>www.malkia.co.tz &middot; @malkia_tz</span></div>
          </body></html>`)
        if (!res.ok) say('', `The export was recorded, but the PDF could not open: ${res.error || 'the browser blocked printing'}. Allow pop-ups for MalkiaOS and try again.`)
        else say('The print window opened. Choose "Save as PDF" as the printer. The export was recorded.')
      }
    } catch (err: any) { say('', `The export was recorded, but the file could not be made: ${err?.message || err}`) }
    setBusy('')
  }

  // ── look ──
  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, marginBottom: 12 }
  const inp: React.CSSProperties = { padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
  const primary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }
  const mini: React.CSSProperties = { ...btn, padding: '5px 8px', fontSize: 12, fontWeight: 600, background: 'transparent' }
  const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }
  const thS: React.CSSProperties = { textAlign: 'left', padding: '10px 10px', fontSize: 11, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 800, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '10px 10px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
  const lab: React.CSSProperties = { ...muted, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }
  const iconBox = (on = false): React.CSSProperties => ({ width: 38, height: 38, borderRadius: 10, background: on ? 'var(--accent)' : 'var(--accent-dim, rgba(0,0,0,.06))', color: on ? '#fff' : 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none' })
  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }
  const modal: React.CSSProperties = { ...card, marginBottom: 0, width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }
  const pill = (st: Status) => <span style={{ background: STATUS_COLOR[st][0], color: STATUS_COLOR[st][1], fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{STATUS_LABEL[st]}</span>
  const stat = (icon: string, value: number, label: string, key: typeof statusF) => {
    const on = statusF === key && tab === 'subs' && key !== 'all'
    return (
      <button type="button" onClick={() => { setTab('subs'); setStatusF(on ? 'all' : key) }} title={on ? 'Showing these in the list. Click to show everyone.' : 'Click to see these mothers in the list'}
        style={{ ...card, marginBottom: 0, display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderColor: on ? 'var(--accent)' : 'var(--border)', boxShadow: on ? '0 0 0 1px var(--accent)' : 'none' }}>
        <div style={iconBox(on)}><Icon name={icon} size={19} /></div>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div><div style={muted}>{label}</div></div>
      </button>
    )
  }

  const frame = (children: React.ReactNode) => (
    <div style={{ padding: '20px 24px', width: '100%', maxWidth: CIRCLE_WIDTH, margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}><Icon name="star" size={14} />Wellness Group</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Services</h1>
        <div style={{ ...muted, marginTop: 4, maxWidth: 760 }}>Everything Malkia sells that is not a physical product. One card per service.</div>
      </div>
      {children}
    </div>
  )

  if (loading) return frame(<div style={muted}>Loading services...</div>)
  if (!svc) return frame(<div style={{ ...card, borderColor: '#E3A5A5', background: '#FCEDED', color: '#8F1D1D', fontSize: 13.5 }}>{error || 'No service has been set up yet.'}</div>)

  // What still stands between this service and a mother receiving lessons.
  const blockers: string[] = []
  if (!svc.template_ok) blockers.push('Meta has not approved a weekly message yet.')
  if (!svc.lessons_ready) blockers.push('No lesson is marked Ready yet, so nothing can be sent.')
  if (svc.price_tzs == null) blockers.push('No price is set yet. It is needed before payments are switched on.')
  if (svc.gaps.length) blockers.push(`${svc.gaps.reduce((n, g) => n + g.mothers, 0)} mother${svc.gaps.reduce((n, g) => n + g.mothers, 0) === 1 ? ' has' : 's have'} no Ready lesson waiting for their week (week ${svc.gaps.map(g => g.week).join(', ')}).`)

  return frame(<>
    {notice && <div style={{ ...card, borderColor: '#A9D9B4', background: '#EAF8EE', color: '#1E6B34', fontSize: 13 }}>{notice}</div>}
    {error && <div style={{ ...card, borderColor: '#E3A5A5', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>{error}</div>}

    {/* one card per service */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 }}>
      <div style={{ ...card, marginBottom: 0, borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--accent)' }}>Subscription</span>
          <span style={{ background: svc.is_open ? '#E3F4EC' : '#ECEFF0', color: svc.is_open ? '#14613D' : '#4A5654', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{svc.is_open ? 'Joining open' : 'Joining closed'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px' }}>
          <div style={iconBox(true)}><Icon name="send" size={19} /></div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{svc.name}</div>
        </div>
        <div style={muted}>{svc.tagline || 'Week by week pregnancy lessons on WhatsApp'}</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
          <div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{svc.counts.on}</div><div style={muted}>on the lessons</div></div>
          <div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{svc.price_tzs != null ? tzs(svc.price_tzs) : 'No price yet'}</div><div style={muted}>per {svc.period_days} days</div></div>
        </div>
      </div>
      {[['chat', 'One-off booking', 'Consultations', 'Midwife or doctor, by time slot.'], ['book', 'One-off purchase', 'Courses', 'Birth class and others.']].map(([ic, kind, name, line]) => (
        <div key={name} style={{ ...card, marginBottom: 0, borderStyle: 'dashed', opacity: .75 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--text3)' }}>{kind}</span>
            <span style={{ background: 'var(--surface2)', color: 'var(--text3)', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>Not built yet</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px' }}>
            <div style={{ ...iconBox(), color: 'var(--text3)' }}><Icon name={ic} size={19} /></div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{name}</div>
          </div>
          <div style={muted}>{line} Added to this page later.</div>
        </div>
      ))}
    </div>

    {/* settings */}
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div style={h2}><Icon name="send" size={17} />Service settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
            <div><div style={lab}><Icon name="edit" size={13} />Name</div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{svc.name}</div></div>
            <div><div style={lab}><Icon name="tag" size={13} />Price</div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{svc.price_tzs != null ? `${tzs(svc.price_tzs)} per ${svc.period_days} days` : 'Not set'}</div></div>
            <div><div style={lab}><Icon name="gift" size={13} />Free period</div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>First {svc.free_days} days</div></div>
            <div><div style={lab}><Icon name="calendar" size={13} />Sends</div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Mon, Wed, Sat 10:00</div></div>
            <div><div style={lab}><Icon name="card" size={13} />Payments</div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{svc.payments_live ? 'Switched on' : 'Not switched on yet'}</div></div>
          </div>
          <div style={{ ...muted, marginTop: 12 }}>
            Lessons Ready: {svc.lessons_ready} of {svc.lessons_total} loaded.{' '}
            {onNav && <button type="button" onClick={() => onNav('circle-messages')} style={{ ...mini, padding: 0, border: 'none', color: 'var(--accent)', fontWeight: 700 }}>Open lessons in Circle Messages<Icon name="arrow" size={12} /></button>}
          </div>
          {!svc.payments_live && <div style={{ ...muted, marginTop: 6 }}>Until payments are switched on, a mother whose free days have ended keeps receiving lessons. Nobody is cut off for not paying when she has no way to pay.</div>}
        </div>
        {isSuper && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={btn} disabled={!!busy} onClick={() => setEditing({ name: svc.name, tagline: svc.tagline || '', price: svc.price_tzs != null ? String(svc.price_tzs) : '', free_days: String(svc.free_days), period_days: String(svc.period_days) })}><Icon name="edit" size={14} />Edit settings</button>
            <button style={svc.is_open ? { ...btn, color: '#9C1F17' } : primary} disabled={!!busy} onClick={() => setOpen(!svc.is_open)}><Icon name={svc.is_open ? 'lock' : 'unlock'} size={14} />{busy === 'open' ? 'Working...' : svc.is_open ? 'Close joining' : 'Open joining'}</button>
          </div>
        )}
      </div>
      {blockers.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#FFF6E0', border: '1px solid #ECD49A', color: '#6B4A00', fontSize: 13 }}>
          <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><Icon name="alert" size={15} />Needs attention</div>
          {blockers.map(b => <div key={b} style={{ lineHeight: 1.6 }}>{b}</div>)}
        </div>
      )}
    </div>

    {/* numbers */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}>
      {stat('users', svc.counts.on, 'on the lessons now', 'on')}
      {stat('gift', svc.counts.free, 'in free period', 'free')}
      {stat('card', svc.counts.paying, 'paying', 'active')}
      {stat('pause', svc.counts.paused, 'paused', 'paused')}
      {stat('xcircle', svc.counts.stopped + svc.counts.expired, 'stopped or expired', 'ended')}
    </div>

    {/* tabs and export */}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([['subs', 'Subscribers', 'users'], ['delivery', 'Delivery', 'send'], ['payments', 'Payments', 'card']] as const).map(([k, l, ic]) => (
          <button key={k} onClick={() => setTab(k)} style={tab === k ? { ...primary, padding: '9px 14px' } : { ...btn, padding: '9px 14px' }}><Icon name={ic} size={14} />{l}</button>
        ))}
      </div>
      {isSuper && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={muted}><Icon name="download" size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{busy === 'export' ? 'Exporting...' : 'Export this tab as'}</span>
          <button style={primary} onClick={() => exportTab('pdf')} disabled={!!busy}>PDF</button>
          <button style={btn} onClick={() => exportTab('xlsx')} disabled={!!busy}>Excel</button>
        </div>
      )}
    </div>

    {tab === 'subs' && (
      <div style={card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text3)' }} />
            <input style={{ ...inp, paddingLeft: 30 }} placeholder="Search name or member number" value={q} onChange={e => setQ(e.target.value)} aria-label="Search subscribers" />
          </div>
          <select style={{ ...inp, width: 'auto' }} value={statusF} onChange={e => setStatusF(e.target.value as typeof statusF)} aria-label="Status">
            <option value="all">Status: all</option><option value="on">On the lessons now</option><option value="free">Free period</option><option value="active">Paying</option><option value="paused">Paused</option><option value="ended">Stopped or expired</option>
          </select>
          <button style={primary} disabled={!!busy} onClick={() => { setAdding(true); setPick(null); setCandQ(''); setReason('') }}><Icon name="plus" size={14} />Add a mother</button>
        </div>
        {rows.length === 0 ? (
          <div style={{ ...muted, padding: '26px 8px', textAlign: 'center' }}>
            {subs.length === 0 ? (svc.is_open ? 'Nobody has joined yet.' : 'Nobody has joined yet. Joining is closed, so mothers do not see the invitation in Circle.') : 'No subscriber matches this search or filter.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thS}>Mother</th>{isSuper && <th style={thS}>WhatsApp</th>}<th style={thS}>Week</th><th style={thS}>Status</th><th style={thS}>Covered until</th><th style={thS}>Last lesson</th><th style={thS}>Last payment</th><th style={thS}>Actions</th>
              </tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id}>
                    <td style={td}><b>{s.name}</b>{s.is_test && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, background: 'var(--surface2)', color: 'var(--text3)', padding: '1px 6px', borderRadius: 8 }}>TEST</span>}
                      <div style={{ ...muted, fontSize: 11.5 }}>Malkia Mama #{s.member_no} · joined {day(s.started_at)}{s.added_by_name ? ` · added by ${s.added_by_name}` : ''}</div></td>
                    {isSuper && <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{s.whatsapp ? local(s.whatsapp) : ''}</td>}
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{s.preg_week != null && s.preg_week >= 0 && s.preg_week <= 43 ? `Week ${s.preg_week}` : 'Not known'}</td>
                    <td style={td}>{pill(s.status)}{s.status === 'stopped' && <div style={{ ...muted, fontSize: 11.5, marginTop: 3 }}>{day(s.stopped_at)}{stopWord(s)}</div>}{s.status === 'paused' && s.pause_reason && <div style={{ ...muted, fontSize: 11.5, marginTop: 3 }}>{s.pause_reason}</div>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{covered(s)}</td>
                    <td style={td}>{s.last_send ? <>Week {s.last_send.week}, lesson {s.last_send.position}<div style={{ ...muted, fontSize: 11.5 }}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: SEND_DOT[s.last_send.status] || '#888', marginRight: 5 }} />{SEND_LABEL[s.last_send.status] || s.last_send.status} · {dayTime(s.last_send.at)}</div></> : <span style={muted}>None yet</span>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{s.last_payment ? <>{tzs(s.last_payment.amount)}<div style={{ ...muted, fontSize: 11.5 }}>{day(s.last_payment.at)}</div></> : <span style={muted}>None yet</span>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {s.status === 'paused'
                        ? <button style={mini} title="Put her back on the lessons" onClick={() => { setAct({ sub: s, action: 'resume' }); setReason('') }}><Icon name="play" size={13} />Resume</button>
                        : s.status !== 'stopped' && <button style={mini} title="Hold her lessons for now" onClick={() => { setAct({ sub: s, action: 'pause' }); setReason('') }}><Icon name="pause" size={13} />Pause</button>}
                      {s.status !== 'stopped' && <button style={{ ...mini, marginLeft: 4 }} title="Add free days" onClick={() => { setAct({ sub: s, action: 'extend' }); setReason(''); setDays(30) }}><Icon name="gift" size={13} />Extend</button>}
                      {s.status !== 'stopped' && <button style={{ ...mini, marginLeft: 4, color: '#B3261E' }} title="Take her off the lessons" onClick={() => { setAct({ sub: s, action: 'stop' }); setReason('') }}><Icon name="xcircle" size={13} />Stop</button>}
                      <button style={{ ...mini, marginLeft: 4 }} title="What has happened on this subscription" onClick={() => openHist(s)}><Icon name="history" size={13} />History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ ...muted, marginTop: 12 }}>Pause, extend and stop each ask for a reason and are recorded with your name.{isSuper ? '' : ' WhatsApp numbers are shown to super admins only.'}</div>
      </div>
    )}

    {tab === 'delivery' && (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0 }}>
          {lessons.length === 0 && <div style={{ ...card, ...muted, textAlign: 'center', padding: '26px 16px' }}>No lesson has been sent in the last 14 days.</div>}
          {lessons.map(l => (
            <div key={`${l.week}-${l.position}`} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                  <div style={iconBox()}><Icon name="baby" size={19} /></div>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Week {l.week}, lesson {l.position}</div><div style={muted}>{l.topic} · last sent {dayTime(l.last_at)}</div></div>
                </div>
                <span style={{ background: '#E3F4EC', color: '#14613D', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, alignSelf: 'flex-start' }}>{l.sent} sent</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10, marginTop: 14, textAlign: 'center' }}>
                {([['send', 'Sent', l.sent, 'var(--text)'], ['check', 'Delivered', l.delivered, '#14613D'], ['eye', 'Read', l.read, '#2C56B8'], ['alert', 'Failed', l.failed, '#B3261E'], ['clock', 'Waiting', l.waiting, '#9A5B00']] as const).map(([ic, t, n, col]) => (
                  <div key={t}><div style={{ fontSize: 20, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums' }}>{n}{(t === 'Delivered' || t === 'Read') && l.sent > 0 ? <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 5 }}>{Math.round(n * 100 / l.sent)}%</span> : null}</div><div style={{ ...muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Icon name={ic} size={12} />{t}</div></div>
                ))}
              </div>
            </div>
          ))}
          <div style={muted}>Read counts only mothers who have read receipts switched on in WhatsApp, so the real figure is higher. Figures cover the last 14 days.</div>
        </div>
        <div style={{ ...card, flex: '1 1 300px', marginBottom: 0 }}>
          <div style={{ ...h2, marginBottom: 6 }}><Icon name="clock" size={16} />Delivery log</div>
          {log.length === 0 && <div style={{ ...muted, padding: '14px 0' }}>Nothing sent yet.</div>}
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {log.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                  <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 5, background: SEND_DOT[r.status] || '#888', marginTop: 5, flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Week {r.week}, lesson {r.position}{r.trigger === 'first' ? ' · first lesson' : ''}</div>
                    <div style={muted}>{r.name} · {SEND_LABEL[r.status] || r.status}</div>
                    {r.status === 'failed' && <div style={{ fontSize: 12, color: '#B3261E', marginTop: 2 }}>{r.error || 'No reason given by WhatsApp.'} <button style={{ ...mini, marginLeft: 4 }} disabled={!!busy} onClick={() => retry(r.id)}><Icon name="refresh" size={12} />{busy === 'retry' + r.id ? 'Sending...' : 'Send again'}</button></div>}
                  </div>
                </div>
                <div style={{ ...muted, whiteSpace: 'nowrap' }}>{ago(r.at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {tab === 'payments' && (pays.length === 0 ? (
      <div style={{ ...card, borderStyle: 'dashed', textAlign: 'center', padding: '34px 20px' }}>
        <div style={{ ...iconBox(), margin: '0 auto 10px', width: 46, height: 46 }}><Icon name="card" size={22} /></div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{svc.payments_live ? 'No payment has come in yet' : 'Payments start when Snippe is connected'}</div>
        <div style={{ ...muted, maxWidth: 560, margin: '8px auto 0' }}>This tab lists each payment: mother, amount, mobile money reference, date, and the days it covers. {svc.payments_live ? '' : 'Until then every subscriber stays covered, and staff can add free days by hand from the Subscribers tab.'}</div>
      </div>
    ) : (
      <div style={card}><div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thS}>Date</th><th style={thS}>Mother</th><th style={{ ...thS, textAlign: 'right' }}>Amount</th><th style={thS}>Through</th><th style={thS}>Reference</th><th style={thS}>Status</th><th style={thS}>Covers</th></tr></thead>
          <tbody>{pays.map(p => (
            <tr key={p.id}>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{dayTime(p.completed_at || p.created_at)}</td>
              <td style={td}><b>{p.payer_name || 'Unknown'}</b>{p.member_no != null && <div style={{ ...muted, fontSize: 11.5 }}>Malkia Mama #{p.member_no}</div>}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tzs(p.amount_tzs)}</td>
              <td style={td}>{p.provider}{p.channel ? ` · ${p.channel}` : ''}</td>
              <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{p.provider_ref || ''}</td>
              <td style={td}>{p.status}{p.note && <div style={{ fontSize: 11.5, color: '#B3261E' }}>{p.note}</div>}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{p.covers_from ? `${day(p.covers_from)} to ${day(p.covers_until)}` : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div></div>
    ))}

    {/* pause, resume, stop, extend */}
    {act && (
      <div style={overlay} onClick={() => !busy && setAct(null)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <div style={h2}><Icon name={{ pause: 'pause', resume: 'play', stop: 'xcircle', extend: 'gift' }[act.action]} size={17} />{{ pause: 'Pause', resume: 'Resume', stop: 'Stop', extend: 'Add free days for' }[act.action]} {act.sub.name}</div>
          <div style={{ ...muted, margin: '8px 0 12px' }}>{{
            pause: 'She receives no lessons while paused. Her cover does not move. You can resume her at any time.',
            resume: 'She goes back on the lessons from the next send.',
            stop: 'She is taken off the lessons, the same as if she had stopped from Circle. She can join again herself, or be added again here.',
            extend: 'The days are added after the cover she already has, so nothing she has is lost.',
          }[act.action]}</div>
          {act.action === 'extend' && <label style={{ display: 'block', marginBottom: 10 }}><span style={lab}>Days to add</span><input style={inp} type="number" min={1} max={366} value={days} onChange={e => setDays(Math.round(Number(e.target.value)))} /></label>}
          <label style={{ display: 'block' }}><span style={lab}>Reason (recorded with your name)</span><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={reason} onChange={e => setReason(e.target.value)} autoFocus /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button style={btn} disabled={!!busy} onClick={() => setAct(null)}>Cancel</button>
            <button style={act.action === 'stop' ? { ...primary, background: '#B3261E' } : primary} disabled={!!busy} onClick={doAct}>{busy === 'act' ? 'Saving...' : { pause: 'Pause her', resume: 'Resume her', stop: 'Stop her lessons', extend: 'Add the days' }[act.action]}</button>
          </div>
        </div>
      </div>
    )}

    {/* add a mother by hand */}
    {adding && (
      <div style={overlay} onClick={() => !busy && setAdding(false)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <div style={h2}><Icon name="plus" size={17} />Add a mother to {svc.name}</div>
          <div style={{ ...muted, margin: '8px 0 12px' }}>For a mother who asked Malkia directly. She has not ticked the terms herself, so write how she asked. Only pregnant Circle members with a due date can be added.</div>
          {!pick ? <>
            <input style={inp} placeholder="Type her name, username or member number" value={candQ} onChange={e => setCandQ(e.target.value)} autoFocus aria-label="Find a mother" />
            <div style={{ marginTop: 8 }}>
              {candQ.trim().length >= 2 && cands.length === 0 && <div style={muted}>No pregnant member matches who is not already on the lessons.</div>}
              {cands.map(c => (
                <button key={c.user_id} type="button" onClick={() => setPick(c)} style={{ ...btn, width: '100%', justifyContent: 'space-between', marginBottom: 6, padding: '10px 12px' }}>
                  <span><b>{c.name}</b> <span style={{ color: 'var(--text3)', fontWeight: 500 }}>Malkia Mama #{c.member_no}</span></span><span style={{ color: 'var(--text3)', fontWeight: 600 }}>{c.preg_week != null ? `Week ${c.preg_week}` : ''}</span>
                </button>
              ))}
            </div>
          </> : <>
            <div style={{ ...card, background: 'var(--surface2)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div><b style={{ color: 'var(--text)' }}>{pick.name}</b><div style={muted}>Malkia Mama #{pick.member_no}{pick.preg_week != null ? ` · week ${pick.preg_week}` : ''}</div></div>
              <button style={mini} onClick={() => setPick(null)}>Change</button>
            </div>
            <label style={{ display: 'block' }}><span style={lab}>How did she ask? (recorded with your name)</span><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={reason} onChange={e => setReason(e.target.value)} autoFocus /></label>
            <div style={{ ...muted, marginTop: 8 }}>She gets {svc.free_days} free days from today, and her first lesson goes out straight away if one is Ready for her week.</div>
          </>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button style={btn} disabled={!!busy} onClick={() => setAdding(false)}>Cancel</button>
            {pick && <button style={primary} disabled={!!busy} onClick={doAdd}>{busy === 'add' ? 'Adding...' : 'Add her'}</button>}
          </div>
        </div>
      </div>
    )}

    {/* name, price, free days */}
    {editing && (
      <div style={overlay} onClick={() => !busy && setEditing(null)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <div style={h2}><Icon name="edit" size={17} />Service settings</div>
          <label style={{ display: 'block', marginTop: 12 }}><span style={lab}><Icon name="edit" size={13} />Name (what staff and reports call it)</span><input style={inp} value={editing.name} maxLength={80} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
          <label style={{ display: 'block', marginTop: 10 }}><span style={lab}>One line about it</span><input style={inp} value={editing.tagline} maxLength={140} onChange={e => setEditing({ ...editing, tagline: e.target.value })} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <label><span style={lab}><Icon name="tag" size={13} />Price (TZS)</span><input style={inp} inputMode="numeric" placeholder="Not set" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} /></label>
            <label><span style={lab}><Icon name="calendar" size={13} />Paid period (days)</span><input style={inp} type="number" min={1} max={366} value={editing.period_days} onChange={e => setEditing({ ...editing, period_days: e.target.value })} /></label>
            <label><span style={lab}><Icon name="gift" size={13} />Free days</span><input style={inp} type="number" min={0} max={366} value={editing.free_days} onChange={e => setEditing({ ...editing, free_days: e.target.value })} /></label>
          </div>
          <div style={{ ...muted, marginTop: 10 }}>The price is what one payment will be once payments are switched on, and how many days it buys. Changing the free days applies to mothers who join from now on, not to those already on the lessons.</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button style={btn} disabled={!!busy} onClick={() => setEditing(null)}>Cancel</button>
            <button style={primary} disabled={!!busy} onClick={saveSettings}>{busy === 'settings' ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    )}

    {/* what has happened on one subscription */}
    {hist && (
      <div style={overlay} onClick={() => setHist(null)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={h2}><Icon name="history" size={17} />{hist.sub.name}</div>
            <button style={mini} onClick={() => setHist(null)} aria-label="Close"><Icon name="x" size={15} /></button>
          </div>
          <div style={{ ...muted, margin: '6px 0 10px' }}>{STATUS_LABEL[hist.sub.status]} · {hist.sub.lessons_sent} lesson{hist.sub.lessons_sent === 1 ? '' : 's'} sent · covered: {covered(hist.sub).toLowerCase()}</div>
          {!hist.rows ? <div style={muted}>Loading...</div> : hist.rows.length === 0 ? <div style={muted}>Nothing recorded yet.</div> : hist.rows.map((h, i) => (
            <div key={i} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: 'var(--text)' }}><b>{ACT_LABEL[h.action] || h.action}{h.action === 'extend' && h.days ? `: ${h.days} days` : ''}</b><span style={muted}>{dayTime(h.at)}</span></div>
              {(h.by_name || h.reason) && <div style={muted}>{h.by_name ? `By ${h.by_name}` : ''}{h.by_name && h.reason ? ' · ' : ''}{h.reason || ''}</div>}
            </div>
          ))}
        </div>
      </div>
    )}
  </>)
}
