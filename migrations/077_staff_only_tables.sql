-- 077: a login is no longer enough. MalkiaOS tables require an ACTIVE STAFF
-- login; catalogue tables stay readable by everyone but only staff can change
-- them.
-- STATUS: ALREADY LIVE in Supabase (applied 17 Nov 2026 20:05, verified
-- 18 Nov 2026 via MCP). Do not run again: the policies already exist.
-- Before this, any logged-in account (including every Malkia Circle member)
-- could read and change ~150 tables through the API.
--
-- Design: existing policies are NOT touched. One extra RESTRICTIVE rule is
-- added per table, so a single table can be reverted on its own:
--   drop policy staff_only on public.<table>;
-- Catalogue tables use three rules instead (staff_write_ins / _upd / _del).
-- Tables that had row security switched OFF get it switched ON together with
-- "lockdown_*" policies that reproduce exactly what they allowed before.
-- Not touched: circle_*, site_*, registry_*, library_*, wa_* tables.
-- Server-side code (service role, owner-rights functions) is not affected.
--
-- RULE FOR FUTURE MIGRATIONS: every NEW MalkiaOS table must get
--   alter table public.<t> enable row level security;
--   create policy staff_only on public.<t> as restrictive for all
--     to authenticated using ((select public.is_staff()))
--     with check ((select public.is_staff()));
-- in addition to its normal policy, or it is open to Circle logins again.
--
-- FULL ROLLBACK (only if ever needed):
--   do $$ declare p record; begin
--     for p in select tablename, policyname from pg_policies
--       where schemaname='public' and (policyname='staff_only' or policyname like 'staff_write_%')
--     loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
--   end $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.is_active and (
      u.id = auth.uid()
      or exists (select 1 from auth.users a where a.id = auth.uid() and lower(a.email) = lower(u.email))
    )
  )
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated, anon, service_role;

do $$
declare
  cat text[] := array['products','product_images','product_sizes','product_variant_groups','product_variant_options',
                      'product_faqs','mama_stories','bundles','bundle_items','shop_problems','problem_products',
                      'shop_services','shop_settings','homepage_banners','partner_shops','shop_stock_status',
                      'stage_product_recommendations'];
  r record;
begin
  for r in
    select c.oid, c.relname, c.relrowsecurity rls, (c.relname = any(cat)) is_cat
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname !~ '^(circle_|site_|registry_|library_|wa_)'
    order by c.relname
  loop
    if not r.rls then
      if has_any_column_privilege('anon', r.oid, 'SELECT') then
        execute format('create policy lockdown_public_read on public.%I for select to anon using (true)', r.relname);
      end if;
      if has_table_privilege('anon', r.oid, 'INSERT') then
        execute format('create policy lockdown_public_insert on public.%I for insert to anon with check (true)', r.relname);
      end if;
      execute format('create policy lockdown_login_all on public.%I for all to authenticated using (true) with check (true)', r.relname);
      execute format('alter table public.%I enable row level security', r.relname);
    end if;
    if r.is_cat then
      execute format('create policy staff_write_ins on public.%I as restrictive for insert to authenticated with check ((select public.is_staff()))', r.relname);
      execute format('create policy staff_write_upd on public.%I as restrictive for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', r.relname);
      execute format('create policy staff_write_del on public.%I as restrictive for delete to authenticated using ((select public.is_staff()))', r.relname);
    else
      execute format('create policy staff_only on public.%I as restrictive for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', r.relname);
    end if;
  end loop;
end $$;
