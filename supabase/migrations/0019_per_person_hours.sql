-- =====================================================================
-- 0019  Per-person working hours
--
-- Each employee has a schedule:
--   standard  company hours from Settings (default)
--   custom    their own start / end, e.g. 11:00-19:00 or a night shift
--             22:00-06:00 (end before start = ends the next day)
--   none      attendance not tracked (e.g. editors paid per project):
--             no clock-in, never late, never absent
--
-- A night shift belongs to the day it STARTED: clocking out at 06:00 on
-- Tuesday closes Monday's record. An open record becomes "missed clock-out"
-- 4 hours after the shift should have ended (never before midnight), so
-- night workers are not cut off at midnight.
-- =====================================================================

alter table public.profiles add column if not exists schedule text not null default 'standard';
alter table public.profiles add column if not exists shift_start time;
alter table public.profiles add column if not exists shift_end time;
alter table public.profiles drop constraint if exists profiles_schedule_check;
alter table public.profiles add constraint profiles_schedule_check check (
  schedule in ('standard', 'custom', 'none')
  and (schedule <> 'custom' or (shift_start is not null and shift_end is not null and shift_start <> shift_end))
);

-- ---------- The hours that apply to one employee ----------------------
create or replace function public._employee_shift(p_employee uuid)
returns table (tracked boolean, start_at time, end_at time, minutes int, overnight boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sched text;
  v_s     time;
  v_e     time;
begin
  select coalesce(p.schedule, 'standard'),
         case when p.schedule = 'custom' then p.shift_start else s.work_start end,
         case when p.schedule = 'custom' then p.shift_end   else s.work_end   end
    into v_sched, v_s, v_e
  from public.settings s
  left join public.profiles p on p.id = p_employee
  where s.id = 1;

  return query select
    v_sched <> 'none',
    v_s,
    v_e,
    ((floor(extract(epoch from (v_e - v_s)) / 60)::int % 1440) + 1440) % 1440,
    v_e < v_s;
end $$;
revoke execute on function public._employee_shift(uuid) from public, anon, authenticated;

-- When an open record for this work date counts as a missed clock-out.
create or replace function public._attendance_cutoff(p_employee uuid, p_date date)
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(
    (p_date + 1)::timestamp at time zone public.company_tz(),
    ((p_date + sh.start_at) + make_interval(mins => sh.minutes) + interval '4 hours') at time zone public.company_tz()
  )
  from public._employee_shift(p_employee) sh;
$$;
revoke execute on function public._attendance_cutoff(uuid, date) from public, anon, authenticated;

-- The work date an employee is on right now: yesterday while a night shift
-- that started yesterday is still running, otherwise today.
create or replace function public._shift_date(p_employee uuid)
returns date
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.local_today();
  v_now   time := (now() at time zone public.company_tz())::time;
  sh      record;
begin
  select * into sh from public._employee_shift(p_employee);
  if exists (
    select 1 from public.attendance a
    where a.employee_id = p_employee and a.work_date = v_today - 1 and a.clock_out is null
      and now() < public._attendance_cutoff(p_employee, a.work_date)
  ) then
    return v_today - 1;
  end if;
  if sh.tracked and sh.overnight and v_now < sh.end_at then
    return v_today - 1;
  end if;
  return v_today;
end $$;
revoke execute on function public._shift_date(uuid) from public, anon, authenticated;

-- ---------- Employee: my hours + the work date to show ----------------
create or replace function public.my_shift()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_day date;
  sh    record;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into sh from public._employee_shift(v_uid);
  v_day := public._shift_date(v_uid);
  return jsonb_build_object(
    'tracked',   sh.tracked,
    'start',     to_char(sh.start_at, 'HH24:MI'),
    'end',       to_char(sh.end_at, 'HH24:MI'),
    'minutes',   sh.minutes,
    'overnight', sh.overnight,
    'day',       v_day,
    'ends_at',   ((v_day + sh.start_at) + make_interval(mins => sh.minutes)) at time zone public.company_tz()
  );
end $$;
revoke execute on function public.my_shift() from public, anon;
grant  execute on function public.my_shift() to authenticated;

-- ---------- What kind of day is it? (+ "untracked") --------------------
-- A working day of an employee whose attendance isn't tracked is
-- 'untracked' (never absent). On a half-day leave the label says so.
create or replace function public.day_info(p_employee uuid, p_date date)
returns table (kind text, label text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_off     smallint[];
  v_name    text;
  v_part    public.day_part;
  v_tracked boolean;
begin
  if p_employee is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select weekly_off into v_off from public.settings where id = 1;
  select coalesce(schedule, 'standard') <> 'none' into v_tracked from public.profiles where id = p_employee;
  v_tracked := coalesce(v_tracked, true);

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
    elsif not v_tracked then
      return query select 'untracked'::text, v_name || case when v_part = 'first_half' then ' (first half)' else ' (second half)' end;
    else
      return query select 'half_leave'::text, v_name || case when v_part = 'first_half' then ' (first half)' else ' (second half)' end;
    end if;
    return;
  end if;

  if not v_tracked then
    return query select 'untracked'::text, null::text;
    return;
  end if;
  return query select 'working'::text, null::text;
end $$;

-- ---------- Status computation with per-person hours -------------------
create or replace function public.attendance_compute()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s         public.settings;
  sh        record;
  v_part    public.day_part;
  v_base    timestamp;      -- shift start on the work date (local time)
  v_start   timestamp;      -- when they are expected in
  v_end     timestamp;      -- when they may leave
  v_need    int;            -- minutes that make a full day
  v_halfmin numeric;        -- below this many minutes -> half_day status
  v_full    boolean := false;
begin
  select * into s from public.settings where id = 1;
  select * into sh from public._employee_shift(new.employee_id);

  select lr.day_part into v_part
  from public.leave_requests lr
  where lr.employee_id = new.employee_id and lr.status = 'approved'
    and new.work_date between lr.start_date and lr.end_date
  order by (lr.day_part = 'full') desc
  limit 1;

  v_base    := new.work_date + sh.start_at;
  v_start   := v_base;
  v_end     := v_base + make_interval(mins => sh.minutes);
  v_need    := sh.minutes;
  v_halfmin := s.half_day_min_hours * 60;
  if v_part = 'first_half' then
    v_start   := v_base + make_interval(mins => sh.minutes / 2);
    v_need    := sh.minutes / 2;
    v_halfmin := v_halfmin / 2;
  elsif v_part = 'second_half' then
    v_end     := v_base + make_interval(mins => sh.minutes / 2);
    v_need    := sh.minutes / 2;
    v_halfmin := v_halfmin / 2;
  end if;

  new.late_in := sh.tracked and (new.clock_in at time zone s.timezone) > v_start + make_interval(mins => s.grace_minutes);

  if new.clock_out is not null then
    new.worked_minutes := floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::int;
    v_full := new.worked_minutes >= v_need;
    new.is_late := new.late_in and not v_full;
    new.early_leave := sh.tracked and not v_full and (new.clock_out at time zone s.timezone) < v_end;
    new.status := case
      when not sh.tracked then 'present'
      when new.worked_minutes < v_halfmin then 'half_day'
      when new.is_late then 'late'
      else 'present'
    end;
  else
    new.is_late := new.late_in;
    new.worked_minutes := null;
    new.early_leave := false;
    new.status := case
      when now() >= public._attendance_cutoff(new.employee_id, new.work_date) then 'missed_clock_out'
      when new.is_late then 'late'
      else 'present'
    end;
  end if;
  return new;
end $$;
revoke execute on function public.attendance_compute() from public, anon, authenticated;

-- Changing someone's hours re-computes their records.
create or replace function public.profiles_schedule_recompute()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.attendance set clock_in = clock_in where employee_id = new.id;
  return null;
end $$;
revoke execute on function public.profiles_schedule_recompute() from public, anon, authenticated;
drop trigger if exists profiles_schedule_recompute on public.profiles;
create trigger profiles_schedule_recompute
  after update of schedule, shift_start, shift_end on public.profiles
  for each row
  when (old.schedule is distinct from new.schedule or old.shift_start is distinct from new.shift_start or old.shift_end is distinct from new.shift_end)
  execute function public.profiles_schedule_recompute();

-- ---------- Close records nobody clocked out of -------------------------
create or replace function public.close_missed_clock_outs()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.attendance a set clock_out = null
  where a.clock_out is null and a.status <> 'missed_clock_out'
    and a.work_date < public.local_today() + 1
    and now() >= public._attendance_cutoff(a.employee_id, a.work_date);
  get diagnostics v_count = row_count;
  perform public.process_exits();
  return v_count;
end $$;
revoke execute on function public.close_missed_clock_outs() from public, anon;
grant  execute on function public.close_missed_clock_outs() to authenticated;

-- ---------- Clock in (on the shift's work date) -------------------------
create or replace function public.clock_in(p_tasks text[])
returns public.attendance
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_day   date;
  v_kind  text;
  v_label text;
  v_tasks text[];
  v_row   public.attendance;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;

  perform public.close_missed_clock_outs();
  v_day := public._shift_date(v_uid);

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

  if exists (select 1 from public.attendance where employee_id = v_uid and work_date = v_day) then
    raise exception 'You have already clocked in for this shift.';
  end if;

  select kind, label into v_kind, v_label from public.day_info(v_uid, v_day);
  if v_kind = 'untracked' then
    raise exception 'Your attendance isn''t tracked, so there''s no need to clock in.';
  elsif v_kind = 'weekly_off' then
    raise exception 'Today is a weekly off. The office is closed.';
  elsif v_kind = 'holiday' then
    raise exception 'Today is a holiday: %.', v_label;
  elsif v_kind = 'leave' then
    raise exception 'You are on approved leave today (%).', v_label;
  end if;


  insert into public.attendance (employee_id, work_date, clock_in)
  values (v_uid, v_day, now())
  returning * into v_row;

  insert into public.attendance_tasks (attendance_id, title, planned, done, sort_order)
  select v_row.id, t, true, false, ord::int from unnest(v_tasks) with ordinality as u(t, ord);

  return v_row;
end $$;
revoke execute on function public.clock_in(text[]) from public, anon;
grant  execute on function public.clock_in(text[]) to authenticated;

-- ---------- Clock out (closes the running shift, even after midnight) ---
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

  select * into v_row from public.attendance a
  where a.employee_id = v_uid and a.work_date between v_today - 1 and v_today and a.clock_out is null
    and now() < public._attendance_cutoff(v_uid, a.work_date)
  order by a.work_date desc
  limit 1
  for update;
  if not found then
    raise exception 'You are not clocked in.';
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

-- ---------- Missed clock-out fixes: a night shift ends the next day -----
-- A leaving time earlier than the clock-in time means the next morning
-- for night-shift employees.
create or replace function public._fix_out_time(p_employee uuid, p_date date, p_clock_in timestamptz, p_time time)
returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out timestamptz := (p_date + p_time) at time zone public.company_tz();
begin
  if v_out <= p_clock_in and (select overnight from public._employee_shift(p_employee)) then
    v_out := v_out + interval '1 day';
  end if;
  return v_out;
end $$;
revoke execute on function public._fix_out_time(uuid, date, timestamptz, time) from public, anon, authenticated;

create or replace function public.request_clockout_fix(
  p_attendance uuid,
  p_time       time,
  p_done       uuid[],
  p_summary    text,
  p_reason     text
)
returns public.clockout_fix_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  a     public.attendance;
  v_out timestamptz;
  r     public.clockout_fix_requests;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;

  perform public.close_missed_clock_outs();
  select * into a from public.attendance where id = p_attendance and employee_id = v_uid;
  if not found then
    raise exception 'Attendance record not found.' using errcode = 'P0001';
  end if;
  if a.clock_out is not null or a.status <> 'missed_clock_out' then
    raise exception 'This day is not marked as a missed clock-out.' using errcode = 'P0001';
  end if;
  if a.work_date < public.local_today() - 30 then
    raise exception 'Fix requests can only be made within 30 days. Please ask your admin.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.clockout_fix_requests where attendance_id = a.id and status = 'pending') then
    raise exception 'You already have a request waiting for this day.' using errcode = 'P0001';
  end if;
  if p_time is null then
    raise exception 'Enter the time you left.' using errcode = 'P0001';
  end if;

  v_out := public._fix_out_time(v_uid, a.work_date, a.clock_in, p_time);
  if v_out <= a.clock_in then
    raise exception 'Leaving time must be after your clock-in (%).',
      to_char(a.clock_in at time zone public.company_tz(), 'HH24:MI') using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_summary, ''))) < 3 then
    raise exception 'Write a short summary of what you did.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say briefly why you missed the clock-out.' using errcode = 'P0001';
  end if;

  insert into public.clockout_fix_requests (attendance_id, employee_id, work_date, clock_out, done_task_ids, summary, reason)
  values (
    a.id, v_uid, a.work_date, v_out,
    coalesce((select array_agg(t.id) from public.attendance_tasks t where t.attendance_id = a.id and t.id = any (coalesce(p_done, '{}'))), '{}'),
    trim(p_summary), trim(p_reason)
  )
  returning * into r;
  return r;
