-- 079_products_public_view (ALREADY LIVE)
-- Safe product list for the website and Circle: no cost price, no stock quantity.
-- Note: 080 re-creates this view with one more column (circle_discount_pct).
create or replace view public.products_public as
select p.id, p.sku, p.slug, p.name, p.description, p.short_description,
  p.category, p.unit, p.selling_price, p.image_url,
  p.pregnancy_stage, p.expert_endorsed, p.expert_endorsement_text,
  p.show_retail, p.is_active, p.display_order,
  (coalesce(p.qty_on_hand, 0) > 0) as in_stock
from public.products p;
revoke all on table public.products_public from public;
grant select on table public.products_public to anon, authenticated, service_role;
