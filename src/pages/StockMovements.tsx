// ════════════════════════════════════════════════════════════════════════════
// StockMovements.tsx
// The stockist's inbound verification screen — the mirror of Dispatch.
// Reads the stock ledger (item_ledger_entries), the tamper-proof source of
// truth: every GRN, credit note, adjustment, return, purchase, sale, and
// transfer writes a row there, so nothing can be missed and nothing fake can
// hide. Grouped by document so each one is a single line to check against the
// physical goods. Defaults to Stock In (everything that adds stock). Read-only.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
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
}

// friendly labels for the movement type
const TYPE_LABEL: Record<string, string> = {
  purchase: 'Purchase / GRN', grn: 'Goods Received (GRN)', return: 'Customer Return',
  credit_note: 'Credit Note', sales_return: 'Sales Return', positive_adjustment: 'Positive Adjustment',
  inventory_adjustment: 'Stock Adjustment', stock_adjustment: 'Stock Adjustment', opening_stock: 'Opening Stock',
  transfer_in: 'Transfer In', transfer_out: 'Transfer Out', sale: 'Sale', internal_use: 'Internal Use',
  purchase_return: 'Purchase Return', import_receive: 'Import Received',
}
const label = (docType: string | null, entryType: string) =>
  TYPE_LABEL[docType || ''] || TYPE_LABEL[entryType] || (docType || entryType).replace(/_/g, ' ')

function fmt(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function StockMovements({ onNav: _onNav }: Props) {
  const [groups, setGroups] = useState<DocGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [dir, setDir] = useState<'in' | 'out' | 'all'>('in')
  const [fromDate, setFromDate] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('item_ledger_entries')
      .select('entry_type, document_type, document_ref, posting_date, created_at, qty, location_code, products(name, sku)')
      .order('created_at', { ascending: false }).limit(1000)
    if (dir === 'in') q = q.gt('qty', 0)
    else if (dir === 'out') q = q.lt('qty', 0)
    if (fromDate) q = q.gte('posting_date', fromDate)
    const { data, error } = await q
    if (error) { setLoading(false); setGroups([]); return }

    // group by document_ref
    const map = new Map<string, DocGroup>()
    ;(data as unknown as Entry[] || []).forEach(e => {
      const ref = e.document_ref || '(no ref)'
      const key = ref + '|' + (e.entry_type)
      let g = map.get(key)
      if (!g) {
        g = { ref, type: label(e.document_type, e.entry_type), direction: e.qty >= 0 ? 'in' : 'out',
          date: e.created_at || e.posting_date, location: e.location_code, lines: [], totalQty: 0 }
        map.set(key, g)
      }
      g.lines.push({ name: e.products?.name || 'Item', qty: e.qty })
      g.totalQty += Math.abs(e.qty)
    })
    let arr = Array.from(map.values())

    // attach who posted, from the vouchers table by ref
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

  const visible = groups.filter(g => {
    if (!search.trim()) return true
    const s = search.trim().toLowerCase()
    return g.ref.toLowerCase().includes(s) || g.type.toLowerCase().includes(s) ||
      g.lines.some(l => l.name.toLowerCase().includes(s))
  })

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Stock Movements</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Every documented change to stock, from the ledger. Verify GRNs, credit notes, adjustments and returns against the physical goods. Read-only.
      </p>

      <div style={{ display: 'flex', gap: 6, margin: '12px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        {([['in', 'Stock In'], ['out', 'Stock Out'], ['all', 'All']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setDir(k)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${dir === k ? 'var(--accent)' : 'var(--border)'}`,
              background: dir === k ? 'var(--accent)' : 'var(--surface2)', color: dir === k ? '#fff' : 'var(--text2)' }}>{lbl}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ref / product / type"
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, width: 220 }} />
          <label style={{ fontSize: 11, color: 'var(--text3)' }}>From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
        </div>
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {!loading && (
        visible.length === 0
          ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>No stock movements found.</div>
          : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: 'var(--surface2)' }}>
                  {['Date', 'Document', 'Type', 'Dir', 'Items', 'Qty', 'Location', 'By'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Qty' ? 'right' : 'left', padding: '10px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {visible.map((g, i) => (
                    <tr key={g.ref + i} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text3)' }}>{fmt(g.date)}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{g.ref}</td>
                      <td style={{ padding: '9px 12px' }}>{g.type}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: g.direction === 'in' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}>
                          {g.direction === 'in' ? '↑ IN' : '↓ OUT'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {g.lines.slice(0, 6).map((l, idx) => (
                            <span key={idx} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 5, background: 'var(--surface2)', border: '1px solid var(--border)' }}>{Math.abs(l.qty)} × {l.name}</span>
                          ))}
                          {g.lines.length > 6 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>+{g.lines.length - 6} more</span>}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{g.totalQty}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)' }}>{g.location || '—'}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text3)' }}>{g.posted_by || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Showing up to 1000 recent ledger lines. Narrow with the date filter to go further back.</div>
    </div>
  )
}
