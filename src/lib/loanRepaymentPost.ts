// src/lib/loanRepaymentPost.ts
// Posts a loan repayment as a balanced two-line journal through the
// post_journal_transaction RPC, then writes the voucher header.
//
// Mirrors the existing cash_payment convention exactly (verified against live data):
//   voucher.ref               LNP-10-NNNN
//   voucher.type              loan_payment
//   journal.ref               JV-LNP-10-NNNN
//   journal_type/source_type  loan_payment
//   journal.source_ref        LNP-10-NNNN
//
// The entry:
//   Dr  <loan account>      amount   (liability goes down)
//   Cr  <pay-from account>  amount   (cash / bank goes down)
//
// The RPC itself rejects an unbalanced entry and anything under 2 lines, so a
// half-transaction cannot be posted through this path.

import { supabase } from '../lib/supabase'; // <-- ADJUST if your client lives elsewhere (e.g. '../supabase')
import type { LoanRepaymentInput, LoanRepaymentResult } from './loanTypes';

export async function postLoanRepayment(
  input: LoanRepaymentInput
): Promise<LoanRepaymentResult> {
  const amount = Number(input.amount);

  // ---- friendly validation (the RPC also enforces the balance invariant) ----
  if (!input.loanAccountId) throw new Error('Choose which loan you are repaying.');
  if (!input.payFromAccountId) throw new Error('Choose the account you are paying from.');
  if (input.loanAccountId === input.payFromAccountId)
    throw new Error('The loan account and the pay-from account cannot be the same.');
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error('Enter an amount greater than zero.');
  if (!input.postingDate) throw new Error('Choose a posting date.');
  if (!input.postedBy) throw new Error('Missing posted-by user.');

  // ---- 1. next voucher number (advisory-locked; checks journals + vouchers) ----
  const { data: refData, error: refErr } = await supabase.rpc(
    'generate_next_journal_ref',
    { p_prefix: 'LNP', p_company: '10' }
  );
  if (refErr) throw new Error(`Could not generate a voucher number: ${refErr.message}`);
  const voucherRef = refData as string;      // LNP-10-NNNN
  const journalRef = `JV-${voucherRef}`;     // JV-LNP-10-NNNN

  const description = input.description?.trim() || `Loan repayment ${voucherRef}`;

  // ---- 2. post the balanced journal: Dr loan / Cr cash-bank ----
  const { data: journalId, error: postErr } = await supabase.rpc(
    'post_journal_transaction',
    {
      p_ref: journalRef,
      p_posting_date: input.postingDate,
      p_description: description,
      p_journal_type: 'loan_payment',
      p_source_type: 'loan_payment',
      p_source_ref: voucherRef,
      p_posted_by: input.postedBy,
      p_branch: input.branch ?? null,
      p_lines: [
        {
          account_id: input.loanAccountId,
          description: 'Loan principal repayment',
          debit: amount,
          credit: 0,
        },
        {
          account_id: input.payFromAccountId,
          description: `Paid via ${input.paymentMethod || 'bank'}`,
          debit: 0,
          credit: amount,
        },
      ],
    }
  );
  if (postErr) throw new Error(`Journal not posted: ${postErr.message}`);
  const jId = journalId as string;

  // ---- 3. write the voucher header, linked to the journal ----
  const { error: vErr } = await supabase.from('vouchers').insert({
    ref: voucherRef,
    type: 'loan_payment',
    posting_date: input.postingDate,
    description,
    subtotal: amount,
    vat_amount: 0,
    total_amount: amount,
    currency: 'TZS',
    status: 'posted',
    branch: input.branch ?? 'DSM HQ',
    journal_id: jId,
    loan_account_id: input.loanAccountId,
    payment_method: input.paymentMethod || null,
    payment_ref: input.paymentRef?.trim() || null,
    posted_by: input.postedBy,
    posted_at: new Date().toISOString(),
  });

  if (vErr) {
    // The journal DID post and the ledger IS correct. Surface this precisely so
    // nobody re-posts and double-pays the loan.
    throw new Error(
      `Journal ${journalRef} posted and the ledger is correct, but writing the ` +
        `voucher header failed: ${vErr.message}. Do NOT re-post: the repayment is ` +
        `already in the books, only the voucher record is missing.`
    );
  }

  return { voucherRef, journalRef, journalId: jId };
}
