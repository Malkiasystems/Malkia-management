import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  last_message_body?: string | null; last_message_at?: string | null; last_message_dir?: string | null
}
interface SearchHit {
  id: string; phone: string; name: string | null; direction: 'in' | 'out'
  body: string | null; created_at: string; media_type: string | null; purpose: string
}
interface Msg {
  id: string; direction: 'in' | 'out'; purpose: string; body: string | null
  status: string; error: string | null; created_at: string
  media_type?: string | null; media_path?: string | null; media_status?: string | null
}

/* ── theme: the user picks light or dark; remembered on this browser ── */
type ThemeName = 'light' | 'dark'
interface Palette {
  bg: string; panel: string; panel2: string; border: string
  text: string; text2: string; text3: string
  inBubble: string; inText: string; outBubble: string; outText: string
  accent: string; accentText: string; input: string
  danger: string; dangerBg: string; dangerBorder: string; ok: string; read: string
  band: string; bandText: string; listBg: string; rowSel: string; wall: string; wallInk: string
  mark: string; markText: string; searchBg: string; searchText: string
  prio: Record<WaPriority, { color: string; bg: string }>
}
const THEMES: Record<ThemeName, Palette> = {
  light: {
    bg: '#F4F7F6', panel: '#FFFFFF', panel2: '#EFF3F2', border: '#DDE5E2',
    text: '#14201C', text2: '#44524E', text3: '#7A8884',
    inBubble: '#FFFFFF', inText: '#14201C', outBubble: '#D9F3E4', outText: '#0E3B28',
    accent: '#1F7A3D', accentText: '#FFFFFF', input: '#FFFFFF',
    danger: '#B42318', dangerBg: '#FDECEC', dangerBorder: '#F5B5B5', ok: '#1F7A3D', read: '#1D4ED8',
    band: '#0E4F4A', bandText: '#EAF7F4', listBg: '#F1F6F5', rowSel: '#D9ECE7', wall: '#E4ECE9', wallInk: '#0E4F4A',
    mark: '#FFE08A', markText: '#3A2E00', searchBg: '#FFFFFF', searchText: '#14201C',
    prio: { high: { color: '#B42318', bg: '#FDECEC' }, normal: { color: '#9A6700', bg: '#FFF4D6' }, low: { color: '#3F6B4F', bg: '#EAF6EC' } },
  },
  dark: {
    bg: '#090D0C', panel: '#101614', panel2: '#18201D', border: '#26322E',
    text: '#EDF3F0', text2: '#B4C0BB', text3: '#7C8A85',
    inBubble: '#1A2320', inText: '#EDF3F0', outBubble: '#0E5A39', outText: '#E8FFF3',
    accent: '#22C97A', accentText: '#04130C', input: '#0D1311',
    danger: '#FF8A80', dangerBg: '#34140F', dangerBorder: '#6B2A25', ok: '#4ADE80', read: '#A5C8FF',
    band: '#0A2B28', bandText: '#D9F2EC', listBg: '#0C1413', rowSel: '#15302B', wall: '#0A100F', wallInk: '#7DD3C1',
    mark: '#7A5B00', markText: '#FFF3C4', searchBg: '#0D1917', searchText: '#EDF3F0',
    prio: { high: { color: '#FF8A80', bg: '#3A1612' }, normal: { color: '#F5C451', bg: '#33290F' }, low: { color: '#86D4A3', bg: '#12291B' } },
  },
}
const PRIO_LABEL: Record<WaPriority, string> = { high: 'High', normal: 'Normal', low: 'Low' }
const THEME_KEY = 'malkia.waInbox.theme'
const readTheme = (): ThemeName => {
  try { return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (iso: string) => {
  const d = new Date(iso), now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const windowOpen = (c: { last_inbound_at: string | null }) => waWindowLeftMs(c.last_inbound_at) > 0

/* chat-list time, the way messaging apps show it */
const listTime = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86400000)
  if (diff <= 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
const cleanBody = (body: string | null | undefined) => (body || '').replace(/^\[tpl\] /, '')

/* WhatsApp does not share customers' profile photos with businesses, so each
   chat gets a badge: initials on a colour that is always the same for that number */
const AVATAR_HUES = ['#0F766E', '#9A3B6B', '#B4530F', '#3D5A99', '#5B7F2B', '#7A4FA3', '#A33A3A', '#2F7A8C']
const hashOf = (str: string) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h }
const initialsOf = (name: string | null, phone: string) => {
  const words = (name || '').trim().split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w))
  if (words.length) return (words[0][0] + (words[1]?.[0] || '')).toUpperCase()
  return phone.replace(/\D/g, '').slice(-2)
}
function Avatar({ name, phone, size = 42 }: { name: string | null; phone: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: AVATAR_HUES[hashOf(phone) % AVATAR_HUES.length],
      color: '#fff', fontWeight: 700, fontSize: size * 0.36, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '.3px' }}>
      {initialsOf(name, phone)}
    </span>
  )
}

