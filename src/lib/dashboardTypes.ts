// ============================================================================
// dashboardTypes.ts
// Shared shapes for the CEO dashboard. The data hook (useDashboard) fills
// these; the section components (DashboardFinancial, DashboardOperations) read
// them. Sensitive blocks are null when the viewer lacks dashboard.view_financials.
// ============================================================================

export interface MoneyDelta {
  current: number
  previous: number
  deltaPct: number | null   // null when previous is 0 (can't compute %)
}

export interface PnlLine { code: string; name: string; value: number }

// Sensitive tier — only populated when canViewFinancials is true.
export interface FinancialData {
  revenue: MoneyDelta
  grossProfit: MoneyDelta
  marginPct: number          // current-month GP / revenue * 100
  expenses: MoneyDelta
  netProfit: MoneyDelta
  // Per-account P&L for the current month (the actual line items).
  pnlBreakdown: { revenue: PnlLine[]; cogs: PnlLine[]; expenses: PnlLine[] }
  cashPosition: number        // snapshot across tills, mobile money, banks
  /** The three largest Cash & Bank accounts, for the Banks cue tile body.
   *  Derived from the same accounts fetch that sums cashPosition, so the
   *  list can never disagree with the total beside it. */
  bankTop: { n: string; b: number }[]
  inventoryValue: number      // GL account 1110 balance
  payrollCost: number         // current-month salary expense (60xx)
  ar: {
    total: number
    customerCount: number
    aging: { current: number; d31_60: number; d61_90: number; d90plus: number }
    top: { name: string; amount: number }[]
  }
  ap: {
    suppliers: number          // sum of supplier balances
    loans: number              // outstanding loan principal (21xx)
  }
}

// Operational tier — always populated.
export interface OperationsData {
  sales: { count: number; total: number; cash: number; credit: number }
  /** Posted sales value for today alone. Feeds the New Cash Sale cue tile. */
  salesToday: number
  /** Posted sales value per day, oldest first, ending today (7 entries).
   *  Feeds the sparkline inside the New Cash Sale tile. */
  sales7d: number[]
  inventory: { products: number; lowStock: number; outOfStock: number }
  hrm: { headcount: number; onLeave: number }
  crm: {
    retailCustomers: number
    newRetailThisMonth: number
    b2bProspects: number
    b2bOverdue: number
    b2bWonThisMonth: number
  }
  approvalsPending: number
  recentVouchers: { ref: string; description: string; type: string; total_amount: number; status: string }[]
  stockAlerts: { name: string; qty_on_hand: number; reorder_point: number }[]
  categoryBreakdown: { category: string; count: number; value: number }[]
}

export interface DashboardData {
  monthLabel: string          // e.g. "May 2026"
  financial: FinancialData | null
  operations: OperationsData
}
