import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { sendWhatsApp, type WaPurpose } from '../lib/wa'
import {
  useWaInbox, refreshWaInbox, waMarkHandled, waMarkHandledBulk, waSetPriority,
  waWaitedFor, waWindowLeftMs, waDuration, WA_PRIORITY_META, type WaPriority,
} from '../lib/waInbox'

/* WhatsApp command centre: one place to see every contact across shop,
   MalkiaOS and Circle, their full message history, consent state, and to
   reply as Malkia. Built on wa_contacts / wa_messages (migration 045-046).

   Inbox layer (migration 060): a conversation "needs a reply" from the first
   unanswered customer message until a reply is sent or someone marks it
   handled. Waiting conversations are listed first, by priority, with the time
   left on each 24h window. Access requires the WhatsApp Inbox permission. */

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

const ago = (iso: string | null) => {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'sasa'
  if (m < 60) return `dk ${m}`
  if (m < 1440) return `saa ${Math.floor(m / 60)}`
  return `siku ${Math.floor(m / 1440)}`
}
const windowOpen = (c: { last_inbound_at: string | null }) => waWindowLeftMs(c.last_inbound_at) > 0

const PAGE_CSS = `
@keyframes waDotRing { 0% { box-shadow: 0 0 0 0 rgba(217,45,32,.6) } 70% { box-shadow: 0 0 0 7px rgba(217,45,32,0) } 100% { box-shadow: 0 0 0 0 rgba(217,45,32,0) } }
.wa-dot { width: 9px; height: 9px; border-radius: 50%; background: #D92D20; flex-shrink: 0; animation: waDotRing 1.3s ease-out infinite }
@media (prefers-reduced-motion: reduce) { .wa-dot { animation: none } }
`

