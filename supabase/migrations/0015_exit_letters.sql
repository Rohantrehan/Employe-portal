-- =====================================================================
-- 0015  Employee exit, experience / relieving letters, signatures
--  * employee_exits      admin-only exit details (last day, reason, conduct)
--  * profiles.left_on    last working day; after it the person is a
--                        "former employee" (documents-only login)
--  * letter_signatures   versioned signer + signature + seal images; every
--                        letter keeps the version it was issued with
--  * letters             draft -> issued -> cancelled, frozen snapshot text,
--                        reference number and a QR verification code
--  * letter_events       download / view / QR-check log
-- =====================================================================

do $$ begin
  create type public.exit_reason as enum ('resigned', 'contract_ended', 'terminated', 'other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.letter_kind as enum ('experience', 'relieving');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.letter_status as enum ('draft', 'issued', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------- Profile flags (own row is readable, only admins write) ------
alter table public.profiles add column if not exists left_on date;
alter table public.profiles add column if not exists former_access boolean not null default true;

-- An employee past their last working day is no longer an "active user",
-- even before the nightly job flips is_active.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and (left_on is null or left_on >= public.local_today())
  );
$$;

-- ---------- Exit details ------------------------------------------------
create table if not exists public.employee_exits (
  employee_id     uuid primary key references public.profiles(id) on delete cascade,
  last_day        date not null,
  reason          public.exit_reason not null,
  conduct         text not null default 'good' check (conduct in ('excellent', 'good', 'satisfactory')),
  letters_allowed boolean not null default true,   -- experience letter allowed
  note            text check (note is null or length(note) <= 1000),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists employee_exits_created_by_idx on public.employee_exits(created_by);
drop trigger if exists employee_exits_updated_at on public.employee_exits;
create trigger employee_exits_updated_at before update on public.employee_exits
  for each row execute function public.set_updated_at();

alter table public.employee_exits enable row level security;
drop policy if exists "read: admin" on public.employee_exits;
create policy "read: admin" on public.employee_exits for select to authenticated using ((select public.is_admin()));

-- ---------- Signatures (versioned, never overwritten) -------------------
create table if not exists public.letter_signatures (
  id             uuid primary key default gen_random_uuid(),
  signer_name    text not null check (length(trim(signer_name)) between 2 and 80),
  signer_title   text not null check (length(trim(signer_title)) between 2 and 80),
  signature_path text not null,
  seal_path      text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  retired_at     timestamptz
);
create unique index if not exists letter_signatures_one_current on public.letter_signatures((retired_at is null)) where retired_at is null;
create index if not exists letter_signatures_created_by_idx on public.letter_signatures(created_by);

alter table public.letter_signatures enable row level security;
drop policy if exists "read: admin" on public.letter_signatures;
create policy "read: admin" on public.letter_signatures for select to authenticated using ((select public.is_admin()));

-- ---------- Letter wording (company settings) ---------------------------
alter table public.settings add column if not exists letter_prefix text not null default 'RT'
  check (letter_prefix ~ '^[A-Z]{2,6}$');
alter table public.settings add column if not exists letter_experience_template text not null default
$t$This is to certify that {name} (Employee Code {emp_code}) worked with {company} as {designation} from {from} to {to}, a period of {duration}.

During {their} time with us, {their} conduct was {conduct}. {Their} work was sincere and dependable, and {their} contribution to the team was valued.

We wish {them} every success in {their} future career.$t$;
alter table public.settings add column if not exists letter_relieving_template text not null default
$t$This is to confirm that {name} (Employee Code {emp_code}), {designation}, is relieved from {their} duties at {company} with effect from the close of business on {to}.

{Their} employment with us was from {from} to {to}. We thank {them} for {their} contribution and wish {them} the very best for the future.$t$;

-- ---------- Letters -------------------------------------------------------
create table if not exists public.letters (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  kind          public.letter_kind not null,
  status        public.letter_status not null default 'draft',
  ref_no        text unique,
  verify_code   text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- frozen snapshot: what the letter says never changes after issue
  full_name     text not null,
  emp_code      text not null,
  designation   text not null check (length(trim(designation)) between 1 and 120),
  department    text,
  company_name  text not null,
  date_from     date not null,
  date_to       date not null,
  conduct       text check (conduct is null or conduct in ('excellent', 'good', 'satisfactory')),
  pronoun       text not null default 'they' check (pronoun in ('he', 'she', 'they')),
  body          text not null check (length(trim(body)) between 20 and 5000),
  issue_date    date,
  signature_id  uuid references public.letter_signatures(id),
  issued_by     uuid references public.profiles(id) on delete set null,
  issued_at     timestamptz,
  cancelled_by  uuid references public.profiles(id) on delete set null,
  cancelled_at  timestamptz,
  cancel_reason text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (date_to >= date_from),
  check (status = 'draft' or (ref_no is not null and issue_date is not null and signature_id is not null))
);
-- one live (draft or issued) letter of each kind per employee
create unique index if not exists letters_one_live on public.letters(employee_id, kind) where status <> 'cancelled';
create index if not exists letters_employee_idx     on public.letters(employee_id);
create index if not exists letters_signature_idx    on public.letters(signature_id);
create index if not exists letters_issued_by_idx    on public.letters(issued_by);
create index if not exists letters_cancelled_by_idx on public.letters(cancelled_by);
create index if not exists letters_created_by_idx   on public.letters(created_by);
drop trigger if exists letters_updated_at on public.letters;
create trigger letters_updated_at before update on public.letters
  for each row execute function public.set_updated_at();

alter table public.letters enable row level security;
drop policy if exists "read: own issued or admin" on public.letters;
create policy "read: own issued or admin" on public.letters for select to authenticated
  using ((select public.is_admin()) or (employee_id = (select auth.uid()) and status <> 'draft'));
-- no write policies: all changes go through the functions below

-- ---------- Download / QR-check log ---------------------------------------
create table if not exists public.letter_events (
  id         bigint generated always as identity primary key,
  letter_id  uuid not null references public.letters(id) on delete cascade,
  event      text not null check (event in ('download', 'view', 'verify')),
  actor_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists letter_events_letter_idx on public.letter_events(letter_id, created_at desc);
create index if not exists letter_events_actor_idx  on public.letter_events(actor_id);

alter table public.letter_events enable row level security;
drop policy if exists "read: admin" on public.letter_events;
create policy "read: admin" on public.letter_events for select to authenticated using ((select public.is_admin()));

-- ---------- Storage: signature / seal images (admin only) ------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('letter-assets', 'letter-assets', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "letter assets: admin read" on storage.objects;
create policy "letter assets: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'letter-assets' and (select public.is_admin()));
drop policy if exists "letter assets: admin upload" on storage.objects;
create policy "letter assets: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'letter-assets' and (select public.is_admin()));

-- =====================================================================
-- Exit
-- =====================================================================

-- Flip is_active once the last working day has passed (nightly + lazily).
create or replace function public.process_exits()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.profiles set is_active = false
  where is_active and left_on is not null and left_on < public.local_today();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.process_exits() from public, anon, authenticated;

-- close_missed_clock_outs runs on every clock-in and when the admin opens Today:
-- piggy-back the exit check on it.
create or replace function public.close_missed_clock_outs()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.attendance set clock_out = null
  where clock_out is null and work_date < public.local_today() and status <> 'missed_clock_out';
  get diagnostics v_count = row_count;
  perform public.process_exits();
  return v_count;
end $$;

create or replace function public.record_exit(
  p_employee uuid,
  p_last_day date,
  p_reason   public.exit_reason,
  p_conduct  text,
  p_letters  boolean,
  p_access   boolean,
  p_note     text
)
returns public.employee_exits
language plpgsql security definer set search_path = '' as $$
declare
  v_p    public.profiles;
  v_old  public.employee_exits;
  r      public.employee_exits;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can record an exit.' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = p_employee;
  if not found then
    raise exception 'Employee not found.' using errcode = 'P0001';
  end if;
  if v_p.role <> 'employee' then
    raise exception 'Only employees can be marked as left. Change the role to Employee first.' using errcode = 'P0001';
  end if;
  if p_last_day is null then
    raise exception 'Pick the last working day.' using errcode = 'P0001';
  end if;
  if v_p.date_of_joining is not null and p_last_day < v_p.date_of_joining then
    raise exception 'The last working day can''t be before the joining date (%).', to_char(v_p.date_of_joining, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  if p_last_day > public.local_today() + 365 then
    raise exception 'The last working day must be within the next year.' using errcode = 'P0001';
  end if;
  if p_reason is null then
    raise exception 'Pick a reason for leaving.' using errcode = 'P0001';
  end if;
  if coalesce(p_conduct, '') not in ('excellent', 'good', 'satisfactory') then
    raise exception 'Pick how their conduct was.' using errcode = 'P0001';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'The note is too long (1000 characters max).' using errcode = 'P0001';
  end if;

  select * into v_old from public.employee_exits where employee_id = p_employee;
  if found and v_old.last_day <> p_last_day
     and exists (select 1 from public.letters where employee_id = p_employee and status = 'issued') then
    raise exception 'Letters were already issued with the old last day. Cancel them before changing it.' using errcode = 'P0001';
  end if;
  if not coalesce(p_letters, true)
     and exists (select 1 from public.letters where employee_id = p_employee and kind = 'experience' and status = 'issued') then
    raise exception 'An experience letter is already issued. Cancel it before turning letters off.' using errcode = 'P0001';
  end if;

  insert into public.employee_exits (employee_id, last_day, reason, conduct, letters_allowed, note, created_by)
  values (p_employee, p_last_day, p_reason, p_conduct, coalesce(p_letters, true), v_note, auth.uid())
  on conflict (employee_id) do update
    set last_day = excluded.last_day, reason = excluded.reason, conduct = excluded.conduct,
        letters_allowed = excluded.letters_allowed, note = excluded.note
  returning * into r;

  update public.profiles
     set left_on = p_last_day,
         former_access = coalesce(p_access, true),
         is_active = p_last_day >= public.local_today()
   where id = p_employee;

  perform public.log_action(case when v_old.employee_id is null then 'exit.record' else 'exit.update' end, 'profile', p_employee::text, to_jsonb(r));
  return r;
end $$;
revoke execute on function public.record_exit(uuid, date, public.exit_reason, text, boolean, boolean, text) from public, anon;
grant  execute on function public.record_exit(uuid, date, public.exit_reason, text, boolean, boolean, text) to authenticated;

-- Re-hire / mistake: remove the exit. Not allowed while letters are issued.
create or replace function public.undo_exit(p_employee uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employee_exits where employee_id = p_employee) then
    raise exception 'No exit recorded for this employee.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.letters where employee_id = p_employee and status = 'issued') then
    raise exception 'Cancel the issued letters first.' using errcode = 'P0001';
  end if;
  delete from public.letters where employee_id = p_employee and status = 'draft';
  delete from public.employee_exits where employee_id = p_employee;
  update public.profiles set left_on = null, former_access = true, is_active = true where id = p_employee;
  perform public.log_action('exit.undo', 'profile', p_employee::text, null);
end $$;
revoke execute on function public.undo_exit(uuid) from public, anon;
grant  execute on function public.undo_exit(uuid) to authenticated;

create or replace function public.set_former_access(p_employee uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;
  update public.profiles set former_access = coalesce(p_on, false)
  where id = p_employee and left_on is not null;
  if not found then
    raise exception 'No exit recorded for this employee.' using errcode = 'P0001';
  end if;
  perform public.log_action('exit.access', 'profile', p_employee::text, jsonb_build_object('on', p_on));
end $$;
revoke execute on function public.set_former_access(uuid, boolean) from public, anon;
grant  execute on function public.set_former_access(uuid, boolean) to authenticated;

-- =====================================================================
-- Letters
-- =====================================================================

create or replace function public.save_letter(
  p_id          uuid,
  p_employee    uuid,
  p_kind        public.letter_kind,
  p_designation text,
  p_department  text,
  p_from        date,
  p_to          date,
  p_conduct     text,
  p_pronoun     text,
  p_body        text
)
returns public.letters
language plpgsql security definer set search_path = '' as $$
declare
  v_exit public.employee_exits;
  v_p    public.profiles;
  v_co   text;
  r      public.letters;
begin
  if not public.is_admin() then
    raise exception 'Only admins can prepare letters.' using errcode = '42501';
  end if;
  select * into v_exit from public.employee_exits where employee_id = p_employee;
  if not found then
    raise exception 'Record the employee''s exit first.' using errcode = 'P0001';
  end if;
  if p_kind = 'experience' and not v_exit.letters_allowed then
    raise exception 'The experience letter is turned off for this employee. Change it in the exit details.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_designation, ''))) not between 1 and 120 then
    raise exception 'Enter the designation.' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'The "to" date must be on or after the "from" date.' using errcode = 'P0001';
  end if;
  if p_to > v_exit.last_day then
    raise exception 'The "to" date can''t be after the last working day (%).', to_char(v_exit.last_day, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  if coalesce(p_pronoun, '') not in ('he', 'she', 'they') then
    raise exception 'Pick how to refer to them.' using errcode = 'P0001';
  end if;
  if p_kind = 'experience' and coalesce(p_conduct, '') not in ('excellent', 'good', 'satisfactory') then
    raise exception 'Pick how their conduct was.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_body, ''))) not between 20 and 5000 then
    raise exception 'The letter text must be 20 to 5000 characters.' using errcode = 'P0001';
  end if;

  select * into v_p from public.profiles where id = p_employee;
  select company_name into v_co from public.settings where id = 1;

  if p_id is null then
    if exists (select 1 from public.letters where employee_id = p_employee and kind = p_kind and status <> 'cancelled') then
      raise exception 'There is already a % letter for this employee. Cancel it to make a new one.', p_kind using errcode = 'P0001';
    end if;
    insert into public.letters (employee_id, kind, full_name, emp_code, designation, department, company_name,
                                date_from, date_to, conduct, pronoun, body, created_by)
    values (p_employee, p_kind, v_p.full_name, v_p.emp_code, trim(p_designation), nullif(trim(coalesce(p_department, '')), ''), v_co,
            p_from, p_to, case when p_kind = 'experience' then p_conduct end, p_pronoun, trim(p_body), auth.uid())
    returning * into r;
  else
    update public.letters
       set full_name = v_p.full_name, emp_code = v_p.emp_code, designation = trim(p_designation),
           department = nullif(trim(coalesce(p_department, '')), ''), company_name = v_co,
           date_from = p_from, date_to = p_to, conduct = case when kind = 'experience' then p_conduct end,
           pronoun = p_pronoun, body = trim(p_body)
     where id = p_id and employee_id = p_employee and kind = p_kind and status = 'draft'
    returning * into r;
    if not found then
      raise exception 'Only draft letters can be edited.' using errcode = 'P0001';
    end if;
  end if;

  perform public.log_action('letter.save', 'letter', r.id::text, jsonb_build_object('kind', r.kind, 'employee', p_employee));
  return r;
end $$;
revoke execute on function public.save_letter(uuid, uuid, public.letter_kind, text, text, date, date, text, text, text) from public, anon;
grant  execute on function public.save_letter(uuid, uuid, public.letter_kind, text, text, date, date, text, text, text) to authenticated;

create or replace function public.delete_letter(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;
  delete from public.letters where id = p_id and status = 'draft';
  if not found then
    raise exception 'Only drafts can be deleted. Cancel an issued letter instead.' using errcode = 'P0001';
  end if;
  perform public.log_action('letter.delete', 'letter', p_id::text, null);
end $$;
revoke execute on function public.delete_letter(uuid) from public, anon;
grant  execute on function public.delete_letter(uuid) to authenticated;

create or replace function public.issue_letter(p_id uuid)
returns public.letters
language plpgsql security definer set search_path = '' as $$
declare
  r      public.letters;
  v_exit public.employee_exits;
  v_sig  uuid;
  v_pre  text;
  v_year int := extract(year from public.local_today())::int;
  v_n    int;
  v_name text;
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can issue letters.' using errcode = '42501';
  end if;
  select * into r from public.letters where id = p_id for update;
  if not found then
    raise exception 'Letter not found.' using errcode = 'P0001';
  end if;
  if r.status <> 'draft' then
    raise exception 'This letter is already %.', r.status using errcode = 'P0001';
  end if;
  select * into v_exit from public.employee_exits where employee_id = r.employee_id;
  if not found then
    raise exception 'Record the employee''s exit first.' using errcode = 'P0001';
  end if;
  if public.local_today() < v_exit.last_day then
    raise exception 'Letters can be issued from their last working day (%).', to_char(v_exit.last_day, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  if r.kind = 'experience' and not v_exit.letters_allowed then
    raise exception 'The experience letter is turned off for this employee.' using errcode = 'P0001';
  end if;
  select id into v_sig from public.letter_signatures where retired_at is null;
  if v_sig is null then
    raise exception 'Add a signature first (Settings → Letters & signature).' using errcode = 'P0001';
  end if;

  -- numbers are never reused, cancelled letters keep theirs
  perform pg_advisory_xact_lock(hashtext('letters.ref_no'));
  select letter_prefix into v_pre from public.settings where id = 1;
  select count(*) + 1 into v_n from public.letters
   where kind = r.kind and ref_no is not null and extract(year from issue_date) = v_year;
  select full_name, emp_code into v_name, v_code from public.profiles where id = r.employee_id;

  update public.letters
     set status = 'issued',
         ref_no = format('%s/%s/%s/%s', coalesce(v_pre, 'RT'), case r.kind when 'experience' then 'EXP' else 'REL' end, v_year, lpad(v_n::text, 3, '0')),
         issue_date = public.local_today(),
         signature_id = v_sig,
         full_name = v_name,
         emp_code = v_code,
         issued_by = auth.uid(),
         issued_at = now()
   where id = p_id
  returning * into r;

  perform public.log_action('letter.issue', 'letter', r.id::text, jsonb_build_object('ref_no', r.ref_no, 'employee', r.employee_id));
  return r;
end $$;
revoke execute on function public.issue_letter(uuid) from public, anon;
grant  execute on function public.issue_letter(uuid) to authenticated;

create or replace function public.cancel_letter(p_id uuid, p_reason text)
returns public.letters
language plpgsql security definer set search_path = '' as $$
declare r public.letters;
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel letters.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Write a short reason (3 to 500 characters).' using errcode = 'P0001';
  end if;
  update public.letters
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(p_reason)
   where id = p_id and status = 'issued'
  returning * into r;
  if not found then
    raise exception 'Only issued letters can be cancelled.' using errcode = 'P0001';
  end if;
  perform public.log_action('letter.cancel', 'letter', r.id::text, jsonb_build_object('ref_no', r.ref_no, 'reason', r.cancel_reason));
  return r;
end $$;
revoke execute on function public.cancel_letter(uuid, text) from public, anon;
grant  execute on function public.cancel_letter(uuid, text) to authenticated;

-- Download log: admins for any non-draft letter, employees for their own issued ones.
create or replace function public.log_letter_event(p_letter uuid, p_event text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.letters;
begin
  if auth.uid() is null or coalesce(p_event, '') not in ('download', 'view') then
    return;
  end if;
  select * into r from public.letters where id = p_letter;
  if not found or r.status = 'draft' then
    return;
  end if;
  if not public.is_admin() and not (r.employee_id = auth.uid() and r.status = 'issued') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.letter_events (letter_id, event, actor_id) values (p_letter, p_event, auth.uid());
end $$;
revoke execute on function public.log_letter_event(uuid, text) from public, anon;
grant  execute on function public.log_letter_event(uuid, text) to authenticated;

-- Public QR check. Returns only what is printed on the letter; logs at most one check per minute.
create or replace function public.verify_letter(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.letters;
begin
  if coalesce(p_code, '') !~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  select * into r from public.letters where verify_code = p_code and status <> 'draft';
  if not found then
    return null;
  end if;
  if not exists (select 1 from public.letter_events where letter_id = r.id and event = 'verify' and created_at > now() - interval '1 minute') then
    insert into public.letter_events (letter_id, event) values (r.id, 'verify');
  end if;
  return jsonb_build_object(
    'status', r.status, 'kind', r.kind, 'ref_no', r.ref_no, 'name', r.full_name, 'emp_code', r.emp_code,
    'designation', r.designation, 'company', r.company_name, 'from', r.date_from, 'to', r.date_to,
    'issue_date', r.issue_date, 'cancelled_on', (r.cancelled_at at time zone public.company_tz())::date
  );
end $$;
revoke execute on function public.verify_letter(text) from public;
grant  execute on function public.verify_letter(text) to anon, authenticated;

-- =====================================================================
-- Signature + wording settings
-- =====================================================================

create or replace function public.save_signature(p_name text, p_title text, p_signature_path text, p_seal_path text)
returns public.letter_signatures
language plpgsql security definer set search_path = '' as $$
declare r public.letter_signatures;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the signature.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Enter the signer''s name.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 2 and 80 then
    raise exception 'Enter the signer''s title (for example Director).' using errcode = 'P0001';
  end if;
  if coalesce(p_signature_path, '') !~ '^signatures/[0-9a-f-]{36}\.(png|jpg)$'
     or not exists (select 1 from storage.objects where bucket_id = 'letter-assets' and name = p_signature_path) then
    raise exception 'Upload or draw a signature.' using errcode = 'P0001';
  end if;
  if p_seal_path is not null and (p_seal_path !~ '^seals/[0-9a-f-]{36}\.(png|jpg)$'
     or not exists (select 1 from storage.objects where bucket_id = 'letter-assets' and name = p_seal_path)) then
    raise exception 'The seal image is missing. Upload it again.' using errcode = 'P0001';
  end if;

  update public.letter_signatures set retired_at = now() where retired_at is null;
  insert into public.letter_signatures (signer_name, signer_title, signature_path, seal_path, created_by)
  values (trim(p_name), trim(p_title), p_signature_path, p_seal_path, auth.uid())
  returning * into r;

  perform public.log_action('signature.save', 'letter_signature', r.id::text, jsonb_build_object('signer', r.signer_name));
  return r;
end $$;
revoke execute on function public.save_signature(text, text, text, text) from public, anon;
grant  execute on function public.save_signature(text, text, text, text) to authenticated;

create or replace function public.save_letter_settings(p_prefix text, p_experience text, p_relieving text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change settings.' using errcode = '42501';
  end if;
  if coalesce(upper(trim(p_prefix)), '') !~ '^[A-Z]{2,6}$' then
    raise exception 'The reference prefix must be 2 to 6 letters (A–Z).' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_experience, ''))) not between 20 and 5000 or length(trim(coalesce(p_relieving, ''))) not between 20 and 5000 then
    raise exception 'Each letter text must be 20 to 5000 characters.' using errcode = 'P0001';
  end if;
  update public.settings
     set letter_prefix = upper(trim(p_prefix)), letter_experience_template = trim(p_experience), letter_relieving_template = trim(p_relieving)
   where id = 1;
  perform public.log_action('settings.letters', 'settings', '1', jsonb_build_object('prefix', upper(trim(p_prefix))));
end $$;
revoke execute on function public.save_letter_settings(text, text, text) from public, anon;
grant  execute on function public.save_letter_settings(text, text, text) to authenticated;

-- =====================================================================
-- Payroll: include the leaver for their final month, drop them afterwards
-- =====================================================================
drop function if exists public.payroll_month(date);
create function public.payroll_month(p_month date)
returns table (
  employee_id       uuid,
  full_name         text,
  emp_code          text,
  designation       text,
  avatar_url        text,
  is_active         boolean,
  left_on           date,
  profile_basic     numeric,
  working_days      numeric,
  present_days      numeric,
  leave_days        numeric,
  overtime_hours    numeric,
  payslip_id        uuid,
  basic_salary      numeric,
  performance_bonus numeric,
  extra_pay         numeric,
  net_pay           numeric,
  status            public.payslip_status,
  payment_status    public.payment_status,
  paid_on           date,
  payment_ref       text,
  published_at      timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view payroll.' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.emp_code, p.designation, p.avatar_url, p.is_active, p.left_on, p.basic_salary,
         st.working_days, st.present_days, st.leave_days, st.overtime_hours,
         ps.id, ps.basic_salary, ps.performance_bonus, ps.extra_pay, ps.net_pay,
         ps.status, ps.payment_status, ps.paid_on, ps.payment_ref, ps.published_at
  from public.profiles p
  left join public.payslips ps on ps.employee_id = p.id and ps.month = v_start
  cross join lateral public._payroll_stats(p.id, v_start) st
  where p.role = 'employee'
    and (ps.id is not null or (
          (p.is_active or p.left_on >= v_start)
          and (p.date_of_joining is null or p.date_of_joining <= v_end)
          and (p.left_on is null or p.left_on >= v_start)))
  order by p.full_name;
end $$;
revoke execute on function public.payroll_month(date) from public, anon;
grant  execute on function public.payroll_month(date) to authenticated;

-- ---------- Nightly: 00:05 IST = 18:35 UTC --------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'process-exits';
  perform cron.schedule('process-exits', '35 18 * * *', 'select public.process_exits()');
exception when others then
  raise notice 'pg_cron not available (%). Exits are still applied when the admin opens Today and on clock-in.', sqlerrm;
end $$;
