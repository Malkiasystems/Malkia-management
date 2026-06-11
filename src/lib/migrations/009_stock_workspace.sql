-- ════════════════════════════════════════════════════════════════════════════
-- 009_stock_workspace.sql
-- Scoped "workspace" experience per user.
--
-- What this creates:
--   1. users.workspace_role — which app surface a user lands in.
--        'full'  = the normal full ERP (default, every existing user)
--        'stock' = the scoped Stock Manager workspace: stock-only sidebar,
--                  a stock home dashboard, and a hard access gate that denies
--                  every non-stock page (even by URL).
--
-- Why a column and not "infer from permissions":
--   Inferring "this looks like a stock user" from the permission array is
--   fragile — the day someone is granted one extra permission the whole UI
--   would silently flip. An explicit role is deterministic and safe.
--
-- Why TEXT and not BOOLEAN:
--   Future workspaces ('sales_rep', 'cashier', ...) can be added without
--   another migration. 'full' stays the default so nothing changes for
--   existing users.
--
-- This migration is intentionally column-only. The stock_count_* tables and
-- the count-posting RPC ship in the SAME deliverable as the Stock Count code
-- that uses them (schema-first rule), not here.
--
-- Idempotent: safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS workspace_role TEXT NOT NULL DEFAULT 'full';

-- Guard against typos / unknown surfaces. Add new values here when new
-- workspaces are introduced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_workspace_role_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_workspace_role_chk
      CHECK (workspace_role IN ('full', 'stock'));
  END IF;
END $$;

COMMENT ON COLUMN users.workspace_role IS
  'Which app surface the user lands in. full = normal ERP (default). stock = scoped Stock Manager workspace (stock-only sidebar + dashboard + hard access gate). Pair with allowed_location_id to bind the manager to one branch.';

CREATE INDEX IF NOT EXISTS idx_users_workspace_role ON users(workspace_role);

-- ════════════════════════════════════════════════════════════════════════════
-- Notes for Joe:
--   • After running this, no behaviour changes until a user is flipped to
--     'stock'. Do that from User Management (the workspace toggle, shipping
--     in commit 2), or directly:
--       UPDATE users SET workspace_role = 'stock',
--         allowed_location_id = (SELECT id FROM stock_locations WHERE code = '1002')
--       WHERE email = 'storekeeper@malkiawellness.co.tz';
--   • A 'stock' user with NO allowed_location_id is still scoped to the stock
--     surface but can see all locations. Always set both together.
-- ════════════════════════════════════════════════════════════════════════════
