-- =====================================================================
-- 0008  Extra hours (overtime)
-- Employees log extra hours per date; admin approves or rejects.
-- Approved hours are shown on payroll as a reference for "Extra Pay".
-- =====================================================================

-- One live (pending/approved) entry per employee per date
create unique index if not exists overtime_live_uidx on public.overtime_entries(employee_id, work_date)
  where status in ('pending', 'approved');
create index if not exists overtime_status_idx on public.overtime_entries(status);

-- ---------- Employee: log ----------------------------------------------
create or replace function public.log_overtime(p_date date, p_hours numeric, p_description text)
returns public.overtime_entries
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := public.local_today();
  v_desc  text := trim(coalesce(p_description, ''));
  v_row   public.overtime_entries;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Pick the date you worked extra.';
  elsif p_date > v_today then
    raise exception 'You can only log extra hours for today or earlier.';
  elsif p_date < v_today - 45 then
    raise exception 'That date is too old. Log extra hours within 45 days.';
  end if;
  if p_hours is null or p_hours <= 0 then
    raise exception 'Enter the number of extra hours.';
  elsif p_hours > 16 then
    raise exception 'At most 16 extra hours per day.';
  elsif p_hours * 4 <> floor(p_hours * 4) then
    raise exception 'Use quarter hours, e.g. 1.25, 1.5 or 2.';
  end if;
  if length(v_desc) < 3 then
    raise exception 'Describe what you worked on.';
  elsif length(v_desc) > 1000 then
    raise exception 'Keep the description under 1000 characters.';
  end if;
  if exists (select 1 from public.overtime_entries
             where employee_id = v_uid and work_date = p_date and status in ('pending', 'approved')) then
    raise exception 'You already logged extra hours for %. Cancel that entry to change it.', to_char(p_date, 'DD Mon YYYY');
  end if;

  insert into public.overtime_entries (employee_id, work_date, hours, description)
  values (v_uid, p_date, p_hours, v_desc)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.log_overtime(date, numeric, text) from public, anon;
grant  execute on function public.log_overtime(date, numeric, text) to authenticated;

-- ---------- Employee: cancel own pending --------------------------------
create or replace function public.cancel_overtime(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.overtime_entries set status = 'cancelled'
  where id = p_id and employee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'This entry can no longer be cancelled.';
  end if;
end $$;
revoke execute on function public.cancel_overtime(uuid) from public, anon;
grant  execute on function public.cancel_overtime(uuid) to authenticated;

-- ---------- Admin: approve / reject / revoke ----------------------------
create or replace function public.review_overtime(p_id uuid, p_approve boolean, p_note text)
returns public.overtime_entries
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row  public.overtime_entries;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can review extra hours.' using errcode = '42501';
  end if;
  select * into v_row from public.overtime_entries where id = p_id for update;
  if not found then
    raise exception 'Entry not found.';
  end if;

  if v_row.status = 'pending' then
    if not p_approve and v_note is null then
      raise exception 'Add a short reason when rejecting.';
    end if;
  elsif v_row.status = 'approved' and not p_approve then
    if v_note is null then
      raise exception 'Add a short reason when revoking.';
    end if;
  else
    raise exception 'This entry has already been handled.';
  end if;

  update public.overtime_entries
  set status      = case when p_approve then 'approved'::public.request_status
                         when v_row.status = 'approved' then 'cancelled'::public.request_status
                         else 'rejected'::public.request_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = v_note
  where id = p_id
  returning * into v_row;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'overtime.' || v_row.status::text, 'overtime_entry', p_id::text,
          jsonb_build_object('employee_id', v_row.employee_id, 'date', v_row.work_date, 'hours', v_row.hours));
  return v_row;
end $$;
revoke execute on function public.review_overtime(uuid, boolean, text) from public, anon;
grant  execute on function public.review_overtime(uuid, boolean, text) to authenticated;
