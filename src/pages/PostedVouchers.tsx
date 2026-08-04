// ════════════════════════════════════════════════════════════════════════════
// PostedVouchers.tsx
// Navision-style "Posted Vouchers" register. One screen for every posted voucher
// type: pick a type and its register shows with the columns that make sense for
// it. Columns are sortable (click a header), can be shown/hidden via the column
// chooser (remembered per type, per browser), and the visible list exports to
// Excel or PDF. Click a row to open a clean detail view; if the user holds the
// "Reprint Posted Documents" permission, sensitive types (cash sale, invoice,
// credit note) can be reprinted to PDF.
//
// Reads only. Nothing here edits or deletes a posted voucher.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo, useCallback } from 'react'
import { localIso } from '../lib/utils'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { renderElementToPdfBlob } from '../lib/customerDocuments'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }

// ─── Voucher type registry ──────────────────────────────────────────────────
interface TypeDef {
  key: string
  label: string
  refLabel: string
  party?: boolean      // has a customer/party
  credit?: boolean     // can carry an outstanding balance
  reprintable?: boolean
}
const TYPES: TypeDef[] = [
  { key: 'all',            label: 'All Vouchers',   refLabel: 'Ref' },
  { key: 'cash_sale',      label: 'Cash Sales',     refLabel: 'CS No.',      party: true, reprintable: true },
  { key: 'sales_invoice',  label: 'Sales Invoices', refLabel: 'Invoice No.', party: true, credit: true, reprintable: true },
  { key: 'cash_receipt',   label: 'Receipts',       refLabel: 'Receipt No.', party: true, reprintable: true },
  { key: 'cash_payment',   label: 'Payments',       refLabel: 'Payment No.' },
  { key: 'credit_note',    label: 'Credit Notes',   refLabel: 'CN No.',      party: true, credit: true, reprintable: true },
  { key: 'debit_note',     label: 'Debit Notes',    refLabel: 'DN No.',      party: true },
  { key: 'sales_return',   label: 'Sales Returns',  refLabel: 'SR No.',      party: true },
  { key: 'internal_use',   label: 'Internal Use',   refLabel: 'IU No.' },
  { key: 'contra',         label: 'Contra',         refLabel: 'Contra No.' },
  { key: 'bank_transfer',  label: 'Bank Transfers', refLabel: 'BT No.' },
  { key: 'journal_entry',  label: 'Journal',        refLabel: 'JV No.' },
]
function typeDef(key: string): TypeDef {
  return TYPES.find(t => t.key === key) || { key, label: key, refLabel: 'Ref' }
}

