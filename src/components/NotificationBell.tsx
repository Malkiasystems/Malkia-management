// ============================================================================
// NotificationBell.tsx: one bell in the top bar for everything that is
// waiting on the signed-in person (Joe, 23 Nov 2026).
//
// Built after a mother's Circle question sat almost two days with nobody in
// the office knowing. Modelled on the WhatsApp Inbox alert, which is hard to
// miss, and it takes the place of the old yellow payment bell (payments
// waiting for approval are now one of the kinds shown here).
//
//   - The bell is always in the top bar. It swings and shows a red count the
//     moment anything is waiting, and turns quiet when nothing is.
//   - Urgent items (a Circle question past the limit, an expert application,
//     an approval older than a day) also raise a pop-up. "Later" only buys a
//     few minutes: it comes back until the work is done.
//   - Every item has "Don't show again", and the gear holds an on/off switch
//     for each kind and for everything. On by default.
//   - What a person sees follows their permissions. The server decides that
//     (os_notifications, migration 097); this file only draws the answer.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import type { Page } from '../lib/types'
import {
  useOsNotifications, osMute, osUnhideAll, osLoadPrefs, osWaited, osKindMeta, OS_KIND_META,
  type OsNotification, type OsPrefs,
} from '../lib/osNotifications'

const REPEAT_MINUTES = 10
const SNOOZE_KEY = 'malkia.notif.snoozeUntil'

const CSS = `
@keyframes mkNotifPing { 0% { transform: scale(1); opacity: .6 } 80%, 100% { transform: scale(1.9); opacity: 0 } }
@keyframes mkNotifSwing { 0%, 100% { transform: rotate(0) } 12% { transform: rotate(14deg) } 24% { transform: rotate(-11deg) } 36% { transform: rotate(7deg) } 48% { transform: rotate(-4deg) } 60% { transform: rotate(0) } }
@keyframes mkNotifIn { from { opacity: 0; transform: translateY(-8px) scale(.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
.mk-notif-ping { animation: mkNotifPing 1.8s cubic-bezier(0,0,.2,1) infinite }
.mk-notif-ping.mk-urgent { animation-duration: 1s }
.mk-notif-swing { animation: mkNotifSwing 2.4s ease-in-out infinite; transform-origin: 50% 2px }
.mk-notif-card { animation: mkNotifIn .2s ease-out }
.mk-notif-row:hover { background: var(--surface2) }
@media (prefers-reduced-motion: reduce) { .mk-notif-ping, .mk-notif-swing, .mk-notif-card { animation: none } }
@media print { .mk-notif-root { display: none !important } }
`

const BELL = 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0'
const GEAR = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'

