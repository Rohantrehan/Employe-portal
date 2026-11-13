-- =====================================================================
-- 0005  One employee's month, day by day (for calendars and history)
-- Self or admin only (enforced by day_info's own check).
-- =====================================================================
create or replace function public.employee_month(p_employee uuid, p_month date)
returns table (
  day            date,
  day_kind       text,
  day_label      text,
  attendance_id  uuid,
  clock_in       timestamptz,
  clock_out      timestamptz,
  status         public.attendance_status,
  is_late        boolean,
  early_leave    boolean,
  worked_minutes int,
  summary        text,
  admin_note     text,
  tasks          jsonb
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if p_employee is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select
    g.d::date, di.kind, di.label,
    a.id, a.clock_in, a.clock_out, a.status, a.is_late, a.early_leave, a.worked_minutes, a.summary, a.admin_note,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'planned', t.planned, 'done', t.done)
                       order by t.planned desc, t.sort_order)
      from public.attendance_tasks t where t.attendance_id = a.id
    ), '[]'::jsonb)
  from generate_series(v_start, v_end, interval '1 day') as g(d)
  cross join lateral public.day_info(p_employee, g.d::date) di
  left join public.attendance a on a.employee_id = p_employee and a.work_date = g.d::date
  order by g.d;
end $$;
revoke execute on function public.employee_month(uuid, date) from public, anon;
grant  execute on function public.employee_month(uuid, date) to authenticated;
