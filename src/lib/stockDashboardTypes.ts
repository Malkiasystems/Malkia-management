// ════════════════════════════════════════════════════════════════════════════
// stockDashboardTypes.ts
//
// Shapes for the Stock Manager home dashboard. QUANTITIES ONLY — no cost,
// no selling price, no stock value anywhere. The Stock Manager workspace is
// deliberately money-blind.
// ════════════════════════════════════════════════════════════════════════════

export interface LowStockItem {
  productId: string
  name: string
  qty: number
  reorderPoint: number
}

export interface RecentReceipt {
  ref: string
  date: string         // YYYY-MM-DD (latest line date for the GRN)
  totalQty: number     // total units received under this GRN ref (at this location)
  lineCount: number
}

export interface StockDashboardData {
  locationId: string | null
  locationCode: string | null
  locationName: string | null
  /** True when the data is scoped to a single bound location. */
  isLocationScoped: boolean

  totalSkus: number      // distinct products carried at the location
  totalUnits: number     // sum of qty on hand (units, not money)
  lowStockCount: number  // products at or below reorder point
  outOfStockCount: number

  lowStockItems: LowStockItem[]   // capped list, lowest qty first
  pendingTransfersIn: number      // requests heading TO this location, pending
  pendingTransfersOut: number     // requests FROM this location awaiting this manager's approval
  recentReceipts: RecentReceipt[] // last few GRNs at this location
}
