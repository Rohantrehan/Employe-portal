-- =====================================================================
-- 0026  Leave that follows the employment contract
--
--  * contracts         one row per contract term. Issued contract letters
--                      add one automatically; contracts signed on paper
--                      (people who already work here) are recorded by HR.
--  * leave_types.contract_quota
--                      null = the type works per calendar year (as before);
--                      a number = every contract gets that many days
--                      (Paid Leave: 12, whatever the contract length).
--  * Renewal           all unused days of the previous contract carry
--                      over, even after a gap. Carry stays in sync when the
--                      old contract's leave changes later.
--  * Contract ends     no renewal = the days lapse. Leave of a contract
--                      type can only be taken on dates a contract covers.
--  * HR can set "leave left" on any contract (used for people who were
--                      already here, whose earlier leave was on paper).
--  * People without any contract keep the yearly balances.
-- =====================================================================

-- ---------- Leave types: per-contract quota --------------------------------
alter table public.leave_types add column if not exists contract_quota numeric(5,1)
  check (contract_quota is null or contract_quota between 0 and 365);
update public.leave_types set contract_quota = 12 where code = 'PL' and contract_quota is null;

-- ---------- Contracts --------------------------------------------------------
create table if not exists public.contracts (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  source      text not null check (source in ('letter', 'record')),
  letter_id   uuid unique references public.letters(id) on delete cascade,
  note        text check (note is null or length(note) <= 300),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on),
  check ((source = 'letter') = (letter_id is not null))
);
create index if not exists contracts_employee_idx   on public.contracts(employee_id, starts_on);
create index if not exists contracts_created_by_idx on public.contracts(created_by);

alter table public.contracts enable row level security;
drop policy if exists "read: own or admin" on public.contracts;
create policy "read: own or admin" on public.contracts for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_admin()));
-- no write policies: changes go through the functions below

-- ---------- Balances: a row is either a calendar year or a contract ---------
alter table public.leave_balances add column if not exists contract_id  uuid references public.contracts(id) on delete cascade;
alter table public.leave_balances add column if not exists carried_from uuid references public.leave_balances(id) on delete set null;
alter table public.leave_balances add column if not exists used_before  numeric(5,1) not null default 0 check (used_before >= 0);
alter table public.leave_balances add column if not exists set_by_hr    boolean not null default false;
alter table public.leave_balances alter column year drop not null;
alter table public.leave_balances drop constraint if exists leave_balances_period_check;
alter table public.leave_balances add constraint leave_balances_period_check check ((contract_id is null) = (year is not null));
alter table public.leave_balances drop constraint if exists leave_balances_employee_id_leave_type_id_year_key;
create unique index if not exists leave_balances_year_key     on public.leave_balances(employee_id, leave_type_id, year) where contract_id is null;
create unique index if not exists leave_balances_contract_key on public.leave_balances(contract_id, leave_type_id) where contract_id is not null;
create index if not exists leave_balances_carried_from_idx on public.leave_balances(carried_from);

-- Which balance a request draws from (null = untracked type)
alter table public.leave_requests add column if not exists balance_id uuid references public.leave_balances(id) on delete set null;
create index if not exists leave_requests_balance_idx on public.leave_requests(balance_id);
update public.leave_requests r set balance_id = b.id
  from public.leave_balances b
 where r.balance_id is null and b.employee_id = r.employee_id and b.leave_type_id = r.leave_type_id
   and b.contract_id is null and b.year = extract(year from r.start_date)::int;

