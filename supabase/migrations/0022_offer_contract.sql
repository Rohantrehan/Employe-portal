-- =====================================================================
-- 0022  Offer letter + employment contract
--
--  * Same letters table, signature, reference numbers, QR check and
--    download log as the exit letters. New: a monthly salary on the
--    letter (never shown on the public QR page).
--  * offer     one live offer per employee; joining date, optional end
--  * contract  start + end + salary; renewals are new contracts, whose
--              terms may not overlap an issued one. One draft at a time.
--  * Neither needs an exit record. Reference numbers: PREFIX/OFF/2026/001
--    and PREFIX/CON/2026/001.
--  * Templates for both live in Settings.
-- =====================================================================

-- ---------- Columns and rules -------------------------------------------
alter table public.letters add column if not exists salary numeric(12,2) check (salary is null or (salary > 0 and salary <= 100000000));
alter table public.letters alter column date_to drop not null;
alter table public.letters drop constraint if exists letters_check;
alter table public.letters drop constraint if exists letters_dates_check;
alter table public.letters add constraint letters_dates_check check (
  (date_to is null or date_to >= date_from)
  and (kind = 'offer' or date_to is not null)
);
alter table public.letters drop constraint if exists letters_salary_check;
alter table public.letters add constraint letters_salary_check check (kind not in ('offer', 'contract') or salary is not null);

drop index if exists public.letters_one_live;
create unique index letters_one_live on public.letters(employee_id, kind) where status <> 'cancelled' and kind <> 'contract';
create unique index if not exists letters_one_contract_draft on public.letters(employee_id) where kind = 'contract' and status = 'draft';

-- ---------- Templates -------------------------------------------------------
alter table public.settings add column if not exists letter_offer_template text not null default
$t$We are pleased to offer you the position of {designation} at {company}. Your employment will start on {start}.

Your monthly salary will be {salary} ({salary_words}). Salaries are credited between the 1st and 10th of the following month. Details of your role, working hours and company policies will be shared with you on your first day.

Please confirm that you accept this offer by signing a copy of this letter and returning it before your start date.

We look forward to welcoming you to the team.$t$;
alter table public.settings add column if not exists letter_contract_template text not null default
$t$This contract confirms the employment of {name} (Employee Code {emp_code}) with {company} as {designation}.

The contract runs from {start} to {end}, a period of {duration}. The monthly salary for this period is {salary} ({salary_words}), credited between the 1st and 10th of the following month.

{They} will follow the company's working hours, attendance and leave rules as shown in the employee portal. Either side may end this contract early by giving written notice.

At the end of its term, the contract may be renewed by mutual agreement.$t$;

-- ---------- Save a draft (all kinds) -----------------------------------------
drop function if exists public.save_letter(uuid, uuid, public.letter_kind, text, text, date, date, text, text, text);
create function public.save_letter(
  p_id          uuid,
  p_employee    uuid,
  p_kind        public.letter_kind,
  p_designation text,
  p_department  text,
  p_from        date,
  p_to          date,
  p_conduct     text,
  p_pronoun     text,
  p_body        text,
  p_salary      numeric default null
)
returns public.letters
language plpgsql security definer set search_path = '' as $$
declare
  v_exit public.employee_exits;
  v_p    public.profiles;
  v_co   text;
  v_hire boolean := p_kind in ('offer', 'contract');
  r      public.letters;
