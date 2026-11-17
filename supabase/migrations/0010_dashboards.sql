-- =====================================================================
-- 0010  Dashboards: chart data computed in the database
--  * admin_dashboard()      everything the admin home page needs, one call
--  * my_dashboard(p_days)   the signed-in employee's recent days + next holiday
-- Both return jsonb so the page makes a single round trip.
-- =====================================================================

-- ---------- Admin --------------------------------------------------------
-- Payroll cost for the 12 months ending with p_today's month.
create or replace function public._payroll_by_month(p_today date)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'month'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'month', pm.month,
      'total', coalesce(sum(ps.net_pay), 0),
      'slips', count(ps.id),
      'published', count(ps.id) filter (where ps.status = 'published'),
      'paid', count(ps.id) filter (where ps.payment_status = 'paid')
    ) as x
    from (select (date_trunc('month', p_today) - make_interval(months => s))::date as month from generate_series(0, 11) s) pm
    left join public.payslips ps on ps.month = pm.month
    group by pm.month
  ) q;
$$;
revoke execute on function public._payroll_by_month(date) from public, anon, authenticated;

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.local_today();
  v_year  int  := extract(year from v_today)::int;
  v_y0    date := make_date(v_year, 1, 1);
  v_y1    date := make_date(v_year, 12, 31);
  v_m0    date := date_trunc('month', v_today)::date;
  r       jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view the dashboard.' using errcode = '42501';
  end if;

  with emps as (
    select p.id, p.full_name, p.date_of_joining
    from public.profiles p
    where p.is_active and p.role = 'employee'
  ),
  -- Last 30 days × every active employee, with the kind of day for each
  grid as (
    select e.id, g.d::date as d, di.kind
    from emps e
    cross join generate_series(v_today - 29, v_today, interval '1 day') g(d)
    cross join lateral public.day_info(e.id, g.d::date) di
    where e.date_of_joining is null or e.date_of_joining <= g.d::date
  ),
  trend as (
    select
      g.d,
      count(*) filter (where g.kind in ('working', 'half_leave'))::int                          as expected,
      count(a.id)::int                                                                         as present,
      count(a.id) filter (where a.is_late)::int                                                as late,
      coalesce(sum(case g.kind when 'leave' then 1 when 'half_leave' then 0.5 else 0 end), 0) as on_leave
    from grid g
    left join public.attendance a on a.employee_id = g.id and a.work_date = g.d
    group by g.d
  ),
  today as (
    select
      count(*)::int                                                                        as headcount,
      count(*) filter (where a.id is not null and a.clock_out is null)::int                as working,
      count(*) filter (where a.clock_out is not null)::int                                  as clocked_out,
      count(*) filter (where a.id is null and di.kind = 'leave')::int                       as on_leave,
      count(*) filter (where a.id is null and di.kind in ('working', 'half_leave'))::int    as not_in,
      count(*) filter (where a.id is null and di.kind in ('holiday', 'weekly_off'))::int    as off_today,
      count(*) filter (where a.is_late)::int                                                as late
    from emps e
    cross join lateral public.day_info(e.id, v_today) di
    left join public.attendance a on a.employee_id = e.id and a.work_date = v_today
    where e.date_of_joining is null or e.date_of_joining <= v_today
  ),
  leave_days as (   -- approved leave this year, counted on the days it actually takes
    select extract(month from g.d)::int as m, lr.leave_type_id,
           case di.kind when 'leave' then 1 when 'half_leave' then 0.5 else 0 end as n
    from public.leave_requests lr
    cross join lateral generate_series(greatest(lr.start_date, v_y0), least(lr.end_date, v_y1), interval '1 day') g(d)
    cross join lateral public.day_info(lr.employee_id, g.d::date) di
    where lr.status = 'approved' and lr.end_date >= v_y0 and lr.start_date <= v_y1
  ),
  months as (
    select generate_series(1, 12) as m
  ),
  avg_hours as (
    select e.full_name,
           round(avg(a.worked_minutes) / 60.0, 2) as hours,
           count(*)::int                          as days
    from emps e
    join public.attendance a on a.employee_id = e.id
    where a.work_date between v_today - 29 and v_today and a.worked_minutes is not null
    group by e.full_name
  )
  select jsonb_build_object(
    'today', v_today,
    'year', v_year,
    'kpis', (select to_jsonb(t) from today t),
    'pending', jsonb_build_object(
      'leaves',   (select count(*) from public.leave_requests where status = 'pending'),
      'overtime', (select count(*) from public.overtime_entries where status = 'pending'),
      'swaps',    (select count(*) from public.floating_swaps where status = 'pending')
    ),
    'trend', coalesce((select jsonb_agg(to_jsonb(t) order by t.d) from trend t), '[]'::jsonb),
    'leave_by_type', coalesce((
      select jsonb_agg(jsonb_build_object('name', lt.name, 'code', lt.code, 'days', coalesce(x.days, 0)) order by lt.sort_order, lt.name)
      from public.leave_types lt
      left join (select leave_type_id, sum(n) days from leave_days group by 1) x on x.leave_type_id = lt.id
      where lt.is_active
    ), '[]'::jsonb),
    'leave_by_month', (
      select jsonb_agg(jsonb_build_object('m', mo.m, 'days', coalesce((select sum(n) from leave_days ld where ld.m = mo.m), 0)) order by mo.m)
      from months mo
    ),
    'avg_hours', coalesce((select jsonb_agg(to_jsonb(h) order by h.hours desc) from avg_hours h), '[]'::jsonb),
    'avg_hours_month', (
      select round(avg(a.worked_minutes) / 60.0, 2)
      from public.attendance a join emps e on e.id = a.employee_id
      where a.work_date >= v_m0 and a.worked_minutes is not null
    ),
    'overtime_by_month', (
      select jsonb_agg(jsonb_build_object('m', mo.m, 'hours', coalesce((
        select sum(o.hours) from public.overtime_entries o
        where o.status = 'approved' and o.work_date between v_y0 and v_y1 and extract(month from o.work_date) = mo.m
      ), 0)) order by mo.m)
      from months mo
    ),
    'payroll_by_month', public._payroll_by_month(v_today)
  ) into r;

  return r;
