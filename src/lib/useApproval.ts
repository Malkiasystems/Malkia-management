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
  
  // Get approval setting for this type
  const { data: settings } = await supabase
    .from('approval_settings')
    .select(`
      id,
      approval_type_id,
      threshold_type,
      threshold_value,
      approval_types!inner (code, name)
    `)
    .eq('approval_types.code', type)
    .single()

  if (!settings) {
    return { requiresApproval: false, approvalType: null, reason: null, threshold: null }
  }

  const setting = settings as any
  const thresholdType = setting.threshold_type
  const thresholdValue = setting.threshold_value

  let requiresApproval = false
  let reason = ''

  if (thresholdType === 'any') {
    requiresApproval = true
    reason = `All ${type.replace(/_/g, ' ')}s require approval`
  } else if (thresholdType === 'amount' && thresholdValue) {
    if (value > thresholdValue) {
      requiresApproval = true
      reason = `Amount TZS ${value.toLocaleString()} exceeds threshold of TZS ${thresholdValue.toLocaleString()}`
    }
  } else if (thresholdType === 'percentage' && thresholdValue && originalValue) {
    const percentage = ((originalValue - value) / originalValue) * 100
    if (percentage > thresholdValue) {
      requiresApproval = true
      reason = `Discount of ${percentage.toFixed(1)}% exceeds threshold of ${thresholdValue}%`
    }
  }

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
  
  const { data: typeData } = await supabase
    .from('approval_types')
    .select('id')
    .eq('code', params.typeCode)
    .single()

  if (!typeData) {
    return { success: false, error: 'Approval type not found' }
  }

  const { data: approvers } = await supabase
    .from('users')
    .select('id')
    .eq('is_approver', true)
    .eq('is_active', true)
    .limit(1)

  const assignedTo = approvers?.[0]?.id || null

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
    return { success: false, error: error.message }
  }

  return { success: true, requestId: data.id }
}

/**
 * Helper to check approval and create request if needed
 * Returns true if voucher can proceed, false if blocked for approval
 */
export async function checkAndRequestApproval(params: {
  type: 'large_sale' | 'discount' | 'refund' | 'stock_adjustment' | 'void_transaction' | 'large_purchase' | 'credit_limit' | 'overdue_invoice'
  value: number
  originalValue?: number
  userId: string
  isApprover: boolean
  referenceType: string
  referenceNumber: string
  summary: string
  onApprovalNeeded: (reason: string) => void
}): Promise<boolean> {
  
  const check = await checkApprovalRequired(params.type, params.value, params.originalValue)
  
  if (!check.requiresApproval) {
    return true // Can proceed
  }
  
  if (params.isApprover) {
    return true // Approvers auto-approve
  }
  
  // Create approval request
  const result = await createApprovalRequest({
    typeCode: params.type,
    referenceType: params.referenceType,
    referenceId: crypto.randomUUID(),
    referenceNumber: params.referenceNumber,
    summary: params.summary,
    originalValue: params.originalValue,
    requestedValue: params.value,
    requestedBy: params.userId,
  })
  
  if (result.success) {
    params.onApprovalNeeded(`${check.reason}. Sent to approver.`)
  } else {
    params.onApprovalNeeded(`Failed to create approval: ${result.error}`)
  }
  
  return false // Cannot proceed
}
