// Circle overview: how Malkia Circle is doing today, and what needs someone's attention.
// Numbers come from circle_overview() (site_051), which any active staff member may read;
// it holds counts and question titles only, never a phone number.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'
import { CirclePage, Icon, circleStyles } from './circleUi'

import CircleExpertReplies from './CircleExpertReplies'

interface Day { day: string; joined: number; questions: number; answers: number }
interface Overview {
  mothers: number; mothers_today: number; mothers_7d: number
  questions_today: number; questions_7d: number; questions_total: number
  answers_mothers_30d: number; answers_experts_30d: number
  unanswered: { id: string; title: string; created_at: string; hours: number }[]
  alerts_failed_7d: number; weekly_subscribers: number; founders: number; daily: Day[]
}
const SITE = 'https://www.malkia.co.tz/circle/swali/'
const waited = (h: number) => h < 1 ? 'under an hour' : h < 24 ? `${h} hour${h === 1 ? '' : 's'}` : `${Math.floor(h / 24)} day${Math.floor(h / 24) === 1 ? '' : 's'}`

export default function CircleOverview({ onNav }: { onNav: (p: Page) => void }) {
  const { can, isSuperAdmin } = useAuth()
  const canReply = isSuperAdmin() || can('crm.circle.expert_replies')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const seesMembers = isSuperAdmin() || can('crm.circle.members')
  const seesMessages = isSuperAdmin() || can('crm.konnect')
  const [o, setO] = useState<Overview | null>(null)
  const [reviews, setReviews] = useState<{ reported: number; held: number } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<'joined' | 'questions' | 'answers'>('joined')

  const load = async () => {
    setLoading(true); setError('')
    const [a, b] = await Promise.all([supabase.rpc('circle_overview'), supabase.rpc('circle_mod_counts')])
    if (a.error) setError(a.error.message); else setO(a.data as Overview)
    if (!b.error && b.data?.[0]) setReviews(b.data[0])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const { card, muted, h2, btn } = circleStyles
  // Open Circle Members already showing one group of mothers.
  const members = (preset: string) => { try { sessionStorage.setItem('circle-members-preset', preset) } catch { /* private mode */ } onNav('circle-members') }

  const tile = (icon: string, value: number | string, label: string, sub: string | undefined, go?: () => void) => (
    <button type="button" onClick={go} disabled={!go} title={go ? 'Open the list' : undefined}
      style={{ ...card, marginBottom: 0, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', width: '100%', fontFamily: 'inherit', cursor: go ? 'pointer' : 'default' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim, rgba(0,0,0,.06))', color: 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={icon} size={20} /></div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={muted}>{label}{sub ? ` · ${sub}` : ''}</div>
      </div>
      {go && <Icon name="arrow" size={15} style={{ color: 'var(--text3)', flex: 'none' }} />}
    </button>
  )

  if (canReply && replyTo !== null) return <CircleExpertReplies initialId={replyTo} onClose={() => { setReplyTo(null); void load() }} />
  if (loading && !o) return <CirclePage title="Overview"><div style={muted}>Loading the overview...</div></CirclePage>
  if (!o) return <CirclePage title="Overview"><div style={{ ...card, borderColor: '#E3A5A5', background: '#FCEDED', color: '#8F1D1D', fontSize: 13.5 }}>{error || 'The overview could not be loaded.'}</div></CirclePage>

  const late = o.unanswered.filter(q => q.hours >= 6)
  const reviewCount = reviews ? reviews.reported + reviews.held : 0
  const calm = o.unanswered.length === 0 && reviewCount === 0 && o.alerts_failed_7d === 0
  const answered = o.answers_mothers_30d + o.answers_experts_30d
  const share = answered ? Math.round(o.answers_mothers_30d * 100 / answered) : 0
  const peak = Math.max(1, ...o.daily.map(d => d[metric]))
  const total30 = o.daily.reduce((n, d) => n + d[metric], 0)
  const METRIC = { joined: 'Mothers joined', questions: 'Questions asked', answers: 'Answers given' }

  return (
    <CirclePage title="Overview" sub="How Malkia Circle is doing, and what needs someone today."
      right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canReply && <button style={btn} onClick={() => setReplyTo('')}><Icon name="chat" size={14} />Expert replies</button>}
        <button style={btn} onClick={load} disabled={loading}><Icon name="refresh" size={14} />{loading ? 'Refreshing...' : 'Refresh'}</button></div>}>
      {error && <div style={{ ...card, borderColor: '#E3A5A5', background: '#FCEDED', color: '#8F1D1D', fontSize: 13 }}>{error}</div>}

      <div style={{ ...card, borderColor: calm ? 'var(--border)' : '#E8B93E' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: calm ? 0 : 12 }}>
          <span style={{ color: calm ? '#1E8E4E' : '#B7791F', display: 'grid' }}><Icon name={calm ? 'check' : 'alert'} size={18} /></span>
          <div style={h2}>{calm ? 'Nothing needs attention right now' : 'Needs attention'}</div>
          {calm && <span style={muted}>Every question has an answer, no review is waiting and every alert went out.</span>}
        </div>
        {o.unanswered.length > 0 && (
          <div style={{ marginBottom: reviewCount || o.alerts_failed_7d ? 12 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{o.unanswered.length} question{o.unanswered.length === 1 ? '' : 's'} with no answer{late.length ? `, ${late.length} waiting more than 6 hours` : ''}</div>
            {o.unanswered.slice(0, 8).map(q => (
              <div key={q.id} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <a href={SITE + q.id} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', flex: 1, minWidth: 0, borderRadius: 8, background: 'var(--surface2)', textDecoration: 'none', color: 'var(--text)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', background: q.hours >= 6 ? '#FCEDED' : '#FFF6DA', color: q.hours >= 6 ? '#8F1D1D' : '#7A5B00' }}>{waited(q.hours)}</span>
                <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
                <Icon name="external" size={14} style={{ color: 'var(--text3)', flex: 'none' }} />
              </a>
              {canReply && <button style={btn} onClick={() => setReplyTo(q.id)}>Reply as expert</button>}
              </div>
            ))}
            {o.unanswered.length > 8 && <div style={muted}>and {o.unanswered.length - 8} more.</div>}
          </div>
        )}
        {(reviewCount > 0 || o.alerts_failed_7d > 0) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {reviewCount > 0 && <button style={btn} onClick={() => onNav('circle-moderation')}><Icon name="star" size={14} />{reviewCount} hospital review{reviewCount === 1 ? '' : 's'} to check<Icon name="arrow" size={13} /></button>}
            {o.alerts_failed_7d > 0 && <button style={btn} onClick={seesMessages ? () => onNav('circle-messages') : undefined} disabled={!seesMessages}><Icon name="send" size={14} />{o.alerts_failed_7d} WhatsApp alert{o.alerts_failed_7d === 1 ? '' : 's'} not delivered in 7 days{seesMessages && <Icon name="arrow" size={13} />}</button>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 12 }}>
        {tile('users', o.mothers, 'mothers in Circle', o.mothers_today ? `${o.mothers_today} joined today` : 'none joined today', seesMembers ? () => members('all') : undefined)}
        {tile('heart', o.mothers_7d, 'joined in the last 7 days', undefined, seesMembers ? () => members('week') : undefined)}
        {tile('question', o.questions_7d, 'questions in the last 7 days', `${o.questions_today} today · ${o.questions_total} in all`)}
        {tile('crown', `${o.founders} / 1,000`, 'founding mother badges earned', undefined)}
        {tile('send', o.weekly_subscribers, 'subscribed to weekly lessons', undefined, seesMembers ? () => members('weekly') : undefined)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={h2}>Who is answering</div>
          <div style={{ ...muted, margin: '4px 0 14px' }}>Answers in the last 30 days. The aim is mothers answering each other, with the midwife adding to it.</div>
          {answered === 0 ? <div style={muted}>No answers in the last 30 days.</div> : (
            <>
              <div style={{ display: 'flex', height: 14, borderRadius: 20, overflow: 'hidden', background: 'var(--surface2)' }}>
                <div style={{ width: `${share}%`, background: '#D9538A' }} title={`Mothers: ${o.answers_mothers_30d}`} />
                <div style={{ flex: 1, background: 'var(--accent)' }} title={`Midwives and experts: ${o.answers_experts_30d}`} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10, fontSize: 13, color: 'var(--text)' }}>
                <span><b style={{ color: '#D9538A' }}>{o.answers_mothers_30d}</b> from mothers ({share}%)</span>
                <span><b style={{ color: 'var(--accent)' }}>{o.answers_experts_30d}</b> from midwives and experts ({100 - share}%)</span>
              </div>
            </>
          )}
        </div>

        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={h2}>Last 30 days <span style={{ ...muted, fontWeight: 600 }}>· {total30} {METRIC[metric].toLowerCase()}</span></div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['joined', 'questions', 'answers'] as const).map(m => <button key={m} onClick={() => setMetric(m)} style={{ ...btn, padding: '5px 10px', fontSize: 11.5, background: metric === m ? 'var(--accent)' : 'var(--surface2)', color: metric === m ? '#fff' : 'var(--text)', border: metric === m ? '1px solid var(--accent)' : '1px solid var(--border)' }}>{m === 'joined' ? 'Joined' : m === 'questions' ? 'Questions' : 'Answers'}</button>)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, marginTop: 16 }} role="img" aria-label={`${METRIC[metric]} per day for the last 30 days`}>
            {o.daily.map(d => (
              <div key={d.day} title={`${new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${d[metric]}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ height: d[metric] ? `${Math.max(6, d[metric] * 100 / peak)}%` : 2, background: d[metric] ? 'var(--accent)' : 'var(--border)', borderRadius: '3px 3px 0 0', opacity: d[metric] ? 1 : .6 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...muted, fontSize: 11, marginTop: 6 }}>
            <span>{new Date(o.daily[0].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            <span>busiest day: {peak}</span>
            <span>today</span>
          </div>
        </div>
      </div>
    </CirclePage>
  )
}
