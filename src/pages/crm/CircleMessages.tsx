// Circle Messages: everything Malkia Circle sends on WhatsApp.
//   Alerts   the midwife "new question" alert and the mother's "your question was answered" notice
//   Lessons  the week-by-week pregnancy lessons (up to three a week), each reviewed by a midwife
//   Guides   PDF guides and checklists
//   Who      how many mothers joined, and which week they are in
// Nothing here sends to a mother by itself: alerts have their own switches, and automatic
// weekly sending is a later step. "Send a test" goes only to the number typed.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

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

interface Lesson { id: string; kind: 'lesson' | 'guide'; week: number | null; position: number | null; topic: string; media_kind: 'image' | 'pdf'; file_path: string; status: 'draft' | 'reviewed' | 'ready'; reviewed_by_name: string | null; reviewed_at: string | null }
interface AlertStatus { can_change: boolean; settings: { key: string; value: string }[]; templates: { name: string; status: string }[]; midwives: { user_id: string; name: string; expert_title: string | null; expert_alerts: boolean }[]; recent: { id: string; kind: string; is_test: boolean; status: string; error: string | null; created_at: string; to: string }[] }
interface Audience { open: boolean; joined: number; stopped: number; pregnant_members: number; by_week: Record<string, number> }

const WEEKS = Array.from({ length: 38 }, (_, i) => i + 4)
const STATUS_LABEL = { draft: 'Draft', reviewed: 'Midwife reviewed', ready: 'Ready to send' }
const STATUS_COLOR: Record<string, [string, string]> = { draft: ['#F1EFEA', '#5C5154'], reviewed: ['#E4F1EF', '#2F6B66'], ready: ['#DFF3E3', '#1E6B34'], sent: ['#DFF3E3', '#1E6B34'], pending: ['#FFF6DA', '#7A5B00'], failed: ['#FCEDED', '#8F1D1D'], expired: ['#F1EFEA', '#5C5154'], sending: ['#FFF6DA', '#7A5B00'] }
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function CircleMessages() {
  const { can, isSuperAdmin } = useAuth()
  const canReview = isSuperAdmin() || can('crm.circle.review')
  const [tab, setTab] = useState<'alerts' | 'lessons' | 'guides' | 'who'>('alerts')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [alerts, setAlerts] = useState<AlertStatus | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [aud, setAud] = useState<Audience | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [week, setWeek] = useState(4)
  const [draft, setDraft] = useState<{ kind: 'lesson' | 'guide'; week: number; position: number; topic: string; file: File | null } | null>(null)

  const say = (ok: string, err = '') => { setNotice(ok); setError(err) }
  const loadAlerts = async () => { try { setAlerts(await call('circle-alerts', { action: 'status' })) } catch (e: any) { setError(e.message) } }
  const loadLessons = async () => {
    const { data, error } = await supabase.from('circle_lessons').select('*').order('week', { ascending: true }).order('position', { ascending: true })
    if (error) setError(error.message); else setLessons((data || []) as Lesson[])
  }
  const loadAud = async () => { const { data, error } = await supabase.rpc('circle_weekly_audience'); if (error) setError(error.message); else setAud(data as Audience) }
  useEffect(() => { loadAlerts(); loadLessons(); loadAud() }, [])

  const setting = (k: string) => alerts?.settings.find(s => s.key === k)?.value === 'true'
  const tplOk = (n: string) => alerts?.templates.find(t => t.name === n)?.status === 'approved'
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); say(''); try { await fn() } catch (e: any) { setError(e?.message || 'That did not work.') } setBusy('') }

  const toggleAlert = (key: string, on: boolean, label: string) => run(key, async () => {
    if (on && !window.confirm(`Turn ON "${label}"?\n\nFrom now on this message is sent automatically on WhatsApp.`)) return
    await call('circle-alerts', { action: 'set', key, on }); await loadAlerts(); say(`${label} is now ${on ? 'on' : 'off'}.`)
  })
  const testAlert = (kind: string) => run('t' + kind, async () => {
    if (!testPhone.trim()) throw new Error('Type the number to send the test to.')
    const r = await call('circle-alerts', { action: 'test', kind, phone: testPhone.trim() }); await loadAlerts()
    say(r.sent ? `Test sent to ${testPhone}.` : '', r.sent ? '' : r.waiting ? 'Not sent: Meta has not approved this message yet.' : 'Not sent. See the log below for the reason.')
  })
  const midwifeAlerts = (user_id: string, on: boolean) => run('m' + user_id, async () => { await call('circle-alerts', { action: 'midwife_alerts', user_id, on }); await loadAlerts() })

  const saveDraft = () => run('save', async () => {
    if (!draft) return
    if (draft.topic.trim().length < 3) throw new Error(draft.kind === 'guide' ? 'Type the name of the guide.' : 'Type the topic line for this lesson.')
    if (!draft.file) throw new Error('Choose the image or PDF.')
    const isPdf = draft.file.type === 'application/pdf'
    if (!isPdf && !['image/jpeg', 'image/png'].includes(draft.file.type)) throw new Error('The file must be a JPG or PNG image, or a PDF.')
    if (draft.kind === 'guide' && !isPdf) throw new Error('A guide must be a PDF.')
    if (draft.file.size > (isPdf ? 10 : 5) * 1024 * 1024) throw new Error(isPdf ? 'The PDF is over 10 MB.' : 'The image is over 5 MB. WhatsApp will not accept it.')
    const ext = isPdf ? 'pdf' : draft.file.type === 'image/png' ? 'png' : 'jpg'
    const path = `${draft.kind === 'guide' ? 'guides' : `week-${draft.week}`}/${Date.now()}.${ext}`
    const up = await supabase.storage.from('circle-lessons').upload(path, draft.file, { contentType: draft.file.type })
    if (up.error) throw new Error(up.error.message)
    const row = draft.kind === 'guide'
      ? { kind: 'guide', topic: draft.topic.trim(), media_kind: 'pdf', file_path: path }
      : { kind: 'lesson', week: draft.week, position: draft.position, topic: draft.topic.trim(), media_kind: isPdf ? 'pdf' : 'image', file_path: path }
    const { error } = await supabase.from('circle_lessons').insert(row)
    if (error) { await supabase.storage.from('circle-lessons').remove([path]); throw new Error(error.message) }
    setDraft(null); await loadLessons(); say('Saved as a draft. It needs a midwife review before it can be sent.')
  })
  const setStatus = (l: Lesson, status: Lesson['status']) => run('s' + l.id, async () => {
    const { error } = await supabase.from('circle_lessons').update({ status }).eq('id', l.id)
    if (error) throw new Error(error.message)
    await loadLessons()
  })
  const remove = (l: Lesson) => run('d' + l.id, async () => {
    if (!window.confirm(`Delete "${l.topic}"? This cannot be undone.`)) return
    const { error } = await supabase.from('circle_lessons').delete().eq('id', l.id)
    if (error) throw new Error(error.message)
    await supabase.storage.from('circle-lessons').remove([l.file_path]); await loadLessons()
  })
  const view = (l: Lesson) => run('v' + l.id, async () => {
    const { data, error } = await supabase.storage.from('circle-lessons').createSignedUrl(l.file_path, 600)
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not open the file.')
    window.open(data.signedUrl, '_blank', 'noopener')
  })
  const testLesson = (l: Lesson) => run('t' + l.id, async () => {
    if (!testPhone.trim()) throw new Error('Type the number to send the test to (top of this page).')
    await call('circle-weekly', { action: 'test', lesson_id: l.id, phone: testPhone.trim() }); say(`Test sent to ${testPhone}.`)
  })

  const weekLessons = useMemo(() => lessons.filter(l => l.kind === 'lesson' && l.week === week), [lessons, week])
  const guides = useMemo(() => lessons.filter(l => l.kind === 'guide'), [lessons])
  const readyByWeek = useMemo(() => { const m: Record<number, number> = {}; lessons.forEach(l => { if (l.kind === 'lesson' && l.status === 'ready' && l.week) m[l.week] = (m[l.week] || 0) + 1 }); return m }, [lessons])
  const anyByWeek = useMemo(() => { const m: Record<number, number> = {}; lessons.forEach(l => { if (l.kind === 'lesson' && l.week) m[l.week] = (m[l.week] || 0) + 1 }); return m }, [lessons])
  const freeSlot = [1, 2, 3].find(p => !weekLessons.some(l => l.position === p))

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, marginBottom: 12 }
  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  const btn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const primary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: 0 }
  const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5 }
  const pill = (s: string, label?: string) => <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: (STATUS_COLOR[s] || STATUS_COLOR.draft)[0], color: (STATUS_COLOR[s] || STATUS_COLOR.draft)[1], whiteSpace: 'nowrap' }}>{label || s}</span>

  const lessonRow = (l: Lesson) => (
    <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{l.kind === 'lesson' ? `Lesson ${l.position}: ` : ''}{l.topic}</div>
        <div style={muted}>{l.media_kind === 'pdf' ? 'PDF' : 'Image'}{l.reviewed_by_name ? ` · reviewed by ${l.reviewed_by_name}${l.reviewed_at ? ' on ' + when(l.reviewed_at) : ''}` : ''}</div>
      </div>
      {pill(l.status, STATUS_LABEL[l.status])}
      <button style={btn} onClick={() => view(l)} disabled={!!busy}>View file</button>
      <button style={btn} onClick={() => testLesson(l)} disabled={!!busy}>{busy === 't' + l.id ? 'Sending...' : 'Send a test'}</button>
      {l.status === 'draft' && <button style={canReview ? primary : { ...btn, opacity: .5, cursor: 'not-allowed' }} title={canReview ? '' : 'You need the "mark lessons midwife reviewed" permission'} onClick={() => canReview && setStatus(l, 'reviewed')} disabled={!!busy}>Mark midwife reviewed</button>}
      {l.status === 'reviewed' && <><button style={primary} onClick={() => setStatus(l, 'ready')} disabled={!!busy}>Mark Ready</button><button style={btn} onClick={() => setStatus(l, 'draft')} disabled={!!busy}>Back to draft</button></>}
      {l.status === 'ready' && <button style={btn} onClick={() => setStatus(l, 'reviewed')} disabled={!!busy}>Take out of sending</button>}
      <button style={{ ...btn, color: '#8F1D1D' }} onClick={() => remove(l)} disabled={!!busy}>Delete</button>
    </div>
  )

  const draftForm = draft && (
    <div style={{ ...card, borderColor: 'var(--accent)' }}>
      <div style={h2}>{draft.kind === 'guide' ? 'New guide' : `New lesson for week ${draft.week}, lesson ${draft.position}`}</div>
      <div style={{ ...muted, margin: '6px 0 10px' }}>
        {draft.kind === 'guide'
          ? 'The name is read inside the message: "mwongozo wako wa [name] umeambatishwa". PDF only, up to 10 MB.'
          : 'The topic is read inside the message: "Leo tunaangalia: [topic]." Keep it short, no full stop. One image (JPG or PNG, up to 5 MB) shows in the chat; a PDF (up to 10 MB) can hold several slides.'}
      </div>
      <input style={{ ...inp, width: '100%', marginBottom: 8 }} maxLength={120} placeholder={draft.kind === 'guide' ? 'for example Hospital Bag Checklist' : 'for example mabadiliko ya mwili wako'} value={draft.topic} onChange={e => setDraft({ ...draft, topic: e.target.value })} />
      <input type="file" accept={draft.kind === 'guide' ? 'application/pdf' : 'image/jpeg,image/png,application/pdf'} onChange={e => setDraft({ ...draft, file: e.target.files?.[0] || null })} style={{ fontSize: 13, marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={btn} onClick={() => setDraft(null)} disabled={!!busy}>Cancel</button>
        <button style={primary} onClick={saveDraft} disabled={!!busy}>{busy === 'save' ? 'Saving...' : 'Save as draft'}</button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 20, maxWidth: 1040, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Circle Messages</h1>
      <p style={{ ...muted, margin: '4px 0 14px', maxWidth: 720 }}>What Malkia Circle sends on WhatsApp: alerts about questions, and the week-by-week pregnancy lessons. A test goes only to the number you type here.</p>

      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13, color: 'var(--text)' }}>Number for test messages</b>
        <input style={{ ...inp, width: 200 }} placeholder="0712 345 678" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
        <span style={muted}>Use your own phone. Tests are real WhatsApp messages and Meta charges for them.</span>
      </div>

      {notice && <div style={{ ...card, borderColor: '#9AD0A6', background: '#EAF7EC', color: '#1E6B34', fontSize: 13 }}>{notice}</div>}
      {error && <div style={{ ...card, borderColor: '#E8A0A0', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {([['alerts', 'Alerts'], ['lessons', 'Lessons by week'], ['guides', 'Guides'], ['who', 'Who receives']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setDraft(null) }} style={tab === k ? primary : btn}>{l}</button>
        ))}
      </div>

      {tab === 'alerts' && (!alerts ? <div style={muted}>Loading...</div> : <>
        {([['alert_question_on', 'question_alert', 'New question: tell the midwives', 'When a mother posts a question, each approved midwife with alerts on gets one WhatsApp message with the question and a link.', 'malkia_circle_question_alert_sw'],
           ['alert_answer_on', 'answer_ready', 'Answered: tell the mother', 'When a midwife answers, the mother who asked gets one message, only if she ticked "Nijulishe kwa WhatsApp". Once per question.', 'malkia_circle_answer_ready_sw']] as const).map(([key, kind, label, desc, tpl]) => (
          <div key={key} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={h2}>{label}</div>
                <div style={{ ...muted, marginTop: 4 }}>{desc}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {pill(setting(key) ? 'ready' : 'draft', setting(key) ? 'ON' : 'OFF')}
                  {pill(tplOk(tpl) ? 'ready' : 'pending', tplOk(tpl) ? 'Message approved by Meta' : 'Waiting for Meta to approve the message')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btn} onClick={() => testAlert(kind)} disabled={!!busy}>{busy === 't' + kind ? 'Sending...' : 'Send a test'}</button>
                {alerts.can_change && <button style={setting(key) ? btn : primary} onClick={() => toggleAlert(key, !setting(key), label)} disabled={!!busy}>{setting(key) ? 'Turn off' : 'Turn on'}</button>}
              </div>
            </div>
          </div>
        ))}
        <div style={card}>
          <div style={h2}>Midwives who get the question alert</div>
          {alerts.midwives.length === 0 && <div style={{ ...muted, marginTop: 6 }}>No approved midwife yet.</div>}
          {alerts.midwives.map(m => (
            <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
              <div><b style={{ fontSize: 13.5, color: 'var(--text)' }}>{m.name}</b> <span style={muted}>{m.expert_title || ''}</span></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{pill(m.expert_alerts ? 'ready' : 'draft', m.expert_alerts ? 'Alerts on' : 'Alerts off')}
                {alerts.can_change && <button style={btn} onClick={() => midwifeAlerts(m.user_id, !m.expert_alerts)} disabled={!!busy}>{m.expert_alerts ? 'Stop her alerts' : 'Resume her alerts'}</button>}</div>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={h2}>Latest alerts</div><button style={btn} onClick={loadAlerts}>Refresh</button></div>
          <div style={{ ...muted, marginTop: 4 }}>The mother's name is never shown here, so nobody can work out who asked a Whisper.</div>
          {alerts.recent.length === 0 && <div style={{ ...muted, marginTop: 8 }}>Nothing has been queued yet.</div>}
          {alerts.recent.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 8, fontSize: 13, color: 'var(--text)' }}>
              <span style={{ width: 110, color: 'var(--text3)' }}>{when(r.created_at)}</span>
              <span style={{ flex: 1, minWidth: 200 }}>{r.kind === 'question_alert' ? 'New question alert' : 'Answer notice'}{r.is_test ? ' (test)' : ''} to {r.to}{r.error ? <span style={{ color: 'var(--text3)' }}> · {r.error}</span> : null}</span>
              {pill(r.status)}
            </div>
          ))}
        </div>
      </>)}

      {tab === 'lessons' && <>
        {draftForm}
        <div style={card}>
          <div style={h2}>Pregnancy week</div>
          <div style={{ ...muted, margin: '4px 0 10px' }}>Green means all three lessons are Ready. Amber means some lessons exist but are not all Ready. A mother in a week with no Ready lesson receives nothing that week.</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {WEEKS.map(w => { const r = readyByWeek[w] || 0, a = anyByWeek[w] || 0
              return <button key={w} onClick={() => { setWeek(w); setDraft(null) }} style={{ ...btn, minWidth: 38, padding: '6px 0', background: w === week ? 'var(--accent)' : r >= 3 ? '#DFF3E3' : a ? '#FFF6DA' : 'var(--surface2)', color: w === week ? '#fff' : 'var(--text)', borderColor: w === week ? 'var(--accent)' : 'var(--border)' }}>{w}</button> })}
          </div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={h2}>Week {week} <span style={{ ...muted, fontWeight: 400 }}>(12 means 12 completed weeks, as on the clinic card)</span></div>
            {freeSlot && !draft && <button style={primary} onClick={() => setDraft({ kind: 'lesson', week, position: freeSlot, topic: '', file: null })}>Add lesson {freeSlot}</button>}
          </div>
          {weekLessons.length === 0 && <div style={{ ...muted, marginTop: 10 }}>No lessons for this week yet.</div>}
          <div style={{ marginTop: 8 }}>{weekLessons.map(lessonRow)}</div>
        </div>
      </>}

      {tab === 'guides' && <>
        {draftForm}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div><div style={h2}>Guides and checklists</div><div style={{ ...muted, marginTop: 4 }}>Malkia's own PDFs only. Do not upload another company's material.</div></div>
            {!draft && <button style={primary} onClick={() => setDraft({ kind: 'guide', week: 0, position: 0, topic: '', file: null })}>Add a guide</button>}
          </div>
          {guides.length === 0 && <div style={{ ...muted, marginTop: 10 }}>No guides yet.</div>}
          <div style={{ marginTop: 8 }}>{guides.map(lessonRow)}</div>
        </div>
      </>}

      {tab === 'who' && (!aud ? <div style={muted}>Loading...</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
          {[['Joining', aud.open ? 'Open' : 'Closed'], ['Mothers who joined', String(aud.joined)], ['Stopped', String(aud.stopped)], ['Pregnant members in Circle', String(aud.pregnant_members)]].map(([l, v]) => (
            <div key={l} style={{ ...card, marginBottom: 0 }}><div style={muted}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{v}</div></div>
          ))}
        </div>
        <div style={card}>
          <div style={h2}>Joining is {aud.open ? 'open' : 'closed'}</div>
          <div style={{ ...muted, marginTop: 4 }}>While closed, mothers do not see the invitation in Circle and cannot join. Joining can be opened once automatic sending is built, at least one lesson is Ready, and Meta has approved a weekly message.</div>
        </div>
        <div style={card}>
          <div style={h2}>Joined mothers by week</div>
          {Object.keys(aud.by_week).length === 0 ? <div style={{ ...muted, marginTop: 8 }}>Nobody has joined yet.</div> : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {Object.entries(aud.by_week).sort((a, b) => Number(a[0]) - Number(b[0])).map(([w, n]) => (
                <div key={w} style={{ ...btn, cursor: 'default' }}>Week {w}: <b>{n}</b>{(readyByWeek[Number(w)] || 0) === 0 ? <span style={{ color: '#8F1D1D' }}> · no Ready lesson</span> : null}</div>
              ))}
            </div>
          )}
        </div>
      </>)}
    </div>
  )
}
