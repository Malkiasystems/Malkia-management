import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

interface Referrer {
  id: string
  customer_id: string
  name: string
  referral_code: string
  location: string
  total_referrals: number
  successful_referrals: number
  total_earned: number
  crown_tier: string
}

interface ReferralActivity {
  id: string
  new_customer_name: string
  referred_by_name: string
  code_used: string
  status: 'pending' | 'converted' | 'expired'
  created_at: string
  first_purchase_amount?: number
}

// Icon component
const Icon = ({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  
  const paths: Record<string, React.ReactNode> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    share2: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>,
    gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  }
  
  return <svg {...props}>{paths[name] || paths.share2}</svg>
}

// Medal component
const Medal = ({ rank }: { rank: number }) => {
  const colors = {
    1: { bg: '#fbbf24', icon: '#fff' },
    2: { bg: '#9ca3af', icon: '#fff' },
    3: { bg: '#cd7f32', icon: '#fff' },
  }
  const c = colors[rank as keyof typeof colors] || { bg: 'var(--surface2)', icon: 'var(--text3)' }
  
  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: c.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 700,
      color: c.icon,
      boxShadow: rank <= 3 ? `0 2px 8px ${c.bg}40` : 'none'
    }}>
      {rank <= 3 ? <Icon name="award" size={16} color={c.icon} /> : rank}
    </div>
  )
}

