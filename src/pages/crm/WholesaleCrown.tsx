// WholesaleCrown.tsx: Malkia Crown for wholesalers (Joe, 23 Nov 2026).
//
// A loyalty programme for wholesale customers:
//   - a wholesaler earns points on the money they actually pay (not on invoices raised)
//   - an administrator turns points into a credit note, which lowers what the wholesaler
//     owes on their next order
//
//   Wholesalers   who is in, their points and what the points are worth
//   Credit notes  every conversion, with its CN number
//   History       every movement of points
//   WhatsApp      the three agreed messages and Meta's decision on each
//   Settings      the on/off switch and the rates
//
// The programme is OFF until an administrator switches it on, and nobody is enrolled
// until someone enrols them. Nothing on this page sends a message or posts a credit
// note by itself: each one is a button a person presses.
//
// All rules live in the database (migration 098). This page draws what it is given and
// shows the database's own message when something is refused.
import { useEffect, useMemo, useState } from 'react'
import type { Page } from '../../lib/types'
import { waTemplates } from '../../lib/wa'
import {
  crownOverview, crownCandidates, crownActivity, crownRedemptions, crownPaid90d, crownSaveSettings, crownEnroll,
  crownSetActive, crownAdjust, crownRedeem, crownMarkSent, sendCrownMessage, crownVars, fillTemplate, fmtNum,
  CROWN_TEMPLATES,
  type CrownOverview, type CrownMember, type CrownCandidate, type CrownActivity, type CrownRedemption,
  type CrownSettings, type CrownMessageKind, type ApprovedTemplate, type CrownRedeemResult,
} from '../../lib/crownWholesale'

type Tab = 'members' | 'credits' | 'history' | 'whatsapp' | 'settings'

const I = {
  crown: 'M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z M3 20h18',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  coins: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4',
  history: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6v6l4 2',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  plus: 'M12 5v14 M5 12h14',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  close: 'M18 6L6 18 M6 6l12 12',
}
const Ico = ({ d, size = 16, color = 'currentColor' }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
)

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const KIND: Record<string, { label: string; bg: string; fg: string }> = {
  earn: { label: 'Earned', bg: '#DFF3E3', fg: '#1E6B34' },
  redeem: { label: 'Credit note', bg: '#E4ECFB', fg: '#1F4FA3' },
  reversal: { label: 'Taken back', bg: '#FCEDED', fg: '#8F1D1D' },
  adjust: { label: 'Correction', bg: '#FFF6DA', fg: '#7A5B00' },
}
const TPL_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  none: { label: 'Not sent to Meta yet', bg: 'var(--surface2)', fg: 'var(--text2)' },
  approved: { label: 'Approved by Meta', bg: '#DFF3E3', fg: '#1E6B34' },
  pending: { label: 'Waiting for Meta', bg: '#FFF6DA', fg: '#7A5B00' },
  rejected: { label: 'Rejected by Meta', bg: '#FCEDED', fg: '#8F1D1D' },
  paused: { label: 'Paused by Meta', bg: '#FCEDED', fg: '#8F1D1D' },
  disabled: { label: 'Disabled by Meta', bg: '#FCEDED', fg: '#8F1D1D' },
  unknown: { label: 'Status not known', bg: 'var(--surface2)', fg: 'var(--text2)' },
}

