import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { tzs, localIso } from '../lib/utils'
import { useCategories } from '../lib/useCategories'
import { useUserLocation } from '../lib/useUserLocation'
import { useAuth } from '../lib/useAuth'
import { printStockTransferNote } from '../lib/stockTransferPdf'
import CategoryFilter, { makeCategoryPredicate } from '../components/CategoryFilter'

interface TransferLine { name: string; sku: string; qty: number; value: number }

interface TransferRecord {
  ref: string; posting_date: string; description: string
  total_amount: number; status: string; notes: string
  from_location: string; to_location: string
  categories: string[]; posted_by?: string
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv')     return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  if (n === 'arrow')   return <svg {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

// Parse from/to location from notes field — format: "1001 — Front Office → 1002 — Warehouse / Godown"
const parseLocations = (notes: string) => {
  if (!notes) return { from: '—', to: '—' }
  const parts = notes.split(' → ')
  if (parts.length >= 2) {
    return { from: parts[0].trim(), to: parts[1].split('·')[0].trim() }
  }
  return { from: notes.slice(0, 30), to: '—' }
}

export default function StockTransferRegister() {
  const userLoc = useUserLocation()
  const { user } = useAuth()
  // Stock-workspace users are money-blind: hide all cost/value figures here too.
  const hideMoney = user?.workspace_role === 'stock'
  const [records, setRecords] = useState<TransferRecord[]>([])
  const [loading, setLoading] = useState(true)
  // Which transfer's line items are expanded, and a per-ref cache of lines.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [linesByRef, setLinesByRef] = useState<Record<string, TransferLine[] | 'loading'>>({})
  // Default to start of the current year (not current month) so the register
  // shows transfer history by default instead of hiding it behind a 1-day window.
  const [fromDate, setFromDate] = useState(localIso(new Date(new Date().getFullYear(), 0, 1)))
  const [toDate, setToDate] = useState(localIso(new Date()))
  const [locFilter, setLocFilter] = useState('all')
  const [filterCat, setFilterCat] = useState('all')
  const [locations, setLocations] = useState<{code:string;name:string}[]>([])
  const { categories } = useCategories()

  useEffect(() => {
    load()
    supabase.from('stock_locations').select('code,name').eq('is_active', true).order('code')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          // Locked users default to filtering by their assigned location.
          // Reports stay global by default per Joe's design call, but stock
          // transfer history is genuinely location-scoped so a sensible
          // default helps. The user can flip to 'all' anytime.
          if (userLoc.defaultLocationCode && data.find((l: any) => l.code === userLoc.defaultLocationCode)) {
            setLocFilter(userLoc.defaultLocationCode)
          }
        }
      })
  }, [userLoc.defaultLocationCode])

  const load = async (from?: string, to?: string) => {
    const f = from || fromDate
    const t = to || toDate
    setLoading(true)
    const { data } = await supabase.from('vouchers')
      .select('ref, posted_by, posting_date, description, total_amount, status, notes, voucher_lines(products(category))')
      .eq('type', 'stock_transfer')
      .gte('posting_date', f)
      .lte('posting_date', t)
      .order('posting_date', { ascending: false })
    if (data) {
      const refs = data.map((v: any) => v.ref)
      const flow: Record<string, string> = {}
      if (refs.length) {
        const { data: trs } = await supabase.from('stock_transfer_requests').select('ref, status').in('ref', refs)
        ;(trs || []).forEach((t: any) => { flow[t.ref] = t.status })
      }
      setRecords(data.map((v: any) => {
        const locs = parseLocations(v.notes || '')
        return {
          ...v,
          status: flow[v.ref] || v.status,
          from_location: locs.from,
          to_location: locs.to,
          categories: [...new Set((v.voucher_lines || []).map((l: any) => l.products?.category).filter(Boolean))],
        }
      }))
    }
    setLoading(false)
  }

  // Fetch the line items for one transfer from the item ledger. The
  // transfer_out side carries one row per product with the moved qty and the
  // cost of that line.
  const loadLines = async (ref: string) => {
    if (linesByRef[ref]) return
    setLinesByRef(prev => ({ ...prev, [ref]: 'loading' }))
    const { data: led } = await supabase
      .from('item_ledger_entries')
      .select('product_id, qty, cost_amount')
      .eq('document_type', 'stock_transfer')
      .eq('document_ref', ref)
      .eq('entry_type', 'transfer_out')
    const rows = led || []
    const ids = [...new Set(rows.map((r: any) => r.product_id))]
    const prodMap: Record<string, { name: string; sku: string }> = {}
    if (ids.length) {
      const { data: prods } = await supabase.from('products').select('id, name, sku').in('id', ids)
      ;(prods || []).forEach((p: any) => { prodMap[p.id] = { name: p.name, sku: p.sku } })
    }
    const lines: TransferLine[] = rows.map((r: any) => ({
      name: prodMap[r.product_id]?.name || r.product_id,
      sku: prodMap[r.product_id]?.sku || '',
      qty: Math.abs(r.qty || 0),
      value: Math.abs(r.cost_amount || 0),
    }))
    setLinesByRef(prev => ({ ...prev, [ref]: lines }))
  }

  const toggleExpand = (ref: string) => {
    if (expanded === ref) { setExpanded(null); return }
    setExpanded(ref)
    loadLines(ref)
  }

  // Print the branded transfer note for a row. Prefers cached lines (so the
  // print window opens within the click and isn't pop-up-blocked); otherwise
  // fetches first.
  const printRow = async (r: TransferRecord) => {
    let lines = linesByRef[r.ref]
    if (!Array.isArray(lines)) {
      await loadLines(r.ref)
      const { data: led } = await supabase
        .from('item_ledger_entries')
        .select('product_id, qty, cost_amount')
        .eq('document_type', 'stock_transfer').eq('document_ref', r.ref).eq('entry_type', 'transfer_out')
      const rows = led || []
      const ids = [...new Set(rows.map((x: any) => x.product_id))]
      const prodMap: Record<string, { name: string; sku: string }> = {}
      if (ids.length) {
        const { data: prods } = await supabase.from('products').select('id, name, sku').in('id', ids)
        ;(prods || []).forEach((p: any) => { prodMap[p.id] = { name: p.name, sku: p.sku } })
      }
      lines = rows.map((x: any) => ({
        name: prodMap[x.product_id]?.name || x.product_id,
        sku: prodMap[x.product_id]?.sku || '',
        qty: Math.abs(x.qty || 0),
        value: Math.abs(x.cost_amount || 0),
      }))
    }
    await printStockTransferNote({
      ref: r.ref, date: r.posting_date,
      fromLabel: r.from_location, toLabel: r.to_location,
      notes: r.notes, postedBy: r.posted_by,
      showValues: !hideMoney,
      lines: (lines as TransferLine[]).map(l => ({
        name: l.name, sku: l.sku, qty: l.qty,
        cost: l.qty ? l.value / l.qty : 0,
      })),
    })
  }

  const catPredicate = makeCategoryPredicate(filterCat, categories)
  const byLoc = locFilter === 'all'
    ? records
    : records.filter(r => r.from_location.includes(locFilter) || r.to_location.includes(locFilter))
  const filtered = filterCat === 'all' ? byLoc : byLoc.filter(r => r.categories.some(c => catPredicate(c)))

  const totalValue = filtered.reduce((s, r) => s + (r.total_amount || 0), 0)
  const uniqueFroms = [...new Set(records.map(r => r.from_location))]
  const uniqueTos = [...new Set(records.map(r => r.to_location))]

  const exportCSV = () => {
    const head = ['Date', 'Ref', 'From Location', 'To Location', 'Description']
    if (!hideMoney) head.push('Value at Cost (TZS)')
    head.push('Status')
    const rows = [head]
    filtered.forEach(r => {
      const row = [r.posting_date, r.ref, `"${r.from_location}"`, `"${r.to_location}"`, `"${r.description}"`]
      if (!hideMoney) row.push(String(r.total_amount || 0))
      row.push(r.status)
      rows.push(row)
    })
    if (!hideMoney) rows.push(['TOTAL', '', '', '', '', String(totalValue), ''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `Stock_Transfer_Register_${fromDate}_to_${toDate}.csv`
    a.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Stock Transfer Register</div>
          <div className="page-sub">All stock movements between locations · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <div style={{ display:'flex',alignItems:'center',gap:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'5px 10px' }}>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ fontSize:11,color:'var(--text3)' }}>to</span>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={() => load()}>Load</button>
          </div>
          {[
            { label: 'Today', f: localIso(new Date()), t: localIso(new Date()) },
            { label: 'This Week', f: localIso(new Date(Date.now()-6*86400000)), t: localIso(new Date()) },
            { label: 'This Month', f: localIso(new Date(new Date().getFullYear(),new Date().getMonth(),1)), t: localIso(new Date()) },
          ].map(p => (
            <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => { setFromDate(p.f); setToDate(p.t); load(p.f, p.t) }}>{p.label}</button>
          ))}
          <select className="form-input" style={{ fontSize:12,padding:'6px 10px' }} value={locFilter} onChange={e => setLocFilter(e.target.value)}>
            <option value="all">All Locations</option>
            {locations.map(l => <option key={l.code} value={l.code}>{l.code} — {l.name}</option>)}
          </select>
          <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ fontSize:12, padding:'6px 10px' }} />
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => load()}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={exportCSV}><Ic n="csv" /> CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card blue">
          <div className="stat-label">Total Transfers</div>
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-change">{fromDate} to {toDate}</div>
        </div>
        {!hideMoney && (
          <div className="stat-card amber">
            <div className="stat-label">Total Value Moved</div>
            <div className="stat-value" style={{ fontSize:18 }}>{tzs(totalValue)}</div>
            <div className="stat-change">At cost price</div>
          </div>
        )}
        <div className="stat-card green">
          <div className="stat-label">Unique From Locations</div>
          <div className="stat-value">{uniqueFroms.length}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Unique To Locations</div>
          <div className="stat-value">{uniqueTos.length}</div>
        </div>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>No stock transfers found for this period.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width:28 }}></th>
                    <th>Date</th>
                    <th>Ref</th>
                    <th>From</th>
                    <th style={{ width:24 }}></th>
                    <th>To</th>
                    <th>Description</th>
                    {!hideMoney && <th className="td-right">Value at Cost</th>}
                    <th>Posted By</th>
                    <th>Status</th>
                    <th className="td-right">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const isOpen = expanded === r.ref
                    const lines = linesByRef[r.ref]
                    const colCount = hideMoney ? 10 : 11
                    return (
                      <Fragment key={r.ref || i}>
                        <tr onClick={() => toggleExpand(r.ref)} style={{ cursor:'pointer' }}>
                          <td style={{ textAlign:'center',color:'var(--text3)',fontSize:12 }}>{isOpen ? '▾' : '▸'}</td>
                          <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{r.posting_date}</td>
                          <td className="td-mono td-amber" style={{ fontSize:11,fontWeight:700 }}>{r.ref}</td>
                          <td>
                            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                              <span style={{ fontFamily:'var(--mono)',fontSize:10,fontWeight:800,color:'var(--accent)',background:'var(--accent-dim)',padding:'1px 6px',borderRadius:4 }}>
                                {r.from_location.split(' — ')[0]}
                              </span>
                              <span style={{ fontSize:11,color:'var(--text3)' }}>{r.from_location.split(' — ')[1] || ''}</span>
                            </div>
                          </td>
                          <td style={{ textAlign:'center' }}>
                            <Ic n="arrow" s={12} c="var(--blue)" />
                          </td>
                          <td>
                            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                              <span style={{ fontFamily:'var(--mono)',fontSize:10,fontWeight:800,color:'var(--green)',background:'rgba(0,229,160,.1)',padding:'1px 6px',borderRadius:4 }}>
                                {r.to_location.split(' — ')[0]}
                              </span>
                              <span style={{ fontSize:11,color:'var(--text3)' }}>{r.to_location.split(' — ')[1] || ''}</span>
                            </div>
                          </td>
                          <td style={{ fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.description}</td>
                          {!hideMoney && <td className="td-right td-mono" style={{ fontSize:12,fontWeight:600,color:'var(--accent)' }}>{(r.total_amount||0).toLocaleString()}</td>}
                          <td style={{ fontSize:11,color:'var(--text3)' }}>{r.posted_by||'—'}</td>
                          <td>{(() => {
                            const S: Record<string, { cls: string; label: string }> = {
                              completed: { cls: 'pill-green', label: 'Completed' },
                              posted: { cls: 'pill-green', label: 'Completed' },
                              in_transit: { cls: 'pill-blue', label: 'In Transit' },
                              rejected: { cls: 'pill-red', label: 'Rejected' },
                              cancelled: { cls: 'pill-gray', label: 'Recalled' },
                            }
                            const s = S[r.status] || { cls: 'pill-gray', label: r.status }
                            return <span className={`pill ${s.cls}`} style={{ fontSize:9 }}>{s.label}</span>
                          })()}</td>
                          <td className="td-right" onClick={e => e.stopPropagation()}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => printRow(r)}>PDF</button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={colCount} style={{ background:'var(--surface2)', padding:'0 14px 14px' }}>
                              {lines === undefined || lines === 'loading' ? (
                                <div style={{ padding:'12px 0',color:'var(--text3)',fontSize:12 }}>Loading items…</div>
                              ) : lines.length === 0 ? (
                                <div style={{ padding:'12px 0',color:'var(--text3)',fontSize:12 }}>No line items recorded for this transfer.</div>
                              ) : (
                                <div style={{ padding:'10px 0' }}>
                                  <div style={{ fontSize:10,fontWeight:700,color:'var(--text3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'.5px' }}>
                                    Items transferred · {r.from_location.split(' — ')[0]} → {r.to_location.split(' — ')[0]}
                                  </div>
                                  <table style={{ width:'100%' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ width:110 }}>SKU</th>
                                        <th>Product</th>
                                        <th className="td-right" style={{ width:90 }}>Qty</th>
                                        {!hideMoney && <th className="td-right" style={{ width:120 }}>Value at Cost</th>}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lines.map((l, li) => (
                                        <tr key={li}>
                                          <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{l.sku || '—'}</td>
                                          <td style={{ fontSize:12 }}>{l.name}</td>
                                          <td className="td-right td-mono" style={{ fontSize:12,fontWeight:700 }}>{l.qty.toLocaleString()}</td>
                                          {!hideMoney && <td className="td-right td-mono" style={{ fontSize:12 }}>{l.value.toLocaleString()}</td>}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div style={{ marginTop:10 }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => printRow(r)}>Print Transfer Note</button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                    {hideMoney ? (
                      <td colSpan={10} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>
                        TOTAL — {filtered.length} transfers
                      </td>
                    ) : (
                      <>
                        <td colSpan={7} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>
                          TOTAL — {filtered.length} transfers
                        </td>
                        <td className="td-right td-mono" style={{ color:'var(--accent)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(totalValue)}</td>
                        <td colSpan={3}></td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
