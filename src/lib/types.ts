export type Page =
  | 'dashboard' | 'vouchers' | 'chart-of-accounts'
  | 'cash-sale' | 'cash-payment' | 'cash-receipt'
  | 'bank-payment' | 'bank-receipt' | 'bank-transfer'
  | 'petty-cash' | 'contra' | 'sales-invoice' | 'proforma' | 'quotation'
  | 'sales-return' | 'debit-note' | 'credit-note'
  | 'purchase-order' | 'grn' | 'purchase-invoice' | 'purchase-return'
  | 'opening-stock' | 'stock-adjustment' | 'stock-transfer' | 'journal-entry'
  | 'sales' | 'inventory' | 'reports' | 'pnl'
  | 'sales-register' | 'sales-day-book' | 'trial-balance' | 'balance-sheet'
  | 'ar-aging' | 'ap-aging' | 'vat-report' | 'stock-valuation'
  | 'purchase-register' | 'payment-register' | 'stock-transfer-register' | 'customers'
  | 'receipt-template' | 'invoice-template'
  | 'whatsapp-settings' | 'location-settings' | 'accounting-settings'
  | 'inventory-settings' | 'pricelist-template'
  | 'banks' | 'settings' | 'data-import' | 'coming-soon'
  | 'stock-levels' | 'suppliers' | 'stock-movements'
  | 'migration-2026'
  // CRM Pages
  | 'crm' | 'crm-inbox' | 'crm-leads' | 'crm-preorders' | 'crm-feedback'
  | 'crm-loyalty' | 'crm-referrals' | 'crm-segments' | 'crm-messages'
  | 'crm-upsell' | 'crm-automations' | 'crm-settings'

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  cost: number
  price: number
  qty: number
  reorder: number
}

export interface Account {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense' | 'other'
  category: string
  balance: number
}

export interface Supplier {
  id: string
  name: string
  currency: string
  balance: number
}

// Simple customer type for WhatsApp lookup (used in data.ts)
export interface Customer {
  name: string
  stage: string
  last: string
  ai: string
  points: number
}

// Full customer type for database (used in Customers.tsx, CRM)
export interface CustomerRecord {
  id: string
  customer_number: string
  name: string
  company: string
  contact_person: string
  customer_type: 'cash' | 'debtor'
  segment: string
  whatsapp: string
  email: string
  phone: string
  credit_limit: number
  credit_period: number
  payment_terms: string
  balance: number
  crown_points: number
  crown_tier: 'mama' | 'mama_plus' | 'mama_crown'
  referral_code: string
  referred_by: string
  lifetime_value: number
  total_orders: number
  pregnancy_stage: string
  expected_due_date: string
  birthday: string
  is_active: boolean
  last_purchase_date: string
  last_purchase_amount: number
  notes: string
  created_at: string
}

export interface LineItem {
  productId: string
  desc: string
  qty: number
  price: number
  amount: number
}

export interface JournalLine {
  account: string
  dr: number
  cr: number
  desc: string
}

export interface Lead {
  id: string
  name: string
  whatsapp: string
  email: string
  source: string
  product_interest: string
  pregnancy_stage: string
  stage: 'new' | 'contacted' | 'interested' | 'ready_to_buy' | 'converted' | 'lost'
  assigned_to: string
  next_followup: string
  notes: string
  converted_customer_id: string
  converted_at: string
  lost_reason: string
  created_at: string
  updated_at: string
}

export interface PreOrder {
  id: string
  preorder_number: string
  customer_id: string
  status: 'pending_deposit' | 'deposit_paid' | 'ordered' | 'arrived' | 'completed' | 'cancelled'
  deposit_type: 'percentage' | 'fixed'
  deposit_percentage: number
  deposit_fixed: number
  deposit_amount: number
  deposit_paid: number
  deposit_balance: number
  total_amount: number
  expected_arrival: string
  notes: string
  completed_voucher_ref: string
  created_at: string
  updated_at: string
}

export interface Feedback {
  id: string
  customer_id: string
  customer_name: string
  type: 'review' | 'nps' | 'complaint' | 'suggestion'
  rating: number
  nps_score: number
  comment: string
  product_id: string
  product_name: string
  voucher_ref: string
  status: 'new' | 'acknowledged' | 'resolved'
  staff_response: string
  responded_by: string
  responded_at: string
  flagged_for_ugc: boolean
  ugc_permission: boolean
  created_at: string
}

export interface Referral {
  id: string
  referrer_id: string
  referrer_code: string
  referred_name: string
  referred_whatsapp: string
  referred_customer_id: string
  status: 'clicked' | 'signed_up' | 'purchased'
  click_count: number
  signup_at: string
  first_purchase_at: string
  first_purchase_amount: number
  referrer_points_awarded: number
  referred_points_awarded: number
  created_at: string
  updated_at: string
}
