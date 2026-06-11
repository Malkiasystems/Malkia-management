// ════════════════════════════════════════════════════════════════════════════
// api/admin-create-user.ts
//
// Creates a login (Supabase Auth user) AND the app `users` row in ONE call so
// the two can never drift. Also supports resetting a user's password.
//
// WHY THIS IS A SERVER FUNCTION:
//   It uses the Supabase SERVICE ROLE key, which must NEVER reach the browser.
//   Vercel keeps non-VITE_ env vars server-side only. The frontend calls this
//   endpoint with the caller's own access token; the function verifies the
//   caller is an admin before doing anything.
//
// SECURITY MODEL:
//   1. Caller must send Authorization: Bearer <their supabase access_token>.
//   2. We resolve that token to a real user and load their `users` row.
//   3. They must be active AND hold 'settings.users' (or be a super admin,
//      40+ permissions). Otherwise 403. Without this check the endpoint would
//      let anyone create accounts.
//
// ENV VARS (server-side, set in Vercel):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY            → malkia-wellness project
//   MALKIA_BRANDS_SUPABASE_URL, MALKIA_BRANDS_SERVICE_ROLE_KEY → malkia-brands
//   (Brands vars are only needed if you create users for that company.)
// ════════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Map the company the frontend is in to its project credentials. Service role
// keys are per-project secrets, so each company needs its own pair.
function projectFor(companyId: string): { url?: string; serviceKey?: string } {
  switch (companyId) {
    case 'malkia-brands':
      return { url: process.env.MALKIA_BRANDS_SUPABASE_URL, serviceKey: process.env.MALKIA_BRANDS_SERVICE_ROLE_KEY }
    case 'malkia-wellness':
    default:
      return { url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY }
  }
}

const SUPER_ADMIN_THRESHOLD = 40

async function assertCallerIsAdmin(admin: SupabaseClient, bearer: string | undefined): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!bearer) return { ok: false, status: 401, error: 'Missing Authorization token' }
  const token = bearer.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, error: 'Malformed Authorization token' }

  // Resolve the token to a real auth user.
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user?.email) {
    return { ok: false, status: 401, error: 'Invalid or expired session' }
  }
  const callerEmail = userData.user.email.toLowerCase()

  // Load the caller's app row to check permissions. ilike = case-insensitive,
  // so a stored email with stray capitals still matches.
  const { data: row, error: rowErr } = await admin
    .from('users')
    .select('is_active, permissions')
    .ilike('email', callerEmail)
    .maybeSingle()

  // A query ERROR here almost always means the service-role key is wrong, so
  // PostgREST rejected the read. Say that plainly instead of "no profile",
  // which was previously misleading.
  if (rowErr) {
    return { ok: false, status: 500, error: 'Admin lookup failed — check SUPABASE_SERVICE_ROLE_KEY in Vercel. (' + rowErr.message + ')' }
  }
  if (!row) return { ok: false, status: 403, error: `No admin profile found for ${callerEmail}` }
  if (!row.is_active) return { ok: false, status: 403, error: 'Caller account is deactivated' }

  const perms: string[] = Array.isArray(row.permissions) ? row.permissions : []
  const isAdmin = perms.length >= SUPER_ADMIN_THRESHOLD || perms.includes('settings.users')
  if (!isAdmin) return { ok: false, status: 403, error: 'You do not have permission to manage users' }

  return { ok: true }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body || {}
    const action: string = body.action || 'create'
    const companyId: string = body.companyId || 'malkia-wellness'

    const { url, serviceKey } = projectFor(companyId)
    if (!url || !serviceKey) {
      return res.status(500).json({
        error: `Server is not configured for company "${companyId}". Add its SUPABASE_URL and SERVICE_ROLE_KEY env vars in Vercel.`,
      })
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    // Every action requires an admin caller.
    const gate = await assertCallerIsAdmin(admin, req.headers?.authorization)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error })

    const email: string = (body.email || '').trim().toLowerCase()
    const password: string = body.password || ''

    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    // ── RESET / SET PASSWORD (create-or-reset) ─────────────────────
    if (action === 'reset_password') {
      // Find the auth login by email (admin listUsers, filtered).
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (listErr) return res.status(500).json({ error: 'Could not look up logins — check SUPABASE_SERVICE_ROLE_KEY. (' + listErr.message + ')' })
      const authUser = list.users.find(u => (u.email || '').toLowerCase() === email)

      if (authUser) {
        // Login exists → just change the password.
        const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, { password })
        if (updErr) return res.status(500).json({ error: 'Failed to reset password: ' + updErr.message })
        return res.status(200).json({ ok: true, action: 'reset_password' })
      }

      // No login yet for this profile (common for users added before logins
      // were linked) → provision the login now so they can finally sign in.
      const { error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (createErr) return res.status(500).json({ error: 'Failed to create login: ' + createErr.message })
      return res.status(200).json({ ok: true, action: 'login_created' })
    }

    // ── CREATE (login + users row together) ────────────────────────
    const profile = body.profile || {}

    // 1. Create the auth login, auto-confirmed so they can sign in immediately.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created?.user) {
      // Most common case: the auth user already exists.
      const msg = createErr?.message || 'Failed to create login'
      const status = /already.*registered|exists/i.test(msg) ? 409 : 500
      return res.status(status).json({ error: msg })
    }
    const authUid = created.user.id

    // 2. Insert or update the app users row, matched by email. We avoid
    //    upsert(onConflict:'email') because that needs a unique constraint on
    //    the email column, which may not exist. Select-then-write is safe
    //    regardless of constraints.
    const profileFields = {
      email,
      full_name: profile.full_name ?? '',
      initials: profile.initials ?? '',
      phone: profile.phone || null,
      is_approver: !!profile.is_approver,
      is_active: true,
      permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
      allowed_location_id: profile.allowed_location_id || null,
      workspace_role: profile.workspace_role || 'full',
    }

    const { data: existingRow } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
    let rowErr: { message: string } | null = null
    if (existingRow) {
      // A profile already existed (e.g. made before logins were linked).
      // Update it in place, keeping its existing id.
      const { error } = await admin.from('users').update(profileFields).eq('id', existingRow.id)
      rowErr = error
    } else {
      const { error } = await admin.from('users').insert({ id: authUid, ...profileFields })
      rowErr = error
    }

    if (rowErr) {
      // The login was created but the row failed. Roll back the auth user so we
      // don't leave a login with no profile (which would just sign-out-loop).
      await admin.auth.admin.deleteUser(authUid).catch(() => {})
      return res.status(500).json({ error: 'Login created but profile failed, rolled back: ' + rowErr.message })
    }

    return res.status(200).json({ ok: true, action: 'create', userId: authUid, email })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Unexpected server error' })
  }
}
