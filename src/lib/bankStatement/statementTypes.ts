// ════════════════════════════════════════════════════════════════════════════
// statementTypes.ts
//
// Shared types for bank / mobile money statement import and reconciliation.
// Split per house style: types here, pure logic in statementParse.ts and
// statementReconcile.ts, mutations in statementPost.ts, reads in
// hooks/useBankStatements.ts, UI in pages/BankReconciliation.tsx.
// ════════════════════════════════════════════════════════════════════════════

export type StatementSource = 'mixx_yas' | 'crdb' | 'nmb' | 'equity' | 'selcom' | 'mpesa' | 'manual'

export type LineStatus =
  | 'unmatched'
  | 'matched'
  | 'charge_pending'
  | 'charge_posted'
  | 'charge_historical'
  | 'ignored'

/** A row as the parser read it, before any judgement. */
export interface ParsedRow {
  lineNo: number
  entryDate: string          // YYYY-MM-DD
  description: string
  counterparty: string | null
  txnRef: string | null
  direction: 'in' | 'out'
  /** the "Amount:" the statement claims moved, before any charge */
  grossAmount: number
  moneyIn: number
  moneyOut: number
  /** the running balance the statement itself prints on this row */
  statedBalance: number | null
  /** the "ServiceCharge:" printed, which may or may not be ours */
  printedCharge: number
}

/** A parsed row plus everything the reconciler worked out about it. */
export interface ReconciledRow extends ParsedRow {
  /** balance we arrive at by walking the chain ourselves */
  computedBalance: number
  /** statedBalance − computedBalance; non-zero means a movement is hidden */
  balanceBreak: number
  /** true only when the balance movement proves the charge left this account */
  chargeBorne: boolean
  /** true when entryDate is before the ledger cutover, so it cannot journal */
  beforeCutover: boolean
  flags: RowFlag[]
}

export type RowFlag =
  | 'balance_break'      // the balance jumps without an entry to explain it
  | 'charge_not_borne'   // a charge is printed but never left this account
  | 'charge_borne'       // a charge is printed and did leave this account
  | 'before_cutover'     // real charge, but the ledger will not accept the date
  | 'malformed_msisdn'   // counterparty number has a lost or doubled digit

export interface StatementSummary {
  statedOpening: number
  statedClosing: number
  parsedMoneyIn: number
  parsedMoneyOut: number
  /** opening + in − out: where the rows say the account should land */
  computedClosing: number
  /** statedClosing − computedClosing: total unexplained movement */
  balanceGap: number
  printedCharges: number
  borneCharges: number
  rowsWithBreaks: number
}

export interface StatementImport {
  id: string
  account_id: string
  source: StatementSource
  file_name: string | null
  file_hash: string | null
  period_start: string
  period_end: string
  stated_opening: number | null
  stated_closing: number | null
  parsed_money_in: number
  parsed_money_out: number
  printed_charges: number
  borne_charges: number
  balance_gap: number
  status: 'parsed' | 'reviewed' | 'posted' | 'abandoned'
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface StatementLine {
  id: string
  import_id: string
  account_id: string
  line_no: number
  entry_date: string
  description: string | null
  counterparty: string | null
  txn_ref: string | null
  direction: 'in' | 'out'
  gross_amount: number
  money_in: number
  money_out: number
  stated_balance: number | null
  computed_balance: number | null
  balance_break: number
  printed_charge: number
  charge_borne: boolean
  status: LineStatus
  matched_journal_id: string | null
  charge_journal_id: string | null
}

export interface PostChargesResult {
  journal_id: string
  posting_date: string
  lines_posted: number
  amount: number
}
