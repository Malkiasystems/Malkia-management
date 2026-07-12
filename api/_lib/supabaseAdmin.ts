// ════════════════════════════════════════════════════════════════════════════
// api/_lib/supabaseAdmin.ts
//
// Shared server-only helpers for the auth endpoints. Mirrors the credential
// pattern in api/admin-create-user.ts: service-role key stays server-side,
// caller identity is resolved from their own Bearer access token.
// ════════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function projectFor(companyId: string): { url?: string; serviceKey?: string } {
  switch (companyId) {
    case 'malkia-brands':
      return { url: process.env.MALKIA_BRANDS_SUPABASE_URL, serviceKey: process.env.MALKIA_BRANDS_SERVICE_ROLE_KEY }
    case 'malkia-wellness':
    default:
      return { url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY }
  }
}

export function makeAdmin(companyId: string): SupabaseClient | null {
  const { url, serviceKey } = projectFor(companyId)
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface CallerRow {
  id: string
  email: string
  phone: string | null
  is_active: boolean
  mfa_enabled: boolean
  phone_verified_at: string | null
}

/**
 * Resolve the Bearer token to the caller's users row. The token proves the
 * password step already succeeded — an attacker cannot call these endpoints
 * without a valid session for that account.
 */
export async function resolveCaller(
  admin: SupabaseClient,
  authHeader: string | undefined
): Promise<{ ok: true; user: CallerRow } | { ok: false; status: number; error: string }> {
  const bearer = authHeader || ''
  const token = bearer.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, error: 'Missing session token' }

  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData?.user?.email) {
    return { ok: false, status: 401, error: 'Invalid or expired session' }
  }
  const email = authData.user.email.toLowerCase()

  const { data: row, error: rowErr } = await admin
    .from('users')
    .select('id, email, phone, is_active, mfa_enabled, phone_verified_at')
    .ilike('email', email)
    .maybeSingle()

  if (rowErr) return { ok: false, status: 500, error: 'Account lookup failed: ' + rowErr.message }
  if (!row) return { ok: false, status: 403, error: 'No account found for this login' }
  if (!row.is_active) return { ok: false, status: 403, error: 'Account is deactivated' }

  return { ok: true, user: row as CallerRow }
}
