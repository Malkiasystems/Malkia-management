import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Text, Check } from '../components/Field'
import { useToast } from '../components/Toast'
import { GuideIcon, ICON_NAMES } from '../../lib/guideIcons'
import type { Guide, GuideTopic } from '../../lib/types'

export default function GuidesAdmin() {
  const [rows, setRows] = useState<Guide[]>([]); const [topics, setTopics] = useState<GuideTopic[]>([]); const [q, setQ] = useState(''); const [showTopics, setShowTopics] = useState(false)
  const toast = useToast()
  const load = () => {
    supabase.from('site_guides').select('id,slug,title,title_em,stage,topic,series,is_published,reviewer_name,view_count,download_count,updated_at,sort_order').order('sort_order').order('updated_at', { ascending: false }).then(({ data }) => setRows((data || []) as Guide[]))
    supabase.from('site_guide_topics').select('*').order('sort_order').then(({ data }) => setTopics((data || []) as GuideTopic[]))
  }
  useEffect(() => { load() }, [])
  const list = rows.filter(r => !q || `${r.title} ${r.title_em} ${r.slug}`.toLowerCase().includes(q.toLowerCase()))
  const updT = (i: number, p: Partial<GuideTopic>) => setTopics(t => t.map((x, j) => j === i ? { ...x, ...p } : x))
  const saveT = async (t: GuideTopic) => { const { error } = await supabase.from('site_guide_topics').upsert(t); toast(error ? error.message : 'Topic saved', !!error) }
  const addT = async () => { const slug = prompt('Topic key (lowercase, hyphens), e.g. kulala-kwa-mtoto'); if (!slug) return; const { error } = await supabase.from('site_guide_topics').insert({ slug, title: slug, sort_order: topics.length + 1 }); toast(error ? error.message : 'Added', !!error); load() }
  return (
    <>
      <div className="adm-head"><h1>Guides (vitabu)</h1><div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => setShowTopics(s => !s)}>{showTopics ? 'Hide topics' : 'Edit topics'}</button><Link className="btn btn-primary btn-sm" to="/admin/guides/new">+ New guide</Link></div></div>
      {showTopics && (
        <div className="card"><h2>Topics (how the hub is organised)</h2>
          {topics.map((t, i) => (
            <div className="item" key={t.slug} style={{ gridTemplateColumns: '40px 1fr 1fr 1.4fr 70px auto auto', gap: 8 }}>
              <span style={{ display: 'inline-flex', justifyContent: 'center', color: 'var(--teal-deep)' }}><GuideIcon name={t.icon} /></span>
              <input value={t.title} onChange={e => updT(i, { title: e.target.value })} />
              <select value={t.icon || ''} onChange={e => updT(i, { icon: e.target.value })}>{ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}</select>
              <input placeholder="Short description" value={t.description || ''} onChange={e => updT(i, { description: e.target.value })} />
              <input type="number" value={t.sort_order} onChange={e => updT(i, { sort_order: parseInt(e.target.value) || 0 })} />
              <label style={{ fontSize: 12 }}><input type="checkbox" checked={t.is_active} onChange={e => updT(i, { is_active: e.target.checked })} /> on</label>
              <button className="btn btn-ghost btn-sm" onClick={() => saveT(t)}>Save</button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addT}>+ Add topic</button>
        </div>
      )}
      <div className="card">
        <div className="field"><input placeholder="Search guides..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <table className="tbl"><thead><tr><th>#</th><th>Guide</th><th>Stage / topic</th><th>Reviewer</th><th>Views / PDFs</th><th>Status</th></tr></thead><tbody>
          {list.map(r => <tr key={r.id}><td>{r.sort_order}</td><td><Link to={`/admin/guides/${r.id}`} style={{ fontWeight: 600 }}>{r.title} <em>{r.title_em}</em></Link><div className="muted" style={{ fontSize: 12 }}>/vitabu/{r.slug}{r.series ? ` · ${r.series}` : ''}</div></td><td>{r.stage} · {r.topic || <span className="muted">no topic</span>}</td><td>{r.reviewer_name || <span className="muted">none</span>}</td><td>{r.view_count} / {r.download_count}</td><td><span className={`pill ${r.is_published ? 'on' : 'off'}`}>{r.is_published ? 'Published' : 'Draft'}</span></td></tr>)}
          {!list.length && <tr><td colSpan={6} className="muted">No guides yet.</td></tr>}
        </tbody></table>
      </div>
    </>
  )
}