const Icon = ({ d, size = 16, color = 'currentColor', width = 2 }: { d: string; size?: number; color?: string; width?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

const readSnooze = (): number => {
  try { return Number(sessionStorage.getItem(SNOOZE_KEY)) || 0 } catch { return 0 }
}
const writeSnooze = (until: number) => {
  try { sessionStorage.setItem(SNOOZE_KEY, String(until)) } catch { /* private mode */ }
}

export default function NotificationBell({ onNav }: { onNav: (p: Page) => void }) {
  const { items, allowed, loaded, error } = useOsNotifications()
  const [panel, setPanel] = useState(false)      // the list under the bell
  const [settings, setSettings] = useState(false) // the gear view inside the panel
  const [popup, setPopup] = useState(false)       // the urgent pop-up
  const [prefs, setPrefs] = useState<OsPrefs | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const rootRef = useRef<HTMLDivElement>(null)
  const announced = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)
  const audio = useRef<AudioContext | null>(null)

  const urgent = items.filter(i => i.urgent)
  const live = useRef({ urgent: 0, panel, popup })
  live.current = { urgent: urgent.length, panel, popup }

  const beep = () => {
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
        g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + at + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.26)
        o.connect(g); g.connect(ctx.destination)
        o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.28)
      }
      tone(660, 0); tone(880, 0.16)
    } catch { /* browsers block sound until the first click; the bell still shows */ }
  }

  // A newly urgent item announces itself once. On first load, people already
  // waiting are shown at once (no sound) unless a "Later" is still running.
  useEffect(() => {
    if (!loaded || !allowed) return
    const keys = urgent.map(i => i.key)
    const fresh = keys.filter(k => !announced.current.has(k))
    announced.current = new Set(keys)
    if (firstLoad.current) {
      firstLoad.current = false
      if (keys.length > 0 && Date.now() >= readSnooze()) setPopup(true)
      return
    }
    if (fresh.length > 0 && !live.current.panel) { setPopup(true); beep() }
    if (keys.length === 0) setPopup(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loaded, allowed])

  // Repeat: while anything urgent is still waiting, the pop-up returns once the
  // "Later" has run out. Closing it never ends the notice; doing the work does.
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = live.current
      if (s.urgent === 0 || s.panel || s.popup) return
      if (Date.now() >= readSnooze()) setPopup(true)
    }, 20000)
    return () => window.clearInterval(t)
  }, [])

  // Click outside or Escape closes the list (never the urgent pop-up).
  useEffect(() => {
    if (!panel) return
    const out = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setPanel(false); setSettings(false) } }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPanel(false); setSettings(false) } }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [panel])

  const loadPrefs = async () => {
    const r = await osLoadPrefs()
    if (r.error) setErr(r.error); else setPrefs(r.prefs)
  }
  useEffect(() => { if (allowed) loadPrefs() }, [allowed])

  if (!loaded || !allowed) return null

  const off = prefs?.off === true
  const count = items.length
  const snooze = () => writeSnooze(Date.now() + REPEAT_MINUTES * 60000)

  const open = (n: OsNotification) => {
    setPanel(false); setSettings(false); setPopup(false); snooze()
    if (n.url) window.open(n.url, '_blank', 'noopener')
    else if (n.page) onNav(n.page as Page)
  }

  const run = async (id: string, job: () => Promise<string | null>) => {
    setBusy(id); setErr('')
    const e = await job()
    if (e) setErr(e)
    await loadPrefs()
    setBusy(null)
  }
  const hide = (n: OsNotification) => run(n.key, () => osMute('item:' + n.key, true))
  const setKind = (kind: string, on: boolean) => run('kind:' + kind, () => osMute('kind:' + kind, !on))
  const setAll = (on: boolean) => run('all', () => osMute('all', !on))
  const unhide = () => run('unhide', () => osUnhideAll())

  const tone = urgent.length > 0 ? 'var(--red, #ef4444)' : count > 0 ? 'var(--yellow, #f59e0b)' : 'var(--text3)'

  const row = (n: OsNotification, inPopup: boolean) => {
    const meta = osKindMeta(n.kind)
    return (
      <div key={n.key} className="mk-notif-row" style={{ display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: meta.tint + '22', color: meta.tint }}>
          <Icon d={meta.icon} size={17} color={meta.tint} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button onClick={() => open(n)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 12.5 }}>{n.title}</b>
              {n.urgent && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .4, color: '#fff', background: 'var(--red, #ef4444)', borderRadius: 999, padding: '1px 6px' }}>URGENT</span>}
            </div>
            {n.detail && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.detail}</div>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {n.since && <span style={{ fontSize: 10.5, fontWeight: 700, color: n.urgent ? 'var(--red, #ef4444)' : 'var(--text3)' }}>waiting {osWaited(n.since)}</span>}
            {!inPopup && (
              <button onClick={() => hide(n)} disabled={busy === n.key}
                title="Hide this one notice for you. It will not come back, even if it is still waiting."
                style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10.5, color: 'var(--text3)', textDecoration: 'underline' }}>
                {busy === n.key ? 'Hiding...' : "Don't show again"}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const Switch = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ flexShrink: 0, width: 38, height: 22, borderRadius: 999, border: 'none', padding: 2, cursor: disabled ? 'default' : 'pointer',
        background: on ? 'var(--green, #16a34a)' : 'var(--border2)', opacity: disabled ? .5 : 1, transition: 'background .15s' }}>
      <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(16px)' : 'translateX(0)', transition: 'transform .15s' }} />
    </button>
  )

  return (
    <div ref={rootRef} className="mk-notif-root" style={{ position: 'relative' }}>
      <style>{CSS}</style>

      <button onClick={() => { setPanel(p => !p); setSettings(false); setPopup(false); setErr('') }}
        title={off ? 'Notifications are switched off' : count === 0 ? 'Notifications: nothing waiting' : `${count} waiting${urgent.length ? `, ${urgent.length} urgent` : ''}`}
        aria-label={off ? 'Notifications are switched off' : `Notifications: ${count} waiting`}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10,
          border: '1px solid var(--border2)', background: 'var(--surface2)', cursor: 'pointer', padding: 0 }}>
        {count > 0 && (
          <span className={`mk-notif-ping${urgent.length ? ' mk-urgent' : ''}`}
            style={{ position: 'absolute', inset: 0, borderRadius: 10, border: `2px solid ${tone}`, pointerEvents: 'none' }} />
        )}
        <span className={count > 0 ? 'mk-notif-swing' : undefined} style={{ display: 'flex', opacity: off ? .45 : 1 }}>
          <Icon d={BELL} size={17} color={tone} />
        </span>
        {off && <span style={{ position: 'absolute', width: 22, height: 2, background: 'var(--text3)', transform: 'rotate(-45deg)', borderRadius: 2 }} />}
        {count > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--red, #ef4444)', color: '#fff',
            fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontFamily: 'var(--mono)', boxShadow: '0 0 0 2px var(--surface)' }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {panel && (
        <div className="mk-notif-card" role="dialog" aria-label="Notifications"
          style={{ position: 'fixed', top: 60, right: 12, width: 400, maxWidth: 'calc(100vw - 24px)', zIndex: 3000, background: 'var(--surface)',
            border: '1px solid var(--border2)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderBottom: '1px solid var(--border)' }}>
            <Icon d={BELL} size={16} color="var(--text2)" />
            <b style={{ fontSize: 14, color: 'var(--text)' }}>{settings ? 'Notification settings' : 'Notifications'}</b>
            {!settings && count > 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{count} waiting</span>}
            <button onClick={() => { setSettings(s => !s); setErr(''); loadPrefs() }} title={settings ? 'Back to the list' : 'Switch notices on or off'}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: 'var(--text2)', fontSize: 11.5 }}>
              {settings ? 'Back' : <><Icon d={GEAR} size={13} width={1.8} /> Settings</>}
            </button>
          </div>

          {(err || error) && (
            <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--red, #ef4444)', background: 'var(--red-dim, rgba(239,68,68,.1))' }}>
              Something went wrong: {err || error}
            </div>
          )}

          {!settings && (
            <div style={{ maxHeight: 'min(62vh, 520px)', overflowY: 'auto' }}>
              {off ? (
                <div style={{ padding: 18, fontSize: 12.5, color: 'var(--text2)' }}>
                  Your notifications are switched off, so nothing is shown here even when work is waiting.
                  <div><button onClick={() => setAll(true)} disabled={busy === 'all'} className="btn btn-primary" style={{ marginTop: 10, fontSize: 12 }}>Switch notifications on</button></div>
                </div>
              ) : count === 0 ? (
                <div style={{ padding: '26px 18px', textAlign: 'center', fontSize: 12.5, color: 'var(--text3)' }}>
                  Nothing is waiting on you right now.
                </div>
              ) : items.map(n => row(n, false))}
            </div>
          )}

          {settings && (
            <div style={{ padding: 12, maxHeight: 'min(62vh, 520px)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Notifications</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Off hides every notice for you. It does not change anyone else's.</div>
                </div>
                <Switch on={!off} onChange={setAll} disabled={busy === 'all' || !prefs} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', margin: '12px 0 4px' }}>You only ever see the kinds your permissions allow.</div>
              {Object.entries(OS_KIND_META).map(([kind, meta]) => {
                const on = !(prefs?.muted_kinds || []).includes(kind)
                return (
                  <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', opacity: off ? .5 : 1 }}>
                    <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: meta.tint + '22' }}>
                      <Icon d={meta.icon} size={15} color={meta.tint} />
                    </span>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)' }}>{meta.label}</span>
                    <Switch on={on} onChange={v => setKind(kind, v)} disabled={off || busy === 'kind:' + kind || !prefs} />
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, marginTop: 6, borderTop: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)' }}>
                  {prefs?.hidden_items ? `${prefs.hidden_items} notice${prefs.hidden_items === 1 ? '' : 's'} hidden with "Don't show again"` : 'No notices hidden with "Don\'t show again"'}
                </span>
                {!!prefs?.hidden_items && (
                  <button onClick={unhide} disabled={busy === 'unhide'} className="btn btn-ghost btn-sm" style={{ fontSize: 11.5 }}>Show them again</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {popup && !panel && !off && urgent.length > 0 && (
        <div className="mk-notif-card" role="alertdialog" aria-label="Urgent: work is waiting"
          style={{ position: 'fixed', top: 62, right: 12, width: 380, maxWidth: 'calc(100vw - 24px)', zIndex: 3000, background: 'var(--surface)',
            border: '2px solid var(--red, #ef4444)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 50px rgba(120,20,12,.35)' }}>
          <div style={{ background: 'var(--red, #ef4444)', color: '#fff', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mk-notif-swing" style={{ display: 'flex' }}><Icon d={BELL} size={17} color="#fff" width={2.2} /></span>
            <b style={{ fontSize: 13.5 }}>{urgent.length === 1 ? '1 urgent item is waiting' : `${urgent.length} urgent items are waiting`}</b>
          </div>
          <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
            {urgent.slice(0, 4).map(n => row(n, true))}
            {urgent.length > 4 && <div style={{ padding: '7px 12px', fontSize: 11.5, color: 'var(--text3)' }}>and {urgent.length - 4} more in the bell</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 10 }}>
            <button onClick={() => { setPopup(false); snooze(); setPanel(true) }}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'var(--red, #ef4444)', color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
              See all notifications
            </button>
            <button onClick={() => { setPopup(false); snooze() }} title="This comes back until the work is done, or you choose Don't show again in the bell"
              style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Later ({REPEAT_MINUTES} min)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
