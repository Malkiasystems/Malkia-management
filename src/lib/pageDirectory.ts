// ════════════════════════════════════════════════════════════════════════════
// pageDirectory.ts
//
// Single source of truth for what the global search can jump to. Built from the
// real breadcrumb labels (lib/data BREADCRUMBS) plus the CRM/HRM/Settings screens
// so search covers the WHOLE app, not a hand-picked subset. Previously the
// search only knew ~21 pages, so anything else (transfers, GRN, payroll, CRM
// screens, registers) returned nothing.
// ════════════════════════════════════════════════════════════════════════════

import type { Page } from './types'
import { BREADCRUMBS } from './data'

// Screens that live outside the base BREADCRUMBS map (CRM, HRM, Settings, etc.).
const EXTENDED_LABELS: Record<string, string> = {
  'crm-hub': 'CRM Hub',
  'crm-command-center': 'CRM Command Center',
  'crm-inbox': 'CRM Inbox',
  'crm-automations': 'CRM Automations',
  'crm-preorders': 'CRM Pre-Orders',
  'crm-referrals': 'CRM Referrals',
  'crm-loyalty': 'Crown Rewards',
  'crm-feedback': 'CRM Feedback',
  'crm-upsell': 'Upsell Engine',
  'crm-whatsapp-templates': 'WhatsApp Templates',
  'crm-whatsapp-resources': 'CRM Resources',
  'crm-waiting-list': 'Waiting List',
  'cash-center': 'Cash Center',
  'cash-flow': 'Cash Flow Statement',
  'ledger-health': 'Ledger Health',
  'product-profit': 'Product Profitability',
  'ar-followup': 'AR Follow-up',
  'day-close': 'Day Close',
  'users': 'User Management',
  'approvals': 'Approval Workflows',
  'approvals-settings': 'Approval Rules',
  'accounting-settings': 'Accounting Settings',
  'display-settings': 'Display Settings',
  'report-templates': 'Report Templates',
  'investors-hub': 'Investors Hub',
  'purchase': 'Purchase',
  'internal-use': 'Internal Use',
  'internal-use-report': 'Internal Use Report',
  'stock-dashboard': 'Stock Home',
  'hrm': 'HR Dashboard',
  'hrm-employees': 'Employees',
  'hrm-assets': 'Asset Allocation',
  'hrm-payroll': 'Payroll',
  'hrm-payslips': 'Payslips',
  'hrm-payslip-template': 'Payslip Template',
  'hrm-leave': 'Leave',
  'hrm-attendance': 'Attendance',
  'hrm-performance': 'Performance',
  'hrm-kpi': 'KPI Scorecards',
  'hrm-recruitment': 'Recruitment',
  'hrm-events': 'Events',
  'audit-trail': 'Audit Trail',
  'bank-opening-balance': 'Bank Opening Balances',
  'loans': 'Loans',
  'new-loan': 'New Loan',
  'opening-loans': 'Opening Loans',
  'loan-repayment': 'Loan Repayment',
  'attendance-kiosk': 'Attendance Kiosk (shop screen)',
  'attendance-checkin': 'Check In / Out',
  'bank-payment': 'Bank Payment',
  'cash-receipt': 'Cash Receipt',
  'company-branding': 'Company Branding',
  'company-finance-settings': 'Company & Finance Settings',
  'crm': 'CRM Hub',
  'crm-customers': 'CRM Customers',
  'customer-receipt-batch': 'Batch Customer Receipts',
  'customer-statement': 'Customer Statement',
  'dispatch': 'Dispatch',
  'integrations-settings': 'Integrations Settings',
  'investors': 'Investors',
  'new-expense': 'New Expense',
  'payment-approvals': 'Payment Approvals',
  'posted-vouchers': 'Posted Vouchers',
  'proforma-template': 'Proforma Template',
  'proformas-list': 'Proformas',
  'regional-backup-settings': 'Regional & Backup Settings',
  'sales-inventory-settings': 'Sales & Inventory Settings',
  'sales-invoices-list': 'Sales Invoices',
  'stock-as-of': 'Stock As Of',
  'stock-movement-report': 'Stock Movement Report',
  'stock-movements': 'Stock Movements',
  'stock-transfer-outgoing': 'Outgoing Transfers',
  'templates-hub': 'Templates Hub',
  'users-access-settings': 'Users & Access Settings',
  'hrm-settings': 'HRM Settings',
}

