-- =====================================================================
-- 0016  A full day of hours clears "late" (and "left early")
--
-- Before: late = clocked in after start + grace, whatever the hours.
-- Now:    once someone clocks out having worked a full shift
--         (work_end - work_start, e.g. 09:00-17:00 = 8h), the day is not
--         late and not early leave. The raw arrival is kept in late_in.
--         While still clocked in, a late arrival shows as late until the
--         full shift is done.
-- =====================================================================

alter table public.attendance add column if not exists late_in boolean not null default false;

create or replace function public.attendance_compute()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s        public.settings;
  v_in     time;
  v_cutoff time;
  v_shift  int;
  v_full   boolean := false;
begin
  select * into s from public.settings where id = 1;
  v_in     := (new.clock_in at time zone s.timezone)::time;
  v_cutoff := s.work_start + make_interval(mins => s.grace_minutes);
  v_shift  := floor(extract(epoch from (s.work_end - s.work_start)) / 60)::int;
  new.late_in := v_in > v_cutoff;

  if new.clock_out is not null then
    new.worked_minutes := floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::int;
    v_full := new.worked_minutes >= v_shift;
    new.is_late := new.late_in and not v_full;
    new.early_leave := not v_full
                       and (new.clock_out at time zone s.timezone)::date = new.work_date
                       and (new.clock_out at time zone s.timezone)::time < s.work_end;
    new.status := case
      when new.worked_minutes < s.half_day_min_hours * 60 then 'half_day'
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

-- Recompute existing rows (touching clock_in re-runs the trigger).
update public.attendance set clock_in = clock_in;
