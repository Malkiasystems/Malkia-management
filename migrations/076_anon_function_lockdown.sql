-- 076: privileged back-end operations require a login.
-- STATUS: ALREADY LIVE in Supabase (applied + verified via MCP, 17 Nov 2026).
-- Before this, 26 owner-rights functions with no identity check inside them
-- (stock transfers, approvals, crown points, statement charges, import
-- payment voids, attendance, referral and ambassador settings) could be run
-- with only the public site key. They now require a logged-in session.
-- Logged-in callers (MalkiaOS) and the service role are NOT changed.
-- Public functions used by the shop, website and Circle are NOT touched.
-- Rollback: grant execute on function <signature> to anon;
do $$
declare s text;
begin
  foreach s in array array[
    'public._return_transfer_to_source(stock_transfer_requests)',
    'public.accept_stock_transfer(uuid,uuid)',
    'public.apply_ambassador_settings_change(jsonb)',
    'public.apply_referral_code(text,uuid,numeric)',
    'public.approve_crown_points(uuid,uuid)',
    'public.approve_request(uuid,uuid,text)',
    'public.attendance_kiosk_code()',
    'public.attendance_punch(uuid,text,text,uuid,double precision,double precision)',
    'public.award_crown_points(uuid,integer,text,text,uuid,uuid)',
    'public.cancel_stock_transfer(uuid,uuid)',
    'public.deduct_stock_at_location(uuid,uuid,text,numeric)',
    'public.deduct_stock_at_location_allow_negative(uuid,uuid,text,numeric)',
    'public.dispatch_stock_transfer(text,uuid,uuid,uuid,jsonb,text,boolean)',
    'public.get_ambassador_settings()',
    'public.integrity_assert()',
    'public.mark_request_executed(uuid,uuid,text)',
    'public.post_statement_charges(uuid,uuid[],uuid,uuid,text)',
    'public.prune_otp_challenges()',
    'public.recompute_product_global_qty(uuid)',
    'public.record_referral_use(text,uuid,uuid,numeric,text)',
    'public.reject_crown_points(uuid,uuid,text)',
    'public.reject_request(uuid,uuid,text)',
    'public.reject_stock_transfer(uuid,uuid,text)',
    'public.resolve_ambassador_cap(uuid)',
    'public.verify_voucher_posting(text)',
    'public.void_import_payment(uuid,uuid,numeric,text,text)'
  ] loop
    -- keep logged-in and server access explicit BEFORE removing the public default
    execute format('grant execute on function %s to authenticated, service_role', s);
    execute format('revoke execute on function %s from public, anon', s);
  end loop;
end $$;

-- Old WATI customer conversations: no reading without a login.
revoke all on table public.wati_conversations_recent from public, anon;
