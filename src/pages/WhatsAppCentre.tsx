import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { sendWhatsApp, type WaPurpose } from '../lib/wa'
import {
  useWaInbox, refreshWaInbox, waMarkHandled, waMarkHandledBulk, waSetPriority,
  waWaitedFor, waWindowLeftMs, waDuration, type WaPriority,
} from '../lib/waInbox'

/* WhatsApp Inbox: every customer conversation on the Malkia WhatsApp number
   (Twilio), in one full-height chat screen. Replaces both the retired inbox
   and the boxed "Command Centre" panel.

   Built on wa_contacts / wa_messages. A conversation "needs a reply" from the
   first unanswered customer message until a reply is sent or someone marks it
   handled (migration 060). Waiting conversations are listed first, by
   priority, with the time left on each 24h reply window. New messages arrive
   live (migration 061). Access requires the WhatsApp Inbox permission. */

interface Contact {
  phone: string; name: string | null; first_source: string | null
  consent_marketing: boolean; tags: string[]
  last_inbound_at: string | null; last_outbound_at: string | null
  circle_user_id: string | null; os_customer_id: string | null; dealer_shop_id: string | null
}
interface Msg {
  id: string; direction: 'in' | 'out'; purpose: string; body: string | null
  status: string; error: string | null; created_at: string
}

