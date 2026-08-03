import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export interface Salesperson { id: string; emp_code: string; full_name: string }

/** Active HRM employees for salesperson pickers. Label: "EMP-01 · Jane". */
export function useSalespeople() {
  const [salespeople, setSalespeople] = useState<Salesperson[]>([])
  useEffect(() => {
    supabase.from('hrm_employees').select('id, emp_code, full_name')
      .eq('is_active', true).order('full_name')
      .then(({ data }) => { if (data) setSalespeople(data as Salesperson[]) })
  }, [])
  const label = (s: Salesperson) => `${s.emp_code || '—'} · ${s.full_name}`
  return { salespeople, label }
}
