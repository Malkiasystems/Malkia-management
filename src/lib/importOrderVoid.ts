// ════════════════════════════════════════════════════════════════════════════
// importOrderVoid.ts
//
// MW-DB-23. Mutation layer for voiding an import order that already has posted
// payments. Wraps the void_import_payment RPC from migration 036.
//
// Everything money-shaped happens inside the RPC, in one transaction. Nothing
// in this file writes a balance, a ledger row or a journal directly. That is
// the point: the old inline void handler in ImportOrder.tsx wrote all three
// from the client, in sequence, with no rollback and no error checks.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export interface ImportPaymentToReverse {
  journal_id: string | null
  amount_tzs: number
  payment_type: string
  agent_name: string | null
}

export interface ReversalOutcome {
  journalId: string
  ok: boolean
  reversalRef?: string
  error?: string
}

export interface VoidImportOrderResult {
  success: boolean
  reversed: ReversalOutcome[]
  failed: ReversalOutcome[]
  error?: string
}

/**
 * Resolve which supplier a payment should be credited back to.
 * Supplier deposits and balance payments go to the order's supplier.
 * Agent payments go to the named agent, matched by supplier name.
 */
export const resolveReversalSupplier = (
  pmt: ImportPaymentToReverse,
  orderSupplierId: string | null,
  suppliers: Array<{ id: string; name: string }>,
): string | null => {
  if (pmt.payment_type === 'supplier_deposit' || pmt.payment_type === 'supplier_balance') {
    return orderSupplierId
  }
  if (!pmt.agent_name) return null
  return suppliers.find(s => s.name === pmt.agent_name)?.id ?? null
}

/**
 * Reverse every posted payment on an import order.
 *
 * Each payment is reversed in its own transaction inside the RPC. If one fails
 * the others are unaffected and already-reversed ones are NOT rolled back, so
 * the caller must surface the failed list rather than assuming all-or-nothing
 * across the set. Re-running is safe: the RPC refuses a second reversal of the
 * same journal.
 */
export const reverseImportPayments = async (
  payments: ImportPaymentToReverse[],
  orderSupplierId: string | null,
  suppliers: Array<{ id: string; name: string }>,
  postedBy: string,
  orderRef: string,
): Promise<VoidImportOrderResult> => {
  const reversed: ReversalOutcome[] = []
  const failed: ReversalOutcome[] = []

  for (const pmt of payments) {
    if (!pmt.journal_id) continue

    const supplierId = resolveReversalSupplier(pmt, orderSupplierId, suppliers)

    const { data, error } = await supabase.rpc('void_import_payment', {
      p_journal_id:  pmt.journal_id,
      p_supplier_id: supplierId,
      // Original entry wrote amount_tzs = -amount, so the reversal is +amount.
      p_amount_tzs:  Math.abs(pmt.amount_tzs),
      p_posted_by:   postedBy,
      p_reason:      `Import order ${orderRef} voided`,
    })

    if (error) {
      failed.push({ journalId: pmt.journal_id, ok: false, error: error.message })
      continue
    }

    const res = data as { success: boolean; reversal_ref?: string; error?: string } | null

    if (res?.success) {
      reversed.push({ journalId: pmt.journal_id, ok: true, reversalRef: res.reversal_ref })
    } else {
      failed.push({ journalId: pmt.journal_id, ok: false, error: res?.error || 'Reversal failed' })
    }
  }

  return {
    success: failed.length === 0,
    reversed,
    failed,
    error: failed.length > 0
      ? `${failed.length} of ${reversed.length + failed.length} payment(s) could not be reversed`
      : undefined,
  }
}