/* ── theme: the user picks light or dark; remembered on this browser ── */
type ThemeName = 'light' | 'dark'
interface Palette {
  bg: string; panel: string; panel2: string; border: string
  text: string; text2: string; text3: string
  inBubble: string; inText: string; outBubble: string; outText: string
  accent: string; accentText: string; input: string
  danger: string; dangerBg: string; dangerBorder: string; ok: string; read: string
  prio: Record<WaPriority, { color: string; bg: string }>
}
const THEMES: Record<ThemeName, Palette> = {
  light: {
    bg: '#F4F7F6', panel: '#FFFFFF', panel2: '#EFF3F2', border: '#DDE5E2',
    text: '#14201C', text2: '#44524E', text3: '#7A8884',
    inBubble: '#EFF3F2', inText: '#14201C', outBubble: '#D9F3E4', outText: '#0E3B28',
    accent: '#1F7A3D', accentText: '#FFFFFF', input: '#FFFFFF',
    danger: '#B42318', dangerBg: '#FDECEC', dangerBorder: '#F5B5B5', ok: '#1F7A3D', read: '#1D4ED8',
    prio: { high: { color: '#B42318', bg: '#FDECEC' }, normal: { color: '#9A6700', bg: '#FFF4D6' }, low: { color: '#3F6B4F', bg: '#EAF6EC' } },
  },
  dark: {
    bg: '#090D0C', panel: '#101614', panel2: '#18201D', border: '#26322E',
    text: '#EDF3F0', text2: '#B4C0BB', text3: '#7C8A85',
    inBubble: '#1A2320', inText: '#EDF3F0', outBubble: '#0E5A39', outText: '#E8FFF3',
    accent: '#22C97A', accentText: '#04130C', input: '#0D1311',
    danger: '#FF8A80', dangerBg: '#34140F', dangerBorder: '#6B2A25', ok: '#4ADE80', read: '#A5C8FF',
    prio: { high: { color: '#FF8A80', bg: '#3A1612' }, normal: { color: '#F5C451', bg: '#33290F' }, low: { color: '#86D4A3', bg: '#12291B' } },
  },
}
const PRIO_LABEL: Record<WaPriority, string> = { high: 'High', normal: 'Normal', low: 'Low' }
const THEME_KEY = 'malkia.waInbox.theme'
const readTheme = (): ThemeName => {
  try { return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const windowOpen = (c: { last_inbound_at: string | null }) => waWindowLeftMs(c.last_inbound_at) > 0
const NO_TEXT = '[Voice note, photo or sticker]'

const PAGE_CSS = `
@keyframes waDotRing { 0% { box-shadow: 0 0 0 0 rgba(217,45,32,.6) } 70% { box-shadow: 0 0 0 7px rgba(217,45,32,0) } 100% { box-shadow: 0 0 0 0 rgba(217,45,32,0) } }
.wa-dot { width: 9px; height: 9px; border-radius: 50%; background: #D92D20; flex-shrink: 0; animation: waDotRing 1.3s ease-out infinite }
@media (prefers-reduced-motion: reduce) { .wa-dot { animation: none } }
.wa-inbox-scroll::-webkit-scrollbar { width: 8px }
.wa-inbox-scroll::-webkit-scrollbar-thumb { background: rgba(128,128,128,.35); border-radius: 8px }
`

export default function WhatsAppInbox() {
  const inbox = useWaInbox()
  const [theme, setTheme] = useState<ThemeName>(readTheme)
  const t = THEMES[theme]
  const [q, setQ] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [sel, setSel] = useState<Contact | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [purpose, setPurpose] = useState<WaPurpose>('support')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [view, setView] = useState<'waiting' | 'all'>('waiting')
  const [pf, setPf] = useState<WaPriority | 'all'>('all')
  const [, setTick] = useState(0) // re-render every minute so countdowns move

  const qRef = useRef(q); qRef.current = q
  const selRef = useRef<Contact | null>(sel); selRef.current = sel
  const endRef = useRef<HTMLDivElement | null>(null)

  const toggleTheme = () => {
    const next: ThemeName = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { window.localStorage.setItem(THEME_KEY, next) } catch { /* private mode: choice lasts for this visit */ }
  }

  const waiting = useMemo(() => new Map(inbox.items.map(i => [i.phone, i])), [inbox.items])
  const counts = useMemo(() => {
    const c: Record<WaPriority, number> = { high: 0, normal: 0, low: 0 }
    inbox.items.forEach(i => { c[i.reply_priority] = (c[i.reply_priority] || 0) + 1 })
    return c
  }, [inbox.items])

  const loadContacts = useCallback(async (query: string) => {
    const { data, error } = await supabase.rpc('wa_contacts_list', { p_q: query || null, p_limit: 200 })
    if (error) { setErr(error.message); return }
    const list = (data || []) as Contact[]
    setContacts(list)
    const cur = selRef.current
    if (cur) { const fresh = list.find(c => c.phone === cur.phone); if (fresh) setSel(fresh) }
  }, [])
  const loadMsgs = useCallback(async (phone: string) => {
    const { data, error } = await supabase.rpc('wa_messages_list', { p_phone: phone, p_limit: 200 })
    if (error) setErr(error.message); else setMsgs(((data || []) as Msg[]).slice().reverse())
  }, [])

  useEffect(() => { loadContacts('') }, [loadContacts])
  useEffect(() => { if (sel) loadMsgs(sel.phone); else setMsgs([]) }, [sel?.phone, loadMsgs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Whenever the waiting queue changes, refresh the contact list and the open thread.
  useEffect(() => {
    if (!inbox.loaded) return
    loadContacts(qRef.current)
    if (selRef.current) loadMsgs(selRef.current.phone)
  }, [inbox.items, inbox.loaded, loadContacts, loadMsgs])

  // Live: any new or updated message for the open conversation reloads it at
  // once (delivery ticks included). A slow poll stays as a safety net.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase
        .channel('wa-inbox-thread')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, (payload: any) => {
          const phone = payload?.new?.phone || payload?.old?.phone
          const cur = selRef.current
          if (cur && phone === cur.phone) loadMsgs(cur.phone)
        })
        .subscribe()
    } catch { channel = null }
    const poll = window.setInterval(() => { if (selRef.current) loadMsgs(selRef.current.phone) }, 30000)
    const minute = window.setInterval(() => setTick(x => x + 1), 60000)
    return () => {
      if (channel) { try { supabase.removeChannel(channel) } catch { /* ignore */ } }
      window.clearInterval(poll); window.clearInterval(minute)
    }
  }, [loadMsgs])

  // keep the newest message in view
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, sel?.phone])

  const pick = async (phone: string) => {
    const known = contacts.find(c => c.phone === phone)
    if (known) { setSel(known); return }
    const { data, error } = await supabase.rpc('wa_contacts_list', { p_q: phone, p_limit: 1 })
    if (error) { setErr(error.message); return }
    const row = ((data || []) as Contact[])[0]
    if (row) setSel(row)
  }

  const send = async () => {
    if (!sel || !text.trim()) return
    setBusy(true); setErr('')
    try {
      await sendWhatsApp({ phone: sel.phone, body: text.trim(), purpose })
      setText('')
      await loadMsgs(sel.phone)
      await refreshWaInbox() // a reply accepted by WhatsApp clears "needs reply" on the server
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  const markHandled = async (phone: string) => {
    setErr('')
    try { await waMarkHandled(phone) } catch (e: any) { setErr(e.message) }
  }
  const changePriority = async (phone: string, p: WaPriority) => {
    setErr('')
    try { await waSetPriority(phone, p) } catch (e: any) { setErr(e.message) }
  }
  const clearLow = async () => {
    if (!counts.low) return
    if (!window.confirm(`Mark ${counts.low} Low priority conversation${counts.low === 1 ? '' : 's'} (thanks and greetings) as handled without replying?`)) return
    setErr('')
    try { await waMarkHandledBulk('low') } catch (e: any) { setErr(e.message) }
  }

  const toggleConsent = async (c: Contact) => {
    const next = !c.consent_marketing
    const label = next
      ? `Record marketing consent for ${c.phone}? Only do this if the customer asked for it or agreed themselves.`
      : `Remove marketing consent for ${c.phone}?`
    if (!window.confirm(label)) return
    const { error } = await supabase.rpc('wa_contact_set_consent', { p_phone: c.phone, p_consent: next })
    if (error) setErr(error.message)
    else { await loadContacts(q); setSel(s => s && s.phone === c.phone ? { ...s, consent_marketing: next } : s) }
  }

  const srcLabels = (c: Contact) => {
    const l: string[] = []
    if (c.circle_user_id) l.push('Circle')
    if (c.os_customer_id) l.push('Customer')
    if (c.dealer_shop_id) l.push('Dealer')
    if (!l.length && c.first_source) l.push(c.first_source)
    return l
  }

  const needle = q.trim().toLowerCase()
  const waitingList = inbox.items.filter(i =>
    (pf === 'all' || i.reply_priority === pf) &&
    (!needle || i.phone.toLowerCase().includes(needle) || (i.name || '').toLowerCase().includes(needle)))
  const allList = [...contacts].sort((a, b) => Number(waiting.has(b.phone)) - Number(waiting.has(a.phone)))

  const selWaiting = sel ? waiting.get(sel.phone) : undefined
  const selLeft = sel ? waWindowLeftMs(sel.last_inbound_at) : 0
  const canType = !!sel && selLeft > 0

  /* ── styles ── */
  const tab = (active: boolean, alert = false): CSSProperties => ({
    flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
    border: `1px solid ${active ? (alert ? t.danger : t.accent) : t.border}`,
    background: active ? (alert ? t.dangerBg : t.accent) : 'transparent',
    color: active ? (alert ? t.danger : t.accentText) : (alert ? t.danger : t.text2),
  })
  const chip = (active: boolean, color?: string, bg?: string): CSSProperties => ({
    padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? (color || t.accent) : t.border}`,
    background: active ? (bg || t.panel2) : 'transparent', color: color || t.text2,
  })
  const rowStyle = (active: boolean): CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', cursor: 'pointer',
    borderBottom: `1px solid ${t.border}`, background: active ? t.panel2 : 'transparent', color: t.text,
  })
  const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

  const tick = (m: Msg) => {
    if (m.direction !== 'out') return null
    if (m.status === 'failed') return <span style={{ color: t.danger, fontWeight: 800 }}>not delivered{m.error ? ` (${m.error})` : ''}</span>
    if (m.status === 'read') return <span style={{ color: t.read, fontWeight: 800 }}>read ✓✓</span>
    if (m.status === 'delivered') return <span>delivered ✓✓</span>
    if (m.status === 'sent') return <span>sent ✓</span>
    return <span>{m.status}</span>
  }

  return (
    <div style={{ flex: '1 1 0%', minHeight: 440, display: 'flex', flexDirection: 'column', background: t.bg, color: t.text }}>
      <style>{PAGE_CSS}</style>

      {/* page header */}
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.border}`, background: t.panel, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>WhatsApp Inbox</div>
          <div style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>
            {inbox.items.length === 0
              ? 'No customer is waiting for a reply.'
              : `${inbox.items.length} waiting for a reply${counts.high ? ` · ${counts.high} high priority` : ''}. A conversation stays here until someone replies or marks it as handled.`}
          </div>
        </div>
        <button onClick={toggleTheme} title="Switch between light and dark. Remembered on this browser."
          style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.panel2, color: t.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {theme === 'dark'
              ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
              : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
          </svg>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {err && <div style={{ padding: '9px 18px', background: t.dangerBg, borderBottom: `1px solid ${t.dangerBorder}`, color: t.danger, fontSize: 13 }}>{err}</div>}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* conversation list */}
        <div style={{ width: 370, flexShrink: 0, borderRight: `1px solid ${t.border}`, background: t.panel, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => setView('waiting')} style={tab(view === 'waiting', inbox.items.length > 0)}>Waiting ({inbox.items.length})</button>
              <button onClick={() => setView('all')} style={tab(view === 'all')}>All</button>
            </div>
            <input value={q} onChange={e => { setQ(e.target.value); loadContacts(e.target.value) }} placeholder="Search name or number..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 13, background: t.input, color: t.text, boxSizing: 'border-box' }} />
            {view === 'waiting' && (
              <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setPf('all')} style={chip(pf === 'all')}>All</button>
                {(['high', 'normal', 'low'] as WaPriority[]).map(p => (
                  <button key={p} onClick={() => setPf(p)} style={chip(pf === p, t.prio[p].color, t.prio[p].bg)}>{PRIO_LABEL[p]} {counts[p]}</button>
                ))}
              </div>
            )}
            {view === 'waiting' && counts.low > 0 && (
              <button onClick={clearLow} title="Thanks and greetings that do not need an answer"
                style={{ marginTop: 9, width: '100%', padding: '6px 8px', borderRadius: 8, border: `1px dashed ${t.border}`, background: 'transparent', fontSize: 11.5, fontWeight: 700, color: t.text2, cursor: 'pointer' }}>
                Mark all Low ({counts.low}) as handled
              </button>
            )}
          </div>
          <div className="wa-inbox-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {view === 'waiting' && (
              <>
                {!waitingList.length && <div style={{ padding: 18, fontSize: 12.5, color: t.text3 }}>
                  {inbox.items.length ? 'Nothing matches this filter.' : 'No customer is waiting for a reply. Good work.'}
                </div>}
                {waitingList.map(i => {
                  const left = waWindowLeftMs(i.last_inbound_at)
                  const pr = t.prio[i.reply_priority] || t.prio.normal
                  return (
                    <button key={i.phone} onClick={() => pick(i.phone)} style={rowStyle(sel?.phone === i.phone)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="wa-dot" />
                        <span style={{ fontWeight: 800, fontSize: 13.5, ...ellipsis }}>{i.name || i.phone}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: pr.color, background: pr.bg, borderRadius: 999, padding: '1px 8px' }}>{PRIO_LABEL[i.reply_priority] || 'Normal'}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: t.text2, marginTop: 4, ...ellipsis }}>{i.last_inbound_body || NO_TEXT}</div>
                      <div style={{ fontSize: 11, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ color: t.danger, fontWeight: 700 }}>waiting {waWaitedFor(i.needs_reply_since)}</span>
                        <span style={{ color: left > 0 ? t.ok : t.text3, fontWeight: 700 }}>
                          {left > 0 ? `reply window: ${waDuration(left)} left` : 'reply window closed'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
            {view === 'all' && (
              <>
                {!contacts.length && <div style={{ padding: 18, fontSize: 12.5, color: t.text3 }}>No contacts yet. They appear when the first message is sent or received.</div>}
                {allList.map(c => (
                  <button key={c.phone} onClick={() => setSel(c)} style={rowStyle(sel?.phone === c.phone)}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {waiting.has(c.phone) && <span className="wa-dot" title="Waiting for a reply" />}
                      <span style={ellipsis}>{c.name || c.phone}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: t.text3, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                      {c.name && <span>{c.phone}</span>}
                      {srcLabels(c).map(s => <span key={s} style={{ background: t.panel2, borderRadius: 999, padding: '1px 7px' }}>{s}</span>)}
                      {windowOpen(c) && <span style={{ color: t.ok, fontWeight: 700 }}>window open</span>}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* conversation */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!sel && (
            <div style={{ margin: 'auto', color: t.text3, fontSize: 14, textAlign: 'center', padding: 24 }}>
              {inbox.items.length ? 'Select a conversation on the left.' : 'No conversations waiting. Select a contact under All to see history.'}
            </div>
          )}
          {sel && (
            <>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.border}`, background: t.panel, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, ...ellipsis }}>{sel.name || sel.phone}</div>
                  <div style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>
                    {sel.name ? `${sel.phone} · ` : ''}
                    <span style={{ color: selLeft > 0 ? t.ok : t.text3, fontWeight: 700 }}>
                      {selLeft > 0 ? `Reply window open: ${waDuration(selLeft)} left` : 'Reply window closed'}
                    </span>
                  </div>
                </div>
                <button onClick={() => toggleConsent(sel)}
                  style={{ marginLeft: 'auto', padding: '6px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                    border: `1px solid ${t.border}`, background: sel.consent_marketing ? t.prio.low.bg : t.panel2,
                    color: sel.consent_marketing ? t.prio.low.color : t.text2 }}>
                  Marketing: {sel.consent_marketing ? 'ALLOWED' : 'NOT ALLOWED'}
                </button>
              </div>

              {selWaiting && (
                <div style={{ padding: '9px 18px', borderBottom: `1px solid ${t.dangerBorder}`, background: t.dangerBg, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="wa-dot" />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: t.danger }}>Waiting for a reply: {waWaitedFor(selWaiting.needs_reply_since)}</span>
                  <label style={{ fontSize: 11.5, color: t.danger, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Priority
                    <select value={selWaiting.reply_priority} onChange={e => changePriority(sel.phone, e.target.value as WaPriority)}
                      style={{ borderRadius: 6, border: `1px solid ${t.dangerBorder}`, fontSize: 11.5, padding: '2px 4px', background: t.input, color: t.text }}>
                      {(['high', 'normal', 'low'] as WaPriority[]).map(p => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
                    </select>
                  </label>
                  <button onClick={() => markHandled(sel.phone)} title="Use this if you called the customer, or the message needs no answer"
                    style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: `1px solid ${t.danger}`, background: t.panel, color: t.danger, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                    Mark as handled
                  </button>
                </div>
              )}

              <div className="wa-inbox-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {msgs.map(m => {
                  const out = m.direction === 'out'
                  const isTpl = !!m.body && m.body.startsWith('[tpl] ')
                  const body = isTpl ? m.body!.slice(6) : m.body
                  return (
                    <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '72%',
                      background: out ? t.outBubble : t.inBubble, color: out ? t.outText : t.inText, borderRadius: 12, padding: '9px 12px' }}>
                      <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {body || <i style={{ opacity: .75 }}>{out ? '(template message)' : `${NO_TEXT} It cannot be shown here. Call the customer or ask them to type it.`}</i>}
                      </div>
                      <div style={{ fontSize: 10.5, opacity: .72, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>{stamp(m.created_at)}</span>
                        {out && <span>{m.purpose}{isTpl ? ' · template' : ''}</span>}
                        {tick(m)}
                      </div>
                    </div>
                  )
                })}
                {!msgs.length && <div style={{ color: t.text3, fontSize: 12.5 }}>No messages yet.</div>}
                <div ref={endRef} />
              </div>

              {!canType && (
                <div style={{ padding: '9px 18px', borderTop: `1px solid ${t.dangerBorder}`, fontSize: 12, color: t.danger, background: t.dangerBg }}>
                  The 24 hour reply window is closed, so WhatsApp will reject a normal message. Call the customer on {sel.phone}{selWaiting ? ', then tap "Mark as handled".' : '.'}
                </div>
              )}
              <div style={{ padding: 12, borderTop: `1px solid ${t.border}`, background: t.panel, display: 'flex', gap: 8 }}>
                <select value={purpose} onChange={e => setPurpose(e.target.value as WaPurpose)} disabled={!canType} title="Message type"
                  style={{ borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12.5, padding: '0 6px', background: t.input, color: t.text }}>
                  {(['support', 'order', 'receipt', 'tip', 'system', 'marketing'] as WaPurpose[]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} disabled={!canType}
                  placeholder={canType ? 'Type a reply...' : 'Reply window closed'}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 13.5, background: t.input, color: t.text, opacity: canType ? 1 : .6 }} />
                <button disabled={busy || !text.trim() || !canType} onClick={send}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: t.accent, color: t.accentText, fontWeight: 800, cursor: 'pointer', opacity: busy || !text.trim() || !canType ? .55 : 1 }}>
                  {busy ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