end $$;
revoke execute on function public.request_clockout_fix(uuid, time, uuid[], text, text) from public, anon;
grant  execute on function public.request_clockout_fix(uuid, time, uuid[], text, text) to authenticated;

create or replace function public.review_clockout_fix(p_id uuid, p_approve boolean, p_note text, p_time time default null)
returns public.clockout_fix_requests
language plpgsql security definer set search_path = '' as $$
declare
  r     public.clockout_fix_requests;
  a     public.attendance;
  v_out timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review requests.' using errcode = '42501';
  end if;
  select * into r from public.clockout_fix_requests where id = p_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'Request not found or already reviewed.' using errcode = 'P0001';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Add a short note so the employee knows why.' using errcode = 'P0001';
  end if;

  if p_approve then
    select * into a from public.attendance where id = r.attendance_id for update;
    if a.clock_out is not null then
      raise exception 'This day already has a clock-out (it was edited). Reject this request instead.' using errcode = 'P0001';
    end if;
    v_out := case when p_time is null then r.clock_out else public._fix_out_time(r.employee_id, r.work_date, a.clock_in, p_time) end;
    if v_out <= a.clock_in then
      raise exception 'Clock-out must be after clock-in.' using errcode = 'P0001';
    end if;

    update public.attendance_tasks set done = true where attendance_id = a.id and id = any (r.done_task_ids);
    update public.attendance
       set clock_out = v_out,
           summary = coalesce(nullif(trim(a.summary), ''), r.summary),
           admin_note = concat_ws(' · ', nullif(a.admin_note, ''),
                                  'Clock-out added on request: ' || r.reason || coalesce(' — ' || nullif(trim(p_note), ''), ''))
     where id = a.id;
    r.clock_out := v_out;
  end if;

  update public.clockout_fix_requests
     set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
         clock_out = r.clock_out,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_id
  returning * into r;

  perform public.log_action(case when p_approve then 'clockout_fix.approve' else 'clockout_fix.reject' end,
                            'clockout_fix', p_id::text, jsonb_build_object('date', r.work_date, 'clock_out', r.clock_out));
  return r;
