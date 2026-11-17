-- =====================================================================
-- 0014  "Forgot to clock out?" requests
-- An employee whose day was closed as missed_clock_out can ask for it to be
-- fixed: actual leaving time, completed tasks, a summary and a reason.
-- The admin approves (optionally adjusting the time) or rejects.
-- Approving writes the clock-out; the attendance trigger recomputes the status.
-- =====================================================================

create table if not exists public.clockout_fix_requests (
  id             uuid primary key default gen_random_uuid(),
  attendance_id  uuid not null references public.attendance(id) on delete cascade,
  employee_id    uuid not null references public.profiles(id) on delete cascade,
  work_date      date not null,
  clock_out      timestamptz not null,
  done_task_ids  uuid[] not null default '{}',
  summary        text not null check (length(trim(summary)) between 3 and 2000),
  reason         text not null check (length(trim(reason)) between 3 and 500),
  status         public.request_status not null default 'pending',
  reviewed_by    uuid references public.profiles(id),
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now()
);
create index if not exists clockout_fix_emp_idx      on public.clockout_fix_requests(employee_id, work_date);
create index if not exists clockout_fix_att_idx      on public.clockout_fix_requests(attendance_id);
create index if not exists clockout_fix_status_idx   on public.clockout_fix_requests(status);
create index if not exists clockout_fix_reviewer_idx on public.clockout_fix_requests(reviewed_by);
-- one open request per day
create unique index if not exists clockout_fix_one_pending on public.clockout_fix_requests(attendance_id) where status = 'pending';

alter table public.clockout_fix_requests enable row level security;
drop policy if exists "read: own or admin" on public.clockout_fix_requests;
create policy "read: own or admin" on public.clockout_fix_requests for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_admin()));
-- no write policies: all changes go through the functions below

-- ---------- Employee: ask for a fix -------------------------------------
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

  v_out := (a.work_date + p_time) at time zone public.company_tz();
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

-- ---------- Employee: withdraw a pending request -------------------------
create or replace function public.cancel_clockout_fix(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.clockout_fix_requests set status = 'cancelled'
  where id = p_id and employee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Request not found or already reviewed.' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.cancel_clockout_fix(uuid) from public, anon;
grant  execute on function public.cancel_clockout_fix(uuid) to authenticated;

-- ---------- Admin: approve / reject --------------------------------------
-- p_time lets the admin correct the leaving time while approving (null = as requested).
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
    v_out := case when p_time is null then r.clock_out else (r.work_date + p_time) at time zone public.company_tz() end;
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
