// ============================================================================
// ApprovalNag.tsx
//
// The homepage's un-ignorable approval notifications. Born from IU-10-0031
// and 0032 sitting assigned-and-invisible for eleven days (Aug 2026): the
// approvals queue only informs people who already visit it, which is nobody.
//
// Two modals, both deliberately WITHOUT a close X, backdrop dismiss, or
// Escape — the only way past them is the action itself:
//
//   APPROVER: pending requests assigned to the signed-in user. One exit:
//   "Review approvals now", which navigates to the queue. Reappears on every
//   homepage visit until the queue is cleared — that is the nag, by design.
//
//   REQUESTER: their own requests that were approved/rejected and not yet
//   acknowledged. Each item has its own "Sawa — noted" which stamps
//   requester_ack; the modal releases when the last one is acknowledged.
//   Rejections show the approver's comment so the answer travels with the no.
//
// Approver modal wins when both apply — other people are waiting on them.
// ============================================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Page } from '../lib/types'

interface Req {
  id: string
  reference_number: string
  request_summary: string
  status: string
  requested_at: string
  resolved_at: string | null
  resolution_comment: string | null
  requested_by: string
  assigned_to: string
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

export default function ApprovalNag({ onNav }: { onNav: (p: Page) => void }) {
  const { user } = useAuth()
  const [assigned, setAssigned] = useState<Req[]>([])
  const [decided, setDecided] = useState<Req[]>([])
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user?.id) return
    ;(async () => {
      const [{ data: a }, { data: d }, { data: u }] = await Promise.all([
        supabase.from('approval_requests')
          .select('id, reference_number, request_summary, status, requested_at, resolved_at, resolution_comment, requested_by, assigned_to')
          .eq('assigned_to', user.id).eq('status', 'pending')
          .order('requested_at', { ascending: true }),
        supabase.from('approval_requests')
          .select('id, reference_number, request_summary, status, requested_at, resolved_at, resolution_comment, requested_by, assigned_to')
          .eq('requested_by', user.id).eq('requester_ack', false)
          .in('status', ['approved', 'rejected'])
          .order('resolved_at', { ascending: true }),
        supabase.from('users').select('id, full_name'),
      ])
      setAssigned(a || [])
      setDecided(d || [])
      setNames(Object.fromEntries((u || []).map((x: any) => [x.id, x.full_name])))
    })()
  }, [user?.id])

  const ack = async (id: string) => {
    await supabase.from('approval_requests').update({ requester_ack: true }).eq('id', id)
    setDecided(ds => ds.filter(x => x.id !== id))
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(10,20,18,0.72)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)',
  }
  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
    padding: 24, width: 520, maxWidth: '94vw', maxHeight: '82vh', overflowY: 'auto',
    boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
  }

  // ── Approver nag: people are waiting on YOU ────────────────────────────
  if (assigned.length > 0) {
    const oldest = daysSince(assigned[0].requested_at)
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
            Action required — approvals waiting on you
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px' }}>
            {assigned.length} request{assigned.length > 1 ? 's' : ''} need{assigned.length > 1 ? '' : 's'} your decision
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
            {oldest >= 1 ? `The oldest has waited ${oldest} day${oldest > 1 ? 's' : ''}. ` : ''}
            Someone cannot finish their work until you decide.
          </div>
          {assigned.map(r => (
            <div key={r.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, background: daysSince(r.requested_at) >= 2 ? 'rgba(220,80,60,0.08)' : 'var(--surface2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <strong style={{ fontFamily: 'var(--mono)' }}>{r.reference_number}</strong>
                <span style={{ color: daysSince(r.requested_at) >= 2 ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  {daysSince(r.requested_at) === 0 ? 'today' : `${daysSince(r.requested_at)}d waiting`}
                </span>
              </div>
              <div style={{ fontSize: 12, marginTop: 3 }}>{r.request_summary}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>By {names[r.requested_by] || 'Unknown'}</div>
            </div>
          ))}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8, padding: '12px 0', fontSize: 14 }}
            onClick={() => onNav('approvals' as Page)}>
            Review approvals now →
          </button>
          {/* No close, no dismiss — the button IS the exit. That is the point. */}
        </div>
      </div>
    )
  }

  // ── Requester notices: your requests were decided ──────────────────────
  if (decided.length > 0) {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
            Your requests have been decided
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 14px' }}>
            {decided.length} decision{decided.length > 1 ? 's' : ''} for you
          </div>
          {decided.map(r => (
            <div key={r.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, background: r.status === 'approved' ? 'rgba(45,122,79,0.08)' : 'rgba(220,80,60,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <strong style={{ fontFamily: 'var(--mono)' }}>{r.reference_number}</strong>
                <span style={{ fontWeight: 700, color: r.status === 'approved' ? 'var(--green)' : 'var(--red)', fontSize: 11, textTransform: 'uppercase' }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 3 }}>{r.request_summary}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                Decided by {names[r.assigned_to] || 'approver'}{r.resolved_at ? ` · ${new Date(r.resolved_at).toLocaleDateString()}` : ''}
              </div>
              {r.status === 'rejected' && r.resolution_comment && (
                <div style={{ fontSize: 11, marginTop: 6, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 6, color: 'var(--text2)' }}>
                  Reason: {r.resolution_comment}
                </div>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, fontSize: 11 }} onClick={() => ack(r.id)}>
                Sawa — noted
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}
