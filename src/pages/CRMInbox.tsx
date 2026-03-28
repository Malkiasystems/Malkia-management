import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

interface Conversation {
  id: string
  customer_id: string
  customer_name: string
  customer_whatsapp: string
  status: string
  priority: string
  assigned_to: string
  last_message_at: string
  last_message_preview: string
  unread_count: number
  is_resolved: boolean
}

interface Message {
  id: string
  direction: 'in' | 'out'
  content: string
  message_type: string
  created_at: string
  sent_by?: string
  status?: string
}

interface CustomerProfile {
  id: string
  name: string
  whatsapp: string
  crown_tier: string
  crown_points: number
  pregnancy_week?: number
  lifetime_value: number
  total_orders: number
  location: string
  tags: string[]
  recent_orders: { product: string; amount: number }[]
}

interface AISuggestion {
  id: string
  type: string
  title: string
  description: string
  products?: string[]
}

interface InternalNote {
  id: string
  content: string
  created_by: string
  created_at: string
}

// Icon component
const Icon = ({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  
  const paths: Record<string, React.ReactNode> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    paperclip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    smile: <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    shoppingBag: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    mapPin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    share2: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    sparkles: <><path d="M12 3v1m0 16v1m-8-9H3m18 0h-1M5.6 5.6l.7.7m12.4 12.4l.7.7M5.6 18.4l.7-.7M18.7 5.6l-.7.7"/><circle cx="12" cy="12" r="4"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    edit3: <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
  }
  
  return <svg {...props}>{paths[name] || paths.messageCircle}</svg>
}

// Staff members for assignment
const STAFF = [
  { id: 'barbra', name: 'Barbra Kabendera', role: 'CX Manager' },
  { id: 'lilian', name: 'Lilian Mallya', role: 'Sales' },
  { id: 'sophia', name: 'Sophia Kipanta', role: 'Midwife' },
]

