// ════════════════════════════════════════════════════════════════════════════
// StockMovements.tsx
// The stockist's inbound verification screen. Reads the stock ledger
// (item_ledger_entries), the tamper-proof source of truth: every GRN, credit
// note, adjustment, return, purchase, sale and transfer writes a row there.
// Grouped by document. Stock-in documents can be Acknowledged once verified
// against the physical goods; anything unacknowledged is a follow-up item and
// feeds the notification badge. Defaults to Stock In.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }

interface Entry {
  entry_type: string; document_type: string | null; document_ref: string | null
  posting_date: string | null; created_at: string | null; qty: number; location_code: string | null
  products?: { name: string | null; sku: string | null } | null
}
interface DocGroup {
  ref: string; type: string; direction: 'in' | 'out'; date: string | null; location: string | null
  lines: { name: string; qty: number }[]; totalQty: number; posted_by?: string | null
  acknowledged?: boolean; ackBy?: string | null
}

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Purchase / GRN', grn: 'Goods Received (GRN)', return: 'Customer Return',
  credit_note: 'Credit Note', sales_return: 'Sales Return', positive_adjustment: 'Positive Adjustment',
  inventory_adjustment: 'Stock Adjustment', stock_adjustment: 'Stock Adjustment', opening_stock: 'Opening Stock',
  transfer_in: 'Transfer In', transfer_out: 'Transfer Out', sale: 'Sale', internal_use: 'Internal Use',
  purchase_return: 'Purchase Return', import_receive: 'Import Received',
  kit_assembly: 'Kit Assembly', assembly_in: 'Kit Assembled', assembly_out: 'Component to Kit',
}
const label = (docType: string | null, entryType: string) =>
  TYPE_LABEL[docType || ''] || TYPE_LABEL[entryType] || (docType || entryType).replace(/_/g, ' ')

