// ════════════════════════════════════════════════════════════════════════════
// StockMovementReport.tsx
// Summarised stock movement report over a chosen day / week / month. Reads the
// ledger for the period and totals movements by product and by type, in vs out
// vs net. Printable (PDF) and exportable (CSV). Read-only.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { renderElementToPdfBlob } from '../lib/customerDocuments'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface Entry { entry_type: string; document_type: string | null; qty: number; location_code: string | null; products?: { name: string | null; sku: string | null } | null }
interface ProdRow { name: string; sku: string; inQty: number; outQty: number }
interface TypeRow { type: string; inQty: number; outQty: number; docs: number }

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Purchase / GRN', grn: 'Goods Received (GRN)', return: 'Customer Return', credit_note: 'Credit Note',
  sales_return: 'Sales Return', positive_adjustment: 'Positive Adjustment', inventory_adjustment: 'Stock Adjustment',
  stock_adjustment: 'Stock Adjustment', opening_stock: 'Opening Stock', transfer_in: 'Transfer In', transfer_out: 'Transfer Out',
  sale: 'Sale', internal_use: 'Internal Use', purchase_return: 'Purchase Return', import_receive: 'Import Received',
}
const tlabel = (dt: string | null, et: string) => TYPE_LABEL[dt || ''] || TYPE_LABEL[et] || (dt || et).replace(/_/g, ' ')
const n = (x: number) => x.toLocaleString('en-TZ', { maximumFractionDigits: 0 })

function iso(d: Date) { const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
function weekStart() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return iso(d) }
function monthStart() { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)) }

