// ════════════════════════════════════════════════════════════════════════════
// adminUserApi.ts
//
// Thin client for the /api/admin-create-user serverless function. Keeps the
// fetch/posting logic out of the UserManagement page (UI stays in the page,
// mutations live here).
//
// The endpoint needs the caller's access token so it can verify the caller is
// an admin server-side. We attach it from the current Supabase session.
// ════════════════════════════════════════════════════════════════════════════

import { supabase, getActiveCompanyId } from './supabase'

export interface NewUserProfile {
  full_name: string
  initials: string
  phone?: string | null
  is_approver: boolean
  permissions: string[]
  allowed_location_id?: string | null
  workspace_role?: string
}

export interface AdminApiResult {
  ok: boolean
  error?: string
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function post(payload: Record<string, unknown>): Promise<AdminApiResult> {
  try {
    const res = await fetch('/api/admin-create-user', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ companyId: getActiveCompanyId(), ...payload }),
    })
    const json = await res.json().catch(() => ({} as { error?: string }))
    if (!res.ok) return { ok: false, error: json.error || `Request failed (${res.status})` }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error'
    return { ok: false, error: msg }
  }
}

/** Create the login + the users row together. */
export function createUserWithLogin(email: string, password: string, profile: NewUserProfile): Promise<AdminApiResult> {
  return post({ action: 'create', email, password, profile })
}

/** Reset an existing user's login password. */
export function resetUserPassword(email: string, password: string): Promise<AdminApiResult> {
  return post({ action: 'reset_password', email, password })
}
