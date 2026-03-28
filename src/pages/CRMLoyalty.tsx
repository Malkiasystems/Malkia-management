import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

interface MemberSummary {
  mama: number
  gold: number
  crown: number
  total: number
  totalPoints: number
  pointsRedeemed: number
  revenueFromMembers: number
}

interface CrownMember {
  id: string
  name: string
  whatsapp: string
  crown_tier: string
  crown_points: number
  lifetime_value: number
  total_orders: number
  joined_date: string
  last_purchase_date: string
  points_to_next_tier: number
}

interface Transaction {
  id: string
  customer_name: string
  type: 'earn' | 'redeem' | 'bonus' | 'expire'
  points: number
  source: string
  description: string
  created_at: string
}

// Icon component
const Icon = ({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  
  const paths: Record<string, JSX.Element> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    percent: <><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  }
  
  return <svg {...props}>{paths[name] || paths.crown}</svg>
}

// Tier definitions
const TIERS = [
  { code: 'mama', name: 'Mama', minPoints: 0, color: '#10b981', discount: 0, benefits: ['Base membership', '1 point per TZS 1,000'] },
  { code: 'gold', name: 'Gold', minPoints: 500, color: '#fbbf24', discount: 5, benefits: ['5% discount on all purchases', 'Early access to pre-orders', 'Birthday double points'] },
  { code: 'crown', name: 'Crown', minPoints: 2000, color: '#f472b6', discount: 10, benefits: ['10% discount on all purchases', 'Free delivery on orders 100K+', 'VIP WhatsApp support', 'Exclusive Crown-only products'] },
]

