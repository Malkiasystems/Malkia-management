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
//   Opening stock is stock. It goes through the item ledger AND lands in a
//   real bin, exactly like GRN / OpeningStock / Transfer do. A product may
//   be created with zero opening qty and no location (a catalogue entry),
//   but it may NEVER be created with qty > 0 and no location.
//
// Editing a product still never touches qty_on_hand. Stock only moves
// through ledgered vouchers.
// ───────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
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

/** Where the opening quantity physically lands. */
export interface OpeningStockInput {
  qty: number
  location: { id: string; code: string } | null
}

export interface ProductPostResult {
  success: boolean
  productId?: string
  /** Hard failure — nothing usable was created. */
  error?: string
  /** Product exists, but a follow-up step needs attention. */
  warning?: string
}

const today = () => new Date().toISOString().slice(0, 10)

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
  if (qty > 0 && !opening.location) {
    return {
      success: false,
      error: 'Choose a location for the opening quantity. Stock must live in a warehouse, not in limbo.',
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

  // Catalogue-only product. Nothing to place, nothing to ledger.
  if (qty === 0 || !opening.location) {
    return { success: true, productId: product.id }
  }

  const loc = opening.location
  const ref = `OPEN-${payload.sku}`

  const ledger = await postLedgerEntry({
    product_id: product.id,
    entry_type: 'opening_stock',
    document_type: 'opening_stock',
    document_ref: ref,
    posting_date: today(),
    qty,
    cost_amount: payload.cost_price * qty,
    location: { id: loc.id, code: loc.code },
  })

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
      warning: `${payload.name} was created, but the ${qty} units could not be placed at ${loc.code} (${locErr.message}). Post an Opening Stock voucher to fix.`,
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
