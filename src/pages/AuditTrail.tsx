// ════════════════════════════════════════════════════════════════════════════
// AuditTrail.tsx
// Read-only viewer over the append-only audit_log (migration 015). Shows who did
// what and when across vouchers, transfers, approvals, customers, products, and
// users, with filters and a per-row change diff. The log itself cannot be edited
// or deleted from the app; this screen only reads it.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }

interface AuditRow {
  id: number
  changed_at: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  table_name: string
  document_type: string | null
  document_ref: string | null
  record_id: string | null
  actor_name: string | null
  actor_email: string | null
  old_data: Record<string, any> | null
  new_data: Record<string, any> | null
}

const TABLE_LABELS: Record<string, string> = {
  vouchers: 'Vouchers (sales, receipts, payments…)',
  stock_transfer_requests: 'Stock Transfers',
  approval_requests: 'Approvals',
  customers: 'Customers',
  products: 'Products',
  users: 'Users & Permissions',
}

const ACTION_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  INSERT: { bg: 'rgba(0,229,160,.12)', fg: 'var(--green, #00e5a0)', label: 'Created' },
  UPDATE: { bg: 'rgba(245,158,11,.12)', fg: 'var(--yellow, #f59e0b)', label: 'Edited' },
  DELETE: { bg: 'rgba(255,71,87,.12)', fg: 'var(--red, #ff4757)', label: 'Deleted' },
}

const PAGE_SIZE = 50
// Fields too noisy to show in a diff
const HIDE_KEYS = new Set(['updated_at', 'created_at', 'last_updated', 'search_vector'])

function fmtVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function changedFields(oldD: any, newD: any): { key: string; from: string; to: string }[] {
  if (!oldD || !newD) return []
  const keys = new Set([...Object.keys(oldD), ...Object.keys(newD)])
  const out: { key: string; from: string; to: string }[] = []
  keys.forEach(k => {
    if (HIDE_KEYS.has(k)) return
    const a = oldD[k], b = newD[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ key: k, from: fmtVal(a), to: fmtVal(b) })
  })
  return out
}

