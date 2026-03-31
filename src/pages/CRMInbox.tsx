import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    shoppingCart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    starFilled: <><polygon fill="currentColor" stroke="none" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    share2: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <><line x1="5" y1="12" x2="19" y2="12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    moreHorizontal: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    paperclip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    smile: <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
    sparkles: <><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></>,
    mapPin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    thumbsUp: <><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface Conversation {
  id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  tier: 'mama' | 'gold' | 'crown'
  pregnancy_week?: number
  postpartum_weeks?: number
  last_message: string
  last_message_at: string
  unread_count: number
  is_urgent: boolean
  is_resolved: boolean
  assigned_to?: string
  tags: string[]
  avatar_color: string
}

interface Message {
  id: string
  conversation_id: string
  content: string
  is_from_customer: boolean
  is_internal_note: boolean
  sent_at: string
  sent_by?: string
  read_at?: string
}

interface CustomerProfile {
  id: string
  name: string
  phone: string
  tier: 'mama' | 'gold' | 'crown'
  pregnancy_week?: number
  postpartum_weeks?: number
  delivery_type?: string
  crown_points: number
  total_orders: number
  lifetime_value: number
  referrals: number
  tags: string[]
  location?: string
  joined_at: string
}

interface UpsellSuggestion {
  id: string
  product_name: string
  reason: string
  confidence: number
}

// Quick reply templates
const QUICK_REPLIES = [
  { id: 'karibu', label: 'Karibu', template: 'Karibu sana! Tunawezaje kukusaidia leo? 💚' },
  { id: 'product-info', label: 'Product Info', template: 'Asante kwa kuuliza! Bidhaa hii ina sifa zifuatazo...' },
  { id: 'delivery-kit', label: 'Delivery Kit', template: 'Delivery Kit yetu inajumuisha vitu vyote unavyohitaji kwa kujifungua. Je, ungependa kujua zaidi? 🍼' },
  { id: 'upsell-pump', label: 'Upsell: Pump', template: 'Kwa mama ambao wanapanga kunyonyesha, breast pump yetu ni msaada mkubwa! Inapatikana kwa TZS 185,000 na ina warranty ya mwaka mmoja. Je, ungependa kuiona? 🤱' },
  { id: 'ask-review', label: 'Request Review', template: 'Tunafuraha kusikia umefurahia bidhaa yetu! 🌟 Je, unaweza kutushirikisha maoni yako? Utapata pointi 200 za Crown!' },
]

