-- ═══════════════════════════════════════════════════════════════════════════
-- 029_missing_grants.sql
--
-- Two objects the app queries every day that no role has ever been granted
-- access to. Both have been failing silently in production; they show up in the
-- Postgres log as "permission denied for table crm_settings" and "permission
-- denied for view unpaid_recurring_this_period", repeatedly, for hours.
--
-- Neither is an RLS problem. RLS is off on both, consistent with the rest of
-- the schema. They simply have no GRANT at all:
--
--   crm_settings                    authenticated: none    anon: none
--   unpaid_recurring_this_period    authenticated: none    anon: none
--
-- For comparison, vouchers has the full set for both roles, and
-- recurring_expenses has SELECT/INSERT/UPDATE for authenticated. These two were
-- created and never granted.
--
-- NOTE: a stale comment in CRMReferrals.tsx line 121 says the referral RPC is
-- SECURITY DEFINER so it "bypasses the crm_settings RLS that blocks" direct
-- reads. That is wrong and worth correcting when someone is next in that file:
-- there is no RLS on crm_settings. The RPC works because it runs as its owner
-- and therefore sidesteps the missing GRANT, which is a different thing.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. crm_settings ──────────────────────────────────────────────────────
--
-- CRMSettings.tsx both reads and writes this table directly:
--   line 43: supabase.from('crm_settings').select('*')
--   line 76: supabase.from('crm_settings').upsert(updates, { onConflict: 'category,key' })
-- So the page cannot load AND cannot save. It needs SELECT + INSERT + UPDATE
-- (upsert needs both write verbs).
--
-- DELETE is deliberately withheld. Nothing in the app deletes a setting, and a
-- settings row disappearing is harder to notice than a wrong value.
--
-- Granted to authenticated only, not anon. The RLS incident on journal_lines
-- proved the app posts as `authenticated` — an anon-only policy blocked every
-- write. So authenticated is the role that matters, and settings do not need to
-- be readable by anonymous visitors.

GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_settings TO authenticated;


-- ─── 2. unpaid_recurring_this_period ──────────────────────────────────────
--
-- Read by useRecurringExpenses.ts line 49. A view, so SELECT is all it needs;
-- the underlying recurring_expenses table already grants SELECT to
-- authenticated, so this works either way round.

GRANT SELECT ON TABLE public.unpaid_recurring_this_period TO authenticated;


-- ─── Verify ───────────────────────────────────────────────────────────────
-- Expect: both true.

SELECT
  has_table_privilege('authenticated', 'public.crm_settings', 'select')                 AS crm_settings_readable,
  has_table_privilege('authenticated', 'public.crm_settings', 'update')                 AS crm_settings_writable,
  has_table_privilege('authenticated', 'public.unpaid_recurring_this_period', 'select') AS recurring_view_readable;

NOTIFY pgrst, 'reload schema';