export default function CRMReferrals({ onNav }: Props) {
  const [topReferrers, setTopReferrers] = useState<Referrer[]>([])
  const [recentActivity, setRecentActivity] = useState<ReferralActivity[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [copiedLink, setCopiedLink] = useState(false)

  // Reward config state
  const [referrerReward, setReferrerReward] = useState(5000)
  const [referrerPoints, setReferrerPoints] = useState(500)
  const [newCustomerReward, setNewCustomerReward] = useState(3000)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Load referral data
    const { data: refData } = await supabase
      .from('referrals')
      .select('*, referrer:customers!referrer_id(name, referral_code, location, crown_tier)')
      .order('created_at', { ascending: false })

    if (refData && refData.length > 0) {
      // Group by referrer
      const referrerMap = new Map<string, Referrer>()
      refData.forEach(r => {
        const existing = referrerMap.get(r.referrer_id)
        if (existing) {
          existing.total_referrals++
          if (r.status === 'converted') {
            existing.successful_referrals++
            existing.total_earned += r.referrer_reward_value || 5000
          }
        } else {
          referrerMap.set(r.referrer_id, {
            id: r.referrer_id,
            customer_id: r.referrer_id,
            name: r.referrer?.name || 'Unknown',
            referral_code: r.referrer?.referral_code || r.referrer_code,
            location: r.referrer?.location || 'DSM',
            total_referrals: 1,
            successful_referrals: r.status === 'converted' ? 1 : 0,
            total_earned: r.status === 'converted' ? (r.referrer_reward_value || 5000) : 0,
            crown_tier: r.referrer?.crown_tier || 'mama'
          })
        }
      })
      setTopReferrers(Array.from(referrerMap.values()).sort((a, b) => b.successful_referrals - a.successful_referrals))
      
      // Recent activity
      setRecentActivity(refData.slice(0, 10).map(r => ({
        id: r.id,
        new_customer_name: r.referred_name || 'New Customer',
        referred_by_name: r.referrer?.name || 'Unknown',
        code_used: r.referrer_code,
        status: r.status,
        created_at: r.created_at,
        first_purchase_amount: r.first_purchase_amount
      })))
    } else {
      // Demo data
      setTopReferrers([
        { id: '1', customer_id: 'c1', name: 'Amina Hassan', referral_code: 'MAL-AMINA22', location: 'DSM', total_referrals: 7, successful_referrals: 5, total_earned: 25000, crown_tier: 'crown' },
        { id: '2', customer_id: 'c2', name: 'Grace Mwanza', referral_code: 'MAL-GRACE14', location: 'DSM', total_referrals: 4, successful_referrals: 3, total_earned: 15000, crown_tier: 'gold' },
        { id: '3', customer_id: 'c3', name: 'Zainab Ally', referral_code: 'MAL-ZAINAB07', location: 'Arusha', total_referrals: 2, successful_referrals: 1, total_earned: 5000, crown_tier: 'mama' },
      ])
      setRecentActivity([
        { id: '1', new_customer_name: 'Halima Juma', referred_by_name: 'Amina Hassan', code_used: 'MAL-AMINA22', status: 'converted', created_at: new Date().toISOString(), first_purchase_amount: 245000 },
        { id: '2', new_customer_name: 'Neema Omari', referred_by_name: 'Grace Mwanza', code_used: 'MAL-GRACE14', status: 'pending', created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: '3', new_customer_name: 'Safia Rashid', referred_by_name: 'Amina Hassan', code_used: 'MAL-AMINA22', status: 'converted', created_at: new Date(Date.now() - 172800000).toISOString(), first_purchase_amount: 180000 },
      ])
    }

    setLoading(false)
  }

  const getReferralLink = (code: string) => `malkia.co.tz/ref/${code}`

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(getReferralLink(code))
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'converted': return '#10b981'
      case 'pending': return '#f59e0b'
      case 'expired': return '#6b7280'
      default: return '#6b7280'
    }
  }

  // Calculate stats
  const totalReferrals = topReferrers.reduce((sum, r) => sum + r.total_referrals, 0)
  const successfulReferrals = topReferrers.reduce((sum, r) => sum + r.successful_referrals, 0)
  const totalRevenue = recentActivity.filter(a => a.status === 'converted').reduce((sum, a) => sum + (a.first_purchase_amount || 0), 0)
  const conversionRate = totalReferrals > 0 ? (successfulReferrals / totalReferrals * 100).toFixed(1) : '0'

  const selectedReferrer = topReferrers.find(r => r.id === selectedCustomer) || topReferrers[0]

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
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 } as React.CSSProperties,
    kpiCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 20px', textAlign: 'center' as const } as React.CSSProperties,
    kpiValue: { fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
    kpiLabel: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as React.CSSProperties,

    // Main Grid
    mainGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 } as React.CSSProperties,

    // Leaderboard Card
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' } as React.CSSProperties,
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    cardTitle: { display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700 } as React.CSSProperties,
    cardBody: { padding: 0 } as React.CSSProperties,

    // Leaderboard Item
    leaderItem: (isFirst: boolean) => ({ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--border)', background: isFirst ? 'linear-gradient(90deg, rgba(251,191,36,0.05) 0%, transparent 100%)' : 'transparent' }) as React.CSSProperties,
    leaderInfo: { flex: 1 } as React.CSSProperties,
    leaderName: { fontSize: 14, fontWeight: 600, marginBottom: 2 } as React.CSSProperties,
    leaderCode: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    leaderStats: { display: 'flex', alignItems: 'center', gap: 16, textAlign: 'right' as const } as React.CSSProperties,
    leaderStat: { textAlign: 'right' as const } as React.CSSProperties,
    leaderStatValue: { fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700 } as React.CSSProperties,
    leaderStatLabel: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    rewardBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,

    // Right Panel
    rightPanel: { display: 'flex', flexDirection: 'column' as const, gap: 20 } as React.CSSProperties,

    // Link Generator
    linkSection: { padding: 20 } as React.CSSProperties,
    linkLabel: { fontSize: 12, color: 'var(--text3)', marginBottom: 8 } as React.CSSProperties,
    customerSelect: { width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', marginBottom: 16 } as React.CSSProperties,
    linkBox: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 } as React.CSSProperties,
    linkText: { fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', wordBreak: 'break-all' as const } as React.CSSProperties,
    linkActions: { display: 'flex', gap: 8 } as React.CSSProperties,
    linkBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text)' } as React.CSSProperties,
    linkBtnPrimary: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', color: '#fff' } as React.CSSProperties,

    // Reward Config
    configSection: { padding: 20, borderTop: '1px solid var(--border)' } as React.CSSProperties,
    configTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 16 } as React.CSSProperties,
    configRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } as React.CSSProperties,
    configInput: { width: 80, padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)', textAlign: 'right' as const } as React.CSSProperties,
    configLabel: { flex: 1, fontSize: 12, color: 'var(--text3)' } as React.CSSProperties,
    configIcon: { width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,

    // Activity Table
    tableSection: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const } as React.CSSProperties,
    th: { textAlign: 'left' as const, padding: '12px 16px', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, borderBottom: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    td: { padding: '14px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    statusBadge: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: `${color}15`, color, textTransform: 'capitalize' as const }) as React.CSSProperties,
    codeCell: { fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
          <Icon name="share2" size={32} />
          <div style={{ marginTop: 12 }}>Loading referrals...</div>
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
              <Icon name="share2" size={28} color="var(--accent)" />
              Referral System
            </h1>
            <p style={s.sub}>Unique codes · Automatic rewards · Leaderboard</p>
          </div>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnSecondary}>
            <Icon name="download" size={16} /> Export
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> New Campaign
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={s.kpiGrid}>
        <div style={s.kpiCard}>
          <div style={{ ...s.kpiValue, color: '#8b5cf6' }}>{totalReferrals}</div>
          <div style={s.kpiLabel}>Total Referrals</div>
        </div>
        <div style={s.kpiCard}>
          <div style={{ ...s.kpiValue, color: '#10b981' }}>{successfulReferrals}</div>
          <div style={s.kpiLabel}>Successful (converted)</div>
        </div>
        <div style={s.kpiCard}>
          <div style={{ ...s.kpiValue, color: 'var(--accent)' }}>{tzs(totalRevenue)}</div>
          <div style={s.kpiLabel}>Revenue from Referrals</div>
        </div>
        <div style={s.kpiCard}>
          <div style={{ ...s.kpiValue, color: '#fbbf24' }}>{conversionRate}%</div>
          <div style={s.kpiLabel}>Conversion Rate</div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Leaderboard */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>
              <Icon name="trophy" size={18} color="#fbbf24" />
              Top Referrers Leaderboard
            </div>
          </div>
          <div style={s.cardBody}>
            {topReferrers.map((referrer, i) => (
              <div key={referrer.id} style={s.leaderItem(i === 0)}>
                <Medal rank={i + 1} />
                <div style={s.leaderInfo}>
                  <div style={s.leaderName}>{referrer.name}</div>
                  <div style={s.leaderCode}>{referrer.referral_code} · {referrer.location}</div>
                </div>
                <div style={s.leaderStats}>
                  <div style={s.leaderStat}>
                    <div style={{ ...s.leaderStatValue, color: 'var(--text)' }}>{referrer.successful_referrals}</div>
                    <div style={s.leaderStatLabel}>referrals</div>
                  </div>
                  <div style={s.leaderStat}>
                    <div style={{ ...s.leaderStatValue, color: '#10b981' }}>{tzs(referrer.total_earned)}</div>
                    <div style={s.leaderStatLabel}>earned</div>
                  </div>
                  <button style={s.rewardBtn}>
                    <Icon name="messageCircle" size={14} /> Reward
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div style={s.rightPanel}>
          {/* Link Generator */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <div style={s.cardTitle}>
                <Icon name="link" size={18} color="var(--accent)" />
                Generate Referral Link
              </div>
            </div>
            <div style={s.linkSection}>
              <div style={s.linkLabel}>Select Customer</div>
              <select 
                style={s.customerSelect}
                value={selectedCustomer}
                onChange={e => setSelectedCustomer(e.target.value)}
              >
                {topReferrers.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              <div style={s.linkLabel}>Referral Link</div>
              <div style={s.linkBox}>
                <div style={s.linkText}>
                  {selectedReferrer ? getReferralLink(selectedReferrer.referral_code) : 'Select a customer'}
                </div>
              </div>

              <div style={s.linkActions}>
                <button 
                  style={s.linkBtn} 
                  onClick={() => selectedReferrer && copyLink(selectedReferrer.referral_code)}
                >
                  <Icon name="copy" size={14} /> {copiedLink ? 'Copied!' : 'Copy'}
                </button>
                <button style={s.linkBtnPrimary}>
                  <Icon name="messageCircle" size={14} /> Send via WA
                </button>
              </div>
            </div>

            {/* Reward Configuration */}
            <div style={s.configSection}>
              <div style={s.configTitle}>
                <Icon name="gift" size={16} color="#f472b6" />
                Reward Configuration
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>Referrer Reward</div>
                <div style={s.configRow}>
                  <div style={s.configIcon}><Icon name="dollarSign" size={14} color="var(--text3)" /></div>
                  <input 
                    type="number" 
                    style={s.configInput} 
                    value={referrerReward} 
                    onChange={e => setReferrerReward(Number(e.target.value))}
                  />
                  <span style={s.configLabel}>TZS discount voucher per referral</span>
                </div>
                <div style={s.configRow}>
                  <div style={s.configIcon}><Icon name="crown" size={14} color="#fbbf24" /></div>
                  <input 
                    type="number" 
                    style={s.configInput} 
                    value={referrerPoints} 
                    onChange={e => setReferrerPoints(Number(e.target.value))}
                  />
                  <span style={s.configLabel}>Crown Points per referral</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>New Customer Reward</div>
                <div style={s.configRow}>
                  <div style={s.configIcon}><Icon name="gift" size={14} color="var(--text3)" /></div>
                  <input 
                    type="number" 
                    style={s.configInput} 
                    value={newCustomerReward} 
                    onChange={e => setNewCustomerReward(Number(e.target.value))}
                  />
                  <span style={s.configLabel}>TZS welcome discount</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={s.tableSection}>
        <div style={s.cardHeader}>
          <div style={s.cardTitle}>
            <Icon name="clock" size={18} color="var(--text3)" />
            Recent Referral Activity
          </div>
        </div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>New Customer</th>
              <th style={s.th}>Referred By</th>
              <th style={s.th}>Code Used</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentActivity.map(activity => (
              <tr key={activity.id}>
                <td style={s.td}>{activity.new_customer_name}</td>
                <td style={s.td}>{activity.referred_by_name}</td>
                <td style={s.td}>
                  <span style={s.codeCell}>{activity.code_used}</span>
                </td>
                <td style={s.td}>
                  <span style={s.statusBadge(getStatusColor(activity.status))}>
                    {activity.status}
                  </span>
                </td>
                <td style={s.td}>{formatDate(activity.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
