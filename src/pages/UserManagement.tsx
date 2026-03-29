import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    shieldCheck: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    key: <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>,
    logOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    userCheck: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></>,
    userX: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface User {
  id: string
  email: string
  full_name: string
  initials: string
  phone?: string
  role_id: string
  role_name?: string
  reports_to?: string
  reports_to_name?: string
  is_active: boolean
  is_approver: boolean
  is_away: boolean
  away_until?: string
  last_login?: string
  created_at: string
}

interface Role {
  id: string
  name: string
  description: string
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#f472b6',
  cx_manager: '#a855f7',
  admin: '#3b82f6',
  sales_rep: '#10b981',
  konnect_advisor: '#06b6d4',
  marketing: '#f59e0b',
  sales_support: '#6366f1',
  contractor: '#6b7280',
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  cx_manager: 'CX Manager',
  admin: 'Admin',
  sales_rep: 'Sales Rep',
  konnect_advisor: 'Konnect Advisor',
  marketing: 'Marketing',
  sales_support: 'Sales & Support',
  contractor: 'Contractor',
}

export default function UserManagement({ onNav }: Props) {
  void onNav
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    initials: '',
    phone: '',
    role_id: '',
    reports_to: '',
    is_approver: false,
  })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Load roles
    const { data: rolesData } = await supabase.from('roles').select('*').order('name')
    if (rolesData) setRoles(rolesData)

    // Load users with role names
    const { data: usersData } = await supabase
      .from('users')
      .select(`
        *,
        roles:role_id (name),
        manager:reports_to (full_name)
      `)
      .order('full_name')

    if (usersData) {
      setUsers(usersData.map((u: any) => ({
        ...u,
        role_name: u.roles?.name,
        reports_to_name: u.manager?.full_name,
      })))
    } else {
      // Demo data if no users yet
      setUsers([
        { id: '1', email: 'joe@malkia.co.tz', full_name: 'Joe Gembe', initials: 'JG', role_id: '1', role_name: 'super_admin', is_active: true, is_approver: true, is_away: false, created_at: '2024-01-01' },
        { id: '2', email: 'jane@malkia.co.tz', full_name: 'Jane Patrick Mwatonoka', initials: 'JPM', role_id: '2', role_name: 'cx_manager', reports_to: '1', reports_to_name: 'Joe Gembe', is_active: true, is_approver: true, is_away: false, created_at: '2024-01-01' },
        { id: '3', email: 'barbra@malkia.co.tz', full_name: 'Barbra Kabendera', initials: 'BK', role_id: '3', role_name: 'admin', reports_to: '2', reports_to_name: 'Jane Patrick Mwatonoka', is_active: true, is_approver: false, is_away: false, created_at: '2024-01-15' },
        { id: '4', email: 'rahim@malkia.co.tz', full_name: 'Rahim Athuman', initials: 'RA', role_id: '4', role_name: 'sales_rep', reports_to: '2', reports_to_name: 'Jane Patrick Mwatonoka', is_active: true, is_approver: false, is_away: false, created_at: '2024-02-01' },
        { id: '5', email: 'sophia@malkia.co.tz', full_name: 'Sophia Kipanta', initials: 'SK', role_id: '5', role_name: 'konnect_advisor', reports_to: '2', reports_to_name: 'Jane Patrick Mwatonoka', is_active: true, is_approver: false, is_away: false, created_at: '2024-02-01' },
        { id: '6', email: 'elizabeth@malkia.co.tz', full_name: 'Elizabeth Mnyampanda', initials: 'EM', role_id: '6', role_name: 'marketing', reports_to: '2', reports_to_name: 'Jane Patrick Mwatonoka', is_active: true, is_approver: false, is_away: false, created_at: '2024-03-01' },
        { id: '7', email: 'brenda@malkia.co.tz', full_name: 'Brenda Jerome', initials: 'BJ', role_id: '7', role_name: 'sales_support', reports_to: '3', reports_to_name: 'Barbra Kabendera', is_active: true, is_approver: false, is_away: false, created_at: '2024-03-01' },
        { id: '8', email: 'epifania@malkia.co.tz', full_name: 'Epifania Shirima', initials: 'ES', role_id: '7', role_name: 'sales_support', reports_to: '3', reports_to_name: 'Barbra Kabendera', is_active: true, is_approver: false, is_away: false, created_at: '2024-03-01' },
        { id: '9', email: 'sam@malkia.co.tz', full_name: 'Sam Alphonce', initials: 'SA', role_id: '8', role_name: 'contractor', is_active: true, is_approver: false, is_away: false, created_at: '2024-04-01' },
        { id: '10', email: 'david@malkia.co.tz', full_name: 'David Lucian', initials: 'DL', role_id: '8', role_name: 'contractor', is_active: true, is_approver: false, is_away: false, created_at: '2024-04-01' },
      ])
    }

    setLoading(false)
  }

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = filterRole === 'all' || u.role_name === filterRole
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'active' && u.is_active) ||
                          (filterStatus === 'inactive' && !u.is_active)
    return matchesSearch && matchesRole && matchesStatus
  })

  const openNewUser = () => {
    setEditingUser(null)
    setFormData({ email: '', full_name: '', initials: '', phone: '', role_id: '', reports_to: '', is_approver: false })
    setShowModal(true)
  }

  const openEditUser = (user: User) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      full_name: user.full_name,
      initials: user.initials,
      phone: user.phone || '',
      role_id: user.role_id,
      reports_to: user.reports_to || '',
      is_approver: user.is_approver,
    })
    setShowModal(true)
  }

  const generateInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 3)
  }

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      full_name: name,
      initials: prev.initials || generateInitials(name)
    }))
  }

  const saveUser = async () => {
    if (!formData.email || !formData.full_name || !formData.role_id) {
      alert('Please fill in all required fields')
      return
    }

    if (editingUser) {
      // Update existing user
      const { error } = await supabase
        .from('users')
        .update({
          email: formData.email,
          full_name: formData.full_name,
          initials: formData.initials,
          phone: formData.phone || null,
          role_id: formData.role_id,
          reports_to: formData.reports_to || null,
          is_approver: formData.is_approver,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingUser.id)

      if (error) {
        console.error('Error updating user:', error)
        alert('Error updating user')
        return
      }
    } else {
      // Create new user - Note: In production, this would create auth user first
      const { error } = await supabase
        .from('users')
        .insert({
          id: crypto.randomUUID(), // In production, use auth.users id
          email: formData.email,
          full_name: formData.full_name,
          initials: formData.initials,
          phone: formData.phone || null,
          role_id: formData.role_id,
          reports_to: formData.reports_to || null,
          is_approver: formData.is_approver,
          is_active: true,
        })

      if (error) {
        console.error('Error creating user:', error)
        alert('Error creating user')
        return
      }
    }

    setShowModal(false)
    loadData()
  }

  const toggleUserStatus = async (user: User) => {
    const { error } = await supabase
      .from('users')
      .update({ is_active: !user.is_active, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (!error) loadData()
  }

  const deleteUser = async (userId: string) => {
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (!error) {
      setShowDeleteConfirm(null)
      loadData()
    }
  }

  // Styles
  const s = {
    page: { padding: 24, maxWidth: 1400, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 } as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: 'var(--text)' } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    btn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 } as React.CSSProperties,
    btnPrimary: { background: 'var(--accent)', color: '#000' } as React.CSSProperties,
    toolbar: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' } as React.CSSProperties,
    searchWrap: { position: 'relative', flex: 1, minWidth: 200 } as React.CSSProperties,
    searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' } as React.CSSProperties,
    searchInput: { width: '100%', padding: '10px 12px 10px 40px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 } as React.CSSProperties,
    select: { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, minWidth: 140 } as React.CSSProperties,
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const } as React.CSSProperties,
    th: { textAlign: 'left' as const, padding: '14px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    td: { padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 } as React.CSSProperties,
    userCell: { display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    avatar: (color: string) => ({ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff' }) as React.CSSProperties,
    userName: { fontWeight: 500, color: 'var(--text)' } as React.CSSProperties,
    userEmail: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    rolePill: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: `${color}20`, color, fontSize: 11, fontWeight: 500 }) as React.CSSProperties,
    statusDot: (active: boolean) => ({ width: 8, height: 8, borderRadius: '50%', background: active ? '#10b981' : '#ef4444' }) as React.CSSProperties,
    actionBtn: { padding: 8, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text3)' } as React.CSSProperties,
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as React.CSSProperties,
    modalContent: { background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto' } as React.CSSProperties,
    modalTitle: { fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, marginBottom: 20 } as React.CSSProperties,
    formGroup: { marginBottom: 16 } as React.CSSProperties,
    label: { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 } as React.CSSProperties,
    input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 } as React.CSSProperties,
    checkbox: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' } as React.CSSProperties,
    modalActions: { display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' } as React.CSSProperties,
    btnGhost: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' } as React.CSSProperties,
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 } as React.CSSProperties,
    statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as React.CSSProperties,
    statValue: { fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: 'var(--text)' } as React.CSSProperties,
    statLabel: { fontSize: 12, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
  }

  const activeCount = users.filter(u => u.is_active).length
  const approverCount = users.filter(u => u.is_approver).length
  const awayCount = users.filter(u => u.is_away).length

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>User Management</div>
          <div style={s.subtitle}>Manage team members, roles, and permissions</div>
        </div>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNewUser}>
          <Icon name="userPlus" size={16} />
          Add User
        </button>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue}>{users.length}</div>
          <div style={s.statLabel}>Total Users</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: '#10b981' }}>{activeCount}</div>
          <div style={s.statLabel}>Active</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: '#a855f7' }}>{approverCount}</div>
          <div style={s.statLabel}>Approvers</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: '#f59e0b' }}>{awayCount}</div>
          <div style={s.statLabel}>Away</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <Icon name="search" size={16} style={s.searchIcon as any} />
          <input 
            style={s.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select style={s.select} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="all">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select style={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Users Table */}
      <div style={s.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No users found</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>User</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Reports To</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Approver</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => {
                const roleColor = ROLE_COLORS[user.role_name || ''] || '#6b7280'
                return (
                  <tr key={user.id} style={{ background: !user.is_active ? 'var(--surface2)' : undefined }}>
                    <td style={s.td}>
                      <div style={s.userCell}>
                        <div style={s.avatar(roleColor)}>{user.initials}</div>
                        <div>
                          <div style={s.userName}>{user.full_name}</div>
                          <div style={s.userEmail}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={s.rolePill(roleColor)}>
                        <Icon name="shield" size={12} />
                        {ROLE_LABELS[user.role_name || ''] || user.role_name}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{ color: 'var(--text2)', fontSize: 12 }}>
                        {user.reports_to_name || '—'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={s.statusDot(user.is_active)} />
                        <span style={{ fontSize: 12, color: user.is_active ? '#10b981' : '#ef4444' }}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {user.is_away && (
                          <span style={{ fontSize: 10, padding: '2px 6px', background: '#f59e0b20', color: '#f59e0b', borderRadius: 4 }}>
                            Away
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={s.td}>
                      {user.is_approver ? (
                        <Icon name="checkCircle" size={18} color="#10b981" />
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button 
                          style={s.actionBtn} 
                          onClick={() => openEditUser(user)}
                          title="Edit"
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button 
                          style={s.actionBtn} 
                          onClick={() => toggleUserStatus(user)}
                          title={user.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Icon name={user.is_active ? 'userX' : 'userCheck'} size={16} />
                        </button>
                        {user.role_name !== 'super_admin' && (
                          <button 
                            style={{ ...s.actionBtn, color: '#ef4444' }} 
                            onClick={() => setShowDeleteConfirm(user.id)}
                            title="Delete"
                          >
                            <Icon name="trash2" size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={s.modal} onClick={() => setShowModal(false)}>
          <div style={s.modalContent} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>
              {editingUser ? 'Edit User' : 'Add New User'}
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Full Name *</label>
              <input 
                style={s.input}
                value={formData.full_name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g., Jane Patrick Mwatonoka"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
              <div style={s.formGroup}>
                <label style={s.label}>Email *</label>
                <input 
                  style={s.input}
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="e.g., jane@malkia.co.tz"
                />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Initials</label>
                <input 
                  style={s.input}
                  value={formData.initials}
                  onChange={e => setFormData(prev => ({ ...prev, initials: e.target.value.toUpperCase() }))}
                  placeholder="JPM"
                  maxLength={3}
                />
              </div>
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Phone</label>
              <input 
                style={s.input}
                value={formData.phone}
                onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+255 7XX XXX XXX"
              />
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Role *</label>
              <select 
                style={s.input}
                value={formData.role_id}
                onChange={e => setFormData(prev => ({ ...prev, role_id: e.target.value }))}
              >
                <option value="">Select role...</option>
                {roles.length > 0 ? (
                  roles.map(r => (
                    <option key={r.id} value={r.id}>{ROLE_LABELS[r.name] || r.name}</option>
                  ))
                ) : (
                  Object.entries(ROLE_LABELS).map(([key, label], i) => (
                    <option key={key} value={String(i + 1)}>{label}</option>
                  ))
                )}
              </select>
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Reports To</label>
              <select 
                style={s.input}
                value={formData.reports_to}
                onChange={e => setFormData(prev => ({ ...prev, reports_to: e.target.value }))}
              >
                <option value="">No manager</option>
                {users.filter(u => u.id !== editingUser?.id).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>

            <div style={s.formGroup}>
              <label style={s.checkbox}>
                <input 
                  type="checkbox"
                  checked={formData.is_approver}
                  onChange={e => setFormData(prev => ({ ...prev, is_approver: e.target.checked }))}
                />
                <span>Can approve requests (discounts, refunds, etc.)</span>
              </label>
            </div>

            <div style={s.modalActions}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveUser}>
                <Icon name="check" size={16} />
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={s.modal} onClick={() => setShowDeleteConfirm(null)}>
          <div style={s.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <Icon name="alertCircle" size={48} color="#ef4444" style={{ marginBottom: 16 }} />
              <div style={s.modalTitle}>Delete User?</div>
              <p style={{ color: 'var(--text2)', marginBottom: 24 }}>
                This action cannot be undone. The user will lose all access to MalkiaOS.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowDeleteConfirm(null)}>
                  Cancel
                </button>
                <button 
                  style={{ ...s.btn, background: '#ef4444', color: '#fff' }} 
                  onClick={() => deleteUser(showDeleteConfirm)}
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
