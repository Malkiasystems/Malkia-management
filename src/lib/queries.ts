import { supabase } from './supabase'
import type { SiteSettings, StagePage, Band, Product, Article, Download, FoundationProgram, FoundationReport, Stage, Lead } from './types'

export async function fetchSettings(): Promise<SiteSettings> {
  const { data } = await supabase.from('site_settings').select('key,value')
  const out: SiteSettings = {}
  ;(data || []).forEach((r: any) => { out[r.key] = r.value })
  return out
}

export async function fetchStagePages(): Promise<StagePage[]> {
  const { data } = await supabase.from('site_stage_pages').select('*').eq('is_active', true).order('sort_order')
  return (data || []) as StagePage[]
}

export async function fetchBands(page = 'home'): Promise<Band[]> {
  const { data } = await supabase.from('site_bands').select('*').eq('page', page).eq('is_active', true).order('sort_order')
  return (data || []) as Band[]
}

export async function fetchProductsByIds(ids: string[]): Promise<Record<string, Product>> {
  if (!ids.length) return {}
  const { data } = await supabase.from('products')
    .select('id,name,selling_price,image_url,short_description,unit,is_active')
    .in('id', ids)
  const map: Record<string, Product> = {}
  ;(data || []).forEach((p: any) => { map[p.id] = p })
  const missing = ids.filter(id => map[id] && !map[id].image_url)
  if (missing.length) {
    const { data: imgs } = await supabase.from('product_images').select('product_id,image_url,is_primary,sort_order').in('product_id', missing).order('is_primary', { ascending: false }).order('sort_order')
    ;(imgs || []).forEach((i: any) => { if (map[i.product_id] && !map[i.product_id].image_url) map[i.product_id].image_url = i.image_url })
  }
  return map
}

export async function fetchProductsAuto(category: string | null | undefined, limit = 12): Promise<Product[]> {
  let q = supabase.from('products').select('id,name,selling_price,image_url,short_description,unit,is_active,category').eq('is_active', true).order('name').limit(limit)
  if (category) q = q.eq('category', category)
  const { data } = await q
  const list = (data || []) as Product[]
  const missing = list.filter(p => !p.image_url).map(p => p.id)
  if (missing.length) {
    const { data: imgs } = await supabase.from('product_images').select('product_id,image_url,is_primary,sort_order').in('product_id', missing).order('is_primary', { ascending: false }).order('sort_order')
    ;(imgs || []).forEach((i: any) => { const p = list.find(x => x.id === i.product_id); if (p && !p.image_url) p.image_url = i.image_url })
  }
  return list
}

export async function fetchArticles(opts: { stage?: Stage; limit?: number } = {}): Promise<Article[]> {
  let q = supabase.from('site_articles').select('*').eq('is_published', true).order('published_at', { ascending: false })
  if (opts.stage) q = q.in('stage', [opts.stage, 'all'])
  if (opts.limit) q = q.limit(opts.limit)
  const { data } = await q
  return (data || []) as Article[]
}

export async function fetchArticleBySlug(slug: string): Promise<Article | null> {
  const { data } = await supabase.from('site_articles').select('*').eq('slug', slug).eq('is_published', true).maybeSingle()
  if (data) supabase.rpc('site_bump_article_view', { p_slug: slug }).then(() => {})
  return data as Article | null
}

export async function fetchDownloads(stage?: Stage): Promise<Download[]> {
  let q = supabase.from('site_downloads').select('*').eq('is_active', true).order('sort_order')
  if (stage) q = q.in('stage', [stage, 'all'])
  const { data } = await q
  return (data || []) as Download[]
}

export async function fetchFoundation(): Promise<{ programs: FoundationProgram[]; reports: FoundationReport[] }> {
  const [p, r] = await Promise.all([
    supabase.from('site_foundation_programs').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('site_foundation_reports').select('*').eq('is_active', true).order('published_at', { ascending: false }),
  ])
  return { programs: (p.data || []) as FoundationProgram[], reports: (r.data || []) as FoundationReport[] }
}

export async function insertLead(lead: Partial<Lead>) {
  return supabase.from('site_leads').insert(lead)
}

export function waLink(phone: string, text: string) {
  const p = (phone || '').replace(/[^\d]/g, '')
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}

export const tzs = (n: number) => 'TZS ' + Math.round(n || 0).toLocaleString('en-US')

/* ===== Guides ===== */
import type { Guide, GuideTopic } from './types'
export async function fetchGuideTopics(): Promise<GuideTopic[]> {
  const { data } = await supabase.from('site_guide_topics').select('*').eq('is_active', true).order('sort_order')
  return (data || []) as GuideTopic[]
}
export async function fetchGuides(opts: { stage?: string; topic?: string } = {}): Promise<Guide[]> {
  let q = supabase.from('site_guides').select('id,slug,title,title_em,pill,tagline,intro,stage,topic,series,series_order,icon,key_points,reviewer_name,reviewed_at,cover_image_url,week_from,week_to,download_count,view_count,sort_order,is_published,published_at,related_guide_ids').eq('is_published', true).order('sort_order')
  if (opts.stage) q = q.in('stage', [opts.stage, 'all'])
  if (opts.topic) q = q.eq('topic', opts.topic)
  const { data } = await q
  return (data || []) as Guide[]
}
export async function fetchGuideBySlug(slug: string, countView = true): Promise<Guide | null> {
  const { data } = await supabase.from('site_guides').select('*').eq('slug', slug).eq('is_published', true).maybeSingle()
  if (data && countView) supabase.rpc('site_bump_guide', { p_slug: slug, p_kind: 'view' }).then(() => {})
  return data as Guide | null
}
export function bumpGuideDownload(slug: string) { supabase.rpc('site_bump_guide', { p_slug: slug, p_kind: 'download' }).then(() => {}) }