// Optional synonyms so plain-language searches land (e.g. "income statement"
// → Profit & Loss, "pos" → Cash Sale). Only the common ones; the label and
// page id are always searched too.
const KEYWORDS: Record<string, string> = {
  'dashboard': 'home overview stats',
  'cash-sale': 'sell pos point of sale till',
  'sales-day-book': 'sales register transactions daybook',
  'inventory': 'stock products items',
  'pnl': 'income statement profit loss p&l',
  'balance-sheet': 'assets liabilities equity',
  'trial-balance': 'tb',
  'chart-of-accounts': 'ledger accounts coa',
  'cash-payment': 'pay expense supplier',
  'cash-receipt': 'receive money collection',
  'bank-receipt': 'receive money bank',
  'credit-note': 'refund return',
  'debit-note': 'charge return',
  'grn': 'goods received note receive stock receiving',
  'stock-transfer': 'move stock between locations',
  'stock-transfer-register': 'transfer history movements',
  'stock-transfer-request': 'request stock pull',
  'stock-adjustment': 'adjust write off count correction',
  'opening-stock': 'initial stock balances',
  'stock-valuation': 'stock value worth',
  'users': 'team staff employees accounts logins',
  'suppliers': 'vendors',
  'customers': 'clients contacts buyers',
  'hrm-payroll': 'salary wages pay run paye',
  'hrm-payslips': 'salary slip',
  'hrm-kpi': 'scorecard performance targets',
  'crm-hub': 'customer relations',
  'crm-loyalty': 'crown points rewards tier',
  'investors-hub': 'investor pitch funding',
  'cash-center': 'cash conservation 13 week forecast cycle power of one scaling up',
  'cash-flow': 'cashflow statement operating investing financing money movement',
  'ledger-health': 'health check integrity balanced books audit trial',
  'product-profit': 'gmroi profitability margin dead stock slow movers',
  'ar-followup': 'receivables debtors chase promises aging collect owed',
  'day-close': 'z report till drawer count eod end of day cashier close reconciliation',
}

// Pages that should never be a search destination.
const HIDDEN = new Set(['coming-soon', 'sales'])

// ─── Per-page icons ─────────────────────────────────────────────────────────
// Feather-style stroke paths, chosen per page family with specific overrides
// for the screens people search most. The search dropdown renders these so a
// page result looks like ITSELF (a bank looks like a bank, a report like a
// chart) instead of every page sharing one generic document glyph.

const P = {
  home:      'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  banknote:  'M2 7h20v10H2z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 12h.01 M18 12h.01',
  receipt:   'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z M15 8H9 M15 12H9',
  fileText:  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  landmark:  'M3 21h18 M4 18h16 M5 10h14 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M5 6l7-3 7 3v4H5z',
  calc:      'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M8 6h8 M8 11h.01 M12 11h.01 M16 11h.01 M8 15h.01 M12 15h.01 M16 15h.01 M8 19h.01 M12 19h.01 M16 19h.01',
  card:      'M2 5h20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M1 10h22',
  box:       'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  truck:     'M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  users:     'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  chart:     'M18 20V10 M12 20V4 M6 20v-6',
  trendUp:   'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  check:     'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  sliders:   'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6v4H9z',
  message:   'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  shield:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  briefcase: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  crown:     'M2 18h20 M4 18l-2-9 5.5 4L12 5l4.5 8L22 9l-2 9z',
  refresh:   'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
}

