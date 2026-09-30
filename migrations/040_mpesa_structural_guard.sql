-- ═══════════════════════════════════════════════════════════════════════════
-- 040_mpesa_structural_guard.sql  (30 Sep 2026)
-- ALREADY APPLIED LIVE. Repo record; safe to rerun.
--
-- Mobile-money transaction IDs vary letter/digit positions legitimately:
-- live data showed 12+ shapes on the M-Pesa account with no dominant
-- one, so shape-matching cried wolf on honest slips (DIU742SRNP, 30 Sep,
-- 2:05 PM). New ref_guard_mode 'mpesa_structural': the frontend guard
-- checks exactly 10 alphanumerics with at least one letter and one
-- digit, skips the shape library, and keeps duplicate + same-day-twin
-- detection in full (those are the checks that catch thieves).
-- ═══════════════════════════════════════════════════════════════════════════

alter table accounts drop constraint if exists accounts_ref_guard_mode_check;
alter table accounts add constraint accounts_ref_guard_mode_check
  check (ref_guard_mode = any (array['off','lenient','strict','mpesa_structural']));

update accounts set ref_guard_mode = 'mpesa_structural' where code = '1020';
