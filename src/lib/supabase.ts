import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── COMPANY REGISTRY ────────────────────────────────────────
// MalkiaOS runs a single company: Malkia Wellness Group Ltd.
// (Malkia Brands was retired from this app on 2026-07-18.)
//
// URL and anon key come from Vite env vars. Vite statically replaces
// `import.meta.env.VITE_*` at BUILD time, so each var MUST be referenced by its
// literal name below — do not construct these keys dynamically.
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
    url: import.meta.env.VITE_MALKIA_WELLNESS_SUPABASE_URL ?? '',
    key: import.meta.env.VITE_MALKIA_WELLNESS_SUPABASE_ANON_KEY ?? '',
    color: '#85c2be',
    hideCRM: false,
    hideBundles: false,
    showInvestors: false,
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
// Built lazily. If the env vars are missing, the error is thrown only when the
// client is first used, and it names the missing var — it does NOT blank the
// app at import time.
const clientCache: Record<string, SupabaseClient> = {}

function buildClient(company: Company): SupabaseClient {
  if (!company.url || !company.key) {
    const miss: string[] = []
    const idUpper = company.id.replace(/-/g, '_').toUpperCase()
    if (!company.url) miss.push(`VITE_${idUpper}_SUPABASE_URL`)
    if (!company.key) miss.push(`VITE_${idUpper}_SUPABASE_ANON_KEY`)
    throw new Error(
      `Supabase config missing for ${company.name}. Set ${miss.join(' and ')} ` +
        `in Vercel → Settings → Environment Variables, then redeploy.`
    )
  }
  if (clientCache[company.id]) return clientCache[company.id]

  // Do NOT set a global Authorization header. Supabase injects the logged-in
  // user's JWT automatically; overriding it with the anon key forces every
  // request to anonymous and breaks authenticated access.
  const client = createClient(company.url, company.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: `sb-${company.id}-auth`,
    },
  })
  clientCache[company.id] = client
  return client
}

// A Proxy so `supabase.from(...)` works exactly as before, but the underlying
// client is resolved on first use, not at import time.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = buildClient(getActiveCompany())
    const value = (client as any)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

/**
 * Switch company. With a single company this simply confirms the id and stores
 * it; kept so callers (e.g. Login.tsx) continue to work unchanged.
 */
export function switchCompany(companyId: string): Company {
  const company = COMPANIES.find(c => c.id === companyId)
  if (!company) throw new Error(`Unknown company: ${companyId}`)
  setActiveCompany(companyId)
  return company
}
