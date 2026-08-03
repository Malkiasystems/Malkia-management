// useBankStatements.ts
// Reads for the bank reconciliation screen.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StatementImport, StatementLine } from '@/lib/bankStatement/statementTypes';

export interface CashAccount {
  id: string;
  code: string;
  name: string;
}

export function useCashAccounts() {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      const [cash, exp] = await Promise.all([
        supabase.from('accounts').select('id, code, name')
          .eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
        supabase.from('accounts').select('id, code, name')
          .eq('type', 'expense').eq('is_active', true)
          .eq('allow_direct_posting', true).order('code'),
      ]);
      if (!live) return;
      setAccounts((cash.data ?? []) as CashAccount[]);
      setExpenseAccounts((exp.data ?? []) as CashAccount[]);
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  return { accounts, expenseAccounts, loading };
}

export function useStatementImports(accountId: string | null) {
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!accountId) { setImports([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('bank_statement_imports')
      .select('*')
      .eq('account_id', accountId)
      .neq('status', 'abandoned')
      .order('period_start', { ascending: false });
    setImports((data ?? []) as StatementImport[]);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { imports, loading, refresh };
}

export function useStatementLines(importId: string | null) {
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!importId) { setLines([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('bank_statement_lines')
      .select('*')
      .eq('import_id', importId)
      .order('line_no');
    setLines((data ?? []) as StatementLine[]);
    setLoading(false);
  }, [importId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { lines, loading, refresh };
}