export default function CRMInbox({ onNav }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null)
  const [upsellSuggestions, setUpsellSuggestions] = useState<UpsellSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [isNoteMode, setIsNoteMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'urgent'>('all')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadData = async () => {
    setLoading(true)

    // Try Supabase first
    const { data: convos } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false })
    
    if (convos && convos.length > 0) {
      setConversations(convos as Conversation[])
      if (convos[0]) selectConversation(convos[0] as Conversation)
    } else {
      // No conversations in database - show empty state
      setConversations([])
      setSelectedConvo(null)
    }

    setLoading(false)
  }

  const selectConversation = (convo: Conversation) => {
    setSelectedConvo(convo)
    
    // Load messages for this conversation
    const demoMessages: Message[] = [
      { id: 'm1', conversation_id: convo.id, content: 'Habari! Ninahitaji msaada kuhusu breast pump.', is_from_customer: true, is_internal_note: false, sent_at: '10:32 AM' },
      { id: 'm2', conversation_id: convo.id, content: 'Karibu sana! Tunawezaje kukusaidia leo? 💚', is_from_customer: false, is_internal_note: false, sent_at: '10:33 AM', sent_by: 'Barbra' },
      { id: 'm3', conversation_id: convo.id, content: 'Je, breast pump yenu ina warranty?', is_from_customer: true, is_internal_note: false, sent_at: '10:35 AM' },
      { id: 'm4', conversation_id: convo.id, content: 'Customer is Week 36, Crown member. Perfect for delivery kit upsell. Check if stock is available first.', is_from_customer: false, is_internal_note: true, sent_at: '10:36 AM', sent_by: 'Barbra' },
      { id: 'm5', conversation_id: convo.id, content: 'Ndiyo! Breast pump yetu ina warranty ya mwaka mmoja. Pia tunaweza kukusaidia na spare parts. Je, una mtoto wa kwanza? 🤱', is_from_customer: false, is_internal_note: false, sent_at: '10:38 AM', sent_by: 'Barbra' },
      { id: 'm6', conversation_id: convo.id, content: 'Ndiyo, ni mtoto wa kwanza. Naomba bei na jinsi ya kuagiza.', is_from_customer: true, is_internal_note: false, sent_at: '10:41 AM' },
    ]
    setMessages(demoMessages)

    // Load customer profile
    setCustomerProfile({
      id: convo.customer_id,
      name: convo.customer_name,
      phone: convo.customer_phone,
      tier: convo.tier,
      pregnancy_week: convo.pregnancy_week,
      crown_points: 24800,
      total_orders: 12,
      lifetime_value: 4200000,
      referrals: 5,
      tags: convo.tags,
      location: 'Dar es Salaam',
      joined_at: 'Oct 2024'
    })

    // AI upsell suggestions
    setUpsellSuggestions([
      { id: 'u1', product_name: 'Breast Pump', reason: 'Customer asking about breastfeeding', confidence: 92 },
      { id: 'u2', product_name: 'Delivery Kit', reason: 'Week 36 pregnancy', confidence: 87 },
    ])
  }

  const sendMessage = () => {
    if (!replyText.trim() || !selectedConvo) return

    const newMessage: Message = {
      id: `m${Date.now()}`,
      conversation_id: selectedConvo.id,
      content: replyText,
      is_from_customer: false,
      is_internal_note: isNoteMode,
      sent_at: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      sent_by: 'You'
    }

    setMessages([...messages, newMessage])
    setReplyText('')
    setIsNoteMode(false)
  }

  const loadQuickReply = (template: string) => {
    setReplyText(template)
  }

  const sendUpsellSuggestion = (suggestion: UpsellSuggestion) => {
    const template = suggestion.product_name === 'Breast Pump' 
      ? QUICK_REPLIES.find(q => q.id === 'upsell-pump')?.template 
      : QUICK_REPLIES.find(q => q.id === 'delivery-kit')?.template
    if (template) setReplyText(template)
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const getTierName = (tier: string) => {
    switch (tier) {
      case 'crown': return 'Crown'
      case 'gold': return 'Gold'
      default: return 'Mama'
    }
  }

  const filteredConversations = conversations.filter(c => {
    if (searchQuery && !c.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterTab === 'open' && c.is_resolved) return false
    if (filterTab === 'urgent' && !c.is_urgent) return false
    return true
  })

  const s = {
    page: { display: 'flex', height: 'calc(100vh - 56px)', background: 'var(--bg)' } as React.CSSProperties,
    
    // Left panel - Conversation list
    leftPanel: { width: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, background: 'var(--surface)' } as React.CSSProperties,
    leftHeader: { padding: '14px 16px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    leftTitle: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    searchWrap: { position: 'relative' as const, marginBottom: 10 } as React.CSSProperties,
    searchInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px 10px 36px', fontSize: 12, color: 'var(--text)' } as React.CSSProperties,
    searchIcon: { position: 'absolute' as const, left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' } as React.CSSProperties,
    filterTabs: { display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 4 } as React.CSSProperties,
    filterTab: (isActive: boolean) => ({ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: isActive ? 700 : 400, background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? '#000' : 'var(--text3)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }) as React.CSSProperties,
    convoList: { flex: 1, overflowY: 'auto' as const } as React.CSSProperties,
    convoItem: (isSelected: boolean, isUrgent: boolean) => ({ padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSelected ? 'rgba(133, 194, 190, 0.1)' : isUrgent ? 'rgba(239, 68, 68, 0.05)' : 'transparent', borderLeft: isSelected ? '3px solid var(--accent)' : isUrgent ? '3px solid #ef4444' : '3px solid transparent', transition: 'all .15s' }) as React.CSSProperties,
    convoHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } as React.CSSProperties,
    convoName: { fontWeight: 700, fontSize: 13 } as React.CSSProperties,
    convoTime: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    convoMessage: { fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 } as React.CSSProperties,
    convoFooter: { display: 'flex', gap: 4, flexWrap: 'wrap' as const, alignItems: 'center' } as React.CSSProperties,
    tag: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '2px 6px', borderRadius: 4 }) as React.CSSProperties,
    unreadBadge: { width: 18, height: 18, background: '#25d366', borderRadius: '50%', color: '#000', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' } as React.CSSProperties,
    
    // Middle panel - Chat
    chatPanel: { flex: 1, display: 'flex', flexDirection: 'column' as const, background: 'var(--bg)' } as React.CSSProperties,
    chatHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' } as React.CSSProperties,
    chatHeaderLeft: { display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    chatAvatar: (color: string) => ({ width: 40, height: 40, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    chatHeaderInfo: {} as React.CSSProperties,
    chatName: { fontWeight: 700, fontSize: 14 } as React.CSSProperties,
    chatSubtitle: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    chatHeaderRight: { display: 'flex', gap: 8 } as React.CSSProperties,
    headerBtn: { width: 34, height: 34, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text2)' } as React.CSSProperties,
    
    // Chat tags bar
    tagsBar: { padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface)' } as React.CSSProperties,
    
    // AI suggestion bar
    aiBar: { padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(133, 194, 190, 0.05)' } as React.CSSProperties,
    aiBarLeft: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    aiSuggestion: { color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 } as React.CSSProperties,
    
    // Messages area
    messagesArea: { flex: 1, overflowY: 'auto' as const, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 12 } as React.CSSProperties,
    messageRow: (isFromCustomer: boolean) => ({ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: isFromCustomer ? 'row' as const : 'row-reverse' as const }) as React.CSSProperties,
    messageAvatar: (color: string) => ({ width: 28, height: 28, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    messageBubble: (isFromCustomer: boolean, isNote: boolean) => ({ maxWidth: '75%', padding: '10px 14px', borderRadius: 12, background: isNote ? 'rgba(251, 191, 36, 0.1)' : isFromCustomer ? 'var(--surface2)' : 'rgba(37, 211, 102, 0.1)', border: isNote ? '1px dashed rgba(251, 191, 36, 0.4)' : '1px solid transparent' }) as React.CSSProperties,
    noteLabel: { fontSize: 10, color: '#f59e0b', fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
    messageText: { fontSize: 13, lineHeight: 1.5 } as React.CSSProperties,
    messageTime: { fontSize: 10, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    
    // Reply area
    replyArea: { borderTop: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    quickRepliesWrap: { display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' as const } as React.CSSProperties,
    quickReplyBtn: (isActive: boolean) => ({ fontSize: 10, padding: '5px 10px', borderRadius: 6, background: isActive ? 'var(--accent)' : 'var(--surface2)', color: isActive ? '#000' : 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,
    replyInputWrap: { display: 'flex', gap: 8, padding: '12px 16px', alignItems: 'flex-end' } as React.CSSProperties,
    replyInput: { flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text)', resize: 'none' as const, minHeight: 44, maxHeight: 120 } as React.CSSProperties,
    sendBtn: { width: 44, height: 44, borderRadius: 8, background: '#25d366', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as React.CSSProperties,
    noteToggle: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    noteCheckbox: (checked: boolean) => ({ width: 16, height: 16, borderRadius: 4, border: `1px solid ${checked ? '#f59e0b' : 'var(--border)'}`, background: checked ? '#f59e0b' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }) as React.CSSProperties,
    
    // Right panel - Customer profile
    rightPanel: { width: 320, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' as const, overflowY: 'auto' as const } as React.CSSProperties,
    profileHeader: { padding: 16, textAlign: 'center' as const, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    profileAvatar: (color: string) => ({ width: 64, height: 64, borderRadius: '50%', background: `${color}20`, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    profileName: { fontWeight: 800, fontSize: 16, marginBottom: 4 } as React.CSSProperties,
    profilePhone: { fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    profileTier: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, background: `${color}20`, color, padding: '4px 10px', borderRadius: 12, fontWeight: 600, marginTop: 8 }) as React.CSSProperties,
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: 12, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    statCard: { textAlign: 'center' as const, padding: 10, background: 'var(--surface2)', borderRadius: 8 } as React.CSSProperties,
    statValue: (color: string) => ({ fontSize: 17, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    statLabel: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    sectionTitle: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
    upsellCard: { margin: '0 12px 8px', padding: 12, background: 'rgba(133, 194, 190, 0.08)', border: '1px solid rgba(133, 194, 190, 0.2)', borderRadius: 8 } as React.CSSProperties,
    upsellProduct: { fontWeight: 700, fontSize: 12, marginBottom: 4 } as React.CSSProperties,
    upsellReason: { fontSize: 10, color: 'var(--text3)', marginBottom: 8 } as React.CSSProperties,
    upsellBtn: { width: '100%', padding: '8px', background: '#25d366', color: '#000', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
    actionBtn: { margin: '0 12px 8px', padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="inbox" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Inbox...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Left Panel - Conversation List */}
      <div style={s.leftPanel}>
        <div style={s.leftHeader}>
          <div style={s.leftTitle}>
            <h2 style={s.title}>
              <Icon name="inbox" size={22} color="var(--accent)" />
              Live Inbox
            </h2>
            <button style={s.headerBtn}>
              <Icon name="filter" size={16} />
            </button>
          </div>
          
          <div style={s.searchWrap}>
            <Icon name="search" size={14} style={s.searchIcon} />
            <input 
              style={s.searchInput} 
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={s.filterTabs}>
            {(['all', 'open', 'urgent'] as const).map(tab => (
              <button 
                key={tab}
                style={s.filterTab(filterTab === tab)} 
                onClick={() => setFilterTab(tab)}
              >
                {tab === 'urgent' && <Icon name="alertCircle" size={12} />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'urgent' && <span style={{ fontWeight: 700, color: filterTab === tab ? '#000' : '#ef4444' }}>4</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={s.convoList}>
          {filteredConversations.map(convo => (
            <div 
              key={convo.id}
              style={s.convoItem(selectedConvo?.id === convo.id, convo.is_urgent)}
              onClick={() => selectConversation(convo)}
              onMouseEnter={e => { if (selectedConvo?.id !== convo.id) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (selectedConvo?.id !== convo.id) e.currentTarget.style.background = convo.is_urgent ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}
            >
              <div style={s.convoHeader}>
                <span style={s.convoName}>{convo.customer_name}</span>
                <span style={s.convoTime}>{convo.last_message_at}</span>
              </div>
              <div style={s.convoMessage}>{convo.last_message}</div>
              <div style={s.convoFooter}>
                {convo.is_urgent && (
                  <span style={{ ...s.tag('#ef4444'), display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="alertTriangle" size={10} /> URGENT
                  </span>
                )}
                <span style={s.tag(getTierColor(convo.tier))}>
                  <Icon name={convo.tier === 'crown' ? 'crown' : convo.tier === 'gold' ? 'award' : 'heart'} size={10} style={{ marginRight: 2 }} />
                  {getTierName(convo.tier)}
                </span>
                {convo.pregnancy_week && (
                  <span style={s.tag('#3b82f6')}>Week {convo.pregnancy_week}</span>
                )}
                {convo.unread_count > 0 && (
                  <span style={s.unreadBadge}>{convo.unread_count}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Panel - Chat */}
      <div style={s.chatPanel}>
        {selectedConvo ? (
          <>
            {/* Chat Header */}
            <div style={s.chatHeader}>
              <div style={s.chatHeaderLeft}>
                <div style={s.chatAvatar(selectedConvo.avatar_color)}>
                  <Icon name="user" size={22} color={selectedConvo.avatar_color} />
                </div>
                <div style={s.chatHeaderInfo}>
                  <div style={s.chatName}>{selectedConvo.customer_name}</div>
                  <div style={s.chatSubtitle}>
                    {selectedConvo.pregnancy_week ? `Week ${selectedConvo.pregnancy_week}` : 'Postpartum'} · {getTierName(selectedConvo.tier)} member · {selectedConvo.customer_phone}
                  </div>
                </div>
              </div>
              <div style={s.chatHeaderRight}>
                <select style={{ ...s.headerBtn, width: 'auto', padding: '0 10px', fontSize: 11, appearance: 'none' as const }}>
                  <option>Barbra</option>
                  <option>Lilian</option>
                  <option>Sophia</option>
                </select>
                <button style={s.headerBtn}><Icon name="phone" size={16} /></button>
                <button style={s.headerBtn}><Icon name="moreVertical" size={16} /></button>
              </div>
            </div>

            {/* Tags Bar */}
            <div style={s.tagsBar}>
              {selectedConvo.tags.map((tag, i) => (
                <span key={i} style={{ ...s.tag('#25d366'), display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="tag" size={10} /> {tag}
                </span>
              ))}
              <span style={{ ...s.tag(getTierColor(selectedConvo.tier)), display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="crown" size={10} /> {getTierName(selectedConvo.tier)}
              </span>
            </div>

            {/* AI Suggestion Bar */}
            {upsellSuggestions.length > 0 && (
              <div style={s.aiBar}>
                <div style={s.aiBarLeft}>
                  <Icon name="sparkles" size={14} color="var(--accent)" />
                  <span>AI Upsell suggestion:</span>
                  <span style={s.aiSuggestion} onClick={() => sendUpsellSuggestion(upsellSuggestions[0])}>
                    {upsellSuggestions[0].product_name} + Delivery Kit
                    <Icon name="arrowRight" size={12} style={{ marginLeft: 4 }} />
                  </span>
                </div>
              </div>
            )}

            {/* Messages Area */}
            <div style={s.messagesArea}>
              {messages.map(msg => (
                <div key={msg.id} style={s.messageRow(msg.is_from_customer)}>
                  <div style={s.messageAvatar(msg.is_from_customer ? selectedConvo.avatar_color : '#25d366')}>
                    <Icon name={msg.is_from_customer ? 'user' : msg.is_internal_note ? 'pin' : 'messageCircle'} size={14} color={msg.is_from_customer ? selectedConvo.avatar_color : msg.is_internal_note ? '#f59e0b' : '#25d366'} />
                  </div>
                  <div style={s.messageBubble(msg.is_from_customer, msg.is_internal_note)}>
                    {msg.is_internal_note && (
                      <div style={s.noteLabel}>
                        <Icon name="pin" size={10} style={{ marginRight: 4 }} />
                        INTERNAL NOTE
                      </div>
                    )}
                    <div style={s.messageText}>{msg.content}</div>
                    <div style={s.messageTime}>
                      {msg.sent_at} {msg.sent_by && `· ${msg.sent_by}`}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Area */}
            <div style={s.replyArea}>
              {/* Quick Replies */}
              <div style={s.quickRepliesWrap}>
                {QUICK_REPLIES.map(qr => (
                  <button 
                    key={qr.id}
                    style={s.quickReplyBtn(qr.id === 'upsell-pump')}
                    onClick={() => loadQuickReply(qr.template)}
                  >
                    {qr.id === 'karibu' && <Icon name="smile" size={12} />}
                    {qr.id === 'product-info' && <Icon name="package" size={12} />}
                    {qr.id === 'delivery-kit' && <Icon name="gift" size={12} />}
                    {qr.id === 'upsell-pump' && <Icon name="trendingUp" size={12} />}
                    {qr.id === 'ask-review' && <Icon name="star" size={12} />}
                    {qr.label}
                  </button>
                ))}
              </div>

              {/* Note mode toggle */}
              <div style={s.noteToggle}>
                <div 
                  style={s.noteCheckbox(isNoteMode)}
                  onClick={() => setIsNoteMode(!isNoteMode)}
                >
                  {isNoteMode && <Icon name="checkCircle" size={12} color="#000" />}
                </div>
                <span>Internal note (not sent to customer)</span>
              </div>

              {/* Input */}
              <div style={s.replyInputWrap}>
                <button style={{ ...s.headerBtn, width: 44, height: 44 }}>
                  <Icon name="paperclip" size={18} />
                </button>
                <textarea 
                  style={s.replyInput}
                  placeholder={isNoteMode ? "Add an internal note..." : "Type a message... (Shift+Enter for new line)"}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                />
                <button style={s.sendBtn} onClick={sendMessage}>
                  <Icon name="send" size={20} color="#000" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
            <div style={{ textAlign: 'center' }}>
              <Icon name="messageCircle" size={48} />
              <div style={{ marginTop: 16, fontSize: 14 }}>Select a conversation to start</div>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Customer Profile */}
      {selectedConvo && customerProfile && (
        <div style={s.rightPanel}>
          <div style={s.profileHeader}>
            <div style={s.profileAvatar(selectedConvo.avatar_color)}>
              <Icon name="user" size={32} color={selectedConvo.avatar_color} />
            </div>
            <div style={s.profileName}>{customerProfile.name}</div>
            <div style={s.profilePhone}>{customerProfile.phone}</div>
            <span style={s.profileTier(getTierColor(customerProfile.tier))}>
              <Icon name="crown" size={12} />
              {getTierName(customerProfile.tier)} Member
            </span>
          </div>

          {/* Stats Grid */}
          <div style={s.statsGrid}>
            <div style={s.statCard}>
              <div style={s.statValue('var(--accent)')}>{customerProfile.crown_points.toLocaleString()}</div>
              <div style={s.statLabel}>Crown Points</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue('#3b82f6')}>{customerProfile.total_orders}</div>
              <div style={s.statLabel}>Orders</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue('#10b981')}>{tzs(customerProfile.lifetime_value)}</div>
              <div style={s.statLabel}>LTV</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue('#a855f7')}>{customerProfile.referrals}</div>
              <div style={s.statLabel}>Referrals</div>
            </div>
          </div>

          {/* AI Upsell Suggestions */}
          <div style={s.sectionTitle}>
            <Icon name="sparkles" size={12} color="var(--accent)" />
            AI Upsell Suggestions
          </div>
          {upsellSuggestions.map(sugg => (
            <div key={sugg.id} style={s.upsellCard}>
              <div style={s.upsellProduct}>{sugg.product_name}</div>
              <div style={s.upsellReason}>{sugg.reason}</div>
              <button style={s.upsellBtn} onClick={() => sendUpsellSuggestion(sugg)}>
                <Icon name="send" size={12} /> Send Suggestion
              </button>
            </div>
          ))}

          {/* Quick Actions */}
          <div style={s.sectionTitle}>
            <Icon name="zap" size={12} />
            Quick Actions
          </div>
          <button style={s.actionBtn} onClick={() => onNav('customers')}>
            <Icon name="user" size={16} color="var(--text3)" /> View Full Profile
          </button>
          <button style={s.actionBtn} onClick={() => onNav('crm-feedback')}>
            <Icon name="fileText" size={16} color="var(--text3)" /> Create Feedback Ticket
          </button>
          <button style={s.actionBtn}>
            <Icon name="link" size={16} color="var(--text3)" /> Share Referral Code
          </button>
          <button style={s.actionBtn}>
            <Icon name="copy" size={16} color="var(--text3)" /> Copy Phone Number
          </button>
        </div>
      )}
    </div>
  )
}
