-- =====================================================================
-- 0009  Payroll & payslips
-- Payslip = Basic Salary + Performance Bonus + Extra Pay (no deductions).
-- Working / present / leave days and approved extra hours are shown as
-- reference and snapshotted onto the slip when it is saved.
-- Lifecycle: draft → published (employee can see) → paid.
-- =====================================================================

-- ---------- Reference numbers for one employee + month ----------------
create or replace function public._payroll_stats(p_employee uuid, p_month date)
returns table (working_days numeric, present_days numeric, leave_days numeric, overtime_hours numeric)
language sql stable security definer set search_path = '' as $$
  with days as (
    select di.kind
    from generate_series(date_trunc('month', p_month), date_trunc('month', p_month) + interval '1 month - 1 day', interval '1 day') g(d)
    cross join lateral public.day_info(p_employee, g.d::date) di
  )
  select
    (select count(*) filter (where kind in ('working', 'leave', 'half_leave')) from days)::numeric,
    (select coalesce(sum(case when a.status = 'half_day' then 0.5 else 1 end), 0)
       from public.attendance a
      where a.employee_id = p_employee
        and a.work_date >= date_trunc('month', p_month)::date
        and a.work_date < (date_trunc('month', p_month) + interval '1 month')::date)::numeric,
    (select coalesce(sum(case kind when 'leave' then 1 when 'half_leave' then 0.5 else 0 end), 0) from days)::numeric,
    (select coalesce(sum(o.hours), 0)
       from public.overtime_entries o
      where o.employee_id = p_employee and o.status = 'approved'
        and o.work_date >= date_trunc('month', p_month)::date
        and o.work_date < (date_trunc('month', p_month) + interval '1 month')::date)::numeric;
$$;
revoke execute on function public._payroll_stats(uuid, date) from public, anon, authenticated;

-- ---------- Admin: the payroll sheet for a month ----------------------
create or replace function public.payroll_month(p_month date)
returns table (
  employee_id       uuid,
  full_name         text,
  emp_code          text,
  designation       text,
  avatar_url        text,
  is_active         boolean,
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
  select p.id, p.full_name, p.emp_code, p.designation, p.avatar_url, p.is_active, p.basic_salary,
         st.working_days, st.present_days, st.leave_days, st.overtime_hours,
         ps.id, ps.basic_salary, ps.performance_bonus, ps.extra_pay, ps.net_pay,
         ps.status, ps.payment_status, ps.paid_on, ps.payment_ref, ps.published_at
  from public.profiles p
  left join public.payslips ps on ps.employee_id = p.id and ps.month = v_start
  cross join lateral public._payroll_stats(p.id, v_start) st
  where p.role = 'employee'
    and (ps.id is not null or (p.is_active and (p.date_of_joining is null or p.date_of_joining <= v_end)))
  order by p.full_name;
end $$;
revoke execute on function public.payroll_month(date) from public, anon;
grant  execute on function public.payroll_month(date) to authenticated;

-- ---------- Admin: save (create/update) a draft -----------------------
create or replace function public.save_payslip(p_employee uuid, p_month date, p_basic numeric, p_bonus numeric, p_extra numeric)
returns public.payslips
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_row   public.payslips;
  v_st    record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit payroll.' using errcode = '42501';
  end if;
  if v_month > date_trunc('month', public.local_today())::date then
    raise exception 'You can''t prepare payroll for a future month.';
  end if;
  if coalesce(p_basic, -1) < 0 or coalesce(p_bonus, -1) < 0 or coalesce(p_extra, -1) < 0 then
    raise exception 'Amounts can''t be empty or negative.';
  end if;
  if p_basic > 100000000 or p_bonus > 100000000 or p_extra > 100000000 then
    raise exception 'That amount is too large.';
  end if;
  if not exists (select 1 from public.profiles where id = p_employee and role = 'employee') then
    raise exception 'Employee not found.';
  end if;

  select * into v_row from public.payslips where employee_id = p_employee and month = v_month for update;
  if found and v_row.status = 'published' then
    raise exception 'This payslip is published. Unpublish it before editing.';
  end if;

  select * into v_st from public._payroll_stats(p_employee, v_month);

  insert into public.payslips (employee_id, month, working_days, present_days, leave_days, overtime_hours,
                               basic_salary, performance_bonus, extra_pay, status)
  values (p_employee, v_month, v_st.working_days, v_st.present_days, v_st.leave_days, v_st.overtime_hours,
          round(p_basic, 2), round(p_bonus, 2), round(p_extra, 2), 'draft')
  on conflict (employee_id, month) do update
    set working_days = excluded.working_days, present_days = excluded.present_days,
        leave_days = excluded.leave_days, overtime_hours = excluded.overtime_hours,
        basic_salary = excluded.basic_salary, performance_bonus = excluded.performance_bonus,
        extra_pay = excluded.extra_pay
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.save_payslip(uuid, date, numeric, numeric, numeric) from public, anon;
grant  execute on function public.save_payslip(uuid, date, numeric, numeric, numeric) to authenticated;

-- ---------- Admin: publish / unpublish --------------------------------
create or replace function public.set_payslips_published(p_ids uuid[], p_publish boolean)
returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can publish payslips.' using errcode = '42501';
  end if;
  if not p_publish and exists (select 1 from public.payslips where id = any(p_ids) and payment_status = 'paid') then
    raise exception 'A paid payslip can''t be unpublished. Mark it unpaid first.';
  end if;

  update public.payslips
  set status = case when p_publish then 'published'::public.payslip_status else 'draft'::public.payslip_status end,
      published_at = case when p_publish then now() else null end
  where id = any(p_ids)
    and status = case when p_publish then 'draft'::public.payslip_status else 'published'::public.payslip_status end;
  get diagnostics v_count = row_count;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_publish then 'payslip.publish' else 'payslip.unpublish' end, 'payslip', null,
          jsonb_build_object('ids', p_ids, 'count', v_count));
  return v_count;
