// statementPost.ts
// All mutations for statement import and charge posting. Nothing in here
// decides what is postable; that judgement lives in statementReconcile.ts.

import { supabase } from '@/lib/supabase';
import type {
  ParsedRow, ReconciledRow, StatementSource, StatementSummary,
  StatementImport, StatementLine, PostChargesResult,
} from './statementTypes';

export interface SaveImportArgs {
  accountId: string;
  source: StatementSource;
  fileName: string | null;
  fileHash: string | null;
  periodStart: string;
  periodEnd: string;
  statedOpening: number;
  statedClosing: number;
  rows: ReconciledRow[];
  summary: StatementSummary;
  createdBy: string | null;
}

/** Reads the cutover so the UI can grey out rows it will never be allowed to post. */
export async function fetchCutoverDate(): Promise<string | null> {
  const { data, error } = await supabase.rpc('ledger_cutover_date');
  if (error) throw new Error(error.message);
  return (data as string) ?? null;
}

export async function saveImport(args: SaveImportArgs): Promise<StatementImport> {
  const { data: imp, error } = await supabase
    .from('bank_statement_imports')
    .insert({
      account_id: args.accountId,
      source: args.source,
      file_name: args.fileName,
      file_hash: args.fileHash,
      period_start: args.periodStart,
      period_end: args.periodEnd,
      stated_opening: args.statedOpening,
      stated_closing: args.statedClosing,
      parsed_money_in: args.summary.parsedMoneyIn,
      parsed_money_out: args.summary.parsedMoneyOut,
      printed_charges: args.summary.printedCharges,
      borne_charges: args.summary.borneCharges,
      balance_gap: args.summary.balanceGap,
      status: 'parsed',
      created_by: args.createdBy,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('This statement has already been imported for this account.');
    }
    throw new Error(error.message);
  }

  const payload = args.rows.map((r) => ({
    import_id: imp.id,
    account_id: args.accountId,
    line_no: r.lineNo,
    entry_date: r.entryDate,
    description: r.description,
    counterparty: r.counterparty,
    txn_ref: r.txnRef,
    direction: r.direction,
    gross_amount: r.grossAmount,
    money_in: r.moneyIn,
    money_out: r.moneyOut,
    stated_balance: r.statedBalance,
    computed_balance: r.computedBalance,
    balance_break: r.balanceBreak,
    printed_charge: r.printedCharge,
    charge_borne: r.chargeBorne,
    // only charges we actually bore become candidates; the rest are recorded
    // for the audit trail but can never reach the ledger
    status: !r.chargeBorne
      ? 'unmatched'
      : r.beforeCutover
        ? 'charge_historical'
        : 'charge_pending',
  }));

  const { error: lineErr } = await supabase.from('bank_statement_lines').insert(payload);
  if (lineErr) {
    // the import row would otherwise be orphaned and block a clean retry
    await supabase.from('bank_statement_imports').delete().eq('id', imp.id);
    if (lineErr.code === '23505') {
      throw new Error(
        'One or more transactions in this file were already imported from another statement. Nothing was saved.',
      );
    }
    throw new Error(lineErr.message);
  }

  return imp as StatementImport;
}

export interface PostChargesArgs {
  importId: string;
  lineIds: string[];
  expenseAccountId: string;
  /** set when the original payment was already captured gross, making this a reclass */
  contraAccountId?: string | null;
  postedBy: string | null;
}

export async function postCharges(args: PostChargesArgs): Promise<PostChargesResult[]> {
  if (!args.lineIds.length) throw new Error('Select at least one charge to post.');

  const { data, error } = await supabase.rpc('post_statement_charges', {
    p_import_id: args.importId,
    p_line_ids: args.lineIds,
    p_expense_account_id: args.expenseAccountId,
    p_contra_account_id: args.contraAccountId ?? null,
    p_posted_by: args.postedBy,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as PostChargesResult[];
}

export async function ignoreLine(lineId: string): Promise<void> {
  const { error } = await supabase
    .from('bank_statement_lines')
    .update({ status: 'ignored' })
    .eq('id', lineId);
  if (error) throw new Error(error.message);
}

export async function setImportNotes(importId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('bank_statement_imports')
    .update({ notes })
    .eq('id', importId);
  if (error) throw new Error(error.message);
}

export async function abandonImport(importId: string): Promise<void> {
  const { error } = await supabase
    .from('bank_statement_imports')
    .update({ status: 'abandoned' })
    .eq('id', importId);
  if (error) throw new Error(error.message);
}