// ─── Row shape ──────────────────────────────────────────────────────────────
interface Row {
  id: string
  ref: string
  type: string
  posting_date: string | null
  created_at: string | null
  subtotal: number | null
  vat_amount: number | null
  total_amount: number | null
  status: string
  payment_method: string | null
  posted_by: string | null
  description: string | null
  customer_id: string | null
  customers?: { name: string | null; company: string | null; whatsapp: string | null } | null
  _outstanding?: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const tzs = (n: number | null | undefined) =>
  (n == null ? 0 : n).toLocaleString('en-TZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const num = (n: number | null | undefined) => (n == null ? 0 : n)
// VAT is the STORED vat_amount, full stop. The old derivation
// (total_amount - subtotal) was wrong for every voucher type it touched:
// on a cash sale that difference is the DELIVERY FEE (total = subtotal +
// delivery, see cashSalePost.ts), and on receipts, payments, petty cash,
// transfers and contras — where subtotal is 0 by design — it "found" VAT
// equal to the entire amount (an 80,000 receipt displayed VAT 80,000; a
// contra would have displayed VAT 117,000,000). Money-movement vouchers
// have no VAT; only the VAT engine writes vat_amount, so only it counts.
const vatOf = (r: Row) => num(r.vat_amount)
const partyOf = (r: Row) => r.customers?.company || r.customers?.name || '—'
function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Column registry ────────────────────────────────────────────────────────
interface Col {
  key: string
  label: string
  align: 'left' | 'right'
  text: (r: Row) => string
  sortVal: (r: Row) => string | number
}
const COLS: Col[] = [
  { key: 'ref',         label: 'Ref',         align: 'left',  text: r => r.ref,                       sortVal: r => r.ref },
  { key: 'type',        label: 'Type',        align: 'left',  text: r => typeDef(r.type).label,       sortVal: r => r.type },
  { key: 'datetime',    label: 'Date & Time', align: 'left',  text: r => fmtDateTime(r.created_at || r.posting_date), sortVal: r => r.created_at || r.posting_date || '' },
  { key: 'customer',    label: 'Customer',    align: 'left',  text: r => partyOf(r),                  sortVal: r => partyOf(r).toLowerCase() },
  { key: 'whatsapp',    label: 'WhatsApp',    align: 'left',  text: r => r.customers?.whatsapp || '—', sortVal: r => r.customers?.whatsapp || '' },
  { key: 'subtotal',    label: 'Subtotal',    align: 'right', text: r => tzs(r.subtotal),             sortVal: r => num(r.subtotal) },
  { key: 'vat',         label: 'VAT',         align: 'right', text: r => tzs(vatOf(r)),               sortVal: r => vatOf(r) },
  { key: 'total',       label: 'Amount',      align: 'right', text: r => tzs(r.total_amount),         sortVal: r => num(r.total_amount) },
  { key: 'outstanding', label: 'Outstanding', align: 'right', text: r => tzs(r._outstanding || 0),    sortVal: r => r._outstanding || 0 },
  { key: 'payment',     label: 'Payment',     align: 'left',  text: r => r.payment_method || '—',     sortVal: r => r.payment_method || '' },
  { key: 'posted_by',   label: 'Posted By',   align: 'left',  text: r => r.posted_by || '—',          sortVal: r => (r.posted_by || '').toLowerCase() },
  { key: 'status',      label: 'Status',      align: 'left',  text: r => r.status,                    sortVal: r => r.status },
]
const colDef = (key: string) => COLS.find(c => c.key === key)!

// Default visible columns per type
function defaultCols(typeKey: string): string[] {
  const t = typeDef(typeKey)
  const base = ['ref', 'datetime']
  if (typeKey === 'all') base.push('type')
  if (t.party) base.push('customer', 'whatsapp')
  base.push('total')
  if (t.credit) base.push('outstanding')
  if (['cash_sale', 'cash_receipt', 'cash_payment'].includes(typeKey)) base.push('payment')
  base.push('posted_by', 'status')
  return base
}
function loadColPrefs(typeKey: string): string[] {
  try {
    const raw = localStorage.getItem(`pv:cols:${typeKey}`)
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr }
  } catch { /* ignore */ }
  return defaultCols(typeKey)
}

const PAGE_SIZE = 100

export default function PostedVouchers({ onNav: _onNav }: Props) {
  const { can, isSuperAdmin } = useAuth()
  const canReprint = isSuperAdmin() || can('accounting.reprint')

  const [typeKey, setTypeKey] = useState('cash_sale')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)

