-- MalkiaOS — location balance repair, 22 Sep 2026
-- Run in Supabase SQL Editor (Malkiasystems's Project), one block at a time.
-- Cause: the import receive's product_locations upsert failed silently, so
-- SKN-004 posted to the ledger and global qty but both locations stayed 0.

-- ── 1. PREVIEW: every product whose location split disagrees with the ledger.
--       Read this list first. Expect SKN-004; anything else listed drifted
--       silently at some earlier point and gets healed by step 3 too.
select p.sku, p.name, p.qty_on_hand as global_qty,
       coalesce(led.total, 0) as ledger_total,
       coalesce(loc.total, 0) as locations_total
from products p
left join (select product_id, sum(qty) total from item_ledger_entries group by 1) led on led.product_id = p.id
left join (select product_id, sum(qty_on_hand) total from product_locations group by 1) loc on loc.product_id = p.id
where p.is_active = true
  and abs(coalesce(led.total,0) - coalesce(loc.total,0)) > 0.01
order by p.sku;

-- ── 2. CHECK: did the receive's journal post? If this returns NO ROW, the
--       Dr Inventory / Cr GRN Interim journal for RCV2 is missing and the
--       GL is short ~1,573,334 — tell Claude the result before step 3 and
--       the journal will be repaired separately. If it returns a row, the
--       GL is fine and only locations need step 3.
select ref, status, posting_date from journals where ref like 'JV-IMP-10-0002%';

-- ── 3. REPAIR: rebuild product_locations from per-location ledger sums.
--       Only touches (product, location) pairs the ledger knows, only where
--       the stored value differs. Rows the ledger never touched are left
--       exactly as they are. Safe to re-run any time.
update product_locations pl
set qty_on_hand = s.q, last_updated = now()
from (
  select product_id, location_id, sum(qty) q
  from item_ledger_entries
  where location_id is not null
  group by 1, 2
) s
where s.product_id = pl.product_id
  and s.location_id = pl.location_id
  and pl.qty_on_hand is distinct from s.q;

insert into product_locations (product_id, location_id, location_code, qty_on_hand, last_updated)
select s.product_id, s.location_id, sl.code, s.q, now()
from (
  select product_id, location_id, sum(qty) q
  from item_ledger_entries
  where location_id is not null
  group by 1, 2
) s
join stock_locations sl on sl.id = s.location_id
where not exists (
  select 1 from product_locations pl
  where pl.product_id = s.product_id and pl.location_id = s.location_id
);

-- ── 4. VERIFY: rerun step 1. It should return zero rows (or only products
--       whose ledger genuinely disagrees with global qty — those need a
--       stock count, not a sync).
