import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── COMPANY REGISTRY ────────────────────────────────────────
export interface Company {
  id: string
  name: string
  shortName: string
  url: string
  key: string
  color: string
  hideCRM: boolean
  hideBundles: boolean
  showInvestors: boolean
}

export const COMPANIES: Company[] = [
  {
    id: 'malkia-wellness',
    name: 'Malkia Wellness Group Ltd',
    shortName: 'Malkia Wellness',
    url: 'https://ebokhvibnypiomzqimfg.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVib2todmlibnlwaW9tenFpbWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzA3MDIsImV4cCI6MjA4OTYwNjcwMn0.yqaB42lvEN_vkUt1q6VBAAHdwSYOaIwt8bH5Vg9MTQk',
    color: '#85c2be',
    hideCRM: false,
    hideBundles: false,
    showInvestors: false,
  },
  {
    id: 'malkia-brands',
    name: 'Malkia Brands Ltd',
    shortName: 'Malkia Brands',
    url: 'https://hkfxoocyelstrbjvgkbr.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrZnhvb2N5ZWxzdHJianZna2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTQ5NDksImV4cCI6MjA5MDczMDk0OX0.QHnNROu7lPzeUlU9kmCzvHE_WbcPjt0jLxDM0qMlyD0',
    color: '#d48744',
    hideCRM: true,
    hideBundles: true,
    showInvestors: true,
  },
]

// ── ACTIVE COMPANY ──────────────────────────────────────────
const STORAGE_KEY = 'malkiaos_company'

export function getActiveCompanyId(): string {
  return localStorage.getItem(STORAGE_KEY) || COMPANIES[0].id
}

export function getActiveCompany(): Company {
  const id = getActiveCompanyId()
  return COMPANIES.find(c => c.id === id) || COMPANIES[0]
}

export function setActiveCompany(companyId: string) {
  localStorage.setItem(STORAGE_KEY, companyId)
}

// ── SUPABASE CLIENT ─────────────────────────────────────────
function buildClient(company: Company): SupabaseClient {
  // IMPORTANT: Do NOT set `global.headers.Authorization` here.
  // Supabase's auth system automatically injects the authenticated user's
  // JWT into the Authorization header once they log in. If we override it
  // with the anon key, every request goes out as anonymous — which breaks
  // RLS policies that grant the `authenticated` role access.
  // The apikey header is set automatically from the 2nd argument to createClient.
  return createClient(company.url, company.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: `sb-${company.id}-auth`,
    }
  })
}

// Initial client based on stored preference
let activeCompany = getActiveCompany()
let _supabase = buildClient(activeCompany)

export let supabase: SupabaseClient = _supabase

/**
 * Switch to a different company. Rebuilds the Supabase client.
 * Call this before login, then reload the page.
 */
export function switchCompany(companyId: string): Company {
  const company = COMPANIES.find(c => c.id === companyId)
  if (!company) throw new Error(`Unknown company: ${companyId}`)
  setActiveCompany(companyId)
  activeCompany = company
  _supabase = buildClient(company)
  supabase = _supabase
  return company
}