// Exact page → icon; anything missing falls to the PREFIX rules below.
const PAGE_ICON: Record<string, string> = {
  'sales-settings': P.trendUp,
  'company-finance-settings': P.landmark,
  'users-access-settings': P.shield,
  'integrations-settings': P.message,
  'regional-backup-settings': P.sliders,
  'templates-hub': P.fileText,
  'location-settings': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'dashboard': P.home, 'stock-dashboard': P.home,
  'cash-sale': P.banknote, 'cash-center': P.banknote, 'day-close': P.banknote, 'petty-cash': P.banknote,
  'cash-receipt': P.receipt, 'bank-receipt': P.receipt,
  'cash-payment': P.card, 'new-expense': P.card, 'expense-register': P.card, 'payment-register': P.card, 'loan-repayment': P.card,
  'banks': P.landmark, 'bank-transfer': P.refresh,
  'pnl': P.calc, 'trial-balance': P.calc, 'ledger': P.calc, 'ledger-health': P.calc, 'vat-report': P.calc, 'chart-of-accounts': P.calc, 'accounting-settings': P.calc, 'cash-flow': P.calc,
  'inventory': P.box, 'bundles': P.box, 'services': P.box, 'stock-count': P.clipboard, 'stock-as-of': P.clipboard,
  'grn': P.truck, 'purchase': P.truck, 'purchase-register': P.truck, 'imports': P.truck, 'import-register': P.truck, 'suppliers': P.truck,
  'stock-transfer': P.refresh, 'stock-transfer-register': P.refresh, 'stock-transfer-requests': P.refresh,
  'customers': P.users, 'customer-statement': P.fileText,
  'sales-day-book': P.trendUp, 'sales-register': P.trendUp, 'sales-invoice': P.fileText, 'sales-invoices-list': P.fileText, 'proforma': P.fileText,
  'reports': P.chart, 'report-templates': P.chart, 'product-profit': P.chart,
  'approvals': P.check, 'approvals-settings': P.check, 'ar-followup': P.check,
  'settings': P.sliders, 'display-settings': P.sliders, 'users': P.shield, 'users-access': P.shield,
  'crm-loyalty': P.crown, 'investors-hub': P.briefcase, 'investors': P.briefcase,
  'konnect': P.message, 'company-branding': P.sliders, 'crown-rewards': P.crown,
  'crm-whatsapp-templates': P.message, 'crm-inbox': P.message,
}

const PREFIX_ICON: [string, string][] = [
  ['hrm', P.users], ['crm', P.message], ['stock', P.box],
  ['sales', P.trendUp], ['report', P.chart], ['whatsapp', P.message],
]

/** The icon path for a page — exact match, then family prefix, then file. */
export function iconFor(page: string): string {
  if (PAGE_ICON[page]) return PAGE_ICON[page]
  for (const [pre, icon] of PREFIX_ICON) if (page.startsWith(pre)) return icon
  return P.fileText
}

export interface DirectoryPage { page: Page; label: string; keywords: string; icon: string; module: string }