export default function CRMLoyalty({ onNav }: Props) {
  const [summary, setSummary] = useState<MemberSummary | null>(null)
  const [members, setMembers] = useState<CrownMember[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'members' | 'transactions'>('members')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTier, setFilterTier] = useState<string>('all')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Load customers with crown data
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('crown_points', { ascending: false })

    // Load transactions
    const { data: txns } = await supabase
      .from('crown_transactions')
      .select('*, customer:customers(name)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (customers && customers.length > 0) {
      const mama = customers.filter(c => !c.crown_tier || c.crown_tier === 'mama').length
      const gold = customers.filter(c => c.crown_tier === 'gold').length
      const crown = customers.filter(c => c.crown_tier === 'crown').length
      const totalPoints = customers.reduce((sum, c) => sum + (c.crown_points || 0), 0)
      const revenue = customers.reduce((sum, c) => sum + (c.lifetime_value || 0), 0)

      setSummary({
        mama,
        gold,
        crown,
        total: customers.length,
        totalPoints,
        pointsRedeemed: Math.floor(totalPoints * 0.3), // Demo
        revenueFromMembers: revenue
      })

      setMembers(customers.map(c => ({
        id: c.id,
        name: c.name,
        whatsapp: c.whatsapp || '',
        crown_tier: c.crown_tier || 'mama',
        crown_points: c.crown_points || 0,
        lifetime_value: c.lifetime_value || 0,
        total_orders: c.total_orders || 0,
        joined_date: c.created_at,
        last_purchase_date: c.last_contact_date || c.created_at,
        points_to_next_tier: getPointsToNextTier(c.crown_tier || 'mama', c.crown_points || 0)
      })))

      if (txns && txns.length > 0) {
        setTransactions(txns.map(t => ({
          id: t.id,
          customer_name: t.customer?.name || 'Unknown',
          type: t.type,
          points: t.points,
          source: t.source,
          description: t.description || '',
          created_at: t.created_at
        })))
      }
    } else {
      // Demo data
      setSummary({
        mama: 842,
        gold: 158,
        crown: 247,
        total: 1247,
        totalPoints: 2450000,
        pointsRedeemed: 890000,
        revenueFromMembers: 456000000
      })

      setMembers([
        { id: '1', name: 'Amina Hassan', whatsapp: '+255 712 345 678', crown_tier: 'crown', crown_points: 24800, lifetime_value: 4200000, total_orders: 12, joined_date: '2024-01-15', last_purchase_date: '2025-03-20', points_to_next_tier: 0 },
        { id: '2', name: 'Grace Mwanza', whatsapp: '+255 754 987 654', crown_tier: 'gold', crown_points: 1450, lifetime_value: 1850000, total_orders: 7, joined_date: '2024-03-22', last_purchase_date: '2025-03-18', points_to_next_tier: 550 },
        { id: '3', name: 'Zainab Ally', whatsapp: '+255 698 111 222', crown_tier: 'mama', crown_points: 320, lifetime_value: 320000, total_orders: 3, joined_date: '2024-09-10', last_purchase_date: '2025-03-15', points_to_next_tier: 180 },
        { id: '4', name: 'Fatuma Iddi', whatsapp: '+255 621 445 889', crown_tier: 'mama', crown_points: 156, lifetime_value: 156000, total_orders: 2, joined_date: '2024-11-05', last_purchase_date: '2025-02-28', points_to_next_tier: 344 },
      ])

      setTransactions([
        { id: '1', customer_name: 'Amina Hassan', type: 'earn', points: 245, source: 'Purchase', description: 'Order #INV-2025-0234', created_at: new Date().toISOString() },
        { id: '2', customer_name: 'Grace Mwanza', type: 'redeem', points: -500, source: 'Redemption', description: 'Redeemed for TZS 5,000 voucher', created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: '3', customer_name: 'Zainab Ally', type: 'bonus', points: 100, source: 'Bonus', description: 'Birthday bonus points', created_at: new Date(Date.now() - 172800000).toISOString() },
      ])
    }

    setLoading(false)
  }

  const getPointsToNextTier = (currentTier: string, points: number): number => {
    if (currentTier === 'crown') return 0
    if (currentTier === 'gold') return Math.max(0, 2000 - points)
    return Math.max(0, 500 - points)
  }

  const getTierColor = (tier: string) => {
    const t = TIERS.find(x => x.code === tier)
    return t?.color || '#10b981'
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(dateStr)
  }

  const filteredMembers = members.filter(m => {
    if (filterTier !== 'all' && m.crown_tier !== filterTier) return false
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
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

    // Tier Cards
    tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 } as React.CSSProperties,
    tierCard: (color: string) => ({ background: `linear-gradient(135deg, ${color}15 0%, transparent 100%)`, border: `1px solid ${color}30`, borderRadius: 14, padding: 24, position: 'relative' as const, overflow: 'hidden' }) as React.CSSProperties,
    tierIcon: (color: string) => ({ position: 'absolute' as const, top: 20, right: 20, width: 48, height: 48, borderRadius: 12, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    tierName: (color: string) => ({ fontSize: 18, fontWeight: 700, color, marginBottom: 4 }) as React.CSSProperties,
    tierCount: { fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, marginBottom: 8 } as React.CSSProperties,
    tierBenefits: { marginTop: 16 } as React.CSSProperties,
    tierBenefit: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)', marginBottom: 6 } as React.CSSProperties,

    // Stats Row
    statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 } as React.CSSProperties,
    statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 16px' } as React.CSSProperties,
    statLabel: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 } as React.CSSProperties,
    statValue: { fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700 } as React.CSSProperties,

    // Tabs
    tabsWrap: { display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', padding: 4, borderRadius: 10, width: 'fit-content' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text3)' }) as React.CSSProperties,

    // Table
    tableSection: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' } as React.CSSProperties,
    tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    tableFilters: { display: 'flex', gap: 8 } as React.CSSProperties,
    searchInput: { padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', width: 200 } as React.CSSProperties,
    filterSelect: { padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', minWidth: 120 } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const } as React.CSSProperties,
    th: { textAlign: 'left' as const, padding: '12px 16px', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, borderBottom: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    td: { padding: '14px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    memberCell: { display: 'flex', flexDirection: 'column' as const, gap: 2 } as React.CSSProperties,
    memberName: { fontWeight: 600 } as React.CSSProperties,
    memberSub: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    tierBadge: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: `${color}20`, color }) as React.CSSProperties,
    pointsCell: { fontFamily: 'var(--mono)', fontWeight: 700 } as React.CSSProperties,
    progressWrap: { width: 100 } as React.CSSProperties,
    progressBar: { height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 } as React.CSSProperties,
    progressFill: (pct: number, color: string) => ({ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3 }) as React.CSSProperties,
    progressLabel: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,

    // Transaction styles
    txnType: (type: string) => {
      const colors: Record<string, string> = { earn: '#10b981', redeem: '#f59e0b', bonus: '#8b5cf6', expire: '#ef4444' }
      return { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: `${colors[type] || '#6b7280'}20`, color: colors[type] || '#6b7280', textTransform: 'capitalize' as const } as React.CSSProperties
    },
    txnPoints: (points: number) => ({ fontFamily: 'var(--mono)', fontWeight: 700, color: points > 0 ? '#10b981' : '#f59e0b' }) as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
          <Icon name="crown" size={32} />
          <div style={{ marginTop: 12 }}>Loading Crown Loyalty...</div>
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
              <Icon name="crown" size={28} color="#fbbf24" />
              Crown Loyalty Program
            </h1>
            <p style={s.sub}>Points · Tiers · Rewards · Member benefits</p>
          </div>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnSecondary}>
            <Icon name="settings" size={16} /> Settings
          </button>
          <button style={s.btnPrimary}>
            <Icon name="gift" size={16} /> Award Points
          </button>
        </div>
      </div>

      {/* Tier Cards */}
      <div style={s.tierGrid}>
        {TIERS.map(tier => (
          <div key={tier.code} style={s.tierCard(tier.color)}>
            <div style={s.tierIcon(tier.color)}>
              <Icon name="crown" size={24} color={tier.color} />
            </div>
            <div style={s.tierName(tier.color)}>{tier.name} Tier</div>
            <div style={s.tierCount}>
              {tier.code === 'mama' ? summary?.mama : tier.code === 'gold' ? summary?.gold : summary?.crown}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {tier.minPoints === 0 ? 'Base tier' : `${tier.minPoints}+ points`}
            </div>
            <div style={s.tierBenefits}>
              {tier.benefits.map((b, i) => (
                <div key={i} style={s.tierBenefit}>
                  <Icon name="checkCircle" size={14} color={tier.color} />
                  {b}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Stats Row */}
      <div style={s.statsRow}>
        <div style={s.statCard}>
          <div style={s.statLabel}>Total Members</div>
          <div style={{ ...s.statValue, color: 'var(--accent)' }}>{summary?.total.toLocaleString()}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>Points in Circulation</div>
          <div style={{ ...s.statValue, color: '#fbbf24' }}>{summary?.totalPoints.toLocaleString()}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>Points Redeemed</div>
          <div style={{ ...s.statValue, color: '#10b981' }}>{summary?.pointsRedeemed.toLocaleString()}</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>Revenue from Members</div>
          <div style={{ ...s.statValue, color: 'var(--accent)' }}>{tzs(summary?.revenueFromMembers || 0)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabsWrap}>
        <button style={s.tab(activeTab === 'members')} onClick={() => setActiveTab('members')}>Members</button>
        <button style={s.tab(activeTab === 'transactions')} onClick={() => setActiveTab('transactions')}>Transactions</button>
      </div>

      {/* Table */}
      <div style={s.tableSection}>
        <div style={s.tableHeader}>
          <div style={s.tableFilters}>
            <input 
              style={s.searchInput} 
              placeholder="Search members..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <select style={s.filterSelect} value={filterTier} onChange={e => setFilterTier(e.target.value)}>
              <option value="all">All Tiers</option>
              <option value="mama">Mama</option>
              <option value="gold">Gold</option>
              <option value="crown">Crown</option>
            </select>
          </div>
          <button style={s.btnSecondary}>
            <Icon name="download" size={14} /> Export
          </button>
        </div>

        {activeTab === 'members' ? (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Member</th>
                <th style={s.th}>Tier</th>
                <th style={s.th}>Points</th>
                <th style={s.th}>Progress to Next Tier</th>
                <th style={s.th}>Lifetime Value</th>
                <th style={s.th}>Orders</th>
                <th style={s.th}>Last Purchase</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map(member => {
                const nextTier = TIERS.find(t => t.minPoints > member.crown_points)
                const progress = nextTier ? ((member.crown_points - (TIERS.find(t => t.code === member.crown_tier)?.minPoints || 0)) / (nextTier.minPoints - (TIERS.find(t => t.code === member.crown_tier)?.minPoints || 0))) * 100 : 100

                return (
                  <tr key={member.id}>
                    <td style={s.td}>
                      <div style={s.memberCell}>
                        <span style={s.memberName}>{member.name}</span>
                        <span style={s.memberSub}>{member.whatsapp}</span>
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={s.tierBadge(getTierColor(member.crown_tier))}>
                        <Icon name="crown" size={10} />
                        {member.crown_tier.charAt(0).toUpperCase() + member.crown_tier.slice(1)}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.pointsCell, color: '#fbbf24' }}>{member.crown_points.toLocaleString()}</span>
                    </td>
                    <td style={s.td}>
                      {member.crown_tier === 'crown' ? (
                        <span style={{ fontSize: 11, color: '#f472b6' }}>Max tier reached</span>
                      ) : (
                        <div style={s.progressWrap}>
                          <div style={s.progressBar}>
                            <div style={s.progressFill(progress, getTierColor(member.crown_tier))} />
                          </div>
                          <span style={s.progressLabel}>{member.points_to_next_tier} pts to {nextTier?.name}</span>
                        </div>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.pointsCell, color: 'var(--accent)' }}>{tzs(member.lifetime_value)}</span>
                    </td>
                    <td style={s.td}>{member.total_orders}</td>
                    <td style={s.td}>{formatDate(member.last_purchase_date)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Customer</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Points</th>
                <th style={s.th}>Source</th>
                <th style={s.th}>Description</th>
                <th style={s.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(txn => (
                <tr key={txn.id}>
                  <td style={s.td}>{txn.customer_name}</td>
                  <td style={s.td}>
                    <span style={s.txnType(txn.type)}>
                      <Icon name={txn.type === 'earn' ? 'plus' : txn.type === 'redeem' ? 'minus' : 'gift'} size={10} />
                      {txn.type}
                    </span>
                  </td>
                  <td style={s.td}>
                    <span style={s.txnPoints(txn.points)}>
                      {txn.points > 0 ? '+' : ''}{txn.points.toLocaleString()}
                    </span>
                  </td>
                  <td style={s.td}>{txn.source}</td>
                  <td style={s.td}>{txn.description}</td>
                  <td style={s.td}>{formatTime(txn.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
