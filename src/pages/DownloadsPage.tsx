import { useEffect, useMemo, useState } from 'react'
import Seo from '../components/Seo'
import { DownloadCard } from '../components/DownloadsSection'
import { GuideCard } from './GuidePage'
import { GuideIcon } from '../lib/guideIcons'
import { fetchDownloads, fetchGuides, fetchGuideTopics } from '../lib/queries'
import { useSite } from '../components/SiteContext'
import type { Download, Guide, GuideTopic } from '../lib/types'

export default function DownloadsPage() {
  const { stages } = useSite()
  const [guides, setGuides] = useState<Guide[]>([])
  const [topics, setTopics] = useState<GuideTopic[]>([])
  const [items, setItems] = useState<Download[]>([])
  const [stage, setStage] = useState('all'); const [topic, setTopic] = useState('all'); const [q, setQ] = useState('')
  useEffect(() => { fetchGuides().then(setGuides); fetchGuideTopics().then(setTopics); fetchDownloads().then(setItems) }, [])
  const shown = useMemo(() => guides.filter(g =>
    (stage === 'all' || g.stage === stage || g.stage === 'all') &&
    (topic === 'all' || g.topic === topic) &&
    (!q || `${g.title} ${g.title_em} ${g.intro} ${(g.key_points || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  ), [guides, stage, topic, q])
  const byTopic = useMemo(() => {
    const m = new Map<string, Guide[]>()
    shown.forEach(g => { const k = g.topic || 'nyingine'; m.set(k, [...(m.get(k) || []), g]) })
    return [...topics.map(t => [t.slug, m.get(t.slug) || []] as const), ['nyingine', m.get('nyingine') || []] as const].filter(([, arr]) => arr.length)
  }, [shown, topics])
  return (
    <>
      <Seo title="Vitabu vya bure" description="Miongozo na PDF za bure za mimba, kujifungua na mtoto, kwa mama wa Tanzania, zimekaguliwa na midwife." />
      <section className="page-hero"><div className="wrap"><div className="eyebrow">Bure. Kabisa.</div><h1 style={{ marginTop: 10 }}>Vitabu vya kusoma na <em>kupakua.</em></h1><p>Kila mwongozo unasomeka hapa kama ukurasa, unapakuliwa kama PDF, na unatumika WhatsApp. Imeandikwa kwa Tanzania, imekaguliwa na midwife, hakuna sharti la kununua.</p></div></section>
      <div className="wrap" style={{ padding: '24px 20px 56px' }}>
        <div className="g-filters">
          <input className="g-search" placeholder="Tafuta: hospital bag, malaria, chanjo..." value={q} onChange={e => setQ(e.target.value)} />
          <div className="g-chips">
            <button className={stage === 'all' ? 'on' : ''} onClick={() => setStage('all')}>Hatua zote</button>
            {stages.map(s => <button key={s.stage} className={stage === s.stage ? 'on' : ''} onClick={() => setStage(s.stage)}>{s.nav_label || s.title}</button>)}
          </div>
          <div className="g-chips">
            <button className={topic === 'all' ? 'on' : ''} onClick={() => setTopic('all')}>Mada zote</button>
            {topics.map(t => <button key={t.slug} className={topic === t.slug ? 'on' : ''} onClick={() => setTopic(t.slug)}><GuideIcon name={t.icon} size={14} /> {t.title}</button>)}
          </div>
        </div>
        {byTopic.length ? byTopic.map(([slug, arr]) => {
          const t = topics.find(x => x.slug === slug)
          return (
            <section key={slug} className="g-topic">
              <h2 className="g-topic-h"><span className="g-topic-icon"><GuideIcon name={t?.icon} size={18} /></span>{t?.title || 'Nyingine'}<span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{arr.length}</span></h2>
              {t?.description && <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>{t.description}</p>}
              <div className="g-grid">{arr.sort((a, b) => (a.series_order ?? 99) - (b.series_order ?? 99) || a.sort_order - b.sort_order).map(g => <GuideCard key={g.id} g={g} />)}</div>
            </section>
          )
        }) : <div className="empty">Hakuna mwongozo unaolingana. Badilisha filters.</div>}
        {items.length > 0 && (
          <section className="g-topic" style={{ marginTop: 40 }}>
            <h2 className="g-topic-h">PDF nyingine za kupakua</h2>
            <div className="dl-grid">{items.map(d => <DownloadCard key={d.id} d={d} />)}</div>
          </section>
        )}
      </div>
    </>
  )
}
