// ════════════════════════════════════════════════════════════════════════════
// stockTransferFlow.ts
//
// Client wrappers for the two-phase stock transfer RPCs (dispatch -> accept).
// Dispatch lives in the StockTransfer page; this module covers the destination
// side: accept, reject (return to source), and the sender's recall (cancel).
// All RPCs are atomic and idempotent server-side.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export interface RpcResult { success: boolean; error?: string; [k: string]: any }

export interface TransferLine { productId: string; qty: number; cost?: number }

export interface TransferRow {
  id: string
  ref: string
  status: string
  from_location_id: string
  to_location_id: string
  lines: TransferLine[]
  total_value: number
  notes: string | null
  requested_by: string | null
  requested_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  rejected_reason: string | null
}

async function call(fn: string, args: Record<string, any>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { success: false, error: error.message }
  return (data as RpcResult) ?? { success: false, error: 'No response' }
}

export const acceptTransfer = (id: string, userId: string) =>
  call('accept_stock_transfer', { p_request_id: id, p_user_id: userId })

export const rejectTransfer = (id: string, userId: string, reason: string) =>
  call('reject_stock_transfer', { p_request_id: id, p_user_id: userId, p_reason: reason })

export const cancelTransfer = (id: string, userId: string) =>
  call('cancel_stock_transfer', { p_request_id: id, p_user_id: userId })

/** Load transfer rows by status. */
export async function loadTransferRows(statuses: string[]): Promise<TransferRow[]> {
  const { data } = await supabase
    .from('stock_transfer_requests')
    .select('id, ref, status, from_location_id, to_location_id, lines, total_value, notes, requested_by, requested_at, accepted_at, rejected_at, rejected_reason')
    .in('status', statuses)
    .order('requested_at', { ascending: false })
    .limit(200)
  return (data || []) as TransferRow[]
}
