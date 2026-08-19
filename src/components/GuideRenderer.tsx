import { Fragment } from 'react'
import type { Guide, GuideBlock } from '../lib/types'
import { GuideIcon } from '../lib/guideIcons'
import { md, mdInline } from '../lib/md'
import { useSite } from './SiteContext'

/** Groups consecutive half-width blocks into pairs; full blocks and page breaks flush. */
function layout(blocks: GuideBlock[]): (GuideBlock | GuideBlock[])[] {
  const out: (GuideBlock | GuideBlock[])[] = []; let pair: GuideBlock[] = []
  const flush = () => { if (pair.length) { out.push(pair.length === 1 ? pair[0] : pair); pair = [] } }
  for (const b of blocks) {
    if (b.type === 'pagebreak' || b.width !== 'half') { flush(); out.push(b) }
    else { pair.push(b); if (pair.length === 2) flush() }
  }
  flush(); return out
}

function Block({ b, n }: { b: GuideBlock; n: number }) {
  const Icon = b.icon ? <span className="gb-icon"><GuideIcon name={b.icon} size={16} /></span> : null
  switch (b.type) {
    case 'heading':
      return <h2 className="gb-h"><span className="gb-n">{n}</span>{Icon}<span>{b.title}</span></h2>
    case 'text':
      return <div className="gb-text" dangerouslySetInnerHTML={{ __html: md(b.body) }} />
    case 'checklist':
      return (
        <div className="gb-check">
          {b.title && <h3 className="gb-sub">{Icon}{b.title}</h3>}
          <ul>{(b.items || []).map((it, i) => <li key={i}><span dangerouslySetInnerHTML={{ __html: mdInline(it.label) }} />{it.note && <em dangerouslySetInnerHTML={{ __html: ' ' + mdInline(it.note) }} />}</li>)}</ul>
        </div>
      )
    case 'steps':
      return (
        <div className="gb-steps">
          {b.title && <h3 className="gb-sub">{Icon}{b.title}</h3>}
          <ol>{(b.items || []).map((it, i) => <li key={i}><span dangerouslySetInnerHTML={{ __html: mdInline(it.label) }} />{it.note && <em dangerouslySetInnerHTML={{ __html: ' ' + mdInline(it.note) }} />}</li>)}</ol>
        </div>
      )
    case 'alert':
      return (
        <div className={`gb-alert ${b.tone || 'red'}`}>
          {b.title && <h3>{Icon}{b.title}</h3>}
          {b.body && <div dangerouslySetInnerHTML={{ __html: md(b.body) }} />}
          {b.items?.length ? <ul>{b.items.map((it, i) => <li key={i}><span dangerouslySetInnerHTML={{ __html: mdInline(it.label) }} />{it.note && <em dangerouslySetInnerHTML={{ __html: ' (' + mdInline(it.note) + ')' }} />}</li>)}</ul> : null}
        </div>
      )
    case 'tip':
      return <div className="gb-tip">{b.title && <h3>{Icon}{b.title}</h3>}<div dangerouslySetInnerHTML={{ __html: md(b.body) }} /></div>
    case 'brand':
      return <div className="gb-brand">{b.eyebrow && <div className="gb-eyebrow">{b.eyebrow}</div>}{b.title && <h3>{b.title}</h3>}<div dangerouslySetInnerHTML={{ __html: md(b.body) }} /></div>
    case 'fill':
      return <div className="gb-fill">{b.title && <h3>{Icon}{b.title}</h3>}{Array.from({ length: b.lines || 3 }).map((_, i) => <div key={i} className="gb-line" />)}</div>
    case 'pagebreak':
      return <div className="gb-pagebreak" />
    default: return null
  }
}

export default function GuideRenderer({ guide, mode = 'web' }: { guide: Guide; mode?: 'web' | 'print' }) {
  const { settings } = useSite()
  const rows = layout(guide.blocks || [])
  let n = 0
  const num = (b: GuideBlock) => b.type === 'heading' ? ++n : n
  const renderOne = (b: GuideBlock) => <Block key={b.id} b={b} n={num(b)} />
  const footer = (
    <div className="g-foot">
      <span>{guide.reviewer_name ? <>Imekaguliwa na <b>{guide.reviewer_name}</b> · </> : null}Malkia Wellness Group Ltd · {settings.footer?.disclaimer || 'Elimu hii haichukui nafasi ya daktari wako.'}</span>
      <span>www.malkia.co.tz · Maswali? WhatsApp <b>Malkia Konnect</b></span>
    </div>
  )
  // In print mode we split into pages at pagebreaks; each page gets brand header + footer
  if (mode === 'print') {
    const pages: (GuideBlock | GuideBlock[])[][] = [[]]
    rows.forEach(r => { if (!Array.isArray(r) && r.type === 'pagebreak') pages.push([]); else pages[pages.length - 1].push(r) })
    return (
      <div className="gprint">
        {pages.map((rowsOnPage, pi) => (
          <section className="gpage" key={pi}>
            <div className="g-brand"><span className="g-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 18h18M4 17l1.5-9 4 4L12 6l2.5 6 4-4L20 17z" /></svg>Malkia<small>YOUR PARTNER IN MOTHERHOOD</small></span><span className="g-pill">{pi === 0 ? (guide.pill || 'Bure') : `Ukurasa ${pi + 1} kati ya ${pages.length}`}</span></div>
            {pi === 0 && (
              <header className="g-head">
                {guide.tagline && <div className="g-tag">{guide.tagline}</div>}
                <h1>{guide.title} {guide.title_em && <span>{guide.title_em}</span>}</h1>
                {guide.intro && <div className="g-intro" dangerouslySetInnerHTML={{ __html: md(guide.intro) }} />}
              </header>
            )}
            <div className="g-body">{rowsOnPage.map((r, i) => Array.isArray(r) ? <div className="g-pair" key={i}>{r.map(renderOne)}</div> : <Fragment key={i}>{renderOne(r)}</Fragment>)}</div>
            {footer}
          </section>
        ))}
      </div>
    )
  }
  return (
    <div className="gweb">
      <div className="g-body">{rows.map((r, i) => Array.isArray(r) ? <div className="g-pair" key={i}>{r.map(renderOne)}</div> : <Fragment key={i}>{renderOne(r)}</Fragment>)}</div>
      {footer}
    </div>
  )
}
