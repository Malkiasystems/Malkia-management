-- Single-company equivalent of Tarakimu's HR pay and employee privacy policies.
-- Staff lists in sales, invoice reprints and attendance use this projection.
begin;

create or replace view public.hrm_staff_directory with (security_barrier = true) as
select id, emp_code, full_name, is_active, user_id
from public.hrm_employees
where (select public.is_staff());
revoke all on public.hrm_staff_directory from public, anon, authenticated;
grant select on public.hrm_staff_directory to authenticated;

create schema if not exists hrm_private;
revoke all on schema hrm_private from public;
grant usage on schema hrm_private to authenticated;

-- Match the ERP login and require an explicit current grant. The email comes
-- from the signed login, never from a function argument or user metadata.
create or replace function hrm_private.allowed(required text[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.is_active and lower(u.email) = lower(auth.jwt()->>'email')
      and u.permissions && required
  )
$$;
revoke all on function hrm_private.allowed(text[]) from public, anon;
grant execute on function hrm_private.allowed(text[]) to authenticated;

-- Only user/role administrators may change the identity and grants used by HR.
-- Normal staff profile edits (for example an avatar) keep their existing path.
create or replace function hrm_private.guard_staff_grants() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.email, new.permissions, new.is_active, new.is_super_admin, new.role_id)
       is not distinct from (old.id, old.email, old.permissions, old.is_active, old.is_super_admin, old.role_id)
    then return new; end if;
  end if;
  if not hrm_private.allowed(array['settings.users','settings.roles']) then
    raise insufficient_privilege using message = 'User administration permission required';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_staff_grants before insert or update or delete on public.users
for each row execute function hrm_private.guard_staff_grants();
revoke truncate on public.users from public, anon, authenticated;

alter table public.hrm_employees enable row level security;
drop policy if exists hrm_employees_staff_full on public.hrm_employees;
create policy hr_employee_manage on public.hrm_employees for all to authenticated
  using ((select hrm_private.allowed(array['hrm.confidential'])))
  with check ((select hrm_private.allowed(array['hrm.confidential'])));
create policy hr_employee_self on public.hrm_employees for select to authenticated
  using (is_active and lower(email) = lower((select auth.jwt()->>'email'))
    and (select hrm_private.allowed(array['hrm.view','hrm.view_own','hrm.view_all','hrm.manage','hrm.payroll'])));

do $policy$
declare t text;
begin
  foreach t in array array['hrm_payroll_lines','hrm_salary_history','hrm_salary_advances','hrm_payroll_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_full', t);
    execute format('create policy hr_pay_manage on public.%I for all to authenticated
      using ((select hrm_private.allowed(array[''hrm.confidential''])))
      with check ((select hrm_private.allowed(array[''hrm.confidential''])))', t);
    if t <> 'hrm_payroll_runs' then
      execute format('create policy hr_pay_self on public.%I for select to authenticated
        using (employee_id in (select e.id from public.hrm_employees e where e.is_active
          and lower(e.email) = lower((select auth.jwt()->>''email''))))', t);
    end if;
  end loop;
end $policy$;
create policy hr_run_self on public.hrm_payroll_runs for select to authenticated
  using (status = 'posted' and exists
    (select 1 from public.hrm_payroll_lines l where l.payroll_run_id = hrm_payroll_runs.id));

revoke all on public.hrm_employees, public.hrm_payroll_runs, public.hrm_payroll_lines,
  public.hrm_salary_advances, public.hrm_salary_history from public, anon;
revoke truncate, references, trigger on public.hrm_employees, public.hrm_payroll_runs,
  public.hrm_payroll_lines, public.hrm_salary_advances, public.hrm_salary_history from authenticated;
commit;