export default function WholesaleCrown({ onNav }: { onNav: (p: Page) => void }) {
  const [data, setData] = useState<CrownOverview | null>(null)
  const [tab, setTab] = useState<Tab>('members')
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')

  const [candidates, setCandidates] = useState<CrownCandidate[] | null>(null)   // enrol dialog
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [convert, setConvert] = useState<CrownMember | null>(null)
  const [convPoints, setConvPoints] = useState('')
  const [convNote, setConvNote] = useState('')
  const [done, setDone] = useState<(CrownRedeemResult & { member: CrownMember }) | null>(null)
  const [adjust, setAdjust] = useState<CrownMember | null>(null)
  const [adjPoints, setAdjPoints] = useState('')
  const [adjNote, setAdjNote] = useState('')

  const [credits, setCredits] = useState<CrownRedemption[] | null>(null)
  const [history, setHistory] = useState<CrownActivity[] | null>(null)
  const [templates, setTemplates] = useState<ApprovedTemplate[] | null>(null)
  const [canSubmitTpl, setCanSubmitTpl] = useState(false)
  const [tplProblems, setTplProblems] = useState<Record<string, string[]>>({})
  const [form, setForm] = useState<Partial<Record<keyof CrownSettings, string | boolean>>>({})
  const [paid90, setPaid90] = useState<number | null>(null)

  const manage = data?.role === 'manage'
  const s = data?.settings

  const load = async () => {
    try {
      const d = await crownOverview()
      setData(d); setLoadError('')
      setForm({
        is_on: d.settings.is_on, start_date: d.settings.start_date || '', tzs_per_point: String(Number(d.settings.tzs_per_point)),
        point_value_tzs: String(Number(d.settings.point_value_tzs)), min_redeem_points: String(d.settings.min_redeem_points),
        block_if_overdue: d.settings.block_if_overdue, discount_account_code: d.settings.discount_account_code,
      })
    } catch (e: any) { setLoadError(e?.message || 'Could not load Malkia Crown.') }
  }
  const loadTemplates = async () => {
    try {
      const r = await waTemplates({ action: 'list' })
      const names = CROWN_TEMPLATES.map(t => t.name)
      setTemplates(((r.templates || []) as ApprovedTemplate[]).filter(t => names.includes(t.name)))
      setCanSubmitTpl(!!r.can_create)
    } catch (e: any) { setTemplates([]); setError(`Could not check the WhatsApp messages with Meta. ${e?.message || ''}`) }
  }
  useEffect(() => { load(); loadTemplates() }, [])
  useEffect(() => {
    if (tab === 'credits') crownRedemptions().then(setCredits).catch(e => setError(e.message))
    if (tab === 'history') crownActivity(null).then(setHistory).catch(e => setError(e.message))
    if (tab === 'settings' && paid90 === null) crownPaid90d().then(v => setPaid90(Number(v))).catch(() => setPaid90(null))
  }, [tab])

  const tplFor = (kind: CrownMessageKind) => {
    const def = CROWN_TEMPLATES.find(t => t.kind === kind)!
    return { def, tpl: (templates || []).find(t => t.name === def.name) || null }
  }
  const tplReady = (kind: CrownMessageKind) => tplFor(kind).tpl?.status === 'approved'

  const act = async (id: string, job: () => Promise<string | void>) => {
    setBusy(id); setError(''); setNotice('')
    try { const msg = await job(); if (msg) setNotice(msg) }
    catch (e: any) { setError(e?.message || 'Something went wrong.') }
    setBusy('')
  }

  const members = useMemo(() => {
    const list = data?.members || []
    const t = q.trim().toLowerCase()
    return t ? list.filter(m => (m.name || '').toLowerCase().includes(t) || (m.code || '').toLowerCase().includes(t) || (m.whatsapp || '').includes(t)) : list
  }, [data, q])

  // ── actions ──────────────────────────────────────────────────────────────
  const openEnroll = () => act('cand', async () => { setPicked(new Set()); setCandidates(await crownCandidates()) })
  const doEnroll = () => act('enroll', async () => {
    const n = await crownEnroll([...picked])
    setCandidates(null); await load()
    return `${n} wholesaler${n === 1 ? '' : 's'} enrolled. They earn points on payments made from today.`
  })
  const setActive = (m: CrownMember, on: boolean) => {
    if (!on && !window.confirm(`Take ${m.name} out of Malkia Crown?\n\nThey stop earning points. The ${fmtNum(m.points)} points they have stay on record and can still be turned into a credit note.`)) return
    act('act' + m.customer_id, async () => { await crownSetActive(m.customer_id, on); await load(); return on ? `${m.name} is back in the programme and earns from today.` : `${m.name} was taken out of the programme.` })
  }
  const openConvert = (m: CrownMember) => { setConvert(m); setConvPoints(String(m.points)); setConvNote(''); setError(''); setNotice('') }
  const doConvert = () => {
    if (!convert || !s) return
    const pts = Math.floor(Number(convPoints))
    const amount = Math.round(pts * Number(s.point_value_tzs))
    if (!window.confirm(`Issue a credit note of TZS ${fmtNum(amount)} to ${convert.name} for ${fmtNum(pts)} points?\n\nThis posts to the books at once: it lowers what ${convert.name} owes by TZS ${fmtNum(amount)} and records the same amount as a sales discount. It cannot be undone from here.`)) return
    act('convert', async () => {
      const r = await crownRedeem(convert.customer_id, pts, convNote)
      setDone({ ...r, member: convert }); setConvert(null); setCredits(null); await load()
    })
  }
  const doAdjust = () => {
    if (!adjust) return
    act('adjust', async () => {
      const left = await crownAdjust(adjust.customer_id, Math.trunc(Number(adjPoints)), adjNote)
      const who = adjust.name
      setAdjust(null); setHistory(null); await load()
      return `Correction saved. ${who} now has ${fmtNum(left)} points.`
    })
  }
  const send = (kind: CrownMessageKind, m: { customer_id: string; name: string; whatsapp: string | null; points: number; earned_since_statement?: number }, r?: CrownRedemption | { id: string; points: number; voucher_ref: string; amount: number; points_left: number }) => {
    if (!s) return
    const { def, tpl } = tplFor(kind)
    act(kind + m.customer_id + (r ? r.id : ''), async () => {
      if (!tpl) throw new Error(`"${def.label}" has not been sent to Meta for approval yet. Do that on the WhatsApp tab first.`)
      await sendCrownMessage({ def, tpl, phone: m.whatsapp || '', name: m.name, vars: crownVars(kind, s, m, r) })
      await crownMarkSent(kind, kind === 'credit' ? null : m.customer_id, kind === 'credit' && r ? r.id : null)
      if (kind === 'credit') setCredits(null)
      await load()
      return `"${def.label}" was sent to ${m.name} on WhatsApp.`
    })
  }
  const submitTemplate = (kind: CrownMessageKind) => {
    const { def } = tplFor(kind)
    const draft = { slot: null, name: def.name, category: def.category, body: def.body, samples: def.samples, buttons: [], attach: '' }
    act('tpl' + kind, async () => {
      setTplProblems(p => ({ ...p, [kind]: [] }))
      const chk = await waTemplates({ action: 'check', ...draft })
      if (chk.problems?.length) { setTplProblems(p => ({ ...p, [kind]: chk.problems! })); return }
      if (!window.confirm(`Send "${def.label}" to Meta for approval?\n\nThe wording cannot be changed after this. A change later means a new message and a new wait. Read it once more before you agree.`)) return
      const r = await waTemplates({ action: 'create', ...draft })
      await loadTemplates()
      return r.submitted ? `"${def.label}" was sent to Meta. Approval usually takes from a few hours to a few days.` : `"${def.label}" was created but Meta did not accept the submission. See its status below.`
    })
  }
  const saveSettings = (patch?: Partial<CrownSettings>) => act('save', async () => {
    const p = patch || {
      start_date: (form.start_date as string) || null, tzs_per_point: Number(form.tzs_per_point), point_value_tzs: Number(form.point_value_tzs),
      min_redeem_points: Math.floor(Number(form.min_redeem_points)), block_if_overdue: !!form.block_if_overdue,
      discount_account_code: String(form.discount_account_code || '').trim(),
    } as Partial<CrownSettings>
    await crownSaveSettings(p); await load()
    return patch && 'is_on' in patch ? (patch.is_on ? 'Malkia Crown for wholesalers is ON. Enrolled wholesalers earn points on their payments from the start date.' : 'Malkia Crown for wholesalers is OFF. Nobody earns points and no credit note can be issued.') : 'Settings saved.'
  })
  const toggleOn = () => {
    if (!s) return
    const next = !s.is_on
    if (next && !window.confirm(`Switch Malkia Crown ON?\n\nFrom then on, every payment an enrolled wholesaler makes earns points: 1 point per TZS ${fmtNum(s.tzs_per_point)}, each worth TZS ${Number(s.point_value_tzs)}. That is ${pctBack(s)} back on what they pay.\n\n${data?.members.filter(m => m.is_active).length || 0} wholesaler(s) are enrolled now.`)) return
    saveSettings({ is_on: next })
  }

  // ── styles ───────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, marginBottom: 12 }
  const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5 }
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
  const primary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: '1px solid transparent' }
  const small: React.CSSProperties = { ...btn, padding: '5px 9px', fontSize: 12 }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4, margin: '12px 0 5px' }
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
  const num: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }
  const pill = (bg: string, fg: string, text: string) => <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' }}>{text}</span>
  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  const dialog: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14, width: 'min(560px, 100%)', maxHeight: '88vh', overflowY: 'auto', padding: 20 }

  if (loadError) return (
    <div style={{ padding: 20, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ ...card, borderColor: '#E8A0A0', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>
        <b>Malkia Crown could not be opened.</b> The system said: {loadError}
        <div style={{ marginTop: 10 }}><button style={btn} onClick={load}>Try again</button></div>
      </div>
    </div>
  )
  if (!data || !s) return <div style={{ padding: 20, ...muted }}>Loading Malkia Crown...</div>

  const active = data.members.filter(m => m.is_active).length
  const outstanding = Number(data.totals.points_outstanding) || 0
  const convPts = Math.floor(Number(convPoints)) || 0
  const convAmount = Math.round(convPts * Number(s.point_value_tzs))
  const convProblem = !convert ? '' :
    convPts <= 0 ? 'Type how many points to convert.' :
    convPts > convert.points ? `${convert.name} has ${fmtNum(convert.points)} points.` :
    convPts < s.min_redeem_points ? `The smallest conversion is ${fmtNum(s.min_redeem_points)} points.` :
    s.block_if_overdue && convert.overdue ? `${convert.name} has an invoice past its due date. Points can be converted once it is paid.` :
    !s.is_on ? 'The programme is switched off.' : ''
  const formRate = Number(form.tzs_per_point) || 0
  const formValue = Number(form.point_value_tzs) || 0
  const formPct = formRate > 0 ? (formValue / formRate) * 100 : 0

  return (
    <div style={{ padding: 20, maxWidth: 1180, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: '#B8933E22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico d={I.crown} size={24} color="#B8933E" /></span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Malkia Crown: Wholesalers</div>
              {s.is_on ? pill('#DFF3E3', '#1E6B34', 'ON') : pill('#FFF6DA', '#7A5B00', 'OFF')}
            </div>
            <div style={{ ...muted, marginTop: 3, maxWidth: 700 }}>
              Wholesalers earn 1 point for every TZS {fmtNum(s.tzs_per_point)} they pay. Each point is worth TZS {Number(s.point_value_tzs)}, which is {pctBack(s)} back. Points are turned into a credit note that lowers what they owe on their next order.
            </div>
          </div>
        </div>
        {manage && <button style={s.is_on ? btn : primary} disabled={!!busy} onClick={toggleOn}>{s.is_on ? 'Switch off' : 'Switch on'}</button>}
      </div>

      {!s.is_on && (
        <div style={{ ...card, borderColor: '#E8B93E', background: '#FFF6DA', color: '#5F4500', display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
          <Ico d={I.alert} size={18} color="#9A6700" />
          <div><b>The programme is switched off.</b> Nobody earns points and no credit note can be issued. {manage ? 'Check the rates in Settings, enrol the wholesalers you want, then switch it on.' : 'An administrator can switch it on.'}</div>
        </div>
      )}
      {notice && <div style={{ ...card, borderColor: '#9AD0A6', background: '#EAF7EC', color: '#1E6B34', fontSize: 13, fontWeight: 600 }}>{notice}</div>}
      {error && <div style={{ ...card, borderColor: '#E8A0A0', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>{error}</div>}

      {done && (
        <div style={{ ...card, borderColor: '#9AD0A6', background: '#EAF7EC', color: '#1E6B34', fontSize: 13 }}>
          <b>Credit note {done.ref} posted.</b> {done.customer} was credited TZS {fmtNum(done.amount)} for {fmtNum(done.points)} points and now owes TZS {fmtNum(done.customer_balance)}. Points left: {fmtNum(done.points_left)}.
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {manage && <button style={primary} disabled={!!busy || !tplReady('credit')} title={tplReady('credit') ? '' : 'This message is not approved by Meta yet'}
              onClick={() => { send('credit', { ...done.member, points: done.points_left }, { id: done.redemption_id, points: done.points, voucher_ref: done.ref, amount: done.amount, points_left: done.points_left }); setDone(null) }}>
              <Ico d={I.chat} size={14} /> Tell {done.customer} on WhatsApp</button>}
            <button style={btn} onClick={() => onNav('posted-vouchers' as Page)}>See it in Posted Vouchers</button>
            <button style={btn} onClick={() => setDone(null)}>Close</button>
          </div>
          {manage && !tplReady('credit') && <div style={{ ...muted, marginTop: 6, color: '#1E6B34' }}>The WhatsApp notice cannot be sent yet: Meta has not approved the "Credit note issued" message.</div>}
        </div>
      )}

      {/* figures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 12 }}>
        {([
          [I.users, '#2E6A64', 'Wholesalers enrolled', `${fmtNum(active)} of ${fmtNum(data.wholesalers_total)}`, 'active wholesale customers'],
          [I.star, '#B8933E', 'Points not yet converted', fmtNum(outstanding), `earned so far: ${fmtNum(Number(data.totals.points_earned))}`],
          [I.coins, '#D9628F', 'What those points are worth', `TZS ${fmtNum(outstanding * Number(s.point_value_tzs))}`, 'this is what Malkia owes in rewards'],
          [I.note, '#3d8bff', 'Credit notes issued', `TZS ${fmtNum(Number(data.totals.credit_notes_value))}`, `${fmtNum(Number(data.totals.credit_notes))} credit note${Number(data.totals.credit_notes) === 1 ? '' : 's'}`],
        ] as const).map(([icon, tint, label, value, sub]) => (
          <div key={label} style={{ ...card, marginBottom: 0, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: tint + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico d={icon} size={19} color={tint} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {([['members', 'Wholesalers', I.users], ['credits', 'Credit notes', I.note], ['history', 'Points history', I.history], ['whatsapp', 'WhatsApp messages', I.chat], ['settings', 'Settings', I.sliders]] as const).map(([k, l, icon]) => (
          <button key={k} onClick={() => setTab(k)} style={tab === k ? primary : btn}><Ico d={icon} size={14} /> {l}</button>
        ))}
      </div>

      {/* ── Wholesalers ── */}
      {tab === 'members' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }}><Ico d={I.search} size={15} /></span>
              <input style={{ ...inp, paddingLeft: 32 }} placeholder="Search by name, code or number" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {manage && <button style={primary} disabled={!!busy} onClick={openEnroll}><Ico d={I.plus} size={14} /> {busy === 'cand' ? 'Loading...' : 'Enrol wholesalers'}</button>}
          </div>
          {data.members.length === 0 ? (
            <div style={{ ...muted, padding: '18px 4px' }}>
              Nobody is enrolled yet. {manage ? 'Press "Enrol wholesalers" to choose who joins. A wholesaler earns points only on payments made after the day they are enrolled.' : 'An administrator chooses who joins.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead><tr>
                  <th style={th}>Wholesaler</th><th style={{ ...th, textAlign: 'right' }}>Points</th><th style={{ ...th, textAlign: 'right' }}>Worth (TZS)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Earned</th><th style={{ ...th, textAlign: 'right' }}>Converted</th><th style={th}>Last payment</th>
                  <th style={{ ...th, textAlign: 'right' }}>Owes (TZS)</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {members.map(m => {
                    const canConvert = s.is_on && m.points >= s.min_redeem_points && !(s.block_if_overdue && m.overdue)
                    return (
                      <tr key={m.customer_id} style={{ opacity: m.is_active ? 1 : .6 }}>
                        <td style={td}>
                          <b>{m.name}</b>{m.code ? <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11.5 }}> {m.code}</span> : null}
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                            {m.credit_tier && pill('var(--surface2)', 'var(--text2)', `Tier ${m.credit_tier}`)}
                            {!m.is_active && pill('#F1EFEA', '#5C5154', 'Taken out')}
                            {m.overdue && pill('#FCEDED', '#8F1D1D', 'Invoice past due')}
                            {m.no_contact && pill('#FCEDED', '#8F1D1D', 'No contact')}
                            {!m.whatsapp && pill('#FFF6DA', '#7A5B00', 'No WhatsApp number')}
                          </div>
                          <div style={{ ...muted, fontSize: 11.5, marginTop: 3 }}>Enrolled {day(m.enrolled_at)}{m.welcome_sent_at ? ` · welcome sent ${day(m.welcome_sent_at)}` : ''}{m.statement_sent_at ? ` · statement sent ${day(m.statement_sent_at)}` : ''}</div>
                        </td>
                        <td style={{ ...num, fontWeight: 800 }}>{fmtNum(m.points)}</td>
                        <td style={num}>{fmtNum(m.points * Number(s.point_value_tzs))}</td>
                        <td style={num}>{fmtNum(m.earned)}</td>
                        <td style={num}>{fmtNum(m.redeemed)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.last_earn_date ? day(m.last_earn_date) : <span style={{ color: 'var(--text3)' }}>none yet</span>}</td>
                        <td style={num}>{fmtNum(m.ar_balance)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {manage && (
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button style={{ ...small, ...(canConvert ? { background: 'var(--accent)', color: '#fff', border: '1px solid transparent' } : {}) }} disabled={!!busy || !canConvert}
                                title={canConvert ? 'Turn points into a credit note' : !s.is_on ? 'The programme is switched off' : m.points < s.min_redeem_points ? `Needs ${fmtNum(s.min_redeem_points)} points` : 'An invoice is past its due date'}
                                onClick={() => openConvert(m)}>Credit note</button>
                              <button style={small} disabled={!!busy || !tplReady('points') || !m.whatsapp} title={tplReady('points') ? 'Send the points statement on WhatsApp' : 'Not approved by Meta yet'} onClick={() => send('points', m)}>{busy === 'points' + m.customer_id ? 'Sending...' : 'Statement'}</button>
                              {!m.welcome_sent_at && <button style={small} disabled={!!busy || !tplReady('welcome') || !m.whatsapp} title={tplReady('welcome') ? 'Send the welcome message on WhatsApp' : 'Not approved by Meta yet'} onClick={() => send('welcome', m)}>{busy === 'welcome' + m.customer_id ? 'Sending...' : 'Welcome'}</button>}
                              <button style={small} disabled={!!busy} onClick={() => { setAdjust(m); setAdjPoints(''); setAdjNote(''); setError('') }}>Correct</button>
                              <button style={small} disabled={!!busy} onClick={() => setActive(m, !m.is_active)}>{m.is_active ? 'Take out' : 'Bring back'}</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {members.length === 0 && <tr><td style={{ ...td, color: 'var(--text3)' }} colSpan={8}>No wholesaler matches "{q}".</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Credit notes ── */}
      {tab === 'credits' && (
        <div style={card}>
          {!credits ? <div style={muted}>Loading...</div> : credits.length === 0 ? <div style={muted}>No points have been turned into a credit note yet.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Wholesaler</th><th style={th}>Credit note</th><th style={{ ...th, textAlign: 'right' }}>Points</th><th style={{ ...th, textAlign: 'right' }}>Amount (TZS)</th><th style={th}>Issued by</th><th style={th}>WhatsApp</th></tr></thead>
                <tbody>
                  {credits.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(r.created_at)}</td>
                      <td style={td}><b>{r.name}</b>{r.note ? <div style={{ ...muted, fontSize: 11.5 }}>{r.note}</div> : null}</td>
                      <td style={{ ...td, fontFamily: 'var(--mono)' }}>{r.voucher_ref}</td>
                      <td style={num}>{fmtNum(r.points)}</td>
                      <td style={{ ...num, fontWeight: 800 }}>{fmtNum(r.amount)}</td>
                      <td style={td}>{r.created_by_name || ''}</td>
                      <td style={td}>
                        {r.wa_sent_at ? pill('#DFF3E3', '#1E6B34', `Sent ${day(r.wa_sent_at)}`)
                          : manage ? <button style={small} disabled={!!busy || !tplReady('credit') || !r.whatsapp} title={tplReady('credit') ? '' : 'Not approved by Meta yet'}
                              onClick={() => send('credit', { customer_id: r.customer_id, name: r.name, whatsapp: r.whatsapp, points: r.points_left }, r)}>{busy === 'credit' + r.customer_id + r.id ? 'Sending...' : 'Send notice'}</button>
                          : <span style={{ color: 'var(--text3)' }}>not sent</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ ...muted, marginTop: 10 }}>Each credit note is also in Posted Vouchers and on the wholesaler's statement, where it lowers their balance.</div>
        </div>
      )}

      {/* ── History ── */}
      {tab === 'history' && (
        <div style={card}>
          {!history ? <div style={muted}>Loading...</div> : history.length === 0 ? <div style={muted}>No points have moved yet.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead><tr><th style={th}>When</th><th style={th}>Wholesaler</th><th style={th}>What</th><th style={{ ...th, textAlign: 'right' }}>Points</th><th style={th}>From</th><th style={{ ...th, textAlign: 'right' }}>On (TZS)</th></tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(h.created_at)}</td>
                      <td style={td}>{h.name}</td>
                      <td style={td}>{pill(KIND[h.kind]?.bg || 'var(--surface2)', KIND[h.kind]?.fg || 'var(--text2)', KIND[h.kind]?.label || h.kind)}{h.kind === 'adjust' && h.note ? <div style={{ ...muted, fontSize: 11.5, marginTop: 3 }}>{h.note}</div> : null}</td>
                      <td style={{ ...num, fontWeight: 800, color: h.points < 0 ? '#B42318' : 'var(--text)' }}>{h.points > 0 ? '+' : ''}{fmtNum(h.points)}</td>
                      <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 12 }}>{h.source_ref || ''}</td>
                      <td style={num}>{h.base_amount != null ? fmtNum(h.base_amount) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ ...muted, marginTop: 10 }}>Showing the latest 200 movements. "Taken back" appears when a payment that earned points is later removed from the statement.</div>
        </div>
      )}

      {/* ── WhatsApp ── */}
      {tab === 'whatsapp' && (<>
        <div style={{ ...card, fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>
          These are the three messages Malkia Crown can send from the business number. Meta must approve each one first, and <b>the wording cannot be changed after it is sent to Meta</b>. Read them, and if you want a word changed, say so before pressing the button.
          {!canSubmitTpl && <div style={{ marginTop: 6 }}>Only an administrator can send a message to Meta for approval.</div>}
        </div>
        {!templates ? <div style={muted}>Checking with Meta...</div> : CROWN_TEMPLATES.map(def => {
          const tpl = templates.find(t => t.name === def.name) || null
          const st = TPL_STATUS[tpl ? (tpl.status in TPL_STATUS ? tpl.status : 'unknown') : 'none']
          const probs = tplProblems[def.kind] || []
          return (
            <div key={def.kind} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 15, color: 'var(--text)' }}>{def.label}</b>
                    {pill(st.bg, st.fg, st.label)}
                    {pill('var(--surface2)', 'var(--text2)', def.category === 'MARKETING' ? 'Marketing message' : 'Service message')}
                  </div>
                  <div style={{ ...muted, marginTop: 4 }}>{def.when}</div>
                  {def.category === 'MARKETING' && <div style={{ ...muted, marginTop: 4 }}>A marketing message only goes to a wholesaler who has agreed to marketing on WhatsApp. If Meta approves this one as a service message instead, that rule does not apply to it.</div>}
                  {tpl?.rejection_reason && <div style={{ fontSize: 12.5, color: '#8F1D1D', marginTop: 6 }}>Meta said: {tpl.rejection_reason}</div>}
                </div>
                {canSubmitTpl && !tpl && <button style={primary} disabled={!!busy} onClick={() => submitTemplate(def.kind)}>{busy === 'tpl' + def.kind ? 'Checking...' : 'Send to Meta for approval'}</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 12 }}>
                <div>
                  <div style={lbl}>The wording (blanks are filled per wholesaler)</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>{def.body}</div>
                  <div style={{ ...muted, marginTop: 6 }}>{def.blanks.map((b, i) => `{{${i + 1}}} ${b}`).join(' · ')}</div>
                </div>
                <div>
                  <div style={lbl}>How a wholesaler sees it</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, color: '#111', background: '#E7FFDB', borderRadius: '10px 10px 2px 10px', padding: 12 }}>{fillTemplate(def.body, def.samples)}</div>
                </div>
              </div>
              {probs.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#8F1D1D' }}><b>Meta's rules are not met:</b><ul style={{ margin: '4px 0 0 18px' }}>{probs.map(p => <li key={p}>{p}</li>)}</ul></div>}
            </div>
          )
        })}
      </>)}

      {/* ── Settings ── */}
      {tab === 'settings' && (
        <div style={card}>
          {!manage && <div style={{ ...muted, marginBottom: 8 }}>Only an administrator can change these.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 18px' }}>
            <div>
              <label style={lbl}>Shillings paid to earn 1 point</label>
              <input style={inp} type="number" min="1" disabled={!manage} value={String(form.tzs_per_point ?? '')} onChange={e => setForm({ ...form, tzs_per_point: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Value of 1 point (TZS)</label>
              <input style={inp} type="number" min="0" step="any" disabled={!manage} value={String(form.point_value_tzs ?? '')} onChange={e => setForm({ ...form, point_value_tzs: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Smallest conversion (points)</label>
              <input style={inp} type="number" min="1" disabled={!manage} value={String(form.min_redeem_points ?? '')} onChange={e => setForm({ ...form, min_redeem_points: e.target.value })} />
              <div style={{ ...muted, marginTop: 4 }}>A credit note of at least TZS {fmtNum((Number(form.min_redeem_points) || 0) * formValue)}.</div>
            </div>
            <div>
              <label style={lbl}>Payments count from</label>
              <input style={inp} type="date" disabled={!manage} value={String(form.start_date ?? '')} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              <div style={{ ...muted, marginTop: 4 }}>Payments before this date earn nothing. Empty means the day the programme is switched on. A wholesaler never earns on payments made before they were enrolled.</div>
            </div>
            <div>
              <label style={lbl}>Account the reward is charged to</label>
              <input style={{ ...inp, fontFamily: 'var(--mono)' }} disabled={!manage} value={String(form.discount_account_code ?? '')} onChange={e => setForm({ ...form, discount_account_code: e.target.value })} />
              <div style={{ ...muted, marginTop: 4 }}>4040 is Sales Discounts. Each credit note is recorded there and taken off Accounts Receivable (1050).</div>
            </div>
            <div>
              <label style={lbl}>Overdue invoices</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text)', cursor: manage ? 'pointer' : 'default' }}>
                <input type="checkbox" disabled={!manage} checked={!!form.block_if_overdue} onChange={e => setForm({ ...form, block_if_overdue: e.target.checked })} style={{ marginTop: 3 }} />
                <span>No credit note while the wholesaler has an invoice past its due date</span>
              </label>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
            <b>What these rates cost.</b> A wholesaler gets back <b>{formPct ? `${Number(formPct.toFixed(2))}%` : 'nothing'}</b> of every shilling they pay.
            {paid90 !== null && paid90 > 0 && formPct > 0 && <> All wholesalers together paid TZS {fmtNum(paid90)} in the last 90 days. If every one of them were enrolled, that would be about <b>TZS {fmtNum(paid90 * formPct / 100)}</b> in credit notes per quarter, or TZS {fmtNum(paid90 * formPct / 100 / 3)} a month.</>}
            {formPct > 10 && <div style={{ color: '#B42318', marginTop: 4 }}>That is more than the 10% limit, so it will not be saved.</div>}
          </div>

          {manage && <div style={{ marginTop: 14, display: 'flex', gap: 8 }}><button style={primary} disabled={!!busy} onClick={() => saveSettings()}>{busy === 'save' ? 'Saving...' : 'Save settings'}</button></div>}
          <div style={{ ...muted, marginTop: 12 }}>A change of rate applies to payments counted from then on. Points already earned keep the number they were given, and are worth the value of a point on the day they are converted.</div>
        </div>
      )}

      {/* ── enrol dialog ── */}
      {candidates && (
        <div style={overlay} onClick={() => setCandidates(null)}>
          <div style={{ ...dialog, width: 'min(680px, 100%)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 17, color: 'var(--text)' }}>Enrol wholesalers</b>
              <button style={{ ...small, padding: 6 }} onClick={() => setCandidates(null)} aria-label="Close"><Ico d={I.close} size={14} /></button>
            </div>
            <div style={{ ...muted, margin: '6px 0 10px' }}>Tick who joins. They earn points on payments made from today. Sorted by what each paid in the last 90 days.</div>
            {candidates.length === 0 ? <div style={muted}>Every active wholesaler is already enrolled.</div> : (<>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button style={small} onClick={() => setPicked(new Set(candidates.map(c => c.customer_id)))}>Tick all ({candidates.length})</button>
                <button style={small} onClick={() => setPicked(new Set(candidates.filter(c => Number(c.paid_90d) > 0).map(c => c.customer_id)))}>Tick those who paid in 90 days ({candidates.filter(c => Number(c.paid_90d) > 0).length})</button>
                <button style={small} onClick={() => setPicked(new Set())}>Clear</button>
              </div>
              <div style={{ maxHeight: '46vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                {candidates.map(c => (
                  <label key={c.customer_id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                    <input type="checkbox" checked={picked.has(c.customer_id)} onChange={e => { const n = new Set(picked); e.target.checked ? n.add(c.customer_id) : n.delete(c.customer_id); setPicked(n) }} />
                    <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b>{c.credit_tier ? <span style={{ color: 'var(--text3)' }}> · Tier {c.credit_tier}</span> : null}{!c.whatsapp ? <span style={{ color: '#9A6700' }}> · no WhatsApp number</span> : null}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: Number(c.paid_90d) > 0 ? 'var(--text)' : 'var(--text3)' }}>{Number(c.paid_90d) > 0 ? `TZS ${fmtNum(c.paid_90d)}` : 'no payment'}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button style={btn} onClick={() => setCandidates(null)}>Cancel</button>
                <button style={primary} disabled={!!busy || picked.size === 0} onClick={doEnroll}>{busy === 'enroll' ? 'Enrolling...' : `Enrol ${picked.size} wholesaler${picked.size === 1 ? '' : 's'}`}</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* ── credit note dialog ── */}
      {convert && (
        <div style={overlay} onClick={() => setConvert(null)}>
          <div style={dialog} onClick={e => e.stopPropagation()}>
            <b style={{ fontSize: 17, color: 'var(--text)' }}>Turn points into a credit note</b>
            <div style={{ ...muted, marginTop: 4 }}>{convert.name} has <b style={{ color: 'var(--text)' }}>{fmtNum(convert.points)} points</b> and owes TZS {fmtNum(convert.ar_balance)}.</div>
            <label style={lbl}>Points to convert</label>
            <input style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 16 }} type="number" min="1" value={convPoints} onChange={e => setConvPoints(e.target.value)} autoFocus />
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              Credit note: <b style={{ fontFamily: 'var(--mono)', fontSize: 16 }}>TZS {fmtNum(convAmount)}</b><br />
              {convert.name} will then owe TZS {fmtNum(convert.ar_balance - convAmount)} and keep {fmtNum(Math.max(0, convert.points - convPts))} points.
              {convert.ar_balance - convAmount < 0 && <div style={{ ...muted, marginTop: 4 }}>They will be in credit: the extra is taken off their next invoice.</div>}
            </div>
            <label style={lbl}>Note (optional, shown on the credit note)</label>
            <input style={inp} value={convNote} onChange={e => setConvNote(e.target.value)} placeholder="For example: November rewards" maxLength={160} />
            {convProblem && <div style={{ fontSize: 12.5, color: '#B42318', marginTop: 10 }}>{convProblem}</div>}
            {error && <div style={{ fontSize: 12.5, color: '#B42318', marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button style={btn} onClick={() => setConvert(null)}>Cancel</button>
              <button style={primary} disabled={!!busy || !!convProblem} onClick={doConvert}>{busy === 'convert' ? 'Posting...' : `Issue credit note of TZS ${fmtNum(convAmount)}`}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── correction dialog ── */}
      {adjust && (
        <div style={overlay} onClick={() => setAdjust(null)}>
          <div style={dialog} onClick={e => e.stopPropagation()}>
            <b style={{ fontSize: 17, color: 'var(--text)' }}>Correct points by hand</b>
            <div style={{ ...muted, marginTop: 4 }}>{adjust.name} has {fmtNum(adjust.points)} points. Use this only to fix a mistake or to give a one-off bonus. It is recorded with your name and the reason.</div>
            <label style={lbl}>Points to add (or a minus number to take away)</label>
            <input style={{ ...inp, fontFamily: 'var(--mono)' }} type="number" value={adjPoints} onChange={e => setAdjPoints(e.target.value)} placeholder="For example 500 or -200" autoFocus />
            <label style={lbl}>Reason</label>
            <input style={inp} value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="Why this correction is being made" maxLength={200} />
            {error && <div style={{ fontSize: 12.5, color: '#B42318', marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button style={btn} onClick={() => setAdjust(null)}>Cancel</button>
              <button style={primary} disabled={!!busy || !Math.trunc(Number(adjPoints)) || adjNote.trim().length < 5} onClick={doAdjust}>{busy === 'adjust' ? 'Saving...' : 'Save correction'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function pctBack(s: CrownSettings): string {
  const rate = Number(s.tzs_per_point), value = Number(s.point_value_tzs)
  if (!(rate > 0)) return '0%'
  return `${Number(((value / rate) * 100).toFixed(2))}%`
}
