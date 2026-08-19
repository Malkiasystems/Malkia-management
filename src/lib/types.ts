// Stages are fully dynamic: any key from site_stage_pages (e.g. 'mimba', 'kupanga-mimba', 'baba').
export type Stage = string
export type StageOrAll = string   // a stage key or 'all'
export const RESERVED_KEYS = ['admin', 'vitabu', 'foundation', 'makala', 'api', 'assets']

export interface Link { label: string; href: string }

export interface SiteSettings {
  announcement?: { text: string; is_active: boolean }
  hero?: {
    eyebrow: string; headline: string; headline_em: string; lead: string
    primary_cta: Link; secondary_cta: Link; image_url: string | null
    caption_title: string; caption_body: string; trust_points: string[]
    layout?: 'split' | 'fullbleed'; overlay?: number; align?: 'left' | 'center'; text_color?: 'light' | 'dark'; min_height?: number
  }
  contact?: { whatsapp: string; konnect_whatsapp: string; email: string; city: string; instagram: string; facebook: string; tiktok: string }
  shop?: { shop_url: string; buy_label: string; whatsapp_label: string }
  seo?: { site_title: string; default_description: string; og_image_url: string | null }
  footer?: { tagline: string; disclaimer: string; tmda_line: string }
  tool_due_date?: { eyebrow: string; headline: string; headline_em: string; body: string; anc_weeks: number[] }
  konnect?: { eyebrow: string; headline: string; headline_em: string; body: string; cta_label: string }
  foundation?: { eyebrow: string; headline: string; headline_em: string; body: string; stat_value: string; stat_label: string; stat_source: string; donate_url: string }
  theme?: Theme
  [key: string]: any
}

export interface Theme {
  display_font: string; body_font: string
  heading_weight: number          // 300 | 400 | 500 | 600
  h_scale: number                 // headline size multiplier, 0.7 to 1.3
  text_scale: number              // body copy multiplier, 0.85 to 1.2
  radius: number                  // card radius px
  button_style: 'pill' | 'rounded' | 'square'
  colors: { teal: string; teal_deep: string; teal_mist: string; maroon: string; maroon_soft: string; gold: string; ink: string; ink_soft: string; paper: string; line: string }
  logo_url: string | null         // wordmark image for header (on light bg)
  logo_url_light: string | null   // white version for footer / dark bg
  logo_height: number             // px
  show_logo_text: boolean         // fall back to text wordmark when no image
}

