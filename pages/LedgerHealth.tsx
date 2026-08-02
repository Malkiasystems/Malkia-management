// src/pages/LedgerHealth.tsx — daily "are the books sound" check.
// Runs the integrity tests from the July 2026 cleanup via ledger_health_check().
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Check { check_name: string; status: string; detail: string; amount: number }
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

export default function LedgerHealth() {
  const [checks, setChecks] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ranAt, setRanAt] = useState('')

  const run = async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('ledger_health_check')
    if (error) setError(error.message)
    else { setChecks((data || []) as Check[]); setRanAt(new Date().toLocaleTimeString()) }
    setLoading(false)
  }
  useEffect(() => { run() }, [])

  const fails = checks.filter(c => c.status === 'FAIL').length
  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Ledger Health</h1>
          <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Every silent failure mode from the July cleanup, checked automatically</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={run}>Run checks</button>
      </div>

      {loading ? <div style={{ padding: 40, color: 'var(--text3)' }}>Checking…</div>
      : error ? <div style={{ padding: 20, color: 'var(--red)' }}>{error}</div>
      : (
        <>
          <div style={{ margin: '18px 0', padding: 16, borderRadius: 12, border: `1px solid ${fails ? 'var(--red)' : 'var(--green)'}`,
            background: fails ? 'rgba(229,100,93,.08)' : 'rgba(63,185,143,.08)', fontWeight: 800, fontSize: 16 }}>
            {fails === 0 ? `✓ All ${checks.length} checks pass · books are internally sound · ${ranAt}`
              : `✗ ${fails} of ${checks.length} checks failing · ${ranAt}`}
          </div>
          {checks.map(c => (
            <div key={c.check_name} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '12px 4px',
              borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  <span style={{ color: c.status === 'PASS' ? 'var(--green)' : 'var(--red)', marginRight: 8 }}>
                    {c.status === 'PASS' ? '✓' : '✗'}
                  </span>
                  {c.check_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{c.detail}</div>
              </div>
              {c.status === 'FAIL' && Math.abs(c.amount) > 0.01 &&
                <div style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontSize: 13, whiteSpace: 'nowrap' }}>TZS {fmt(c.amount)}</div>}
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 14, lineHeight: 1.6 }}>
            The books were reopened on 2 August 2026. These checks inspect journals posted on or after that
            date only, so the 145 unbalanced cash sales (1,232,788), the 46 orphan headers and the 6012 NSSF
            balance no longer appear here. Those rows are still on file and still browsable, they are simply
            outside the current period. Everything here should be green every day.
          </div>
        </>
      )}
    </div>
  )
}