export default function StockMovementReport({ onNav: _onNav }: Props) {
  const [from, setFrom] = useState(weekStart())
  const [to, setTo] = useState(iso(new Date()))
  const [byProduct, setByProduct] = useState<ProdRow[]>([])
  const [byType, setByType] = useState<TypeRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('item_ledger_entries')
      .select('entry_type, document_type, document_ref, qty, location_code, products(name, sku)')
      .gte('posting_date', from).lte('posting_date', to).limit(5000)
    const prods = new Map<string, ProdRow>()
    const types = new Map<string, TypeRow & { _refs: Set<string> }>()
    ;(data as unknown as (Entry & { document_ref: string | null })[] || []).forEach(e => {
      const nm = e.products?.name || 'Item'; const sku = e.products?.sku || ''
      const pr = prods.get(nm) || { name: nm, sku, inQty: 0, outQty: 0 }
      if (e.qty >= 0) pr.inQty += e.qty; else pr.outQty += Math.abs(e.qty)
      prods.set(nm, pr)
      const tk = tlabel(e.document_type, e.entry_type)
      const tr = types.get(tk) || { type: tk, inQty: 0, outQty: 0, docs: 0, _refs: new Set<string>() }
      if (e.qty >= 0) tr.inQty += e.qty; else tr.outQty += Math.abs(e.qty)
      if (e.document_ref) tr._refs.add(e.document_ref)
      types.set(tk, tr)
    })
    setByProduct(Array.from(prods.values()).sort((a, b) => (b.inQty + b.outQty) - (a.inQty + a.outQty)))
    setByType(Array.from(types.values()).map(t => ({ type: t.type, inQty: t.inQty, outQty: t.outQty, docs: t._refs.size })).sort((a, b) => (b.inQty + b.outQty) - (a.inQty + a.outQty)))
    setLoaded(true); setLoading(false)
  }, [from, to])

  const totIn = byProduct.reduce((s, r) => s + r.inQty, 0)
  const totOut = byProduct.reduce((s, r) => s + r.outQty, 0)

  const exportCsv = () => {
    const rows = [['Product', 'SKU', 'In', 'Out', 'Net'], ...byProduct.map(r => [r.name, r.sku, r.inQty, r.outQty, r.inQty - r.outQty])]
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `stock-movement-${from}_to_${to}.csv`; a.click()
  }
  const printPdf = async () => {
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:28px;background:#fff;color:#1a1a1a;font-family:Arial,sans-serif;font-size:12px'
    const trows = byType.map(t => `<tr><td style="padding:6px;border-top:1px solid #eee">${t.type}</td><td style="padding:6px;text-align:right;border-top:1px solid #eee;color:#16a34a">${n(t.inQty)}</td><td style="padding:6px;text-align:right;border-top:1px solid #eee;color:#dc2626">${n(t.outQty)}</td><td style="padding:6px;text-align:right;border-top:1px solid #eee">${t.docs}</td></tr>`).join('')
    const prows = byProduct.map(r => `<tr><td style="padding:6px;border-top:1px solid #eee">${r.name}</td><td style="padding:6px;text-align:right;border-top:1px solid #eee;color:#16a34a">${n(r.inQty)}</td><td style="padding:6px;text-align:right;border-top:1px solid #eee;color:#dc2626">${n(r.outQty)}</td><td style="padding:6px;text-align:right;border-top:1px solid #eee;font-weight:700">${n(r.inQty - r.outQty)}</td></tr>`).join('')
    el.innerHTML = `
      <div style="border-bottom:2px solid #5EA8A2;padding-bottom:10px;margin-bottom:14px">
        <div style="font-size:18px;font-weight:800;color:#5E2230">Stock Movement Report</div>
        <div style="color:#666">${from} to ${to}</div></div>
      <div style="font-weight:700;margin:6px 0">By Movement Type</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px"><thead><tr style="background:#f4f4f4">
        <th style="padding:6px;text-align:left">Type</th><th style="padding:6px;text-align:right">In</th><th style="padding:6px;text-align:right">Out</th><th style="padding:6px;text-align:right">Docs</th></tr></thead><tbody>${trows}</tbody></table>
      <div style="font-weight:700;margin:6px 0">By Product</div>
      <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f4f4f4">
        <th style="padding:6px;text-align:left">Product</th><th style="padding:6px;text-align:right">In</th><th style="padding:6px;text-align:right">Out</th><th style="padding:6px;text-align:right">Net</th></tr></thead><tbody>${prows}</tbody></table>`
    document.body.appendChild(el)
    try { const blob = await renderElementToPdfBlob(el); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stock-movement-${from}_to_${to}.pdf`; a.click() }
    finally { document.body.removeChild(el) }
  }

  const preset = (kind: 'today' | 'week' | 'month') => {
    const today = iso(new Date())
    if (kind === 'today') { setFrom(today); setTo(today) }
    else if (kind === 'week') { setFrom(weekStart()); setTo(today) }
    else { setFrom(monthStart()); setTo(today) }
  }

  const th = { textAlign: 'left' as const, padding: '9px 12px', color: 'var(--text2)', fontWeight: 700, borderBottom: '1px solid var(--border)' }
  const thR = { ...th, textAlign: 'right' as const }
  const td = { padding: '8px 12px', borderBottom: '1px solid var(--border)' }
  const tdR = { ...td, textAlign: 'right' as const, fontFamily: 'var(--mono)' }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Stock Movement Report</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Totals of stock in and out over a period, by product and by movement type.</p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0' }}>
        {(['today', 'week', 'month'] as const).map(k => (
          <button key={k} onClick={() => preset(k)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', textTransform: 'capitalize' }}>{k === 'today' ? 'Today' : k === 'week' ? 'This Week' : 'This Month'}</button>
        ))}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateS} />
        <span style={{ color: 'var(--text3)' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateS} />
        <button onClick={load} disabled={loading} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{loading ? 'Loading…' : 'Run'}</button>
        {loaded && <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={printPdf} style={ghost}>🖨 PDF</button>
          <button onClick={exportCsv} style={ghost}>CSV</button>
        </div>}
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}

      {loaded && !loading && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>Total In</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green, #16a34a)', fontFamily: 'var(--mono)' }}>{n(totIn)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 160, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>Total Out</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red, #dc2626)', fontFamily: 'var(--mono)' }}>{n(totOut)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 160, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>Net</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)' }}>{n(totIn - totOut)}</div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, margin: '10px 0 6px' }}>By Movement Type</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface2)' }}><th style={th}>Type</th><th style={thR}>In</th><th style={thR}>Out</th><th style={thR}>Docs</th></tr></thead>
              <tbody>{byType.map((t, i) => <tr key={i}><td style={td}>{t.type}</td><td style={{ ...tdR, color: 'var(--green, #16a34a)' }}>{n(t.inQty)}</td><td style={{ ...tdR, color: 'var(--red, #dc2626)' }}>{n(t.outQty)}</td><td style={tdR}>{t.docs}</td></tr>)}</tbody>
            </table>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, margin: '10px 0 6px' }}>By Product</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface2)' }}><th style={th}>Product</th><th style={thR}>In</th><th style={thR}>Out</th><th style={thR}>Net</th></tr></thead>
              <tbody>{byProduct.map((r, i) => <tr key={i}><td style={td}>{r.name}</td><td style={{ ...tdR, color: 'var(--green, #16a34a)' }}>{n(r.inQty)}</td><td style={{ ...tdR, color: 'var(--red, #dc2626)' }}>{n(r.outQty)}</td><td style={{ ...tdR, fontWeight: 700 }}>{n(r.inQty - r.outQty)}</td></tr>)}
                {byProduct.length === 0 && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>No movements in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!loaded && !loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Pick a period and Run.</div>}
    </div>
  )
}

const dateS: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }
const ghost: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }
