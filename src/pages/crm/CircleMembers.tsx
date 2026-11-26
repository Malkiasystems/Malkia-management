// Circle Members: who has joined Malkia Circle.
// Read only. Staff see each mother's name, WhatsApp number, stage, when she joined and
// how active she is, sort mothers into their own groups, and (super admins only) export
// the list. The list, the groups and the export log are all served by database
// functions that check the caller's permission (site_049); this page holds no rules.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { printHtmlDocument } from '../../lib/printDocument'
import type { Page } from '../../lib/types'
import { CirclePage, Icon } from './circleUi'

type Kind = 'mother' | 'expert' | 'test'
type Stage = 'ttc' | 'pregnancy' | 'parenting'
interface Member {
  user_id: string; name: string; username: string; member_no: number; whatsapp: string; stage: Stage; created_at: string; kind: Kind
  due_date: string | null; baby_birth_date: string | null; preg_week: number | null; founder_no: number | null
  terms_version: string | null; terms_accepted_at: string | null; whatsapp_verified_at: string | null; weekly_wa: boolean
  questions: number; answers: number; last_active: string | null; marketing_ok: boolean; groups: string[]
}
/* What she has bought from Malkia, matched by her WhatsApp number to the customer records. */
interface Bought { orders: number; total: number; last_at: string | null; customer: string | null; customers: number }
interface Group { id: string; name: string; note: string | null; created_by_name: string | null; n: number }
type SortKey = 'name' | 'member_no' | 'stage' | 'created_at' | 'questions' | 'answers' | 'last_active' | 'bought'

