export type Page =
  | 'dashboard' | 'vouchers' | 'chart-of-accounts'
  | 'cash-sale' | 'cash-payment' | 'cash-receipt'
  | 'bank-payment' | 'bank-receipt' | 'bank-transfer'
  | 'petty-cash' | 'contra' | 'sales-invoice' | 'proforma' | 'proformas-list' | 'quotation'
  | 'sales-return' | 'debit-note' | 'credit-note'
  | 'purchase-order' | 'grn' | 'purchase' | 'purchase-invoice' | 'purchase-return'
  | 'opening-stock' | 'stock-adjustment' | 'stock-transfer' | 'journal-entry' | 'import-order'
  | 'stock-transfer-request' | 'stock-transfer-approvals'
  | 'internal-use' | 'internal-use-report'
  | 'sales' | 'inventory' | 'reports' | 'pnl'
  | 'sales-register' | 'sales-day-book' | 'sales-invoices-list' | 'trial-balance' | 'balance-sheet'
  | 'ar-aging' | 'ap-aging' | 'stock-valuation'
  | 'purchase-register' | 'payment-register' | 'expense-register' | 'stock-transfer-register' | 'import-register' | 'customers' | 'customer-statement'
  | 'receipt-template' | 'invoice-template'
  | 'whatsapp-settings' | 'location-settings'
  | 'inventory-settings' | 'pricelist-template' | 'proforma-template'
  | 'banks' | 'settings' | 'data-import' | 'coming-soon' | 'bundles'
  | 'stock-levels' | 'suppliers' | 'stock-movements'
  // CRM Module Pages
  | 'crm' | 'crm-hub' | 'crm-inbox' | 'crm-automations' | 'crm-preorders'
  | 'crm-referrals' | 'crm-loyalty' | 'crm-feedback' | 'crm-upsell'
  | 'crm-customers'
  // Settings Pages
  | 'accounting-settings' | 'display-settings' | 'report-templates'
  | 'company-finance-settings' | 'users-access-settings' | 'sales-inventory-settings'
  | 'templates-hub' | 'integrations-settings' | 'regional-backup-settings'
  // User Management & Approvals
  | 'users' | 'approvals' | 'approvals-settings'
  // Investors Module
  | 'investors' | 'investors-hub' | 'investors-portfolio' | 'investors-reports'
  // Bundles
  | 'bundles'
  // HRM Module Pages
  | 'hrm' | 'hrm-employees' | 'hrm-assets' | 'hrm-payroll' | 'hrm-payslips'
  | 'hrm-payslip-template'
  | 'hrm-leave' | 'hrm-attendance' | 'hrm-performance' | 'hrm-recruitment'
  | 'hrm-events' | 'hrm-settings'

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
