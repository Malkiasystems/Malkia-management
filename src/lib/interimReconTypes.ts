// ════════════════════════════════════════════════════════════════════════════
// interimReconTypes.ts
//
// Types for the Interim Account (1121) reconciliation report.
//
// WHY THIS REPORT EXISTS
// Account 1121 "GRN Interim / Expected Cost" is written by two flows that mean
// opposite things by it:
//
//   GRN.tsx            Cr 1121  — goods received, not yet invoiced. This is a
//                                 LIABILITY. It should have been cleared by a
//                                 Purchase Invoice (Dr 1121 / Cr AP 2010), but
//                                 nothing in the app forces that to ever happen.
//
//   ImportOrder.tsx    Dr 1121  — money paid for goods not yet landed. This is
//                                 an ASSET (goods in transit). It self-clears on
//                                 receipt (Dr 1110 / Cr 1121), so a healthy
//                                 import flow nets to zero on its own.
//
// 1121 is defined as type 'asset' in the chart of accounts. So a GRN credit
// balance sits on the balance sheet as negative inventory rather than as a
// payable, and an open import debit balance NETS AGAINST IT. A 1121 balance of
// zero can mean "all clear" or it can mean "10M of unlanded imports cancelling
// 10M of uninvoiced GRNs". You cannot tell from the balance. This report tells
// you by splitting the account by what actually wrote each line.
// ════════════════════════════════════════════════════════════════════════════

// Which flow wrote a given 1121 line. Derived from journals.journal_type and
// journals.source_type — see bucketOf() in useInterimRecon.ts.
export type ReconBucket =
  | 'grn'                 // GRN.tsx            · credits 1121 · liability
  | 'purchase_invoice'    // PurchaseInvoice.tsx · debits 1121  · clears the above
  | 'import_payment'      // ImportOrder.tsx    · debits 1121  · asset in transit
  | 'import_receive'      // ImportOrder.tsx    · credits 1121 · clears the above
  | 'import_adjustment'   // ImportOrder.tsx    · credits 1121 · landed cost top-up
  | 'other'               // manual JVs, cash payments pointed at 1121 by hand

export interface ReconLine {
  id: string
  journalId: string
  journalRef: string
  postingDate: string
  sourceRef: string
  journalType: string
  bucket: ReconBucket
  description: string
  debit: number
  credit: number
}

// GRN-side exposure grouped by supplier. This is the actionable output: it is
// the list you need to post a correcting journal that moves the credit out of
// 1121 and into AP (2010) against the right supplier.
export interface SupplierExposure {
  supplierId: string | null
  supplierName: string
  grnCount: number
  amount: number          // credit still sitting in 1121 from this supplier's GRNs
}

export interface GrnRow {
  ref: string
  postingDate: string
  supplierName: string
  amount: number
  postedBy: string
}

export interface ReconResult {
  accountId: string
  accountCode: string
  accountName: string

  // Cached vs derived. accounts.balance is a running cache maintained by the
  // update_account_balance RPC; ledgerBalance is recomputed from the journal
  // lines themselves. They should match. Where they don't, the journal lines
  // win — same principle as the AR balance drift fix on customer_ledger_entries.
  cachedBalance: number
  ledgerBalance: number   // sum(debit) - sum(credit), debit-positive
  drift: number           // cachedBalance - ledgerBalance

  totalDebit: number
  totalCredit: number
  lineCount: number

  // GRN side. Positive grnExposure = uninvoiced supplier liability hiding in an
  // asset account.
  grnCredit: number
  purchaseInvoiceDebit: number
  grnExposure: number     // grnCredit - purchaseInvoiceDebit

  // Import side. Positive importExposure = goods paid for and not yet landed.
  // This one is legitimate and self-clears; it is only a problem because it
  // shares an account with the GRN side.
  importDebit: number
  importCredit: number
  importExposure: number  // importDebit - importCredit

  // Anything that reached 1121 by a route we don't recognise.
  otherDebit: number
  otherCredit: number
  otherNet: number        // debit - credit

  bySupplier: SupplierExposure[]
  grnRows: GrnRow[]
  lines: ReconLine[]
}

export const BUCKET_LABELS: Record<ReconBucket, { label: string; note: string }> = {
  grn:               { label: 'GRN',               note: 'Cr 1121 · goods received, not invoiced' },
  purchase_invoice:  { label: 'Purchase Invoice',  note: 'Dr 1121 · clears a GRN into AP' },
  import_payment:    { label: 'Import payment',    note: 'Dr 1121 · paid, not yet landed' },
  import_receive:    { label: 'Import received',   note: 'Cr 1121 · landed into inventory' },
  import_adjustment: { label: 'Import cost adj.',  note: 'Cr 1121 · landed cost top-up' },
  other:             { label: 'Other / manual',    note: 'Reached 1121 by an unrecognised route' },
}
