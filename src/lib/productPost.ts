// ─── Product Posting ───────────────────────────────────────────────────────
// Mutation logic for creating and updating products. Mirrors cashSalePost.ts.
//
// Why this file exists:
//   Inventory.tsx used to insert straight into `products` with an opening
//   qty and nothing else. That left the product with a global qty_on_hand
//   but ZERO rows in product_locations, so it vanished from every location
//   filter and showed no per-location breakdown. Worse, once any location
//   row later appeared, the products→locations sync recomputed
//   qty_on_hand = SUM(locations) and the opening qty was silently lost.
//
// Rule enforced here:
//   Every product lands in a real bin. Always. Even at qty 0.
//   A bin row at qty 0 means "stocked here, currently empty" and renders as
//   Out of Stock under that location filter. NO bin row means the product is
//   invisible under every location filter — which is the bug this file exists
//   to prevent. So the location picker is mandatory, and a product_locations
//   row is written on every create.
//
//   When qty > 0 we also post an opening_stock ledger entry. At qty 0 nothing
//   moved, so no ledger entry is written.
//
// Editing a product still never touches qty_on_hand. Stock only moves
// through ledgered vouchers.
// ───────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import { localIso } from './utils'
import { postLedgerEntry } from './itemLedger'

export interface ProductPayload {
  sku: string
  name: string
  category: string
  unit: string
  cost_price: number
  selling_price: number
  reorder_point: number
  costing_method?: string
  is_active?: boolean
}

/** Where the product lands. Location is MANDATORY, qty may be zero. */
export interface OpeningStockInput {
  qty: number
  location: { id: string; code: string }
}

export interface ProductPostResult {
  success: boolean
  productId?: string
  /** Hard failure — nothing usable was created. */
  error?: string
  /** Product exists, but a follow-up step needs attention. */
  warning?: string
}

const today = () => localIso(new Date())

/**
 * Create a product and, when an opening qty is given, place that stock at a
 * real location with a matching item_ledger_entries row.
 *
 * Sequence (order matters):
 *   1. insert products (qty_on_hand = opening qty)
 *   2. postLedgerEntry(opening_stock)          — audit trail
 *   3. upsert product_locations                — the bin balance
 *
 * If a products→locations sync trigger exists, step 3 recomputes
 * qty_on_hand = SUM(locations) = opening qty. Same answer either way.
 */
export async function createProduct(
  payload: ProductPayload,
  opening: OpeningStockInput
): Promise<ProductPostResult> {
  const qty = Number(opening.qty) || 0

  if (qty < 0) {
    return { success: false, error: 'Opening quantity cannot be negative.' }
  }
  if (!opening.location?.id || !opening.location?.code) {
    return {
      success: false,
      error: 'Choose a location. Every product must be stocked at a warehouse, even with zero opening quantity.',
    }
  }

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      ...payload,
      costing_method: payload.costing_method ?? 'average',
      is_active: payload.is_active ?? true,
      qty_on_hand: qty,
    })
    .select('id')
    .single()

  if (error || !product) {
    return { success: false, error: error?.message || 'Product could not be created.' }
  }

  const loc = opening.location
  const ref = `OPEN-${payload.sku}`

  // Ledger only records movement. At qty 0 nothing moved, so nothing to post.
  const ledger = qty > 0
    ? await postLedgerEntry({
        product_id: product.id,
        entry_type: 'opening_stock',
        document_type: 'opening_stock',
        document_ref: ref,
        posting_date: today(),
        qty,
        cost_amount: payload.cost_price * qty,
        location: { id: loc.id, code: loc.code },
      })
    : { success: true as const }

  // Always written, even at qty 0. This is the row that makes the product
  // visible under a location filter.
  const { error: locErr } = await supabase.from('product_locations').upsert(
    {
      product_id: product.id,
      location_id: loc.id,
      location_code: loc.code,
      qty_on_hand: qty,
      last_updated: new Date().toISOString(),
    },
    { onConflict: 'product_id,location_id' }
  )

  if (locErr) {
    return {
      success: true,
      productId: product.id,
      warning: `${payload.name} was created, but it could not be stocked at ${loc.code} (${locErr.message}). It will not appear under any location filter. Post an Opening Stock voucher to fix.`,
    }
  }

  if (!ledger.success) {
    return {
      success: true,
      productId: product.id,
      warning: `${payload.name} was created and stock placed at ${loc.code}, but the ledger entry failed (${ledger.error}). The movement will not show in Stock Movements.`,
    }
  }

  return { success: true, productId: product.id }
}

/**
 * Update a product's master data. qty_on_hand is deliberately absent from the
 * payload type — stock only moves through ledgered vouchers.
 */
export async function updateProduct(
  productId: string,
  payload: ProductPayload
): Promise<ProductPostResult> {
  const { error } = await supabase.from('products').update(payload).eq('id', productId)
  if (error) return { success: false, error: error.message }
  return { success: true, productId }
}
