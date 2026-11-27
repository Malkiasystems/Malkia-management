-- Malkia's single-company equivalent of Tarakimu's transactional payroll post.
begin;
alter table public.hrm_payroll_runs add column operation_id uuid unique;
alter table public.hrm_payroll_lines add column advance_recoveries jsonb;

create function hrm_private.pay_account(wanted_code text, wanted_name text, aliases text[], kind text, group_name text)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare acct uuid;
begin
  select id into acct from public.accounts
    where is_active and type = kind and lower(trim(name)) = any(aliases)
    order by (code = wanted_code) desc, code limit 1;
  if acct is not null then return acct; end if;
  if exists(select from public.accounts where code = wanted_code) then
    raise exception 'Review payroll account % (%): its existing name, type or active status does not match.', wanted_code, wanted_name;
  end if;
  insert into public.accounts(code,name,type,category,balance,is_active)
    values(wanted_code,wanted_name,kind,group_name,0,true) returning id into acct;
  return acct;
end $$;
revoke all on function hrm_private.pay_account(text,text,text[],text,text) from public;
grant execute on function hrm_private.pay_account(text,text,text[],text,text) to authenticated;

create function public.post_hrm_payroll(p_period text, p_lines jsonb, p_operation uuid, p_previous uuid default null)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  old_run hrm_payroll_runs%rowtype; old_journal uuid; old_voucher uuid;
  slip hrm_payroll_lines%rowtype; adv hrm_salary_advances%rowtype;
  entry record; posting record; allocation record; allocated jsonb; recovered numeric; instalment numeric;
  last_day date; posting_day date; actor text; new_run uuid; new_journal uuid;
  reference text; prior_ref text; revisions integer; staff_count integer; n integer := 0;
  gross numeric := 0; bonus numeric := 0; paye numeric := 0; ee numeric := 0; er numeric := 0;
  sdl numeric := 0; net numeric := 0; advances numeric := 0; actual_count integer; acct uuid;
