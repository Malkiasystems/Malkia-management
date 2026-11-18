-- 083_site_content_admin_write (ALREADY LIVE, 18 Nov 2026)
-- Website content could be changed or deleted by ANY logged-in account
-- (every Circle member). Only MalkiaOS staff and website admins can now add,
-- edit or delete. Reading is unchanged.
do $do$
declare t text; c text;
begin
  foreach t in array array['site_articles', 'site_bands', 'site_downloads', 'site_foundation_programs',
                           'site_foundation_reports', 'site_guide_topics', 'site_guides', 'site_settings',
                           'site_stage_pages', 'registry_reviews'] loop
    foreach c in array array['insert', 'update', 'delete'] loop
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_write_' || c) then
        if c = 'insert' then
          execute format('create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.is_staff()) or (select public.is_site_admin()))', 'admin_write_' || c, t);
        else
          execute format('create policy %I on public.%I as restrictive for %s to authenticated using ((select public.is_staff()) or (select public.is_site_admin()))', 'admin_write_' || c, t, c);
        end if;
      end if;
    end loop;
  end loop;
end $do$;