end $$;
revoke execute on function public.review_clockout_fix(uuid, boolean, text, time) from public, anon;
grant  execute on function public.review_clockout_fix(uuid, boolean, text, time) to authenticated;

-- ---------- Admin: team board shows each person's hours -----------------
drop function if exists public.team_day(date);
create function public.team_day(p_date date)
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
  tasks          jsonb,
  shift_start    text,
  shift_end      text,
  overnight      boolean
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
    ), '[]'::jsonb),
    to_char(sh.start_at, 'HH24:MI'), to_char(sh.end_at, 'HH24:MI'), sh.overnight
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  left join public.attendance a on a.employee_id = p.id and a.work_date = p_date
  cross join lateral public.day_info(p.id, p_date) di
  cross join lateral public._employee_shift(p.id) sh
  where p.is_active
    and p.role = 'employee'
    and (p.date_of_joining is null or p.date_of_joining <= p_date)
  order by p.full_name;
end $$;
revoke execute on function public.team_day(date) from public, anon;
grant  execute on function public.team_day(date) to authenticated;

-- ---------- Payroll: untracked working days count as present ------------
create or replace function public._payroll_stats(p_employee uuid, p_month date)
returns table (working_days numeric, present_days numeric, leave_days numeric, overtime_hours numeric)
language sql stable security definer set search_path = '' as $$
  with days as (
    select di.kind, di.label
    from generate_series(date_trunc('month', p_month), date_trunc('month', p_month) + interval '1 month - 1 day', interval '1 day') g(d)
    cross join lateral public.day_info(p_employee, g.d::date) di
  )
  select
    (select count(*) filter (where kind in ('working', 'leave', 'half_leave', 'untracked')) from days)::numeric,
    (select coalesce(sum(case when a.status = 'half_day' then 0.5 else 1 end), 0)
       from public.attendance a
      where a.employee_id = p_employee
        and a.work_date >= date_trunc('month', p_month)::date
        and a.work_date < (date_trunc('month', p_month) + interval '1 month')::date)::numeric
    + case when exists (select 1 from public.profiles where id = p_employee and schedule = 'none')
           then (select coalesce(sum(case when label is null then 1 else 0.5 end), 0) from days where kind = 'untracked')
           else 0 end,
    (select coalesce(sum(case when kind = 'leave' then 1
                              when kind = 'half_leave' then 0.5
                              when kind = 'untracked' and label is not null then 0.5
                              else 0 end), 0) from days)::numeric,
    (select coalesce(sum(o.hours), 0)
       from public.overtime_entries o
      where o.employee_id = p_employee and o.status = 'approved'
        and o.work_date >= date_trunc('month', p_month)::date
        and o.work_date < (date_trunc('month', p_month) + interval '1 month')::date)::numeric;
$$;
revoke execute on function public._payroll_stats(uuid, date) from public, anon, authenticated;

-- ---------- Hourly job: missed clock-outs + exits ----------------------
-- (was once a day at 23:59; night shifts need it to run after their end)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'close-missed-clock-outs';
  perform cron.schedule('close-missed-clock-outs', '30 * * * *', 'select public.close_missed_clock_outs()');
exception when others then
  raise notice 'pg_cron not available (%). Missed clock-outs are still closed on the next clock-in and when the admin opens the Today board.', sqlerrm;
end $$;

-- Re-compute existing records (nobody has custom hours yet, so nothing changes).
update public.attendance set clock_in = clock_in;
