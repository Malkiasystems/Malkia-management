-- ════════════════════════════════════════════════════════════════════════════
-- 025_product_location_repair.sql
--
-- Fixes two pre-existing data faults exposed by the Add Product bug:
--
--   FAULT A — "unlocated products"
--     products.qty_on_hand > 0 but ZERO rows in product_locations.
--     Cause: Inventory.tsx save() inserted into products only. These products
--     are hidden from every location filter and show no breakdown.
--
--   FAULT B — "phantom bin"
--     product_locations rows with location_code IS NULL (e.g. BELT-001 null:20).
--     No current app code writes NULL there, so this is legacy/imported data.
--     Two sub-cases: location_id is present (just backfill the code) or
--     location_id is also NULL (a genuine orphan — needs a human decision).
--
-- RUN THE SELECTS FIRST. Read the output. Only then run the UPDATE/INSERT.
-- Nothing below is destructive; no row is deleted.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── STEP 1 · DIAGNOSE ─────────────────────────────────────────────────────
-- 1a. Unlocated products (Fault A). Expect your new product here.
SELECT p.id, p.sku, p.name, p.qty_on_hand
  FROM products p
 WHERE p.is_active = true
   AND p.qty_on_hand > 0
   AND NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = p.id)
 ORDER BY p.qty_on_hand DESC;

-- 1b. Phantom bins (Fault B). Expect BELT-001 here.
SELECT pl.product_id, p.sku, p.name, pl.location_id, pl.location_code, pl.qty_on_hand,
       CASE WHEN pl.location_id IS NULL THEN 'ORPHAN — needs decision'
            ELSE 'BACKFILLABLE — location_id present' END AS verdict
  FROM product_locations pl
  JOIN products p ON p.id = pl.product_id
 WHERE pl.location_code IS NULL;

-- 1c. Drift check: does global qty equal the sum of its bins?
SELECT p.sku, p.name, p.qty_on_hand AS global_qty,
       COALESCE(SUM(pl.qty_on_hand), 0) AS location_sum,
       p.qty_on_hand - COALESCE(SUM(pl.qty_on_hand), 0) AS drift
  FROM products p
  LEFT JOIN product_locations pl ON pl.product_id = p.id
 WHERE p.is_active = true
 GROUP BY p.id, p.sku, p.name, p.qty_on_hand
HAVING ABS(p.qty_on_hand - COALESCE(SUM(pl.qty_on_hand), 0)) > 0.01
 ORDER BY ABS(p.qty_on_hand - COALESCE(SUM(pl.qty_on_hand), 0)) DESC;


-- ─── STEP 2 · REPAIR FAULT B (safe, mechanical) ────────────────────────────
-- Backfill location_code where location_id is present. Zero judgement needed.
UPDATE product_locations pl
   SET location_code = sl.code,
       last_updated  = NOW()
  FROM stock_locations sl
 WHERE pl.location_id = sl.id
   AND pl.location_code IS NULL;

-- Rows where BOTH location_id and location_code are NULL are NOT touched.
-- Those units genuinely have no home. Decide per row: either post a Stock
-- Adjustment to write them off, or a Transfer to move them into a real bin.
-- Do not delete them silently — the qty is real and the ledger will not agree.


-- ─── STEP 3 · REPAIR FAULT A (requires you to name the bin) ────────────────
-- Places every unlocated product's stock into ONE location, and writes the
-- matching item_ledger_entries row so Stock Movements agrees.
--
-- ⚠ Replace :target_code with the real bin, e.g. '1002'. Do not guess.
-- ⚠ Run STEP 1a first. If a product's stock actually sits across TWO bins,
--   this script is the wrong tool — post an Opening Stock voucher instead.

-- 3a. Preview exactly what will be inserted. Run this. Read it. Then 3b.
/*
WITH target AS (SELECT id, code FROM stock_locations WHERE code = :'target_code')
SELECT p.sku, p.name, p.qty_on_hand, t.code AS will_be_placed_at
  FROM products p CROSS JOIN target t
 WHERE p.is_active = true AND p.qty_on_hand > 0
   AND NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = p.id);
*/

-- 3b. Execute. Wrapped in a transaction — both writes land, or neither does.
/*
BEGIN;

WITH target AS (
  SELECT id, code FROM stock_locations WHERE code = :'target_code'
),
unlocated AS (
  SELECT p.id, p.sku, p.qty_on_hand, p.cost_price
    FROM products p
   WHERE p.is_active = true AND p.qty_on_hand > 0
     AND NOT EXISTS (SELECT 1 FROM product_locations pl WHERE pl.product_id = p.id)
),
placed AS (
  INSERT INTO product_locations (product_id, location_id, location_code, qty_on_hand, last_updated)
  SELECT u.id, t.id, t.code, u.qty_on_hand, NOW()
    FROM unlocated u CROSS JOIN target t
  ON CONFLICT (product_id, location_id) DO NOTHING
  RETURNING product_id
)
INSERT INTO item_ledger_entries
  (product_id, entry_type, document_type, document_ref, posting_date, qty, cost_amount, location_id)
SELECT u.id, 'opening_stock', 'backfill', 'REPAIR-025-' || u.sku,
       CURRENT_DATE, u.qty_on_hand, u.cost_price * u.qty_on_hand, t.id
  FROM unlocated u CROSS JOIN target t
 WHERE u.id IN (SELECT product_id FROM placed);

COMMIT;
*/


-- ─── STEP 4 · VERIFY ───────────────────────────────────────────────────────
-- Both should return zero rows.
-- SELECT ... (rerun 1a)
-- SELECT ... (rerun 1b)