const STAGE_LABEL: Record<Stage, string> = { ttc: 'Trying for a baby', pregnancy: 'Pregnant', parenting: 'Parenting' }
const STAGE_COLOR: Record<Stage, [string, string]> = { ttc: ['#FBE9F0', '#8A2150'], pregnancy: ['#E4F1EF', '#2F6B66'], parenting: ['#FFF3D6', '#7A5B00'] }
const tzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString('en-US')
const day = (s?: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const local = (p: string) => /^255\d{9}$/.test(p) ? `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : p
const daysAgo = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
function babyAge(birth: string | null) {
  if (!birth) return ''
  const months = Math.floor((Date.now() - new Date(birth).getTime()) / (86400000 * 30.44))
  if (months < 0) return ''
  return months < 1 ? 'under 1 month' : months < 24 ? `${months} month${months === 1 ? '' : 's'}` : `${Math.floor(months / 12)} years`
}
const detail = (m: Member) => m.stage === 'pregnancy' ? (m.preg_week != null && m.preg_week >= 0 && m.preg_week <= 43 ? `Week ${m.preg_week}` : 'week not given') : m.stage === 'parenting' ? (babyAge(m.baby_birth_date) ? `Baby ${babyAge(m.baby_birth_date)}` : 'baby age not given') : ''

/* One member's panel: what she asked and answered, and what she bought (site_051). */
interface Detail {
  questions: { id: string; title: string; created_at: string; answers: number }[]
  hidden_name_questions: number
  answers: { id: string; question_id: string; question: string; body: string; created_at: string }[]
  maua: number
  orders: { ref: string; type: string; total: number; at: string; customer: string }[]
}
const SITE = 'https://www.malkia.co.tz/circle/swali/'

export default function CircleMembers({ onNav }: { onNav?: (p: Page) => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [canExport, setCanExport] = useState(false)
  const [bought, setBought] = useState<Record<string, Bought>>({})
  const [buy, setBuy] = useState<'all' | 'yes' | 'no'>('all')
  const [weekly, setWeekly] = useState<'all' | 'yes'>('all')
  const [open, setOpen] = useState<Member | null>(null)
  const [detail_, setDetail] = useState<Detail | null>(null)
  const [detailErr, setDetailErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const [kind, setKind] = useState<Kind>('mother')
  const [stage, setStage] = useState<'all' | Stage>('all')
  const [group, setGroup] = useState<'all' | string>('all')
  const [activity, setActivity] = useState<'all' | 'active' | 'silent'>('all')
  const [terms, setTerms] = useState<'all' | 'yes' | 'no'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [newGroup, setNewGroup] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const { data, error } = await supabase.rpc('circle_members_list')
    if (error) { setError(error.message); setLoading(false); return }
    setMembers((data?.members || []) as Member[]); setGroups((data?.groups || []) as Group[]); setCanExport(!!data?.can_export)
    setLoading(false)
    // Purchases load separately, so the list still shows if this part fails.
    const b = await supabase.rpc('circle_members_purchases')
    if (b.error) setError(`The list loaded, but purchases could not be read: ${b.error.message}`)
    else setBought((b.data || {}) as Record<string, Bought>)
  }
  useEffect(() => { load() }, [])
  // Arriving from the Overview page with one group of mothers already chosen.
  useEffect(() => {
    let preset = ''
    try { preset = sessionStorage.getItem('circle-members-preset') || ''; sessionStorage.removeItem('circle-members-preset') } catch { /* private mode */ }
    if (preset === 'week') setFrom(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10))
    else if (preset === 'weekly') setWeekly('yes')
    else if (preset === 'buyers') setBuy('yes')
  }, [])
  // Open one member's panel.
  const openMember = async (m: Member) => {
    setOpen(m); setDetail(null); setDetailErr(''); setCopied(false)
    const { data, error } = await supabase.rpc('circle_member_detail', { p_user: m.user_id })
    if (error) setDetailErr(error.message); else setDetail(data as Detail)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const openChat = (m: Member) => { try { sessionStorage.setItem('wa-open-q', m.whatsapp.slice(3)) } catch { /* private mode */ } onNav?.('whatsapp-centre') }

  const mothers = useMemo(() => members.filter(m => m.kind === 'mother'), [members])
  const stats = useMemo(() => ({
    total: mothers.length,
    week: mothers.filter(m => m.created_at.slice(0, 10) >= new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)).length,
    month: mothers.filter(m => daysAgo(m.created_at) < 30).length,
    active: mothers.filter(m => m.questions + m.answers > 0).length,
    buyers: mothers.filter(m => (bought[m.user_id]?.orders || 0) > 0).length,
    spent: mothers.reduce((n, m) => n + Number(bought[m.user_id]?.total || 0), 0),
    weekly: mothers.filter(m => m.weekly_wa).length,
    byStage: (['pregnancy', 'parenting', 'ttc'] as Stage[]).map(s => [s, mothers.filter(m => m.stage === s).length] as [Stage, number]),
  }), [mothers, bought])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase(); const digits = needle.replace(/\D/g, '').replace(/^0/, '')
    const out = members.filter(m => {
      if (m.kind !== kind) return false
      if (stage !== 'all' && m.stage !== stage) return false
      if (group !== 'all' && !m.groups.includes(group)) return false
      if (activity === 'active' && m.questions + m.answers === 0) return false
      if (activity === 'silent' && m.questions + m.answers > 0) return false
      if (terms === 'yes' && !m.terms_accepted_at) return false
      if (terms === 'no' && m.terms_accepted_at) return false
      if (buy === 'yes' && !(bought[m.user_id]?.orders > 0)) return false
      if (buy === 'no' && bought[m.user_id]?.orders > 0) return false
      if (weekly === 'yes' && !m.weekly_wa) return false
      if (from && m.created_at.slice(0, 10) < from) return false
      if (to && m.created_at.slice(0, 10) > to) return false
      if (needle && !(m.name.toLowerCase().includes(needle) || m.username.toLowerCase().includes(needle) || (digits.length >= 3 && m.whatsapp.includes(digits)))) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      const val = (m: Member): any => sort.key === 'name' ? m.name.toLowerCase() : sort.key === 'bought' ? (bought[m.user_id]?.orders > 0 ? Number(bought[m.user_id].total) : null) : (m as any)[sort.key]
      const av: any = val(a)
      const bv: any = val(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1            // empty values always last
      if (bv == null) return -1
      return av < bv ? -dir : av > bv ? dir : 0
    })
  }, [members, kind, stage, group, activity, terms, buy, weekly, bought, from, to, q, sort])

  const shown = useMemo(() => new Set(rows.map(r => r.user_id)), [rows])
  const pickedShown = useMemo(() => [...picked].filter(id => shown.has(id)), [picked, shown])
  const allPicked = rows.length > 0 && pickedShown.length === rows.length
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.user_id)))
  const sortBy = (key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'stage' ? 'asc' : 'desc' })
  const say = (ok: string, err = '') => { setNotice(ok); setError(err) }
  const groupName = (id: string) => groups.find(g => g.id === id)?.name || ''

  const createGroup = async () => {
    const name = (newGroup || '').trim()
    setBusy('group')
    const { data, error } = await supabase.rpc('circle_member_group_save', { p_id: null, p_name: name, p_note: null })
    if (error) say('', error.message)
    else {
      let added = 0
      if (pickedShown.length) {
        const r = await supabase.rpc('circle_member_group_set', { p_group: data, p_users: pickedShown, p_on: true })
        if (r.error) { say('', `The group was created, but the members were not added: ${r.error.message}`); setBusy(''); await load(); return }
        added = r.data || 0
      }
      say(added ? `Group "${name}" created with ${added} member${added === 1 ? '' : 's'}.` : `Group "${name}" created. Tick members and add them to it.`)
      setNewGroup(null); setPicked(new Set()); await load()
    }
    setBusy('')
  }
  const setMembership = async (on: boolean) => {
    if (!target || !pickedShown.length) return
    setBusy('set')
    const { data, error } = await supabase.rpc('circle_member_group_set', { p_group: target, p_users: pickedShown, p_on: on })
    if (error) say('', error.message)
    else { say(on ? `${data} added to "${groupName(target)}".${data < pickedShown.length ? ` ${pickedShown.length - data} were already in it.` : ''}` : `${data} removed from "${groupName(target)}".`); setPicked(new Set()); await load() }
    setBusy('')
  }
  const deleteGroup = async (g: Group) => {
    if (!window.confirm(`Delete the group "${g.name}"?\n\nThe ${g.n} member${g.n === 1 ? '' : 's'} in it stay in Circle. Only the group is removed.`)) return
    setBusy('del')
    const { error } = await supabase.rpc('circle_member_group_delete', { p_id: g.id })
    if (error) say('', error.message); else { say(`Group "${g.name}" deleted.`); if (group === g.id) setGroup('all'); await load() }
    setBusy('')
  }

  // Export what the list shows (or only the ticked rows) as PDF, CSV or Excel.
  // The export is written down first; the file is only made once that succeeded.
  const exportRows = async (format: 'pdf' | 'csv' | 'xlsx') => {
    const list = pickedShown.length ? rows.filter(r => picked.has(r.user_id)) : rows
    if (!list.length) return
    const label = format === 'pdf' ? 'PDF' : format === 'csv' ? 'CSV' : 'Excel'
    if (!window.confirm(`Export ${list.length} member${list.length === 1 ? '' : 's'} as ${label}?\n\nThe file holds names and WhatsApp numbers. This export is recorded with your name.`)) return
    setBusy('export')
    const filters = { format, kind, stage, group: group === 'all' ? null : groupName(group), activity, terms, bought: buy, weekly_lessons: weekly, from: from || null, to: to || null, search: q.trim() || null, ticked_only: pickedShown.length > 0 }
    const { error } = await supabase.rpc('circle_members_export_log', { p_rows: list.length, p_filters: filters })
    if (error) { say('', `Nothing was exported: ${error.message}`); setBusy(''); return }
    const head = ['Member no', 'Name', 'WhatsApp', 'Stage', 'Week or baby age', 'Joined', 'Questions', 'Answers', 'Last active', 'Orders', 'Total bought (TZS)', 'Last purchase', 'Founder no', 'Terms accepted', 'Terms version', 'Number proved', 'Weekly lessons', 'Groups']
    const body: (string | number)[][] = list.map(m => [m.member_no, m.name, m.whatsapp, STAGE_LABEL[m.stage] || m.stage, detail(m), day(m.created_at), m.questions, m.answers, day(m.last_active), bought[m.user_id]?.orders || 0, Math.round(Number(bought[m.user_id]?.total || 0)), day(bought[m.user_id]?.last_at), m.founder_no || '', day(m.terms_accepted_at), m.terms_version || '', m.whatsapp_verified_at ? 'Yes' : 'No', m.weekly_wa ? 'Yes' : 'No', m.groups.map(groupName).filter(Boolean).join(', ')])
    const stamp = new Date().toISOString().slice(0, 10)
    const fileBase = `Malkia-Circle-members-${stamp}`
    try {
      if (format === 'xlsx' || format === 'csv') {
        const ws = XLSX.utils.aoa_to_sheet([head, ...body])
        if (format === 'xlsx') {
          ws['!cols'] = [10, 26, 16, 18, 18, 14, 10, 10, 14, 8, 16, 14, 10, 14, 12, 12, 12, 30].map(wch => ({ wch }))
          const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Circle members')
          XLSX.writeFile(wb, `${fileBase}.xlsx`)
        } else {
          // The leading mark makes Excel read names with accents correctly.
          const blob = new Blob(['\uFEFF' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' })
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fileBase}.csv`
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
        }
      } else {
        const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const said: string[] = [kind === 'mother' ? 'Mothers' : kind === 'expert' ? 'Experts' : 'Test accounts']
        if (stage !== 'all') said.push(STAGE_LABEL[stage])
        if (group !== 'all') said.push(`Group: ${groupName(group)}`)
        if (activity !== 'all') said.push(activity === 'active' ? 'Has asked or answered' : 'Never posted')
        if (buy !== 'all') said.push(buy === 'yes' ? 'Has bought from Malkia' : 'Never bought')
        if (terms !== 'all') said.push(terms === 'yes' ? 'Accepted the terms' : 'No terms record')
        if (weekly === 'yes') said.push('Subscribed to weekly lessons')
        if (from || to) said.push(`Joined ${from ? 'from ' + day(from) : ''}${to ? ' to ' + day(to) : ''}`.trim())
        if (q.trim()) said.push(`Search: ${q.trim()}`)
        if (pickedShown.length) said.push('Ticked rows only')
        const trs = list.map(m => `<tr>
          <td class="num">${m.member_no}</td><td><b>${esc(m.name)}</b>${m.founder_no ? ` <span class="tag">Founder #${m.founder_no}</span>` : ''}</td>
          <td class="mono">${esc(local(m.whatsapp))}</td><td>${esc(STAGE_LABEL[m.stage] || m.stage)}${detail(m) ? `<div class="sub">${esc(detail(m))}</div>` : ''}</td>
          <td>${esc(day(m.created_at))}</td><td class="num">${m.questions || ''}</td><td class="num">${m.answers || ''}</td>
          <td>${esc(m.last_active ? day(m.last_active) : 'Never posted')}</td>
          <td class="num">${bought[m.user_id]?.orders > 0 ? `${esc(tzs(Number(bought[m.user_id].total)))}<div class="sub">${bought[m.user_id].orders} order${bought[m.user_id].orders === 1 ? '' : 's'}, last ${esc(day(bought[m.user_id].last_at))}</div>` : ''}</td>
          <td>${esc(m.groups.map(groupName).filter(Boolean).join(', '))}</td></tr>`).join('')
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
            th.num{text-align:right}
            .mono{font-variant-numeric:tabular-nums;white-space:nowrap}
            .sub{font-size:8.5px;color:#666;margin-top:1px}
            .tag{font-size:8px;font-weight:700;background:#FFF4D2;color:#6B4E00;padding:1px 5px;border-radius:8px;white-space:nowrap}
            .foot{margin-top:14px;font-size:9px;color:#777;display:flex;justify-content:space-between;border-top:1px solid #ddd;padding-top:8px}
          </style></head><body>
          <div class="brand"><h1>Malkia Circle members</h1><div class="co">MALKIA WELLNESS GROUP LTD<br>Your partner in motherhood</div></div>
          <div class="meta"><b>${list.length}</b> member${list.length === 1 ? '' : 's'} &middot; ${esc(said.join(' &middot; ')).replace(/&amp;middot;/g, '&middot;')}<br>Printed ${esc(new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
          <table><thead><tr><th class="num">No</th><th>Name</th><th>WhatsApp</th><th>Stage</th><th>Joined</th><th class="num">Asked</th><th class="num">Answered</th><th>Last active</th><th class="num">Bought</th><th>Groups</th></tr></thead><tbody>${trs}</tbody></table>
          <div class="foot"><span>Confidential. Holds mothers' names and WhatsApp numbers. Do not share outside Malkia.</span><span>www.malkia.co.tz &middot; @malkia_tz</span></div>
          </body></html>`)
        if (!res.ok) { say('', `The export was recorded, but the PDF could not open: ${res.error || 'the browser blocked printing'}. Allow pop-ups for MalkiaOS and try again.`); setBusy(''); return }
      }
      say(format === 'pdf' ? `The print window opened for ${list.length} member${list.length === 1 ? '' : 's'}. Choose "Save as PDF" as the printer. The export was recorded.` : `Exported ${list.length} member${list.length === 1 ? '' : 's'} as ${label}. The export was recorded.`)
    } catch (e: any) { say('', `The export was recorded, but the file could not be made: ${e?.message || e}`) }
    setBusy('')
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, marginBottom: 12 }
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
  const primary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }
  const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5 }
  const chip = (on: boolean): React.CSSProperties => ({ ...btn, borderRadius: 20, padding: '6px 13px', background: on ? 'var(--accent)' : 'var(--surface2)', color: on ? '#fff' : 'var(--text)', border: on ? '1px solid var(--accent)' : '1px solid var(--border)' })
  // Column headings stay in view while the list scrolls.
  const stickyTh: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)', textAlign: 'left', padding: '10px 10px', fontSize: 11, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 800, userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
  const th = (label: string, key?: SortKey, right = false) => (
    <th onClick={key ? () => sortBy(key) : undefined} title={key ? 'Click to sort' : undefined}
      style={{ ...stickyTh, textAlign: right ? 'right' : 'left', cursor: key ? 'pointer' : 'default' }}>
      {label}{key && sort.key === key ? <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span> : null}
    </th>
  )
  const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
  // A number card. Clicking it shows exactly those mothers in the list below;
  // clicking it again (while it is the one showing) goes back to everyone.
  const stat = (icon: React.ReactNode, label: string, value: number | string, sub: string | undefined, on: boolean, show: () => void) => (
    <button type="button" onClick={show} title={on ? 'Showing these in the list. Click to show everyone.' : 'Click to see these mothers in the list'}
      style={{ ...card, marginBottom: 0, display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        borderColor: on ? 'var(--accent)' : 'var(--border)', boxShadow: on ? '0 0 0 1px var(--accent)' : 'none' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: on ? 'var(--accent)' : 'var(--accent-dim, rgba(0,0,0,.06))', color: on ? '#fff' : 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none' }}>{icon}</div>
      <div style={{ minWidth: 0 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div><div style={muted}>{label}{sub ? ` · ${sub}` : ''}</div></div>
    </button>
  )
  const clearFilters = () => { setStage('all'); setGroup('all'); setActivity('all'); setTerms('all'); setBuy('all'); setWeekly('all'); setFrom(''); setTo(''); setQ('') }
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const only = { stage: stage === 'all', group: group === 'all', activity: activity === 'all', terms: terms === 'all', buy: buy === 'all', weekly: weekly === 'all', dates: !from && !to, q: !q.trim() }
  const plain = kind === 'mother' && only.group && only.terms && only.q
  // Which card, if any, describes exactly what the list is showing now.
  const showing = !plain ? '' :
    only.stage && only.activity && only.buy && only.weekly && only.dates ? 'all' :
    only.stage && activity === 'active' && only.buy && only.weekly && only.dates ? 'active' :
    only.stage && only.activity && only.buy && only.weekly && from === weekAgo && !to ? 'week' :
    only.stage && only.activity && buy === 'yes' && only.weekly && only.dates ? 'buyers' :
    only.stage && only.activity && only.buy && weekly === 'yes' && only.dates ? 'weekly' :
    only.activity && only.buy && only.weekly && only.dates && stage !== 'all' ? stage : ''
  // Show one card's mothers: start from everyone, apply that one filter, bring the list into view.
  const showCard = (which: string, apply: () => void) => {
    setKind('mother'); setPicked(new Set()); clearFilters()
    if (showing !== which) apply()
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const filtersOn = stage !== 'all' || group !== 'all' || activity !== 'all' || terms !== 'all' || buy !== 'all' || weekly !== 'all' || !!from || !!to || !!q.trim()
  const counts = { mother: mothers.length, expert: members.filter(m => m.kind === 'expert').length, test: members.filter(m => m.kind === 'test').length }

  if (loading) return <CirclePage title="Members"><div style={muted}>Loading Circle members...</div></CirclePage>
  if (error && !members.length) return <CirclePage title="Members"><div style={{ ...card, borderColor: '#E3A5A5', background: '#FCEDED', color: '#8F1D1D', fontSize: 13.5 }}>{error}</div></CirclePage>

  const fact = (label: string, value: React.ReactNode) => (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--text3)' }}>{label}</span><span style={{ color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--text3)', margin: '18px 0 8px' }
  const ob = open ? bought[open.user_id] : undefined

  return (
    <CirclePage title="Members" sub="Everyone who has joined Malkia Circle. Click a mother to open her panel. This page only reads; nothing here changes a mother's record."
      right={canExport && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={muted}><Icon name="download" size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{busy === 'export' ? 'Exporting...' : pickedShown.length ? `Export ${pickedShown.length} ticked as` : `Export ${rows.length} as`}</span>
          <button style={primary} onClick={() => exportRows('pdf')} disabled={!!busy || !rows.length}>PDF</button>
          <button style={btn} onClick={() => exportRows('csv')} disabled={!!busy || !rows.length}>CSV</button>
          <button style={btn} onClick={() => exportRows('xlsx')} disabled={!!busy || !rows.length}>Excel</button>
        </div>
      )}>

      {notice && <div style={{ ...card, borderColor: '#A9D9B4', background: '#EAF8EE', color: '#1E6B34', fontSize: 13 }}>{notice}</div>}
      {error && <div style={{ ...card, borderColor: '#E3A5A5', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}>
        {stat(<Icon name="users" size={19} />, 'mothers in Circle', stats.total, undefined, showing === 'all', () => showCard('all', () => {}))}
        {stat(<Icon name="chat" size={19} />, 'have asked or answered', stats.active, stats.total ? `${Math.round(stats.active * 100 / stats.total)}%` : undefined, showing === 'active', () => showCard('active', () => setActivity('active')))}
        {stat(<Icon name="heart" size={19} />, 'joined in the last 7 days', stats.week, `${stats.month} in 30 days`, showing === 'week', () => showCard('week', () => setFrom(weekAgo)))}
        {stat(<Icon name="bag" size={19} />, 'have bought from Malkia', stats.buyers, stats.buyers ? tzs(stats.spent) : 'none yet', showing === 'buyers', () => showCard('buyers', () => setBuy('yes')))}
        {stat(<Icon name="send" size={19} />, 'subscribed to weekly lessons', stats.weekly, undefined, showing === 'weekly', () => showCard('weekly', () => setWeekly('yes')))}
        {stats.byStage.map(([st, n]) => <div key={st}>{stat(<Icon name={st === 'pregnancy' ? 'heart' : st === 'parenting' ? 'baby' : 'sprout'} size={19} />, STAGE_LABEL[st], n, stats.total ? `${Math.round(n * 100 / stats.total)}%` : undefined, showing === st, () => showCard(st, () => setStage(st)))}</div>)}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {(['mother', 'expert', 'test'] as Kind[]).map(k => <button key={k} style={chip(kind === k)} onClick={() => { setKind(k); setPicked(new Set()) }}>{k === 'mother' ? 'Mothers' : k === 'expert' ? 'Experts' : 'Test accounts'} {counts[k]}</button>)}
          <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          <button style={chip(stage === 'all')} onClick={() => setStage('all')}>All stages</button>
          {(['pregnancy', 'parenting', 'ttc'] as Stage[]).map(st => <button key={st} style={chip(stage === st)} onClick={() => setStage(st)}>{STAGE_LABEL[st]}</button>)}
          <span style={{ flex: 1 }} />
          {filtersOn && <button style={btn} onClick={clearFilters}><Icon name="x" size={14} />Clear filters</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }} />
            <input style={{ ...inp, width: '100%', paddingLeft: 30 }} placeholder="Search by name or number" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select style={{ ...inp, width: '100%' }} value={group} onChange={e => setGroup(e.target.value)} title="Your own groups">
            <option value="all">All groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.n})</option>)}
          </select>
          <select style={{ ...inp, width: '100%' }} value={activity} onChange={e => setActivity(e.target.value as any)}>
            <option value="all">Active and silent</option><option value="active">Has asked or answered</option><option value="silent">Never posted</option>
          </select>
          <select style={{ ...inp, width: '100%' }} value={buy} onChange={e => setBuy(e.target.value as any)} title="Purchases from Malkia, matched by her WhatsApp number">
            <option value="all">Bought or not</option><option value="yes">Has bought from Malkia</option><option value="no">Never bought</option>
          </select>
          <select style={{ ...inp, width: '100%' }} value={weekly} onChange={e => setWeekly(e.target.value as any)}>
            <option value="all">Subscriptions: all</option><option value="yes">Weekly lessons</option>
          </select>
          <select style={{ ...inp, width: '100%' }} value={terms} onChange={e => setTerms(e.target.value as any)}>
            <option value="all">Terms: all</option><option value="yes">Accepted the terms</option><option value="no">No terms record</option>
          </select>
          <label style={{ ...muted, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>Joined<input type="date" style={{ ...inp, flex: 1, minWidth: 0 }} value={from} onChange={e => setFrom(e.target.value)} aria-label="Joined from" /></label>
          <label style={{ ...muted, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>to<input type="date" style={{ ...inp, flex: 1, minWidth: 0 }} value={to} onChange={e => setTo(e.target.value)} aria-label="Joined to" /></label>
        </div>
      </div>

      <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: pickedShown.length ? 'var(--surface2)' : 'var(--surface)' }}>
        <b style={{ fontSize: 13, color: 'var(--text)' }}>Groups</b>
        <span style={muted}>{pickedShown.length ? `${pickedShown.length} ticked.` : 'Tick members in the list, then add them to a group of your own.'}</span>
        <span style={{ flex: 1 }} />
        {newGroup === null ? (
          <>
            {groups.length > 0 && <>
              <select style={inp} value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">Choose a group</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.n})</option>)}
              </select>
              <button style={btn} onClick={() => setMembership(true)} disabled={!!busy || !target || !pickedShown.length}>Add ticked</button>
              <button style={btn} onClick={() => setMembership(false)} disabled={!!busy || !target || !pickedShown.length}>Remove ticked</button>
              {target && <button style={{ ...btn, color: '#8F1D1D' }} onClick={() => { const g = groups.find(x => x.id === target); if (g) deleteGroup(g) }} disabled={!!busy} title="Delete this group"><Icon name="trash" size={14} />Delete group</button>}
            </>}
            <button style={primary} onClick={() => setNewGroup('')} disabled={!!busy}><Icon name="folder" size={15} />New group</button>
          </>
        ) : (
          <>
            <input style={{ ...inp, minWidth: 220 }} autoFocus maxLength={60} placeholder="Group name, for example Dar launch event" value={newGroup} onChange={e => setNewGroup(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createGroup() }} />
            <button style={primary} onClick={createGroup} disabled={!!busy || newGroup.trim().length < 2}>{busy === 'group' ? 'Saving...' : pickedShown.length ? `Create with ${pickedShown.length} ticked` : 'Create group'}</button>
            <button style={btn} onClick={() => setNewGroup(null)} disabled={!!busy}>Cancel</button>
          </>
        )}
      </div>

      <div ref={listRef} style={{ ...card, padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 150px)', scrollMarginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ ...stickyTh, width: 34 }}><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Tick everyone shown" /></th>
              {th('No', 'member_no')}{th('Name', 'name')}{th('WhatsApp')}{th('Stage', 'stage')}{th('Joined', 'created_at')}{th('Activity', 'last_active')}{th('Bought', 'bought', true)}{th('Groups')}
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.user_id} onClick={() => openMember(m)} title="Open her panel"
                style={{ background: open?.user_id === m.user_id ? 'var(--accent-dim, rgba(0,0,0,.05))' : picked.has(m.user_id) ? 'var(--surface2)' : undefined, cursor: 'pointer' }}>
                <td style={td} onClick={e => e.stopPropagation()}><input type="checkbox" checked={picked.has(m.user_id)} onChange={() => toggle(m.user_id)} aria-label={`Tick ${m.name}`} /></td>
                <td style={{ ...td, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{m.member_no}</td>
                <td style={td}>
                  <div style={{ fontWeight: 700 }}>{m.name}{m.founder_no ? <span title="Mama Mwanzilishi (founding mother)" style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: '#FFF4D2', color: '#6B4E00', whiteSpace: 'nowrap' }}>Founder #{m.founder_no}</span> : null}</div>
                  <div style={{ ...muted, fontSize: 11.5 }}>@{m.username}{m.weekly_wa ? ' · weekly lessons' : ''}</div>
                </td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{local(m.whatsapp)}</td>
                <td style={td}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: (STAGE_COLOR[m.stage] || STAGE_COLOR.parenting)[0], color: (STAGE_COLOR[m.stage] || STAGE_COLOR.parenting)[1], whiteSpace: 'nowrap' }}>{STAGE_LABEL[m.stage] || m.stage}</span>
                  {detail(m) && <div style={{ ...muted, fontSize: 11.5, marginTop: 3 }}>{detail(m)}</div>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{day(m.created_at)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {m.questions + m.answers > 0 ? (
                    <>
                      <div style={{ fontWeight: 600 }}>{[m.questions ? `${m.questions} asked` : '', m.answers ? `${m.answers} answered` : ''].filter(Boolean).join(' · ')}</div>
                      <div style={{ ...muted, fontSize: 11.5 }}>last {day(m.last_active)}</div>
                    </>
                  ) : <span style={{ color: 'var(--text3)' }}>{m.last_active ? `reacted ${day(m.last_active)}` : 'Never posted'}</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {bought[m.user_id]?.orders > 0 ? (
                    <>
                      <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{tzs(Number(bought[m.user_id].total))}</div>
                      <div style={{ ...muted, fontSize: 11.5 }}>{bought[m.user_id].orders} order{bought[m.user_id].orders === 1 ? '' : 's'} · last {day(bought[m.user_id].last_at)}</div>
                    </>
                  ) : <span style={{ color: 'var(--text3)' }}>{bought[m.user_id] ? 'Customer, no order' : ''}</span>}
                </td>
                <td style={td}>{m.groups.map(groupName).filter(Boolean).map(n => <span key={n} style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', border: '1px solid var(--border)', marginRight: 4, marginBottom: 2 }}>{n}</span>)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 28 }}>{filtersOn ? 'No member matches these filters.' : 'Nobody here yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={muted}>Showing {rows.length} of {counts[kind]}. "Asked" counts questions she asked without her name too, but no page here shows which ones. "Bought" counts posted cash sales and sales invoices on customer records that carry her WhatsApp number; a purchase under a different number will not show.</div>

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
          <aside onClick={e => e.stopPropagation()} role="dialog" aria-label={`${open.name}, Circle member`}
            style={{ width: 'min(460px, 100vw)', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: '18px 20px 28px', boxShadow: '-12px 0 40px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>{open.name}</div>
                <div style={muted}>@{open.username} · member {open.member_no}{open.kind !== 'mother' ? ` · ${open.kind === 'expert' ? 'expert' : 'test account'}` : ''}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: (STAGE_COLOR[open.stage] || STAGE_COLOR.parenting)[0], color: (STAGE_COLOR[open.stage] || STAGE_COLOR.parenting)[1] }}>{STAGE_LABEL[open.stage] || open.stage}{detail(open) ? ` · ${detail(open)}` : ''}</span>
                  {open.founder_no ? <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: '#FFF4D2', color: '#6B4E00' }}>Founder #{open.founder_no}</span> : null}
                </div>
              </div>
              <button style={{ ...btn, padding: 7 }} onClick={() => setOpen(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 4px' }}>
              <button style={btn} onClick={() => { navigator.clipboard?.writeText(local(open.whatsapp)).then(() => setCopied(true), () => setCopied(false)) }}><Icon name="copy" size={14} />{copied ? 'Copied' : local(open.whatsapp)}</button>
              {onNav && <button style={primary} onClick={() => openChat(open)} title="Opens the WhatsApp Inbox searched on her number"><Icon name="chat" size={14} />Open her chat in the Inbox</button>}
            </div>

            <div style={sectionTitle}>About her</div>
            {fact('Joined', day(open.created_at))}
            {fact('Terms', open.terms_accepted_at ? `Version ${open.terms_version || '1'}, accepted ${day(open.terms_accepted_at)}` : 'No record (joined before the terms page)')}
            {fact('Number proved by code', open.whatsapp_verified_at ? day(open.whatsapp_verified_at) : 'Not yet')}
            {fact('Weekly lessons', open.weekly_wa ? 'Subscribed' : 'Not subscribed')}
            {fact('Groups', open.groups.map(groupName).filter(Boolean).join(', ') || 'None')}

            {detailErr && <div style={{ ...card, borderColor: '#E3A5A5', background: '#FCEDED', color: '#8F1D1D', fontSize: 13, marginTop: 14 }}>{detailErr}</div>}
            {!detail_ && !detailErr && <div style={{ ...muted, marginTop: 16 }}>Loading her activity...</div>}
            {detail_ && (
              <>
                <div style={sectionTitle}>Bought from Malkia{detail_.orders.length ? ` · ${tzs(detail_.orders.reduce((n, o) => n + Number(o.total), 0))}` : ''}</div>
                {detail_.orders.length === 0 && <div style={muted}>{ob ? 'She is in the customer list but has no posted order.' : 'No order found under this number.'}</div>}
                {detail_.orders.map(o => (
                  <div key={o.ref} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', marginBottom: 6, fontSize: 13 }}>
                    <span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{o.ref}</b> <span style={{ color: 'var(--text3)' }}>· {o.type === 'cash_sale' ? 'Cash sale' : 'Invoice'} · {day(o.at)}</span></span>
                    <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tzs(Number(o.total))}</b>
                  </div>
                ))}

                <div style={sectionTitle}>Asked · {detail_.questions.length + detail_.hidden_name_questions}</div>
                {detail_.questions.length + detail_.hidden_name_questions === 0 && <div style={muted}>She has not asked a question.</div>}
                {detail_.questions.map(qn => (
                  <a key={qn.id} href={SITE + qn.id} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', marginBottom: 6, textDecoration: 'none', color: 'var(--text)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{qn.title} <Icon name="external" size={12} style={{ verticalAlign: -1, color: 'var(--text3)' }} /></div>
                    <div style={{ ...muted, fontSize: 11.5 }}>{day(qn.created_at)} · {qn.answers} answer{qn.answers === 1 ? '' : 's'}</div>
                  </a>
                ))}
                {detail_.hidden_name_questions > 0 && <div style={muted}>Plus {detail_.hidden_name_questions} asked without her name. Those are not shown, by design.</div>}

                <div style={sectionTitle}>Answered · {detail_.answers.length}{detail_.maua ? ` · ${detail_.maua} flower${detail_.maua === 1 ? '' : 's'} received` : ''}</div>
                {detail_.answers.length === 0 && <div style={muted}>She has not answered another mother yet.</div>}
                {detail_.answers.map(a => (
                  <a key={a.id} href={`${SITE}${a.question_id}#jibu-${a.id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', marginBottom: 6, textDecoration: 'none', color: 'var(--text)' }}>
                    <div style={{ ...muted, fontSize: 11.5 }}>On: {a.question}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 2 }}>{a.body}{a.body.length >= 220 ? '...' : ''}</div>
                    <div style={{ ...muted, fontSize: 11.5, marginTop: 2 }}>{day(a.created_at)}</div>
                  </a>
                ))}
              </>
            )}
          </aside>
        </div>
      )}
    </CirclePage>
  )
}
