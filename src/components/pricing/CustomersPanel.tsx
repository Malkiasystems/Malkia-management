import { useState } from 'react'
import { usePricingStore } from '@/stores/pricing-store'
import type { PriceTier, CustomerPriceTier } from '@/types/pricing'
import { cn } from '@/lib/utils'
import { Users, UserPlus, Trash2, Search, ShieldCheck, Store, ShoppingBag, X, Check, Phone } from 'lucide-react'

export function CustomersPanel() {
  const { customers, updateCustomerTier, addCustomer, removeCustomer } = usePricingStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTier, setFilterTier] = useState<PriceTier | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newTier, setNewTier] = useState<PriceTier>('retail')
  const [newNotes, setNewNotes] = useState('')

  const filtered = customers
    .filter(c => filterTier === 'all' || c.tier === filterTier)
    .filter(c => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return c.customer_name.toLowerCase().includes(q) || c.phone.includes(q)
    })

  const wholesaleCount = customers.filter(c => c.tier === 'wholesale').length
  const retailCount = customers.filter(c => c.tier === 'retail').length

  const handleAdd = () => {
    if (!newName.trim()) return
    addCustomer({
      customer_id: `c_${Date.now()}`,
      customer_name: newName.trim(),
      phone: newPhone.trim(),
      tier: newTier,
      assigned_at: new Date().toISOString(),
      assigned_by: 'Admin',
      notes: newNotes.trim() || undefined,
    })
    setNewName('')
    setNewPhone('')
    setNewTier('retail')
    setNewNotes('')
    setShowAdd(false)
  }

  return (
    <div>
      {/* Summary */}
      <div className="flex gap-2 mb-5">
        <div className="flex-1 p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-wine-500">{customers.length}</div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Total</div>
        </div>
        <div className="flex-1 p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-terra-500">{wholesaleCount}</div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Wholesale</div>
        </div>
        <div className="flex-1 p-3 rounded-2xl bg-white border border-stone-100 text-center">
          <div className="text-[20px] font-serif font-semibold text-sage-500">{retailCount}</div>
          <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide">Retail</div>
        </div>
      </div>

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search customer or phone..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-stone-200 text-[13px] bg-white outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-500/10 placeholder:text-stone-300"
          />
        </div>

        {/* Tier filter */}
        <div className="flex gap-1.5">
          {[
            { id: 'all' as const, label: 'All' },
            { id: 'wholesale' as const, label: 'Wholesale' },
            { id: 'retail' as const, label: 'Retail' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setFilterTier(opt.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
                filterTier === opt.id
                  ? 'bg-wine-500 text-white border-wine-500'
                  : 'bg-white text-stone-400 border-stone-200 hover:border-wine-300'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Add button */}
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-wine-500 text-white text-[12px] font-semibold hover:bg-wine-600 transition-colors shadow-sm"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Customer
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="p-4 rounded-2xl border border-wine-200 bg-wine-50/30 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-stone-700">New Customer</span>
            <button onClick={() => setShowAdd(false)} className="p-1 rounded-full hover:bg-white text-stone-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Customer name" 
              className="px-3.5 py-2.5 rounded-xl border border-stone-200 text-[13px] bg-white outline-none focus:border-wine-400 placeholder:text-stone-300"
            />
            <input
              type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)}
              placeholder="Phone (+255...)"
              className="px-3.5 py-2.5 rounded-xl border border-stone-200 text-[13px] bg-white outline-none focus:border-wine-400 placeholder:text-stone-300"
            />
          </div>
          <input
            type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
            placeholder="Notes (optional)" 
            className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-[13px] bg-white outline-none focus:border-wine-400 placeholder:text-stone-300"
          />
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-stone-500 font-medium">Tier:</span>
            {(['retail', 'wholesale'] as PriceTier[]).map(tier => (
              <button
                key={tier}
                onClick={() => setNewTier(tier)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all capitalize',
                  newTier === tier
                    ? 'bg-wine-500 text-white border-wine-500'
                    : 'bg-white text-stone-400 border-stone-200'
                )}
              >
                {tier}
              </button>
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all',
              newName.trim()
                ? 'bg-wine-500 text-white hover:bg-wine-600'
                : 'bg-stone-100 text-stone-300 cursor-not-allowed'
            )}
          >
            <Check className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      )}

      {/* Customer list */}
      <div className="space-y-1.5">
        {filtered.map(customer => (
          <div key={customer.customer_id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-stone-100 hover:border-stone-200 transition-all">
            {/* Icon */}
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
              customer.tier === 'wholesale' ? 'bg-terra-50' : 'bg-sage-50'
            )}>
              {customer.tier === 'wholesale' 
                ? <Store className="w-4.5 h-4.5 text-terra-500" />
                : <ShoppingBag className="w-4.5 h-4.5 text-sage-500" />
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold text-stone-800 truncate">{customer.customer_name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-stone-300 flex items-center gap-1">
                  <Phone className="w-3 h-3" />{customer.phone}
                </span>
                {customer.notes && (
                  <span className="text-[10px] text-stone-300 bg-stone-50 px-1.5 py-0.5 rounded-full truncate max-w-[140px]">
                    {customer.notes}
                  </span>
                )}
              </div>
            </div>

            {/* Tier toggle */}
            <div className="flex items-center gap-1 bg-stone-50 rounded-full p-0.5">
              <button
                onClick={() => updateCustomerTier(customer.customer_id, 'retail')}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all',
                  customer.tier === 'retail'
                    ? 'bg-sage-500 text-white shadow-sm'
                    : 'text-stone-300 hover:text-stone-500'
                )}
              >
                Retail
              </button>
              <button
                onClick={() => updateCustomerTier(customer.customer_id, 'wholesale')}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all',
                  customer.tier === 'wholesale'
                    ? 'bg-terra-500 text-white shadow-sm'
                    : 'text-stone-300 hover:text-stone-500'
                )}
              >
                Wholesale
              </button>
            </div>

            {/* Remove */}
            <button
              onClick={() => { if (confirm(`Remove ${customer.customer_name}?`)) removeCustomer(customer.customer_id) }}
              className="p-2 rounded-full hover:bg-red-50 text-stone-200 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-8 h-8 text-stone-200 mx-auto mb-2" />
          <p className="text-[14px] text-stone-400">No customers found</p>
        </div>
      )}
    </div>
  )
}
