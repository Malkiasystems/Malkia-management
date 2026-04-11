import { useState } from 'react'
import { usePricingStore } from '@/stores/pricing-store'
import { CATEGORY_LABELS, BADGE_LABELS } from '@/types/pricing'
import type { Product, ProductCategory, ProductBadge } from '@/types/pricing'
import { cn } from '@/lib/utils'
import { Pencil, Check, X, TrendingUp, TrendingDown, History, ChevronDown, ChevronUp, Plus, Package, Search } from 'lucide-react'

function formatTZS(n: number): string {
  return 'TZS ' + n.toLocaleString('en-US')
}

function marginPct(sell: number, cost: number): number {
  if (sell <= 0) return 0
  return Math.round(((sell - cost) / sell) * 100)
}

function MarginBadge({ sell, cost }: { sell: number; cost: number }) {
  const m = marginPct(sell, cost)
  const color = m >= 40 ? 'text-emerald-600 bg-emerald-50' : m >= 25 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
  return (
    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', color)}>
      {m}%
    </span>
  )
}

function EditablePrice({ value, onSave, label }: { value: number; onSave: (v: number) => void; label: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value.toString())

  const commit = () => {
    const num = parseInt(draft.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(num) && num >= 0) onSave(num)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className="w-24 px-2 py-1 text-[13px] border border-wine-300 rounded-lg outline-none focus:ring-2 focus:ring-wine-500/20 bg-white"
          autoFocus
        />
        <button onClick={commit} className="p-1 rounded-full hover:bg-emerald-50 text-emerald-500"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={() => setEditing(false)} className="p-1 rounded-full hover:bg-red-50 text-red-400"><X className="w-3.5 h-3.5" /></button>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setDraft(value.toString()); setEditing(true) }}
      className="group flex items-center gap-1.5 text-[13px] font-semibold text-stone-700 hover:text-wine-600 transition-colors"
      title={`Edit ${label}`}
    >
      {formatTZS(value)}
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-stone-300" />
    </button>
  )
}

