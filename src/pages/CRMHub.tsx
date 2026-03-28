import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

interface DashboardStats {
  totalCustomers: number
  unreadMessages: number
  openTickets: number
  upsellRate: number
  referralsThisMonth: number
  crownMembers: number
  activeAutomations: number
  avgCSAT: number
  activePreorders: number
  preorderDeposits: number
  mamaCount: number
  goldCount: number
  crownCount: number
  inactiveCount: number
}

interface ConversationPreview {
  id: string
  customer_name: string
  customer_whatsapp: string
  last_message_preview: string
  last_message_at: string
  unread_count: number
  priority: string
  crown_tier?: string
}

interface TopCustomer {
  id: string
  name: string
  crown_tier: string
  lifetime_value: number
}

interface FeedbackItem {
  id: string
  customer_name: string
  type: string
  rating: number
  comment: string
  status: string
  created_at: string
}

// Lucide-style icons
const Icon = ({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  
  const paths: Record<string, React.ReactNode> = {
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    ticket: <><path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v0z"/><path d="M2 15a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v0z"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    share2: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    sparkles: <><path d="M12 3v1m0 16v1m-8-9H3m18 0h-1M5.6 5.6l.7.7m12.4 12.4l.7.7M5.6 18.4l.7-.7M18.7 5.6l-.7.7"/><circle cx="12" cy="12" r="4"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>,
  }
  
  return <svg {...props}>{paths[name] || paths.users}</svg>
}

export default function CRMHub({ onNav }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [conversations, setConversations] = useState<ConversationPreview[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [recentFeedback, setRecentFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [quickReply, setQuickReply] = useState('')
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    setLoading(true)

    // Load all data in parallel
    const [
      customersRes,
      conversationsRes,
      feedbackRes,
      preordersRes,
      referralsRes,
      automationsRes,
      topCustomersRes
    ] = await Promise.all([
      supabase.from('customers').select('id, crown_tier, crown_points, is_active, lifetime_value, csat_score'),
      supabase.from('conversations').select('*').eq('status', 'open').order('last_message_at', { ascending: false }).limit(10),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('preorders').select('id, deposit_paid, status').in('status', ['pending_deposit', 'deposit_paid', 'ordered']),
      supabase.from('referrals').select('id').gte('created_at', new Date(new Date().setDate(1)).toISOString()),
      supabase.from('automations').select('id').eq('is_active', true),
      supabase.from('customers').select('id, name, crown_tier, lifetime_value').eq('is_active', true).order('lifetime_value', { ascending: false }).limit(5)
    ])

    const customers = customersRes.data || []
    const activeCustomers = customers.filter(c => c.is_active)
    
    // Calculate tier counts
    const mamaCount = activeCustomers.filter(c => !c.crown_tier || c.crown_tier === 'mama').length
    const goldCount = activeCustomers.filter(c => c.crown_tier === 'gold').length
    const crownCount = activeCustomers.filter(c => c.crown_tier === 'crown').length
    const inactiveCount = customers.filter(c => !c.is_active).length

    // Calculate avg CSAT
    const csatScores = (feedbackRes.data || []).filter(f => f.csat_score).map(f => f.csat_score)
    const avgCSAT = csatScores.length > 0 ? csatScores.reduce((a, b) => a + b, 0) / csatScores.length : 0

    // Calculate unread count
    const unreadMessages = (conversationsRes.data || []).reduce((sum, c) => sum + (c.unread_count || 0), 0)

    // Open tickets
    const openTickets = (feedbackRes.data || []).filter(f => f.status === 'new' || f.status === 'in_progress').length

    // Preorder stats
    const preorders = preordersRes.data || []
    const preorderDeposits = preorders.reduce((sum, p) => sum + (p.deposit_paid || 0), 0)

    setStats({
      totalCustomers: activeCustomers.length,
      unreadMessages,
      openTickets,
      upsellRate: 25.5, // Would be calculated from actual data
      referralsThisMonth: referralsRes.count || (referralsRes.data || []).length,
      crownMembers: goldCount + crownCount,
      activeAutomations: automationsRes.count || (automationsRes.data || []).length,
      avgCSAT: Math.round(avgCSAT * 10) / 10,
      activePreorders: preorders.length,
      preorderDeposits,
      mamaCount,
      goldCount,
      crownCount,
      inactiveCount
    })

    setConversations(conversationsRes.data || [])
    setTopCustomers(topCustomersRes.data || [])
    setRecentFeedback((feedbackRes.data || []).slice(0, 5))

    setLoading(false)
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays === 1) return 'Yesterday'
    return `${diffDays}d`
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case 'crown': return 'Crown'
      case 'gold': return 'Gold'
      default: return 'Mama'
    }
  }

  const s = {
    page: { padding: 28, maxWidth: 1600, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 } as React.CSSProperties,
    headerLeft: {} as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 26, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    sub: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    headerRight: { display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    statusBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 20, fontSize: 12, color: '#10b981' } as React.CSSProperties,
    statusDot: { width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' } as React.CSSProperties,
    btnPrimary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    
    // KPI Grid
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 12, marginBottom: 24 } as React.CSSProperties,
    kpiCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' as const, cursor: 'pointer', transition: 'all .15s' } as React.CSSProperties,
    kpiValue: { fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
    kpiLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as React.CSSProperties,
    
    // Main Grid
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 } as React.CSSProperties,
    
    // Cards
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' } as React.CSSProperties,
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    cardTitle: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    cardTitleText: { fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700 } as React.CSSProperties,
    cardSub: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    cardBody: { padding: 0 } as React.CSSProperties,
    cardBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    
    // Conversation Item
    convoItem: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s' } as React.CSSProperties,
    convoAvatar: { width: 40, height: 40, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 } as React.CSSProperties,
    convoContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    convoName: { fontSize: 13, fontWeight: 600, marginBottom: 2 } as React.CSSProperties,
    convoPreview: { fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
    convoMeta: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 4 } as React.CSSProperties,
    convoTime: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    convoBadge: { minWidth: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' } as React.CSSProperties,
    
    // Quick Reply
    quickReplyWrap: { display: 'flex', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    quickReplyInput: { flex: 1, padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)' } as React.CSSProperties,
    quickReplyBtn: { width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    
    // Customer List
    customerItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    customerRank: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 } as React.CSSProperties,
    customerInfo: { flex: 1 } as React.CSSProperties,
    customerName: { fontSize: 13, fontWeight: 600 } as React.CSSProperties,
    tierBadge: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: `${color}20`, color }) as React.CSSProperties,
    customerValue: { fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 } as React.CSSProperties,
    
    // Tier Breakdown
    tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, padding: 20 } as React.CSSProperties,
    tierCard: { textAlign: 'center' as const, padding: 16 } as React.CSSProperties,
    tierValue: { fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
    tierLabel: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    tierDot: (color: string) => ({ width: 8, height: 8, borderRadius: '50%', background: color }) as React.CSSProperties,
    
    // Search
    searchWrap: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    searchInput: { flex: 1, padding: '8px 0', background: 'transparent', border: 'none', fontSize: 13, color: 'var(--text)' } as React.CSSProperties,
    
    // Bottom Grid
    bottomGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } as React.CSSProperties,
    
    // Feedback Item
    feedbackItem: { display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    feedbackIcon: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } as React.CSSProperties,
    feedbackContent: { flex: 1 } as React.CSSProperties,
    feedbackHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } as React.CSSProperties,
    feedbackName: { fontSize: 13, fontWeight: 600 } as React.CSSProperties,
    feedbackType: { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)' } as React.CSSProperties,
    feedbackComment: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 } as React.CSSProperties,
    feedbackStars: { display: 'flex', gap: 2 } as React.CSSProperties,
    
    // Upsell Card
    upsellItem: { display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    upsellIcon: { width: 36, height: 36, borderRadius: 10, background: 'rgba(251, 191, 36, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } as React.CSSProperties,
    upsellContent: { flex: 1 } as React.CSSProperties,
    upsellTitle: { fontSize: 13, fontWeight: 600, marginBottom: 2 } as React.CSSProperties,
    upsellDesc: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    upsellStats: { display: 'flex', gap: 16, marginTop: 8 } as React.CSSProperties,
    upsellStat: { fontSize: 11 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
          <Icon name="sparkles" size={32} />
          <div style={{ marginTop: 12 }}>Loading CRM Hub...</div>
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="sparkles" size={28} color="var(--accent)" />
            Malkia CRM — Konnect Hub
          </h1>
          <p style={s.sub}>Customer relationship command centre · All segments live below · Click any tile to expand</p>
        </div>
        <div style={s.headerRight}>
          <div style={s.statusBadge}>
            <div style={s.statusDot} />
            WhatsApp Connected
          </div>
          <button style={s.btnPrimary} onClick={() => onNav('crm-inbox' as Page)}>
            <Icon name="messageCircle" size={16} />
            Open Inbox
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={s.kpiGrid}>
        {[
          { value: stats.totalCustomers.toLocaleString(), label: 'Customers', color: 'var(--accent)', icon: 'users', page: 'customers' },
          { value: stats.unreadMessages, label: 'Unread Msgs', color: '#f59e0b', icon: 'messageCircle', page: 'crm-inbox' },
          { value: stats.openTickets, label: 'Open Tickets', color: '#ef4444', icon: 'ticket', page: 'crm-feedback' },
          { value: `${stats.upsellRate}%`, label: 'Upsell Rate', color: '#10b981', icon: 'trendingUp', page: 'crm-upsell' },
          { value: stats.referralsThisMonth, label: 'Referrals', color: '#8b5cf6', icon: 'share2', page: 'crm-referrals' },
          { value: stats.crownMembers, label: 'Crown Members', color: '#fbbf24', icon: 'crown', page: 'crm-loyalty' },
          { value: stats.activeAutomations, label: 'Automations', color: '#06b6d4', icon: 'zap', page: 'crm-automations' },
          { value: stats.avgCSAT > 0 ? `${stats.avgCSAT}★` : '—', label: 'CSAT', color: '#fbbf24', icon: 'star', page: 'crm-feedback' },
          { value: stats.activePreorders, label: 'Pre-Orders', color: '#f472b6', icon: 'package', page: 'crm-preorders' },
        ].map((kpi) => (
          <div 
            key={kpi.label} 
            style={s.kpiCard}
            onClick={() => onNav(kpi.page as Page)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = kpi.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ ...s.kpiValue, color: kpi.color }}>{kpi.value}</div>
            <div style={s.kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Live Inbox */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>
              <Icon name="inbox" size={18} color="var(--accent)" />
              <div>
                <div style={s.cardTitleText}>Live Inbox</div>
                <div style={s.cardSub}>{stats.unreadMessages} unread · {conversations.length} conversations active</div>
              </div>
            </div>
            <button style={s.cardBtn} onClick={() => onNav('crm-inbox' as Page)}>
              Open Full <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                <Icon name="inbox" size={32} color="var(--text3)" />
                <div style={{ marginTop: 8 }}>No active conversations</div>
              </div>
            ) : (
              conversations.slice(0, 5).map((convo) => (
                <div 
                  key={convo.id} 
                  style={{ ...s.convoItem, background: selectedConvo === convo.id ? 'var(--surface2)' : 'transparent' }}
                  onClick={() => setSelectedConvo(convo.id)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedConvo === convo.id ? 'var(--surface2)' : 'transparent'}
                >
                  <div style={{ ...s.convoAvatar, background: getTierColor(convo.crown_tier || 'mama') + '20', color: getTierColor(convo.crown_tier || 'mama') }}>
                    {convo.customer_name?.charAt(0) || '?'}
                  </div>
                  <div style={s.convoContent}>
                    <div style={s.convoName}>{convo.customer_name || convo.customer_whatsapp}</div>
                    <div style={s.convoPreview}>{convo.last_message_preview || 'No messages yet'}</div>
                  </div>
                  <div style={s.convoMeta}>
                    <div style={s.convoTime}>{formatTime(convo.last_message_at)}</div>
                    {convo.unread_count > 0 && (
                      <div style={s.convoBadge}>{convo.unread_count}</div>
                    )}
                    {convo.priority === 'urgent' && (
                      <span style={{ fontSize: 9, padding: '2px 6px', background: '#ef444420', color: '#ef4444', borderRadius: 4, fontWeight: 600 }}>URGENT</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={s.quickReplyWrap}>
            <input 
              style={s.quickReplyInput} 
              placeholder="Quick reply to Amina..." 
              value={quickReply}
              onChange={e => setQuickReply(e.target.value)}
            />
            <button style={s.quickReplyBtn}>
              <Icon name="send" size={18} color="#fff" />
            </button>
          </div>
        </div>

        {/* Customer Profiles */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>
              <Icon name="users" size={18} color="var(--accent)" />
              <div>
                <div style={s.cardTitleText}>Customer Profiles</div>
                <div style={s.cardSub}>{stats.totalCustomers} total · {topCustomers.length > 0 ? 'Top by LTV' : ''}</div>
              </div>
            </div>
            <button style={s.cardBtn} onClick={() => onNav('customers')}>
              Open Full <Icon name="arrowRight" size={14} />
            </button>
          </div>
          
          {/* Tier Breakdown */}
          <div style={s.tierGrid}>
            {[
              { value: stats.mamaCount, label: 'Mama', color: '#10b981' },
              { value: stats.goldCount, label: 'Gold', color: '#fbbf24' },
              { value: stats.crownCount, label: 'Crown', color: '#f472b6' },
              { value: stats.inactiveCount, label: 'Inactive', color: '#6b7280' },
            ].map((tier) => (
              <div key={tier.label} style={s.tierCard}>
                <div style={{ ...s.tierValue, color: tier.color }}>{tier.value}</div>
                <div style={s.tierLabel}>
                  <div style={s.tierDot(tier.color)} />
                  {tier.label}
                </div>
              </div>
            ))}
          </div>

          {/* Top Customers */}
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <div style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Top Customers by LTV
            </div>
            {topCustomers.map((customer, i) => (
              <div key={customer.id} style={s.customerItem}>
                <div style={{ ...s.customerRank, background: i === 0 ? '#fbbf24' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--surface2)', color: i < 3 ? '#fff' : 'var(--text3)' }}>
                  {i + 1}
                </div>
                <div style={s.customerInfo}>
                  <div style={s.customerName}>{customer.name}</div>
                </div>
                <span style={s.tierBadge(getTierColor(customer.crown_tier))}>
                  <Icon name="crown" size={10} />
                  {getTierLabel(customer.crown_tier)}
                </span>
                <div style={{ ...s.customerValue, color: 'var(--accent)' }}>{tzs(customer.lifetime_value)}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={s.searchWrap}>
            <Icon name="search" size={16} color="var(--text3)" />
            <input style={s.searchInput} placeholder="Search customers..." />
            <button style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="download" size={12} /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div style={s.bottomGrid}>
        {/* Feedback Management */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>
              <Icon name="heart" size={18} color="#f472b6" />
              <div>
                <div style={s.cardTitleText}>Feedback Management</div>
                <div style={s.cardSub}>{stats.openTickets} open · {recentFeedback.filter(f => f.rating && f.rating >= 4).length} testimonials</div>
              </div>
            </div>
            <button style={s.cardBtn} onClick={() => onNav('crm-feedback' as Page)}>
              Open Full <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {recentFeedback.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                No feedback yet
              </div>
            ) : (
              recentFeedback.slice(0, 4).map((fb) => (
                <div key={fb.id} style={s.feedbackItem}>
                  <div style={{ ...s.feedbackIcon, background: fb.type === 'review' ? 'rgba(251, 191, 36, 0.1)' : fb.type === 'complaint' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)' }}>
                    <Icon 
                      name={fb.type === 'review' ? 'star' : fb.type === 'complaint' ? 'alertCircle' : 'checkCircle'} 
                      size={18} 
                      color={fb.type === 'review' ? '#fbbf24' : fb.type === 'complaint' ? '#ef4444' : '#10b981'} 
                    />
                  </div>
                  <div style={s.feedbackContent}>
                    <div style={s.feedbackHeader}>
                      <span style={s.feedbackName}>{fb.customer_name || 'Anonymous'}</span>
                      <span style={s.feedbackType}>{fb.type}</span>
                      {fb.rating && (
                        <div style={s.feedbackStars}>
                          {[1,2,3,4,5].map(n => (
                            <Icon key={n} name="star" size={12} color={n <= fb.rating ? '#fbbf24' : 'var(--border)'} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={s.feedbackComment}>{fb.comment?.substring(0, 80) || 'No comment'}{fb.comment && fb.comment.length > 80 ? '...' : ''}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Smart Upsell Engine */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>
              <Icon name="target" size={18} color="#fbbf24" />
              <div>
                <div style={s.cardTitleText}>Smart Upsell Engine</div>
                <div style={s.cardSub}>AI-powered recommendations · {stats.upsellRate}% conversion</div>
              </div>
            </div>
            <button style={s.cardBtn} onClick={() => onNav('crm-upsell' as Page)}>
              Open Full <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {[
              { title: 'Week 36 Delivery Kit', desc: 'Breast Pump + Hospital Bag bundle', triggered: 47, converted: 12, revenue: 2340000 },
              { title: 'Postpartum Essentials', desc: 'Belly Binder + Scar Sheet combo', triggered: 38, converted: 9, revenue: 1560000 },
              { title: 'Supplement Refill', desc: 'Repeat purchase reminder', triggered: 124, converted: 45, revenue: 890000 },
            ].map((rule, i) => (
              <div key={i} style={s.upsellItem}>
                <div style={s.upsellIcon}>
                  <Icon name="sparkles" size={18} color="#fbbf24" />
                </div>
                <div style={s.upsellContent}>
                  <div style={s.upsellTitle}>{rule.title}</div>
                  <div style={s.upsellDesc}>{rule.desc}</div>
                  <div style={s.upsellStats}>
                    <span style={s.upsellStat}><strong>{rule.triggered}</strong> triggered</span>
                    <span style={s.upsellStat}><strong style={{ color: '#10b981' }}>{rule.converted}</strong> converted</span>
                    <span style={{ ...s.upsellStat, color: 'var(--accent)', fontWeight: 600 }}>{tzs(rule.revenue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