end $$;
revoke execute on function public.set_payslips_published(uuid[], boolean) from public, anon;
grant  execute on function public.set_payslips_published(uuid[], boolean) to authenticated;

-- ---------- Admin: mark paid / unpaid ---------------------------------
create or replace function public.set_payslip_paid(p_id uuid, p_paid boolean, p_paid_on date, p_ref text)
returns public.payslips
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.payslips;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update payments.' using errcode = '42501';
  end if;
  select * into v_row from public.payslips where id = p_id for update;
  if not found then
    raise exception 'Payslip not found.';
  elsif v_row.status <> 'published' then
    raise exception 'Publish the payslip before marking it paid.';
  end if;
  if p_paid and p_paid_on is null then
    raise exception 'Enter the payment date.';
  elsif p_paid and p_paid_on > public.local_today() then
    raise exception 'The payment date can''t be in the future.';
  end if;

  update public.payslips
  set payment_status = case when p_paid then 'paid'::public.payment_status else 'pending'::public.payment_status end,
      paid_on        = case when p_paid then p_paid_on else null end,
      payment_ref    = case when p_paid then nullif(trim(coalesce(p_ref, '')), '') else null end
  where id = p_id
  returning * into v_row;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_paid then 'payslip.paid' else 'payslip.unpaid' end, 'payslip', p_id::text,
          jsonb_build_object('paid_on', p_paid_on));
  return v_row;
end $$;
revoke execute on function public.set_payslip_paid(uuid, boolean, date, text) from public, anon;
grant  execute on function public.set_payslip_paid(uuid, boolean, date, text) to authenticated;

-- Admins delete only drafts (published slips are part of the record)
create or replace function public.delete_payslip_draft(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete payslips.' using errcode = '42501';
  end if;
  delete from public.payslips where id = p_id and status = 'draft';
  if not found then
    raise exception 'Only draft payslips can be deleted.';
  end if;
end $$;
revoke execute on function public.delete_payslip_draft(uuid) from public, anon;
grant  execute on function public.delete_payslip_draft(uuid) to authenticated;
