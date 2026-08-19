import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import GuideRenderer from '../components/GuideRenderer'
import { fetchGuideBySlug } from '../lib/queries'
import type { Guide } from '../lib/types'

/** Bare print view used by /api/guide-pdf (headless Chromium) and by Ctrl+P. No header/footer/nav. */
export default function GuidePrint() {
  const { slug } = useParams<{ slug: string }>()
  const [g, setG] = useState<Guide | null | undefined>(undefined)
  useEffect(() => { if (slug) fetchGuideBySlug(slug, false).then(setG) }, [slug])
  useEffect(() => { if (g !== undefined) document.body.setAttribute('data-ready', '1'); document.body.classList.add('print-mode'); return () => document.body.classList.remove('print-mode') }, [g])
  if (g === undefined) return null
  if (!g) return <div data-ready="1">Not found</div>
  return <GuideRenderer guide={g} mode="print" />
}
