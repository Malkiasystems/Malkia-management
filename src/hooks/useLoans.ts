// src/hooks/useLoans.ts
// Reads for the Loan Repayment voucher:
//   - loan accounts (category 'Loans')
//   - cash / bank accounts (category 'Cash & Bank')
//   - repayment history (loan_payment vouchers, joined to the loan account)
//   - point-in-time balance of a pay-from account (coverage guard)

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase'; // <-- ADJUST path if your client lives elsewhere
import type {
  LoanAccount,
  CashBankAccount,
  LoanRepaymentHistoryRow,
} from '../lib/loanTypes'; // <-- ADJUST if your lib folder differs

export function useLoans() {
  const [loans, setLoans] = useState<LoanAccount[]>([]);
  const [cashBank, setCashBank] = useState<CashBankAccount[]>([]);
  const [history, setHistory] = useState<LoanRepaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Loan accounts (liabilities under the Loans category)
      const { data: loanRows, error: le } = await supabase
        .from('accounts')
        .select('id, code, name, balance')
        .eq('category', 'Loans')
        .eq('account_type', 'posting')
        .order('code');
      if (le) throw le;

      setLoans(
        (loanRows ?? []).map((a: any) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          balance: Number(a.balance),
          outstanding: -Number(a.balance), // liability is held as a negative balance
        }))
      );

      // Cash & bank accounts to pay from
      const { data: cbRows, error: ce } = await supabase
        .from('accounts')
        .select('id, code, name, balance')
        .eq('category', 'Cash & Bank')
        .eq('account_type', 'posting')
        .eq('is_active', true)
        .order('code');
      if (ce) throw ce;

      setCashBank(
        (cbRows ?? []).map((a: any) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          balance: Number(a.balance),
        }))
      );

      // Repayment history: loan_payment vouchers -> loan account name/code
      const { data: hRows, error: he } = await supabase
        .from('vouchers')
        .select(
          'ref, posting_date, total_amount, payment_method, payment_ref, posted_by, ' +
            'loan_account:accounts!vouchers_loan_account_id_fkey(code, name)'
        )
        .eq('type', 'loan_payment')
        .order('posting_date', { ascending: false })
        .limit(200);
      if (he) throw he;

      setHistory(
        (hRows ?? []).map((v: any) => ({
          voucherRef: v.ref,
          postingDate: v.posting_date,
          loanCode: v.loan_account?.code ?? '',
          loanName: v.loan_account?.name ?? '',
          amount: Number(v.total_amount),
          paymentMethod: v.payment_method,
          paymentRef: v.payment_ref,
          postedBy: v.posted_by,
        }))
      );
    } catch (e: any) {
      setError(e.message ?? 'Failed to load loans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Point-in-time balance of a pay-from account, for the coverage guard.
  const payFromBalanceAsOf = useCallback(
    async (accountId: string, asOf: string): Promise<number> => {
      const { data, error } = await supabase.rpc('account_balance_as_of', {
        p_account_id: accountId,
        p_as_of: asOf,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    []
  );

  return { loans, cashBank, history, loading, error, reload: load, payFromBalanceAsOf };
}
