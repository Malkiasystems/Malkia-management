import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

/* Books check: a red notice for administrators when something in the records
   does not add up. The database works the list out live (integrity_report,
   migration 068): posted invoices or receipts missing from a customer's
   statement, accounting entries that do not balance, broken database rules,
   and failures the app or the WhatsApp functions wrote down.

   It exists because a fault ran for eight days in November 2026 before anyone
   happened to notice it on one customer's statement. With this, the same
   fault shows here the day it starts.

   An item can be acknowledged with a note (for something known and being
   dealt with); acknowledged items stop raising the notice but stay listed. */

interface Issue { issue_key: string; severity: 'high' | 'medium' | 'low'; title: string; detail: string; acked: boolean; ack_note: string | null }

const SEV: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: 'Serious', color: '#B42318', bg: '#FDECEC' },
  medium: { label: 'Check',   color: '#9A6700', bg: '#FFF4D6' },
  low:    { label: 'Minor',   color: '#3F6B4F', bg: '#EAF6EC' },
}

export default function BooksCheckBanner() {
  const { isSuperAdmin } = useAuth()
  if (!isSuperAdmin()) return null   // the server enforces the same rule
  return <BooksCheckInner />
}

function BooksCheckInner() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('integrity_report')
    if (error) { if (error.code !== '42501') setErr(error.message); return }
    setErr(''); setIssues((data || []) as Issue[])
  }, [])

  useEffect(() => {
    load()
    const t = window.setInterval(load, 10 * 60 * 1000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  const active = issues.filter(i => !i.acked)
  const acked = issues.filter(i => i.acked)
  const serious = active.filter(i => i.severity === 'high').length

  const acknowledge = async (i: Issue) => {
    const note = window.prompt(`Acknowledge "${i.title}"?\n\nIt will stop raising the notice but stay on this list. Add a short note saying what is being done about it:`, '')
    if (note === null) return
    setBusy(i.issue_key)
    const { error } = await supabase.rpc('integrity_ack', { p_key: i.issue_key, p_note: note })
    if (error) setErr(error.message)
    await load(); setBusy('')
  }
  const undo = async (i: Issue) => {
    setBusy(i.issue_key)
    const { error } = await supabase.rpc('integrity_unack', { p_key: i.issue_key })
    if (error) setErr(error.message)
    await load(); setBusy('')
  }

  if (active.length === 0 && !open) return null

  const row = (i: Issue) => {
    const s = SEV[i.severity] || SEV.medium
    return (
      <div key={i.issue_key} style={{ padding: '12px 0', borderBottom: '1px solid #EEE', display: 'flex', gap: 12, alignItems: 'flex-start', opacity: i.acked ? .7 : 1 }}>
        <span style={{ flexShrink: 0, marginTop: 2, fontSize: 10.5, fontWeight: 800, color: s.color, background: s.bg, borderRadius: 999, padding: '2px 9px' }}>{s.label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1B1B1B' }}>{i.title}</div>
          <div style={{ fontSize: 12.5, color: '#4A4A4A', marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>{i.detail}</div>
          {i.acked && <div style={{ fontSize: 11.5, color: '#6B6B6B', marginTop: 4 }}>Acknowledged{i.ack_note ? `: ${i.ack_note}` : ''}</div>}
        </div>
        <button disabled={busy === i.issue_key} onClick={() => (i.acked ? undo(i) : acknowledge(i))}
          style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, border: '1px solid #D5D5D5', background: '#fff', fontSize: 11.5, fontWeight: 700, color: '#333', cursor: 'pointer' }}>
          {busy === i.issue_key ? '...' : i.acked ? 'Undo' : 'Acknowledge'}
        </button>
      </div>
    )
  }

  return (
    <>
      {active.length > 0 && (
        <button onClick={() => setOpen(true)} className="books-check-banner"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 18px', border: 'none', borderBottom: '1px solid #F5B5B5',
            background: serious ? '#D92D20' : '#FFF4D6', color: serious ? '#fff' : '#7A5200', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          <span>
            Books check: {active.length} {active.length === 1 ? 'item needs' : 'items need'} attention
            {serious > 0 ? ` (${serious} serious)` : ''}
          </span>
          <span style={{ marginLeft: 'auto', textDecoration: 'underline', fontWeight: 800 }}>View</span>
        </button>
      )}

      {open && (
        <div role="dialog" aria-label="Books check" onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 720, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: '#fff', color: '#1B1B1B', borderRadius: 14, padding: '20px 22px', boxShadow: '0 24px 70px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Books check</div>
                <div style={{ fontSize: 12.5, color: '#6B6B6B', marginTop: 2 }}>
                  Checked live against the records. Fix an item and it disappears by itself; acknowledge one that is known and being dealt with.
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close"
                style={{ marginLeft: 'auto', border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#6B6B6B' }}>×</button>
            </div>
            {err && <div style={{ marginTop: 10, padding: 9, borderRadius: 8, background: '#FDECEC', color: '#8A1F1F', fontSize: 12.5 }}>{err}</div>}
            <div style={{ marginTop: 8 }}>
              {active.length === 0 && <div style={{ padding: '18px 0', fontSize: 13.5, color: '#1F7A3D', fontWeight: 700 }}>Nothing needs attention.</div>}
              {active.map(row)}
            </div>
            {acked.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#8A8A8A' }}>Acknowledged ({acked.length})</div>
                {acked.map(row)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