begin
  if not public.is_admin() then
    raise exception 'Only admins can prepare letters.' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = p_employee and role = 'employee';
  if not found then
    raise exception 'Employee not found.' using errcode = 'P0001';
  end if;

  if not v_hire then
    select * into v_exit from public.employee_exits where employee_id = p_employee;
    if not found then
      raise exception 'Record the employee''s exit first.' using errcode = 'P0001';
    end if;
    if p_kind = 'experience' and not v_exit.letters_allowed then
      raise exception 'The experience letter is turned off for this employee. Change it in the exit details.' using errcode = 'P0001';
    end if;
  end if;

  if length(trim(coalesce(p_designation, ''))) not between 1 and 120 then
    raise exception 'Enter the designation.' using errcode = 'P0001';
  end if;
  if p_from is null then
    raise exception 'Pick the start date.' using errcode = 'P0001';
  end if;
  if p_to is null and p_kind <> 'offer' then
    raise exception 'Pick the end date.' using errcode = 'P0001';
  end if;
  if p_to is not null and p_to < p_from then
    raise exception 'The end date must be on or after the start date.' using errcode = 'P0001';
  end if;
  if not v_hire and p_to > v_exit.last_day then
    raise exception 'The "to" date can''t be after the last working day (%).', to_char(v_exit.last_day, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  if v_hire and (p_salary is null or p_salary <= 0) then
    raise exception 'Enter the monthly salary.' using errcode = 'P0001';
  end if;
  if p_salary > 100000000 then
    raise exception 'That salary is too large.' using errcode = 'P0001';
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

  select company_name into v_co from public.settings where id = 1;

  if p_id is null then
    if p_kind = 'contract' and exists (select 1 from public.letters where employee_id = p_employee and kind = 'contract' and status = 'draft') then
      raise exception 'There is already a draft contract. Edit or delete it first.' using errcode = 'P0001';
    end if;
    if p_kind <> 'contract' and exists (select 1 from public.letters where employee_id = p_employee and kind = p_kind and status <> 'cancelled') then
      raise exception 'There is already %. Cancel it to make a new one.',
        case p_kind when 'offer' then 'an offer letter' when 'experience' then 'an experience letter' else 'a relieving letter' end
        using errcode = 'P0001';
    end if;
    insert into public.letters (employee_id, kind, full_name, emp_code, designation, department, company_name,
                                date_from, date_to, conduct, pronoun, body, salary, created_by)
    values (p_employee, p_kind, v_p.full_name, v_p.emp_code, trim(p_designation), nullif(trim(coalesce(p_department, '')), ''), v_co,
            p_from, p_to, case when p_kind = 'experience' then p_conduct end, p_pronoun, trim(p_body),
            case when v_hire then round(p_salary, 2) end, auth.uid())
    returning * into r;
  else
    update public.letters
       set full_name = v_p.full_name, emp_code = v_p.emp_code, designation = trim(p_designation),
           department = nullif(trim(coalesce(p_department, '')), ''), company_name = v_co,
           date_from = p_from, date_to = p_to, conduct = case when kind = 'experience' then p_conduct end,
           pronoun = p_pronoun, body = trim(p_body), salary = case when v_hire then round(p_salary, 2) end
     where id = p_id and employee_id = p_employee and kind = p_kind and status = 'draft'
    returning * into r;
    if not found then
      raise exception 'Only draft letters can be edited.' using errcode = 'P0001';
    end if;
  end if;

  perform public.log_action('letter.save', 'letter', r.id::text, jsonb_build_object('kind', r.kind, 'employee', p_employee));
  return r;
end $$;
revoke execute on function public.save_letter(uuid, uuid, public.letter_kind, text, text, date, date, text, text, text, numeric) from public, anon;
grant  execute on function public.save_letter(uuid, uuid, public.letter_kind, text, text, date, date, text, text, text, numeric) to authenticated;

-- ---------- Issue ----------------------------------------------------------------
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
  v_hit  public.letters;
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

  if r.kind in ('experience', 'relieving') then
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
  end if;

  if r.kind = 'contract' then
    select * into v_hit from public.letters c
     where c.employee_id = r.employee_id and c.kind = 'contract' and c.status = 'issued'
       and daterange(c.date_from, c.date_to, '[]') && daterange(r.date_from, r.date_to, '[]')
     limit 1;
    if found then
      raise exception 'This overlaps contract % (% to %). Change the dates or cancel that one first.',
        v_hit.ref_no, to_char(v_hit.date_from, 'DD Mon YYYY'), to_char(v_hit.date_to, 'DD Mon YYYY') using errcode = 'P0001';
    end if;
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
         ref_no = format('%s/%s/%s/%s', coalesce(v_pre, 'RT'),
                         case r.kind when 'experience' then 'EXP' when 'relieving' then 'REL' when 'offer' then 'OFF' else 'CON' end,
                         v_year, lpad(v_n::text, 3, '0')),
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

-- ---------- Undo exit only looks at exit letters ----------------------------------
create or replace function public.undo_exit(p_employee uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employee_exits where employee_id = p_employee) then
    raise exception 'No exit recorded for this employee.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.letters where employee_id = p_employee and status = 'issued' and kind in ('experience', 'relieving')) then
    raise exception 'Cancel the issued letters first.' using errcode = 'P0001';
  end if;
  delete from public.letters where employee_id = p_employee and status = 'draft' and kind in ('experience', 'relieving');
  delete from public.employee_exits where employee_id = p_employee;
  update public.profiles set left_on = null, former_access = true, is_active = true where id = p_employee;
  perform public.log_action('exit.undo', 'profile', p_employee::text, null);
end $$;
revoke execute on function public.undo_exit(uuid) from public, anon;
grant  execute on function public.undo_exit(uuid) to authenticated;

-- ---------- Settings: four templates ---------------------------------------------
drop function if exists public.save_letter_settings(text, text, text);
create function public.save_letter_settings(p_prefix text, p_experience text, p_relieving text, p_offer text, p_contract text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change settings.' using errcode = '42501';
  end if;
  if coalesce(upper(trim(p_prefix)), '') !~ '^[A-Z]{2,6}$' then
    raise exception 'The reference prefix must be 2 to 6 letters (A–Z).' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_experience, ''))) not between 20 and 5000 or length(trim(coalesce(p_relieving, ''))) not between 20 and 5000
     or length(trim(coalesce(p_offer, ''))) not between 20 and 5000 or length(trim(coalesce(p_contract, ''))) not between 20 and 5000 then
    raise exception 'Each letter text must be 20 to 5000 characters.' using errcode = 'P0001';
  end if;
  update public.settings
     set letter_prefix = upper(trim(p_prefix)), letter_experience_template = trim(p_experience), letter_relieving_template = trim(p_relieving),
         letter_offer_template = trim(p_offer), letter_contract_template = trim(p_contract)
   where id = 1;
  perform public.log_action('settings.letters', 'settings', '1', jsonb_build_object('prefix', upper(trim(p_prefix))));
end $$;
revoke execute on function public.save_letter_settings(text, text, text, text, text) from public, anon;
grant  execute on function public.save_letter_settings(text, text, text, text, text) to authenticated;
