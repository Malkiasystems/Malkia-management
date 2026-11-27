begin;
create function public.issue_hrm_advance(p_id uuid,p_employee uuid,p_source uuid,p_date date,p_amount numeric,p_monthly numeric,p_notes text)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare actor text; employee_name text; cash numeric; receivable uuid; journal uuid; ref text := 'ADV-'||p_id::text;
begin
  if not hrm_private.allowed(array['hrm.confidential']) then raise insufficient_privilege; end if;
  if num_nulls(p_id,p_employee,p_source,p_date,p_amount,p_monthly)>0 or p_amount<=0 or p_monthly<=0 then
    raise exception 'Enter a positive amount, instalment, employee, date and payment account'; end if;
  perform pg_advisory_xact_lock(hashtext('malkia.post_hrm_payroll'));
  if exists(select from hrm_salary_advances where id=p_id and employee_id=p_employee) then return ref; end if;
  select full_name into strict actor from users where is_active and lower(email)=lower(auth.jwt()->>'email');
  select full_name into strict employee_name from hrm_employees where id=p_employee and is_active for share;
  select balance into strict cash from accounts where id=p_source and is_active and type='asset' and category='Cash & Bank' for update;
  if coalesce(cash,0)<p_amount then raise exception 'Payment account has insufficient funds'; end if;
  receivable:=hrm_private.pay_account('1061','Salary Advance Receivable',
    array['salary advance receivable','staff advance receivable'],'asset','Current Assets');
  if receivable=p_source then raise exception 'Select a different payment account'; end if;
  insert into journals(ref,posting_date,description,journal_type,source_type,source_ref,posted_by,status)
    values('JV-'||ref,p_date,'Salary advance — '||employee_name,'salary_advance','salary_advance',ref,actor,'posted') returning id into journal;
  insert into journal_lines(journal_id,line_number,account_id,description,debit,credit) values
    (journal,1,receivable,'Advance to '||employee_name,p_amount,0),(journal,2,p_source,'Advance payment',0,p_amount);
  perform update_account_balance(receivable,p_amount,0);
  perform update_account_balance(p_source,0,p_amount);
  insert into vouchers(ref,type,posting_date,description,total_amount,status,journal_id,posted_by,notes)
    values(ref,'cash_payment',p_date,'Salary advance — '||employee_name,p_amount,'posted',journal,actor,p_notes);
  insert into hrm_salary_advances(id,employee_id,amount,remaining,monthly_deduction,issued_date,status,notes)
    values(p_id,p_employee,p_amount,p_amount,p_monthly,p_date,'active',p_notes);
  return ref;
end $$;
revoke all on function public.issue_hrm_advance(uuid,uuid,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.issue_hrm_advance(uuid,uuid,uuid,date,numeric,numeric,text) to authenticated;
commit;