export const DISPLAY_FONTS = ['Fraunces', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Lora', 'Libre Baskerville', 'Outfit', 'Poppins', 'Nunito', 'Dancing Script', 'Great Vibes', 'Pacifico']
export const BODY_FONTS = ['Manrope', 'Inter', 'DM Sans', 'Poppins', 'Nunito', 'Work Sans', 'Source Sans 3', 'Open Sans', 'Lato']

export const DEFAULT_THEME: Theme = {
  display_font: 'Fraunces', body_font: 'Manrope', heading_weight: 500, h_scale: 1, text_scale: 1, radius: 14, button_style: 'pill',
  colors: { teal: '#5EA8A2', teal_deep: '#3F7F7A', teal_mist: '#E4F1EF', maroon: '#5E2230', maroon_soft: '#F3E7E9', gold: '#C8A96E', ink: '#241B1E', ink_soft: '#5C5154', paper: '#FCFAF7', line: '#E6DFDA' },
  logo_url: null, logo_url_light: null, logo_height: 34, show_logo_text: true,
}

export interface StagePage {
  stage: Stage; title: string; tagline: string | null; summary: string | null
  detail_title: string | null; detail_copy: string | null; quick_links: Link[]
  hero_image_url: string | null; featured_article_ids: string[]; sort_order: number; is_active: boolean
  nav_label: string | null; show_in_nav: boolean; show_in_spine: boolean; accent: 'teal' | 'maroon' | 'gold'
}

export interface ProductItem { product_id: string; why?: string; tag?: string }

export interface Band {
  id: string; page: string; kind: string
  eyebrow: string | null; headline: string | null; headline_em: string | null; body: string | null
  risk_text: string | null; learn_eyebrow: string | null; learn_title: string | null; learn_body: string | null
  learn_article_id: string | null; action_links: Link[]; product_items: ProductItem[]
  image_url: string | null; sort_order: number; is_active: boolean; starts_at: string | null; ends_at: string | null
  options: BandOptions
}
export interface BandOptions { speed?: number; show_prices?: boolean; auto_from_category?: string | null; limit?: number; cta_label?: string; cta_href?: string }

export interface Product {
  id: string; name: string; selling_price: number; image_url: string | null
  short_description: string | null; unit: string | null; is_active: boolean
}

export interface Article {
  id: string; slug: string; title: string; excerpt: string | null; body: any; body_html: string | null
  stage: StageOrAll; week_from: number | null; week_to: number | null; month_from: number | null; month_to: number | null
  cover_image_url: string | null; cover_alt: string | null; author_name: string | null
  reviewer_name: string | null; reviewed_at: string | null
  related_product_ids: string[]; related_download_ids: string[]; tags: string[]
  seo_title: string | null; seo_description: string | null; og_image_url: string | null
  reading_minutes: number | null; is_published: boolean; published_at: string | null; view_count: number
  created_at: string; updated_at: string
}

export interface Download {
  id: string; slug: string; title: string; description: string | null; stage: StageOrAll; language: string
  file_url: string | null; file_size_kb: number | null; page_count: number | null; cover_image_url: string | null
  reviewer_name: string | null; whatsapp_message: string | null; download_count: number; sort_order: number; is_active: boolean
}

export interface FoundationProgram { id: string; title: string; summary: string | null; body: string | null; image_url: string | null; sort_order: number; is_active: boolean }
export interface FoundationReport { id: string; title: string; period_label: string | null; file_url: string | null; summary: string | null; published_at: string | null; is_active: boolean }

export interface Lead {
  id: string; phone: string | null; name: string | null; source: string; stage: string | null
  lmp_date: string | null; edd: string | null; download_id: string | null; article_slug: string | null
  message: string | null; consent_whatsapp: boolean; status: string; notes: string | null; created_at: string
}

/* ===== Structured guides ===== */
export type BlockType = 'heading' | 'text' | 'checklist' | 'steps' | 'alert' | 'tip' | 'brand' | 'fill' | 'pagebreak'
export interface GuideItem { label: string; note?: string }
export interface GuideBlock {
  id: string; type: BlockType; width?: 'full' | 'half'; icon?: string | null
  title?: string; eyebrow?: string; body?: string; items?: GuideItem[]
  tone?: 'red' | 'amber' | 'teal'; lines?: number
}
export interface GuideTopic { slug: string; title: string; icon: string | null; description: string | null; sort_order: number; is_active: boolean }
export interface Guide {
  id: string; slug: string; title: string; title_em: string | null; pill: string | null; tagline: string | null; intro: string | null
  stage: string; topic: string | null; series: string | null; series_order: number | null; icon: string | null
  blocks: GuideBlock[]; key_points: string[]; reviewer_name: string | null; reviewed_at: string | null
  related_product_ids: string[]; related_guide_ids: string[]; seo_description: string | null; cover_image_url: string | null
  week_from: number | null; week_to: number | null; download_count: number; view_count: number; sort_order: number
  is_published: boolean; published_at: string | null; created_at: string; updated_at: string
}
export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Section heading (numbered, with icon)', text: 'Paragraph', checklist: 'Checklist (tick boxes)', steps: 'Numbered steps',
  alert: 'Alert box (red = go now, amber = call today)', tip: 'Tip box (teal)', brand: 'Malkia box (maroon, for CTA)', fill: 'Fill-in lines', pagebreak: 'Page break (PDF only)',
}
