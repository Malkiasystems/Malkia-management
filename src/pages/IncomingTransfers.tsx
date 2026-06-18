// ════════════════════════════════════════════════════════════════════════════
// IncomingTransfers.tsx  (route: stock-transfer-approvals)
//
// Destination-side inbox for the two-phase stock transfer flow.
//   Incoming  : in-transit transfers heading to MY location — Accept / Reject.
//   Outgoing  : in-transit transfers I sent — Recall (returns stock to source).
//   History   : recently completed / rejected / cancelled transfers.
//
// Unrestricted users (super admins or users with no location lock) see every
// transfer. Locked users only see transfers touching their own location.
// Money (transfer value) is hidden from money-blind stock-workspace users.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { useAuth } from '../lib/useAuth'
import { useUserLocation } from '../lib/useUserLocation'
import { acceptTransfer, rejectTransfer, cancelTransfer, loadTransferRows, type TransferRow } from '../lib/stockTransferFlow'
import Toast from '../components/Toast'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  in_transit: { bg: '#3d8bff15', fg: '#3d8bff', label: 'In Transit' },
  completed:  { bg: '#10b98115', fg: '#10b981', label: 'Completed' },
  rejected:   { bg: '#ef444415', fg: '#ef4444', label: 'Rejected' },
  cancelled:  { bg: 'var(--surface2)', fg: 'var(--text3)', label: 'Recalled' },
}

