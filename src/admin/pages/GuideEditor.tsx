import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Text, Area, Check, Select } from '../components/Field'
import { ImageUpload } from '../components/ImageUpload'
import { useProducts } from '../components/ProductPicker'
import { useStageOptions } from '../components/StageOptions'
import { useToast } from '../components/Toast'
import { GuideIcon, ICON_NAMES } from '../../lib/guideIcons'
import GuideRenderer from '../../components/GuideRenderer'
import { BLOCK_LABELS, type Guide, type GuideBlock, type GuideTopic, type BlockType, type GuideItem } from '../../lib/types'

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const uid = () => Math.random().toString(36).slice(2, 8)
const itemsToText = (items?: GuideItem[]) => (items || []).map(i => i.note ? `${i.label} | ${i.note}` : i.label).join('\n')
const textToItems = (t: string): GuideItem[] => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [label, ...rest] = l.split('|'); return { label: label.trim(), note: rest.join('|').trim() || undefined } })

function IconPicker({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="field"><label>Icon</label>
      <div className="row-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}><GuideIcon name={value} size={16} /> {value || 'none'}</button>
        {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>✕</button>}
      </div>
      {open && <div className="icon-grid">{ICON_NAMES.map(n => <button type="button" key={n} title={n} className={n === value ? 'on' : ''} onClick={() => { onChange(n); setOpen(false) }}><GuideIcon name={n} size={18} /></button>)}</div>}
    </div>
  )
}

