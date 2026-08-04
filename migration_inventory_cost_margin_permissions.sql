-- ============================================================================
-- Grant inventory.view_cost + inventory.view_margin to current inventory.view
-- holders.
--
-- RUN THIS BEFORE THE CODE DEPLOY.
--
-- Cost and margin figures move behind two new permissions, enforced by
-- useCostVisibility(). Without this, everyone who can see the Inventory page
-- suddenly sees •••• where cost and margin used to be. Running it first keeps
-- today's behaviour, then you untick per user in User Management.
--
-- Idempotent. Verified against production: affects 6 rows (Joe, Jane, Barbra,
-- Brenda, Epifania, Rahim). Highest resulting permission count is 61, so nobody
-- crosses the 40-permission super-admin threshold.
--
-- NOTE: Rahim Athuman goes from 9 to 11 permissions here. He holds
-- inventory.view but none of the reporting or accounting keys — worth deciding
-- whether a stock role should see supplier cost at all before you deploy.
-- ============================================================================

update users
set permissions = permissions || array['inventory.view_cost','inventory.view_margin']
where 'inventory.view' = any(permissions)
  and not ('inventory.view_cost' = any(permissions));

-- Verification
select full_name,
       cardinality(permissions)                     as perms,
       ('inventory.view_cost'   = any(permissions)) as sees_cost,
       ('inventory.view_margin' = any(permissions)) as sees_margin
from users
where is_active
order by perms desc;
