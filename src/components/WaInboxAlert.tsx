import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Page } from '../lib/types'
import {
  useWaInbox, setWaInboxPollSeconds, waWaitedFor, waWindowLeftMs, waDuration,
  WA_PRIORITY_META, type WaPriority, type WaWaiting,
} from '../lib/waInbox'

/* Global "a customer is waiting on WhatsApp" alert. Mounted once in the app
   shell so it shows on every page, for users holding the WhatsApp Inbox
   permission (crm.inbox) or super admins.

   Built to be hard to miss:
     - an animated red bubble that stays on screen while anyone is waiting
     - a pop-up the moment a message arrives
     - the pop-up comes back every `repeat_minutes` until the conversation is
       replied to or marked handled. "Later" only buys that many minutes.

   Behaviour is tunable from system_settings key `wa_inbox_alerts`:
     { repeat_minutes, nag_priorities, sound, poll_seconds } */

interface AlertSettings { repeat_minutes: number; nag_priorities: WaPriority[]; sound: boolean; poll_seconds: number }
const DEFAULTS: AlertSettings = { repeat_minutes: 3, nag_priorities: ['high', 'normal'], sound: true, poll_seconds: 30 }

const CSS = `
@keyframes waRing { 0% { box-shadow: 0 0 0 0 rgba(217,45,32,.55) } 70% { box-shadow: 0 0 0 16px rgba(217,45,32,0) } 100% { box-shadow: 0 0 0 0 rgba(217,45,32,0) } }
@keyframes waWiggle { 0%,100% { transform: rotate(0) } 15% { transform: rotate(-14deg) } 30% { transform: rotate(12deg) } 45% { transform: rotate(-8deg) } 60% { transform: rotate(6deg) } 75% { transform: rotate(0) } }
@keyframes waIn { from { opacity: 0; transform: translateY(14px) scale(.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
.wa-alert-bubble { animation: waRing 1.6s ease-out infinite }
.wa-alert-bubble.wa-urgent { animation-duration: .9s }
.wa-alert-bubble svg { animation: waWiggle 2.4s ease-in-out infinite; transform-origin: 50% 60% }
.wa-alert-card { animation: waIn .22s ease-out }
@media (prefers-reduced-motion: reduce) { .wa-alert-bubble, .wa-alert-bubble svg, .wa-alert-card { animation: none } }
@media print { .wa-alert-root { display: none !important } }
`

const CHAT_ICON = 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'

export default function WaInboxAlert({ current, onNav }: { current: Page; onNav: (p: Page) => void }) {
  const { can, isSuperAdmin } = useAuth()
  // No permission: no polling, no alert. The server enforces the same rule.
  if (!(isSuperAdmin() || can('crm.inbox'))) return null
  return <WaInboxAlertInner current={current} onNav={onNav} />
}

