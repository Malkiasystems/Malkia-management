// statementTypes.ts
// Shared types for bank / mobile money statement import and reconciliation.

export type StatementSource = 'mixx_yas' | 'crdb' | 'nmb' | 'equity' | 'selcom' | 'mpesa' | 'manual';

export type LineStatus =
  | 'unmatched'
  | 'matched'
  | 'charge_pending'
  | 'charge_posted'
  | 'charge_historical'
  | 'ignored';

/** A row as it comes straight out of the parser, before any reconciliation. */
export interface ParsedRow {
  lineNo: number;
  entryDate: string;          // ISO yyyy-mm-dd
  description: string;
  counterparty: string | null;
  txnRef: string | null;
  direction: 'in' | 'out';
  /** the "Amount:" the statement claims moved, before any charge */
  grossAmount: number;
  moneyIn: number;
  moneyOut: number;
  /** the balance the statement itself prints on this row */
  statedBalance: number | null;
  /** the "ServiceCharge:" the statement prints, which may or may not be ours */
  printedCharge: number;
}

/** A parsed row plus everything the reconciler worked out about it. */
export interface ReconciledRow extends ParsedRow {
  /** balance we arrive at by walking the chain ourselves */
  computedBalance: number;
  /** statedBalance - computedBalance; non-zero means the statement does not add up */
  balanceBreak: number;
  /** true only when the balance movement proves the charge left our account */
  chargeBorne: boolean;
  /** true when entryDate is before the ledger cutover and so cannot be journalled */
  beforeCutover: boolean;
  flags: RowFlag[];
}

export type RowFlag =
  | 'balance_break'         // the running balance jumps without an entry to explain it
  | 'charge_not_borne'      // a charge is printed but never left our account
  | 'charge_borne'          // a charge is printed and did leave our account
  | 'before_cutover'        // cannot be posted as a journal
  | 'malformed_msisdn';     // counterparty number is the wrong length to identify

export interface StatementSummary {
  statedOpening: number;
  statedClosing: number;
  parsedMoneyIn: number;
  parsedMoneyOut: number;
  /** opening + in - out, i.e. where the rows say we should land */
  computedClosing: number;
  /** statedClosing - computedClosing; the total unexplained movement */
  balanceGap: number;
  printedCharges: number;
  borneCharges: number;
  rowsWithBreaks: number;
}

export interface StatementImport {
  id: string;
  account_id: string;
  source: StatementSource;
  file_name: string | null;
  file_hash: string | null;
  period_start: string;
  period_end: string;
  stated_opening: number | null;
  stated_closing: number | null;
  parsed_money_in: number;
  parsed_money_out: number;
  printed_charges: number;
  borne_charges: number;
  balance_gap: number;
  status: 'parsed' | 'reviewed' | 'posted' | 'abandoned';
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StatementLine {
  id: string;
  import_id: string;
  account_id: string;
  line_no: number;
  entry_date: string;
  description: string | null;
  counterparty: string | null;
  txn_ref: string | null;
  direction: 'in' | 'out';
  gross_amount: number;
  money_in: number;
  money_out: number;
  stated_balance: number | null;
  computed_balance: number | null;
  balance_break: number;
  printed_charge: number;
  charge_borne: boolean;
  status: LineStatus;
  matched_journal_id: string | null;
  charge_journal_id: string | null;
}

export interface PostChargesResult {
  journal_id: string;
  posting_date: string;
  lines_posted: number;
  amount: number;
}
