import { supabase } from './supabase'

interface ApprovalCheck {
  requiresApproval: boolean
  approvalType: string | null
  reason: string | null
  threshold: number | null
}

/**
 * Check if a transaction requires approval based on configured rules
 */
export async function checkApprovalRequired(
  type: 'large_sale' | 'discount' | 'refund' | 'stock_adjustment' | 'void_transaction' | 'large_purchase' | 'credit_limit' | 'overdue_invoice',
  value: number,
  originalValue?: number
): Promise<ApprovalCheck> {
  
  // First get the approval type id
  const { data: typeData } = await supabase
    .from('approval_types')
    .select('id')
    .eq('code', type)
    .single()

  if (!typeData) {
    console.log('No approval type found for:', type)
    return { requiresApproval: false, approvalType: null, reason: null, threshold: null }
  }

  // Then get the setting for this type
  const { data: settings } = await supabase
    .from('approval_settings')
    .select('threshold_type, threshold_value')
    .eq('approval_type_id', typeData.id)
    .single()

  if (!settings) {
    console.log('No approval setting found for type:', type)
    return { requiresApproval: false, approvalType: null, reason: null, threshold: null }
  }

  const thresholdType = settings.threshold_type
  const thresholdValue = settings.threshold_value

  console.log('Approval check:', { type, value, thresholdType, thresholdValue })

  let requiresApproval = false
  let reason = ''

  if (thresholdType === 'any') {
    requiresApproval = true
    reason = `All ${type.replace(/_/g, ' ')}s require approval`
  } else if (thresholdType === 'amount' && thresholdValue !== null) {
    if (value > thresholdValue) {
      requiresApproval = true
      reason = `Amount TZS ${value.toLocaleString()} exceeds threshold of TZS ${thresholdValue.toLocaleString()}`
    }
  } else if (thresholdType === 'percentage' && thresholdValue !== null && originalValue) {
    const percentage = ((originalValue - value) / originalValue) * 100
    if (percentage > thresholdValue) {
      requiresApproval = true
      reason = `Discount of ${percentage.toFixed(1)}% exceeds threshold of ${thresholdValue}%`
    }
  }

  console.log('Approval result:', { requiresApproval, reason })

  return {
    requiresApproval,
    approvalType: requiresApproval ? type : null,
    reason: requiresApproval ? reason : null,
    threshold: thresholdValue,
  }
}

/**
 * Create an approval request
 */
export async function createApprovalRequest(params: {
  typeCode: string
  referenceType: string
  referenceId: string
  referenceNumber: string
  summary: string
  originalValue?: number
  requestedValue?: number
  requestedBy: string
}): Promise<{ success: boolean; requestId?: string; error?: string }> {
  
  // Get the approval type id
  const { data: typeData } = await supabase
    .from('approval_types')
    .select('id')
    .eq('code', params.typeCode)
    .single()

  if (!typeData) {
    return { success: false, error: 'Approval type not found' }
  }

  // Find an approver (get the first user with is_approver = true)
  const { data: approvers } = await supabase
    .from('users')
    .select('id')
    .eq('is_approver', true)
    .eq('is_active', true)
    .limit(1)

  const assignedTo = approvers?.[0]?.id || null

  // Create the request
  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      approval_type_id: typeData.id,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      reference_number: params.referenceNumber,
      request_summary: params.summary,
      original_value: params.originalValue,
      requested_value: params.requestedValue,
      requested_by: params.requestedBy,
      assigned_to: assignedTo,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('Approval request error:', error)
    return { success: false, error: error.message }
  }

  return { success: true, requestId: data.id }
}
