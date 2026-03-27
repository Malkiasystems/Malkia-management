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
  | 'whatsapp-settings' | 'location-settings'
  | 'inventory-settings' | 'pricelist-template'
  | 'banks' | 'settings' | 'data-import' | 'coming-soon'
  | 'stock-levels' | 'suppliers' | 'stock-movements' | 'stock-transfer-register' | 'customers'

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
