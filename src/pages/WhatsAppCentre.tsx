import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendWhatsApp, type WaPurpose } from '../lib/wa'

/* WhatsApp command centre: one place to see every contact across shop,
   MalkiaOS and Circle, their full message history, consent state, and to
   reply as Malkia. Built on wa_contacts / wa_messages (migration 045-046). */

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
const windowOpen = (c: Contact) => !!c.last_inbound_at && Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3600e3

export default function WhatsAppCentre() {
  const [q, setQ] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [sel, setSel] = useState<Contact | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [purpose, setPurpose] = useState<WaPurpose>('support')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const loadContacts = useCallback(async (query: string) => {
    const { data, error } = await supabase.rpc('wa_contacts_list', { p_q: query || null, p_limit: 200 })
    if (error) setErr(error.message); else setContacts((data || []) as Contact[])
  }, [])
  const loadMsgs = useCallback(async (phone: string) => {
    const { data, error } = await supabase.rpc('wa_messages_list', { p_phone: phone, p_limit: 200 })
    if (error) setErr(error.message); else setMsgs(((data || []) as Msg[]).slice().reverse())
  }, [])

  useEffect(() => { loadContacts('') }, [loadContacts])
  useEffect(() => { if (sel) loadMsgs(sel.phone) }, [sel, loadMsgs])

  const send = async () => {
    if (!sel || !text.trim()) return
    setBusy(true); setErr('')
    try {
      await sendWhatsApp({ phone: sel.phone, body: text.trim(), purpose })
      setText('')
      await loadMsgs(sel.phone)
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
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

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>WhatsApp Command Centre</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Kila namba moja ni mtu mmoja kwenye mfumo mzima: shop, MalkiaOS na Circle.
        Ujumbe wa masoko hauwezi kwenda bila ruhusa iliyorekodiwa.
      </p>
      {err && <div style={{ padding: 10, borderRadius: 8, background: '#FDECEC', border: '1px solid #F5B5B5', color: '#8A1F1F', fontSize: 13, margin: '10px 0' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, marginTop: 12, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input value={q} onChange={e => { setQ(e.target.value); loadContacts(e.target.value) }} placeholder="Tafuta namba au jina..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {!contacts.length && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text3)' }}>Hakuna contacts bado. Watajaa wenyewe ujumbe wa kwanza ukitumwa au kupokelewa.</div>}
            {contacts.map(c => (
              <button key={c.phone} onClick={() => setSel(c)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)', background: sel?.phone === c.phone ? 'var(--surface2)' : 'transparent' }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{c.name || c.phone}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  {c.name && <span>{c.phone}</span>}
                  {srcLabels(c).map(s => <span key={s} style={{ background: 'var(--surface2)', borderRadius: 999, padding: '1px 7px' }}>{s}</span>)}
                  {windowOpen(c) && <span style={{ color: '#1F7A3D', fontWeight: 700 }}>dirisha wazi</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
          {!sel && <div style={{ margin: 'auto', color: 'var(--text3)', fontSize: 13 }}>Chagua contact kushoto.</div>}
          {sel && (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b>{sel.name || sel.phone}</b>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{sel.name ? sel.phone : ''}</span>
                <span style={{ fontSize: 11.5, color: windowOpen(sel) ? '#1F7A3D' : 'var(--text3)', fontWeight: 700 }}>
                  {windowOpen(sel) ? 'Dirisha la saa 24 liko wazi' : 'Dirisha limefungwa (template tu)'}
                </span>
                <button onClick={() => toggleConsent(sel)}
                  style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                    border: '1px solid var(--border)', background: sel.consent_marketing ? '#EAF6EC' : 'var(--surface2)',
                    color: sel.consent_marketing ? '#1F5C33' : 'var(--text2)' }}>
                  Masoko: {sel.consent_marketing ? 'ANA RUHUSA' : 'HANA RUHUSA'}
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420 }}>
                {msgs.map(m => (
                  <div key={m.id} style={{ alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                    background: m.direction === 'out' ? '#E8F0E9' : 'var(--surface2)', borderRadius: 10, padding: '8px 11px' }}>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.body || <i style={{ color: 'var(--text3)' }}>(template)</i>}</div>
                    <div style={{ fontSize: 10.5, color: m.status === 'failed' ? '#A32626' : 'var(--text3)', marginTop: 3 }}>
                      {m.purpose} &middot; {m.status}{m.error ? ` (${m.error})` : ''} &middot; {ago(m.created_at)}
                    </div>
                  </div>
                ))}
                {!msgs.length && <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>Hakuna ujumbe bado.</div>}
              </div>
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
