import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export interface ProductCategory {
  id?: string
  name: string
  color: string
  sort_order: number
}

interface UseCategoriesResult {
  categories: ProductCategory[]
  catNames: string[]
  loading: boolean
  reload: () => void
  addCategory: (name: string, color?: string) => Promise<ProductCategory | null>
}

// Module-level cache
let _cache: ProductCategory[] | null = null
let _listeners: (() => void)[] = []
let _loading = false

async function fetchCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, color, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }

  return data || []
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

  const addCategory = async (name: string, color?: string): Promise<ProductCategory | null> => {
    // Check if already exists
    const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing

    const newCat = {
      name: name.trim(),
      color: color || '#85c2be',
      sort_order: categories.length + 1,
    }

    const { data, error } = await supabase
      .from('categories')
      .insert(newCat)
      .select('id, name, color, sort_order')
      .single()

    if (error) {
      console.error('Error adding category:', error)
      return null
    }

    // Update cache
    _cache = [...(categories), data]
    setCategories(_cache)
    _listeners.forEach(fn => fn())

    return data
  }

  const catNames = categories.map(c => c.name)

  return { categories, catNames, loading, reload, addCategory }
}

// Helper: invalidate cache
export function invalidateCategoryCache() {
  _cache = null
  _listeners.forEach(fn => fn())
}

// Helper: get color for a category name
export function getCategoryColor(categories: ProductCategory[], name: string): string {
  return categories.find(c => c.name === name)?.color || '#85c2be'
}
