-- =====================================================================
-- 0027  HR role
--
-- An HR person is an employee (clock in/out, leave, contracts, payslips,
-- checklists all work as for anyone else) who also has full admin rights.
-- Stored as profiles.is_hr on an employee profile, so every "employee"
-- query keeps including them. Admin rights still need 2-step sign-in.
-- Nobody can approve or reject their own requests.
-- =====================================================================

alter table public.profiles add column if not exists is_hr boolean not null default false;
alter table public.profiles drop constraint if exists profiles_hr_is_employee;
alter table public.profiles add constraint profiles_hr_is_employee check (not is_hr or role = 'employee');

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1 from public.profiles
       where id = auth.uid() and is_active
         and (role = 'admin'
              or (is_hr and (left_on is null or left_on >= public.local_today())))
     );
$$;
revoke execute on function public.is_admin() from anon, public;
grant  execute on function public.is_admin() to authenticated;

-- ---------- No reviewing your own request ---------------------------------------
create or replace function public.no_self_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reviewed_by is not null
     and new.reviewed_by = new.employee_id
     and (tg_op = 'INSERT' or new.reviewed_by is distinct from old.reviewed_by) then
    raise exception 'You can''t review your own request. Another admin has to.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.no_self_review() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['leave_requests', 'overtime_entries', 'floating_swaps', 'clockout_fix_requests'] loop
    execute format('drop trigger if exists no_self_review on public.%I', t);
    execute format('create trigger no_self_review before insert or update of reviewed_by on public.%I for each row execute function public.no_self_review()', t);
  end loop;
end $$;

