// Build-time contract probes use the same URL and public API key as the app.
// Null arguments and an empty payslip request cannot produce a payment or message.
export async function verifyHrmBackend(env) {
  const url = env.VITE_MALKIA_WELLNESS_SUPABASE_URL
  const key = env.VITE_MALKIA_WELLNESS_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Malkia Supabase URL or public key for the release check')

  async function probe(path, body, expected) {
    const response = await fetch(new URL(path, url), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const result = await response.json()
    if (!expected(response.status, result)) {
      throw new Error(`HRM release check failed for ${path} (HTTP ${response.status}, ${result?.code ?? 'unexpected response'}). Verify the target database migrations and Edge Functions before deploying.`)
    }
  }

  function checkRpc(name, params) {
    return probe('/rest/v1/rpc/' + name, Object.fromEntries(params.map(p => [p, null])),
      (status, result) => status === 401 && result.code === '42501' && result.message === 'permission denied for function ' + name)
  }

  function checkPrivateRelation(kind, name, columns) {
    return probe('/rest/v1/' + name + '?select=' + columns + '&limit=0', undefined,
      (status, result) => status === 401 && result.code === '42501' && result.message === `permission denied for ${kind} ${name}`)
  }

  await Promise.all([
    checkRpc('deactivate_hrm_employee', ['p_employee', 'p_reason']),
    checkPrivateRelation('table', 'hrm_employee_deactivations', 'id,employee_id,recorded_at,recorded_by,recorded_by_name,reason'),
    checkPrivateRelation('view', 'hrm_staff_directory', 'id,emp_code,full_name,is_active,user_id'),
    checkPrivateRelation('table', 'hrm_payroll_lines', 'id,payroll_run_id,employee_id,gross,allowances,bonus,paye,nssf_ee,advance_deduction,deductions,net_pay,nssf_er,sdl,notes,advance_recoveries'),
    checkPrivateRelation('table', 'hrm_payroll_runs', 'id,period,status,journal_ref,operation_id'),
    checkRpc('issue_hrm_advance', ['p_id', 'p_employee', 'p_source', 'p_date', 'p_amount', 'p_monthly', 'p_notes']),
    checkRpc('post_hrm_payroll', ['p_period', 'p_lines', 'p_operation', 'p_previous']),
    probe('/functions/v1/wa-payslip', {}, (status, result) =>
      status === 403 && result.error === 'Payroll permission required to send payslips'),
  ])
}
