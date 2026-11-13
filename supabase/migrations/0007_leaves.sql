-- =====================================================================
-- 0007  Leave management
--  * day counting skips Sundays, holidays and moved floating holidays
--  * balances: pending is reserved when applying, moved to used on approval,
--    released on reject/cancel. No carry forward (decided 2026-11-13).
--  * private storage bucket for attachments (e.g. medical notes)
-- =====================================================================

-- ---------- Year setup: policies + balances ---------------------------
-- Copies the latest earlier quota for each active type, then gives every
-- active employee a balance row. Safe to call repeatedly.
create or replace function public._ensure_leave_year(p_year int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.leave_policies (leave_type_id, year, default_quota)
  select lt.id, p_year,
         coalesce((select lp.default_quota from public.leave_policies lp
                   where lp.leave_type_id = lt.id and lp.year < p_year
                   order by lp.year desc limit 1), 0)
  from public.leave_types lt
  where lt.is_active
  on conflict (leave_type_id, year) do nothing;

  insert into public.leave_balances (employee_id, leave_type_id, year, allotted)
  select p.id, lp.leave_type_id, p_year, lp.default_quota
  from public.profiles p
  cross join public.leave_policies lp
  join public.leave_types lt on lt.id = lp.leave_type_id
  where p.role = 'employee' and p.is_active and lp.year = p_year and lt.tracks_balance and lt.is_active
  on conflict (employee_id, leave_type_id, year) do nothing;
end $$;
revoke execute on function public._ensure_leave_year(int) from public, anon, authenticated;

create or replace function public.ensure_leave_year(p_year int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can set up a leave year.' using errcode = '42501';
  end if;
  if p_year not between 2020 and 2100 then
    raise exception 'Invalid year.';
  end if;
  perform public._ensure_leave_year(p_year);
end $$;
revoke execute on function public.ensure_leave_year(int) from public, anon;
grant  execute on function public.ensure_leave_year(int) to authenticated;

-- ---------- Day-by-day breakdown of a leave range ---------------------
create or replace function public._leave_breakdown(p_employee uuid, p_start date, p_end date, p_part public.day_part)
returns table (day date, counted numeric, kind text, label text)
language sql stable security definer set search_path = '' as $$
  select g.d::date,
         case when di.kind = 'working' then (case when p_part = 'full' then 1.0 else 0.5 end) else 0 end::numeric,
         di.kind,
         di.label
  from generate_series(p_start, p_end, interval '1 day') g(d)
  cross join lateral public.day_info(p_employee, g.d::date) di;
$$;
revoke execute on function public._leave_breakdown(uuid, date, date, public.day_part) from public, anon, authenticated;

-- ---------- Shared validation (returns days requested) ----------------
create or replace function public._validate_leave(
  p_employee uuid, p_type uuid, p_start date, p_end date, p_part public.day_part, p_ignore uuid default null
) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_type public.leave_types;
  v_days numeric;
begin
  select * into v_type from public.leave_types where id = p_type;
  if not found or not v_type.is_active then
    raise exception 'Pick a leave type.';
  end if;
  if p_start is null or p_end is null then
    raise exception 'Pick the dates.';
  elsif p_end < p_start then
    raise exception 'The end date is before the start date.';
  elsif p_part <> 'full' and p_start <> p_end then
    raise exception 'A half day must be a single date.';
  elsif extract(year from p_start) <> extract(year from p_end) then
    raise exception 'Leave can''t cross into the next year. Split it into two requests.';
  elsif p_end - p_start > 62 then
    raise exception 'Apply for at most two months at a time.';
  elsif p_start < make_date(extract(year from public.local_today())::int - 1, 12, 1) then
    raise exception 'That date is too far in the past.';
  end if;

  -- Overlap with an existing live request (two different halves of one day are allowed)
  if exists (
    select 1 from public.leave_requests lr
    where lr.employee_id = p_employee
      and lr.status in ('pending', 'approved')
      and lr.id is distinct from p_ignore
      and lr.start_date <= p_end and lr.end_date >= p_start
      and not (p_part <> 'full' and lr.day_part <> 'full' and lr.day_part <> p_part and lr.start_date = p_start)
  ) then
    raise exception 'You already have leave on some of these dates.';
  end if;

  if p_part = 'full' and exists (
    select 1 from public.attendance a
    where a.employee_id = p_employee and a.work_date between p_start and p_end
  ) then
    raise exception 'You have attendance on some of these dates. Pick days you didn''t work.';
  end if;

  select coalesce(sum(counted), 0) into v_days from public._leave_breakdown(p_employee, p_start, p_end, p_part);
  if v_days = 0 then
    raise exception 'These dates are all Sundays or holidays. No leave is needed.';
  end if;
  return v_days;
end $$;
revoke execute on function public._validate_leave(uuid, uuid, date, date, public.day_part, uuid) from public, anon, authenticated;

-- ---------- Preview (for the live form) -------------------------------
create or replace function public.leave_preview(p_type uuid, p_start date, p_end date, p_part public.day_part)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_tracks   boolean;
  v_days     numeric := 0;
  v_avail    numeric;
  v_excluded jsonb;
  v_error    text;
begin
  if v_uid is null then raise exception 'Please log in again.' using errcode = '42501'; end if;

  begin
    v_days := public._validate_leave(v_uid, p_type, p_start, p_end, p_part);
  exception when others then
    v_error := sqlerrm;
  end;

  select tracks_balance into v_tracks from public.leave_types where id = p_type;
  if v_tracks and p_start is not null then
    select b.allotted + b.carried - b.used - b.pending into v_avail
    from public.leave_balances b
    where b.employee_id = v_uid and b.leave_type_id = p_type and b.year = extract(year from p_start)::int;
    v_avail := coalesce(v_avail, (select default_quota from public.leave_policies
                                  where leave_type_id = p_type and year = extract(year from p_start)::int), 0);
  end if;

  if p_start is not null and p_end is not null and p_end >= p_start and p_end - p_start <= 62 then
    select coalesce(jsonb_agg(jsonb_build_object('date', day, 'label', coalesce(label, 'Not a working day')) order by day), '[]')
    into v_excluded
    from public._leave_breakdown(v_uid, p_start, p_end, p_part) where counted = 0;
  end if;

  if v_error is null and v_tracks and v_days > coalesce(v_avail, 0) then
    v_error := format('Not enough balance: you have %s day(s) left.', coalesce(v_avail, 0));
  end if;

  return jsonb_build_object(
    'days', v_days,
    'tracks_balance', coalesce(v_tracks, false),
    'available', v_avail,
    'excluded', coalesce(v_excluded, '[]'::jsonb),
    'error', v_error
  );
end $$;
revoke execute on function public.leave_preview(uuid, date, date, public.day_part) from public, anon;
grant  execute on function public.leave_preview(uuid, date, date, public.day_part) to authenticated;

-- ---------- Apply ------------------------------------------------------
create or replace function public.apply_leave(
  p_type uuid, p_start date, p_end date, p_part public.day_part, p_reason text, p_attachment text default null
) returns public.leave_requests
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_type   public.leave_types;
  v_days   numeric;
  v_year   int := extract(year from p_start)::int;
  v_bal    public.leave_balances;
  v_reason text := trim(coalesce(p_reason, ''));
  v_att    text := nullif(trim(coalesce(p_attachment, '')), '');
  v_row    public.leave_requests;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Write a short reason.';
  elsif length(v_reason) > 1000 then
    raise exception 'Keep the reason under 1000 characters.';
  end if;

  v_days := public._validate_leave(v_uid, p_type, p_start, p_end, p_part);
  select * into v_type from public.leave_types where id = p_type;

  if v_type.requires_attachment and v_att is null then
    raise exception '% needs a supporting document. Attach it and try again.', v_type.name;
  end if;
  if v_att is not null and v_att not like v_uid::text || '/%' then
    raise exception 'Invalid attachment.';
  end if;

  if v_type.tracks_balance then
    perform public._ensure_leave_year(v_year);
    select * into v_bal from public.leave_balances
    where employee_id = v_uid and leave_type_id = p_type and year = v_year
    for update;
    if not found then
      raise exception 'No % balance is set up for you for %. Ask your admin.', v_type.name, v_year;
    end if;
    if v_days > v_bal.allotted + v_bal.carried - v_bal.used - v_bal.pending then
      raise exception 'Not enough % balance: you asked for % day(s) but have % left.',
        v_type.name, v_days, v_bal.allotted + v_bal.carried - v_bal.used - v_bal.pending;
    end if;
    update public.leave_balances set pending = pending + v_days where id = v_bal.id;
  end if;

  insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, day_part, days, reason, attachment_path)
  values (v_uid, p_type, p_start, p_end, p_part, v_days, v_reason, v_att)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.apply_leave(uuid, date, date, public.day_part, text, text) from public, anon;
grant  execute on function public.apply_leave(uuid, date, date, public.day_part, text, text) to authenticated;

-- ---------- Balance bookkeeping helper --------------------------------
create or replace function public._leave_balance_shift(p_req public.leave_requests, p_pending numeric, p_used numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.leave_balances b
  set pending = greatest(0, b.pending + p_pending),
      used    = greatest(0, b.used + p_used)
  from public.leave_types lt
  where lt.id = p_req.leave_type_id and lt.tracks_balance
    and b.employee_id = p_req.employee_id and b.leave_type_id = p_req.leave_type_id
    and b.year = extract(year from p_req.start_date)::int;
end $$;
revoke execute on function public._leave_balance_shift(public.leave_requests, numeric, numeric) from public, anon, authenticated;

-- ---------- Employee: cancel ------------------------------------------
-- Pending: always. Approved: only if it hasn't started yet.
create or replace function public.cancel_leave(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_req public.leave_requests;
begin
  select * into v_req from public.leave_requests where id = p_id and employee_id = auth.uid() for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if v_req.status = 'pending' then
    perform public._leave_balance_shift(v_req, -v_req.days, 0);
  elsif v_req.status = 'approved' and v_req.start_date > public.local_today() then
    perform public._leave_balance_shift(v_req, 0, -v_req.days);
  else
    raise exception 'This leave can no longer be cancelled. Ask your admin.';
  end if;
  update public.leave_requests set status = 'cancelled' where id = p_id;
end $$;
revoke execute on function public.cancel_leave(uuid) from public, anon;
grant  execute on function public.cancel_leave(uuid) to authenticated;

-- ---------- Admin: approve / reject / revoke --------------------------
create or replace function public.review_leave(p_id uuid, p_approve boolean, p_note text)
returns public.leave_requests
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_req  public.leave_requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can review leave.' using errcode = '42501';
  end if;
  select * into v_req from public.leave_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;

  if v_req.status = 'pending' then
    if p_approve then
      if v_req.day_part = 'full' and exists (
        select 1 from public.attendance a
        where a.employee_id = v_req.employee_id and a.work_date between v_req.start_date and v_req.end_date
      ) then
        raise exception 'The employee has attendance on some of these dates. Reject this request instead.';
      end if;
      perform public._leave_balance_shift(v_req, -v_req.days, v_req.days);
    else
      if v_note is null then raise exception 'Add a short reason when rejecting.'; end if;
      perform public._leave_balance_shift(v_req, -v_req.days, 0);
    end if;
  elsif v_req.status = 'approved' and not p_approve then
    -- Revoke approved leave (restores the balance)
    if v_note is null then raise exception 'Add a short reason when revoking.'; end if;
    perform public._leave_balance_shift(v_req, 0, -v_req.days);
  else
    raise exception 'This request has already been handled.';
  end if;

  update public.leave_requests
  set status      = case when p_approve then 'approved'::public.request_status
                         when v_req.status = 'approved' then 'cancelled'::public.request_status
                         else 'rejected'::public.request_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = v_note
  where id = p_id
  returning * into v_req;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'leave.' || v_req.status::text, 'leave_request', p_id::text,
          jsonb_build_object('employee_id', v_req.employee_id, 'days', v_req.days, 'start', v_req.start_date, 'end', v_req.end_date));
  return v_req;
end $$;
revoke execute on function public.review_leave(uuid, boolean, text) from public, anon;
grant  execute on function public.review_leave(uuid, boolean, text) to authenticated;

-- ---------- Set up the current year now ------------------------------
select public._ensure_leave_year(extract(year from public.local_today())::int);

-- ---------- Attachments bucket (private) ------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-attachments', 'leave-attachments', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "leave files: upload own" on storage.objects;
drop policy if exists "leave files: read own or admin" on storage.objects;
drop policy if exists "leave files: delete own" on storage.objects;

create policy "leave files: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "leave files: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'leave-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "leave files: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
