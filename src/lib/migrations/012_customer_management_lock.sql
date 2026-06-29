-- ════════════════════════════════════════════════════════════════════════════
-- 012_customer_management_lock.sql
-- Lock create / edit / delete of WHOLESALE (non-cash) customers to permission
-- holders. Enforces the EXISTING catalog permissions customers.create /
-- customers.edit / customers.delete (defined in User Management) which until
-- now gated nothing.
--
-- Why:
--   Normal staff must not add, edit, or delete wholesale / debtor customers.
--   Only a super admin, or a user explicitly granted the matching permission,
--   may do so. Cash walk-in customers (customer_type = 'cash') stay fully open
--   so cashiers keep creating and updating them during Cash Sale.
--
-- How (defence in depth — the React UI gate alone is NOT security, because the
-- app ships the anon key and a user could call the API directly):
--   1. RLS on customers. SELECT stays open to every authenticated user so the
--      rest of the app keeps reading customers normally (invoicing, statements,
--      CRM, reports).
--   2. INSERT of a non-cash customer requires customers.create.
--      DELETE of a non-cash customer requires customers.delete.
--   3. UPDATE passes RLS, but a BEFORE UPDATE trigger rejects changes to
--      profile / credit columns on a non-cash customer unless the user has
--      customers.edit. The operational columns posting touches (balance,
--      last_purchase_*, crown_points, CRM / journey fields) are deliberately
--      NOT protected, so invoice / receipt / credit-note posting never breaks.
--
-- Permission test: super admin (40+ permissions, mirrors the app's isSuperAdmin)
--   OR the user holds the specific permission. Grant customers.create / edit /
--   delete from User Management to delegate to a manager (e.g. Customer
--   Experience) without making them a full super admin.
--
-- Idempotent: safe to run more than once.
--
-- ⚠ TEST ON A SUPABASE BRANCH FIRST. A wrong SELECT policy would hide every
--   customer from the whole app. Verify reads still work before merging.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Permission-check helper ────────────────────────────────────────────
-- SECURITY DEFINER so it can read the users table regardless of users RLS.
-- Super admin (40+ permissions) passes for any code, mirroring useAuth.
CREATE OR REPLACE FUNCTION has_customer_perm(p_uid UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (COALESCE(array_length(u.permissions, 1), 0) >= 40)
           OR (p_code = ANY(u.permissions))
    FROM users u
    WHERE u.id = p_uid
  ), FALSE);
$$;

-- ─── 2. Enable RLS ─────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- ─── 3. SELECT: open to all authenticated users (keep the app working) ─────
DROP POLICY IF EXISTS customers_select_all ON customers;
CREATE POLICY customers_select_all ON customers
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- ─── 4. INSERT: cash open to everyone; non-cash requires customers.create ──
DROP POLICY IF EXISTS customers_insert_guarded ON customers;
CREATE POLICY customers_insert_guarded ON customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE(customer_type, 'cash') = 'cash'
    OR has_customer_perm(auth.uid(), 'customers.create')
  );

-- ─── 5. UPDATE: allowed through RLS; columns guarded by the trigger below ──
DROP POLICY IF EXISTS customers_update_all ON customers;
CREATE POLICY customers_update_all ON customers
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── 6. DELETE: cash open; non-cash requires customers.delete ──────────────
DROP POLICY IF EXISTS customers_delete_guarded ON customers;
CREATE POLICY customers_delete_guarded ON customers
  FOR DELETE
  TO authenticated
  USING (
    COALESCE(customer_type, 'cash') = 'cash'
    OR has_customer_perm(auth.uid(), 'customers.delete')
  );

-- ─── 7. Column-level protection for non-cash customers ─────────────────────
-- A user without customers.edit may not change any profile / credit column on
-- a wholesale / debtor customer. Operational columns (balance, last_purchase_*,
-- crown_points, lifecycle / journey fields) are left editable on purpose so
-- posting and CRM pipeline updates keep working untouched.
CREATE OR REPLACE FUNCTION protect_wholesale_customer_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Holders of customers.edit (and super admins) may change anything.
  IF has_customer_perm(auth.uid(), 'customers.edit') THEN
    RETURN NEW;
  END IF;

  -- Guard only when a non-cash customer is involved (before OR after the change,
  -- so a cash -> wholesale promotion attempt is caught too).
  IF COALESCE(OLD.customer_type, 'cash') <> 'cash'
     OR COALESCE(NEW.customer_type, 'cash') <> 'cash' THEN

    IF NEW.name            IS DISTINCT FROM OLD.name
    OR NEW.company         IS DISTINCT FROM OLD.company
    OR NEW.contact_person  IS DISTINCT FROM OLD.contact_person
    OR NEW.customer_type   IS DISTINCT FROM OLD.customer_type
    OR NEW.segment         IS DISTINCT FROM OLD.segment
    OR NEW.whatsapp        IS DISTINCT FROM OLD.whatsapp
    OR NEW.email           IS DISTINCT FROM OLD.email
    OR NEW.phone           IS DISTINCT FROM OLD.phone
    OR NEW.address         IS DISTINCT FROM OLD.address
    OR NEW.tin_number      IS DISTINCT FROM OLD.tin_number
    OR NEW.credit_limit    IS DISTINCT FROM OLD.credit_limit
    OR NEW.credit_period   IS DISTINCT FROM OLD.credit_period
    OR NEW.payment_terms   IS DISTINCT FROM OLD.payment_terms
    OR NEW.customer_number IS DISTINCT FROM OLD.customer_number
    OR NEW.notes           IS DISTINCT FROM OLD.notes
    OR NEW.is_active       IS DISTINCT FROM OLD.is_active
    OR NEW.is_hidden       IS DISTINCT FROM OLD.is_hidden
    THEN
      RAISE EXCEPTION
        'You do not have permission to edit wholesale customers (customers.edit). Ask a super admin.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_wholesale_customer_columns ON customers;
CREATE TRIGGER trg_protect_wholesale_customer_columns
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION protect_wholesale_customer_columns();

-- ─── 8. Grant permissions to a delegated manager (optional) ────────────────
-- Super admins (40+ permissions) already pass automatically. To let a specific
-- non-admin manage wholesale customers, grant the permissions from User
-- Management, or via SQL, e.g.:
--   UPDATE users
--   SET permissions = permissions
--       || ARRAY['customers.create','customers.edit','customers.delete']
--   WHERE email = 'manager@example.com';