  const [search, setSearch] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fStatus, setFStatus] = useState('')

  const [sortKey, setSortKey] = useState('datetime')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [visibleCols, setVisibleCols] = useState<string[]>(() => loadColPrefs('cash_sale'))
  const [showCols, setShowCols] = useState(false)

  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  // Reset column prefs + sort when the type changes
  useEffect(() => {
    setVisibleCols(loadColPrefs(typeKey))
    setSortKey('datetime'); setSortDir('desc')
  }, [typeKey])

  const persistCols = (cols: string[]) => {
    setVisibleCols(cols)
    try { localStorage.setItem(`pv:cols:${typeKey}`, JSON.stringify(cols)) } catch { /* ignore */ }
  }

  const load = useCallback(async (reset: boolean) => {
    setLoading(true)
    const start = reset ? 0 : offset
    let q = supabase
      .from('vouchers')
      .select('id, ref, type, posting_date, created_at, subtotal, vat_amount, total_amount, status, payment_method, posted_by, description, customer_id, customers(name, company, whatsapp)')
      .order('created_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1)

    if (typeKey !== 'all') q = q.eq('type', typeKey)
    if (fStatus) q = q.eq('status', fStatus)
    if (fFrom) q = q.gte('posting_date', fFrom)
    if (fTo) q = q.lte('posting_date', fTo)
    if (search.trim()) q = q.ilike('ref', `%${search.trim()}%`)

    const { data, error } = await q
    if (error) { setLoading(false); flash('Failed to load: ' + error.message, 'err'); return }
    let batch = (data || []) as unknown as Row[]

    // Outstanding from the customer ledger, for the refs we just loaded
    const refs = batch.map(r => r.ref).filter(Boolean)
    if (refs.length) {
      const { data: led } = await supabase
        .from('customer_ledger_entries')
        .select('document_ref, remaining_amount, is_open')
        .in('document_ref', refs)
      const map = new Map<string, number>()
      ;(led || []).forEach((l: any) => {
        if (l.is_open) map.set(l.document_ref, (map.get(l.document_ref) || 0) + (l.remaining_amount || 0))
      })
      batch = batch.map(r => ({ ...r, _outstanding: map.get(r.ref) || 0 }))
    }

    setHasMore(batch.length === PAGE_SIZE)
    setRows(reset ? batch : [...rows, ...batch])
    setOffset(start + batch.length)
    setLoading(false)
  }, [offset, rows, typeKey, fStatus, fFrom, fTo, search])

  useEffect(() => { load(true) /* eslint-disable-next-line */ }, [typeKey])

  const applyFilters = () => { setOffset(0); load(true) }

  const sorted = useMemo(() => {
    const c = colDef(sortKey)
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = c.sortVal(a), bv = c.sortVal(b)
      let r = 0
      if (typeof av === 'number' && typeof bv === 'number') r = av - bv
      else r = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? r : -r
    })
    return arr
  }, [rows, sortKey, sortDir])

  const clickSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const cols = visibleCols.map(colDef).filter(Boolean)

  // ── Detail ──
  const openDetail = async (id: string) => {
    setDetailLoading(true); setDetail({ id })
    const { data: v, error } = await supabase
      .from('vouchers')
      .select('*, customers(id, name, company, contact_person, whatsapp, address), voucher_lines(id, product_id, qty, unit_price, total, products(name, sku))')
      .eq('id', id)
      .single()
    if (error || !v) { setDetailLoading(false); setDetail(null); flash('Could not load voucher', 'err'); return }
    const { data: led } = await supabase
      .from('customer_ledger_entries')
      .select('remaining_amount, is_open')
      .eq('document_ref', v.ref)
    const outstanding = (led || []).filter((l: any) => l.is_open).reduce((s: number, l: any) => s + (l.remaining_amount || 0), 0)
    setDetail({ ...v, _outstanding: outstanding })
    setDetailLoading(false)
  }

  // ── Reprint (sensitive types only, permission-gated) ──
  const reprint = async () => {
    if (!detail) return
    setBusy('Generating PDF…')
    try {
      const el = buildPrintable(detail)
      document.body.appendChild(el)
      const blob = await renderElementToPdfBlob(el)
      document.body.removeChild(el)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${detail.ref}.pdf`; a.click()
      URL.revokeObjectURL(url)
      flash('Reprint downloaded')
    } catch (e: any) {
      flash('Reprint failed: ' + (e?.message || 'unknown'), 'err')
    } finally { setBusy('') }
  }

  // ── Export current visible list ──
  const exportExcel = () => {
    const header = cols.map(c => c.label)
    const body = sorted.map(r => cols.map(c => c.text(r)))
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, typeDef(typeKey).label.slice(0, 28))
    XLSX.writeFile(wb, `Posted_${typeKey}_${localIso(new Date())}.xlsx`)
  }
  const exportPdf = async () => {
    setBusy('Building PDF…')
    try {
      const el = buildListPdf(typeDef(typeKey).label, cols, sorted)
      document.body.appendChild(el)
      const blob = await renderElementToPdfBlob(el)
      document.body.removeChild(el)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Posted_${typeKey}_${localIso(new Date())}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { flash('PDF export failed: ' + (e?.message || 'unknown'), 'err') }
    finally { setBusy('') }
  }

  const def = typeDef(typeKey)
  const reprintAllowed = canReprint && def.reprintable

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Posted Vouchers</h1>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{rows.length} loaded</span>
      </div>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 0 }}>
        Permanent register of everything posted. Read-only.
      </p>

      {/* Type selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {TYPES.map(t => (
          <button key={t.key} onClick={() => setTypeKey(t.key)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${typeKey === t.key ? 'var(--accent)' : 'var(--border)'}`,
              background: typeKey === t.key ? 'var(--accent-dim, rgba(94,168,162,.15))' : 'var(--surface2)',
              color: typeKey === t.key ? 'var(--accent)' : 'var(--text2)',
            }}>{t.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${def.refLabel}…`}
          onKeyDown={e => e.key === 'Enter' && applyFilters()}
          style={inp as any} />
        <div><label style={lbl}>From</label><input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={inp as any} /></div>
        <div><label style={lbl}>To</label><input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={inp as any} /></div>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inp as any}>
          <option value="">All statuses</option>
          <option value="posted">Posted</option>
          <option value="draft">Draft</option>
          <option value="cancelled">Cancelled</option>
          <option value="void">Void</option>
        </select>
        <button onClick={applyFilters} style={btnPrimary}>Apply</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCols(s => !s)} style={btn}>Columns</button>
          <button onClick={exportExcel} style={btn}>Excel</button>
          <button onClick={exportPdf} style={btn}>PDF</button>
        </div>
      </div>

      {/* Column chooser */}
      {showCols && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12, marginBottom: 10, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
          {COLS.map(c => {
            const on = visibleCols.includes(c.key)
            return (
              <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={on}
                  onChange={() => persistCols(on ? visibleCols.filter(k => k !== c.key) : [...visibleCols, c.key])} />
                {c.label}
              </label>
            )
          })}
          <button onClick={() => persistCols(defaultCols(typeKey))} style={{ ...btn, fontSize: 11 }}>Reset to default</button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              {cols.map(c => (
                <th key={c.key} onClick={() => clickSort(c.key)}
                  style={{ textAlign: c.align, padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
                  {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} onClick={() => openDetail(r.id)}
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {cols.map(c => (
                  <td key={c.key} style={{ textAlign: c.align, padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: ['ref', 'subtotal', 'vat', 'total', 'outstanding'].includes(c.key) ? 'var(--mono)' : undefined }}>
                    {c.text(r)}
                  </td>
                ))}
              </tr>
            ))}
            {!sorted.length && !loading && (
              <tr><td colSpan={cols.length} style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>No posted {def.label.toLowerCase()} found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        {hasMore && <button onClick={() => load(false)} disabled={loading} style={btn}>{loading ? 'Loading…' : 'Load more'}</button>}
      </div>

      {/* Detail modal */}
      {detail && (
        <div onClick={() => setDetail(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={modal}>
            {detailLoading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.ref}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{typeDef(detail.type).label} · {detail.status}</div>
                  </div>
                  <button onClick={() => setDetail(null)} style={{ ...btn, padding: '4px 10px' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 14 }}>
                  <Field label="Date & Time" value={fmtDateTime(detail.created_at || detail.posting_date)} />
                  <Field label="Posted By" value={detail.posted_by || '—'} />
                  {detail.customers && <Field label="Customer" value={detail.customers.company || detail.customers.name || '—'} />}
                  {detail.customers?.whatsapp && <Field label="WhatsApp" value={detail.customers.whatsapp} />}
                  {detail.payment_method && <Field label="Payment" value={detail.payment_method} />}
                  {num(detail.subtotal) > 0 && <Field label="Subtotal" value={tzs(detail.subtotal)} />}
                  {num(detail.vat_amount) > 0 && <Field label="VAT" value={tzs(detail.vat_amount)} />}
                  <Field label="Amount" value={tzs(detail.total_amount)} />
                  {detail._outstanding > 0 && <Field label="Outstanding" value={tzs(detail._outstanding)} />}
                </div>

                {Array.isArray(detail.voucher_lines) && detail.voucher_lines.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr style={{ background: 'var(--surface2)' }}>
                        <th style={{ textAlign: 'left', padding: 8 }}>Item</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Price</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Total</th>
                      </tr></thead>
                      <tbody>
                        {detail.voucher_lines.map((l: any) => (
                          <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: 8 }}>{l.products?.name || l.product_id}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{l.qty}</td>
                            <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(l.unit_price)}</td>
                            <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(l.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  {reprintAllowed ? (
                    <button onClick={reprint} disabled={!!busy} style={btnPrimary}>{busy || 'Reprint'}</button>
                  ) : def.reprintable ? (
                    <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>Reprint requires permission</span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, color: '#fff', background: toast.type === 'ok' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', fontSize: 13, zIndex: 1000 }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  )
}

// ─── Off-screen printable builders (rendered to PDF via html2canvas) ─────────
function baseEl(width: number): HTMLDivElement {
  const el = document.createElement('div')
  el.style.position = 'fixed'; el.style.left = '-10000px'; el.style.top = '0'
  el.style.width = `${width}px`; el.style.padding = '28px'; el.style.background = '#ffffff'
  el.style.color = '#1a1a1a'; el.style.fontFamily = 'Arial, sans-serif'; el.style.fontSize = '12px'
  return el
}
function buildPrintable(v: any): HTMLDivElement {
  const el = baseEl(760)
  const lines = Array.isArray(v.voucher_lines) ? v.voucher_lines : []
  const lineRows = lines.map((l: any) =>
    `<tr><td style="padding:6px;border-top:1px solid #eee">${l.products?.name || ''}</td>
      <td style="padding:6px;text-align:right;border-top:1px solid #eee">${l.qty}</td>
      <td style="padding:6px;text-align:right;border-top:1px solid #eee">${tzs(l.unit_price)}</td>
      <td style="padding:6px;text-align:right;border-top:1px solid #eee">${tzs(l.total)}</td></tr>`).join('')
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #5EA8A2;padding-bottom:10px;margin-bottom:14px">
      <div><div style="font-size:18px;font-weight:800;color:#5E2230">Malkia Wellness Group Ltd</div>
        <div style="color:#666">${typeDef(v.type).label}</div></div>
      <div style="text-align:right"><div style="font-size:16px;font-weight:800">${v.ref}</div>
        <div style="color:#666">${fmtDateTime(v.created_at || v.posting_date)}</div></div>
    </div>
    <div style="margin-bottom:12px">
      ${v.customers ? `<div><b>Customer:</b> ${v.customers.company || v.customers.name || ''}</div>` : ''}
      ${v.customers?.whatsapp ? `<div><b>WhatsApp:</b> ${v.customers.whatsapp}</div>` : ''}
      <div><b>Posted by:</b> ${v.posted_by || ''}</div>
      <div><b>Status:</b> ${v.status}</div>
    </div>
    ${lines.length ? `<table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <thead><tr style="background:#f4f4f4"><th style="padding:6px;text-align:left">Item</th>
      <th style="padding:6px;text-align:right">Qty</th><th style="padding:6px;text-align:right">Price</th>
      <th style="padding:6px;text-align:right">Total</th></tr></thead><tbody>${lineRows}</tbody></table>` : ''}
    <div style="text-align:right;border-top:2px solid #ddd;padding-top:8px">
      <div>Subtotal: <b>${tzs(v.subtotal)}</b></div>
      ${num(v.vat_amount) > 0 ? `<div>VAT: <b>${tzs(num(v.vat_amount))}</b></div>` : ''}
      <div style="font-size:15px">Total: <b>${tzs(v.total_amount)}</b></div>
      ${v._outstanding > 0 ? `<div style="color:#b91c1c">Outstanding: <b>${tzs(v._outstanding)}</b></div>` : ''}
    </div>
    <div style="margin-top:24px;color:#999;font-size:10px;text-align:center">Reprint · generated ${new Date().toLocaleString('en-GB')}</div>`
  return el
}
function buildListPdf(title: string, cols: Col[], data: Row[]): HTMLDivElement {
  const el = baseEl(1000)
  const head = cols.map(c => `<th style="padding:6px;text-align:${c.align};border-bottom:2px solid #5EA8A2">${c.label}</th>`).join('')
  const body = data.map(r => `<tr>${cols.map(c => `<td style="padding:5px 6px;text-align:${c.align};border-bottom:1px solid #eee">${c.text(r)}</td>`).join('')}</tr>`).join('')
  el.innerHTML = `
    <div style="font-size:16px;font-weight:800;color:#5E2230;margin-bottom:4px">Posted ${title}</div>
    <div style="color:#666;margin-bottom:12px">${data.length} records · generated ${new Date().toLocaleString('en-GB')}</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#f4f4f4">${head}</tr></thead><tbody>${body}</tbody></table>`
  return el
}

// ─── styles ─────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, color: 'var(--text3)', marginBottom: 2 }
const btn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: 20 }
const modal: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }
