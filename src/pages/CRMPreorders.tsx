import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

interface Campaign {
  id: string
  campaign_number: string
  name: string
  description: string
  products: string[]
  total_price: number
  deposit_percentage: number
  deposit_amount: number
  target_orders: number
  current_orders: number
  status: 'draft' | 'active' | 'fulfilled' | 'cancelled'
  close_date: string
  expected_arrival: string
  deposits_collected: number
}

interface PreOrder {
  id: string
  preorder_number: string
  campaign_id: string
  customer_name: string
  customer_whatsapp: string
  customer_tier: string
  campaign_name: string
  product_name: string
  total_amount: number
  deposit_paid: number
  balance_due: number
  status: 'pending_deposit' | 'deposit_paid' | 'ordered' | 'arrived' | 'fulfilled' | 'cancelled'
  expected_arrival: string
}

// Icon component
const Icon = ({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  
  const paths: Record<string, React.ReactNode> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  }
  
  return <svg {...props}>{paths[name] || paths.package}</svg>
}

export default function CRMPreorders({ onNav }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [preorders, setPreorders] = useState<PreOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Load campaigns
    const { data: campData } = await supabase
      .from('preorder_campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (campData && campData.length > 0) {
      setCampaigns(campData)
    } else {
      // Demo data
      setCampaigns([
        {
          id: '1',
          campaign_number: 'CAMP-001',
          name: 'Frida Mom Postpartum Bundle',
          description: 'PeaceTouch Binder + Nipple Cream + Scar Sheet - exclusive bundle, limited stock',
          products: ['PeaceTouch Binder', 'Nipple Cream', 'Scar Sheet'],
          total_price: 340000,
          deposit_percentage: 30,
          deposit_amount: 100000,
          target_orders: 50,
          current_orders: 38,
          status: 'active',
          close_date: '2025-03-25',
          expected_arrival: '2025-04-10',
          deposits_collected: 3800000
        },
        {
          id: '2',
          campaign_number: 'CAMP-002',
          name: 'U-Shape Pillow - Restock Pre-Order',
          description: 'New shipment incoming from Shanghai MedTech - reserve your pillow now',
          products: ['U-Shape Pregnancy Pillow'],
          total_price: 230000,
          deposit_percentage: 35,
          deposit_amount: 80000,
          target_orders: 40,
          current_orders: 27,
          status: 'active',
          close_date: '2025-03-30',
          expected_arrival: '2025-04-18',
          deposits_collected: 2160000
        },
        {
          id: '3',
          campaign_number: 'CAMP-003',
          name: 'Breast Pump Bundle - Feb 2025',
          description: 'Electric Breast Pump + Nipple Cream pre-order campaign - Fully delivered',
          products: ['Breast Pump Electric', 'Nipple Cream'],
          total_price: 370000,
          deposit_percentage: 30,
          deposit_amount: 111000,
          target_orders: 22,
          current_orders: 22,
          status: 'fulfilled',
          close_date: '2025-02-05',
          expected_arrival: '2025-02-22',
          deposits_collected: 8140000
        },
      ])
    }

    // Load preorders
    const { data: preorderData } = await supabase
      .from('preorders')
      .select('*, preorder_campaigns(name)')
      .order('created_at', { ascending: false })

    if (preorderData && preorderData.length > 0) {
      setPreorders(preorderData.map(p => ({
        ...p,
        campaign_name: p.preorder_campaigns?.name || ''
      })))
    } else {
      // Demo data
      setPreorders([
        {
          id: '1',
          preorder_number: 'PRE-0041',
          campaign_id: '1',
          customer_name: 'Amina Hassan',
          customer_whatsapp: '+255 712 345 678',
          customer_tier: 'crown',
          campaign_name: 'Frida Mom Bundle',
          product_name: 'Frida Mom Bundle',
          total_amount: 340000,
          deposit_paid: 100000,
          balance_due: 240000,
          status: 'deposit_paid',
          expected_arrival: '2025-04-10'
        },
        {
          id: '2',
          preorder_number: 'PRE-0042',
          campaign_id: '1',
          customer_name: 'Grace Mwanza',
          customer_whatsapp: '+255 754 987 654',
          customer_tier: 'gold',
          campaign_name: 'Frida Mom Bundle',
          product_name: 'Frida Mom Bundle',
          total_amount: 340000,
          deposit_paid: 0,
          balance_due: 340000,
          status: 'pending_deposit',
          expected_arrival: '2025-04-10'
        },
        {
          id: '3',
          preorder_number: 'PRE-0043',
          campaign_id: '2',
          customer_name: 'Zainab Ally',
          customer_whatsapp: '+255 698 111 222',
          customer_tier: 'mama',
          campaign_name: 'U-Shape Pillow',
          product_name: 'U-Shape Pregnancy Pillow',
          total_amount: 230000,
          deposit_paid: 80000,
          balance_due: 150000,
          status: 'deposit_paid',
          expected_arrival: '2025-04-18'
        },
      ])
    }

    setLoading(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10b981'
      case 'fulfilled': return '#3b82f6'
      case 'cancelled': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case 'deposit_paid': return '#10b981'
      case 'pending_deposit': return '#f59e0b'
      case 'fulfilled': return '#3b82f6'
      case 'arrived': return '#8b5cf6'
      case 'cancelled': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getOrderStatusLabel = (status: string) => {
    switch (status) {
      case 'deposit_paid': return 'Deposit Paid'
      case 'pending_deposit': return 'Pending Deposit'
      case 'fulfilled': return 'Fulfilled'
      case 'arrived': return 'Arrived'
      case 'cancelled': return 'Cancelled'
      default: return status
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Calculate stats
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length
  const totalPreorders = preorders.length
  const totalDeposits = campaigns.reduce((sum, c) => sum + c.deposits_collected, 0)
  const awaitingFulfillment = preorders.filter(p => p.status === 'deposit_paid' || p.status === 'arrived').length
  const cancelledRefunded = preorders.filter(p => p.status === 'cancelled').length

  const filteredPreorders = preorders.filter(p => {
    if (selectedCampaign !== 'all' && p.campaign_id !== selectedCampaign) return false
    if (selectedStatus !== 'all' && p.status !== selectedStatus) return false
    return true
  })

  const s = {
    page: { padding: 28, maxWidth: 1600, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 } as React.CSSProperties,
    headerLeft: { display: 'flex', alignItems: 'center', gap: 16 } as React.CSSProperties,
    backBtn: { width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    sub: { fontSize: 13, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    headerRight: { display: 'flex', gap: 12 } as React.CSSProperties,
    btnSecondary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text)' } as React.CSSProperties,
    btnPrimary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,

    // KPI Grid
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 } as React.CSSProperties,
    kpiCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 16px' } as React.CSSProperties,
    kpiLabel: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 } as React.CSSProperties,
    kpiValue: { fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700 } as React.CSSProperties,
    kpiSub: { fontSize: 11, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,

    // Campaign Cards
    campaignGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 } as React.CSSProperties,
    campaignCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' } as React.CSSProperties,
    campaignHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    campaignNumber: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' } as React.CSSProperties,
    statusBadge: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: `${color}15`, color }) as React.CSSProperties,
    campaignBody: { padding: 20 } as React.CSSProperties,
    campaignName: { fontSize: 16, fontWeight: 700, marginBottom: 8 } as React.CSSProperties,
    campaignDesc: { fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 } as React.CSSProperties,
    priceRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } as React.CSSProperties,
    priceLabel: { fontSize: 12, color: 'var(--text3)' } as React.CSSProperties,
    priceValue: { fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' } as React.CSSProperties,
    progressWrap: { marginTop: 16, marginBottom: 12 } as React.CSSProperties,
    progressLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 6 } as React.CSSProperties,
    progressBar: { height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' } as React.CSSProperties,
    progressFill: (pct: number, color: string) => ({ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: 'width .3s' }) as React.CSSProperties,
    campaignDates: { display: 'flex', gap: 12, fontSize: 11, color: 'var(--text3)', marginBottom: 16 } as React.CSSProperties,
    campaignFooter: { display: 'flex', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    campaignBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text)' } as React.CSSProperties,

    // Table Section
    tableSection: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' } as React.CSSProperties,
    tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    tableTitle: { fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700 } as React.CSSProperties,
    tableFilters: { display: 'flex', gap: 8 } as React.CSSProperties,
    filterSelect: { padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', minWidth: 140 } as React.CSSProperties,
    sendRemindersBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const } as React.CSSProperties,
    th: { textAlign: 'left' as const, padding: '12px 16px', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, borderBottom: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    td: { padding: '14px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    orderNumber: { fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 } as React.CSSProperties,
    customerCell: { display: 'flex', flexDirection: 'column' as const, gap: 2 } as React.CSSProperties,
    customerName: { fontWeight: 600 } as React.CSSProperties,
    customerSub: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    tierBadge: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600, background: `${color}20`, color }) as React.CSSProperties,
    amountCell: { fontFamily: 'var(--mono)', fontWeight: 600 } as React.CSSProperties,
    depositCell: (paid: boolean) => ({ fontFamily: 'var(--mono)', fontWeight: 600, color: paid ? '#10b981' : '#f59e0b' }) as React.CSSProperties,
    balanceCell: { fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text3)' } as React.CSSProperties,
    actionBtn: { padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
          <Icon name="package" size={32} />
          <div style={{ marginTop: 12 }}>Loading pre-orders...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.backBtn} onClick={() => onNav('crm')}>
            <Icon name="arrowLeft" size={18} color="var(--text3)" />
          </div>
          <div>
            <h1 style={s.title}>
              <Icon name="package" size={28} color="var(--accent)" />
              Pre-Order Campaigns
            </h1>
            <p style={s.sub}>Create campaigns · Collect deposits · Track fulfilment · Notify via WhatsApp</p>
          </div>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnSecondary} onClick={() => onNav('crm')}>
            <Icon name="arrowLeft" size={16} /> CRM Hub
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> New Campaign
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={s.kpiGrid}>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Active Campaigns</div>
          <div style={{ ...s.kpiValue, color: '#10b981' }}>{activeCampaigns}</div>
          <div style={s.kpiSub}>{campaigns.filter(c => c.status === 'active' && new Date(c.close_date) < new Date(Date.now() + 7 * 86400000)).length} closing soon</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Total Pre-Orders</div>
          <div style={{ ...s.kpiValue, color: '#3b82f6' }}>{totalPreorders}</div>
          <div style={s.kpiSub}>Across all campaigns</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Deposits Collected</div>
          <div style={{ ...s.kpiValue, color: 'var(--accent)' }}>{tzs(totalDeposits)}</div>
          <div style={s.kpiSub}>Avg: {tzs(totalPreorders > 0 ? totalDeposits / totalPreorders : 0)}/order</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Awaiting Fulfilment</div>
          <div style={{ ...s.kpiValue, color: '#f59e0b' }}>{awaitingFulfillment}</div>
          <div style={s.kpiSub}>Est. arrival: 18 Apr</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Cancelled / Refunded</div>
          <div style={{ ...s.kpiValue, color: '#ef4444' }}>{cancelledRefunded}</div>
          <div style={s.kpiSub}>{tzs(355000)} refunded</div>
        </div>
      </div>

      {/* Campaign Cards */}
      <div style={s.campaignGrid}>
        {campaigns.map(camp => (
          <div key={camp.id} style={s.campaignCard}>
            <div style={s.campaignHeader}>
              <span style={s.campaignNumber}>{camp.campaign_number}</span>
              <span style={s.statusBadge(getStatusColor(camp.status))}>
                {camp.status === 'active' && <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Active</>}
                {camp.status === 'fulfilled' && <><Icon name="checkCircle" size={12} /> Fulfilled</>}
                {camp.status === 'draft' && 'Draft'}
                {camp.status === 'cancelled' && 'Cancelled'}
              </span>
            </div>
            <div style={s.campaignBody}>
              <div style={s.campaignName}>{camp.name}</div>
              <div style={s.campaignDesc}>{camp.description}</div>
              
              <div style={s.priceRow}>
                <span style={s.priceLabel}>{camp.status === 'fulfilled' ? 'Final price' : 'Pre-order price'}</span>
                <span style={s.priceValue}>{tzs(camp.total_price)}</span>
              </div>
              <div style={s.priceRow}>
                <span style={s.priceLabel}>{camp.status === 'fulfilled' ? 'Total collected' : 'Deposit required'}</span>
                <span style={{ ...s.priceValue, color: camp.status === 'fulfilled' ? '#10b981' : 'var(--accent)' }}>
                  {camp.status === 'fulfilled' ? tzs(camp.deposits_collected) : `${tzs(camp.deposit_amount)} (${camp.deposit_percentage}%)`}
                </span>
              </div>

              {camp.status !== 'fulfilled' && (
                <div style={s.progressWrap}>
                  <div style={s.progressLabel}>
                    <span>Orders / Target</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{camp.current_orders} / {camp.target_orders}</span>
                  </div>
                  <div style={s.progressBar}>
                    <div style={s.progressFill((camp.current_orders / camp.target_orders) * 100, camp.current_orders >= camp.target_orders ? '#10b981' : 'var(--accent)')} />
                  </div>
                </div>
              )}

              {camp.status === 'fulfilled' && (
                <div style={s.priceRow}>
                  <span style={s.priceLabel}>Orders fulfilled</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                    {camp.current_orders} / {camp.target_orders} <Icon name="checkCircle" size={14} />
                  </span>
                </div>
              )}

              <div style={s.campaignDates}>
                <span><Icon name="calendar" size={12} /> {camp.status === 'fulfilled' ? 'Closed' : 'Closes'}: {formatDate(camp.close_date)}</span>
                <span><Icon name="truck" size={12} /> {camp.status === 'fulfilled' ? 'Delivered' : 'ETA'}: {formatDate(camp.expected_arrival)}</span>
              </div>
            </div>
            <div style={s.campaignFooter}>
              {camp.status === 'active' ? (
                <>
                  <button style={{ ...s.campaignBtn, background: 'var(--accent)', color: '#fff', border: 'none' }}>
                    <Icon name="messageCircle" size={14} /> Broadcast Update
                  </button>
                  <button style={s.campaignBtn}>
                    <Icon name="eye" size={14} /> View Orders
                  </button>
                </>
              ) : (
                <>
                  <button style={s.campaignBtn}>
                    <Icon name="download" size={14} /> Download Report
                  </button>
                  <button style={s.campaignBtn}>
                    <Icon name="copy" size={14} /> Duplicate
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Orders Table */}
      <div style={s.tableSection}>
        <div style={s.tableHeader}>
          <div style={s.tableTitle}>All Pre-Orders — CAMP-001 & CAMP-002</div>
          <div style={s.tableFilters}>
            <select style={s.filterSelect} value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)}>
              <option value="all">All Campaigns</option>
              {campaigns.filter(c => c.status === 'active').map(c => (
                <option key={c.id} value={c.id}>{c.campaign_number}</option>
              ))}
            </select>
            <select style={s.filterSelect} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending_deposit">Pending Deposit</option>
              <option value="deposit_paid">Deposit Paid</option>
              <option value="arrived">Arrived</option>
              <option value="fulfilled">Fulfilled</option>
            </select>
            <button style={s.btnSecondary}>
              <Icon name="download" size={14} /> Excel
            </button>
            <button style={s.sendRemindersBtn}>
              <Icon name="messageCircle" size={14} /> Send Reminders
            </button>
          </div>
        </div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Order #</th>
              <th style={s.th}>Customer</th>
              <th style={s.th}>WhatsApp</th>
              <th style={s.th}>Campaign</th>
              <th style={s.th}>Product</th>
              <th style={s.th}>Total (TZS)</th>
              <th style={s.th}>Deposit Paid</th>
              <th style={s.th}>Balance Due</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>ETA</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPreorders.map(order => (
              <tr key={order.id}>
                <td style={s.td}>
                  <span style={s.orderNumber}>{order.preorder_number}</span>
                </td>
                <td style={s.td}>
                  <div style={s.customerCell}>
                    <span style={s.customerName}>{order.customer_name}</span>
                    <span style={s.tierBadge(getTierColor(order.customer_tier))}>
                      {order.customer_tier === 'crown' ? 'Crown Member' : order.customer_tier === 'gold' ? 'Gold' : 'Mama'}
                    </span>
                  </div>
                </td>
                <td style={s.td}>{order.customer_whatsapp}</td>
                <td style={s.td}>{order.campaign_name}</td>
                <td style={s.td}>{order.product_name}</td>
                <td style={s.td}>
                  <span style={s.amountCell}>{order.total_amount.toLocaleString()}</span>
                </td>
                <td style={s.td}>
                  <span style={s.depositCell(order.deposit_paid > 0)}>{order.deposit_paid.toLocaleString()}</span>
                </td>
                <td style={s.td}>
                  <span style={s.balanceCell}>{order.balance_due.toLocaleString()}</span>
                </td>
                <td style={s.td}>
                  <span style={s.statusBadge(getOrderStatusColor(order.status))}>
                    {getOrderStatusLabel(order.status)}
                  </span>
                </td>
                <td style={s.td}>{formatDate(order.expected_arrival)}</td>
                <td style={s.td}>
                  <button style={s.actionBtn}>
                    <Icon name="messageCircle" size={12} /> Remind
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
