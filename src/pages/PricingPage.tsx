import { usePricingStore } from '@/stores/pricing-store'
import { ProductsTable } from '@/components/pricing/ProductsTable'
import { BundlesManager } from '@/components/pricing/BundlesManager'
import { CustomersPanel } from '@/components/pricing/CustomersPanel'
import { PricelistGenerator } from '@/components/pricing/PricelistGenerator'
import { cn } from '@/lib/utils'
import { Package, Gift, Users, FileText, Tag } from 'lucide-react'

const SECTIONS = [
  { id: 'products' as const, icon: Package, label: 'Products' },
  { id: 'bundles' as const, icon: Gift, label: 'Bundles' },
  { id: 'customers' as const, icon: Users, label: 'Customers' },
  { id: 'pricelist' as const, icon: FileText, label: 'Pricelist' },
]

export function PricingPage() {
  const { activeSection, setActiveSection } = usePricingStore()

  return (
    <div>
      {/* Page header */}
      <div className="px-5 pt-5 mb-4 animate-fade-up">
        <div className="flex items-center gap-2 mb-1">
          <Tag className="w-5 h-5 text-wine-500" />
          <h1 className="font-serif text-[26px] font-medium tracking-tight">Pricing</h1>
        </div>
        <p className="text-[13px] text-stone-400">
          Manage product prices, bundles, customer tiers, and generate pricelists
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 px-4 mb-5 overflow-x-auto no-scrollbar animate-fade-up stagger-1">
        {SECTIONS.map(sec => {
          const Icon = sec.icon
          const isActive = activeSection === sec.id
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-[7px] rounded-full border-[1.5px] text-[12.5px] font-semibold whitespace-nowrap transition-all duration-200',
                isActive
                  ? 'bg-wine-500 text-white border-wine-500 shadow-md shadow-wine-500/20'
                  : 'bg-white text-stone-400 border-stone-100 hover:border-wine-200'
              )}
            >
              <Icon className={cn('w-[13px] h-[13px]', isActive ? 'text-white' : 'text-stone-300')} />
              {sec.label}
            </button>
          )
        })}
      </div>

      {/* Section content */}
      <div className="px-4 pb-8 animate-fade-up stagger-2">
        {activeSection === 'products' && <ProductsTable />}
        {activeSection === 'bundles' && <BundlesManager />}
        {activeSection === 'customers' && <CustomersPanel />}
        {activeSection === 'pricelist' && <PricelistGenerator />}
      </div>
    </div>
  )
}
