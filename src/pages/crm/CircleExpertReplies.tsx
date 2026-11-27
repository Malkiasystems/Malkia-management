import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CirclePage, circleStyles } from './circleUi'

type Question = { id: string; title: string; body: string; created_at: string; answer_count: number }
type Expert = { user_id: string; username: string; expert_title: string | null }
const { btn, card, muted, h2 } = circleStyles
const field = { width: '100%', boxSizing: 'border-box' as const, margin: '6px 0 12px' }

export default function CircleExpertReplies({ initialId, onClose }: { initialId: string; onClose: () => void }) {
  const [selected, setSelected] = useState(initialId)
  const [question, setQuestion] = useState<Question | null>(null)
  const [query, setQuery] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [experts, setExperts] = useState<Expert[]>([])
  const [expertId, setExpertId] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [expertsError, setExpertsError] = useState('')
  const [loadedExperts, setLoadedExperts] = useState(false)
  const [success, setSuccess] = useState('')
  const request = useRef('')
  const sending = useRef(false)
  const expert = experts.find(x => x.user_id === expertId)

  useEffect(() => {
    let active = true
    supabase.rpc('circle_reply_experts').then(({ data, error }) => {
      if (!active) return
      setLoadedExperts(true)
      if (error) setExpertsError(error.message)
      else setExperts(data || [])
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (selected) return
    let active = true
    setLoading(true)
    setListError('')
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('circle_feed', { p_q: query.trim() || null, p_limit: 50 })
      if (!active) return
      setQuestions(error ? [] : data || [])
      setListError(error?.message || '')
      setLoading(false)
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [query, selected])

  useEffect(() => {
    if (!selected) return
    let active = true
    setQuestion(null)
    setError('')
    supabase.rpc('circle_question', { p_id: selected }).then(({ data, error }) => {
      if (!active) return
      if (error || !data?.[0]) setError(error?.message || 'This question is no longer available.')
      else setQuestion(data[0])
    })
    return () => { active = false }
  }, [selected])

  function chooseQuestion(id: string) {
    setError('')
    setSelected(id)
    setQuestion(null)
    setBody('')
    setExpertId('')
    request.current = ''
  }

  async function publish() {
    if (sending.current || !question || !expert || body.trim().length < 2) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      if (!request.current) request.current = crypto.randomUUID()
      const { error } = await supabase.rpc('circle_publish_expert_reply', {
        p_question: question.id, p_expert: expert.user_id, p_body: body.trim(), p_request: request.current,
      })
      if (error) { setError(error.message); return }
      setSuccess('Published the reply from @' + expert.username + ' on “' + question.title + '”.')
      chooseQuestion('')
    } catch {
      setError('Could not confirm publication. Retry this reply to check it safely.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return <CirclePage title="Expert replies" right={<button style={btn} disabled={busy} onClick={onClose}>Back to overview</button>}>
    {success && <p role="status" style={card}>{success}</p>}
    {expertsError && <p role="alert">{expertsError}</p>}
    {error && <p role="alert">{error}</p>}
    {!selected ? <section style={card}>
      <label>Find a Circle question<input className="form-input" type="search" style={field} value={query} placeholder="Search questions" onChange={e => setQuery(e.target.value)} /></label>
      {listError && <p role="alert">{listError}</p>}
      {loading ? <p role="status">Loading questions…</p> : <>
        {questions.length === 0 && !listError && <p>No questions found.</p>}
        {questions.map(q => <button key={q.id} type="button" style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', whiteSpace: 'normal', marginBottom: 6 }} onClick={() => { setSuccess(''); chooseQuestion(q.id) }}>
          {q.title}<small style={{ ...muted, display: 'block' }}>{new Date(q.created_at).toLocaleDateString('en-GB')} · {q.answer_count} {q.answer_count === 1 ? 'answer' : 'answers'}</small>
        </button>)}
        {questions.length === 50 && <small style={muted}>Showing 50 questions. Search by a word from the question to narrow the list.</small>}
      </>}
    </section> : <section style={card}>
      <button style={btn} disabled={busy} onClick={() => chooseQuestion('')}>Choose another question</button>
      {question ? <>
        <h2 style={{ ...h2, marginTop: 14 }}>{question.title}</h2>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{question.body}</p>
        <a href={'https://www.malkia.co.tz/circle/swali/' + question.id} target="_blank" rel="noreferrer">View question and existing replies in Circle</a>
        <form style={{ marginTop: 18 }} onSubmit={e => { e.preventDefault(); void publish() }}>
          <label>Expert who supplied the reply<select className="form-input" style={field} required disabled={busy} value={expertId} onChange={e => { setExpertId(e.target.value); request.current = '' }}>
            <option value="">Select an approved expert</option>
            {experts.map(x => <option key={x.user_id} value={x.user_id}>@{x.username}{x.expert_title ? ' · ' + x.expert_title : ''}</option>)}
          </select></label>
          {loadedExperts && !expertsError && !experts.length && <p role="status">No approved expert accounts are available.</p>}
          <label>Reply supplied by the expert<textarea className="form-input" style={{ ...field, resize: 'vertical' }} rows={6} required disabled={busy} value={body} onChange={e => { setBody(e.target.value); request.current = '' }} /></label>
          <button className="btn btn-primary" disabled={busy || !expert || body.trim().length < 2}>{busy ? 'Publishing…' : expert ? 'Publish reply as @' + expert.username : 'Publish reply'}</button>
        </form>
      </> : !error && <p role="status">Loading question…</p>}
    </section>}
  </CirclePage>
}
