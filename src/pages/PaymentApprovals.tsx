// ════════════════════════════════════════════════════════════════════════════
// PaymentApprovals.tsx
// CEO/admin screen for advance-paid invoices. An invoice marked "paid in
// advance" posts and deducts stock, but is held out of the Dispatch queue until
// an approver confirms the money actually landed. Approving it (with an optional
// bank reference) releases it to Dispatch. Gated by 'sales.approve_advance'.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface Hold {
  id: string; ref: string; customer_name: string | null; amount: number | null; status: string
  bank_ref: string | null; requested_by_name: string | null; approved_by_name: string | null
  approved_at: string | null; created_at: string | null
}

const tzs = (n: number | null | undefined) => (n == null ? 0 : n).toLocaleString('en-TZ', { maximumFractionDigits: 0 })
function fmt(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PaymentApprovals({ onNav: _onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const canApprove = isSuperAdmin() || can('sales.approve_advance')

  const [tab, setTab] = useState<'pending' | 'approved'>('pending')
  const [rows, setRows] = useState<Hold[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [bankRef, setBankRef] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('invoice_payment_holds')
      .select('id, ref, customer_name, amount, status, bank_ref, requested_by_name, approved_by_name, approved_at, created_at')
      .eq('status', tab)
      .order(tab === 'pending' ? 'created_at' : 'approved_at', { ascending: false }).limit(300)
    setRows((data || []) as Hold[]); setLoading(false)
  }, [tab])

  useEffect(() => { load() }, [load])

  const approve = async (h: Hold) => {
    setBusy(h.id)
    const { error } = await supabase.from('invoice_payment_holds').update({
      status: 'approved', bank_ref: bankRef.trim() || null,
      approved_by: user?.id || null, approved_by_name: user?.full_name || null, approved_at: new Date().toISOString(),
    }).eq('id', h.id)
    setBusy('')
    if (error) { flash('Failed: ' + error.message, 'err'); return }
    flash(`${h.ref} approved — released to Dispatch`)
    setExpanded(null); setBankRef('')
    setRows(prev => prev.filter(r => r.id !== h.id))
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Advance Payment Approvals</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Invoices marked paid in advance are held from Dispatch until you confirm the money has hit the bank.
      </p>

      <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
        {([['pending', 'Awaiting Approval'], ['approved', 'Approved']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => { setTab(k); setExpanded(null) }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${tab === k ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === k ? 'var(--accent)' : 'var(--surface2)', color: tab === k ? '#fff' : 'var(--text2)' }}>
            {lbl}{k === 'pending' && rows.length && tab === 'pending' ? ` (${rows.length})` : ''}
          </button>
        ))}
      </div>

      {!canApprove && (
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          You can view held invoices but need approval rights (CEO/admin) to release them.
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {!loading && (
        rows.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>{tab === 'pending' ? 'Nothing awaiting approval.' : 'No approved invoices yet.'}</div>
          : rows.map(h => (
            <div key={h.id} style={{ border: `1px solid ${tab === 'pending' ? 'var(--yellow, #d97706)' : 'var(--border)'}`, borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontFamily: 'var(--mono)' }}>{h.ref}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{h.customer_name || 'Customer'}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: 2 }}>TZS {tzs(h.amount)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    Raised {fmt(h.created_at)}{h.requested_by_name ? ` · by ${h.requested_by_name}` : ''}
                    {tab === 'approved' && <> · Approved {fmt(h.approved_at)} by {h.approved_by_name || '—'}{h.bank_ref ? ` · ref ${h.bank_ref}` : ''}</>}
                  </div>
                </div>
                {tab === 'pending' && canApprove && (
                  <button onClick={() => { setExpanded(expanded === h.id ? null : h.id); setBankRef('') }}
                    style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {expanded === h.id ? 'Close' : 'Confirm payment'}
                  </button>
                )}
              </div>
              {expanded === h.id && canApprove && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={bankRef} onChange={e => setBankRef(e.target.value)} placeholder="Bank / transaction reference (optional)"
                    style={{ flex: 1, minWidth: 220, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }} />
                  <button disabled={busy === h.id} onClick={() => approve(h)}
                    style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--green, #16a34a)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {busy === h.id ? 'Approving…' : 'Money received — release to Dispatch'}
                  </button>
                </div>
              )}
            </div>
          ))
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, color: '#fff', background: toast.type === 'ok' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 13, zIndex: 1000 }}>{toast.msg}</div>
      )}
    </div>
  )
}
