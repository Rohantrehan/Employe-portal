-- =====================================================================
-- 0017  Half-day leave aware attendance
--
-- On a day with an approved half-day leave the employee only owes half
-- the shift (09:00-17:00 -> 4h, midpoint 13:00):
--   first_half  leave: late only after midpoint + grace; early leave only
--                      before work_end
--   second_half leave: late after work_start + grace (as usual); early
--                      leave only before the midpoint
--   either:            working half the shift clears late / early leave;
--                      "half day" status only under half the usual minimum
-- Approving / cancelling a leave re-computes that employee's attendance
-- rows for the dates it covers.
-- =====================================================================

create or replace function public.attendance_compute()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s        public.settings;
  v_in     time;
  v_shift  int;
  v_part   public.day_part;
  v_start  time;          -- when they are expected in
  v_end    time;          -- when they may leave
  v_need   int;           -- minutes that make a full day
  v_halfmin numeric;      -- below this many minutes -> half_day status
  v_full   boolean := false;
begin
  select * into s from public.settings where id = 1;
  v_shift := floor(extract(epoch from (s.work_end - s.work_start)) / 60)::int;

  select lr.day_part into v_part
  from public.leave_requests lr
  where lr.employee_id = new.employee_id and lr.status = 'approved'
    and new.work_date between lr.start_date and lr.end_date
  order by (lr.day_part = 'full') desc
  limit 1;

  v_start := s.work_start;
  v_end   := s.work_end;
  v_need  := v_shift;
  v_halfmin := s.half_day_min_hours * 60;
  if v_part = 'first_half' then
    v_start := s.work_start + make_interval(mins => v_shift / 2);
    v_need  := v_shift / 2;
    v_halfmin := v_halfmin / 2;
  elsif v_part = 'second_half' then
    v_end   := s.work_start + make_interval(mins => v_shift / 2);
    v_need  := v_shift / 2;
    v_halfmin := v_halfmin / 2;
  end if;

  v_in := (new.clock_in at time zone s.timezone)::time;
  new.late_in := v_in > v_start + make_interval(mins => s.grace_minutes);

  if new.clock_out is not null then
    new.worked_minutes := floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::int;
    v_full := new.worked_minutes >= v_need;
    new.is_late := new.late_in and not v_full;
    new.early_leave := not v_full
                       and (new.clock_out at time zone s.timezone)::date = new.work_date
                       and (new.clock_out at time zone s.timezone)::time < v_end;
    new.status := case
      when new.worked_minutes < v_halfmin then 'half_day'
      when new.is_late then 'late'
      else 'present'
    end;
  else
    new.is_late := new.late_in;
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

-- ---------- Re-compute attendance when a leave changes ----------------
create or replace function public.leave_recompute_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.attendance set clock_in = clock_in
     where employee_id = old.employee_id and work_date between old.start_date and old.end_date;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.attendance set clock_in = clock_in
     where employee_id = new.employee_id and work_date between new.start_date and new.end_date;
  end if;
  return null;
end $$;
revoke execute on function public.leave_recompute_attendance() from public, anon, authenticated;

drop trigger if exists leave_recompute_attendance on public.leave_requests;
create trigger leave_recompute_attendance
  after insert or update of status, day_part, start_date, end_date or delete on public.leave_requests
  for each row execute function public.leave_recompute_attendance();

-- Re-compute rows on days with an approved half-day leave.
update public.attendance a set clock_in = a.clock_in
 where exists (
   select 1 from public.leave_requests lr
    where lr.employee_id = a.employee_id and lr.status = 'approved' and lr.day_part <> 'full'
      and a.work_date between lr.start_date and lr.end_date
 );
