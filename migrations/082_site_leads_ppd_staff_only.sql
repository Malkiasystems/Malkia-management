-- 082_site_leads_ppd_staff_only (ALREADY LIVE, 18 Nov 2026)
-- Website leads and PPD test results hold mothers' names and phone numbers.
-- Only MalkiaOS staff and website admins can read or edit them now.
-- Submitting a lead or a PPD result (insert) is unchanged.
do $do$
declare t text; c text;
begin
  foreach t in array array['site_leads', 'site_ppd_results'] loop
    foreach c in array array['select', 'update', 'delete'] loop
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_only_' || c) then
        execute format(
          'create policy %I on public.%I as restrictive for %s to authenticated using ((select public.is_staff()) or (select public.is_site_admin()))',
          'admin_only_' || c, t, c);
      end if;
    end loop;
  end loop;
end $do$;