export default function CRMInbox({ onNav }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null)
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [loading, setLoading] = useState(true)
  const [messageInput, setMessageInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'urgent'>('all')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadConversations() }, [])
  useEffect(() => { if (selectedId) loadConversation(selectedId) }, [selectedId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadConversations = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false })
    
    if (data && data.length > 0) {
      setConversations(data)
      setSelectedId(data[0].id)
    } else {
      // Demo data if no conversations exist
      const demoConvos: Conversation[] = [
        { id: '1', customer_id: 'c1', customer_name: 'Amina Hassan', customer_whatsapp: '+255 712 345 678', status: 'open', priority: 'urgent', assigned_to: 'barbra', last_message_at: new Date().toISOString(), last_message_preview: 'Je, nina swali kuhusu breast pump...', unread_count: 3, is_resolved: false },
        { id: '2', customer_id: 'c2', customer_name: 'Grace Mwanza', customer_whatsapp: '+255 754 987 654', status: 'open', priority: 'normal', assigned_to: 'lilian', last_message_at: new Date(Date.now() - 840000).toISOString(), last_message_preview: 'Asante sana kwa binder, imenisaidia...', unread_count: 0, is_resolved: false },
        { id: '3', customer_id: 'c3', customer_name: 'Zainab Ally', customer_whatsapp: '+255 698 111 222', status: 'open', priority: 'normal', assigned_to: '', last_message_at: new Date(Date.now() - 3600000).toISOString(), last_message_preview: 'Delivery kit ipo? Nina tayari wiki ya 38', unread_count: 1, is_resolved: false },
        { id: '4', customer_id: 'c4', customer_name: 'Fatuma Iddi', customer_whatsapp: '+255 621 445 889', status: 'open', priority: 'normal', assigned_to: 'sophia', last_message_at: new Date(Date.now() - 10800000).toISOString(), last_message_preview: 'Nipple cream ina itwa nini exact?', unread_count: 0, is_resolved: false },
        { id: '5', customer_id: 'c5', customer_name: 'Sophia Mtera', customer_whatsapp: '+255 744 332 110', status: 'resolved', priority: 'normal', assigned_to: 'barbra', last_message_at: new Date(Date.now() - 86400000).toISOString(), last_message_preview: 'Resolved - scar sheet question', unread_count: 0, is_resolved: true },
      ]
      setConversations(demoConvos)
      setSelectedId(demoConvos[0].id)
    }
    setLoading(false)
  }

  const loadConversation = async (id: string) => {
    // Load messages
    const { data: msgData } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    if (msgData && msgData.length > 0) {
      setMessages(msgData)
    } else {
      // Demo messages
      const demoMessages: Message[] = [
        { id: 'm1', direction: 'in', content: 'Habari! Je, mnauza breast pump? Mimi niko wiki ya 36 na nataka kujiandaa.', message_type: 'text', created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: 'm2', direction: 'out', content: 'Karibu Amina! Ndiyo, tuna Breast Pump Electric - inapendelewa sana na mama wetu. Bei ni TZS 245,000. Je, natuma picha na details?', message_type: 'text', created_at: new Date(Date.now() - 3300000).toISOString(), sent_by: 'Barbra' },
        { id: 'm3', direction: 'in', content: 'Ndiyo tuma! Na pia delivery kit iko? Naona wiki yangu ya 38 inakaribia.', message_type: 'text', created_at: new Date(Date.now() - 1800000).toISOString() },
        { id: 'm4', direction: 'in', content: 'Je, nina swali kuhusu breast pump - inatoa maziwa ya kutosha kwa mtoto?', message_type: 'text', created_at: new Date(Date.now() - 300000).toISOString() },
      ]
      setMessages(demoMessages)
    }

    // Load customer profile (demo)
    setCustomerProfile({
      id: 'c1',
      name: 'Amina Hassan',
      whatsapp: '+255 712 345 678',
      crown_tier: 'crown',
      crown_points: 24800,
      pregnancy_week: 36,
      lifetime_value: 4200000,
      total_orders: 7,
      location: 'DSM',
      tags: ['Crown', 'Week 36', 'VIP'],
      recent_orders: [
        { product: 'Belly Binder', amount: 85000 },
        { product: 'Scar Sheet za Malkia', amount: 32000 },
        { product: 'Nipple Cream', amount: 28000 },
      ]
    })

    // AI suggestions (demo)
    setSuggestions([
      { id: 's1', type: 'upsell', title: 'Breast Pump + Delivery Kit', description: 'Week 36 - preparing for feeding', products: ['Breast Pump Electric', 'Delivery Hygiene Kit'] },
      { id: 's2', type: 'upsell', title: 'Delivery Hygiene Kit', description: 'Week 36 - delivery near', products: ['Delivery Kit'] },
    ])

    // Internal notes (demo)
    setNotes([
      { id: 'n1', content: 'Customer is Week 36, Crown member. Perfect for delivery kit upsell. Check if stock is available first.', created_by: 'Barbra', created_at: new Date(Date.now() - 600000).toISOString() },
    ])
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffHours < 48) return 'Yesterday'
    return date.toLocaleDateString()
  }

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const sendMessage = () => {
    if (!messageInput.trim()) return
    const newMsg: Message = {
      id: `m${Date.now()}`,
      direction: 'out',
      content: messageInput,
      message_type: 'text',
      created_at: new Date().toISOString(),
      sent_by: 'You'
    }
    setMessages(prev => [...prev, newMsg])
    setMessageInput('')
  }

  const filteredConversations = conversations.filter(c => {
    if (filterStatus === 'urgent' && c.priority !== 'urgent') return false
    if (filterStatus === 'open' && c.is_resolved) return false
    if (searchQuery && !c.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const selectedConvo = conversations.find(c => c.id === selectedId)

  const s = {
    page: { display: 'flex', height: 'calc(100vh - 56px)', background: 'var(--bg)' } as React.CSSProperties,
    
    // Left Panel - Conversation List
    leftPanel: { width: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, background: 'var(--surface)' } as React.CSSProperties,
    leftHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    backBtn: { width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as React.CSSProperties,
    leftTitle: { fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700 } as React.CSSProperties,
    searchWrap: { display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    searchInput: { flex: 1, padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)' } as React.CSSProperties,
    filterTabs: { display: 'flex', gap: 4, padding: '8px 20px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    filterTab: (active: boolean) => ({ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? '#fff' : 'var(--text3)' }) as React.CSSProperties,
    convoList: { flex: 1, overflowY: 'auto' as const } as React.CSSProperties,
    convoItem: (active: boolean) => ({ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'transparent', borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent' }) as React.CSSProperties,
    convoAvatar: { width: 44, height: 44, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, flexShrink: 0 } as React.CSSProperties,
    convoContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    convoName: { fontSize: 13, fontWeight: 600, marginBottom: 2 } as React.CSSProperties,
    convoPreview: { fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
    convoMeta: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 4 } as React.CSSProperties,
    convoTime: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    convoBadge: { minWidth: 18, height: 18, borderRadius: 9, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    urgentBadge: { fontSize: 9, padding: '2px 6px', background: '#ef444420', color: '#ef4444', borderRadius: 4, fontWeight: 600 } as React.CSSProperties,
    
    // Middle Panel - Chat
    middlePanel: { flex: 1, display: 'flex', flexDirection: 'column' as const, background: 'var(--bg)' } as React.CSSProperties,
    chatHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    chatHeaderLeft: { display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    chatAvatar: { width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 } as React.CSSProperties,
    chatName: { fontSize: 14, fontWeight: 600 } as React.CSSProperties,
    chatSub: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    chatHeaderRight: { display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    tagPill: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: `${color}20`, color }) as React.CSSProperties,
    headerBtn: { padding: '8px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' } as React.CSSProperties,
    resolveBtn: { padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#10b981', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
    
    // Tags bar
    tagsBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' as const } as React.CSSProperties,
    tagLabel: { fontSize: 11, color: 'var(--text3)', marginRight: 4 } as React.CSSProperties,
    addTagBtn: { padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: 'var(--surface2)', border: '1px dashed var(--border)', color: 'var(--text3)', cursor: 'pointer' } as React.CSSProperties,
    
    // AI Suggestion bar
    aiBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(251,191,36,0.05) 0%, transparent 100%)' } as React.CSSProperties,
    aiIcon: { width: 28, height: 28, borderRadius: 8, background: 'rgba(251,191,36,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    aiText: { flex: 1, fontSize: 12 } as React.CSSProperties,
    aiBtn: { padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'var(--accent)', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
    
    // Messages
    messagesWrap: { flex: 1, overflowY: 'auto' as const, padding: 20 } as React.CSSProperties,
    messageGroup: { marginBottom: 16 } as React.CSSProperties,
    messageTime: { textAlign: 'center' as const, fontSize: 11, color: 'var(--text3)', marginBottom: 12 } as React.CSSProperties,
    messageBubble: (isOut: boolean) => ({ maxWidth: '70%', padding: '12px 16px', borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isOut ? 'var(--accent)' : 'var(--surface)', color: isOut ? '#fff' : 'var(--text)', marginLeft: isOut ? 'auto' : 0, marginRight: isOut ? 0 : 'auto', marginBottom: 4 }) as React.CSSProperties,
    messageText: { fontSize: 13, lineHeight: 1.5 } as React.CSSProperties,
    messageMeta: (isOut: boolean) => ({ fontSize: 10, color: isOut ? 'rgba(255,255,255,0.7)' : 'var(--text3)', marginTop: 4, textAlign: isOut ? 'right' as const : 'left' as const }) as React.CSSProperties,
    
    // Internal Note
    noteCard: { margin: '12px 20px', padding: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10 } as React.CSSProperties,
    noteHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: '#fbbf24', fontSize: 11, fontWeight: 600 } as React.CSSProperties,
    noteText: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5 } as React.CSSProperties,
    
    // Input Area
    inputArea: { padding: 16, borderTop: '1px solid var(--border)', background: 'var(--surface)' } as React.CSSProperties,
    inputWrap: { display: 'flex', gap: 10, alignItems: 'flex-end' } as React.CSSProperties,
    inputBox: { flex: 1, padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text)', minHeight: 44, maxHeight: 120, resize: 'none' as const } as React.CSSProperties,
    inputBtn: { width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    
    // Right Panel - Customer Profile
    rightPanel: { width: 320, borderLeft: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto' as const } as React.CSSProperties,
    profileHeader: { padding: 20, textAlign: 'center' as const, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    profileAvatar: { width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 } as React.CSSProperties,
    profileName: { fontSize: 16, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
    profilePhone: { fontSize: 12, color: 'var(--text3)', marginBottom: 8 } as React.CSSProperties,
    profileTags: { display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' as const } as React.CSSProperties,
    
    // Stats Grid
    statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', margin: 0 } as React.CSSProperties,
    statCard: { padding: 16, background: 'var(--surface)', textAlign: 'center' as const } as React.CSSProperties,
    statValue: { fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, marginBottom: 2 } as React.CSSProperties,
    statLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' as const } as React.CSSProperties,
    
    // Section
    section: { padding: 16, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    sectionTitle: { fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 } as React.CSSProperties,
    
    // Order Item
    orderItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    orderName: { fontSize: 12 } as React.CSSProperties,
    orderAmount: { fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' } as React.CSSProperties,
    
    // Suggestion Card
    suggestionCard: { padding: 12, background: 'var(--surface2)', borderRadius: 10, marginBottom: 8 } as React.CSSProperties,
    suggestionTitle: { fontSize: 12, fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
    suggestionDesc: { fontSize: 11, color: 'var(--text3)', marginBottom: 8 } as React.CSSProperties,
    suggestionBtn: { width: '100%', padding: '8px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'var(--accent)', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ ...s.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
          <Icon name="messageCircle" size={32} />
          <div style={{ marginTop: 12 }}>Loading conversations...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Left Panel - Conversation List */}
      <div style={s.leftPanel}>
        <div style={s.leftHeader}>
          <div style={s.backBtn} onClick={() => onNav('crm')}>
            <Icon name="arrowLeft" size={16} color="var(--text3)" />
          </div>
          <span style={s.leftTitle}>CRM Inbox</span>
        </div>
        
        <div style={s.searchWrap}>
          <input 
            style={s.searchInput} 
            placeholder="Search conversations..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div style={s.filterTabs}>
          {(['all', 'open', 'urgent'] as const).map(f => (
            <button key={f} style={s.filterTab(filterStatus === f)} onClick={() => setFilterStatus(f)}>
              {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Urgent'}
            </button>
          ))}
        </div>
        
        <div style={s.convoList}>
          {filteredConversations.map(convo => (
            <div 
              key={convo.id} 
              style={s.convoItem(selectedId === convo.id)}
              onClick={() => setSelectedId(convo.id)}
            >
              <div style={{ ...s.convoAvatar, background: convo.priority === 'urgent' ? '#ef444420' : 'var(--surface2)', color: convo.priority === 'urgent' ? '#ef4444' : 'var(--text)' }}>
                {convo.customer_name.charAt(0)}
              </div>
              <div style={s.convoContent}>
                <div style={s.convoName}>{convo.customer_name}</div>
                <div style={s.convoPreview}>{convo.last_message_preview}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {convo.priority === 'urgent' && <span style={s.urgentBadge}>URGENT</span>}
                  {convo.is_resolved && <span style={{ ...s.urgentBadge, background: '#10b98120', color: '#10b981' }}>Resolved</span>}
                </div>
              </div>
              <div style={s.convoMeta}>
                <div style={s.convoTime}>{formatTime(convo.last_message_at)}</div>
                {convo.unread_count > 0 && <div style={s.convoBadge}>{convo.unread_count}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Panel - Chat */}
      <div style={s.middlePanel}>
        {selectedConvo && (
          <>
            <div style={s.chatHeader}>
              <div style={s.chatHeaderLeft}>
                <div style={s.chatAvatar}>{selectedConvo.customer_name.charAt(0)}</div>
                <div>
                  <div style={s.chatName}>{selectedConvo.customer_name}</div>
                  <div style={s.chatSub}>Week 36 · Crown member · {selectedConvo.customer_whatsapp}</div>
                </div>
              </div>
              <div style={s.chatHeaderRight}>
                {selectedConvo.priority === 'urgent' && (
                  <span style={{ ...s.tagPill('#ef4444'), padding: '4px 10px' }}>
                    <Icon name="alertCircle" size={12} /> Urgent
                  </span>
                )}
                <select 
                  style={{ ...s.headerBtn, minWidth: 150 }}
                  value={selectedConvo.assigned_to || ''}
                  onChange={() => {}}
                >
                  <option value="">Assign to...</option>
                  {STAFF.map(staff => (
                    <option key={staff.id} value={staff.id}>{staff.name}</option>
                  ))}
                </select>
                <button style={s.headerBtn}>
                  <Icon name="edit3" size={14} /> Note
                </button>
                <button style={s.resolveBtn}>
                  <Icon name="check" size={14} /> Resolve
                </button>
              </div>
            </div>

            {/* Tags Bar */}
            <div style={s.tagsBar}>
              <span style={s.tagLabel}>Tags:</span>
              <span style={s.tagPill('#fbbf24')}><Icon name="crown" size={10} /> Crown</span>
              <span style={s.tagPill('#3b82f6')}>Week 36</span>
              <span style={s.tagPill('#ef4444')}>High Priority</span>
              <button style={s.addTagBtn}>+ Add tag</button>
              
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="sparkles" size={14} color="#fbbf24" />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Upsell suggestion:</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Breast Pump + Delivery Kit →</span>
              </div>
            </div>

            {/* Messages */}
            <div style={s.messagesWrap}>
              {messages.map((msg, i) => (
                <div key={msg.id} style={{ marginBottom: 12 }}>
                  {i === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[i-1].created_at).toDateString() ? (
                    <div style={s.messageTime}>Today, {formatMessageTime(msg.created_at)}</div>
                  ) : null}
                  <div style={s.messageBubble(msg.direction === 'out')}>
                    <div style={s.messageText}>{msg.content}</div>
                    <div style={s.messageMeta(msg.direction === 'out')}>
                      {formatMessageTime(msg.created_at)}{msg.sent_by ? ` · ${msg.sent_by}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Internal Notes */}
              {notes.map(note => (
                <div key={note.id} style={s.noteCard}>
                  <div style={s.noteHeader}>
                    <Icon name="edit3" size={12} />
                    INTERNAL NOTE — {note.created_by}
                  </div>
                  <div style={s.noteText}>{note.content}</div>
                </div>
              ))}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={s.inputArea}>
              <div style={s.inputWrap}>
                <button style={{ ...s.inputBtn, background: 'var(--surface2)' }}>
                  <Icon name="paperclip" size={18} color="var(--text3)" />
                </button>
                <textarea 
                  style={s.inputBox}
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  rows={1}
                />
                <button style={{ ...s.inputBtn, background: 'var(--accent)' }} onClick={sendMessage}>
                  <Icon name="send" size={18} color="#fff" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Panel - Customer Profile */}
      {customerProfile && (
        <div style={s.rightPanel}>
          <div style={s.profileHeader}>
            <div style={{ ...s.profileAvatar, background: getTierColor(customerProfile.crown_tier), color: '#fff' }}>
              {customerProfile.name.charAt(0)}
            </div>
            <div style={s.profileName}>{customerProfile.name}</div>
            <div style={s.profilePhone}>{customerProfile.whatsapp} · {customerProfile.location}</div>
            <div style={s.profileTags}>
              <span style={s.tagPill(getTierColor(customerProfile.crown_tier))}>
                <Icon name="crown" size={10} /> Crown
              </span>
              <span style={s.tagPill('#3b82f6')}>Week 36</span>
              <span style={s.tagPill('#f472b6')}>VIP</span>
            </div>
          </div>

          <div style={s.statsGrid}>
            <div style={s.statCard}>
              <div style={{ ...s.statValue, color: '#fbbf24' }}>{customerProfile.crown_points.toLocaleString()}</div>
              <div style={s.statLabel}>Crown Points</div>
            </div>
            <div style={s.statCard}>
              <div style={{ ...s.statValue, color: 'var(--text)' }}>{customerProfile.total_orders}</div>
              <div style={s.statLabel}>Orders</div>
            </div>
            <div style={s.statCard}>
              <div style={{ ...s.statValue, color: 'var(--accent)' }}>{customerProfile.pregnancy_week ? `${customerProfile.pregnancy_week}` : '—'}</div>
              <div style={s.statLabel}>Referrals</div>
            </div>
            <div style={s.statCard}>
              <div style={{ ...s.statValue, color: '#10b981' }}>{tzs(customerProfile.lifetime_value)}</div>
              <div style={s.statLabel}>Lifetime Value</div>
            </div>
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Recent Orders</div>
            {customerProfile.recent_orders.map((order, i) => (
              <div key={i} style={s.orderItem}>
                <span style={s.orderName}>{order.product}</span>
                <span style={s.orderAmount}>{tzs(order.amount)}</span>
              </div>
            ))}
          </div>

          <div style={s.section}>
            <div style={{ ...s.sectionTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="sparkles" size={12} color="#fbbf24" />
              Upsell Suggestions
            </div>
            {suggestions.map(sug => (
              <div key={sug.id} style={s.suggestionCard}>
                <div style={s.suggestionTitle}>{sug.title}</div>
                <div style={s.suggestionDesc}>{sug.description}</div>
                <button style={s.suggestionBtn}>Send Suggestion →</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
