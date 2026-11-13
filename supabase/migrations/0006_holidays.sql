-- =====================================================================
-- 0006  Holidays & floating-holiday swaps
-- Employees can move any holiday marked 'floating' to another working
-- day of the same year. Every swap needs admin approval.
-- =====================================================================

create index if not exists floating_swaps_status_idx on public.floating_swaps(status);
create index if not exists floating_swaps_emp_idx on public.floating_swaps(employee_id, new_date);

-- ---------- Employee: request a swap ------------------------------------
create or replace function public.request_floating_swap(p_holiday uuid, p_new_date date, p_reason text)
returns public.floating_swaps
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_today  date := public.local_today();
  v_hol    public.holidays;
  v_kind   text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_row    public.floating_swaps;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;

  select * into v_hol from public.holidays where id = p_holiday;
  if not found then
    raise exception 'That holiday no longer exists.';
  elsif v_hol.type <> 'floating' then
    raise exception 'Only floating holidays can be moved.';
  elsif v_hol.date < v_today then
    raise exception 'This holiday has already passed.';
  end if;

  if p_new_date is null then
    raise exception 'Pick the day you want off instead.';
  elsif p_new_date < v_today then
    raise exception 'Pick a day from today onwards.';
  elsif p_new_date = v_hol.date then
    raise exception 'Pick a different day from the holiday itself.';
  elsif extract(year from p_new_date) <> extract(year from v_hol.date) then
    raise exception 'The new day must be in the same year as the holiday (%).', extract(year from v_hol.date)::int;
  end if;

  if length(coalesce(v_reason, '')) > 500 then
    raise exception 'Keep the reason under 500 characters.';
  end if;

  if exists (select 1 from public.floating_swaps
             where employee_id = v_uid and holiday_id = p_holiday and status in ('pending', 'approved')) then
    raise exception 'You already have a request for this holiday.';
  end if;

  if exists (select 1 from public.floating_swaps
             where employee_id = v_uid and new_date = p_new_date and status in ('pending', 'approved')) then
    raise exception 'You already asked for % as a holiday.', to_char(p_new_date, 'DD Mon YYYY');
  end if;

  select kind into v_kind from public.day_info(v_uid, p_new_date);
  if v_kind <> 'working' then
    raise exception '% is not a working day for you. Pick a regular working day.', to_char(p_new_date, 'DD Mon YYYY');
  end if;

  if exists (select 1 from public.attendance where employee_id = v_uid and work_date = p_new_date) then
    raise exception 'You already have attendance on %.', to_char(p_new_date, 'DD Mon YYYY');
  end if;

  insert into public.floating_swaps (employee_id, holiday_id, new_date, reason)
  values (v_uid, p_holiday, p_new_date, v_reason)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.request_floating_swap(uuid, date, text) from public, anon;
grant  execute on function public.request_floating_swap(uuid, date, text) to authenticated;

-- ---------- Employee: cancel own pending request ------------------------
create or replace function public.cancel_floating_swap(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.floating_swaps
  set status = 'cancelled'
  where id = p_id and employee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'This request can no longer be cancelled.';
  end if;
end $$;
revoke execute on function public.cancel_floating_swap(uuid) from public, anon;
grant  execute on function public.cancel_floating_swap(uuid) to authenticated;

-- ---------- Admin: approve / reject --------------------------------------
create or replace function public.review_floating_swap(p_id uuid, p_approve boolean, p_note text)
returns public.floating_swaps
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row  public.floating_swaps;
  v_hol  public.holidays;
  v_kind text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can review requests.' using errcode = '42501';
  end if;

  select * into v_row from public.floating_swaps where id = p_id for update;
  if not found or v_row.status <> 'pending' then
    raise exception 'This request has already been handled.';
  end if;

  if p_approve then
    select * into v_hol from public.holidays where id = v_row.holiday_id;
    if v_hol.type <> 'floating' then
      raise exception 'This holiday is no longer floating, so it can''t be moved.';
    elsif v_hol.date < public.local_today() then
      raise exception 'The holiday has already passed. Reject this request instead.';
    end if;
    select kind into v_kind from public.day_info(v_row.employee_id, v_row.new_date);
    if v_kind <> 'working' then
      raise exception '% is no longer a working day for this employee.', to_char(v_row.new_date, 'DD Mon YYYY');
    end if;
    if exists (select 1 from public.attendance where employee_id = v_row.employee_id and work_date = v_row.new_date) then
      raise exception 'The employee already has attendance on %.', to_char(v_row.new_date, 'DD Mon YYYY');
    end if;
  elsif v_note is null then
    raise exception 'Add a short reason when rejecting.';
  end if;

  update public.floating_swaps
  set status      = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = v_note
  where id = p_id
  returning * into v_row;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_approve then 'swap.approve' else 'swap.reject' end, 'floating_swap', p_id::text,
          jsonb_build_object('employee_id', v_row.employee_id, 'new_date', v_row.new_date));
  return v_row;
end $$;
revoke execute on function public.review_floating_swap(uuid, boolean, text) from public, anon;
grant  execute on function public.review_floating_swap(uuid, boolean, text) to authenticated;

-- ---------- Guard: a holiday with live swaps can't stop being floating ---
create or replace function public.holidays_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.type = 'floating' and new.type <> 'floating') or old.date <> new.date then
    if exists (select 1 from public.floating_swaps where holiday_id = old.id and status in ('pending', 'approved')) then
      raise exception 'Employees have moved or asked to move this holiday. Reject or cancel those requests first.';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.holidays_guard() from public, anon, authenticated;

drop trigger if exists holidays_guard on public.holidays;
create trigger holidays_guard before update on public.holidays
  for each row execute function public.holidays_guard();