/* search: show the words around the match, with the match highlighted */
const snippetAround = (body: string, q: string, radius = 34) => {
  const i = body.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return body
  const start = Math.max(0, i - radius)
  return (start > 0 ? '...' : '') + body.slice(start)
}
function Highlight({ text, q, t }: { text: string; q: string; t: Palette }) {
  if (!q) return <>{text}</>
  const out: ReactNode[] = []
  const low = text.toLowerCase(), needle = q.toLowerCase()
  let from = 0, i = low.indexOf(needle), k = 0
  while (i >= 0) {
    if (i > from) out.push(text.slice(from, i))
    out.push(<mark key={k++} style={{ background: t.mark, color: t.markText, borderRadius: 3, padding: '0 1px' }}>{text.slice(i, i + q.length)}</mark>)
    from = i + q.length
    i = low.indexOf(needle, from)
  }
  if (from < text.length) out.push(text.slice(from))
  return <>{out}</>
}

/* chat wallpaper: a faint crown pattern (Malkia = queen). The one decorative
   element; it marks this area as customer conversations, not system menus. */
const crownWallpaper = (ink: string) => {
  const crown = 'M0 11 L2.6 2.4 L7 7.4 L10 0 L13 7.4 L17.4 2.4 L20 11 Z'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="${ink}" fill-opacity="0.075"><path transform="translate(12 16)" d="${crown}"/><path transform="translate(60 64)" d="${crown}"/></g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
const NO_TEXT = '[Voice note, photo or sticker]'

/* media: files live in the private wa-media bucket; the app opens them through
   short-lived signed links, cached so a thread does not re-request them */
const MEDIA_LABEL = /^\[(Voice note|Photo|Video|Document|Sticker|Contact)\]\s?/
const signedCache = new Map<string, { url: string; until: number }>()
async function signedMediaUrl(path: string): Promise<string | null> {
  const hit = signedCache.get(path)
  if (hit && hit.until > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from('wa-media').createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  signedCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60000 })
  return data.signedUrl
}
const mediaKind = (type: string | null | undefined) => {
  const t = (type || '').toLowerCase()
  if (t.startsWith('audio/')) return 'voice note'
  if (t === 'image/webp') return 'sticker'
  if (t.startsWith('image/')) return 'photo'
  if (t.startsWith('video/')) return 'video'
  return 'document'
}

const URL_RE = /(https?:\/\/[^\s<>()]+)/g
function Linkified({ text, q, t }: { text: string; q: string; t: Palette }) {
  const parts = text.split(URL_RE)
  return <>{parts.map((part, i) => i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{part}</a>
    : <Highlight key={i} text={part} q={q} t={t} />)}</>
}

