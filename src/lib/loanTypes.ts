// src/lib/loanTypes.ts
// Shared types for the Loan Repayment voucher.

export interface LoanAccount {
  id: string;
  code: string;
  name: string;
  balance: number;        // account cache balance; a liability is held as negative
  outstanding: number;    // positive amount still owed = -balance
}

export interface CashBankAccount {
  id: string;
  code: string;
  name: string;
  balance: number;        // positive = cash currently available (cache)
}

export interface LoanRepaymentInput {
  loanAccountId: string;
  payFromAccountId: string;
  amount: number;
  postingDate: string;    // 'YYYY-MM-DD'
  paymentMethod: string;  // 'bank_transfer' | 'cash' | 'mobile' | 'cheque' | ...
  paymentRef?: string;    // cheque no / mobile txn id / bank statement ref
  description?: string;
  postedBy: string;
  branch?: string | null;
}

export interface LoanRepaymentResult {
  voucherRef: string;     // LNP-10-NNNN
  journalRef: string;     // JV-LNP-10-NNNN
  journalId: string;
}

export interface LoanRepaymentHistoryRow {
  voucherRef: string;
  postingDate: string;
  loanCode: string;
  loanName: string;
  amount: number;
  paymentMethod: string | null;
  paymentRef: string | null;
  postedBy: string | null;
}
