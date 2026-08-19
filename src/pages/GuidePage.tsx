import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Seo from '../components/Seo'
import GuideRenderer from '../components/GuideRenderer'
import ProductCard from '../components/ProductCard'
import KonnectSection from '../components/KonnectSection'
import { GuideIcon } from '../lib/guideIcons'
import { md } from '../lib/md'
import { fetchGuideBySlug, fetchGuides, fetchProductsByIds, bumpGuideDownload, waLink } from '../lib/queries'
import { useSite } from '../components/SiteContext'
import type { Guide, Product } from '../lib/types'

export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>()
  const { settings, stageLabel } = useSite()
  const [g, setG] = useState<Guide | null | undefined>(undefined)
  const [related, setRelated] = useState<Guide[]>([])
  const [products, setProducts] = useState<Record<string, Product>>({})
  useEffect(() => {
    if (!slug) return
    window.scrollTo(0, 0)
    fetchGuideBySlug(slug).then(async gd => {
      setG(gd); if (!gd) return
      setProducts(await fetchProductsByIds(gd.related_product_ids || []))
      const all = await fetchGuides({})
      const rel = gd.related_guide_ids?.length ? all.filter(x => gd.related_guide_ids.includes(x.id)) : all.filter(x => x.id !== gd.id && (x.topic === gd.topic || x.stage === gd.stage)).slice(0, 3)
      setRelated(rel)
    })
  }, [slug])
  if (g === undefined) return <div className="loading">Inapakia...</div>
  if (!g) return <div className="empty">Mwongozo haupo. <Link to="/vitabu">Rudi kwenye vitabu</Link></div>
  const pdfUrl = `/api/guide-pdf?slug=${encodeURIComponent(g.slug)}`
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/vitabu/${g.slug}` : ''
  const wa = settings.contact?.konnect_whatsapp || settings.contact?.whatsapp || ''
  return (
    <>
      <Seo title={`${g.title} ${g.title_em || ''}`} description={g.seo_description || g.intro || undefined} image={g.cover_image_url} />
      <section className="page-hero g-hero">
        <div className="wrap">
          <div className="g-crumb"><Link to="/vitabu">Vitabu bure</Link> · <Link to={g.stage !== 'all' ? `/${g.stage}` : '/vitabu'}>{stageLabel(g.stage)}</Link></div>
          <div className="g-hero-grid">
            <div>
              {g.tagline && <div className="eyebrow">{g.tagline}</div>}
              <h1 style={{ marginTop: 10 }}><span className="g-hero-icon"><GuideIcon name={g.icon} size={28} /></span>{g.title} <em>{g.title_em}</em></h1>
              {g.intro && <div className="g-intro-web" dangerouslySetInnerHTML={{ __html: md(g.intro) }} />}
              <div className="row-actions" style={{ marginTop: 18 }}>
                <a className="btn btn-primary" href={pdfUrl} onClick={() => bumpGuideDownload(g.slug)} target="_blank" rel="noreferrer">Pakua PDF</a>
                {wa && <a className="btn btn-wa" href={waLink(wa, `Habari Malkia, nitumieni "${g.title} ${g.title_em || ''}" (PDF). ${pageUrl}`)} target="_blank" rel="noreferrer">Nitumie WhatsApp</a>}
                <button className="btn btn-ghost" onClick={() => { if (navigator.share) navigator.share({ title: g.title, url: pageUrl }); else { navigator.clipboard.writeText(pageUrl) } }}>Share</button>
              </div>
              {g.reviewer_name && <div className="g-reviewed">Imekaguliwa na <b>{g.reviewer_name}</b>{g.reviewed_at && <> · {new Date(g.reviewed_at).toLocaleDateString('sw-TZ', { month: 'long', year: 'numeric' })}</>}</div>}
            </div>
          </div>
        </div>
      </section>
      <div className="wrap g-wrap"><GuideRenderer guide={g} mode="web" /></div>
      {g.related_product_ids?.length > 0 && (
        <div className="wrap related"><h2>Bidhaa zinazohusiana</h2><div className="band-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>{g.related_product_ids.map(id => <ProductCard key={id} item={{ product_id: id }} product={products[id]} />)}</div></div>
      )}
      {related.length > 0 && (
        <div className="wrap related"><h2>Soma pia</h2><div className="g-grid">{related.map(r => <GuideCard key={r.id} g={r} />)}</div></div>
      )}
      <KonnectSection />
    </>
  )
}

export function GuideCard({ g }: { g: Guide }) {
  return (
    <Link className="g-card" to={`/vitabu/${g.slug}`}>
      <div className="g-card-icon"><GuideIcon name={g.icon} size={22} /></div>
      <div className="g-card-body">
        {g.pill && <div className="g-card-pill">{g.pill}</div>}
        <h3>{g.title} <em>{g.title_em}</em></h3>
        {g.key_points?.length ? <ul>{g.key_points.slice(0, 3).map((k, i) => <li key={i}>{k}</li>)}</ul> : g.intro ? <p>{g.intro.replace(/\*\*/g, '').slice(0, 140)}…</p> : null}
        <div className="g-card-foot"><span>Soma &rarr;</span><span className="muted">PDF bure</span></div>
      </div>
    </Link>
  )
}
