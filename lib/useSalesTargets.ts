import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export interface TargetAllocation {
  id?: string
  target_id?: string
  /** Display label, e.g. "Rahim" or "Retail team". */
  name: string
  /** One id = individual; several = a group sharing one number. */
  employee_ids: string[]
  /** In the PARENT's metric and canonical unit (units metric = PIECES). */
  target_value: number
  sort_order?: number
}

export interface SalesTarget {
  id: string
  name: string
  period_type: 'annual' | 'quarterly' | 'monthly'
  metric: 'revenue' | 'units'
  target_value: number
  product_id: string | null
  category: string | null
  salesperson_id: string | null
  start_date: string
  end_date: string
  is_active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  allocations?: TargetAllocation[]
}

export interface TargetProgress {
  target: SalesTarget
  current: number
  percentage: number
  remaining: number
  daysElapsed: number
  daysTotal: number
  daysLeft: number
  dailyRunRate: number
  requiredDailyRate: number
  projectedTotal: number
  onTrack: boolean
}

export function useSalesTargets() {
  const [targets, setTargets] = useState<SalesTarget[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sales_targets')
      .select('*, allocations:sales_target_allocations(id, target_id, name, employee_ids, target_value, sort_order)')
      .order('is_active', { ascending: false })
      .order('start_date', { ascending: false })
    if (data) setTargets((data as any[]).map(t => ({
      ...t,
      allocations: (t.allocations || []).sort((a: TargetAllocation, b: TargetAllocation) => (a.sort_order || 0) - (b.sort_order || 0)),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /** Replace a target's allocations wholesale (delete + reinsert). */
  const saveAllocations = async (targetId: string, allocs: TargetAllocation[]) => {
    const { error: delErr } = await supabase.from('sales_target_allocations').delete().eq('target_id', targetId)
    if (delErr) return { success: false, error: delErr.message }
    if (allocs.length > 0) {
      const rows = allocs.map((a, i) => ({
        target_id: targetId, name: a.name, employee_ids: a.employee_ids,
        target_value: a.target_value, sort_order: i,
      }))
      const { error: insErr } = await supabase.from('sales_target_allocations').insert(rows)
      if (insErr) return { success: false, error: insErr.message }
    }
    await load()
    return { success: true }
  }

  const create = async (t: Omit<SalesTarget, 'id' | 'created_at' | 'allocations'>) => {
    const { data, error } = await supabase.from('sales_targets').insert(t).select('id').single()
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true, id: (data as any)?.id as string | undefined }
  }

  const update = async (id: string, t: Partial<SalesTarget>) => {
    const { error } = await supabase.from('sales_targets').update(t).eq('id', id)
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from('sales_targets').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  const toggle = async (id: string, active: boolean) => {
    return update(id, { is_active: active })
  }

  return { targets, loading, load, create, update, remove, toggle, activeTargets: targets.filter(t => t.is_active), saveAllocations }
}

/**
 * Calculate progress for a single target against actual sales data.
 * Pass in the actual achieved value (revenue or units) from voucher queries.
 */
export function calcTargetProgress(target: SalesTarget, currentValue: number): TargetProgress {
  const today = new Date()
  const start = new Date(target.start_date)
  const end = new Date(target.end_date)

  const totalMs = end.getTime() - start.getTime()
  const elapsedMs = Math.max(0, Math.min(today.getTime() - start.getTime(), totalMs))
  const daysTotal = Math.max(1, Math.ceil(totalMs / 86400000))
  const daysElapsed = Math.max(1, Math.ceil(elapsedMs / 86400000))
  const daysLeft = Math.max(0, daysTotal - daysElapsed)

  const percentage = Math.min(100, (currentValue / target.target_value) * 100)
  const remaining = Math.max(0, target.target_value - currentValue)
  const dailyRunRate = currentValue / daysElapsed
  const requiredDailyRate = daysLeft > 0 ? remaining / daysLeft : remaining > 0 ? Infinity : 0
  const projectedTotal = dailyRunRate * daysTotal
  const onTrack = projectedTotal >= target.target_value

  return {
    target,
    current: currentValue,
    percentage,
    remaining,
    daysElapsed,
    daysTotal,
    daysLeft,
    dailyRunRate,
    requiredDailyRate,
    projectedTotal,
    onTrack,
  }
}
