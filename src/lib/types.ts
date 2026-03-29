import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'

export interface User {
  id: string
  email: string
  full_name: string
  initials: string
  phone?: string
  role_id: string
  role_name: string
  reports_to?: string
  is_active: boolean
  is_approver: boolean
  is_away: boolean
  avatar_url?: string
}

export interface Permission {
  module: string
  action: string
}

export interface AuthContextType {
  user: User | null
  permissions: string[]
  loading: boolean
  error: string | null
  can: (permission: string) => boolean
  canAny: (permissions: string[]) => boolean
  canAll: (permissions: string[]) => boolean
  hasRole: (roleName: string) => boolean
  hasAnyRole: (roleNames: string[]) => boolean
  isSuperAdmin: () => boolean
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function usePermission(permission: string): boolean {
  const { can, loading } = useAuth()
  if (loading) return false
  return can(permission)
}

export function usePermissions(permissions: string[]): Record<string, boolean> {
  const { can, loading } = useAuth()
  if (loading) {
    return permissions.reduce((acc, p) => ({ ...acc, [p]: false }), {})
  }
  return permissions.reduce((acc, p) => ({ ...acc, [p]: can(p) }), {})
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDemoUser = async () => {
    setUser({
      id: 'demo-super-admin',
      email: 'joe@malkia.co.tz',
      full_name: 'Joe Gembe',
      initials: 'JG',
      role_id: 'demo-role',
      role_name: 'super_admin',
      is_active: true,
      is_approver: true,
      is_away: false,
    })

    setPermissions([
      'dashboard.view',
      'sales.view', 'sales.create', 'sales.edit', 'sales.delete', 'sales.approve', 'sales.export',
      'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
      'inventory.adjust', 'inventory.transfer', 'inventory.approve', 'inventory.export',
      'crm.view', 'crm.create', 'crm.edit', 'crm.delete',
      'crm.inbox', 'crm.konnect', 'crm.automations', 'crm.export',
      'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
      'customers.credit', 'customers.export',
      'accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete',
      'accounting.post', 'accounting.approve', 'accounting.coa', 'accounting.export',
      'reports.view', 'reports.export',
      'hrm.view_own', 'hrm.view_team', 'hrm.view_all', 'hrm.manage',
      'settings.view', 'settings.edit', 'settings.users', 'settings.roles', 'settings.approvals',
    ])
    setLoading(false)
  }

  const loadPermissions = async (roleId: string) => {
    const { data: permData } = await supabase
      .from('role_permissions')
      .select('permissions:permission_id (module, action)')
      .eq('role_id', roleId)

    if (permData) {
      const perms = permData
        .map((rp: any) => rp.permissions?.module + '.' + rp.permissions?.action)
        .filter(Boolean)
      setPermissions(perms)
    }
  }

  const loadUser = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        await loadDemoUser()
        return
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*, roles:role_id (name)')
        .eq('id', session.user.id)
        .single()

      if (userError || !userData) {
        await loadDemoUser()
        return
      }

      const currentUser: User = {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        initials: userData.initials,
        phone: userData.phone,
        role_id: userData.role_id,
        role_name: userData.roles?.name || 'unknown',
        reports_to: userData.reports_to,
        is_active: userData.is_active,
        is_approver: userData.is_approver,
        is_away: userData.is_away,
        avatar_url: userData.avatar_url,
      }

      setUser(currentUser)
      await loadPermissions(userData.role_id)
      setLoading(false)

    } catch (err) {
      console.error('Auth error:', err)
      setError('Failed to load user')
      await loadDemoUser()
    }
  }, [])

  const can = useCallback((permission: string): boolean => {
    if (user?.role_name === 'super_admin') return true
    return permissions.includes(permission)
  }, [user, permissions])

  const canAny = useCallback((perms: string[]): boolean => {
    if (user?.role_name === 'super_admin') return true
    return perms.some(p => permissions.includes(p))
  }, [user, permissions])

  const canAll = useCallback((perms: string[]): boolean => {
    if (user?.role_name === 'super_admin') return true
    return perms.every(p => permissions.includes(p))
  }, [user, permissions])

  const hasRole = useCallback((roleName: string): boolean => {
    return user?.role_name === roleName
  }, [user])

  const hasAnyRole = useCallback((roleNames: string[]): boolean => {
    return roleNames.includes(user?.role_name || '')
  }, [user])

  const isSuperAdmin = useCallback((): boolean => {
    return user?.role_name === 'super_admin'
  }, [user])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setPermissions([])
  }

  const refreshUser = async () => {
    await loadUser()
  }

  useEffect(() => {
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadUser()
      } else {
        loadDemoUser()
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUser])

  const value: AuthContextType = {
    user,
    permissions,
    loading,
    error,
    can,
    canAny,
    canAll,
    hasRole,
    hasAnyRole,
    isSuperAdmin,
    signOut,
    refreshUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  SALES_VIEW: 'sales.view',
  SALES_CREATE: 'sales.create',
  SALES_EDIT: 'sales.edit',
  SALES_DELETE: 'sales.delete',
  SALES_APPROVE: 'sales.approve',
  SALES_EXPORT: 'sales.export',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_EDIT: 'inventory.edit',
  INVENTORY_DELETE: 'inventory.delete',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_TRANSFER: 'inventory.transfer',
  INVENTORY_APPROVE: 'inventory.approve',
  INVENTORY_EXPORT: 'inventory.export',
  CRM_VIEW: 'crm.view',
  CRM_CREATE: 'crm.create',
  CRM_EDIT: 'crm.edit',
  CRM_DELETE: 'crm.delete',
  CRM_INBOX: 'crm.inbox',
  CRM_KONNECT: 'crm.konnect',
  CRM_AUTOMATIONS: 'crm.automations',
  CRM_EXPORT: 'crm.export',
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_EDIT: 'customers.edit',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_CREDIT: 'customers.credit',
  CUSTOMERS_EXPORT: 'customers.export',
  ACCOUNTING_VIEW: 'accounting.view',
  ACCOUNTING_CREATE: 'accounting.create',
  ACCOUNTING_EDIT: 'accounting.edit',
  ACCOUNTING_DELETE: 'accounting.delete',
  ACCOUNTING_POST: 'accounting.post',
  ACCOUNTING_APPROVE: 'accounting.approve',
  ACCOUNTING_COA: 'accounting.coa',
  ACCOUNTING_EXPORT: 'accounting.export',
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  HRM_VIEW_OWN: 'hrm.view_own',
  HRM_VIEW_TEAM: 'hrm.view_team',
  HRM_VIEW_ALL: 'hrm.view_all',
  HRM_MANAGE: 'hrm.manage',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
  SETTINGS_USERS: 'settings.users',
  SETTINGS_ROLES: 'settings.roles',
  SETTINGS_APPROVALS: 'settings.approvals',
} as const