export default function WhatsAppCentre() {
  const inbox = useWaInbox()
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

  const waiting = useMemo(() => new Map(inbox.items.map(i => [i.phone, i])), [inbox.items])
  const counts = useMemo(() => {
    const c = { high: 0, normal: 0, low: 0 }
    inbox.items.forEach(i => { c[i.reply_priority] = (c[i.reply_priority] || 0) + 1 })
    return c
  }, [inbox.items])

  const loadContacts = useCallback(async (query: string) => {
    const { data, error } = await supabase.rpc('wa_contacts_list', { p_q: query || null, p_limit: 200 })
    if (error) { setErr(error.message); return }
    const list = (data || []) as Contact[]
    setContacts(list)
    // keep the open conversation's header in step with fresh data
    const cur = selRef.current
    if (cur) { const fresh = list.find(c => c.phone === cur.phone); if (fresh) setSel(fresh) }
  }, [])
  const loadMsgs = useCallback(async (phone: string) => {
    const { data, error } = await supabase.rpc('wa_messages_list', { p_phone: phone, p_limit: 200 })
    if (error) setErr(error.message); else setMsgs(((data || []) as Msg[]).slice().reverse())
  }, [])

  useEffect(() => { loadContacts('') }, [loadContacts])
  useEffect(() => { if (sel) loadMsgs(sel.phone) }, [sel?.phone, loadMsgs]) // eslint-disable-line react-hooks/exhaustive-deps

  // The page used to load once and never update. Now: whenever the waiting
  // queue changes, refresh the contact list and the open conversation; and
  // poll the open conversation so replies appear without a reload.
  useEffect(() => {
    if (!inbox.loaded) return
    loadContacts(qRef.current)
    if (selRef.current) loadMsgs(selRef.current.phone)
  }, [inbox.items, inbox.loaded, loadContacts, loadMsgs])
  useEffect(() => {
    const t = window.setInterval(() => { if (selRef.current) loadMsgs(selRef.current.phone) }, 20000)
    const m = window.setInterval(() => setTick(x => x + 1), 60000)
    return () => { window.clearInterval(t); window.clearInterval(m) }
  }, [loadMsgs])

  const pick = async (phone: string) => {
    const known = contacts.find(c => c.phone === phone)
    if (known) { setSel(known); return }
    // a waiting customer outside the loaded page of contacts: fetch the full row
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
    if (!window.confirm(`Maliza mazungumzo ${counts.low} ya kipaumbele cha Chini (shukrani na salamu) bila kujibu?`)) return
    setErr('')
    try { await waMarkHandledBulk('low') } catch (e: any) { setErr(e.message) }
  }

  const toggleConsent = async (c: Contact) => {
    const next = !c.consent_marketing
    const label = next
      ? 'Weka ruhusa ya masoko kwa ' + c.phone + '? Fanya hivi TU kama mteja ameomba au amekubali mwenyewe.'
      : 'Ondoa ruhusa ya masoko kwa ' + c.phone + '?'
    if (!window.confirm(label)) return
    const { error } = await supabase.rpc('wa_contact_set_consent', { p_phone: c.phone, p_consent: next })
    if (error) setErr(error.message)
    else { await loadContacts(q); setSel(s => s && s.phone === c.phone ? { ...s, consent_marketing: next } : s) }
  }

  const srcLabels = (c: Contact) => {
    const l: string[] = []
    if (c.circle_user_id) l.push('Circle')
    if (c.os_customer_id) l.push('Mteja')
    if (c.dealer_shop_id) l.push('Dealer')
    if (!l.length && c.first_source) l.push(c.first_source)
    return l
  }

  const needle = q.trim().toLowerCase()
  const waitingList = inbox.items.filter(i =>
    (pf === 'all' || i.reply_priority === pf) &&
    (!needle || i.phone.toLowerCase().includes(needle) || (i.name || '').toLowerCase().includes(needle)))
  // "all" view: waiting conversations first, then everyone else in recency order
  const allList = [...contacts].sort((a, b) => Number(waiting.has(b.phone)) - Number(waiting.has(a.phone)))

  const selWaiting = sel ? waiting.get(sel.phone) : undefined
  const selLeft = sel ? waWindowLeftMs(sel.last_inbound_at) : 0
  const chip = (active: boolean): CSSProperties => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
    border: `1px solid ${active ? '#1F7A3D' : 'var(--border)'}`, background: active ? '#EAF6EC' : 'transparent',
    color: active ? '#1F5C33' : 'var(--text2)', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <style>{PAGE_CSS}</style>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>WhatsApp Command Centre</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Kila namba moja ni mtu mmoja kwenye mfumo mzima: shop, MalkiaOS na Circle.
        Ujumbe wa masoko hauwezi kwenda bila ruhusa iliyorekodiwa.
      </p>
      {err && <div style={{ padding: 10, borderRadius: 8, background: '#FDECEC', border: '1px solid #F5B5B5', color: '#8A1F1F', fontSize: 13, margin: '10px 0' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14, marginTop: 12, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={() => setView('waiting')} style={{ ...chip(view === 'waiting'), flex: 1, ...(inbox.items.length ? { borderColor: '#D92D20', background: view === 'waiting' ? '#FDECEC' : 'transparent', color: '#B42318' } : {}) }}>
                Wanasubiri jibu ({inbox.items.length})
              </button>
              <button onClick={() => setView('all')} style={{ ...chip(view === 'all'), flex: 1 }}>Wote</button>
            </div>
            <input value={q} onChange={e => { setQ(e.target.value); loadContacts(e.target.value) }} placeholder="Tafuta namba au jina..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
            {view === 'waiting' && (
              <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setPf('all')} style={chip(pf === 'all')}>Zote</button>
                {(['high', 'normal', 'low'] as WaPriority[]).map(p => (
                  <button key={p} onClick={() => setPf(p)}
                    style={{ ...chip(pf === p), color: WA_PRIORITY_META[p].color, ...(pf === p ? { background: WA_PRIORITY_META[p].bg, borderColor: WA_PRIORITY_META[p].color } : {}) }}>
                    {WA_PRIORITY_META[p].label} {counts[p]}
                  </button>
                ))}
              </div>
            )}
            {view === 'waiting' && counts.low > 0 && (
              <button onClick={clearLow} title="Shukrani na salamu ambazo hazihitaji jibu"
                style={{ marginTop: 8, width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', cursor: 'pointer' }}>
                Maliza zote za Chini ({counts.low}) bila kujibu
              </button>
            )}
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {view === 'waiting' && (
              <>
                {!waitingList.length && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text3)' }}>
                  {inbox.items.length ? 'Hakuna anayelingana na chujio hili.' : 'Hakuna mteja anayesubiri jibu. Kazi nzuri.'}
                </div>}
                {waitingList.map(i => {
                  const meta = WA_PRIORITY_META[i.reply_priority] || WA_PRIORITY_META.normal
                  const left = waWindowLeftMs(i.last_inbound_at)
                  return (
                    <button key={i.phone} onClick={() => pick(i.phone)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)', background: sel?.phone === i.phone ? 'var(--surface2)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span className="wa-dot" />
                        <span style={{ fontWeight: 800, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name || i.phone}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: meta.color, background: meta.bg, borderRadius: 999, padding: '1px 7px' }}>{meta.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.last_inbound_body || '[Voice note, photo or sticker]'}</div>
                      <div style={{ fontSize: 11, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: '#B42318', fontWeight: 700 }}>amesubiri {waWaitedFor(i.needs_reply_since)}</span>
                        <span style={{ color: left > 0 ? '#1F7A3D' : 'var(--text3)', fontWeight: 700 }}>
                          {left > 0 ? `dirisha: limebaki ${waDuration(left)}` : 'dirisha limefungwa'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
            {view === 'all' && (
              <>
                {!contacts.length && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text3)' }}>Hakuna contacts bado. Watajaa wenyewe ujumbe wa kwanza ukitumwa au kupokelewa.</div>}
                {allList.map(c => (
                  <button key={c.phone} onClick={() => setSel(c)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)', background: sel?.phone === c.phone ? 'var(--surface2)' : 'transparent' }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}>
                      {waiting.has(c.phone) && <span className="wa-dot" title="Anasubiri jibu" />}
                      {c.name || c.phone}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      {c.name && <span>{c.phone}</span>}
                      {srcLabels(c).map(s => <span key={s} style={{ background: 'var(--surface2)', borderRadius: 999, padding: '1px 7px' }}>{s}</span>)}
                      {windowOpen(c) && <span style={{ color: '#1F7A3D', fontWeight: 700 }}>dirisha wazi</span>}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
          {!sel && <div style={{ margin: 'auto', color: 'var(--text3)', fontSize: 13 }}>Chagua mazungumzo kushoto.</div>}
          {sel && (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b>{sel.name || sel.phone}</b>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{sel.name ? sel.phone : ''}</span>
                <span style={{ fontSize: 11.5, color: selLeft > 0 ? '#1F7A3D' : 'var(--text3)', fontWeight: 700 }}>
                  {selLeft > 0 ? `Dirisha liko wazi: limebaki ${waDuration(selLeft)}` : 'Dirisha limefungwa (template tu)'}
                </span>
                <button onClick={() => toggleConsent(sel)}
                  style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                    border: '1px solid var(--border)', background: sel.consent_marketing ? '#EAF6EC' : 'var(--surface2)',
                    color: sel.consent_marketing ? '#1F5C33' : 'var(--text2)' }}>
                  Masoko: {sel.consent_marketing ? 'ANA RUHUSA' : 'HANA RUHUSA'}
                </button>
              </div>
              {selWaiting && (
                <div style={{ padding: '8px 14px', borderBottom: '1px solid #F5B5B5', background: '#FDECEC', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="wa-dot" />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#8A1F1F' }}>Anasubiri jibu: {waWaitedFor(selWaiting.needs_reply_since)}</span>
                  <label style={{ fontSize: 11.5, color: '#8A1F1F', display: 'flex', alignItems: 'center', gap: 5 }}>
                    Kipaumbele
                    <select value={selWaiting.reply_priority} onChange={e => changePriority(sel.phone, e.target.value as WaPriority)}
                      style={{ borderRadius: 6, border: '1px solid #E9B7B2', fontSize: 11.5, padding: '2px 4px', background: '#fff' }}>
                      {(['high', 'normal', 'low'] as WaPriority[]).map(p => <option key={p} value={p}>{WA_PRIORITY_META[p].label}</option>)}
                    </select>
                  </label>
                  <button onClick={() => markHandled(sel.phone)} title="Tumia kama umempigia simu, au ujumbe hauhitaji jibu"
                    style={{ marginLeft: 'auto', padding: '5px 11px', borderRadius: 8, border: '1px solid #B42318', background: '#fff', color: '#B42318', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                    Nimeshughulikia (hakuna haja ya kujibu)
                  </button>
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420 }}>
                {msgs.map(m => (
                  <div key={m.id} style={{ alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                    background: m.direction === 'out' ? '#E8F0E9' : 'var(--surface2)', borderRadius: 10, padding: '8px 11px' }}>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                      {m.body || <i style={{ color: 'var(--text3)' }}>{m.direction === 'in' ? '[Voice note, picha au sticker: haiwezi kuonyeshwa hapa. Mpigie simu au muombe aandike.]' : '(template)'}</i>}
                    </div>
                    <div style={{ fontSize: 10.5, color: m.status === 'failed' ? '#A32626' : 'var(--text3)', marginTop: 3 }}>
                      {m.purpose} &middot; {m.status}{m.error ? ` (${m.error})` : ''} &middot; {ago(m.created_at)}
                    </div>
                  </div>
                ))}
                {!msgs.length && <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>Hakuna ujumbe bado.</div>}
              </div>
              {selLeft <= 0 && (
                <div style={{ padding: '7px 14px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: '#8A1F1F', background: '#FFF6F5' }}>
                  Dirisha limefungwa: ujumbe wa kawaida utakataliwa na WhatsApp. Mpigie simu mteja ({sel.phone}), kisha bonyeza "Nimeshughulikia".
                </div>
              )}
              <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <select value={purpose} onChange={e => setPurpose(e.target.value as WaPurpose)}
                  style={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, padding: '0 6px' }}>
                  {(['support', 'order', 'receipt', 'tip', 'system', 'marketing'] as WaPurpose[]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Andika ujumbe..." style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13.5 }} />
                <button disabled={busy || !text.trim()} onClick={send}
                  style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#1F7A3D', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                  {busy ? '...' : 'Tuma'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 14 }}>
        Dirisha la saa 24: mteja akikutumia ujumbe, unaweza kujibu chochote ndani ya saa 24.
        Nje ya dirisha, Twilio itakataa ujumbe wa kawaida; tumia template zilizoidhinishwa.
      </p>
    </div>
  )
}
