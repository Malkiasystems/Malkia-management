-- 037_bank_statement_reconciliation.sql
-- Bank / mobile money statement import, reconciliation, and approved charge posting.
-- RUN THIS BEFORE DEPLOYING THE CODE IN THIS DELIVERABLE.
--
-- Verified against MalkiaOS (ebokhvibnypiomzqimfg) on 2026-08-03:
--   * journals.ref has a UNIQUE index (journals_ref_key) -> refs come from a sequence
--   * journals.status CHECK allows draft|posted|void
--   * journal_lines has DEFERRABLE CONSTRAINT trigger assert_journal_balanced
--     (>= 2 lines, debits = credits within 0.01)
--   * journals BEFORE INSERT trigger assert_after_cutover blocks posting_date
--     earlier than ledger_cutover_date()
--   * accounts.balance is NOT maintained by any trigger; it is an application cache
--   * RLS is disabled on accounts / journals / journal_lines (single-tenant app),
--     so these tables follow the same convention

begin;

create sequence if not exists seq_bank_charge_ref;

-- ---------------------------------------------------------------- imports ---
create table if not exists bank_statement_imports (
  id                uuid primary key default uuid_generate_v4(),
  account_id        uuid not null references accounts(id),
  source            text not null default 'manual',
  file_name         text,
  file_hash         text,
  period_start      date not null,
  period_end        date not null,
  stated_opening    numeric(18,2),
  stated_closing    numeric(18,2),
  parsed_money_in   numeric(18,2) not null default 0,
  parsed_money_out  numeric(18,2) not null default 0,
  printed_charges   numeric(18,2) not null default 0,
  borne_charges     numeric(18,2) not null default 0,
  balance_gap       numeric(18,2) not null default 0,
  status            text not null default 'parsed'
                    check (status in ('parsed','reviewed','posted','abandoned')),
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now()
);

-- same file cannot be imported twice against the same account
create unique index if not exists uq_bsi_account_file
  on bank_statement_imports(account_id, file_hash)
  where file_hash is not null;

create index if not exists ix_bsi_account_period
  on bank_statement_imports(account_id, period_start, period_end);

-- ------------------------------------------------------------------ lines ---
create table if not exists bank_statement_lines (
  id                 uuid primary key default uuid_generate_v4(),
  import_id          uuid not null references bank_statement_imports(id) on delete cascade,
  account_id         uuid not null references accounts(id),
  line_no            int  not null,
  entry_date         date not null,
  description        text,
  counterparty       text,
  txn_ref            text,
  direction          text not null default 'out' check (direction in ('in','out')),
  gross_amount       numeric(18,2) not null default 0,  -- Amount: on the statement
  money_in           numeric(18,2) not null default 0,
  money_out          numeric(18,2) not null default 0,
  stated_balance     numeric(18,2),
  computed_balance   numeric(18,2),
  balance_break      numeric(18,2) not null default 0,  -- stated - computed
  printed_charge     numeric(18,2) not null default 0,  -- ServiceCharge: as printed
  charge_borne       boolean not null default false,    -- did it actually leave our wallet
  status             text not null default 'unmatched'
                     check (status in ('unmatched','matched','charge_pending',
                                       'charge_posted','charge_historical','ignored')),
  matched_journal_id uuid references journals(id),
  charge_journal_id  uuid references journals(id),
  created_at         timestamptz not null default now(),
  unique (import_id, line_no)
);

-- a transaction reference may only ever land once per account, so overlapping
-- statement periods cannot double-post the same charge
create unique index if not exists uq_bsl_account_txn
  on bank_statement_lines(account_id, txn_ref)
  where txn_ref is not null;

create index if not exists ix_bsl_import_status
  on bank_statement_lines(import_id, status);