function WaInboxAlertInner({ current, onNav }: { current: Page; onNav: (p: Page) => void }) {
  const { items, allowed } = useWaInbox()
  const [cfg, setCfg] = useState<AlertSettings>(DEFAULTS)
  const [open, setOpen] = useState(false)

  const nextNagAt = useRef(0)
  const announced = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)
  const audio = useRef<AudioContext | null>(null)

  const onCentre = current === 'whatsapp-centre'
  const nagItems = items.filter(i => cfg.nag_priorities.includes(i.reply_priority))
  const highCount = items.filter(i => i.reply_priority === 'high').length

  // latest values for the interval callback
  const live = useRef({ nag: 0, onCentre, open, sound: cfg.sound })
  live.current = { nag: nagItems.length, onCentre, open, sound: cfg.sound }

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'wa_inbox_alerts').maybeSingle().then(({ data }) => {
      try {
        const v = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : null
        if (v && typeof v === 'object') {
          const merged: AlertSettings = { ...DEFAULTS, ...v }
          if (!Array.isArray(merged.nag_priorities)) merged.nag_priorities = DEFAULTS.nag_priorities
          merged.repeat_minutes = Math.min(60, Math.max(1, Number(merged.repeat_minutes) || DEFAULTS.repeat_minutes))
          setCfg(merged)
          setWaInboxPollSeconds(Number(merged.poll_seconds) || DEFAULTS.poll_seconds)
        }
      } catch { /* keep defaults */ }
    })
  }, [])

  const beep = () => {
    if (!live.current.sound) return
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      if (!audio.current) audio.current = new AC()
      const ctx = audio.current
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const tone = (freq: number, at: number) => {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.type = 'sine'; o.frequency.value = freq
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28)
        o.connect(g); g.connect(ctx.destination)
        o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3)
      }
      tone(880, 0); tone(1175, 0.18)
    } catch { /* browsers block sound until the first click; the visual alert still shows */ }
  }

  // A new message (any priority) announces itself once, immediately.
  useEffect(() => {
    if (!allowed) return
    const keys = items.map(i => `${i.phone}|${i.last_inbound_at || i.needs_reply_since}`)
    const fresh = keys.filter(k => !announced.current.has(k))
    announced.current = new Set(keys)
    if (firstLoad.current) {
      firstLoad.current = false
      // Opening the app with people already waiting: show at once, no sound.
      if (items.some(i => cfg.nag_priorities.includes(i.reply_priority)) && !live.current.onCentre) setOpen(true)
      return
    }
    if (fresh.length > 0) {
      if (!live.current.onCentre) setOpen(true)
      beep()
    }
    if (items.length === 0) setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, allowed])

  // Repeat: while anything in a nagging priority is still waiting, the pop-up
  // returns once the snooze has run out. Dismissing it never ends the alert.
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = live.current
      if (s.nag === 0 || s.onCentre || s.open) return
      if (Date.now() >= nextNagAt.current) { setOpen(true); beep() }
    }, 15000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Count in the browser tab title, visible even when the tab is in the background.
  useEffect(() => {
    const strip = (t: string) => t.replace(/^\(\d+\) /, '')
    document.title = items.length > 0 ? `(${items.length}) ${strip(document.title)}` : strip(document.title)
    return () => { document.title = strip(document.title) }
  }, [items.length, current])

  if (!allowed || items.length === 0) return null

  const snooze = () => { nextNagAt.current = Date.now() + cfg.repeat_minutes * 60000 }
  const later = () => { setOpen(false); snooze() }
  const goCentre = () => { setOpen(false); snooze(); onNav('whatsapp-centre') }

  const shown = items.slice(0, 4)
  const more = items.length - shown.length

  const row = (i: WaWaiting) => {
    const meta = WA_PRIORITY_META[i.reply_priority] || WA_PRIORITY_META.normal
    const left = waWindowLeftMs(i.last_inbound_at)
    return (
      <button key={i.phone} onClick={goCentre}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', borderBottom: '1px solid #F1D5D2', background: '#fff', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: meta.color, background: meta.bg, borderRadius: 999, padding: '1px 7px' }}>{meta.label}</span>
          <b style={{ fontSize: 13, color: '#1B1B1B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name || i.phone}</b>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8A1F1F', fontWeight: 700, whiteSpace: 'nowrap' }}>waiting {waWaitedFor(i.needs_reply_since)}</span>
        </div>
        <div style={{ fontSize: 12.5, color: '#3B3B3B', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.last_inbound_body || '[Voice note, photo or sticker]'}</div>
        <div style={{ fontSize: 10.5, marginTop: 2, color: left > 0 ? '#1F7A3D' : '#8A1F1F', fontWeight: 600 }}>
          {left > 0 ? `Reply window closes in ${waDuration(left)}` : 'Reply window closed: call the customer'}
        </div>
      </button>
    )
  }

  return (
    <div className="wa-alert-root">
      <style>{CSS}</style>

      {open && !onCentre && (
        <div className="wa-alert-card" role="alertdialog" aria-label="WhatsApp: customers waiting for a reply"
          style={{ position: 'fixed', right: 22, bottom: 150, width: 370, maxWidth: 'calc(100vw - 32px)', zIndex: 4001,
            background: '#fff', border: '2px solid #D92D20', borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 18px 50px rgba(120,20,12,.35)' }}>
          <div style={{ background: '#D92D20', color: '#fff', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={CHAT_ICON} /></svg>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              {items.length === 1 ? '1 customer is waiting for a WhatsApp reply' : `${items.length} customers are waiting for a WhatsApp reply`}
            </div>
          </div>
          <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
            {shown.map(row)}
            {more > 0 && <div style={{ padding: '7px 14px', fontSize: 11.5, color: '#6B6B6B' }}>and {more} more</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 10, background: '#FFF6F5' }}>
            <button onClick={goCentre}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none', background: '#D92D20', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              Open WhatsApp Inbox
            </button>
            <button onClick={later} title="This alert comes back until the customer is answered or the conversation is marked as handled"
              style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid #E9B7B2', background: '#fff', color: '#8A1F1F', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Later ({cfg.repeat_minutes} min)
            </button>
          </div>
        </div>
      )}

      {!onCentre && (
        <button onClick={() => setOpen(o => !o)} className={`wa-alert-bubble${highCount > 0 ? ' wa-urgent' : ''}`}
          title={`WhatsApp: ${items.length} waiting for a reply`} aria-label={`WhatsApp: ${items.length} waiting for a reply`}
          style={{ position: 'fixed', right: 22, bottom: 84, width: 54, height: 54, borderRadius: '50%', zIndex: 4000,
            border: '3px solid #fff', background: '#D92D20', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={CHAT_ICON} /></svg>
          <span style={{ position: 'absolute', top: -7, right: -7, minWidth: 22, height: 22, padding: '0 5px', borderRadius: 999,
            background: '#1B1B1B', color: '#fff', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
            {items.length}
          </span>
        </button>
      )}
    </div>
  )
}
