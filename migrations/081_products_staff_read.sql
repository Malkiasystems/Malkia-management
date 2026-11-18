-- 081_products_staff_read (ALREADY LIVE, 18 Nov 2026)
-- Logged-in users who are not staff (Circle members) cannot read the products
-- table (cost price, stock quantity). They use products_public.
do $do$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'staff_read') then
    create policy staff_read on public.products as restrictive for select to authenticated
      using ((select public.is_staff()));
  end if;
end $do$;
