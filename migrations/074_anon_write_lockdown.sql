-- 074: close public (not-logged-in) write access on shared catalogue tables.
-- STATUS: ALREADY LIVE in Supabase (applied + tested via MCP, 17 Nov 2026).
-- Before this, anyone holding the public site key could insert, update or
-- delete products, bundles, categories, stockists and pre-order data, and
-- could run the stock-deduction functions, without logging in.
-- Logged-in access (MalkiaOS staff, shop admin) is NOT changed.
-- Public READ access used by shop.malkia.co.tz and malkia.co.tz is NOT changed.
-- Rollback: grant insert, update, delete on <table> to anon;

revoke insert, update, delete, truncate, references, trigger on table
  public.products,
  public.bundles,
  public.bundle_items,
  public.categories,
  public.konnect_subscriptions,
  public.partner_shops,
  public.pre_order_campaigns,
  public.pre_order_customers,
  public.shop_stock_status
from anon;

-- Partner application form: the public may still submit (insert) and read
-- back the new row id, nothing else.
revoke update, delete, truncate, references, trigger on table public.partner_applications from anon;

-- Customer personal data with no public page reading it.
revoke select on table public.konnect_subscriptions, public.pre_order_customers from anon;
