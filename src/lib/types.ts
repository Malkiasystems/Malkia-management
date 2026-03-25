export type Page =
  | 'dashboard' | 'vouchers' | 'chart-of-accounts'
  | 'cash-sale' | 'cash-payment' | 'cash-receipt'
  | 'bank-payment' | 'bank-receipt' | 'bank-transfer'
  | 'petty-cash' | 'contra' | 'sales-invoice' | 'quotation'
  | 'sales-return' | 'debit-note' | 'credit-note'
  | 'purchase-order' | 'grn' | 'purchase-invoice' | 'purchase-return'
  | 'opening-stock' | 'stock-adjustment' | 'stock-transfer' | 'journal-entry'
  | 'sales' | 'inventory' | 'reports' | 'pnl' | 'sales-register' | 'sales-day-book' | 'trial-balance' | 'balance-sheet' | 'ar-aging' | 'ap-aging' | 'vat-report' | 'stock-valuation' | 'purchase-register' | 'payment-register' | 'receipt-template' | 'invoice-template'
  | 'purchase-register' | 'payment-register' | 'receipt-template' | 'invoice-template' | 'trial-balance'
  | 'banks' | 'settings' | 'coming-soon' | 'stock-levels' | 'suppliers' | 'stock-movements'

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

export interface Customer {
  name: string
  stage: string
  last: string
  ai: string
  points: number
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