export const PAGE_PERMISSIONS: Record<string, string[]> = {
  'dashboard': ['dashboard.view'],
  'vouchers': ['accounting.view'],
  'chart-of-accounts': ['accounting.coa'],
  'banks': ['accounting.view'],
  'inventory': ['inventory.view'],
  'customers': ['customers.view'],
  'reports': ['reports.view'],
  'settings': ['settings.view'],
  'sales': ['sales.view'],
  'cash-sale': ['sales.create'],
  'sales-invoice': ['sales.create'],
  'sales-day-book': ['sales.view'],
  'sales-register': ['sales.view'],
  'sales-return': ['sales.create'],
  'cash-payment': ['accounting.create'],
  'cash-receipt': ['accounting.create'],
  'bank-payment': ['accounting.create'],
  'bank-receipt': ['accounting.create'],
  'bank-transfer': ['accounting.create'],
  'petty-cash': ['accounting.create'],
  'contra': ['accounting.create'],
  'debit-note': ['accounting.create'],
  'credit-note': ['accounting.create'],
  'purchase-order': ['accounting.create'],
  'grn': ['inventory.create'],
  'purchase-invoice': ['accounting.create'],
  'purchase-return': ['accounting.create'],
  'opening-stock': ['inventory.adjust'],
  'stock-adjustment': ['inventory.adjust'],
  'stock-transfer': ['inventory.transfer'],
  'journal-entry': ['accounting.create'],
  'crm': ['crm.view'],
  'crm-hub': ['crm.view'],
  'crm-inbox': ['crm.inbox'],
  'crm-automations': ['crm.automations'],
  'crm-preorders': ['crm.view'],
  'crm-referrals': ['crm.view'],
  'crm-loyalty': ['crm.view'],
  'crm-feedback': ['crm.view'],
  'crm-upsell': ['crm.view'],
  'users': ['settings.users'],
  'approvals': ['settings.approvals'],
  'whatsapp-settings': ['settings.edit'],
  'location-settings': ['settings.edit'],
  'inventory-settings': ['settings.edit'],
  'pnl': ['reports.view'],
  'trial-balance': ['reports.view'],
  'balance-sheet': ['reports.view'],
  'ar-aging': ['reports.view'],
  'ap-aging': ['reports.view'],
  'vat-report': ['reports.view'],
  'stock-valuation': ['reports.view'],
  'purchase-register': ['reports.view'],
  'payment-register': ['reports.view'],
  'stock-transfer-register': ['reports.view'],
  'data-import': ['settings.edit'],
}

export function canAccessPage(page: string, permissions: string[], roleName: string): boolean {
  if (roleName === 'super_admin') return true
  const requiredPerms = PAGE_PERMISSIONS[page]
  if (!requiredPerms) return true
  return requiredPerms.some(p => permissions.includes(p))
}