end $$;
revoke execute on function public.admin_dashboard() from public, anon;
grant  execute on function public.admin_dashboard() to authenticated;

-- ---------- Employee -----------------------------------------------------
create or replace function public.my_dashboard(p_days int default 14)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me    uuid := auth.uid();
  v_today date := public.local_today();
  v_days  int  := least(greatest(coalesce(p_days, 14), 7), 62);
  r       jsonb;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'today', v_today,
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', g.d::date,
        'kind', di.kind,
        'label', di.label,
        'status', a.status,
        'is_late', coalesce(a.is_late, false),
        'open', a.id is not null and a.clock_out is null,
        'minutes', coalesce(a.worked_minutes,
                            case when a.id is not null and a.clock_out is null and a.work_date = v_today
                                 then floor(extract(epoch from now() - a.clock_in) / 60)::int end)
      ) order by g.d)
      from generate_series(v_today - (v_days - 1), v_today, interval '1 day') g(d)
      cross join lateral public.day_info(v_me, g.d::date) di
      left join public.attendance a on a.employee_id = v_me and a.work_date = g.d::date
    ), '[]'::jsonb),
    'next_holiday', (
      select jsonb_build_object('day', g.d::date, 'label', di.label)
      from generate_series(v_today, v_today + 366, interval '1 day') g(d)
      cross join lateral public.day_info(v_me, g.d::date) di
      where di.kind = 'holiday'
      order by g.d
      limit 1
    )
  ) into r;

  return r;
end $$;
revoke execute on function public.my_dashboard(int) from public, anon;
grant  execute on function public.my_dashboard(int) to authenticated;
