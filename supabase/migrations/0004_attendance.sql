-- =====================================================================
-- 0004  Attendance: clock in / clock out with daily tasks
--  * all times come from the database clock (now()), never the browser
--  * status (late / half day / missed clock-out / early leave) is computed
--    by a trigger, so admin corrections are recalculated automatically
-- =====================================================================

alter table public.attendance add column if not exists summary text;
alter table public.attendance add column if not exists is_late boolean not null default false;

-- ---------- Time helpers ----------------------------------------------
create or replace function public.company_tz()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select timezone from public.settings where id = 1), 'Asia/Kolkata');
$$;

create or replace function public.local_today()
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone public.company_tz())::date;
$$;

-- ---------- What kind of day is it for this employee? -----------------
-- kind: working | weekly_off | holiday | leave | half_leave
create or replace function public.day_info(p_employee uuid, p_date date)
returns table (kind text, label text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_off   smallint[];
  v_name  text;
  v_part  public.day_part;
begin
  if p_employee is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select weekly_off into v_off from public.settings where id = 1;

  -- A floating holiday this employee moved TO this date
  select h.name into v_name
  from public.floating_swaps fs join public.holidays h on h.id = fs.holiday_id
  where fs.employee_id = p_employee and fs.status = 'approved' and fs.new_date = p_date
  limit 1;
  if v_name is not null then
    return query select 'holiday'::text, v_name || ' (moved)';
    return;
  end if;

  if extract(dow from p_date)::smallint = any (coalesce(v_off, '{0}')) then
    return query select 'weekly_off'::text, 'Weekly off'::text;
    return;
  end if;

  -- Company holiday, unless this employee moved it away
  select h.name into v_name
  from public.holidays h
  where h.date = p_date
    and not exists (
      select 1 from public.floating_swaps fs
      where fs.holiday_id = h.id and fs.employee_id = p_employee and fs.status = 'approved'
    );
  if v_name is not null then
    return query select 'holiday'::text, v_name;
    return;
  end if;

  select lt.name, lr.day_part into v_name, v_part
  from public.leave_requests lr join public.leave_types lt on lt.id = lr.leave_type_id
  where lr.employee_id = p_employee and lr.status = 'approved' and p_date between lr.start_date and lr.end_date
  order by (lr.day_part = 'full') desc
  limit 1;
  if v_name is not null then
    if v_part = 'full' then
      return query select 'leave'::text, v_name;
    else
      return query select 'half_leave'::text, v_name || case when v_part = 'first_half' then ' (first half)' else ' (second half)' end;
    end if;
    return;
  end if;

  return query select 'working'::text, null::text;
end $$;
revoke execute on function public.day_info(uuid, date) from public, anon;
grant  execute on function public.day_info(uuid, date) to authenticated;

-- ---------- Status computation (runs on every insert/update) ---------
create or replace function public.attendance_compute()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s        public.settings;
  v_in     time;
  v_cutoff time;
begin
  select * into s from public.settings where id = 1;
  v_in     := (new.clock_in at time zone s.timezone)::time;
  v_cutoff := s.work_start + make_interval(mins => s.grace_minutes);
  new.is_late := v_in > v_cutoff;

  if new.clock_out is not null then
    new.worked_minutes := floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::int;
    new.early_leave := (new.clock_out at time zone s.timezone)::date = new.work_date
                       and (new.clock_out at time zone s.timezone)::time < s.work_end;
    new.status := case
      when new.worked_minutes < s.half_day_min_hours * 60 then 'half_day'
      when new.is_late then 'late'
      else 'present'
    end;
  else
    new.worked_minutes := null;
    new.early_leave := false;
    new.status := case
      when new.work_date < public.local_today() then 'missed_clock_out'
      when new.is_late then 'late'
      else 'present'
    end;
  end if;
  return new;
end $$;
revoke execute on function public.attendance_compute() from public, anon, authenticated;

drop trigger if exists attendance_compute on public.attendance;
create trigger attendance_compute
  before insert or update of clock_in, clock_out, work_date on public.attendance
  for each row execute function public.attendance_compute();

-- ---------- Close rows nobody clocked out of --------------------------
create or replace function public.close_missed_clock_outs()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  -- touching clock_out re-runs the trigger, which marks the row missed_clock_out
  update public.attendance set clock_out = null
  where clock_out is null and work_date < public.local_today() and status <> 'missed_clock_out';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.close_missed_clock_outs() from public, anon;
grant  execute on function public.close_missed_clock_outs() to authenticated;

-- ---------- Clock in ---------------------------------------------------
create or replace function public.clock_in(p_tasks text[])
returns public.attendance
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := public.local_today();
  v_kind  text;
  v_label text;
  v_tasks text[];
  v_row   public.attendance;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;

  perform public.close_missed_clock_outs();

  select array_agg(t order by ord) into v_tasks
  from (select trim(x) as t, ord from unnest(coalesce(p_tasks, '{}')) with ordinality as u(x, ord)) q
  where t <> '';

  if v_tasks is null then
    raise exception 'Write at least one task you plan to do today.';
  elsif array_length(v_tasks, 1) > 20 then
    raise exception 'Add at most 20 tasks.';
  elsif exists (select 1 from unnest(v_tasks) t where length(t) > 500) then
    raise exception 'Each task can be at most 500 characters.';
  end if;

  select kind, label into v_kind, v_label from public.day_info(v_uid, v_today);
  if v_kind = 'weekly_off' then
    raise exception 'Today is a weekly off. The office is closed.';
  elsif v_kind = 'holiday' then
    raise exception 'Today is a holiday: %.', v_label;
  elsif v_kind = 'leave' then
    raise exception 'You are on approved leave today (%).', v_label;
  end if;

  if exists (select 1 from public.attendance where employee_id = v_uid and work_date = v_today) then
    raise exception 'You have already clocked in today.';
  end if;

  insert into public.attendance (employee_id, work_date, clock_in)
  values (v_uid, v_today, now())
  returning * into v_row;

  insert into public.attendance_tasks (attendance_id, title, planned, done, sort_order)
  select v_row.id, t, true, false, ord::int from unnest(v_tasks) with ordinality as u(t, ord);

  return v_row;
end $$;
revoke execute on function public.clock_in(text[]) from public, anon;
grant  execute on function public.clock_in(text[]) to authenticated;

-- ---------- Clock out --------------------------------------------------
-- p_done:    ids of planned tasks that were completed
-- p_extra:   extra tasks done that were not planned
-- p_summary: short summary of the day's work (required)
create or replace function public.clock_out(p_done uuid[], p_extra text[], p_summary text)
returns public.attendance
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := public.local_today();
  v_row     public.attendance;
  v_extra   text[];
  v_summary text := trim(coalesce(p_summary, ''));
  v_max     int;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;

  select * into v_row from public.attendance
  where employee_id = v_uid and work_date = v_today and clock_out is null
  for update;
  if not found then
    raise exception 'You are not clocked in today.';
  end if;

  if length(v_summary) < 3 then
    raise exception 'Write a short summary of what you did today.';
  elsif length(v_summary) > 2000 then
    raise exception 'The summary can be at most 2000 characters.';
  end if;

  select array_agg(t order by ord) into v_extra
  from (select trim(x) as t, ord from unnest(coalesce(p_extra, '{}')) with ordinality as u(x, ord)) q
  where t <> '';
  if coalesce(array_length(v_extra, 1), 0) > 20 then
    raise exception 'Add at most 20 extra tasks.';
  elsif exists (select 1 from unnest(coalesce(v_extra, '{}')) t where length(t) > 500) then
    raise exception 'Each task can be at most 500 characters.';
  end if;

  update public.attendance_tasks
  set done = (id = any (coalesce(p_done, '{}')))
  where attendance_id = v_row.id and planned;

  select coalesce(max(sort_order), 0) into v_max from public.attendance_tasks where attendance_id = v_row.id;
  insert into public.attendance_tasks (attendance_id, title, planned, done, sort_order)
  select v_row.id, t, false, true, v_max + ord::int from unnest(coalesce(v_extra, '{}')) with ordinality as u(t, ord);

  update public.attendance
  set clock_out = now(), summary = v_summary
  where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;
revoke execute on function public.clock_out(uuid[], text[], text) from public, anon;
grant  execute on function public.clock_out(uuid[], text[], text) to authenticated;

-- ---------- Admin: whole team for one day ------------------------------
create or replace function public.team_day(p_date date)
returns table (
  employee_id    uuid,
  full_name      text,
  emp_code       text,
  designation    text,
  avatar_url     text,
  department     text,
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
begin
  if not public.is_admin() then
    raise exception 'Only admins can view the team board.' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.full_name, p.emp_code, p.designation, p.avatar_url, d.name,
    di.kind, di.label,
    a.id, a.clock_in, a.clock_out, a.status, a.is_late, a.early_leave, a.worked_minutes, a.summary, a.admin_note,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'planned', t.planned, 'done', t.done)
                       order by t.planned desc, t.sort_order)
      from public.attendance_tasks t where t.attendance_id = a.id
    ), '[]'::jsonb)
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  left join public.attendance a on a.employee_id = p.id and a.work_date = p_date
  cross join lateral public.day_info(p.id, p_date) di
  where p.is_active
    and p.role = 'employee'
    and (p.date_of_joining is null or p.date_of_joining <= p_date)
  order by p.full_name;
end $$;
revoke execute on function public.team_day(date) from public, anon;
grant  execute on function public.team_day(date) to authenticated;

-- ---------- Nightly job: 23:59 IST = 18:29 UTC -------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'close-missed-clock-outs';
  perform cron.schedule('close-missed-clock-outs', '29 18 * * *', 'select public.close_missed_clock_outs()');
exception when others then
  raise notice 'pg_cron not available (%). Missed clock-outs are still closed on the next clock-in and when the admin opens the Today board.', sqlerrm;
end $$;
