// ════════════════════════════════════════════════════════════════════════════
// useBankStatements.ts
//
// Reads for the Bank Reconciliation page. Mutations live in
// lib/bankStatement/statementPost.ts.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { StatementImport } from '../lib/bankStatement/statementTypes'

export interface PickerAccount {
  id: string
  code: string
  name: string
}

/** Cash & Bank accounts for the statement picker, expense accounts for posting. */
export function useReconAccounts() {
  const [cashAccounts, setCashAccounts] = useState<PickerAccount[]>([])
  const [expenseAccounts, setExpenseAccounts] = useState<PickerAccount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      const [cash, exp] = await Promise.all([
        supabase.from('accounts').select('id, code, name')
          .eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
        supabase.from('accounts').select('id, code, name')
          .eq('type', 'expense').eq('is_active', true)
          .eq('allow_direct_posting', true).order('code'),
      ])
      if (!live) return
      setCashAccounts((cash.data ?? []) as PickerAccount[])
      setExpenseAccounts((exp.data ?? []) as PickerAccount[])
      setLoading(false)
    })()
    return () => { live = false }
  }, [])

  return { cashAccounts, expenseAccounts, loading }
}

export function useStatementImports(accountId: string | null) {
  const [imports, setImports] = useState<StatementImport[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!accountId) { setImports([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('bank_statement_imports')
      .select('*')
      .eq('account_id', accountId)
      .neq('status', 'abandoned')
      .order('period_start', { ascending: false })
    setImports((data ?? []) as StatementImport[])
    setLoading(false)
  }, [accountId])

  useEffect(() => { void refresh() }, [refresh])
  return { imports, loading, refresh }
}