-- ----------------------------------------------------- post approved charges ---
-- Posts ONLY the lines whose ids are passed in, and only those the reconciler
-- proved were actually borne. One journal per entry_date so the ledger keeps
-- true dates. Debit = expense account (one line per statement line, for trace),
-- credit = the bank account, or p_contra_account_id when the original payment
-- was already captured gross and this is a reclass rather than new spend.
create or replace function post_statement_charges(
  p_import_id          uuid,
  p_line_ids           uuid[],
  p_expense_account_id uuid,
  p_contra_account_id  uuid default null,
  p_posted_by          text default null
)
returns table (journal_id uuid, posting_date date, lines_posted int, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_account   uuid;
  v_credit_account uuid;
  v_cutover        date := ledger_cutover_date();
  v_ok             boolean;
  d                record;
  l                record;
  v_j              uuid;
  v_ref            text;
  v_ln             int;
begin
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'No lines selected for posting.';
  end if;

  select account_id into v_bank_account
  from bank_statement_imports where id = p_import_id;

  if v_bank_account is null then
    raise exception 'Statement import % not found.', p_import_id;
  end if;

  v_credit_account := coalesce(p_contra_account_id, v_bank_account);

  select (type = 'expense' and coalesce(allow_direct_posting, true) and is_active)
    into v_ok from accounts where id = p_expense_account_id;
  if v_ok is null then
    raise exception 'Expense account not found.';
  elsif not v_ok then
    raise exception 'The selected account is not an active expense account that allows direct posting.';
  end if;

  perform 1 from accounts where id = v_credit_account and is_active;
  if not found then
    raise exception 'The credit account is missing or inactive.';
  end if;

  for d in
    select bsl.entry_date,
           sum(bsl.printed_charge) as total,
           count(*)::int           as n
    from bank_statement_lines bsl
    where bsl.id = any(p_line_ids)
      and bsl.import_id     = p_import_id
      and bsl.status        = 'charge_pending'
      and bsl.charge_borne  = true
      and bsl.printed_charge > 0
    group by bsl.entry_date
    order by bsl.entry_date
  loop
    -- fail loudly rather than silently skipping: the caller needs to know
    if d.entry_date < v_cutover then
      raise exception
        'Line dated % is before the ledger cutover (%). Charges before the cutover cannot be posted as journals. Mark them historical and take them through an opening balance adjustment instead.',
        d.entry_date, v_cutover;
    end if;

    v_ref := 'BCHG-' || to_char(d.entry_date, 'YYYYMMDD')
                     || '-' || lpad(nextval('seq_bank_charge_ref')::text, 5, '0');

    insert into journals (ref, posting_date, description, journal_type,
                          source_type, source_ref, posted_by, status)
    values (v_ref, d.entry_date,
            'Bank charges per statement ' || to_char(d.entry_date, 'DD/MM/YYYY'),
            'bank_charge', 'bank_statement', p_import_id::text,
            p_posted_by, 'posted')
    returning id into v_j;

    v_ln := 0;

    for l in
      select bsl.id, bsl.printed_charge, bsl.txn_ref, bsl.counterparty
      from bank_statement_lines bsl
      where bsl.id = any(p_line_ids)
        and bsl.import_id     = p_import_id
        and bsl.entry_date    = d.entry_date
        and bsl.status        = 'charge_pending'
        and bsl.charge_borne  = true
        and bsl.printed_charge > 0
      order by bsl.line_no
    loop
      v_ln := v_ln + 1;
      insert into journal_lines (journal_id, line_number, account_id, description, debit, credit)
      values (v_j, v_ln, p_expense_account_id,
              'Charge on ' || coalesce(l.counterparty, 'transaction')
                           || coalesce(' (ref ' || l.txn_ref || ')', ''),
              l.printed_charge, 0);

      update bank_statement_lines
         set status = 'charge_posted', charge_journal_id = v_j
       where id = l.id;
    end loop;

    v_ln := v_ln + 1;
    insert into journal_lines (journal_id, line_number, account_id, description, debit, credit)
    values (v_j, v_ln, v_credit_account,
            'Bank charges ' || to_char(d.entry_date, 'DD/MM/YYYY'), 0, d.total);

    -- accounts.balance is an application-maintained cache (no trigger exists),
    -- so it is updated here inside the same transaction
    update accounts set balance = coalesce(balance, 0) + d.total
     where id = p_expense_account_id;
    update accounts set balance = coalesce(balance, 0) - d.total
     where id = v_credit_account;

    journal_id   := v_j;
    posting_date := d.entry_date;
    lines_posted := d.n;
    amount       := d.total;
    return next;
  end loop;

  update bank_statement_imports
     set status = case
                    when exists (select 1 from bank_statement_lines
                                  where import_id = p_import_id
                                    and status = 'charge_pending')
                    then 'reviewed' else 'posted'
                  end
   where id = p_import_id;

  return;
end;
$$;

comment on function post_statement_charges is
  'Posts approved, actually-borne statement service charges to an expense account. Refuses dates before ledger_cutover_date().';

commit;
