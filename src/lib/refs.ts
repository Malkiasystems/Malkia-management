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
  import_order:     'IMP',
}

const DEFAULT_BRANCH = '10'

// Generate next ref — uses MAX existing sequence to avoid duplicates
export const nextRef = async (type: string, branchCode: string = DEFAULT_BRANCH): Promise<string> => {
  const prefix = VOUCHER_PREFIXES[type] || type.toUpperCase().slice(0, 3)
  const pattern = `${prefix}-${branchCode}-`
  try {
    // Get all refs matching this pattern and find the max sequence number
    const { data } = await supabase
      .from('vouchers')
      .select('ref')
      .like('ref', `${pattern}%`)
      .order('ref', { ascending: false })
      .limit(1)
    
    let nextSeq = 1
    if (data && data.length > 0) {
      const lastRef = data[0].ref as string
      const lastSeq = parseInt(lastRef.replace(pattern, '')) || 0
      nextSeq = lastSeq + 1
    }
    return `${pattern}${String(nextSeq).padStart(4, '0')}`
  } catch {
    // Fallback using timestamp if Supabase call fails
    const seq = String(Date.now()).slice(-4)
    return `${pattern}${seq}`
  }
}

// Sync version for display — generates a preview ref (not final)
export const previewRef = (type: string, branchCode: string = DEFAULT_BRANCH): string => {
  const prefix = VOUCHER_PREFIXES[type] || type.toUpperCase().slice(0, 3)
  return `${prefix}-${branchCode}-????`
}
