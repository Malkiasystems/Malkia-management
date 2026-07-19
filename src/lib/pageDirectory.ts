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

export interface DirectoryPage { page: Page; label: string; keywords: string }

const merged: Record<string, string> = { ...BREADCRUMBS, ...EXTENDED_LABELS }

export const PAGE_DIRECTORY: DirectoryPage[] = Object.entries(merged)
  .filter(([id]) => !HIDDEN.has(id))
  .map(([id, label]) => ({
    page: id as Page,
    label,
    keywords: KEYWORDS[id] || '',
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
