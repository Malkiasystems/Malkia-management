import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── COMPANY REGISTRY ────────────────────────────────────────
// URL and anon key come from Vite env vars. Non-secret display flags stay here.
//
// Vite statically replaces `import.meta.env.VITE_*` at BUILD time, so each var
// MUST be referenced by its literal name (done in ENV below). Do not build these
// keys dynamically — Vite cannot inline that.
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

// Literal env references so Vite can inline them. A missing one is `undefined`
// here and is handled lazily below — it will NOT crash the whole app at load.
const ENV = {
  'malkia-wellness': {
    url: import.meta.env.VITE_MALKIA_WELLNESS_SUPABASE_URL,
    key: import.meta.env.VITE_MALKIA_WELLNESS_SUPABASE_ANON_KEY,
  },
  'malkia-brands': {
    url: import.meta.env.VITE_MALKIA_BRANDS_SUPABASE_URL,
    key: import.meta.env.VITE_MALKIA_BRANDS_SUPABASE_ANON_KEY,
  },
} as const

export const COMPANIES: Company[] = [
  {
    id: 'malkia-wellness',
    name: 'Malkia Wellness Group Ltd',
    shortName: 'Malkia Wellness',
    url: ENV['malkia-wellness'].url ?? '',
    key: ENV['malkia-wellness'].key ?? '',
    color: '#85c2be',
    hideCRM: false,
    hideBundles: false,
    showInvestors: false,
  },
  {
    id: 'malkia-brands',
    name: 'Malkia Brands Ltd',
    shortName: 'Malkia Brands',
    url: ENV['malkia-brands'].url ?? '',
    key: ENV['malkia-brands'].key ?? '',
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
// Built lazily. If a company's env vars are missing, the error is thrown only
// when that company's client is actually used, and it names the missing var —
// it does NOT blank the app at import time.
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
// client for the active company is resolved on first use, not at import time.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = buildClient(getActiveCompany())
    const value = (client as any)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

/**
 * Switch company. Clears the cached client so the next use rebuilds for the
 * newly-active company. Reload the page after calling.
 */
export function switchCompany(companyId: string): Company {
  const company = COMPANIES.find(c => c.id === companyId)
  if (!company) throw new Error(`Unknown company: ${companyId}`)
  setActiveCompany(companyId)
  return company
}
