// ─── Cost & margin visibility ────────────────────────────────────────────────
// One place that decides whether a user may see what a product cost us and what
// we make on it. Every screen that displays either must ask here — a page that
// rolls its own check is how the old inventory_settings.show_cost_to ended up
// reading "admin" while every page ignored it.
//
// Two separate permissions on purpose. Cost and margin leak different things:
// cost exposes supplier pricing and import landed cost, margin exposes how much
// room there is to discount. A buyer needs cost; a salesperson needs neither.
//
// DELIBERATE SCOPE: this governs DISPLAY, not computation. Margin checks in the
// posting path (block_sell_below_cost, warn_below_min_margin) still run on the
// real numbers for every user — hiding a figure must never change what posts.
//
// ALSO DELIBERATE: purchase-side screens (GRN, Purchase, Purchase Invoice,
// Import Order, Opening Stock) still show cost to anyone who can open them,
// because cost is the value being entered there — masking the field you are
// typing into is nonsense. Those pages are gated by their own permissions.
// The line drawn here is: you see cost where you buy, not where you sell.

import { useAuth } from './useAuth'

/** What to render in place of a hidden figure. Not '0' — that reads as real. */
export const HIDDEN = '••••'

export interface CostVisibility {
  canViewCost: boolean
  canViewMargin: boolean
  /** Format a cost figure, or the mask when not permitted. */
  cost: (n: number | null | undefined) => string
  /** Format a margin percentage, or the mask when not permitted. */
  margin: (n: number | null | undefined, suffix?: string) => string
}

export function useCostVisibility(): CostVisibility {
  const { permissions } = useAuth()

  // Matches canAccessPage(): 40+ permissions is treated as super admin
  // everywhere else in the app, so it must mean the same thing here.
  const superAdmin = permissions.length >= 40

  const canViewCost = superAdmin || permissions.includes('inventory.view_cost')
  const canViewMargin = superAdmin || permissions.includes('inventory.view_margin')

  return {
    canViewCost,
    canViewMargin,
    cost: (n) => (canViewCost ? Math.round(n || 0).toLocaleString() : HIDDEN),
    margin: (n, suffix = '%') => (canViewMargin ? `${Math.round(n || 0)}${suffix}` : HIDDEN),
  }
}