function fmt(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function StockMovements({ onNav: _onNav }: Props) {
  const { user } = useAuth()
  const [groups, setGroups] = useState<DocGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [dir, setDir] = useState<'in' | 'out' | 'all'>('in')
  const [fromDate, setFromDate] = useState('')
  const [search, setSearch] = useState('')
  const [followupOnly, setFollowupOnly] = useState(false)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('item_ledger_entries')
      .select('entry_type, document_type, document_ref, posting_date, created_at, qty, location_code, products(name, sku)')
      .order('created_at', { ascending: false }).limit(1000)
    if (dir === 'in') q = q.gt('qty', 0)
    else if (dir === 'out') q = q.lt('qty', 0)
    if (fromDate) q = q.gte('posting_date', fromDate)
    const [{ data, error }, { data: acks }] = await Promise.all([
      q,
      supabase.from('stock_in_ack').select('document_ref, acknowledged_by_name'),
    ])
    if (error) { setLoading(false); setGroups([]); return }
    const ackByRef = new Map<string, string | null>()
    ;(acks || []).forEach((a: any) => ackByRef.set(a.document_ref, a.acknowledged_by_name))

    const map = new Map<string, DocGroup>()
    ;(data as unknown as Entry[] || []).forEach(e => {
      const ref = e.document_ref || '(no ref)'
      const key = ref + '|' + e.entry_type
      let g = map.get(key)
      if (!g) {
        g = { ref, type: label(e.document_type, e.entry_type), direction: e.qty >= 0 ? 'in' : 'out',
          date: e.created_at || e.posting_date, location: e.location_code, lines: [], totalQty: 0,
          acknowledged: ackByRef.has(ref), ackBy: ackByRef.get(ref) || null }
        map.set(key, g)
      }
      g.lines.push({ name: e.products?.name || 'Item', qty: e.qty })
      g.totalQty += Math.abs(e.qty)
    })
    let arr = Array.from(map.values())
    const refs = Array.from(new Set(arr.map(g => g.ref))).filter(r => r !== '(no ref)').slice(0, 300)
    if (refs.length) {
      const { data: vs } = await supabase.from('vouchers').select('ref, posted_by').in('ref', refs)
      const byRef = new Map<string, string>()
      ;(vs || []).forEach((v: any) => byRef.set(v.ref, v.posted_by))
      arr = arr.map(g => ({ ...g, posted_by: byRef.get(g.ref) || null }))
    }
    setGroups(arr); setLoading(false)
  }, [dir, fromDate])

  useEffect(() => { load() }, [load])

  const acknowledge = async (g: DocGroup) => {
    setBusy(g.ref)
    const { error } = await supabase.from('stock_in_ack').insert({
      document_ref: g.ref, acknowledged_by: user?.id || null, acknowledged_by_name: user?.full_name || null,
    })
    setBusy('')
    if (error && !error.message.includes('duplicate')) { flash('Failed: ' + error.message, 'err'); return }
    flash(`${g.ref} verified`)
    setGroups(prev => prev.map(x => x.ref === g.ref ? { ...x, acknowledged: true, ackBy: user?.full_name || null } : x))
  }

  const pendingCount = groups.filter(g => g.direction === 'in' && !g.acknowledged).length

  const visible = groups.filter(g => {
    if (followupOnly && !(g.direction === 'in' && !g.acknowledged)) return false
    if (!search.trim()) return true
    const s = search.trim().toLowerCase()
    return g.ref.toLowerCase().includes(s) || g.type.toLowerCase().includes(s) || g.lines.some(l => l.name.toLowerCase().includes(s))
  })

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Stock Movements</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Every documented change to stock, from the ledger. Verify incoming stock (GRNs, credit notes, transfers in, adjustments) against the physical goods, then acknowledge it.
      </p>

      <div style={{ display: 'flex', gap: 6, margin: '12px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        {([['in', 'Stock In'], ['out', 'Stock Out'], ['all', 'All']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setDir(k)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${dir === k ? 'var(--accent)' : 'var(--border)'}`,
              background: dir === k ? 'var(--accent)' : 'var(--surface2)', color: dir === k ? '#fff' : 'var(--text2)' }}>{lbl}</button>
        ))}
        <button onClick={() => { setFollowupOnly(f => !f); setDir('in') }}
          style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${followupOnly ? 'var(--yellow, #d97706)' : 'var(--border)'}`,
            background: followupOnly ? 'rgba(217,119,6,.15)' : 'var(--surface2)', color: followupOnly ? 'var(--yellow, #d97706)' : 'var(--text2)' }}>
          Needs follow-up{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ref / product / type"
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, width: 200 }} />
          <label style={{ fontSize: 11, color: 'var(--text3)' }}>From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
        </div>
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {!loading && (
        visible.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>{followupOnly ? 'Nothing to follow up — all incoming stock is verified.' : 'No stock movements found.'}</div>
          : visible.map((g, i) => {
            const needsAck = g.direction === 'in' && !g.acknowledged
            return (
              <div key={g.ref + i} style={{ border: `1px solid ${needsAck ? 'var(--yellow, #d97706)' : 'var(--border)'}`, borderRadius: 10, padding: 14, marginBottom: 8, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontFamily: 'var(--mono)' }}>{g.ref}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: g.direction === 'in' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}>{g.direction === 'in' ? '↑ IN' : '↓ OUT'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{g.type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{fmt(g.date)} · {g.location || '—'} · {g.totalQty} units{g.posted_by ? ` · by ${g.posted_by}` : ''}</div>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {g.lines.slice(0, 8).map((l, idx) => (
                        <span key={idx} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'var(--surface2)', border: '1px solid var(--border)' }}>{Math.abs(l.qty)} × {l.name}</span>
                      ))}
                      {g.lines.length > 8 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>+{g.lines.length - 8} more</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {g.direction === 'in' && (
                      g.acknowledged
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #16a34a)' }}>✓ Verified{g.ackBy ? ` · ${g.ackBy}` : ''}</span>
                        : <button disabled={busy === g.ref} onClick={() => acknowledge(g)}
                            style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            {busy === g.ref ? 'Saving…' : 'Mark verified'}
                          </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
      )}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Showing up to 1000 recent ledger lines. Narrow with the date filter to go further back.</div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, color: '#fff', background: toast.type === 'ok' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 13, zIndex: 1000 }}>{toast.msg}</div>
      )}
    </div>
  )
}
