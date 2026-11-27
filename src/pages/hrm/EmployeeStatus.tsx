import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface StatusEvent {
  id: string
  recorded_at: string
  recorded_by_name: string
  reason: string
}

export default function EmployeeStatus({ employeeId, active, onDeactivate }: {
  employeeId: string
  active: boolean
  onDeactivate: () => void
}) {
  const [history, setHistory] = useState<StatusEvent[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    async function loadHistory() {
      const result = await supabase.from('hrm_employee_deactivations')
        .select('id,recorded_at,recorded_by_name,reason').eq('employee_id', employeeId)
        .order('recorded_at', { ascending: false })
      if (!current) return
      if (result.error) setError(result.error.message)
      else setHistory(result.data || [])
    }
    void loadHistory()
    return () => { current = false }
  }, [employeeId])

  return (
    <section style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Employment status · {active ? 'Active' : 'Inactive'}</h3>
      {error ? <p role="alert">Could not load the status history. {error}</p> : history === null ? <p>Loading status history…</p> :
        history.map(event => (
          <div key={event.id} style={{ marginBottom: 12, overflowWrap: 'anywhere' }}>
            <div style={{ fontSize: 12 }}>Deactivated by {event.recorded_by_name} · {new Date(event.recorded_at).toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' })} EAT</div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{event.reason}</div>
          </div>
        ))}
      {!active && history?.length === 0 && <p>No deactivation reason was recorded.</p>}
      {active && <button className="btn btn-danger" onClick={onDeactivate}>Deactivate employee…</button>}
    </section>
  )
}