function MediaBlock({ m, t, onReady }: { m: Msg; t: Palette; onReady?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const kind = mediaKind(m.media_type)
  useEffect(() => {
    let alive = true
    setUrl(null); setFailed(false)
    if (m.media_status === 'stored' && m.media_path) {
      signedMediaUrl(m.media_path).then(u => { if (alive) { if (u) setUrl(u); else setFailed(true) } })
    }
    return () => { alive = false }
  }, [m.media_path, m.media_status])

  const note = (text: string) => <div style={{ fontSize: 12, fontStyle: 'italic', opacity: .8, padding: '2px 0' }}>{text}</div>
  if (m.media_status === 'pending') return note(`Fetching the ${kind}...`)
  if (m.media_status === 'too_large') return note(`This ${kind} is larger than 25 MB and was not saved. Ask the customer to send it another way.`)
  if (m.media_status === 'failed' || failed) return note(`This ${kind} could not be fetched. Ask the customer to send it again.`)
  if (!url) return note(`Loading the ${kind}...`)
  const type = (m.media_type || '').toLowerCase()
  if (type.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title="Open full size">
        <img src={url} alt={kind} onLoad={onReady} style={{ display: 'block', maxWidth: 'min(320px, 100%)', maxHeight: 320, borderRadius: 8, border: `1px solid ${t.border}` }} />
      </a>
    )
  }
  if (type.startsWith('audio/')) {
    return (
      <div>
        <audio controls preload="none" src={url} style={{ width: 280, maxWidth: '100%', height: 38 }} />
        <div style={{ fontSize: 10.5, opacity: .75 }}>Voice note. <a href={url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Open in a new tab</a> if it does not play.</div>
      </div>
    )
  }
  if (type.startsWith('video/')) {
    return <video controls preload="metadata" src={url} onLoadedMetadata={onReady} style={{ display: 'block', maxWidth: 'min(320px, 100%)', maxHeight: 320, borderRadius: 8 }} />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      style={{ display: 'inline-block', padding: '7px 11px', borderRadius: 8, border: `1px solid ${t.border}`, color: 'inherit', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
      Open the {kind}
    </a>
  )
}

/* emoji picker: a small built-in set, no extra library to load */
const EMOJI: { title: string; items: string[] }[] = [
  { title: 'Warm', items: ['🙏', '😊', '🥰', '😍', '😘', '🤗', '😄', '😁', '😂', '🙂', '😉', '😇', '🤩', '😌', '🥹', '😢', '😔', '😅'] },
  { title: 'Hearts', items: ['❤️', '💕', '💖', '💗', '💓', '💞', '💝', '🧡', '💛', '💚', '💙', '💜', '🤍', '🌸', '🌷', '🌹', '✨', '🎉'] },
  { title: 'Hands', items: ['👍', '👏', '🙌', '👌', '🤝', '💪', '👋', '✌️', '🤞', '👉', '👇', '☝️', '✍️', '🫶', '🤲', '👎', '✋', '🫡'] },
  { title: 'Mother and baby', items: ['🤰', '🤱', '👶', '🍼', '👩‍🍼', '👪', '🧸', '🎀', '🛍️', '👗', '🩷', '🌼', '🕊️', '🏥', '💊', '🩺', '🧴', '🛁'] },
  { title: 'Shop', items: ['✅', '❌', '⏰', '📦', '🚚', '🏍️', '💵', '💳', '🧾', '📍', '📞', '📲', '🔔', '⭐', '🎁', '👑', '💯', '❗'] },
]

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
  // keyword search across message text
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [includeAuto, setIncludeAuto] = useState(false)
  const searchSeq = useRef(0)
  // opening a search result jumps to that message and marks it briefly
  const jumpTo = useRef<string | null>(null)
  const jumpRetried = useRef(false)
  const holdEndScroll = useRef(0)
  const [jumpTick, setJumpTick] = useState(0)
  const [flashId, setFlashId] = useState<string | null>(null)

  const qRef = useRef(q); qRef.current = q
  const selRef = useRef<Contact | null>(sel); selRef.current = sel
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  // Speed: opened threads are kept in memory, and every waiting conversation is
  // loaded in advance, so opening a chat shows it at once instead of waiting
  // on a fresh round trip to the server.
  const threadCache = useRef<Map<string, Msg[]>>(new Map())
  const [loadingThread, setLoadingThread] = useState(false)

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
  // how much history each open chat has loaded. Once a search took us to an
  // old message, later background refreshes must keep that longer history,
  // or the message being read would vanish from the screen.
  const historyLimit = useRef<Map<string, number>>(new Map())
  const loadMsgs = useCallback(async (phone: string, wanted?: number) => {
    const limit = Math.max(wanted || 0, historyLimit.current.get(phone) || 120)
    historyLimit.current.set(phone, limit)
    const { data, error } = await supabase.rpc('wa_messages_list', { p_phone: phone, p_limit: limit })
    if (error) { setErr(error.message); if (selRef.current?.phone === phone) setLoadingThread(false); return }
    const list = ((data || []) as Msg[]).slice().reverse()
    threadCache.current.set(phone, list)
    // only paint it if this is still the open conversation (fast switching must not show the wrong chat)
    if (selRef.current?.phone === phone) { setMsgs(list); setLoadingThread(false) }
  }, [])

  // one round trip for the recent messages of every waiting conversation
  const prefetchWaiting = useCallback(async (phones: string[]) => {
    if (!phones.length) return
    const { data, error } = await supabase.rpc('wa_inbox_threads', { p_phones: phones.slice(0, 40), p_per: 60 })
    if (error || !data) return // speed-up only: opening a chat still loads it the normal way
    const byPhone = new Map<string, Msg[]>()
    ;(data as (Msg & { phone: string })[]).forEach(m => { const a = byPhone.get(m.phone) || []; a.push(m); byPhone.set(m.phone, a) })
    byPhone.forEach((list, phone) => {
      if ((historyLimit.current.get(phone) || 0) > 60) return // this chat already has a longer history loaded
      list.sort((a, b) => a.created_at < b.created_at ? -1 : 1)
      threadCache.current.set(phone, list)
      if (selRef.current?.phone === phone) { setMsgs(list); setLoadingThread(false) }
    })
  }, [])

  useEffect(() => { loadContacts('') }, [loadContacts])
  useEffect(() => {
    setEmojiOpen(false)
    // a plain chat switch (not a jump from search) always lands on the newest message
    if (!jumpTo.current) holdEndScroll.current = 0
    if (!sel) { setMsgs([]); setLoadingThread(false); return }
    const cached = threadCache.current.get(sel.phone)
    if (cached) { setMsgs(cached); setLoadingThread(false) }   // instant
    else { setMsgs([]); setLoadingThread(true) }                // never show the previous chat under a new name
    loadMsgs(sel.phone)                                         // always refresh in the background
  }, [sel?.phone, loadMsgs]) // eslint-disable-line react-hooks/exhaustive-deps

  // search: wait until typing pauses instead of asking the server on every keystroke
  useEffect(() => {
    const id = window.setTimeout(() => loadContacts(q), 250)
    return () => window.clearTimeout(id)
  }, [q, loadContacts])

  // keyword search in message text (two letters or more)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { searchSeq.current++; setHits(null); setSearching(false); return }
    setSearching(true)
    const mine = ++searchSeq.current
    const id = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('wa_inbox_search', { p_q: term, p_limit: 80, p_include_auto: includeAuto })
      if (mine !== searchSeq.current) return // a newer search has started
      if (error) { setErr(error.message); setHits([]) } else setHits((data || []) as SearchHit[])
      setSearching(false)
    }, 300)
    return () => window.clearTimeout(id)
  }, [q, includeAuto])

  // Whenever the waiting queue changes, refresh the contact list and the open thread.
  useEffect(() => {
    if (!inbox.loaded) return
    loadContacts(qRef.current)
    prefetchWaiting(inbox.items.map(i => i.phone))
    const cur = selRef.current
    if (cur && !inbox.items.some(i => i.phone === cur.phone)) loadMsgs(cur.phone)
  }, [inbox.items, inbox.loaded, loadContacts, loadMsgs, prefetchWaiting])

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
  useEffect(() => {
    if (jumpTo.current || Date.now() < holdEndScroll.current) return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, sel?.phone])
  // a photo or video that finishes loading makes the thread taller; follow it,
  // unless the user has scrolled up to read older messages
  const threadRef = useRef<HTMLDivElement | null>(null)
  const followIfNearEnd = useCallback(() => {
    const el = threadRef.current
    if (jumpTo.current || Date.now() < holdEndScroll.current) return
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 700) endRef.current?.scrollIntoView({ block: 'end' })
  }, [])

  // jump to a searched message once its conversation is on screen
  useEffect(() => {
    const id = jumpTo.current
    if (!id || !sel) return
    if (!msgs.some(m => m.id === id)) {
      // an older message than the recent ones loaded: fetch the longer history once
      if (msgs.length && !jumpRetried.current) { jumpRetried.current = true; loadMsgs(sel.phone, 500) }
      return
    }
    const node = threadRef.current?.querySelector(`[data-mid="${id}"]`) as HTMLElement | null
    if (!node) return
    jumpTo.current = null
    holdEndScroll.current = Date.now() + 3500
    node.scrollIntoView({ block: 'center' })
    setFlashId(id)
    window.setTimeout(() => setFlashId(f => (f === id ? null : f)), 3200)
  }, [msgs, sel?.phone, jumpTick, loadMsgs]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (phone: string) => {
    const known = contacts.find(c => c.phone === phone)
    if (known) { setSel(known); return }
    const { data, error } = await supabase.rpc('wa_contacts_list', { p_q: phone, p_limit: 1 })
    if (error) { setErr(error.message); return }
    const row = ((data || []) as Contact[])[0]
    if (row) setSel(row)
  }

  const openAt = async (phone: string, messageId: string) => {
    jumpTo.current = messageId
    jumpRetried.current = false
    await pick(phone)
    setJumpTick(x => x + 1)
  }

  const send = async () => {
    if (!sel || !text.trim()) return
    setBusy(true); setErr('')
    try {
      await sendWhatsApp({ phone: sel.phone, body: text.trim(), purpose })
      setText(''); setEmojiOpen(false)
      await loadMsgs(sel.phone)
      await refreshWaInbox() // a reply accepted by WhatsApp clears "needs reply" on the server
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  const insertEmoji = (e: string) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = text.slice(0, start) + e + text.slice(end)
    setText(next)
    window.requestAnimationFrame(() => { if (el) { el.focus(); const pos = start + e.length; el.setSelectionRange(pos, pos) } })
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

  /* ── search mode: two letters or more searches message text ── */
  const term = q.trim()
  const searchMode = term.length >= 2

  /* ── styles ── */
  const tab = (active: boolean, alert = false): CSSProperties => ({
    flex: 1, padding: '7px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? (alert ? t.danger : t.band) : t.border}`,
    background: active ? (alert ? t.dangerBg : t.band) : 'transparent',
    color: active ? (alert ? t.danger : t.bandText) : (alert ? t.danger : t.text2),
  })
  const chip = (active: boolean, color?: string, bg?: string): CSSProperties => ({
    padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? (color || t.band) : t.border}`,
    background: active ? (bg || t.panel2) : 'transparent', color: color || t.text2,
  })
  const rowStyle = (active: boolean): CSSProperties => ({
    display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer',
    borderBottom: `1px solid ${t.border}`, background: active ? t.rowSel : 'transparent', color: t.text,
  })
  const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const sectionLabel: CSSProperties = { padding: '10px 14px 5px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.7px', textTransform: 'uppercase', color: t.text3 }
  const countBadge = (n: number): CSSProperties => ({
    minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: '#D92D20', color: '#fff', fontSize: 11, fontWeight: 800,
    display: n > 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box',
  })

  const tick = (m: Msg) => {
    if (m.direction !== 'out') return null
    if (m.status === 'failed') return <span style={{ color: t.danger, fontWeight: 800 }}>not delivered{m.error ? ` (${m.error})` : ''}</span>
    if (m.status === 'read') return <span style={{ color: t.read, fontWeight: 800 }}>read ✓✓</span>
    if (m.status === 'delivered') return <span>delivered ✓✓</span>
    if (m.status === 'sent') return <span>sent ✓</span>
    return <span>{m.status}</span>
  }

  /* one chat row, the way messaging apps draw it: badge, name and time, then the latest line */
  const chatRow = (o: {
    key: string; phone: string; name: string | null; time: string | null | undefined; preview: string; fromUs?: boolean
    unanswered?: number; open?: boolean; extra?: React.ReactNode; onClick: () => void; small?: boolean; hl?: boolean
  }) => (
    <button key={o.key} onClick={o.onClick} style={rowStyle(sel?.phone === o.phone && !o.hl)}>
      <span style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar name={o.name} phone={o.phone} size={o.small ? 36 : 44} />
        {o.open && <span title="Reply window open" style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: '50%', background: '#22C55E', border: `2px solid ${t.listBg}` }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, ...ellipsis }}>{o.name || o.phone}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, flexShrink: 0, color: (o.unanswered || 0) > 0 ? '#D92D20' : t.text3, fontWeight: (o.unanswered || 0) > 0 ? 700 : 500 }}>{listTime(o.time)}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: (o.unanswered || 0) > 0 ? t.text : t.text2, fontWeight: (o.unanswered || 0) > 0 ? 600 : 400, ...ellipsis }}>
            {o.fromUs && <span style={{ color: t.text3 }}>You: </span>}
            {o.hl ? <Highlight text={snippetAround(o.preview, term)} q={term} t={t} /> : (o.preview || <i style={{ color: t.text3 }}>No messages yet</i>)}
          </span>
          <span style={countBadge(o.unanswered || 0)}>{o.unanswered}</span>
        </span>
        {o.extra}
      </span>
    </button>
  )

  let lastDay = ''
  return (
    <div style={{ flex: '1 1 0%', minHeight: 440, display: 'flex', flexDirection: 'column', background: t.bg, color: t.text }}>
      <style>{PAGE_CSS}</style>
      {err && <div style={{ padding: '9px 18px', background: t.dangerBg, borderBottom: `1px solid ${t.dangerBorder}`, color: t.danger, fontSize: 13 }}>{err}</div>}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* ── chats panel: its own band and tint, so it never reads as a system menu ── */}
        <div style={{ width: 392, flexShrink: 0, borderRight: `1px solid ${t.border}`, background: t.listBg, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ background: t.band, color: t.bandText, padding: '14px 14px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>WhatsApp Inbox</div>
                <div style={{ fontSize: 11.5, opacity: .8 }}>
                  {inbox.items.length === 0 ? 'No customer is waiting' : `${inbox.items.length} waiting for a reply${counts.high ? ` · ${counts.high} high priority` : ''}`}
                </div>
              </div>
              <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {theme === 'dark'
                    ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
                    : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
                </svg>
              </button>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: t.searchBg, borderRadius: 999, padding: '0 12px', height: 38 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.text3} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats and messages" aria-label="Search chats and messages"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: t.searchText }} />
              {q && <button onClick={() => setQ('')} aria-label="Clear search" title="Clear search"
                style={{ border: 'none', background: 'transparent', color: t.text3, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>}
            </div>
          </div>

          {!searchMode && (
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setView('waiting')} style={tab(view === 'waiting', inbox.items.length > 0)}>Waiting ({inbox.items.length})</button>
                <button onClick={() => setView('all')} style={tab(view === 'all')}>All chats</button>
              </div>
              {view === 'waiting' && inbox.items.length > 0 && (
                <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => setPf('all')} style={chip(pf === 'all')}>All</button>
                  {(['high', 'normal', 'low'] as WaPriority[]).map(p => (
                    <button key={p} onClick={() => setPf(p)} style={chip(pf === p, t.prio[p].color, t.prio[p].bg)}>{PRIO_LABEL[p]} {counts[p]}</button>
                  ))}
                  {counts.low > 0 && (
                    <button onClick={clearLow} title="Thanks and greetings that do not need an answer"
                      style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 999, border: `1px dashed ${t.border}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: t.text2, cursor: 'pointer' }}>
                      Mark all Low as handled
                    </button>
                  )}
                </div>
              )}
              {q.trim().length === 1 && <div style={{ fontSize: 11.5, color: t.text3, marginTop: 8 }}>Type one more letter to search inside messages.</div>}
            </div>
          )}

          <div className="wa-inbox-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {/* search results: chats whose name or number matches, then every message containing the words */}
            {searchMode && (
              <>
                {contacts.length > 0 && <div style={sectionLabel}>Chats</div>}
                {contacts.slice(0, 6).map(c => chatRow({
                  key: 'c' + c.phone, phone: c.phone, name: c.name, time: c.last_message_at || c.last_inbound_at, small: true,
                  preview: c.name ? c.phone : cleanBody(c.last_message_body), onClick: () => setSel(c),
                }))}
                <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center' }}>
                  <span>Messages{hits && !searching ? ` (${hits.length}${hits.length >= 80 ? '+' : ''})` : ''}</span>
                </div>
                {searching && <div style={{ padding: '6px 14px 14px', fontSize: 12.5, color: t.text3 }}>Searching...</div>}
                {!searching && hits && hits.length === 0 && (
                  <div style={{ padding: '6px 14px 14px', fontSize: 12.5, color: t.text3 }}>No message contains "{term}".</div>
                )}
                {!searching && (hits || []).map(h => chatRow({
                  key: 'm' + h.id, phone: h.phone, name: h.name, time: h.created_at, small: true, hl: true,
                  preview: cleanBody(h.body), fromUs: h.direction === 'out', onClick: () => openAt(h.phone, h.id),
                }))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px', fontSize: 11.5, color: t.text3, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeAuto} onChange={e => setIncludeAuto(e.target.checked)} />
                  Also search automatic receipts, invoices and payslips
                </label>
              </>
            )}

            {!searchMode && view === 'waiting' && (
              <>
                {!waitingList.length && <div style={{ padding: 18, fontSize: 12.5, color: t.text3 }}>
                  {inbox.items.length ? 'Nothing matches this filter.' : 'No customer is waiting for a reply. Good work.'}
                </div>}
                {waitingList.map(i => {
                  const left = waWindowLeftMs(i.last_inbound_at)
                  const pr = t.prio[i.reply_priority] || t.prio.normal
                  return chatRow({
                    key: i.phone, phone: i.phone, name: i.name, time: i.last_inbound_at, preview: i.last_inbound_body || NO_TEXT,
                    unanswered: Math.max(1, i.unanswered || 1), open: left > 0, onClick: () => pick(i.phone),
                    extra: (
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4, fontSize: 10.5 }}>
                        <span style={{ fontWeight: 800, color: pr.color, background: pr.bg, borderRadius: 999, padding: '1px 8px' }}>{PRIO_LABEL[i.reply_priority] || 'Normal'}</span>
                        <span style={{ color: t.danger, fontWeight: 700 }}>waiting {waWaitedFor(i.needs_reply_since)}</span>
                        <span style={{ color: left > 0 ? t.ok : t.text3, fontWeight: 700 }}>{left > 0 ? `${waDuration(left)} left to reply` : 'reply window closed'}</span>
                      </span>
                    ),
                  })
                })}
              </>
            )}

            {!searchMode && view === 'all' && (
              <>
                {!contacts.length && <div style={{ padding: 18, fontSize: 12.5, color: t.text3 }}>No chats yet. They appear when the first message is sent or received.</div>}
                {allList.map(c => chatRow({
                  key: c.phone, phone: c.phone, name: c.name, time: c.last_message_at || c.last_inbound_at || c.last_outbound_at,
                  preview: cleanBody(c.last_message_body), fromUs: c.last_message_dir === 'out',
                  unanswered: waiting.has(c.phone) ? Math.max(1, waiting.get(c.phone)?.unanswered || 1) : 0, open: windowOpen(c), onClick: () => setSel(c),
                }))}
              </>
            )}
          </div>
        </div>

        {/* ── conversation ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!sel && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: t.wall, backgroundImage: crownWallpaper(t.wallInk) }}>
              <div style={{ color: t.text2, fontSize: 14, textAlign: 'center', padding: '18px 26px', background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14, maxWidth: 380 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 4 }}>Customer conversations</div>
                {inbox.items.length ? 'Pick a chat on the left to read and reply.' : 'Nobody is waiting. Pick a chat under All chats, or search for a word a customer used.'}
              </div>
            </div>
          )}
          {sel && (
            <>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${t.border}`, background: t.panel, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Avatar name={sel.name} phone={sel.phone} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, ...ellipsis }}>{sel.name || sel.phone}</div>
                  <div style={{ fontSize: 12, color: t.text3, marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {sel.name && <span>{sel.phone}</span>}
                    {srcLabels(sel).map(s => <span key={s} style={{ background: t.panel2, borderRadius: 999, padding: '0 7px', fontSize: 10.5 }}>{s}</span>)}
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
                <div style={{ padding: '8px 16px', borderBottom: `1px solid ${t.dangerBorder}`, background: t.dangerBg, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

              <div ref={threadRef} className="wa-inbox-scroll"
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 7, backgroundColor: t.wall, backgroundImage: crownWallpaper(t.wallInk) }}>
                {msgs.map(m => {
                  const out = m.direction === 'out'
                  const isTpl = !!m.body && m.body.startsWith('[tpl] ')
                  const hasMedia = !!m.media_type
                  // when the file itself is shown, drop the "[Photo]" style label and keep any caption
                  const body = isTpl ? m.body!.slice(6) : hasMedia ? (m.body || '').replace(MEDIA_LABEL, '') : m.body
                  const day = dayLabel(m.created_at)
                  const showDay = day !== lastDay
                  lastDay = day
                  const flash = flashId === m.id
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {showDay && <div style={{ alignSelf: 'center', fontSize: 11, fontWeight: 700, color: t.text2, background: t.panel, border: `1px solid ${t.border}`, borderRadius: 999, padding: '3px 12px', margin: '6px 0 2px' }}>{day}</div>}
                      <div data-mid={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '72%',
                        background: out ? t.outBubble : t.inBubble, color: out ? t.outText : t.inText, padding: '8px 12px',
                        borderRadius: out ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        boxShadow: flash ? `0 0 0 3px ${t.mark}` : '0 1px 1px rgba(0,0,0,.08)', transition: 'box-shadow .4s' }}>
                        {hasMedia && <div style={{ marginBottom: body ? 6 : 0 }}><MediaBlock m={m} t={t} onReady={followIfNearEnd} /></div>}
                        {(body || !hasMedia) && (
                          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {body ? <Linkified text={body} q={searchMode ? term : ''} t={t} /> : <i style={{ opacity: .75 }}>{out ? '(template message)' : `${NO_TEXT} It arrived before media was supported, so it cannot be shown. Ask the customer to send it again.`}</i>}
                          </div>
                        )}
                        <div style={{ fontSize: 10.5, opacity: .72, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                          <span title={stamp(m.created_at)}>{hhmm(m.created_at)}</span>
                          {out && <span>{m.purpose}{isTpl ? ' · template' : ''}</span>}
                          {tick(m)}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {loadingThread && !msgs.length && <div style={{ alignSelf: 'center', color: t.text2, fontSize: 12.5, background: t.panel, borderRadius: 999, padding: '4px 12px' }}>Loading conversation...</div>}
                {!loadingThread && !msgs.length && <div style={{ alignSelf: 'center', color: t.text2, fontSize: 12.5, background: t.panel, borderRadius: 999, padding: '4px 12px' }}>No messages yet.</div>}
                <div ref={endRef} />
              </div>

              {!canType && (
                <div style={{ padding: '9px 18px', borderTop: `1px solid ${t.dangerBorder}`, fontSize: 12, color: t.danger, background: t.dangerBg }}>
                  The 24 hour reply window is closed, so WhatsApp will reject a normal message. Call the customer on {sel.phone}{selWaiting ? ', then tap "Mark as handled".' : '.'}
                </div>
              )}
              <div style={{ padding: 12, borderTop: `1px solid ${t.border}`, background: t.panel, display: 'flex', gap: 8, position: 'relative' }}>
                {emojiOpen && canType && (
                  <div role="dialog" aria-label="Emoji"
                    style={{ position: 'absolute', left: 12, bottom: 'calc(100% + 6px)', width: 372, maxWidth: 'calc(100% - 24px)', maxHeight: 300, overflowY: 'auto', zIndex: 20,
                      background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 10, boxShadow: '0 12px 34px rgba(0,0,0,.28)' }}>
                    {EMOJI.map(g => (
                      <div key={g.title} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: t.text3, textTransform: 'uppercase', letterSpacing: '.5px', margin: '2px 2px 4px' }}>{g.title}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 2 }}>
                          {g.items.map(e => (
                            <button key={e} onClick={() => insertEmoji(e)} title={e}
                              style={{ fontSize: 21, lineHeight: '34px', height: 36, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8, padding: 0 }}>{e}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setEmojiOpen(o => !o)} disabled={!canType} title="Emoji" aria-label="Emoji"
                  style={{ width: 42, borderRadius: 999, border: `1px solid ${emojiOpen ? t.accent : t.border}`, background: t.input, fontSize: 19, cursor: canType ? 'pointer' : 'default', opacity: canType ? 1 : .5, padding: 0 }}>
                  🙂
                </button>
                <select value={purpose} onChange={e => setPurpose(e.target.value as WaPurpose)} disabled={!canType} title="Message type"
                  style={{ borderRadius: 999, border: `1px solid ${t.border}`, fontSize: 12.5, padding: '0 8px', background: t.input, color: t.text }}>
                  {(['support', 'order', 'receipt', 'tip', 'system', 'marketing'] as WaPurpose[]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} disabled={!canType}
                  onKeyDown={e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') setEmojiOpen(false) }}
                  placeholder={canType ? 'Type a reply...' : 'Reply window closed'}
                  style={{ flex: 1, padding: '10px 16px', borderRadius: 999, border: `1px solid ${t.border}`, fontSize: 13.5, background: t.input, color: t.text, opacity: canType ? 1 : .6 }} />
                <button disabled={busy || !text.trim() || !canType} onClick={send}
                  style={{ padding: '10px 22px', borderRadius: 999, border: 'none', background: t.accent, color: t.accentText, fontWeight: 800, cursor: 'pointer', opacity: busy || !text.trim() || !canType ? .55 : 1 }}>
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
