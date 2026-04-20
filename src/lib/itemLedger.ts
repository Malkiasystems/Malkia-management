// ─── Item Ledger Helper ────────────────────────────────────────────────────
// Single source of truth for writing to item_ledger_entries.
//
// Why this exists: before this helper, 11 places in the codebase inserted
// into item_ledger_entries independently. Each one had slightly different
// field sets — some skipped location_code, some skipped location_id. That
// inconsistency is what caused the "168 pieces but 0 movements" bug on the
// U-Shape Pillow (see: DataImport + OpeningStock + StockAdjustment).
//
// Rule: NEVER call supabase.from('item_ledger_entries').insert(...) directly.
// Always go through postLedgerEntry() or postLedgerEntries() in this file.
// ─────────────────────────────────────────────────────────────────────────── 

import { supabase } from './supabase'

export type LedgerEntryType =
  | 'sale'
  | 'purchase'
  | 'grn'
  | 'return'                // sales return (stock coming back in)
  | 'purchase_return'       // stock going back to supplier
  | 'opening_stock'
  | 'positive_adjustment'
  | 'negative_adjustment'
  | 'write_off'
  | 'transfer_in'
  | 'transfer_out'

export type LedgerDocumentType =
  | 'cash_sale'
  | 'sales_invoice'
  | 'grn'
  | 'credit_note'
  | 'sales_return'
  | 'purchase_return'
  | 'stock_transfer'
  | 'stock_adjustment'
  | 'opening_stock'
  | 'data_import'
  | 'backfill'

export interface LedgerEntryInput {
  product_id: string
  entry_type: LedgerEntryType
  document_type: LedgerDocumentType
  document_ref: string
  posting_date: string        // YYYY-MM-DD
  qty: number                 // positive = stock in, negative = stock out
  cost_amount: number         // always positive (absolute value of the cost moved)

  // Location is STRONGLY RECOMMENDED. Omit only for legacy-compatible calls
  // that genuinely have no location context (there should be none of these
  // in a healthy codebase).
  location_code?: string | null
  location_id?: string | null

  // Optional resolver: if you only have one of (code, id), pass the locations
  // array and the helper will fill in the other field for you. This is the
  // preferred way to call from a voucher — pass the loc object once, done.
  location?: { id: string; code: string } | null
}

export interface LedgerPostResult {
  success: boolean
  error?: string
}

/**
 * Post a single item ledger entry.
 *
 * Enforces:
 *   - Required fields are present.
 *   - location_code and location_id stay in sync when a `location` object
 *     is provided (prevents the "one but not the other" class of bug).
 *   - cost_amount is non-negative.
 *   - posting_date looks like a date.
 *
 * Logs warnings (not throws) when location is omitted entirely, so you
 * can see in the console which call sites still need fixing without
 * breaking production.
 */
export async function postLedgerEntry(input: LedgerEntryInput): Promise<LedgerPostResult> {
  const row = normalize(input)
  const validationError = validate(row)
  if (validationError) {
    console.error('[ledger] validation failed:', validationError, row)
    return { success: false, error: validationError }
  }

  const { error } = await supabase.from('item_ledger_entries').insert(row)
  if (error) {
    console.error('[ledger] insert failed:', error.message, row)
    return { success: false, error: error.message }
  }
  return { success: true }
}

/**
 * Post multiple ledger entries in a single round-trip. Atomic from the
 * Supabase side — either all rows go in or none do.
 */
export async function postLedgerEntries(inputs: LedgerEntryInput[]): Promise<LedgerPostResult> {
  if (inputs.length === 0) return { success: true }

  const rows = inputs.map(normalize)
  for (const row of rows) {
    const validationError = validate(row)
    if (validationError) {
      console.error('[ledger] batch validation failed:', validationError, row)
      return { success: false, error: validationError }
    }
  }

  const { error } = await supabase.from('item_ledger_entries').insert(rows)
  if (error) {
    console.error('[ledger] batch insert failed:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface NormalizedRow {
  product_id: string
  entry_type: LedgerEntryType
  document_type: LedgerDocumentType
  document_ref: string
  posting_date: string
  qty: number
  cost_amount: number
  location_code: string | null
  location_id: string | null
}

function normalize(input: LedgerEntryInput): NormalizedRow {
  // Resolve location: if caller passed a `location` object, use it as the
  // source of truth. Otherwise fall back to whatever they passed directly.
  // This is the layer that prevents "code set but id null" drift.
  const locCode = input.location?.code ?? input.location_code ?? null
  const locId   = input.location?.id   ?? input.location_id   ?? null

  return {
    product_id:    input.product_id,
    entry_type:    input.entry_type,
    document_type: input.document_type,
    document_ref:  input.document_ref,
    posting_date:  input.posting_date,
    qty:           input.qty,
    cost_amount:   Math.abs(input.cost_amount),  // always stored positive
    location_code: locCode,
    location_id:   locId,
  }
}

function validate(row: NormalizedRow): string | null {
  if (!row.product_id)    return 'product_id is required'
  if (!row.entry_type)    return 'entry_type is required'
  if (!row.document_type) return 'document_type is required'
  if (!row.document_ref)  return 'document_ref is required'
  if (!row.posting_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.posting_date)) {
    return `posting_date must be YYYY-MM-DD, got: ${row.posting_date}`
  }
  if (typeof row.qty !== 'number' || !isFinite(row.qty) || row.qty === 0) {
    return 'qty must be a non-zero number'
  }
  if (typeof row.cost_amount !== 'number' || !isFinite(row.cost_amount) || row.cost_amount < 0) {
    return 'cost_amount must be a non-negative number'
  }

  // Soft warning: if location is entirely missing. Don't block the post —
  // there may be legitimate edge cases (e.g. pure journal reversals) — but
  // make it loud enough to notice in dev tools.
  if (!row.location_code && !row.location_id) {
    console.warn(
      '[ledger] posting entry without location. ' +
      `product=${row.product_id} type=${row.entry_type} ref=${row.document_ref}. ` +
      'This entry will not appear under any location filter.'
    )
  }

  // Hard rule: if one of (code, id) is set, the other should be too.
  // Otherwise downstream queries that join on location_id will miss rows
  // that only have location_code, and vice versa.
  if (Boolean(row.location_code) !== Boolean(row.location_id)) {
    console.warn(
      '[ledger] partial location: one of (code, id) is set but not the other. ' +
      `code=${row.location_code} id=${row.location_id}. ` +
      'Pass a full {id, code} object via the `location` param to avoid this.'
    )
  }

  return null
}