export default function IncomingTransfers({ onNav: _onNav }: Props) {
  const { user, can } = useAuth()
  const userLoc = useUserLocation()
  const hideMoney = user?.workspace_role === 'stock'
  const canAccept = can('inventory.accept_transfer')

  const [tab, setTab] = useState<'incoming' | 'outgoing' | 'history'>('incoming')
  const [active, setActive] = useState<TransferRow[]>([])     // in_transit
  const [history, setHistory] = useState<TransferRow[]>([])   // terminal
  const [locMap, setLocMap] = useState<Record<string, { code: string; name: string }>>({})
  const [prodMap, setProdMap] = useState<Record<string, string>>({})
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(true)

  const showToast = (m: string, t: 'success' | 'error' = 'success') => { setToast(m); setToastType(t); setTimeout(() => setToast(''), 3500) }

  const load = async () => {
    setLoading(true)
    const [locRes, activeRows, histRows] = await Promise.all([
      supabase.from('stock_locations').select('id, code, name'),
      loadTransferRows(['in_transit']),
      loadTransferRows(['completed', 'rejected', 'cancelled']),
    ])
    const lm: Record<string, { code: string; name: string }> = {}
    ;(locRes.data || []).forEach((l: any) => { lm[l.id] = { code: l.code, name: l.name } })
    setLocMap(lm)
    setActive(activeRows)
    setHistory(histRows.slice(0, 60))

    // Resolve product names for everything on screen.
    const ids = new Set<string>()
    ;[...activeRows, ...histRows].forEach(r => (r.lines || []).forEach(l => ids.add(l.productId)))
    if (ids.size) {
      const { data: prods } = await supabase.from('products').select('id, name').in('id', [...ids])
      const pm: Record<string, string> = {}
      ;(prods || []).forEach((p: any) => { pm[p.id] = p.name })
      setProdMap(pm)
    }

    // Resolve the people who sent / accepted / rejected each transfer.
    const uids = new Set<string>()
    ;[...activeRows, ...histRows].forEach(r => {
      ;[r.requested_by, r.accepted_by, r.rejected_by].forEach(u => { if (u) uids.add(u) })
    })
    if (uids.size) {
      const { data: us } = await supabase.from('users').select('id, full_name').in('id', [...uids])
      const um: Record<string, string> = {}
      ;(us || []).forEach((u: any) => { um[u.id] = u.full_name })
      setUserMap(um)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const mine = userLoc.defaultLocationId
  const seeAll = userLoc.isUnrestricted

  const incoming = active.filter(r => seeAll || r.to_location_id === mine)
  const outgoing = active.filter(r => seeAll || r.from_location_id === mine)
  const hist = history.filter(r => seeAll || r.to_location_id === mine || r.from_location_id === mine)

  const doAccept = async (id: string) => {
    if (!user) return
    setBusy(id)
    const res = await acceptTransfer(id, user.id)
    setBusy(null)
    if (!res.success) { showToast(res.error || 'Could not accept', 'error'); return }
    showToast('Transfer accepted · stock added to your location')
    load()
  }

  const doReject = async (id: string) => {
    if (!user) return
    if (!reason.trim()) { showToast('A reason is required to reject', 'error'); return }
    setBusy(id)
    const res = await rejectTransfer(id, user.id, reason.trim())
    setBusy(null)
    if (!res.success) { showToast(res.error || 'Could not reject', 'error'); return }
    setRejecting(null); setReason('')
    showToast('Transfer rejected · stock returned to source')
    load()
  }

  const doCancel = async (id: string) => {
    if (!user) return
    setBusy(id)
    const res = await cancelTransfer(id, user.id)
    setBusy(null)
    if (!res.success) { showToast(res.error || 'Could not recall', 'error'); return }
    showToast('Transfer recalled · stock returned to source')
    load()
  }

  const loc = (id: string) => locMap[id] ? `${locMap[id].code} — ${locMap[id].name}` : id.slice(0, 8)
  const locCode = (id: string) => locMap[id]?.code || '?'
  const uname = (id: string | null) => id ? (userMap[id] || id.slice(0, 8)) : '—'
  const when = (ts: string | null) => ts ? new Date(ts).toLocaleString('en-GB') : ''
  const totalQty = (r: TransferRow) => (r.lines || []).reduce((s, l) => s + (l.qty || 0), 0)

  const rows = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : hist

  const card = (r: TransferRow) => {
    const isOpen = expanded === r.id
    const st = STATUS_STYLE[r.status] || STATUS_STYLE.in_transit
    return (
      <Fragment key={r.id}>
        <div className="card" style={{ marginBottom: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{r.ref}</span>
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: st.bg, color: st.fg, fontWeight: 700 }}>{st.label}</span>
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '1px 6px', borderRadius: 4 }}>{locCode(r.from_location_id)}</span>
                <span style={{ color: 'var(--blue)' }}>→</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: 'var(--green)', background: 'rgba(0,229,160,.1)', padding: '1px 6px', borderRadius: 4 }}>{locCode(r.to_location_id)}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{loc(r.to_location_id).split(' — ')[1] || ''}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                {(r.lines || []).length} item{(r.lines || []).length === 1 ? '' : 's'} · {totalQty(r)} units
                {!hideMoney && r.total_value > 0 && <> · {tzs(r.total_value)} at cost</>}
                {r.requested_at && <> · {new Date(r.requested_at).toLocaleString('en-GB')}</>}
              </div>
              {r.notes && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>{r.notes}</div>}
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>
                Sent by <strong style={{ color: 'var(--text2)' }}>{uname(r.requested_by)}</strong>
                {r.status === 'completed' && <> · Accepted by <strong style={{ color: 'var(--green)' }}>{uname(r.accepted_by)}</strong>{r.accepted_at ? ` · ${when(r.accepted_at)}` : ''}</>}
                {r.status === 'rejected' && <> · Rejected by <strong style={{ color: 'var(--red)' }}>{uname(r.rejected_by)}</strong>{r.rejected_at ? ` · ${when(r.rejected_at)}` : ''}</>}
                {r.status === 'cancelled' && <> · Recalled by <strong style={{ color: 'var(--text2)' }}>{uname(r.rejected_by)}</strong>{r.rejected_at ? ` · ${when(r.rejected_at)}` : ''}</>}
              </div>
              {r.status === 'rejected' && r.rejected_reason && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--red)' }}>Reason: {r.rejected_reason}</div>
              )}
            </div>
            <button onClick={() => setExpanded(isOpen ? null : r.id)} className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>
              {isOpen ? 'Hide' : 'Items'}
            </button>
          </div>

          {isOpen && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              {(r.lines || []).map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span>{prodMap[l.productId] || l.productId.slice(0, 8)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{l.qty}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'incoming' && r.status === 'in_transit' && !canAccept && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              You can view this transfer but do not have permission to accept it. Ask an admin to enable “Accept Incoming Transfers”.
            </div>
          )}

          {tab === 'incoming' && r.status === 'in_transit' && canAccept && (
            rejecting === r.id ? (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <input className="form-input" placeholder="Reason for rejection (required)" value={reason} onChange={e => setReason(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} disabled={busy === r.id} onClick={() => doReject(r.id)}>Confirm Reject</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(null); setReason('') }}>Back</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => doAccept(r.id)}>{busy === r.id ? 'Working…' : 'Accept'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(r.id); setReason('') }}>Reject</button>
              </div>
            )
          )}

          {tab === 'outgoing' && r.status === 'in_transit' && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => doCancel(r.id)}>{busy === r.id ? 'Working…' : 'Recall to source'}</button>
            </div>
          )}
        </div>
      </Fragment>
    )
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22 }}>Incoming Transfers</h2>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
          Stock in transit must be accepted before it lands at the destination. Reject or recall returns it to the source.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {([['incoming', `To Accept (${incoming.length})`], ['outgoing', `Sent (${outgoing.length})`], ['history', 'History']] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setExpanded(null); setRejecting(null) }}
            className={tab === k ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>{label}</button>
        ))}
        <button onClick={() => onNavGo()} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>+ New Transfer</button>
      </div>

      {tab === 'incoming' && !canAccept && (
        <div style={{ background: '#f59e0b14', border: '1px solid #f59e0b44', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
          You can see incoming transfers but cannot accept or reject them. Acceptance is controlled in <strong>Settings → User Management</strong> via the “Accept Incoming Transfers” permission.
        </div>
      )}

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>
          {tab === 'incoming' ? 'Nothing waiting to be accepted.' : tab === 'outgoing' ? 'Nothing in transit from your location.' : 'No past transfers.'}
        </div>
      ) : (
        rows.map(card)
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )

  function onNavGo() { _onNav('stock-transfer') }
}
