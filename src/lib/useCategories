import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export interface ProductCategory {
  name: string
  group: string
  color: string
  sort_order: number
}

interface UseCategoriesResult {
  categories: ProductCategory[]
  catNames: string[]          // just the names, for dropdowns
  groups: string[]            // unique group names
  catsByGroup: Record<string, ProductCategory[]>
  loading: boolean
  reload: () => void
}

// Default categories with groups -- used when nothing is saved yet
export const DEFAULT_CATEGORIES: ProductCategory[] = [
  { name: 'Breast Pumps',       group: 'Feeding',     color: '#85c2be', sort_order: 1 },
  { name: 'Nursing Accessories',group: 'Feeding',     color: '#85c2be', sort_order: 2 },
  { name: 'Nipple Care',        group: 'Feeding',     color: '#85c2be', sort_order: 3 },
  { name: 'Belly Binders',      group: 'Postpartum',  color: '#f7a6ad', sort_order: 4 },
  { name: 'Scar Care',          group: 'Postpartum',  color: '#f7a6ad', sort_order: 5 },
  { name: 'Perineal Care',      group: 'Postpartum',  color: '#f7a6ad', sort_order: 6 },
  { name: 'Pregnancy Pillows',  group: 'Maternity',   color: '#b8a9e8', sort_order: 7 },
  { name: 'Belly Support',      group: 'Maternity',   color: '#b8a9e8', sort_order: 8 },
  { name: 'Newborn Essentials', group: 'Newborn',     color: '#85c2be', sort_order: 9 },
  { name: 'Baby Skincare',      group: 'Newborn',     color: '#85c2be', sort_order: 10 },
  { name: 'Supplements',        group: 'Health',      color: '#f7a6ad', sort_order: 11 },
  { name: 'Skincare',           group: 'Health',      color: '#f7a6ad', sort_order: 12 },
  { name: 'General',            group: 'Other',       color: '#aaaaaa', sort_order: 13 },
]

export const DEFAULT_GROUPS = ['Feeding', 'Postpartum', 'Maternity', 'Newborn', 'Health', 'Other']

// Module-level cache so multiple components don't re-fetch
let _cache: ProductCategory[] | null = null
let _listeners: (() => void)[] = []
let _loading = false

async function fetchCategories(): Promise<ProductCategory[]> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'product_categories_v2')
    .single()

  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {}
  }

  // Fall back to legacy flat array (old format)
  const { data: legacy } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'product_categories')
    .single()

  if (legacy?.value) {
    try {
      const flat: string[] = JSON.parse(legacy.value)
      if (Array.isArray(flat) && flat.length > 0) {
        // Convert legacy flat list to structured format
        return flat.map((name, i) => ({
          name,
          group: guessGroup(name),
          color: groupColor(guessGroup(name)),
          sort_order: i + 1,
        }))
      }
    } catch {}
  }

  return DEFAULT_CATEGORIES
}

function guessGroup(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('pump') || n.includes('nurs') || n.includes('nipple') || n.includes('feed')) return 'Feeding'
  if (n.includes('binder') || n.includes('scar') || n.includes('post') || n.includes('perineal')) return 'Postpartum'
  if (n.includes('pillow') || n.includes('belly') || n.includes('matern') || n.includes('pregnancy')) return 'Maternity'
  if (n.includes('newborn') || n.includes('baby') || n.includes('infant')) return 'Newborn'
  if (n.includes('supple') || n.includes('vitamin') || n.includes('skin')) return 'Health'
  return 'Other'
}

function groupColor(group: string): string {
  const colors: Record<string, string> = {
    Feeding: '#85c2be', Postpartum: '#f7a6ad', Maternity: '#b8a9e8',
    Newborn: '#85c2be', Health: '#f7a6ad', Other: '#aaaaaa',
  }
  return colors[group] || '#aaaaaa'
}

export function useCategories(): UseCategoriesResult {
  const [categories, setCategories] = useState<ProductCategory[]>(_cache || [])
  const [loading, setLoading] = useState(!_cache)

  const reload = async () => {
    _loading = true
    const cats = await fetchCategories()
    _cache = cats
    _loading = false
    setCategories(cats)
    setLoading(false)
    _listeners.forEach(fn => fn())
  }

  useEffect(() => {
    if (_cache) { setCategories(_cache); setLoading(false); return }
    if (!_loading) reload()

    const listener = () => { if (_cache) setCategories(_cache) }
    _listeners.push(listener)
    return () => { _listeners = _listeners.filter(l => l !== listener) }
  }, [])

  const catNames = categories.map(c => c.name)
  const groups = [...new Set(categories.map(c => c.group))]
  const catsByGroup = groups.reduce((acc, g) => {
    acc[g] = categories.filter(c => c.group === g).sort((a, b) => a.sort_order - b.sort_order)
    return acc
  }, {} as Record<string, ProductCategory[]>)

  return { categories, catNames, groups, catsByGroup, loading, reload }
}

// Helper: invalidate cache (call after saving categories)
export function invalidateCategoryCache() {
  _cache = null
  _listeners.forEach(fn => fn())
}

// Helper: get color for a category name
export function getCategoryColor(categories: ProductCategory[], name: string): string {
  return categories.find(c => c.name === name)?.color || '#aaaaaa'
}

// Helper: get group for a category name
export function getCategoryGroup(categories: ProductCategory[], name: string): string {
  return categories.find(c => c.name === name)?.group || 'Other'
}
