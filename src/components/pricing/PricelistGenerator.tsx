import { useState, useRef } from 'react'
import { usePricingStore } from '@/stores/pricing-store'
import { CATEGORY_LABELS, BADGE_LABELS } from '@/types/pricing'
import type { ProductCategory, PriceTier } from '@/types/pricing'
import { cn } from '@/lib/utils'
import { Download, Eye, FileText, Gift, Package, Settings, Phone, Globe, MessageCircle, Heart, Star, Clock, CheckCircle } from 'lucide-react'

function formatTZS(n: number): string {
  return 'TZS ' + n.toLocaleString('en-US')
}

function PricelistPreview({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { products, bundles, pricelistConfig: config } = usePricingStore()
  const isWholesale = config.tier === 'wholesale'

  // Filter products by selected categories and in-stock only
  const filteredProducts = products
    .filter(p => config.categories.includes(p.category) && p.in_stock)
    .sort((a, b) => a.sort_order - b.sort_order)

  // Group by category
  const grouped = new Map<ProductCategory, typeof filteredProducts>()
  filteredProducts.forEach(p => {
    if (!grouped.has(p.category)) grouped.set(p.category, [])
    grouped.get(p.category)!.push(p)
  })

  const activeBundles = bundles.filter(b => b.is_active)

  const validDate = config.valid_until 
    ? new Date(config.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const waLink = `https://wa.me/${config.whatsapp_number.replace(/[^0-9]/g, '')}`

  return (
    <div 
      ref={containerRef}
      className="bg-white max-w-[680px] mx-auto"
      style={{ fontFamily: "'Nunito Sans', 'Segoe UI', sans-serif" }}
    >
      {/* ===== HEADER ===== */}
      <div style={{ background: 'linear-gradient(135deg, #8B2252 0%, #A64D74 50%, #B87A50 100%)', padding: '32px 28px', color: 'white', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
              <Heart style={{ width: 20, height: 20, color: 'white', fill: 'white' }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>Malkia Maternity</div>
              <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600 }}>Your Partner in Motherhood</div>
            </div>
          </div>

          {/* Title */}
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>
            {isWholesale ? 'Wholesale Price List' : 'Product Catalogue & Price List'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {isWholesale ? 'Partner & Distributor Pricing' : 'Quality Maternal & Newborn Products'}
          </div>

          {/* Validity badge */}
          {validDate && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: 'rgba(255,255,255,0.15)', padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600, backdropFilter: 'blur(4px)' }}>
              <Clock style={{ width: 12, height: 12 }} />
              Valid until {validDate}
            </div>
          )}
        </div>
      </div>

      {/* ===== WHY MALKIA STRIP ===== */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #f0ebe5' }}>
        {[
          { icon: '🏥', text: 'Hospital Grade' },
          { icon: '✅', text: 'Clinically Tested' },
          { icon: '🤱', text: 'Mama Approved' },
          { icon: '🇹🇿', text: 'Available in TZ' },
        ].map((item, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', padding: '12px 8px', borderRight: i < 3 ? '1px solid #f0ebe5' : 'none' }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{item.icon}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#8B2252', letterSpacing: 0.5, textTransform: 'uppercase' }}>{item.text}</div>
          </div>
        ))}
      </div>

      {/* ===== MOQ NOTE FOR WHOLESALE ===== */}
      {isWholesale && (
        <div style={{ margin: '16px 20px', padding: '12px 16px', background: '#FBF3EC', borderRadius: 12, border: '1px solid #F0DCC8', fontSize: 12, color: '#B87A50', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Package style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Wholesale Terms:</strong> Minimum order quantities (MOQ) apply per product. Prices are ex-Dar es Salaam. 
            Delivery available across Tanzania. Payment: 50% deposit, balance on delivery.
          </div>
        </div>
      )}

      {/* ===== PRODUCTS BY CATEGORY ===== */}
      <div style={{ padding: '20px' }}>
        {Array.from(grouped.entries()).map(([category, prods], catIdx) => (
          <div key={category} style={{ marginBottom: 24 }}>
            {/* Category header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F9EEF2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package style={{ width: 14, height: 14, color: '#8B2252' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1118', letterSpacing: -0.3 }}>
                {CATEGORY_LABELS[category]}
              </div>
              <div style={{ flex: 1, height: 1, background: '#f0ebe5' }} />
            </div>

            {/* Product rows */}
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #f0ebe5' }}>
              {/* Table header */}
              <div style={{ display: 'flex', padding: '8px 14px', background: '#FAFAF8', borderBottom: '1px solid #f0ebe5', fontSize: 9, fontWeight: 700, color: '#999', letterSpacing: 1, textTransform: 'uppercase' }}>
                <div style={{ flex: 1 }}>Product</div>
                {config.show_descriptions && <div style={{ width: 200, paddingLeft: 12 }}>Description</div>}
                {isWholesale && <div style={{ width: 50, textAlign: 'center' }}>MOQ</div>}
                <div style={{ width: 100, textAlign: 'right' }}>Price</div>
              </div>

              {prods.map((product, i) => {
                const price = isWholesale ? product.wholesale_price : product.retail_price
                const badgeConfig = product.badge ? BADGE_LABELS[product.badge] : null

                return (
                  <div
                    key={product.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: i < prods.length - 1 ? '1px solid #f5f0eb' : 'none',
                      background: i % 2 === 0 ? 'white' : '#FDFCFB',
                    }}
                  >
                    {/* Name + badge */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1118' }}>{product.name}</span>
                        {badgeConfig && (
                          <span style={{
                            fontSize: 8, fontWeight: 800, color: 'white', background: badgeConfig.color,
                            padding: '2px 6px', borderRadius: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                          }}>
                            {badgeConfig.label}
                          </span>
                        )}
                      </div>
                      {product.name_sw && (
                        <div style={{ fontSize: 10, color: '#999', marginTop: 1, fontStyle: 'italic' }}>{product.name_sw}</div>
                      )}
                    </div>

                    {/* Description */}
                    {config.show_descriptions && (
                      <div style={{ width: 200, paddingLeft: 12, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                        {product.description.length > 80 ? product.description.slice(0, 80) + '...' : product.description}
                      </div>
                    )}

                    {/* MOQ */}
                    {isWholesale && (
                      <div style={{ width: 50, textAlign: 'center', fontSize: 11, color: '#B87A50', fontWeight: 600 }}>
                        {product.moq} {product.unit}
                      </div>
                    )}

                    {/* Price */}
                    <div style={{ width: 100, textAlign: 'right', fontSize: 14, fontWeight: 800, color: '#8B2252' }}>
                      {formatTZS(price)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* ===== BUNDLES SECTION ===== */}
        {config.include_bundles && activeBundles.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FBF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gift style={{ width: 14, height: 14, color: '#B87A50' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1118', letterSpacing: -0.3 }}>
                Special Bundles & Kits
              </div>
              <div style={{ flex: 1, height: 1, background: '#f0ebe5' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: '#6B8E6B', background: '#EFF5EF', padding: '3px 8px', borderRadius: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                Save More
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {activeBundles.map(bundle => {
                const price = isWholesale ? bundle.wholesale_price : bundle.retail_price
                const individualSum = bundle.items.reduce((sum, item) => {
                  const prod = products.find(p => p.id === item.product_id)
                  const unitPrice = isWholesale ? (prod?.wholesale_price || 0) : (prod?.retail_price || 0)
                  return sum + unitPrice * item.quantity
                }, 0)
                const savings = individualSum - price
                const badgeConfig = bundle.badge ? BADGE_LABELS[bundle.badge] : null

                return (
                  <div
                    key={bundle.id}
                    style={{
                      borderRadius: 14, border: '1.5px solid #F0DCC8', background: 'linear-gradient(135deg, #FFFBF8, #FBF3EC)',
                      padding: 16, position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* Savings ribbon */}
                    {savings > 0 && (
                      <div style={{
                        position: 'absolute', top: 12, right: -28, background: '#6B8E6B', color: 'white',
                        fontSize: 9, fontWeight: 800, padding: '3px 32px', transform: 'rotate(45deg)',
                        letterSpacing: 0.5, textTransform: 'uppercase',
                      }}>
                        SAVE {Math.round((savings / individualSum) * 100)}%
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1118' }}>{bundle.name}</span>
                      {badgeConfig && (
                        <span style={{
                          fontSize: 8, fontWeight: 800, color: 'white', background: badgeConfig.color,
                          padding: '2px 6px', borderRadius: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                        }}>
                          {badgeConfig.label}
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: 11, color: '#888', lineHeight: 1.4, marginBottom: 10 }}>{bundle.description}</p>

                    {/* Bundle items */}
                    <div style={{ marginBottom: 10 }}>
                      {bundle.items.map((item, i) => {
                        const prod = products.find(p => p.id === item.product_id)
                        if (!prod) return null
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', padding: '3px 0' }}>
                            <CheckCircle style={{ width: 12, height: 12, color: '#6B8E6B' }} />
                            <span>{item.quantity > 1 ? `${item.quantity}x ` : ''}{prod.name}</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Price */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: '#8B2252' }}>{formatTZS(price)}</span>
                      {savings > 0 && (
                        <span style={{ fontSize: 12, color: '#999', textDecoration: 'line-through' }}>{formatTZS(individualSum)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ===== CUSTOM NOTE ===== */}
        {config.custom_note && (
          <div style={{ padding: '12px 16px', background: '#F9EEF2', borderRadius: 12, fontSize: 12, color: '#8B2252', marginBottom: 20, lineHeight: 1.5 }}>
            {config.custom_note}
          </div>
        )}
      </div>

      {/* ===== FOOTER: ORDER INFO ===== */}
      <div style={{ background: '#1A1118', color: 'white', padding: '24px 20px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Ready to Order?</div>
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
          Tap below to place your order via WhatsApp or contact us directly.
        </div>

        {/* WhatsApp CTA */}
        <a
          href={waLink}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#25D366', color: 'white', padding: '12px 24px', borderRadius: 30,
            fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 16,
          }}
        >
          <MessageCircle style={{ width: 18, height: 18 }} />
          Order on WhatsApp
        </a>

        {/* Contact grid */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.7 }}>
            <Phone style={{ width: 12, height: 12 }} />
            {config.whatsapp_number}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.7 }}>
            <Globe style={{ width: 12, height: 12 }} />
            @malkiamaternity
          </div>
        </div>

        {/* Footer brand */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Heart style={{ width: 12, height: 12, fill: '#8B2252', color: '#8B2252' }} />
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.5 }}>Malkia Maternity</span>
          </div>
          <span style={{ fontSize: 9, opacity: 0.3 }}>Your Partner in Motherhood</span>
        </div>
      </div>
    </div>
  )
}

export function PricelistGenerator() {
  const { products, pricelistConfig: config, updatePricelistConfig } = usePricingStore()
  const [showPreview, setShowPreview] = useState(true)
  const previewRef = useRef<HTMLDivElement>(null)

  const categories = Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]

  const handleDownload = () => {
    if (!previewRef.current) return
    const html = previewRef.current.outerHTML

    // Build full standalone HTML
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Malkia Maternity - ${config.tier === 'wholesale' ? 'Wholesale' : 'Retail'} Price List</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #f5f0eb; font-family: 'Nunito Sans', sans-serif; }
  .wrapper { max-width: 680px; margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.08); border-radius: 16px; overflow: hidden; }
  @media print { body { background: white; } .wrapper { box-shadow: none; margin: 0; max-width: 100%; } }
</style>
</head>
<body>
<div class="wrapper">
${html}
</div>
</body>
</html>`

    const blob = new Blob([fullHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Malkia_${config.tier}_pricelist_${new Date().toISOString().split('T')[0]}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Config Panel */}
      <div className="p-4 rounded-2xl bg-white border border-stone-100 mb-5 space-y-4">
        <div className="flex items-center gap-2 text-[13px] font-bold text-stone-700">
          <Settings className="w-4 h-4 text-stone-400" />
          Pricelist Settings
        </div>

        {/* Tier toggle */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-stone-600">Price Tier</span>
          <div className="flex bg-stone-100 rounded-full p-0.5">
            {(['retail', 'wholesale'] as PriceTier[]).map(tier => (
              <button
                key={tier}
                onClick={() => updatePricelistConfig({ tier })}
                className={cn(
                  'px-4 py-1.5 rounded-full text-[12px] font-bold capitalize transition-all',
                  config.tier === tier
                    ? 'bg-wine-500 text-white shadow-sm'
                    : 'text-stone-400 hover:text-stone-600'
                )}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        {/* Include bundles (only for retail or wholesale) */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[13px] font-medium text-stone-600">Include Bundles / Kits</span>
            <p className="text-[11px] text-stone-300">Show special bundle offers on the pricelist</p>
          </div>
          <button
            onClick={() => updatePricelistConfig({ include_bundles: !config.include_bundles })}
            className={cn(
              'w-11 h-6 rounded-full relative transition-colors duration-300 flex-shrink-0',
              config.include_bundles ? 'bg-wine-500' : 'bg-stone-200'
            )}
          >
            <div className={cn(
              'w-[18px] h-[18px] rounded-full bg-white absolute top-[3px] transition-all duration-300 shadow-sm',
              config.include_bundles ? 'left-[21px]' : 'left-[3px]'
            )} />
          </button>
        </div>

        {/* Show descriptions */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[13px] font-medium text-stone-600">Show Descriptions</span>
            <p className="text-[11px] text-stone-300">Include product descriptions on the list</p>
          </div>
          <button
            onClick={() => updatePricelistConfig({ show_descriptions: !config.show_descriptions })}
            className={cn(
              'w-11 h-6 rounded-full relative transition-colors duration-300 flex-shrink-0',
              config.show_descriptions ? 'bg-wine-500' : 'bg-stone-200'
            )}
          >
            <div className={cn(
              'w-[18px] h-[18px] rounded-full bg-white absolute top-[3px] transition-all duration-300 shadow-sm',
              config.show_descriptions ? 'left-[21px]' : 'left-[3px]'
            )} />
          </button>
        </div>

        {/* Valid until */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-stone-600">Valid Until</span>
          <input
            type="date"
            value={config.valid_until}
            onChange={e => updatePricelistConfig({ valid_until: e.target.value })}
            className="px-3 py-1.5 rounded-xl border border-stone-200 text-[12px] outline-none focus:border-wine-400 bg-white"
          />
        </div>

        {/* WhatsApp number */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-stone-600">WhatsApp Number</span>
          <input
            type="text"
            value={config.whatsapp_number}
            onChange={e => updatePricelistConfig({ whatsapp_number: e.target.value })}
            className="w-40 px-3 py-1.5 rounded-xl border border-stone-200 text-[12px] outline-none focus:border-wine-400 bg-white"
          />
        </div>

        {/* Custom note */}
        <div>
          <span className="text-[13px] font-medium text-stone-600 block mb-1.5">Custom Note (optional)</span>
          <input
            type="text"
            value={config.custom_note}
            onChange={e => updatePricelistConfig({ custom_note: e.target.value })}
            placeholder="e.g., Free delivery for orders above TZS 200,000"
            className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-[12px] outline-none focus:border-wine-400 bg-white placeholder:text-stone-300"
          />
        </div>

        {/* Category filter */}
        <div>
          <span className="text-[13px] font-medium text-stone-600 block mb-2">Categories to Include</span>
          <div className="flex gap-1.5 flex-wrap">
            {categories.map(([key, label]) => {
              const isSelected = config.categories.includes(key)
              const count = products.filter(p => p.category === key && p.in_stock).length
              if (count === 0) return null
              return (
                <button
                  key={key}
                  onClick={() => {
                    const updated = isSelected
                      ? config.categories.filter(c => c !== key)
                      : [...config.categories, key]
                    updatePricelistConfig({ categories: updated })
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
                    isSelected
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
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold border transition-all',
            showPreview
              ? 'bg-wine-50 text-wine-600 border-wine-200'
              : 'bg-white text-stone-400 border-stone-200 hover:border-wine-300'
          )}
        >
          <Eye className="w-4 h-4" />
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-wine-500 text-white text-[12px] font-semibold hover:bg-wine-600 transition-colors shadow-sm shadow-wine-500/20"
        >
          <Download className="w-4 h-4" />
          Download Pricelist
        </button>

        <div className="text-[11px] text-stone-300 ml-auto">
          <FileText className="w-3.5 h-3.5 inline mr-1" />
          Downloads as shareable HTML file
        </div>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="rounded-2xl border border-stone-200 overflow-hidden shadow-lg shadow-stone-200/50">
          <PricelistPreview containerRef={previewRef} />
        </div>
      )}
    </div>
  )
}
