import { useState } from 'react'
import { usePricingStore } from '@/stores/pricing-store'
import { BADGE_LABELS } from '@/types/pricing'
import type { Bundle, BundleItem, ProductBadge } from '@/types/pricing'
import { cn } from '@/lib/utils'
import { Package, Plus, Trash2, Gift, TrendingDown, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

function formatTZS(n: number): string {
  return 'TZS ' + n.toLocaleString('en-US')
}

function BundleBadgeTag({ badge }: { badge: ProductBadge }) {
  if (!badge) return null
  const config = BADGE_LABELS[badge]
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: config.color }}
    >
      {config.label}
    </span>
  )
}

function BundleCard({ bundle }: { bundle: Bundle }) {
  const { products, updateBundle, removeBundle } = usePricingStore()
  const [expanded, setExpanded] = useState(false)
  const [editingRetail, setEditingRetail] = useState(false)
  const [editingWholesale, setEditingWholesale] = useState(false)
  const [retailDraft, setRetailDraft] = useState(bundle.retail_price.toString())
  const [wholesaleDraft, setWholesaleDraft] = useState(bundle.wholesale_price.toString())

  // Calculate sum of individual items at retail
  const retailSum = bundle.items.reduce((sum, item) => {
    const prod = products.find(p => p.id === item.product_id)
    return sum + (prod ? prod.retail_price * item.quantity : 0)
  }, 0)

  const wholesaleSum = bundle.items.reduce((sum, item) => {
    const prod = products.find(p => p.id === item.product_id)
    return sum + (prod ? prod.wholesale_price * item.quantity : 0)
  }, 0)

  const retailSavings = retailSum - bundle.retail_price
  const wholesaleSavings = wholesaleSum - bundle.wholesale_price

  const commitRetail = () => {
    const num = parseInt(retailDraft.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(num) && num >= 0) updateBundle(bundle.id, { retail_price: num })
    setEditingRetail(false)
  }

  const commitWholesale = () => {
    const num = parseInt(wholesaleDraft.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(num) && num >= 0) updateBundle(bundle.id, { wholesale_price: num })
    setEditingWholesale(false)
  }

  return (
    <div className={cn(
      'rounded-2xl border bg-white transition-all',
      expanded ? 'border-wine-200 shadow-sm' : 'border-stone-100'
    )}>
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-wine-50 to-terra-50 flex items-center justify-center flex-shrink-0">
          <Gift className="w-5 h-5 text-wine-500" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14px] font-bold text-stone-800">{bundle.name}</span>
            <BundleBadgeTag badge={bundle.badge} />
            {!bundle.is_active && (
              <span className="text-[9px] font-bold uppercase text-red-400 bg-red-50 px-1.5 py-0.5 rounded-full">Inactive</span>
            )}
          </div>
          <p className="text-[12px] text-stone-400 mt-0.5 line-clamp-1">{bundle.description}</p>

          {/* Items summary */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {bundle.items.map((item, i) => {
              const prod = products.find(p => p.id === item.product_id)
              if (!prod) return null
              return (
                <span key={i} className="text-[10px] text-stone-400 bg-stone-50 px-2 py-0.5 rounded-full">
                  {item.quantity > 1 ? `${item.quantity}x ` : ''}{prod.name.split(' ').slice(0, 3).join(' ')}
                </span>
              )
            })}
          </div>
        </div>

        {/* Expand */}
        <button onClick={() => setExpanded(!expanded)} className="p-2 rounded-full hover:bg-stone-50 text-stone-300">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Pricing row */}
      <div className="flex gap-3 px-4 pb-3">
        <div className="flex-1 p-2.5 rounded-xl bg-stone-50">
          <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide">Retail Bundle</div>
          {editingRetail ? (
            <div className="flex items-center gap-1 mt-0.5">
              <input type="text" value={retailDraft} onChange={e => setRetailDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitRetail(); if (e.key === 'Escape') setEditingRetail(false) }}
                className="w-24 px-2 py-0.5 text-[13px] border border-wine-300 rounded-lg outline-none bg-white" autoFocus />
              <button onClick={commitRetail} className="text-emerald-500"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingRetail(false)} className="text-red-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => { setRetailDraft(bundle.retail_price.toString()); setEditingRetail(true) }}
              className="text-[14px] font-bold text-stone-700 hover:text-wine-600 mt-0.5 transition-colors">
              {formatTZS(bundle.retail_price)}
            </button>
          )}
          {retailSavings > 0 && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600 font-semibold">
              <TrendingDown className="w-3 h-3" />
              Customer saves {formatTZS(retailSavings)}
            </div>
          )}
          <div className="text-[10px] text-stone-300 mt-0.5">
            Individual total: {formatTZS(retailSum)}
          </div>
        </div>

        <div className="flex-1 p-2.5 rounded-xl bg-stone-50">
          <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide">Wholesale Bundle</div>
          {editingWholesale ? (
            <div className="flex items-center gap-1 mt-0.5">
              <input type="text" value={wholesaleDraft} onChange={e => setWholesaleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitWholesale(); if (e.key === 'Escape') setEditingWholesale(false) }}
                className="w-24 px-2 py-0.5 text-[13px] border border-wine-300 rounded-lg outline-none bg-white" autoFocus />
              <button onClick={commitWholesale} className="text-emerald-500"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingWholesale(false)} className="text-red-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => { setWholesaleDraft(bundle.wholesale_price.toString()); setEditingWholesale(true) }}
              className="text-[14px] font-bold text-stone-700 hover:text-wine-600 mt-0.5 transition-colors">
              {formatTZS(bundle.wholesale_price)}
            </button>
          )}
          {wholesaleSavings > 0 && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600 font-semibold">
              <TrendingDown className="w-3 h-3" />
              Saves {formatTZS(wholesaleSavings)}
            </div>
          )}
          <div className="text-[10px] text-stone-300 mt-0.5">
            Individual total: {formatTZS(wholesaleSum)}
          </div>
        </div>
      </div>

      {/* Expanded: full item list + actions */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-stone-50 space-y-3">
          <div className="text-[10px] font-bold text-stone-300 uppercase tracking-wide">Bundle Contents</div>
          <div className="space-y-1.5">
            {bundle.items.map((item, i) => {
              const prod = products.find(p => p.id === item.product_id)
              if (!prod) return null
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-stone-50">
                  <Package className="w-4 h-4 text-stone-300 flex-shrink-0" />
                  <span className="text-[13px] text-stone-600 flex-1">{prod.name}</span>
                  <span className="text-[11px] text-stone-400">x{item.quantity}</span>
                  <span className="text-[11px] text-stone-400 font-mono">{formatTZS(prod.retail_price)}</span>
                </div>
              )
            })}
          </div>

          {/* Toggle active */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-stone-100">
            <span className="text-[13px] font-medium text-stone-600">Active on Pricelist</span>
            <button
              onClick={() => updateBundle(bundle.id, { is_active: !bundle.is_active })}
              className={cn(
                'w-10 h-5.5 rounded-full relative transition-colors duration-300',
                bundle.is_active ? 'bg-emerald-500' : 'bg-stone-200'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-full bg-white absolute top-[3px] transition-all duration-300 shadow-sm',
                bundle.is_active ? 'left-[21px]' : 'left-[3px]'
              )} />
            </button>
          </div>

          {/* Delete */}
          <button
            onClick={() => { if (confirm('Remove this bundle?')) removeBundle(bundle.id) }}
            className="flex items-center gap-2 text-[12px] text-red-400 hover:text-red-500 transition-colors px-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove bundle
          </button>
        </div>
      )}
    </div>
  )
}

export function BundlesManager() {
  const { bundles } = usePricingStore()

  return (
    <div>
      {/* Summary */}
      <div className="flex gap-2 mb-5">
        <div className="flex-1 p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-wine-500">{bundles.length}</div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Bundles</div>
        </div>
        <div className="flex-1 p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-emerald-500">{bundles.filter(b => b.is_active).length}</div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Active</div>
        </div>
      </div>

      {/* Bundle list */}
      <div className="space-y-3">
        {bundles.map(bundle => (
          <BundleCard key={bundle.id} bundle={bundle} />
        ))}
      </div>

      {bundles.length === 0 && (
        <div className="text-center py-12">
          <Gift className="w-8 h-8 text-stone-200 mx-auto mb-2" />
          <p className="text-[14px] text-stone-400">No bundles yet</p>
          <p className="text-[12px] text-stone-300 mt-1">Create a bundle to offer kits at special prices</p>
        </div>
      )}
    </div>
  )
}