export default function AuditTrail({ onNav: _onNav }: Props) {
  const { isSuperAdmin } = useAuth()
  const allowed = isSuperAdmin()

  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const [fAction, setFAction] = useState('')
  const [fTable, setFTable] = useState('')
  const [fActor, setFActor] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  const load = useCallback(async (reset: boolean) => {
    setLoading(true)
    const start = reset ? 0 : offset
    let q = supabase
      .from('audit_log_view')
      .select('*')
      .order('changed_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1)

    if (fAction) q = q.eq('action', fAction)
    if (fTable) q = q.eq('table_name', fTable)
    if (fActor.trim()) q = q.ilike('actor_name', `%${fActor.trim()}%`)
    if (fFrom) q = q.gte('changed_at', fFrom)
    if (fTo) q = q.lte('changed_at', fTo + 'T23:59:59.999')

    const { data, error } = await q
    if (error) { setLoading(false); return }
    const batch = (data || []) as AuditRow[]
    setHasMore(batch.length === PAGE_SIZE)
    setRows(reset ? batch : [...rows, ...batch])
    setOffset(start + batch.length)
    setLoading(false)
  }, [offset, rows, fAction, fTable, fActor, fFrom, fTo])

  useEffect(() => { if (allowed) load(true) /* eslint-disable-next-line */ }, [allowed])

  const applyFilters = () => { setOffset(0); load(true) }
  const clearFilters = () => {
    setFAction(''); setFTable(''); setFActor(''); setFFrom(''); setFTo('')
    setOffset(0)
    setTimeout(() => load(true), 0)
  }

  if (!allowed) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontFamily: 'var(--display)', marginBottom: 8 }}>Audit Trail</h2>
        <p style={{ color: 'var(--text3)' }}>
          The audit trail is restricted to administrators. Ask a super admin if you need access.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800 }}>Audit Trail</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          Every create, edit, and delete on vouchers, transfers, approvals, customers, products, and users. Append-only, captured by the database with the real user and exact time.
        </p>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Action">
          <select className="form-input" value={fAction} onChange={e => setFAction(e.target.value)}>
            <option value="">All</option>
            <option value="INSERT">Created</option>
            <option value="UPDATE">Edited</option>
            <option value="DELETE">Deleted</option>
          </select>
        </Field>
        <Field label="Area">
          <select className="form-input" value={fTable} onChange={e => setFTable(e.target.value)}>
            <option value="">All</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="User contains">
          <input className="form-input" placeholder="name" value={fActor} onChange={e => setFActor(e.target.value)} />
        </Field>
        <Field label="From">
          <input type="date" className="form-input" value={fFrom} onChange={e => setFFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className="form-input" value={fTo} onChange={e => setFTo(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-sm" onClick={applyFilters}>Apply</button>
        <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 90px 1fr 160px 40px', gap: 0, fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <div>When</div><div>Action</div><div>What</div><div>Who</div><div></div>
        </div>

        {rows.length === 0 && !loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No audit entries match these filters. As the system is used, actions will appear here.
          </div>
        )}

        {rows.map(r => {
          const st = ACTION_STYLE[r.action] || ACTION_STYLE.UPDATE
          const isOpen = expanded === r.id
          const diffs = r.action === 'UPDATE' ? changedFields(r.old_data, r.new_data) : []
          const snap = r.action === 'DELETE' ? r.old_data : r.new_data
          return (
            <div key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                onClick={() => setExpanded(isOpen ? null : r.id)}
                style={{ display: 'grid', gridTemplateColumns: '160px 90px 1fr 160px 40px', gap: 0, padding: '10px 14px', cursor: 'pointer', alignItems: 'center', background: isOpen ? 'var(--surface2)' : 'transparent' }}>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{new Date(r.changed_at).toLocaleString()}</div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: st.bg, color: st.fg }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{TABLE_LABELS[r.table_name]?.split(' (')[0] || r.table_name}</span>
                  {r.document_ref && <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', marginLeft: 8 }}>{r.document_ref}</span>}
                  {r.document_type && r.document_type !== r.table_name && <span style={{ color: 'var(--text3)', marginLeft: 8, fontSize: 11 }}>{r.document_type}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{r.actor_name || 'system'}</div>
                <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</div>
              </div>

              {isOpen && (
                <div style={{ padding: '12px 18px 16px', background: 'var(--surface2)', fontSize: 12 }}>
                  <div style={{ color: 'var(--text3)', marginBottom: 8 }}>
                    {r.actor_email && <span>{r.actor_email} · </span>}
                    record id {r.record_id || '—'}
                  </div>
                  {r.action === 'UPDATE' ? (
                    diffs.length === 0 ? (
                      <div style={{ color: 'var(--text3)' }}>No visible field changes (timestamps only).</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 6 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase' }}>Field</div>
                        <div style={{ fontWeight: 700, color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase' }}>From</div>
                        <div style={{ fontWeight: 700, color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase' }}>To</div>
                        {diffs.map(d => (
                          <Row3 key={d.key} a={d.key} b={d.from} c={d.to} />
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 6 }}>
                      {snap && Object.entries(snap)
                        .filter(([k]) => !HIDE_KEYS.has(k))
                        .map(([k, v]) => <Row2 key={k} a={k} b={fmtVal(v)} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 10 }}>
        {hasMore && (
          <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => load(false)}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
        {loading && rows.length === 0 && <span style={{ color: 'var(--text3)', fontSize: 12 }}>Loading…</span>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </div>
  )
}
function Row3({ a, b, c }: { a: string; b: string; c: string }) {
  return (
    <>
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{a}</div>
      <div style={{ color: 'var(--text3)', wordBreak: 'break-word' }}>{b}</div>
      <div style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{c}</div>
    </>
  )
}
function Row2({ a, b }: { a: string; b: string }) {
  return (
    <>
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{a}</div>
      <div style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{b}</div>
    </>
  )
}
