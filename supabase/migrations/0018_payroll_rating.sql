-- =====================================================================
-- 0018  Payroll v2: rating multiplier, excellence bonus, night shift pay,
--       remarks
--
-- Net pay = Basic + Excellence bonus + Performance bonus + Night shift pay
-- Performance bonus = (Basic + Excellence bonus) x (multiplier - 1), where
-- the admin picks a monthly rating:
--     5.0 -> x1.20   4.5 -> x1.10   4.0 -> x1.05 (default)
--     3.5 -> x1.00   3.0 -> x0.90 (penalty: the bonus line is negative)
-- "Extra Pay" is renamed to "Night shift pay" (typed by HR).
-- Slips saved before this migration have no rating; their bonus amount is
-- kept as it was.
-- =====================================================================

alter table public.payslips rename column extra_pay to night_shift_pay;
alter table public.payslips add column if not exists excellence_bonus numeric(12,2) not null default 0 check (excellence_bonus >= 0);
alter table public.payslips add column if not exists rating numeric(2,1) check (rating in (3.0, 3.5, 4.0, 4.5, 5.0));
alter table public.payslips add column if not exists remarks text check (remarks is null or length(remarks) <= 500);
alter table public.payslips add column if not exists late_days int not null default 0;
alter table public.payslips drop constraint if exists payslips_performance_bonus_check;

alter table public.payslips drop column net_pay;
alter table public.payslips add column net_pay numeric(12,2)
  generated always as (basic_salary + excellence_bonus + performance_bonus + night_shift_pay) stored;

-- ---------- Rating -> multiplier ---------------------------------------
create or replace function public.rating_multiplier(p_rating numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case p_rating
    when 5.0 then 1.20
    when 4.5 then 1.10
    when 4.0 then 1.05
    when 3.5 then 1.00
    when 3.0 then 0.90
  end;
$$;

-- ---------- Late days in a month (rating helper) -----------------------
create or replace function public._late_days(p_employee uuid, p_month date)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.attendance a
   where a.employee_id = p_employee and a.is_late
     and a.work_date >= date_trunc('month', p_month)::date
     and a.work_date < (date_trunc('month', p_month) + interval '1 month')::date;
$$;
revoke execute on function public._late_days(uuid, date) from public, anon, authenticated;

-- ---------- Admin: the payroll sheet for a month ----------------------
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
  late_days         int,
  payslip_id        uuid,
  basic_salary      numeric,
  excellence_bonus  numeric,
  rating            numeric,
  performance_bonus numeric,
  night_shift_pay   numeric,
  remarks           text,
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
         public._late_days(p.id, v_start),
         ps.id, ps.basic_salary, ps.excellence_bonus, ps.rating, ps.performance_bonus, ps.night_shift_pay, ps.remarks, ps.net_pay,
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

-- ---------- Admin: save (create/update) a draft -----------------------
drop function if exists public.save_payslip(uuid, date, numeric, numeric, numeric);
create function public.save_payslip(
  p_employee   uuid,
  p_month      date,
  p_basic      numeric,
  p_excellence numeric,
  p_rating     numeric,
  p_night      numeric,
  p_remarks    text
)
returns public.payslips
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_month   date := date_trunc('month', p_month)::date;
  v_row     public.payslips;
  v_st      record;
  v_mult    numeric := public.rating_multiplier(p_rating);
  v_remarks text := nullif(trim(coalesce(p_remarks, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit payroll.' using errcode = '42501';
  end if;
  if v_month > date_trunc('month', public.local_today())::date then
    raise exception 'You can''t prepare payroll for a future month.';
  end if;
  if coalesce(p_basic, -1) < 0 or coalesce(p_excellence, -1) < 0 or coalesce(p_night, -1) < 0 then
    raise exception 'Amounts can''t be empty or negative.';
  end if;
  if p_basic > 100000000 or p_excellence > 100000000 or p_night > 100000000 then
    raise exception 'That amount is too large.';
  end if;
  if v_mult is null then
    raise exception 'Pick a rating: 5, 4.5, 4, 3.5 or 3.';
  end if;
  if length(coalesce(v_remarks, '')) > 500 then
    raise exception 'Remarks can be at most 500 characters.';
  end if;
  if not exists (select 1 from public.profiles where id = p_employee and role = 'employee') then
    raise exception 'Employee not found.';
  end if;

  select * into v_row from public.payslips where employee_id = p_employee and month = v_month for update;
  if found and v_row.status = 'published' then
    raise exception 'This payslip is published. Unpublish it before editing.';
  end if;

  select * into v_st from public._payroll_stats(p_employee, v_month);

  insert into public.payslips (employee_id, month, working_days, present_days, leave_days, overtime_hours, late_days,
                               basic_salary, excellence_bonus, rating, performance_bonus, night_shift_pay, remarks, status)
  values (p_employee, v_month, v_st.working_days, v_st.present_days, v_st.leave_days, v_st.overtime_hours,
          public._late_days(p_employee, v_month),
          round(p_basic, 2), round(p_excellence, 2), p_rating,
          round((round(p_basic, 2) + round(p_excellence, 2)) * (v_mult - 1), 2),
          round(p_night, 2), v_remarks, 'draft')
  on conflict (employee_id, month) do update
    set working_days = excluded.working_days, present_days = excluded.present_days,
        leave_days = excluded.leave_days, overtime_hours = excluded.overtime_hours, late_days = excluded.late_days,
        basic_salary = excluded.basic_salary, excellence_bonus = excluded.excellence_bonus,
        rating = excluded.rating, performance_bonus = excluded.performance_bonus,
        night_shift_pay = excluded.night_shift_pay, remarks = excluded.remarks
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.save_payslip(uuid, date, numeric, numeric, numeric, numeric, text) from public, anon;
grant  execute on function public.save_payslip(uuid, date, numeric, numeric, numeric, numeric, text) to authenticated;
