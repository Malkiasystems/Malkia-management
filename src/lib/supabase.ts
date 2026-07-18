import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── COMPANY REGISTRY ────────────────────────────────────────
// URL and anon key now come from Vite env vars instead of being hardcoded.
// The non-secret display flags stay in code.
//
// NOTE: Vite statically replaces `import.meta.env.VITE_*` at BUILD time, so each
// variable MUST be referenced by its literal name below. Do not build these keys
// dynamically (e.g. import.meta.env['VITE_' + id]) — Vite cannot inline that and
// you will get undefined at runtime.
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

// Fail loudly at startup if a required env var is missing, instead of quietly
// building a client pointed at `undefined` (which produces confusing 401s later).
function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in your local .env file and in Vercel → Project → Settings → ` +
        `Environment Variables, then rebuild.`
    )
  }
  return value
}

export const COMPANIES: Company[] = [
  {
    id: 'malkia-wellness',
    name: 'Malkia Wellness Group Ltd',
    shortName: 'Malkia Wellness',
    url: requireEnv(
      'VITE_MALKIA_WELLNESS_SUPABASE_URL',
      import.meta.env.VITE_MALKIA_WELLNESS_SUPABASE_URL
    ),
    key: requireEnv(
      'VITE_MALKIA_WELLNESS_SUPABASE_ANON_KEY',
      import.meta.env.VITE_MALKIA_WELLNESS_SUPABASE_ANON_KEY
    ),
    color: '#85c2be',
    hideCRM: false,
    hideBundles: false,
    showInvestors: false,
  },
  {
    id: 'malkia-brands',
    name: 'Malkia Brands Ltd',
    shortName: 'Malkia Brands',
    url: requireEnv(
      'VITE_MALKIA_BRANDS_SUPABASE_URL',
      import.meta.env.VITE_MALKIA_BRANDS_SUPABASE_URL
    ),
    key: requireEnv(
      'VITE_MALKIA_BRANDS_SUPABASE_ANON_KEY',
      import.meta.env.VITE_MALKIA_BRANDS_SUPABASE_ANON_KEY
    ),
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