function ProductBadgeTag({ badge }: { badge: ProductBadge }) {
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

export function ProductsTable() {
  const { products, priceHistory, updatePrice, updateProduct } = usePricingStore()
  const [filterCategory, setFilterCategory] = useState<ProductCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const filtered = products
    .filter(p => filterCategory === 'all' || p.category === filterCategory)
    .filter(p => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    })
    .sort((a, b) => a.sort_order - b.sort_order)

  const categories = Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]

  // Group by category for display
  const grouped = new Map<ProductCategory, Product[]>()
  filtered.forEach(p => {
    if (!grouped.has(p.category)) grouped.set(p.category, [])
    grouped.get(p.category)!.push(p)
  })

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search products or SKU..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-stone-200 text-[13px] bg-white outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-500/10 placeholder:text-stone-300"
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all',
              filterCategory === 'all'
                ? 'bg-wine-500 text-white border-wine-500'
                : 'bg-white text-stone-400 border-stone-200 hover:border-wine-300'
            )}
          >
            All ({products.length})
          </button>
          {categories.map(([key, label]) => {
            const count = products.filter(p => p.category === key).length
            if (count === 0) return null
            return (
              <button
                key={key}
                onClick={() => setFilterCategory(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all',
                  filterCategory === key
                    ? 'bg-wine-500 text-white border-wine-500'
                    : 'bg-white text-stone-400 border-stone-200 hover:border-wine-300'
                )}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div className="p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-wine-500">{products.length}</div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Products</div>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-emerald-500">{products.filter(p => p.in_stock).length}</div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">In Stock</div>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-terra-500">
            {marginPct(
              products.reduce((s, p) => s + p.retail_price, 0) / products.length,
              products.reduce((s, p) => s + p.cost_price, 0) / products.length
            )}%
          </div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Avg Retail Margin</div>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-stone-500">
            {marginPct(
              products.reduce((s, p) => s + p.wholesale_price, 0) / products.length,
              products.reduce((s, p) => s + p.cost_price, 0) / products.length
            )}%
          </div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Avg Wholesale Margin</div>
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-5">
        {Array.from(grouped.entries()).map(([category, prods]) => (
          <div key={category}>
            {/* Category header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <Package className="w-3.5 h-3.5 text-stone-300" />
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-[1.5px]">
                {CATEGORY_LABELS[category]}
              </span>
              <div className="flex-1 h-px bg-stone-100" />
            </div>

            <div className="space-y-1.5">
              {prods.map(product => {
                const isExpanded = expandedId === product.id
                const history = priceHistory.filter(h => h.product_id === product.id)

                return (
                  <div
                    key={product.id}
                    className={cn(
                      'rounded-2xl border bg-white transition-all',
                      isExpanded ? 'border-wine-200 shadow-sm' : 'border-stone-100 hover:border-stone-200'
                    )}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Product icon */}
                      <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4.5 h-4.5 text-stone-300" />
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-bold text-stone-800 truncate">{product.name}</span>
                          <ProductBadgeTag badge={product.badge} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-stone-300 font-mono">{product.sku}</span>
                          <span className={cn(
                            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                            product.in_stock ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'
                          )}>
                            {product.in_stock ? 'In Stock' : 'Out of Stock'}
                          </span>
                        </div>
                      </div>

                      {/* Prices — desktop */}
                      <div className="hidden sm:flex items-center gap-5">
                        <div className="text-right">
                          <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide mb-0.5">Retail</div>
                          <EditablePrice
                            value={product.retail_price}
                            onSave={v => updatePrice(product.id, 'retail_price', v)}
                            label="retail price"
                          />
                          <MarginBadge sell={product.retail_price} cost={product.cost_price} />
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide mb-0.5">Wholesale</div>
                          <EditablePrice
                            value={product.wholesale_price}
                            onSave={v => updatePrice(product.id, 'wholesale_price', v)}
                            label="wholesale price"
                          />
                          <MarginBadge sell={product.wholesale_price} cost={product.cost_price} />
                        </div>
                      </div>

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : product.id)}
                        className="p-2 rounded-full hover:bg-stone-50 text-stone-300 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Mobile prices */}
                    <div className="sm:hidden flex gap-3 px-4 pb-3">
                      <div className="flex-1">
                        <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide mb-0.5">Retail</div>
                        <EditablePrice
                          value={product.retail_price}
                          onSave={v => updatePrice(product.id, 'retail_price', v)}
                          label="retail price"
                        />
                        <MarginBadge sell={product.retail_price} cost={product.cost_price} />
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide mb-0.5">Wholesale</div>
                        <EditablePrice
                          value={product.wholesale_price}
                          onSave={v => updatePrice(product.id, 'wholesale_price', v)}
                          label="wholesale price"
                        />
                        <MarginBadge sell={product.wholesale_price} cost={product.cost_price} />
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-stone-50 space-y-3">
                        <p className="text-[13px] text-stone-500 leading-relaxed">{product.description}</p>

                        {/* Detail grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-2.5 rounded-xl bg-stone-50">
                            <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide">Cost Price</div>
                            <div className="text-[13px] font-bold text-stone-600 mt-0.5">{formatTZS(product.cost_price)}</div>
                          </div>
                          <div className="p-2.5 rounded-xl bg-stone-50">
                            <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide">Retail Margin</div>
                            <div className="text-[13px] font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {formatTZS(product.retail_price - product.cost_price)} ({marginPct(product.retail_price, product.cost_price)}%)
                            </div>
                          </div>
                          <div className="p-2.5 rounded-xl bg-stone-50">
                            <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide">Wholesale Margin</div>
                            <div className="text-[13px] font-bold text-stone-600 mt-0.5 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {formatTZS(product.wholesale_price - product.cost_price)} ({marginPct(product.wholesale_price, product.cost_price)}%)
                            </div>
                          </div>
                          <div className="p-2.5 rounded-xl bg-stone-50">
                            <div className="text-[9px] text-stone-300 font-semibold uppercase tracking-wide">MOQ (Wholesale)</div>
                            <div className="text-[13px] font-bold text-stone-600 mt-0.5">{product.moq} {product.unit}s</div>
                          </div>
                        </div>

                        {/* Stock toggle */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-100">
                          <span className="text-[13px] font-medium text-stone-600">In Stock</span>
                          <button
                            onClick={() => updateProduct(product.id, { in_stock: !product.in_stock })}
                            className={cn(
                              'w-10 h-5.5 rounded-full relative transition-colors duration-300',
                              product.in_stock ? 'bg-emerald-500' : 'bg-stone-200'
                            )}
                          >
                            <div className={cn(
                              'w-4 h-4 rounded-full bg-white absolute top-[3px] transition-all duration-300 shadow-sm',
                              product.in_stock ? 'left-[21px]' : 'left-[3px]'
                            )} />
                          </button>
                        </div>

                        {/* Price history */}
                        {history.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-300 uppercase tracking-wide mb-2">
                              <History className="w-3 h-3" />
                              Price History
                            </div>
                            <div className="space-y-1">
                              {history.slice(-5).reverse().map(h => (
                                <div key={h.id} className="flex items-center gap-2 text-[11px] text-stone-400 px-2 py-1.5 rounded-lg bg-stone-50">
                                  <span className="font-semibold text-stone-500">
                                    {h.field === 'retail_price' ? 'Retail' : 'Wholesale'}
                                  </span>
                                  <span className="text-red-400 line-through">{formatTZS(h.old_value)}</span>
                                  <span className="text-stone-300">&rarr;</span>
                                  <span className="text-emerald-600 font-semibold">{formatTZS(h.new_value)}</span>
                                  <span className="ml-auto text-stone-300">
                                    {new Date(h.changed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-8 h-8 text-stone-200 mx-auto mb-2" />
          <p className="text-[14px] text-stone-400">No products found</p>
          <p className="text-[12px] text-stone-300 mt-1">Try a different search or category</p>
        </div>
      )}
    </div>
  )
}