-- ---------- ...or changing your own leave balance ------------------------------
create or replace function public._set_leave_left(p_balance uuid, p_left numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b        public.leave_balances;
  v_portal numeric;
  v_base   numeric;
begin
  select * into b from public.leave_balances where id = p_balance for update;
  if not found or b.contract_id is null then
    raise exception 'Leave left can only be set on a contract.' using errcode = 'P0001';
  end if;
  if b.employee_id = auth.uid() then
    raise exception 'You can''t change your own leave. Another admin has to.' using errcode = 'P0001';
  end if;
  v_portal := b.used - b.used_before;
  if p_left is null then
    update public.leave_balances set used = v_portal, used_before = 0, set_by_hr = false where id = p_balance;
    perform public._contract_leave_sync(b.employee_id);
    return;
  end if;
  if p_left < 0 or p_left > 365 or p_left * 2 <> floor(p_left * 2) then
    raise exception 'Use whole or half days, from 0 to 365.' using errcode = 'P0001';
  end if;
  v_base := b.allotted - v_portal - b.pending;
  update public.leave_balances
     set carried      = greatest(0, p_left - v_base),
         used_before  = greatest(0, v_base - p_left),
         used         = v_portal + greatest(0, v_base - p_left),
         carried_from = null,
         set_by_hr    = true
   where id = p_balance;
end $$;
revoke execute on function public._set_leave_left(uuid, numeric) from public, anon, authenticated;

create or replace function public.set_leave_left(p_balance uuid, p_left numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change leave.' using errcode = '42501';
  end if;
  select employee_id into v_emp from public.leave_balances where id = p_balance;
  if v_emp = auth.uid() then
    raise exception 'You can''t change your own leave. Another admin has to.' using errcode = 'P0001';
  end if;
  perform public._set_leave_left(p_balance, p_left);
  perform public.log_action('leave.left', 'leave_balance', p_balance::text, jsonb_build_object('employee', v_emp, 'left', p_left));
end $$;
revoke execute on function public.set_leave_left(uuid, numeric) from public, anon;
grant  execute on function public.set_leave_left(uuid, numeric) to authenticated;

-- ---------- On their own items HR acts as the employee, not as an admin ----------

create or replace function public.reply_hr_request(p_id uuid, p_body text)
returns public.hr_request_messages
language plpgsql security definer set search_path = '' as $$
declare
  r       public.hr_requests;
  m       public.hr_request_messages;
  v_admin boolean;
  v_body  text := trim(coalesce(p_body, ''));
begin
  select * into r from public.hr_requests where id = p_id for update;
  v_admin := public.is_admin() and r.employee_id is distinct from auth.uid();
  if not found or not (v_admin or (r.employee_id = auth.uid() and public.is_active_user())) then
    raise exception 'Request not found.' using errcode = '42501';
  end if;
  if length(v_body) < 1 then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;
  if length(v_body) > 3000 then
    raise exception 'Keep the message under 3000 characters.' using errcode = 'P0001';
  end if;
  if r.status = 'withdrawn' then
    raise exception 'This request was withdrawn. Start a new one instead.' using errcode = 'P0001';
  end if;
  if not v_admin and (select count(*) from public.hr_request_messages where request_id = p_id and created_at > now() - interval '1 hour' and not from_admin) >= 20 then
    raise exception 'Too many messages in a short time. Please wait a little.' using errcode = 'P0001';
  end if;

  insert into public.hr_request_messages (request_id, author_id, from_admin, body) values (p_id, auth.uid(), v_admin, v_body) returning * into m;
  if v_admin then
    update public.hr_requests
       set last_admin_at = m.created_at, admin_seen_at = m.created_at,
           status = case when status = 'open' then 'in_progress' else status end
     where id = p_id;
    perform public.log_action('hr_request.reply', 'hr_request', p_id::text, null);
  else
    update public.hr_requests
       set last_employee_at = m.created_at, employee_seen_at = m.created_at,
           status = case when status = 'resolved' then 'open' else status end,
           resolved_at = case when status = 'resolved' then null else resolved_at end,
           resolved_by = case when status = 'resolved' then null else resolved_by end
     where id = p_id;
  end if;
  return m;
end $$;
revoke execute on function public.reply_hr_request(uuid, text) from public, anon;
grant  execute on function public.reply_hr_request(uuid, text) to authenticated;

create or replace function public.set_hr_request_status(p_id uuid, p_status text)
returns public.hr_requests
language plpgsql security definer set search_path = '' as $$
declare
  r       public.hr_requests;
  v_admin boolean;
begin
  select * into r from public.hr_requests where id = p_id for update;
  v_admin := public.is_admin() and r.employee_id is distinct from auth.uid();
  if not found or not (v_admin or (r.employee_id = auth.uid() and public.is_active_user())) then
    raise exception 'Request not found.' using errcode = '42501';
  end if;
  if v_admin then
    if p_status not in ('open', 'in_progress', 'resolved') then
      raise exception 'Pick a status.' using errcode = 'P0001';
    end if;
    if r.status = 'withdrawn' then
      raise exception 'The employee withdrew this request.' using errcode = 'P0001';
    end if;
  else
    if p_status <> 'withdrawn' then
      raise exception 'Not allowed.' using errcode = '42501';
    end if;
    if r.status in ('resolved', 'withdrawn') then
      raise exception 'This request is already %.', r.status using errcode = 'P0001';
    end if;
  end if;

  update public.hr_requests
     set status = p_status,
         resolved_at = case when p_status = 'resolved' then now() else null end,
         resolved_by = case when p_status = 'resolved' then auth.uid() else null end,
         last_admin_at = case when v_admin then now() else last_admin_at end,
         admin_seen_at = case when v_admin then now() else admin_seen_at end,
         last_employee_at = case when v_admin then last_employee_at else now() end,
         employee_seen_at = case when v_admin then employee_seen_at else now() end
   where id = p_id
  returning * into r;
  if v_admin then
    perform public.log_action('hr_request.status', 'hr_request', p_id::text, jsonb_build_object('status', p_status));
  end if;
  return r;
end $$;
revoke execute on function public.set_hr_request_status(uuid, text) from public, anon;
grant  execute on function public.set_hr_request_status(uuid, text) to authenticated;

create or replace function public.mark_hr_request_seen(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() and not exists (select 1 from public.hr_requests where id = p_id and employee_id = auth.uid()) then
    update public.hr_requests set admin_seen_at = now() where id = p_id;
  else
    update public.hr_requests set employee_seen_at = now() where id = p_id and employee_id = auth.uid() and public.is_active_user();
  end if;
end $$;
revoke execute on function public.mark_hr_request_seen(uuid) from public, anon;
grant  execute on function public.mark_hr_request_seen(uuid) to authenticated;

create or replace function public.set_task_done(p_id uuid, p_done boolean, p_answer text)
returns public.employee_tasks
language plpgsql security definer set search_path = '' as $$
declare
  t        public.employee_tasks;
  v_admin  boolean;
  v_answer text := nullif(trim(coalesce(p_answer, '')), '');
begin
  select * into t from public.employee_tasks where id = p_id for update;
  if not found then
    raise exception 'Step not found.' using errcode = 'P0001';
  end if;
  v_admin := public.is_admin() and t.employee_id is distinct from auth.uid();
  if not v_admin and not (t.employee_id = auth.uid() and t.kind = 'onboarding' and t.owner = 'employee' and public.is_active_user()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  if coalesce(p_done, false) then
    if v_answer is not null and v_answer !~* '^https?://' then
      v_answer := 'https://' || v_answer;
    end if;
    if v_answer is not null and (length(v_answer) > 500 or v_answer !~* '^https?://[^[:space:]]+\.[^[:space:]]+$') then
      raise exception 'That doesn''t look like a link. Copy it from your browser''s address bar.' using errcode = 'P0001';
    end if;
    if t.ask_link is not null and v_answer is null and not v_admin then
      raise exception 'Paste the link first.' using errcode = 'P0001';
    end if;
    if t.item_key = 'linkedin' and v_answer is not null then
      v_answer := regexp_replace(v_answer, '^http://', 'https://', 'i');
      if v_answer !~* '^https://([a-z0-9-]+\.)?linkedin\.com/in/[^[:space:]]+$' then
        raise exception 'Paste your LinkedIn profile link. It looks like linkedin.com/in/your-name' using errcode = 'P0001';
      end if;
      v_answer := regexp_replace(v_answer, '[?#].*$', '');
      update public.profiles set linkedin_url = left(v_answer, 300) where id = t.employee_id;
    end if;
    update public.employee_tasks
       set done_at = coalesce(done_at, now()), done_by = coalesce(done_by, auth.uid()), answer = coalesce(v_answer, answer)
     where id = p_id
    returning * into t;
  else
    update public.employee_tasks set done_at = null, done_by = null where id = p_id returning * into t;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_done then 'checklist.done' else 'checklist.undo' end, 'profile', t.employee_id::text,
          jsonb_build_object('task', t.id, 'title', t.title, 'kind', t.kind));
  return t;
end $$;
revoke execute on function public.set_task_done(uuid, boolean, text) from public, anon;
grant  execute on function public.set_task_done(uuid, boolean, text) to authenticated;

-- HR (an employee with admin rights) can raise requests too; admins can't (role check).
create or replace function public.create_hr_request(p_category text, p_subject text, p_body text)
returns public.hr_requests
language plpgsql security definer set search_path = '' as $$
declare
  r      public.hr_requests;
  v_subj text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if not public.is_active_user()
     or not exists (select 1 from public.profiles where id = auth.uid() and role = 'employee') then
    raise exception 'Only employees can send requests to HR.' using errcode = '42501';
  end if;
  if coalesce(p_category, '') not in ('documents', 'salary', 'leave_attendance', 'access', 'concern', 'other') then
    raise exception 'Pick what the request is about.' using errcode = 'P0001';
  end if;
  if length(v_subj) < 3 or length(v_subj) > 120 then
    raise exception 'Write a short subject (3 to 120 characters).' using errcode = 'P0001';
  end if;
  if length(v_body) < 10 then
    raise exception 'Add a few more details (at least 10 characters).' using errcode = 'P0001';
  end if;
  if length(v_body) > 3000 then
    raise exception 'Keep the message under 3000 characters.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.hr_requests where employee_id = auth.uid() and status in ('open', 'in_progress')) >= 5 then
    raise exception 'You already have 5 open requests. Wait for a reply, or add to one of them.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.hr_requests where employee_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s a lot of requests today. Please try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.hr_requests (employee_id, category, subject) values (auth.uid(), p_category, v_subj) returning * into r;
  insert into public.hr_request_messages (request_id, author_id, from_admin, body) values (r.id, auth.uid(), false, v_body);
  return r;
end $$;
revoke execute on function public.create_hr_request(text, text, text) from public, anon;
grant  execute on function public.create_hr_request(text, text, text) to authenticated;