begin
  if not hrm_private.allowed(array['hrm.confidential']) then raise insufficient_privilege; end if;
  if p_operation is null or p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Invalid payroll request'; end if;
  if jsonb_array_length(p_lines) = 0 then raise exception 'Payroll has no employees'; end if;
  posting_day := (p_period || '-28')::date;
  last_day := (date_trunc('month',posting_day) + interval '1 month - 1 day')::date;
  select full_name into strict actor from users where is_active and lower(email)=lower(auth.jwt()->>'email');
  perform pg_advisory_xact_lock(hashtext('malkia.post_hrm_payroll'));
  select journal_ref into prior_ref from hrm_payroll_runs where operation_id=p_operation and period=p_period;
  if found then return prior_ref; end if;

  select count(*) into revisions from hrm_payroll_runs where period=p_period;
  if (select count(*) from hrm_payroll_runs where period=p_period and status='posted') > 1 then
    raise exception 'This month has multiple posted runs and needs reconciliation';
  end if;
  select * into old_run from hrm_payroll_runs where period=p_period and status='posted' for update;
  if old_run.id is distinct from p_previous then raise exception 'Payroll changed. Recompute this month before posting.'; end if;
  if old_run.id is not null then
    select id into strict old_journal from journals
      where source_ref=old_run.journal_ref and source_type='payroll' and status='posted' for update;
    select id into strict old_voucher from vouchers where journal_id=old_journal and type='payroll' and status='posted' for update;
    for slip in select * from hrm_payroll_lines where payroll_run_id=old_run.id order by employee_id for update loop
      if slip.advance_deduction > 0 then
        if slip.advance_recoveries is null then
          raise exception 'This earlier payroll has no per-advance recovery history. Reconcile its advances before replacing it.';
        end if;
        for allocation in select * from jsonb_each_text(slip.advance_recoveries) loop
          update hrm_salary_advances set remaining=remaining+allocation.value::numeric,status='active'
          where id=allocation.key::uuid and employee_id=slip.employee_id
            and remaining+allocation.value::numeric <= amount;
          if not found then raise exception 'Advance history changed; review before replacing this payroll'; end if;
        end loop;
      end if;
    end loop;
    for entry in select account_id,debit,credit from journal_lines where journal_id=old_journal loop
      perform update_account_balance(entry.account_id,-entry.debit,-entry.credit);
    end loop;
    update journals set status='void',voided_at=now(),voided_by=actor,void_reason='Payroll replaced' where id=old_journal;
    update vouchers set status='voided' where id=old_voucher;
    update hrm_payroll_runs set status='voided' where id=old_run.id;
  end if;

  reference := 'PAY-'||replace(p_period,'-','')||case when revisions=0 then '' else '-R'||(revisions+1)::text end;
  -- Keep the roster stable until commit. A deactivation or a new joiner
  -- between loading and submitting the screen must trigger a fresh preview.
  lock table hrm_employees in share mode;
  select count(*) into staff_count from hrm_employees where is_active and (start_date is null or start_date<=last_day);
  select count(distinct x.employee_id) into actual_count from jsonb_to_recordset(p_lines) as x(employee_id uuid);
  if actual_count<>staff_count or actual_count<>jsonb_array_length(p_lines) then raise exception 'Employee list changed. Recompute payroll.'; end if;
  insert into hrm_payroll_runs(period,status,journal_ref,operation_id,posted_at,posted_by)
    values(p_period,'posted',reference,p_operation,now(),actor) returning id into new_run;
  for slip in select * from jsonb_populate_recordset(null::public.hrm_payroll_lines,p_lines) order by employee_id loop
    if not exists(select from hrm_employees where id=slip.employee_id and is_active and (start_date is null or start_date<=last_day)) then
      raise exception 'Employee eligibility changed. Recompute payroll.';
    end if;
    if num_nulls(slip.gross,slip.bonus,slip.paye,slip.nssf_ee,slip.nssf_er,slip.sdl,slip.net_pay,slip.advance_deduction)>0
       or least(slip.gross,slip.bonus,slip.paye,slip.nssf_ee,slip.nssf_er,slip.sdl,slip.net_pay,slip.advance_deduction)<0
       or slip.net_pay <> slip.gross + slip.bonus - slip.paye - slip.nssf_ee - slip.advance_deduction then
      raise exception 'Invalid or unbalanced payroll line'; end if;
    recovered:=0; allocated:='{}';
    for adv in select * from hrm_salary_advances where employee_id=slip.employee_id and status='active'
      and issued_date<=last_day order by id for update loop
      instalment:=greatest(0,least(adv.remaining,adv.monthly_deduction));
      if instalment>0 then
        update hrm_salary_advances set remaining=remaining-instalment,
          status=case when remaining=instalment then 'cleared' else status end where id=adv.id;
        allocated:=allocated||jsonb_build_object(adv.id,instalment); recovered:=recovered+instalment;
      end if;
    end loop;
    if recovered<>slip.advance_deduction then raise exception 'Advance balance changed. Recompute payroll.'; end if;
    insert into hrm_payroll_lines(payroll_run_id,employee_id,gross,bonus,notes,allowances,deductions,paye,nssf_ee,nssf_er,sdl,net_pay,advance_deduction,advance_recoveries,payslip_sent)
      values(new_run,slip.employee_id,slip.gross,slip.bonus,slip.notes,0,0,slip.paye,slip.nssf_ee,slip.nssf_er,slip.sdl,slip.net_pay,recovered,allocated,false);
    gross:=gross+slip.gross; bonus:=bonus+slip.bonus; paye:=paye+slip.paye; ee:=ee+slip.nssf_ee;
    er:=er+slip.nssf_er; sdl:=sdl+slip.sdl; net:=net+slip.net_pay; advances:=advances+recovered;
  end loop;

  insert into journals(ref,posting_date,description,journal_type,source_type,source_ref,posted_by,status)
    values('JV-'||reference,posting_day,'Payroll — '||p_period,'payroll','payroll',reference,actor,'posted') returning id into new_journal;
  for posting in select * from (values
    ('6010','Staff Salaries — Full-Time',array['staff salaries — full-time','salaries','salary expense','salaries expense'],'expense','People',gross+bonus,0::numeric),
    ('6020','NSSF Expense',array['nssf expense','nssf employer','nssf — employer'],'expense','People',er,0),
    ('6030','SDL',array['sdl','sdl expense'],'expense','People',sdl,0),
    ('2030','PAYE Payable',array['paye payable','paye'],'liability','Payroll Tax',0,paye),
    ('2031','NSSF Payable',array['nssf payable','nssf / wcf payable'],'liability','Payroll Tax',0,ee+er),
    ('2033','SDL Payable',array['sdl payable'],'liability','Payroll Tax',0,sdl),
    ('2032','Net Salary Payable',array['net salary payable','net pay payable'],'liability','Payroll',0,net),
    ('1061','Salary Advance Receivable',array['salary advance receivable','staff advance receivable'],'asset','Current Assets',0,advances)
  ) as p(code,name,aliases,kind,grp,dr,cr) where dr<>0 or cr<>0 loop
    acct:=hrm_private.pay_account(posting.code,posting.name,posting.aliases,posting.kind,posting.grp);
    n:=n+1;
    insert into journal_lines(journal_id,line_number,account_id,description,debit,credit)
      values(new_journal,n,acct,posting.name||' — '||p_period,posting.dr,posting.cr);
    perform update_account_balance(acct,posting.dr,posting.cr);
  end loop;
  if n=0 then raise exception 'This payroll has no amounts to post'; end if;
  insert into vouchers(ref,type,posting_date,description,total_amount,status,journal_id,posted_by)
    values(reference,'payroll',posting_day,'Payroll — '||p_period,gross+bonus+er+sdl,'posted',new_journal,actor);
  return reference;
end $$;
revoke all on function public.post_hrm_payroll(text,jsonb,uuid,uuid) from public, anon;
grant execute on function public.post_hrm_payroll(text,jsonb,uuid,uuid) to authenticated;
commit;
