create table public.hrm_employee_deactivations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hrm_employees(id),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null,
  recorded_by_name text not null,
  reason text not null check (char_length(reason) between 1 and 1000)
);
create index on public.hrm_employee_deactivations (employee_id, recorded_at desc);
alter table public.hrm_employee_deactivations enable row level security;
revoke all on public.hrm_employee_deactivations from public, anon, authenticated;
grant select on public.hrm_employee_deactivations to authenticated;
create policy hr_read_deactivations on public.hrm_employee_deactivations
  for select to authenticated using ((select hrm_private.allowed(array['hrm.confidential'])));

-- The trigger alone can append records on behalf of staff. Old clients that
-- only change is_active must supply a reason through the new confirmation.
create function hrm_private.record_employee_deactivation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reason text := nullif(btrim(current_setting('hrm.deactivation_reason', true), E' \t\r\n'), '');
  actor text;
begin
  if reason is null or char_length(reason) > 1000 then
    raise exception 'Enter a deactivation reason (up to 1000 characters)';
  end if;
  if auth.uid() is null or not hrm_private.allowed(array['hrm.confidential']) then
    raise insufficient_privilege using message = 'Company HR permission required';
  end if;
  select coalesce(nullif(u.full_name,''),u.email) into strict actor from public.users u
    where u.is_active and lower(u.email)=lower(auth.jwt()->>'email');
  insert into public.hrm_employee_deactivations(employee_id, recorded_by, recorded_by_name, reason)
    values(new.id, auth.uid(), actor, reason);
  return new;
end $$;
revoke all on function hrm_private.record_employee_deactivation() from public, anon, authenticated;
create trigger record_employee_deactivation after update of is_active on public.hrm_employees
  for each row when (old.is_active is true and new.is_active is not true)
  execute function hrm_private.record_employee_deactivation();

create function public.deactivate_hrm_employee(p_employee uuid, p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not hrm_private.allowed(array['hrm.confidential']) then
    raise insufficient_privilege using message = 'Company HR permission required';
  end if;
  perform set_config('hrm.deactivation_reason',coalesce(p_reason,''),true);
  update public.hrm_employees set is_active=false where id=p_employee and is_active;
  if not found then raise exception 'This employee is already inactive or unavailable'; end if;
  perform set_config('hrm.deactivation_reason','',true);
end $$;
revoke all on function public.deactivate_hrm_employee(uuid,text) from public, anon;
grant execute on function public.deactivate_hrm_employee(uuid,text) to authenticated;
notify pgrst, 'reload schema';
