// ════════════════════════════════════════════════════════════════════════════
// useStockDashboard.ts
//
// Loads the Stock Manager home dashboard, scoped to a single location when one
// is given (the manager's allowed_location_id). When locationId is null the
// figures fall back to global product quantities.
//
// Every query is wrapped defensively. This dashboard is the Stock Manager's
// ENTIRE landing surface, so a single failing query must degrade to a zero/
// empty tile, never crash the page.
//
// QUANTITIES ONLY. This hook never selects or returns cost or price.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import type { StockDashboardData, LowStockItem, RecentReceipt } from './stockDashboardTypes'

interface UseStockDashboardResult {
  data: StockDashboardData | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useStockDashboard(locationId: string | null): UseStockDashboardResult {
  const [data, setData] = useState<StockDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ── Location meta ──────────────────────────────────────────────
      let locationCode: string | null = null
      let locationName: string | null = null
      if (locationId) {
        const { data: loc } = await supabase
          .from('stock_locations')
          .select('code, name')
          .eq('id', locationId)
          .maybeSingle()
        locationCode = loc?.code ?? null
        locationName = loc?.name ?? null
      }

      // ── Product reference (names + reorder points). qty NOT trusted from
      //    here when location-scoped — we use product_locations for that. ──
      const { data: prods } = await supabase
        .from('products')
        .select('id, name, reorder_point, qty_on_hand, is_active')
        .eq('is_active', true)
      const prodMap = new Map<string, { name: string; reorder_point: number; qty_on_hand: number }>()
      for (const p of prods ?? []) {
        prodMap.set(p.id, {
          name: p.name,
          reorder_point: p.reorder_point ?? 0,
          qty_on_hand: p.qty_on_hand ?? 0,
        })
      }

      // ── Stock on hand (units only) ─────────────────────────────────
      let totalSkus = 0
      let totalUnits = 0
      let outOfStockCount = 0
      const lowStockItems: LowStockItem[] = []

      if (locationId) {
        const { data: pls } = await supabase
          .from('product_locations')
          .select('product_id, qty_on_hand')
          .eq('location_id', locationId)
        for (const pl of pls ?? []) {
          const p = prodMap.get(pl.product_id)
          if (!p) continue
          const qty = pl.qty_on_hand ?? 0
          totalUnits += qty
          totalSkus += 1
          if (qty <= 0) outOfStockCount += 1
          if (qty <= p.reorder_point) {
            lowStockItems.push({ productId: pl.product_id, name: p.name, qty, reorderPoint: p.reorder_point })
          }
        }
      } else {
        for (const [id, p] of prodMap) {
          const qty = p.qty_on_hand
          totalUnits += qty
          totalSkus += 1
          if (qty <= 0) outOfStockCount += 1
          if (qty <= p.reorder_point) {
            lowStockItems.push({ productId: id, name: p.name, qty, reorderPoint: p.reorder_point })
          }
        }
      }
      lowStockItems.sort((a, b) => a.qty - b.qty)
      const lowStockCount = lowStockItems.length

      // ── Pending transfer requests ──────────────────────────────────
      let pendingTransfersIn = 0
      let pendingTransfersOut = 0
      if (locationId) {
        const inRes = await supabase
          .from('stock_transfer_requests')
          .select('id', { count: 'exact', head: true })
          .eq('to_location_id', locationId)
          .eq('status', 'pending')
        pendingTransfersIn = inRes.count ?? 0

        const outRes = await supabase
          .from('stock_transfer_requests')
          .select('id', { count: 'exact', head: true })
          .eq('from_location_id', locationId)
          .eq('status', 'pending')
        pendingTransfersOut = outRes.count ?? 0
      } else {
        const allRes = await supabase
          .from('stock_transfer_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
        pendingTransfersIn = allRes.count ?? 0
      }

      // ── Recent receipts (GRNs) at this location ────────────────────
      // GRN posts item_ledger_entries with document_type='grn'. We group the
      // lines by document_ref to show one row per GRN.
      let ledgerQuery = supabase
        .from('item_ledger_entries')
        .select('document_ref, posting_date, qty')
        .eq('document_type', 'grn')
        .order('posting_date', { ascending: false })
        .limit(80)
      if (locationId) ledgerQuery = ledgerQuery.eq('location_id', locationId)
      const { data: led } = await ledgerQuery

      const grouped = new Map<string, RecentReceipt>()
      for (const e of led ?? []) {
        const ref: string = e.document_ref ?? '—'
        const existing = grouped.get(ref)
        if (existing) {
          existing.totalQty += e.qty ?? 0
          existing.lineCount += 1
          if ((e.posting_date ?? '') > existing.date) existing.date = e.posting_date
        } else {
          grouped.set(ref, { ref, date: e.posting_date ?? '', totalQty: e.qty ?? 0, lineCount: 1 })
        }
      }
      const recentReceipts = Array.from(grouped.values())
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)

      setData({
        locationId,
        locationCode,
        locationName,
        isLocationScoped: !!locationId,
        totalSkus,
        totalUnits,
        lowStockCount,
        outOfStockCount,
        lowStockItems: lowStockItems.slice(0, 8),
        pendingTransfersIn,
        pendingTransfersOut,
        recentReceipts,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load stock dashboard'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load }
}