// Which part of the app each page belongs to — what the search result's
// subtitle teaches. Prefix rules first (cheap, covers families), explicit
// entries for the rest. Anything unmatched says 'Page', which doubles as
// the to-do list for this map.
const MODULE_PREFIX: [string, string][] = [
  ['cash-sale', 'Sales'], ['sales', 'Sales'], ['proforma', 'Sales'], ['invoice', 'Sales'],
  ['credit-note', 'Sales'], ['waiting', 'Sales'], ['pos', 'Sales'], ['day-close', 'Sales'],
  ['expense', 'Expenses'], ['petty-cash', 'Expenses'], ['budget', 'Expenses'], ['recurring', 'Expenses'],
  ['purchase', 'Procurement'], ['grn', 'Procurement'], ['import', 'Procurement'],
  ['supplier', 'Procurement'], ['ap-aging', 'Procurement'],
  ['product', 'Catalogue'], ['service', 'Catalogue'], ['bundle', 'Catalogue'],
  ['inventory', 'Catalogue'], ['stock', 'Catalogue'], ['batch', 'Catalogue'],
  ['dispatch', 'Catalogue'], ['internal-use', 'Catalogue'], ['move', 'Catalogue'],
  ['customer', 'Customers'], ['crm', 'CRM'],
  ['hrm', 'HRM'], ['payslip', 'HRM'], ['payroll', 'HRM'], ['leave', 'HRM'], ['attendance', 'HRM'],
  ['cash-center', 'Accounts'], ['cash-flow', 'Accounts'], ['bank', 'Accounts'],
  ['journal', 'Accounts'], ['ledger', 'Accounts'], ['chart-of-accounts', 'Accounts'],
  ['contra', 'Accounts'], ['cash-receipt', 'Accounts'], ['cash-payment', 'Accounts'],
  ['loan', 'Accounts'], ['asset', 'Accounts'], ['ar-', 'Accounts'], ['customer-statement', 'Accounts'],
  ['p-l', 'Reports'], ['pl', 'Reports'], ['balance-sheet', 'Reports'], ['trial-balance', 'Reports'],
  ['report', 'Reports'], ['vat', 'Reports'], ['day-book', 'Reports'], ['register', 'Reports'],
  ['audit', 'Reports'], ['recon', 'Reports'],
  ['settings', 'Settings'], ['template', 'Settings'], ['display', 'Settings'],
  ['users', 'Settings'], ['data-import', 'Settings'], ['branch', 'Settings'], ['location', 'Settings'],
  ['voucher', 'Vouchers'], ['approval', 'Vouchers'],
  ['dashboard', 'Home'], ['home', 'Home'],
]
const MODULE_EXPLICIT: Record<string, string> = {
  // MalkiaOS additions: these five fell through to the literal 'Page', which is
  // exactly the repetition the module subtitle exists to remove.
  'pnl': 'Reports', 'investors': 'Investors', 'investors-hub': 'Investors',
  'company-branding': 'Settings',
  'sales-day-book': 'Sales', 'sales-register': 'Sales', 'sales-return': 'Sales',
  'expense-register': 'Expenses', 'purchase-register': 'Procurement',
  'bundles': 'Catalogue', 'iu-returns': 'Catalogue',
  'debit-note': 'Procurement', 'opening-stock': 'Catalogue', 'stock-adjustment': 'Catalogue',
  'day-book': 'Sales',
}
export function moduleOf(page: string): string {
  if (MODULE_EXPLICIT[page]) return MODULE_EXPLICIT[page]
  for (const [pre, mod] of MODULE_PREFIX) if (page.startsWith(pre) || page.includes(pre)) return mod
  return 'Page'
}

export interface DirectoryPage { page: Page; label: string; keywords: string; icon: string; module: string }

const merged: Record<string, string> = { ...BREADCRUMBS, ...EXTENDED_LABELS }

export const PAGE_DIRECTORY: DirectoryPage[] = Object.entries(merged)
  .filter(([id]) => !HIDDEN.has(id))
  .map(([id, label]) => ({
    page: id as Page,
    label,
    keywords: KEYWORDS[id] || '',
    icon: iconFor(id),
    module: moduleOf(id),
  }))
  .sort((a, b) => a.label.localeCompare(b.label))

/** Pages matching a lowercased query, by label, id, or keyword. */
export function matchPages(qLower: string, limit = 6): DirectoryPage[] {
  if (!qLower) return []
  return PAGE_DIRECTORY.filter(p =>
    p.label.toLowerCase().includes(qLower) ||
    p.page.toLowerCase().includes(qLower) ||
    p.keywords.includes(qLower)
  ).slice(0, limit)
}
