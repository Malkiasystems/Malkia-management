// ============================================================================
// ProductSearchSelect.tsx — THE shared type-to-search product picker.
// Born on the Purchase voucher (23 Sep), extracted here (1 Oct) when the
// Sales Register filter needed the same thing. One copy, two call sites,
// so the two can never drift — the reminderTemplates lesson applied to UI.
//
// Modes via props:
//   allLabel   — when set, an "All ..." choice exists (filter use) and
//                selecting it emits 'all'. Omit for forced selection
//                (voucher lines).
//   showStock  — appends "N in stock" per row (purchase use).
// Filters on name, SKU and category. Enter picks the top hit; Escape or
// clicking elsewhere closes.
// ============================================================================

import { useState } from 'react'

export interface PickerProduct {
  id: string
  sku?: string
  name: string
  category?: string
  qty_on_hand?: number
}

export default function ProductSearchSelect({ products, value, onChange, allLabel, showStock, width, placeholder }: {
  products: PickerProduct[]
  value: string
  onChange: (id: string) => void
  allLabel?: string
  showStock?: boolean
  width?: number | string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const sel = products.find(p => p.id === value)
  const needle = q.trim().toLowerCase()
  const hits = needle
    ? products.filter(p =>
        p.name.toLowerCase().includes(needle) ||
        (p.sku || '').toLowerCase().includes(needle) ||
        (p.category || '').toLowerCase().includes(needle)).slice(0, 40)
    : products.slice(0, 40)
  const pick = (id: string) => { onChange(id); setOpen(false); setQ('') }
  const display = value === 'all' && allLabel
    ? allLabel
    : sel ? `${sel.sku ? sel.sku + ' — ' : ''}${sel.name}` : ''
  return (
    <div style={{ position: 'relative', width: width || undefined }}>
      <input
        className="form-input"
        style={{ fontSize: 12, padding: '6px 8px', width: '100%' }}
        placeholder={placeholder || 'Type to search product…'}
        value={open ? q : display}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQ('') }
          if (e.key === 'Enter' && open) {
            e.preventDefault()
            if (hits.length > 0) pick(hits[0].id)
            else if (allLabel && !needle) pick('all')
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40,
          maxHeight: 240, overflowY: 'auto', marginTop: 2,
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 8, boxShadow: '0 10px 28px rgba(0,0,0,.4)',
        }}>
          {allLabel && !needle && (
            <div onMouseDown={e => { e.preventDefault(); pick('all') }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--border)', color: value === 'all' ? 'var(--accent)' : undefined }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              {allLabel}
            </div>
          )}
          {hits.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text3)' }}>No product matches "{q}"</div>
          )}
          {hits.map(p => (
            <div key={p.id}
              onMouseDown={e => { e.preventDefault(); pick(p.id) }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border)', color: p.id === value ? 'var(--accent)' : undefined }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.sku && <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{p.sku} </span>}{p.name}
              </span>
              {showStock && (
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', flexShrink: 0 }}>{p.qty_on_hand ?? 0} in stock</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
