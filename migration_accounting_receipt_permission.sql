-- ============================================================================
-- Grant accounting.receipt to everyone who can already create vouchers
--
-- RUN THIS BEFORE THE CODE DEPLOY.
--
-- Receipt pages (cash-receipt, bank-receipt, customer-receipt-batch) move from
-- accounting.create to accounting.receipt. canAccessPage() requires a match, so
-- the moment the new code ships, anyone holding accounting.create but not
-- accounting.receipt loses the receipt screens. Running this first makes the
-- deploy behaviour-neutral: nobody's access changes, and the lock becomes a
-- lever you choose to pull per user in User Management afterwards.
--
-- Idempotent: the NOT ... = any(...) guard means re-running adds nothing.
--
-- Verified against production before shipping. Affects 5 rows (Joe, Jane,
-- Barbra Kabendera, Brenda Jerome, Epifania Shirima). Highest resulting
-- permission count is 59, so no user crosses the 40-permission threshold that
-- canAccessPage() treats as super admin — this cannot accidentally promote
-- anyone. Rahim, Yassir, Sophia, Elizabeth, Sam and David do not hold
-- accounting.create and are untouched.
-- ============================================================================

update users
set permissions = array_append(permissions, 'accounting.receipt')
where 'accounting.create' = any(permissions)
  and not ('accounting.receipt' = any(permissions));

-- Verification: every row should read true/true for the five names above.
select full_name,
       cardinality(permissions)                as perm_count,
       ('accounting.create'  = any(permissions)) as can_create_vouchers,
       ('accounting.receipt' = any(permissions)) as can_do_receipts
from users
where is_active
order by perm_count desc;