-- ---------- Yearly helpers now name the partial unique index ----------------
create or replace function public._ensure_leave_year(p_year int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.leave_policies (leave_type_id, year, default_quota)
  select lt.id, p_year,
         coalesce((select lp.default_quota from public.leave_policies lp
                   where lp.leave_type_id = lt.id and lp.year < p_year
                   order by lp.year desc limit 1), 0)
  from public.leave_types lt
  where lt.is_active
  on conflict (leave_type_id, year) do nothing;

  insert into public.leave_balances (employee_id, leave_type_id, year, allotted)
  select p.id, lp.leave_type_id, p_year, lp.default_quota
  from public.profiles p
  cross join public.leave_policies lp
  join public.leave_types lt on lt.id = lp.leave_type_id
  where p.role = 'employee' and p.is_active and lp.year = p_year and lt.tracks_balance and lt.is_active
  on conflict (employee_id, leave_type_id, year) where contract_id is null do nothing;
end $$;
revoke execute on function public._ensure_leave_year(int) from public, anon, authenticated;

create or replace function public._init_leave_balances(p_employee uuid, p_year int)
returns void language sql security definer set search_path = '' as $$
  insert into public.leave_balances (employee_id, leave_type_id, year, allotted)
  select p_employee, lp.leave_type_id, p_year, lp.default_quota
  from public.leave_policies lp
  join public.leave_types lt on lt.id = lp.leave_type_id
  where lp.year = p_year and lt.tracks_balance and lt.is_active
  on conflict (employee_id, leave_type_id, year) where contract_id is null do nothing;
$$;
revoke execute on function public._init_leave_balances(uuid, int) from public, anon, authenticated;

-- ---------- Carry stays in sync ---------------------------------------------
-- When what's left on a contract changes, the next contract's carried days follow.
create or replace function public.leave_balances_carry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_left numeric := greatest(0, new.allotted + new.carried - new.used - new.pending);
begin
  update public.leave_balances n
     set carried = v_left
   where n.carried_from = new.id and not n.set_by_hr and n.carried is distinct from v_left;
  return null;
end $$;
revoke execute on function public.leave_balances_carry() from public, anon, authenticated;
drop trigger if exists leave_balances_carry on public.leave_balances;
create trigger leave_balances_carry
  after update of allotted, carried, used, pending on public.leave_balances
  for each row when (new.contract_id is not null)
  execute function public.leave_balances_carry();

-- Make every contract of one person have its balances, linked in date order.
create or replace function public._contract_leave_sync(p_employee uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t      record;
  c      record;
  v_prev uuid;
  v_id   uuid;
  v_left numeric;
begin
  for t in select id, contract_quota from public.leave_types where tracks_balance and is_active and contract_quota is not null loop
    v_prev := null;
    for c in select id from public.contracts where employee_id = p_employee order by starts_on loop
      insert into public.leave_balances (employee_id, leave_type_id, year, contract_id, allotted)
      values (p_employee, t.id, null, c.id, t.contract_quota)
      on conflict (contract_id, leave_type_id) where contract_id is not null do nothing;
      select id into v_id from public.leave_balances where contract_id = c.id and leave_type_id = t.id;

      if v_prev is null then
        v_left := 0;
      else
        select greatest(0, allotted + carried - used - pending) into v_left from public.leave_balances where id = v_prev;
      end if;
      update public.leave_balances
         set carried_from = v_prev, carried = v_left
       where id = v_id and not set_by_hr
         and (carried_from is distinct from v_prev or carried is distinct from v_left);
      v_prev := v_id;
    end loop;
  end loop;
end $$;
revoke execute on function public._contract_leave_sync(uuid) from public, anon, authenticated;

-- ---------- Add / remove a contract -----------------------------------------
create or replace function public._contract_overlap_check(p_employee uuid, p_from date, p_to date, p_ignore uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts
   where employee_id = p_employee and id is distinct from p_ignore
     and daterange(starts_on, ends_on, '[]') && daterange(p_from, p_to, '[]')
   order by starts_on limit 1;
  if found then
    raise exception 'This overlaps the contract from % to %. Change the dates first.',
      to_char(c.starts_on, 'DD Mon YYYY'), to_char(c.ends_on, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public._contract_overlap_check(uuid, date, date, uuid) from public, anon, authenticated;

create or replace function public._add_contract(p_employee uuid, p_from date, p_to date, p_source text, p_letter uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('contracts:' || p_employee::text));
  perform public._contract_overlap_check(p_employee, p_from, p_to, null);
  insert into public.contracts (employee_id, starts_on, ends_on, source, letter_id, note, created_by)
  values (p_employee, p_from, p_to, p_source, p_letter, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public._contract_leave_sync(p_employee);
  return v_id;
end $$;
revoke execute on function public._add_contract(uuid, date, date, text, uuid, text) from public, anon, authenticated;

create or replace function public._drop_contract(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_n   int;
begin
  select employee_id into v_emp from public.contracts where id = p_id;
  if not found then return; end if;
  select count(*) into v_n from public.leave_requests r
    join public.leave_balances b on b.id = r.balance_id
   where b.contract_id = p_id and r.status in ('pending', 'approved');
  if v_n > 0 then
    raise exception '% leave request(s) use this contract''s leave. Reject or revoke them first.', v_n using errcode = 'P0001';
  end if;
  delete from public.contracts where id = p_id;
  perform public._contract_leave_sync(v_emp);
end $$;
revoke execute on function public._drop_contract(uuid) from public, anon, authenticated;

-- Issued contract letters add a contract; cancelling the letter removes it.
create or replace function public.letters_contract_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'contract' then
    return null;
  end if;
  if old.status = 'draft' and new.status = 'issued' then
    perform public._add_contract(new.employee_id, new.date_from, new.date_to, 'letter', new.id, null);
  elsif old.status = 'issued' and new.status = 'cancelled' then
    perform public._drop_contract((select id from public.contracts where letter_id = new.id));
  end if;
  return null;
end $$;
revoke execute on function public.letters_contract_sync() from public, anon, authenticated;
drop trigger if exists letters_contract_sync on public.letters;
create trigger letters_contract_sync
  after update of status on public.letters
  for each row execute function public.letters_contract_sync();

-- Contracts issued before this migration
insert into public.contracts (employee_id, starts_on, ends_on, source, letter_id, created_by, created_at)
select l.employee_id, l.date_from, l.date_to, 'letter', l.id, l.issued_by, coalesce(l.issued_at, now())
  from public.letters l
 where l.kind = 'contract' and l.status = 'issued'
   and not exists (select 1 from public.contracts c where c.letter_id = l.id);
do $$
declare e uuid;
begin
  for e in select distinct employee_id from public.contracts loop
    perform public._contract_leave_sync(e);
  end loop;
end $$;

-- ---------- "Leave left" set by HR ---------------------------------------------
-- Makes what's left equal p_left: above the contract's own days it is carried
-- in, below it the difference counts as used before the portal.
-- p_left null = back to automatic (carry from the previous contract).
create or replace function public._set_leave_left(p_balance uuid, p_left numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b        public.leave_balances;
  v_portal numeric;
  v_base   numeric;
begin
  select * into b from public.leave_balances where id = p_balance for update;
  if not found or b.contract_id is null then
    raise exception 'Leave left can only be set on a contract.' using errcode = 'P0001';
  end if;
  v_portal := b.used - b.used_before;
  if p_left is null then
    update public.leave_balances set used = v_portal, used_before = 0, set_by_hr = false where id = p_balance;
    perform public._contract_leave_sync(b.employee_id);
    return;
  end if;
  if p_left < 0 or p_left > 365 or p_left * 2 <> floor(p_left * 2) then
    raise exception 'Use whole or half days, from 0 to 365.' using errcode = 'P0001';
  end if;
  v_base := b.allotted - v_portal - b.pending;
  update public.leave_balances
     set carried      = greatest(0, p_left - v_base),
         used_before  = greatest(0, v_base - p_left),
         used         = v_portal + greatest(0, v_base - p_left),
         carried_from = null,
         set_by_hr    = true
   where id = p_balance;
end $$;
revoke execute on function public._set_leave_left(uuid, numeric) from public, anon, authenticated;

-- ---------- Admin: record a contract signed on paper -----------------------------
-- p_id null = new. p_left = {"<leave type id>": days left, ...} (optional).
create or replace function public.record_contract(p_id uuid, p_employee uuid, p_from date, p_to date, p_note text, p_left jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c     public.contracts;
  v_id  uuid := p_id;
  v_key text;
  v_val jsonb;
  v_bal uuid;
  v_out date;
begin
  if not public.is_admin() then
    raise exception 'Only admins can record contracts.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null then
    raise exception 'Pick the start and end dates.' using errcode = 'P0001';
  elsif p_to < p_from then
    raise exception 'The end date is before the start date.' using errcode = 'P0001';
  elsif p_to - p_from > 1100 then
    raise exception 'A contract can be at most 3 years long.' using errcode = 'P0001';
  elsif length(trim(coalesce(p_note, ''))) > 300 then
    raise exception 'Keep the note under 300 characters.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_employee) then
    raise exception 'Employee not found.' using errcode = 'P0001';
  end if;

  if v_id is null then
    v_id := public._add_contract(p_employee, p_from, p_to, 'record', null, p_note);
  else
    select * into c from public.contracts where id = v_id and employee_id = p_employee for update;
    if not found then
      raise exception 'Contract not found.' using errcode = 'P0001';
    elsif c.source <> 'record' then
      raise exception 'This contract comes from a letter. Change it by cancelling the letter and issuing a new one.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtext('contracts:' || p_employee::text));
    perform public._contract_overlap_check(p_employee, p_from, p_to, v_id);
    select min(r.start_date) filter (where r.start_date < p_from or r.end_date > p_to) into v_out
      from public.leave_requests r join public.leave_balances b on b.id = r.balance_id
     where b.contract_id = v_id and r.status in ('pending', 'approved');
    if v_out is not null then
      raise exception 'There is leave on % that would fall outside the new dates.', to_char(v_out, 'DD Mon YYYY') using errcode = 'P0001';
    end if;
    update public.contracts set starts_on = p_from, ends_on = p_to, note = nullif(trim(coalesce(p_note, '')), '') where id = v_id;
    perform public._contract_leave_sync(p_employee);
  end if;

  if p_left is not null and jsonb_typeof(p_left) = 'object' then
    for v_key, v_val in select * from jsonb_each(p_left) loop
      continue when v_val is null or jsonb_typeof(v_val) = 'null';
      if jsonb_typeof(v_val) <> 'number' then
        raise exception 'Leave left must be a number.' using errcode = 'P0001';
      end if;
      select b.id into v_bal from public.leave_balances b
       where b.contract_id = v_id and b.leave_type_id::text = v_key;
      if v_bal is not null then
        perform public._set_leave_left(v_bal, (v_val #>> '{}')::numeric);
      end if;
    end loop;
  end if;

  perform public.log_action(case when p_id is null then 'contract.record' else 'contract.update' end, 'contract', v_id::text,
    jsonb_build_object('employee', p_employee, 'from', p_from, 'to', p_to, 'left', p_left));
  return v_id;
end $$;
revoke execute on function public.record_contract(uuid, uuid, date, date, text, jsonb) from public, anon;
grant  execute on function public.record_contract(uuid, uuid, date, date, text, jsonb) to authenticated;

create or replace function public.remove_contract(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove contracts.' using errcode = '42501';
  end if;
  select * into c from public.contracts where id = p_id;
  if not found then
    raise exception 'Contract not found.' using errcode = 'P0001';
  elsif c.source <> 'record' then
    raise exception 'This contract comes from a letter. Cancel the letter instead.' using errcode = 'P0001';
  end if;
  perform public._drop_contract(p_id);
  perform public.log_action('contract.remove', 'contract', p_id::text,
    jsonb_build_object('employee', c.employee_id, 'from', c.starts_on, 'to', c.ends_on));
end $$;
revoke execute on function public.remove_contract(uuid) from public, anon;
grant  execute on function public.remove_contract(uuid) to authenticated;

create or replace function public.set_leave_left(p_balance uuid, p_left numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change leave.' using errcode = '42501';
  end if;
  select employee_id into v_emp from public.leave_balances where id = p_balance;
  perform public._set_leave_left(p_balance, p_left);
  perform public.log_action('leave.left', 'leave_balance', p_balance::text, jsonb_build_object('employee', v_emp, 'left', p_left));
end $$;
revoke execute on function public.set_leave_left(uuid, numeric) from public, anon;
grant  execute on function public.set_leave_left(uuid, numeric) to authenticated;

-- ---------- Admin: per contract or per year for a leave type ---------------------
-- Changing the number updates contracts that haven't ended (except ones HR set by hand).
create or replace function public.set_contract_quota(p_type uuid, p_quota numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare e uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change leave rules.' using errcode = '42501';
  end if;
  if p_quota is not null and (p_quota < 0 or p_quota > 365 or p_quota * 2 <> floor(p_quota * 2)) then
    raise exception 'Use whole or half days, from 0 to 365.' using errcode = 'P0001';
  end if;
  update public.leave_types set contract_quota = p_quota where id = p_type and tracks_balance;
  if not found then
    raise exception 'Only leave types with a limit can follow the contract.' using errcode = 'P0001';
  end if;
  if p_quota is not null then
    update public.leave_balances b set allotted = p_quota
      from public.contracts c
     where b.contract_id = c.id and b.leave_type_id = p_type and not b.set_by_hr
       and c.ends_on >= public.local_today() and b.allotted is distinct from p_quota;
    for e in select distinct employee_id from public.contracts loop
      perform public._contract_leave_sync(e);
    end loop;
  end if;
  perform public.log_action('leave_type.contract_quota', 'leave_type', p_type::text, jsonb_build_object('quota', p_quota));
end $$;
revoke execute on function public.set_contract_quota(uuid, numeric) from public, anon;
grant  execute on function public.set_contract_quota(uuid, numeric) to authenticated;

-- ---------- Which balance a leave draws from -------------------------------------
-- Raises a friendly error when the dates don't fit. Returns null for types
-- without a limit (and when a yearly row doesn't exist yet).
create or replace function public._leave_bucket(p_employee uuid, p_type uuid, p_start date, p_end date)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  t    public.leave_types;
  c    public.contracts;
  v_id uuid;
begin
  select * into t from public.leave_types where id = p_type;
  if t.tracks_balance and t.contract_quota is not null
     and exists (select 1 from public.contracts where employee_id = p_employee) then
    select * into c from public.contracts
     where employee_id = p_employee and p_start between starts_on and ends_on;
    if not found then
      raise exception '% comes with your contract, and no contract covers %. Ask HR about your renewal.',
        t.name, to_char(p_start, 'DD Mon YYYY') using errcode = 'P0001';
    end if;
    if p_end > c.ends_on then
      raise exception 'Your contract ends on %. Apply up to that date; % after it comes with the renewal.',
        to_char(c.ends_on, 'DD Mon YYYY'), t.name using errcode = 'P0001';
    end if;
    select id into v_id from public.leave_balances where contract_id = c.id and leave_type_id = p_type;
    return v_id;
  end if;

  if extract(year from p_start) <> extract(year from p_end) then
    raise exception 'Leave can''t cross into the next year. Split it into two requests.' using errcode = 'P0001';
  end if;
  if not t.tracks_balance then
    return null;
  end if;
  select id into v_id from public.leave_balances
   where employee_id = p_employee and leave_type_id = p_type and contract_id is null and year = extract(year from p_start)::int;
  return v_id;
end $$;
revoke execute on function public._leave_bucket(uuid, uuid, date, date) from public, anon, authenticated;

-- ---------- Validation: the year rule moves into _leave_bucket -------------------
create or replace function public._validate_leave(
  p_employee uuid, p_type uuid, p_start date, p_end date, p_part public.day_part, p_ignore uuid default null
) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_type public.leave_types;
  v_days numeric;
begin
  select * into v_type from public.leave_types where id = p_type;
  if not found or not v_type.is_active then
    raise exception 'Pick a leave type.';
  end if;
  if p_start is null or p_end is null then
    raise exception 'Pick the dates.';
  elsif p_end < p_start then
    raise exception 'The end date is before the start date.';
  elsif p_part <> 'full' and p_start <> p_end then
    raise exception 'A half day must be a single date.';
  elsif p_end - p_start > 62 then
    raise exception 'Apply for at most two months at a time.';
  elsif p_start < make_date(extract(year from public.local_today())::int - 1, 12, 1) then
    raise exception 'That date is too far in the past.';
  end if;

  perform public._leave_bucket(p_employee, p_type, p_start, p_end);

  if exists (
    select 1 from public.leave_requests lr
    where lr.employee_id = p_employee
      and lr.status in ('pending', 'approved')
      and lr.id is distinct from p_ignore
      and lr.start_date <= p_end and lr.end_date >= p_start
      and not (p_part <> 'full' and lr.day_part <> 'full' and lr.day_part <> p_part and lr.start_date = p_start)
  ) then
    raise exception 'You already have leave on some of these dates.';
  end if;

  if p_part = 'full' and exists (
    select 1 from public.attendance a
    where a.employee_id = p_employee and a.work_date between p_start and p_end
  ) then
    raise exception 'You have attendance on some of these dates. Pick days you didn''t work.';
  end if;

  select coalesce(sum(counted), 0) into v_days from public._leave_breakdown(p_employee, p_start, p_end, p_part);
  if v_days = 0 then
    raise exception 'These dates are all Sundays or holidays. No leave is needed.';
  end if;
  return v_days;
end $$;
revoke execute on function public._validate_leave(uuid, uuid, date, date, public.day_part, uuid) from public, anon, authenticated;

-- ---------- Preview --------------------------------------------------------------
create or replace function public.leave_preview(p_type uuid, p_start date, p_end date, p_part public.day_part)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_tracks   boolean;
  v_days     numeric := 0;
  v_avail    numeric;
  v_bal      uuid;
  v_excluded jsonb;
  v_error    text;
begin
  if v_uid is null then raise exception 'Please log in again.' using errcode = '42501'; end if;

  begin
    v_days := public._validate_leave(v_uid, p_type, p_start, p_end, p_part);
  exception when others then
    v_error := sqlerrm;
  end;

  select tracks_balance into v_tracks from public.leave_types where id = p_type;
  if v_tracks and p_start is not null then
    begin
      v_bal := public._leave_bucket(v_uid, p_type, p_start, coalesce(p_end, p_start));
    exception when others then
      v_bal := null;
    end;
    if v_bal is not null then
      select allotted + carried - used - pending into v_avail from public.leave_balances where id = v_bal;
    elsif v_error is null then
      v_avail := coalesce((select default_quota from public.leave_policies
                           where leave_type_id = p_type and year = extract(year from p_start)::int), 0);
    end if;
  end if;

  if p_start is not null and p_end is not null and p_end >= p_start and p_end - p_start <= 62 then
    select coalesce(jsonb_agg(jsonb_build_object('date', day, 'label', coalesce(label, 'Not a working day')) order by day), '[]')
    into v_excluded
    from public._leave_breakdown(v_uid, p_start, p_end, p_part) where counted = 0;
  end if;

  if v_error is null and v_tracks and v_days > coalesce(v_avail, 0) then
    v_error := format('Not enough balance: you have %s day(s) left.', coalesce(v_avail, 0));
  end if;

  return jsonb_build_object(
    'days', v_days,
    'tracks_balance', coalesce(v_tracks, false),
    'available', v_avail,
    'excluded', coalesce(v_excluded, '[]'::jsonb),
    'error', v_error
  );
end $$;
revoke execute on function public.leave_preview(uuid, date, date, public.day_part) from public, anon;
grant  execute on function public.leave_preview(uuid, date, date, public.day_part) to authenticated;

-- ---------- Apply ------------------------------------------------------------------
create or replace function public.apply_leave(
  p_type uuid, p_start date, p_end date, p_part public.day_part, p_reason text, p_attachment text default null
) returns public.leave_requests
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_type   public.leave_types;
  v_days   numeric;
  v_bal    public.leave_balances;
  v_bal_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_att    text := nullif(trim(coalesce(p_attachment, '')), '');
  v_row    public.leave_requests;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Write a short reason.';
  elsif length(v_reason) > 1000 then
    raise exception 'Keep the reason under 1000 characters.';
  end if;

  v_days := public._validate_leave(v_uid, p_type, p_start, p_end, p_part);
  select * into v_type from public.leave_types where id = p_type;

  if v_type.requires_attachment and v_att is null then
    raise exception '% needs a supporting document. Attach it and try again.', v_type.name;
  end if;
  if v_att is not null and v_att not like v_uid::text || '/%' then
    raise exception 'Invalid attachment.';
  end if;

  if v_type.tracks_balance then
    perform public._ensure_leave_year(extract(year from p_start)::int);
    perform public._contract_leave_sync(v_uid);
    v_bal_id := public._leave_bucket(v_uid, p_type, p_start, p_end);
    select * into v_bal from public.leave_balances where id = v_bal_id for update;
    if not found then
      raise exception 'No % balance is set up for you. Ask HR.', v_type.name;
    end if;
    if v_days > v_bal.allotted + v_bal.carried - v_bal.used - v_bal.pending then
      raise exception 'Not enough % balance: you asked for % day(s) but have % left.',
        v_type.name, v_days, v_bal.allotted + v_bal.carried - v_bal.used - v_bal.pending;
    end if;
    update public.leave_balances set pending = pending + v_days where id = v_bal.id;
  end if;

  insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, day_part, days, reason, attachment_path, balance_id)
  values (v_uid, p_type, p_start, p_end, p_part, v_days, v_reason, v_att, v_bal_id)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.apply_leave(uuid, date, date, public.day_part, text, text) from public, anon;
grant  execute on function public.apply_leave(uuid, date, date, public.day_part, text, text) to authenticated;

-- ---------- Bookkeeping uses the request's own balance -----------------------------
create or replace function public._leave_balance_shift(p_req public.leave_requests, p_pending numeric, p_used numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_req.balance_id is not null then
    update public.leave_balances b
       set pending = greatest(0, b.pending + p_pending),
           used    = greatest(b.used_before, b.used + p_used)
     where b.id = p_req.balance_id;
    return;
  end if;
  update public.leave_balances b
  set pending = greatest(0, b.pending + p_pending),
      used    = greatest(0, b.used + p_used)
  from public.leave_types lt
  where lt.id = p_req.leave_type_id and lt.tracks_balance
    and b.employee_id = p_req.employee_id and b.leave_type_id = p_req.leave_type_id
    and b.contract_id is null and b.year = extract(year from p_req.start_date)::int;
end $$;
revoke execute on function public._leave_balance_shift(public.leave_requests, numeric, numeric) from public, anon, authenticated;

-- ---------- Balances as of a date (pages read this) ---------------------------------
-- Per person and limited leave type: the contract that covers the date (else the
-- next one, else the last one) for contract types, otherwise the calendar year.
-- Employees can read their own; admins anyone (p_employee null = all active).
create or replace function public.leave_balances_on(p_on date, p_employee uuid default null)
returns table (
  employee_id uuid, leave_type_id uuid, balance_id uuid,
  allotted numeric, carried numeric, used numeric, pending numeric, used_before numeric, set_by_hr boolean,
  contract_id uuid, starts_on date, ends_on date, state text, carried_from_end date
)
language sql stable security definer set search_path = '' as $$
  with me as (select public.is_admin() as adm, auth.uid() as uid),
  emps as (
    select p.id from public.profiles p, me
     where (p_employee is null and me.adm and p.is_active)
        or (p.id = p_employee and (me.adm or p_employee = me.uid))
  )
  select e.id, t.id, b.id,
         b.allotted, b.carried, b.used, b.pending, b.used_before, b.set_by_hr,
         k.id, k.starts_on, k.ends_on,
         case when k.id is null then 'year'
              when p_on < k.starts_on then 'upcoming'
              when p_on > k.ends_on then 'ended'
              else 'current' end,
         pk.ends_on
    from emps e
    cross join public.leave_types t
    left join lateral (
      select c.id, c.starts_on, c.ends_on from public.contracts c
       where t.contract_quota is not null and c.employee_id = e.id
       order by case when p_on between c.starts_on and c.ends_on then 0 when c.starts_on > p_on then 1 else 2 end,
                case when c.starts_on > p_on then c.starts_on end,
                c.ends_on desc
       limit 1
    ) k on true
    left join public.leave_balances b on b.leave_type_id = t.id and (
         (k.id is not null and b.contract_id = k.id)
      or (k.id is null and b.employee_id = e.id and b.contract_id is null and b.year = extract(year from p_on)::int))
    left join public.leave_balances pb on pb.id = b.carried_from
    left join public.contracts pk on pk.id = pb.contract_id
   where t.tracks_balance and t.is_active
$$;
revoke execute on function public.leave_balances_on(date, uuid) from public, anon;
grant  execute on function public.leave_balances_on(date, uuid) to authenticated;
