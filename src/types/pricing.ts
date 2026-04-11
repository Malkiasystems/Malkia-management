// ============================================
// MALKIA PRICING SYSTEM — Types
// ============================================

export type ProductCategory = 
  | 'breast_care' 
  | 'belly_care' 
  | 'comfort' 
  | 'skincare' 
  | 'nutrition' 
  | 'kits'
  | 'accessories'

export type ProductBadge = 'best_seller' | 'new' | 'rain_maker' | null

export type PriceTier = 'retail' | 'wholesale'

export interface Product {
  id: string
  name: string
  name_sw?: string           // Swahili name
  description: string
  category: ProductCategory
  sku: string
  badge: ProductBadge
  retail_price: number       // TZS
  wholesale_price: number    // TZS
  cost_price: number         // TZS — for margin calc (admin only)
  moq: number                // Minimum Order Quantity (wholesale)
  unit: string               // e.g., "pc", "box", "set"
  in_stock: boolean
  image_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Bundle {
  id: string
  name: string
  name_sw?: string
  description: string
  badge: ProductBadge
  retail_price: number       // Bundle retail price (should be less than sum)
  wholesale_price: number    // Bundle wholesale price
  items: BundleItem[]
  image_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BundleItem {
  product_id: string
  quantity: number
}

export interface CustomerPriceTier {
  customer_id: string
  customer_name: string
  phone: string
  tier: PriceTier
  assigned_at: string
  assigned_by: string
  notes?: string
}

export interface PriceHistory {
  id: string
  product_id: string
  field: 'retail_price' | 'wholesale_price'
  old_value: number
  new_value: number
  changed_by: string
  changed_at: string
}

export interface PricelistConfig {
  tier: PriceTier
  include_bundles: boolean
  show_images: boolean
  show_descriptions: boolean
  valid_until: string          // ISO date
  whatsapp_number: string
  custom_note: string
  categories: ProductCategory[] // which categories to include
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  breast_care: 'Breast Care',
  belly_care: 'Belly & Recovery',
  comfort: 'Comfort & Support',
  skincare: 'Skin Care',
  nutrition: 'Nutrition & Supplements',
  kits: 'Malkia Kits',
  accessories: 'Accessories',
}

export const CATEGORY_LABELS_SW: Record<ProductCategory, string> = {
  breast_care: 'Huduma ya Maziwa',
  belly_care: 'Tumbo na Kupona',
  comfort: 'Starehe na Msaada',
  skincare: 'Huduma ya Ngozi',
  nutrition: 'Lishe na Virutubishi',
  kits: 'Vifurushi vya Malkia',
  accessories: 'Vifaa',
}

export const BADGE_LABELS: Record<string, { label: string; color: string }> = {
  best_seller: { label: 'Best Seller', color: '#B87A50' },
  new: { label: 'New', color: '#6B8E6B' },
  rain_maker: { label: 'Rain Maker', color: '#8B2252' },
}
