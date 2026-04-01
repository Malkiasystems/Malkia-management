/**
 * BundlePicker Component
 * 
 * Renders a row of bundle cards above the product lines in CashSale.
 * When a bundle is clicked, it calls onApply with the individual product lines
 * at proportionally distributed bundle prices.
 * 
 * Does NOT touch CashSale's existing code. CashSale just renders this
 * component and handles the onApply callback.
 */

import { useState } from 'react'
import { useBundles } from '../lib/useBundles'
import type { Bundle } from '../lib/useBundles'

interface ApplyLine {
  productId: string
  name: string
  qty: number
  price: number
  amount: number
}

interface Props {
  onApply: (lines: ApplyLine[], bundle: Bundle) => void
}

export default function BundlePicker({ onApply }: Props) {
  const { activeBundles, loading } = useBundles()
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loading || activeBundles.length === 0) return null

  const handleApply = (bundle: Bundle) => {
    // Distribute bundle price proportionally across items
    const totalIndividual = bundle.individual_total || 1
    const lines: ApplyLine[] = bundle.items
      .filter(item => item.product)
      .map(item => {
        const individualPrice = (item.product?.selling_price || 0) * item.qty
        const proportion = individualPrice / totalIndividual
        const allocatedPrice = Math.round((bundle.bundle_price * proportion) / item.qty)
        return {
          productId: item.product_id,
          name: item.product?.name || '',
          qty: item.qty,
          price: allocatedPrice,
          amount: allocatedPrice * item.qty,
        }
      })
    onApply(lines, bundle)
    setExpanded(null)
  }

  const tzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString()
  const savings = (b: Bundle) => b.individual_total - b.bundle_price
  const savingsPct = (b: Bundle) => b.individual_total > 0 ? Math.round((savings(b) / b.individual_total) * 100) : 0

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="14" height="14" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Quick Bundles</span>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {activeBundles.map(bundle => (
          <div key={bundle.id} style={{ position: 'relative', minWidth: 160, flexShrink: 0 }}>
            <div
              onClick={() => setExpanded(expanded === bundle.id ? null : bundle.id)}
              style={{
                padding: '10px 12px',
                background: expanded === bundle.id ? 'var(--accent-dim)' : 'var(--surface2)',
                border: `1.5px solid ${expanded === bundle.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bundle.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>{tzs(bundle.bundle_price)}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textDecoration: 'line-through' }}>{tzs(bundle.individual_total)}</span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600, marginTop: 3 }}>
                Save {savingsPct(bundle)}% ({tzs(savings(bundle))})
              </div>
              <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                {bundle.items.length} items
              </div>
            </div>

            {/* Expanded dropdown showing items + apply button */}
            {expanded === bundle.id && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                background: 'var(--surface)', border: '1px solid var(--accent)',
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                width: 260, overflow: 'hidden'
              }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Bundle Contents
                </div>
                {bundle.items.map((item, i) => (
                  <div key={i} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{item.product?.name || 'Unknown'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {item.qty} x {tzs(item.product?.selling_price || 0)} · Stk: {item.product?.qty_on_hand || 0}
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: '6px 12px', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>Individual total</span>
                  <span style={{ fontFamily: 'var(--mono)', textDecoration: 'line-through', color: 'var(--text3)' }}>{tzs(bundle.individual_total)}</span>
                </div>
                <div style={{ padding: '6px 12px', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: 'var(--green)' }}>Bundle price</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(bundle.bundle_price)}</span>
                </div>
                <div style={{ padding: 8 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleApply(bundle) }}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 12, fontWeight: 700 }}
                  >
                    Apply Bundle to Sale
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
