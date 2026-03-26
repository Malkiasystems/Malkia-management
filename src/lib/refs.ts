// ── MALKIA VOUCHER NUMBER SERIES ─────────────────────────────────────────
// Format: PREFIX-BRANCH-SEQUENCE
// Example: CS-10-0001 (Cash Sale, Branch 10, sequence 1)
// 2-letter prefix = sales side, 3-letter prefix = operational/other

import { supabase } from './supabase'

export const VOUCHER_PREFIXES: Record<string, string> = {
  cash_sale:        'CS',
  sales_invoice:    'SI',
  sales_return:     'SR',
  proforma:         'PF',
  credit_note:      'CN',
  debit_note:       'DN',
  cash_payment:     'PAY',
  cash_receipt:     'RCP',
  bank_transfer:    'BNK',
  contra:           'CTR',
  petty_cash:       'PCT',
  purchase_invoice: 'PIP',
  purchase_order:   'PO',
  grn:              'GRN',
  purchase_return:  'PRN',
  stock_transfer:   'STP',
  stock_adjustment: 'ADJ',
  opening_stock:    'OST',
  journal_entry:    'JNL',
}

const DEFAULT_BRANCH = '10'

// Generate next ref from Supabase count — automatic and non-overridable
export const nextRef = async (type: string, branchCode: string = DEFAULT_BRANCH): Promise<string> => {
  const prefix = VOUCHER_PREFIXES[type] || type.toUpperCase().slice(0, 3)
  try {
    const { count } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('type', type)
      .like('ref', `${prefix}-${branchCode}-%`)
    const seq = String((count || 0) + 1).padStart(4, '0')
    return `${prefix}-${branchCode}-${seq}`
  } catch {
    // Fallback using timestamp if Supabase call fails
    const seq = String(Date.now()).slice(-4)
    return `${prefix}-${branchCode}-${seq}`
  }
}

// Sync version for display — generates a preview ref (not final)
export const previewRef = (type: string, branchCode: string = DEFAULT_BRANCH): string => {
  const prefix = VOUCHER_PREFIXES[type] || type.toUpperCase().slice(0, 3)
  return `${prefix}-${branchCode}-????`
}
