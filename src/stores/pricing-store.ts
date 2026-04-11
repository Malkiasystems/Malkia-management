import { create } from 'zustand'
import type { 
  Product, Bundle, CustomerPriceTier, PriceHistory, PricelistConfig, 
  ProductCategory, PriceTier, ProductBadge 
} from '@/types/pricing'

// ============================================
// DEMO PRODUCT DATA — Malkia's real portfolio
// ============================================

const DEMO_PRODUCTS: Product[] = [
  // Breast Care
  { id: 'p1', name: 'Malkia Electric Breast Pump', name_sw: 'Pampu ya Maziwa ya Umeme', description: 'Hospital-grade double electric breast pump with massage mode. Silent motor, BPA-free.', category: 'breast_care', sku: 'MBP-001', badge: 'rain_maker', retail_price: 189000, wholesale_price: 145000, cost_price: 98000, moq: 5, unit: 'pc', in_stock: true, image_url: null, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'p2', name: 'Malkia Nipple Cream', name_sw: 'Krimu ya Chuchu', description: 'Lanolin-free, organic nipple cream. Safe for baby — no need to wipe before feeding.', category: 'breast_care', sku: 'MNC-001', badge: 'best_seller', retail_price: 25000, wholesale_price: 18000, cost_price: 11000, moq: 12, unit: 'pc', in_stock: true, image_url: null, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'p3', name: 'Breast Milk Storage Bags (50 pcs)', name_sw: 'Mifuko ya Kuhifadhi Maziwa', description: 'Pre-sterilized, leak-proof storage bags. Double zipper seal, 200ml capacity.', category: 'breast_care', sku: 'MSB-001', badge: null, retail_price: 35000, wholesale_price: 26000, cost_price: 17000, moq: 10, unit: 'box', in_stock: true, image_url: null, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'p4', name: 'Nursing Pads (Washable, 8 pcs)', name_sw: 'Pedi za Kunyonyesha', description: 'Reusable bamboo nursing pads. Ultra-absorbent, breathable, discreet under clothing.', category: 'breast_care', sku: 'MNP-001', badge: null, retail_price: 18000, wholesale_price: 13000, cost_price: 8000, moq: 20, unit: 'pack', in_stock: true, image_url: null, sort_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Belly & Recovery
  { id: 'p5', name: 'PeaceTouch Belly Binder', name_sw: 'Mkanda wa Tumbo PeaceTouch', description: '3-in-1 postpartum belly wrap. Medical-grade compression for recovery after natural or C-section birth.', category: 'belly_care', sku: 'MPB-001', badge: 'rain_maker', retail_price: 65000, wholesale_price: 48000, cost_price: 32000, moq: 5, unit: 'pc', in_stock: true, image_url: null, sort_order: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'p6', name: 'Malkia Scar Sheet (4 pcs)', name_sw: 'Malkia Scar Sheet', description: 'Medical-grade silicone scar sheets for C-section scars. Clinically proven to flatten, soften, and fade scars.', category: 'belly_care', sku: 'MSS-001', badge: 'best_seller', retail_price: 45000, wholesale_price: 34000, cost_price: 22000, moq: 10, unit: 'pack', in_stock: true, image_url: null, sort_order: 6, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'p7', name: 'Stretch Mark Oil (100ml)', name_sw: 'Mafuta ya Stretch Mark', description: 'Organic blend of rosehip, vitamin E, and jojoba oils. Use from the 2nd trimester for prevention.', category: 'belly_care', sku: 'MSM-001', badge: null, retail_price: 32000, wholesale_price: 24000, cost_price: 15000, moq: 12, unit: 'bottle', in_stock: true, image_url: null, sort_order: 7, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Comfort & Support
  { id: 'p8', name: 'U-Shape Pregnancy Pillow', name_sw: 'Mto wa Ujauzito', description: 'Full-body U-shape pregnancy pillow. Supports belly, back, hips, and legs. Removable washable cover.', category: 'comfort', sku: 'MPP-001', badge: 'rain_maker', retail_price: 120000, wholesale_price: 89000, cost_price: 58000, moq: 3, unit: 'pc', in_stock: true, image_url: null, sort_order: 8, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'p9', name: 'Maternity Support Belt', name_sw: 'Mkanda wa Msaada wa Ujauzito', description: 'Adjustable belly band for back and pelvic support during pregnancy. Breathable fabric.', category: 'comfort', sku: 'MMB-001', badge: null, retail_price: 38000, wholesale_price: 28000, cost_price: 18000, moq: 8, unit: 'pc', in_stock: true, image_url: null, sort_order: 9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'p10', name: 'Perineal Cold Pack (2 pcs)', name_sw: 'Peki Baridi ya Perineal', description: 'Reusable cold/warm therapy pads for postpartum perineal relief. Hospital-recommended.', category: 'comfort', sku: 'MCP-001', badge: 'new', retail_price: 22000, wholesale_price: 16000, cost_price: 10000, moq: 15, unit: 'pack', in_stock: true, image_url: null, sort_order: 10, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Skincare
  { id: 'p11', name: 'Pregnancy-Safe Sunscreen SPF50', name_sw: 'Mafuta ya Jua SPF50', description: 'Mineral-based sunscreen safe for pregnancy. No chemical filters. Protects against melasma.', category: 'skincare', sku: 'MSS-002', badge: 'new', retail_price: 28000, wholesale_price: 20000, cost_price: 13000, moq: 12, unit: 'tube', in_stock: true, image_url: null, sort_order: 11, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

const DEMO_BUNDLES: Bundle[] = [
  {
    id: 'b1', name: 'New Mama Essentials Kit', name_sw: 'Vifurushi vya Mama Mpya', 
    description: 'Everything a new mama needs: breast pump, nipple cream, and belly binder. Save TZS 30,000+',
    badge: 'best_seller', retail_price: 249000, wholesale_price: 195000,
    items: [{ product_id: 'p1', quantity: 1 }, { product_id: 'p2', quantity: 1 }, { product_id: 'p5', quantity: 1 }],
    image_url: null, is_active: true, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'b2', name: 'Breastfeeding Starter Pack', name_sw: 'Pakiti ya Kuanza Kunyonyesha',
    description: 'Breast pump, storage bags, nursing pads, and nipple cream. Everything for confident breastfeeding.',
    badge: null, retail_price: 245000, wholesale_price: 190000,
    items: [{ product_id: 'p1', quantity: 1 }, { product_id: 'p2', quantity: 1 }, { product_id: 'p3', quantity: 1 }, { product_id: 'p4', quantity: 1 }],
    image_url: null, is_active: true, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'b3', name: 'C-Section Recovery Kit', name_sw: 'Pakiti ya Kupona Upasuaji',
    description: 'Belly binder, scar sheets, and cold packs. Designed for healing after cesarean delivery.',
    badge: 'new', retail_price: 119000, wholesale_price: 90000,
    items: [{ product_id: 'p5', quantity: 1 }, { product_id: 'p6', quantity: 1 }, { product_id: 'p10', quantity: 1 }],
    image_url: null, is_active: true, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
]

const DEMO_CUSTOMERS: CustomerPriceTier[] = [
  { customer_id: 'c1', customer_name: 'Pharmacy Plus DSM', phone: '+255712345678', tier: 'wholesale', assigned_at: new Date().toISOString(), assigned_by: 'Joe', notes: 'Chain pharmacy, 3 branches' },
  { customer_id: 'c2', customer_name: 'MamaCare Clinic', phone: '+255713456789', tier: 'wholesale', assigned_at: new Date().toISOString(), assigned_by: 'Jane', notes: 'Antenatal clinic Masaki' },
  { customer_id: 'c3', customer_name: 'Amina J.', phone: '+255714567890', tier: 'retail', assigned_at: new Date().toISOString(), assigned_by: 'Barbra' },
  { customer_id: 'c4', customer_name: 'Halima R.', phone: '+255715678901', tier: 'retail', assigned_at: new Date().toISOString(), assigned_by: 'Lilian' },
  { customer_id: 'c5', customer_name: 'HealthMart Pharmacy', phone: '+255716789012', tier: 'wholesale', assigned_at: new Date().toISOString(), assigned_by: 'Joe', notes: 'New partner, trial order' },
]

// ============================================
// PRICING STORE
// ============================================

interface PricingState {
  products: Product[]
  bundles: Bundle[]
  customers: CustomerPriceTier[]
  priceHistory: PriceHistory[]
  
  // Admin UI state
  activeSection: 'products' | 'bundles' | 'customers' | 'pricelist'
  editingProductId: string | null
  editingBundleId: string | null
  
  // Pricelist config
  pricelistConfig: PricelistConfig

  // Actions — Products
  setActiveSection: (section: PricingState['activeSection']) => void
  updateProduct: (id: string, updates: Partial<Product>) => void
  updatePrice: (id: string, field: 'retail_price' | 'wholesale_price', value: number) => void
  addProduct: (product: Product) => void
  setEditingProduct: (id: string | null) => void

  // Actions — Bundles
  updateBundle: (id: string, updates: Partial<Bundle>) => void
  addBundle: (bundle: Bundle) => void
  removeBundle: (id: string) => void
  setEditingBundle: (id: string | null) => void

  // Actions — Customers
  updateCustomerTier: (customerId: string, tier: PriceTier) => void
  addCustomer: (customer: CustomerPriceTier) => void
  removeCustomer: (customerId: string) => void

  // Actions — Pricelist
  updatePricelistConfig: (updates: Partial<PricelistConfig>) => void
}

export const usePricingStore = create<PricingState>((set, get) => ({
  products: DEMO_PRODUCTS,
  bundles: DEMO_BUNDLES,
  customers: DEMO_CUSTOMERS,
  priceHistory: [],
  
  activeSection: 'products',
  editingProductId: null,
  editingBundleId: null,
  
  pricelistConfig: {
    tier: 'retail',
    include_bundles: true,
    show_images: false,
    show_descriptions: true,
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    whatsapp_number: '+255754123456',
    custom_note: '',
    categories: ['breast_care', 'belly_care', 'comfort', 'skincare', 'nutrition', 'kits', 'accessories'],
  },

  setActiveSection: (section) => set({ activeSection: section }),

  updateProduct: (id, updates) => set(state => ({
    products: state.products.map(p => p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p)
  })),

  updatePrice: (id, field, value) => {
    const state = get()
    const product = state.products.find(p => p.id === id)
    if (!product) return
    const oldValue = product[field]
    
    set(state => ({
      products: state.products.map(p => p.id === id ? { ...p, [field]: value, updated_at: new Date().toISOString() } : p),
      priceHistory: [
        ...state.priceHistory,
        {
          id: `ph_${Date.now()}`,
          product_id: id,
          field,
          old_value: oldValue,
          new_value: value,
          changed_by: 'Admin',
          changed_at: new Date().toISOString(),
        }
      ]
    }))
  },

  addProduct: (product) => set(state => ({ products: [...state.products, product] })),
  setEditingProduct: (id) => set({ editingProductId: id }),

  updateBundle: (id, updates) => set(state => ({
    bundles: state.bundles.map(b => b.id === id ? { ...b, ...updates, updated_at: new Date().toISOString() } : b)
  })),
  addBundle: (bundle) => set(state => ({ bundles: [...state.bundles, bundle] })),
  removeBundle: (id) => set(state => ({ bundles: state.bundles.filter(b => b.id !== id) })),
  setEditingBundle: (id) => set({ editingBundleId: id }),

  updateCustomerTier: (customerId, tier) => set(state => ({
    customers: state.customers.map(c => c.customer_id === customerId ? { ...c, tier } : c)
  })),
  addCustomer: (customer) => set(state => ({ customers: [...state.customers, customer] })),
  removeCustomer: (customerId) => set(state => ({
    customers: state.customers.filter(c => c.customer_id !== customerId)
  })),

  updatePricelistConfig: (updates) => set(state => ({
    pricelistConfig: { ...state.pricelistConfig, ...updates }
  })),
}))