function BlockEditor({ b, onChange, onMove, onDelete, onDuplicate, i, total }: { b: GuideBlock; onChange: (p: Partial<GuideBlock>) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; onDuplicate: () => void; i: number; total: number }) {
  const hasItems = ['checklist', 'steps', 'alert'].includes(b.type)
  const hasBody = ['text', 'alert', 'tip', 'brand'].includes(b.type)
  const hasTitle = b.type !== 'text' && b.type !== 'pagebreak'
  return (
    <div className="blk">
      <div className="blk-head">
        <span className="pill off">{i + 1}</span>
        <select value={b.type} onChange={e => onChange({ type: e.target.value as BlockType })}>{(Object.keys(BLOCK_LABELS) as BlockType[]).map(t => <option key={t} value={t}>{BLOCK_LABELS[t]}</option>)}</select>
        {b.type !== 'pagebreak' && <select value={b.width || 'full'} onChange={e => onChange({ width: e.target.value as any })}><option value="full">Full width</option><option value="half">Half width (pairs with next half)</option></select>}
        {b.type === 'alert' && <select value={b.tone || 'red'} onChange={e => onChange({ tone: e.target.value as any })}><option value="red">Red: go to hospital now</option><option value="amber">Amber: call clinic today</option><option value="teal">Teal: note</option></select>}
        <span className="row-actions" style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(-1)} disabled={i === 0}>↑</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(1)} disabled={i === total - 1}>↓</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDuplicate}>Copy</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#8B1E2D' }} onClick={onDelete}>✕</button>
        </span>
      </div>
      {b.type === 'pagebreak' ? <p className="muted" style={{ fontSize: 12 }}>Starts a new page in the PDF. On the website it shows as a thin divider.</p> : (
        <div className="grid2">
          <div>
            {hasTitle && <Text label={b.type === 'heading' ? 'Heading' : 'Title (optional)'} value={b.title} onChange={v => onChange({ title: v })} />}
            {b.type === 'brand' && <Text label="Eyebrow (small gold line)" value={b.eyebrow} onChange={v => onChange({ eyebrow: v })} />}
            {hasBody && <Area label={b.type === 'alert' ? 'Body (optional, shown above items)' : 'Body'} value={b.body} onChange={v => onChange({ body: v })} rows={b.type === 'text' ? 5 : 4} hint="**bold** for emphasis. Blank line = new paragraph." />}
            {b.type === 'fill' && <Text label="Number of lines" type="number" value={b.lines ?? 3} onChange={v => onChange({ lines: parseInt(v) || 3 })} />}
          </div>
          <div>
            {hasItems && <Area label="Items, one per line. Add | for a small grey note" value={itemsToText(b.items)} onChange={v => onChange({ items: textToItems(v) })} rows={8} hint="Example: **Kadi ya kliniki** | Bila hii wanakuanzia upya." />}
            {b.type !== 'text' && <IconPicker value={b.icon} onChange={v => onChange({ icon: v })} />}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GuideEditor() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast()
  const [g, setG] = useState<Partial<Guide>>({ stage: 'all', icon: 'clipboard-list', blocks: [], key_points: [], related_product_ids: [], related_guide_ids: [], is_published: false, sort_order: 0 })
  const [topics, setTopics] = useState<GuideTopic[]>([]); const [others, setOthers] = useState<{ id: string; title: string }[]>([])
  const [busy, setBusy] = useState(false); const [preview, setPreview] = useState(false)
  const products = useProducts(); const stageOpts = useStageOptions(true)
  useEffect(() => {
    supabase.from('site_guide_topics').select('*').order('sort_order').then(({ data }) => setTopics((data || []) as GuideTopic[]))
    supabase.from('site_guides').select('id,title').order('title').then(({ data }) => setOthers(((data || []) as any[]).filter(x => x.id !== id)))
    if (id) supabase.from('site_guides').select('*').eq('id', id).single().then(({ data }) => data && setG(data as Guide))
  }, [id])
  const set = (p: Partial<Guide>) => setG(x => ({ ...x, ...p }))
  const blocks = g.blocks || []
  const setBlocks = (b: GuideBlock[]) => set({ blocks: b })
  const addBlock = (type: BlockType) => setBlocks([...blocks, { id: uid(), type, width: type === 'heading' || type === 'checklist' || type === 'tip' ? 'half' : 'full', items: [], tone: 'red' }])
  const save = async (publish?: boolean) => {
    if (!g.title) return toast('Title required', true)
    const is_published = publish ?? !!g.is_published
    if (is_published && !g.reviewer_name) return toast('Add a reviewer (midwife) before publishing', true)
    const payload: any = { ...g, slug: g.slug || slugify(`${g.title} ${g.title_em || ''}`), is_published, published_at: is_published ? (g.published_at || new Date().toISOString()) : g.published_at, week_from: g.week_from || null, week_to: g.week_to || null, series_order: g.series_order || null, topic: g.topic || null }
    delete payload.created_at; delete payload.updated_at
    setBusy(true)
    const res = id ? await supabase.from('site_guides').update(payload).eq('id', id).select().single() : await supabase.from('site_guides').insert(payload).select().single()
    setBusy(false)
    if (res.error) return toast(res.error.message, true)
    toast(is_published ? 'Published' : 'Saved as draft'); if (!id) nav(`/admin/guides/${res.data.id}`, { replace: true }); else setG(res.data as Guide)
  }
  const del = async () => { if (!id || !confirm('Delete this guide permanently?')) return; await supabase.from('site_guides').delete().eq('id', id); nav('/admin/guides') }
  const toggleId = (arr: string[] | undefined, v: string) => (arr || []).includes(v) ? (arr || []).filter(x => x !== v) : [...(arr || []), v]
  return (
    <>
      <div className="adm-head"><h1>{id ? 'Edit guide' : 'New guide'}</h1>
        <div className="row-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>{preview ? 'Back to editor' : 'Preview'}</button>
          {g.is_published && g.slug && <><a className="btn btn-ghost btn-sm" href={`/vitabu/${g.slug}`} target="_blank" rel="noreferrer">View page ↗</a><a className="btn btn-ghost btn-sm" href={`/api/guide-pdf?slug=${g.slug}`} target="_blank" rel="noreferrer">Open PDF ↗</a></>}
          <button className="btn btn-ghost btn-sm" onClick={() => save(false)} disabled={busy}>Save draft</button>
          <button className="btn btn-primary btn-sm" onClick={() => save(true)} disabled={busy}>{g.is_published ? 'Update & keep published' : 'Publish'}</button>
        </div>
      </div>
      {preview ? (
        <div className="card" style={{ maxWidth: 900 }}>
          <div className="eyebrow">{g.tagline}</div>
          <h1 style={{ fontSize: 36, fontWeight: 300, margin: '8px 0' }}>{g.title} <em>{g.title_em}</em></h1>
          <p className="muted" style={{ marginBottom: 20 }}>{g.intro}</p>
          <GuideRenderer guide={g as Guide} mode="web" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            <div className="card">
              <div className="grid2"><Text label="Title" value={g.title} onChange={v => set({ title: v, slug: id ? g.slug : slugify(`${v} ${g.title_em || ''}`) })} placeholder="Hospital Bag" /><Text label="Title, coloured part" value={g.title_em} onChange={v => set({ title_em: v, slug: id ? g.slug : slugify(`${g.title || ''} ${v}`) })} placeholder="ya Tanzania" /></div>
              <div className="grid2"><Text label="Slug" value={g.slug} onChange={v => set({ slug: slugify(v) })} hint={`/vitabu/${g.slug || '...'}`} /><Text label="Tagline (small line above title)" value={g.tagline} onChange={v => set({ tagline: v })} placeholder="Checklist ya kweli, kwa hospitali za Tanzania" /></div>
              <Area label="Intro (lead paragraph)" value={g.intro} onChange={v => set({ intro: v })} rows={3} hint="**bold** allowed." />
              <Area label="Key points for the hub card (one per line, max 3)" value={(g.key_points || []).join('\n')} onChange={v => set({ key_points: v.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 3) })} rows={3} />
            </div>
            <div className="card">
              <h2>Content blocks</h2>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Build the guide from blocks. Half-width blocks sit side by side in pairs (a heading + its checklist is the usual pair). Add a page break where the PDF should start a new page.</p>
              {blocks.map((b, i) => (
                <BlockEditor key={b.id} b={b} i={i} total={blocks.length}
                  onChange={p => setBlocks(blocks.map((x, j) => j === i ? { ...x, ...p } : x))}
                  onMove={d => { const j = i + d; if (j < 0 || j >= blocks.length) return; const c = [...blocks]; [c[i], c[j]] = [c[j], c[i]]; setBlocks(c) }}
                  onDelete={() => setBlocks(blocks.filter((_, j) => j !== i))}
                  onDuplicate={() => { const c = [...blocks]; c.splice(i + 1, 0, { ...b, id: uid() }); setBlocks(c) }} />
              ))}
              <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <span className="muted" style={{ fontSize: 12 }}>Add block:</span>
                {(Object.keys(BLOCK_LABELS) as BlockType[]).map(t => <button key={t} className="btn btn-ghost btn-sm" onClick={() => addBlock(t)}>+ {t}</button>)}
              </div>
            </div>
          </div>
          <div>
            <div className="card"><h2>Organisation</h2>
              <Select label="Stage" value={g.stage} onChange={v => set({ stage: v })} options={stageOpts} />
              <Select label="Topic" value={g.topic || ''} onChange={v => set({ topic: v || null })} options={[{ v: '', l: 'No topic' }, ...topics.map(t => ({ v: t.slug, l: t.title }))]} />
              <div className="grid2"><Text label="Series (optional)" value={g.series} onChange={v => set({ series: v })} placeholder="Kujiandaa kujifungua" /><Text label="Order in series" type="number" value={g.series_order} onChange={v => set({ series_order: parseInt(v) || null })} /></div>
              <div className="grid2"><Text label="Week from (optional)" type="number" value={g.week_from} onChange={v => set({ week_from: parseInt(v) || null })} /><Text label="Week to" type="number" value={g.week_to} onChange={v => set({ week_to: parseInt(v) || null })} /></div>
              <Text label="Hub sort order" type="number" value={g.sort_order} onChange={v => set({ sort_order: parseInt(v) || 0 })} />
              <Text label="Pill label (PDF corner)" value={g.pill} onChange={v => set({ pill: v })} placeholder="Bure · Kujifungua" />
              <IconPicker value={g.icon} onChange={v => set({ icon: v })} />
            </div>
            <div className="card"><h2>Review & publish</h2>
              <Text label="Reviewer (required to publish)" value={g.reviewer_name} onChange={v => set({ reviewer_name: v })} placeholder="Sophia Kipanta, Midwife" />
              <Text label="Reviewed on" type="date" value={g.reviewed_at} onChange={v => set({ reviewed_at: v || null })} />
              <Area label="SEO / share description" value={g.seo_description} onChange={v => set({ seo_description: v })} rows={2} />
              <ImageUpload label="Share image (optional)" value={g.cover_image_url} onChange={v => set({ cover_image_url: v })} folder="guides" />
              <div className="muted" style={{ fontSize: 12 }}>Status: <span className={`pill ${g.is_published ? 'on' : 'off'}`}>{g.is_published ? 'Published' : 'Draft'}</span> {g.view_count ? `· ${g.view_count} views · ${g.download_count} PDFs` : ''}</div>
            </div>
            <div className="card"><h2>Related products</h2><div style={{ maxHeight: 200, overflow: 'auto', fontSize: 13 }}>{products.map(p => <label key={p.id} style={{ display: 'block', padding: '3px 0' }}><input type="checkbox" checked={(g.related_product_ids || []).includes(p.id)} onChange={() => set({ related_product_ids: toggleId(g.related_product_ids, p.id) })} /> {p.name}</label>)}</div></div>
            <div className="card"><h2>Related guides</h2><div style={{ maxHeight: 200, overflow: 'auto', fontSize: 13 }}>{others.map(o => <label key={o.id} style={{ display: 'block', padding: '3px 0' }}><input type="checkbox" checked={(g.related_guide_ids || []).includes(o.id)} onChange={() => set({ related_guide_ids: toggleId(g.related_guide_ids, o.id) })} /> {o.title}</label>)}{!others.length && <span className="muted">No other guides yet. Leave empty and the site picks same topic/stage.</span>}</div></div>
            {id && <button className="btn btn-ghost btn-sm" onClick={del} style={{ color: '#8B1E2D' }}>Delete guide</button>}
          </div>
        </div>
      )}
    </>
  )
}
