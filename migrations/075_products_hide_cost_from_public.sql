-- 075: the public can read product catalogue fields only, never cost,
-- supplier or margin fields.
-- STATUS: NOT YET APPLIED. Apply only AFTER the Malkia-Shop bundle of
-- 17 Nov 2026 is live (the old /partners page requests cost_price and
-- would fail to load products if this ran first).
-- Hidden from the public after this: cost_price, cost_price_usd,
-- supplier_id, preferred_supplier_id, min_margin_pct, allow_sell_below_cost,
-- reorder_point, lead_time_days, costing_method, product_posting_group,
-- vat_code.
-- Logged-in access (MalkiaOS staff, shop admin) is NOT changed.
-- NOTE: any NEW column added to products later is hidden from the public
-- until it is added to the list below.
-- Rollback: grant select on public.products to anon;

revoke select on table public.products from anon;

grant select (
  id, sku, slug, name, description, category, unit,
  selling_price, wholesale_price, moq, units_per_carton,
  qty_on_hand, wholesale_stock_status, is_active, created_at, barcode,
  image_url, video_url, howto_video_url, instagram_url,
  short_description, pregnancy_stage,
  sold_base, sold_daily_increment, sold_base_date,
  urgency_active, urgency_text,
  expert_endorsed, expert_endorsement_text, recovery_window,
  show_retail, show_wholesale, display_order, feedback_window_days,
  is_hero, hero_subtitle
) on table public.products to anon;
