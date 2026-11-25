-- =====================================================================
-- 0024  Requests to HR
--  * hr_requests          one request per topic: category, subject, status
--                         open -> in_progress -> resolved   (or withdrawn by the employee)
--  * hr_request_messages  the conversation (first message = the request text)
--  * Read tracking per side (employee_seen_at / admin_seen_at) drives the
--    menu badges. No email yet: every admin sees new requests and replies
--    in the portal.
-- =====================================================================

create table if not exists public.hr_requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.profiles(id) on delete cascade,
  category         text not null check (category in ('documents', 'salary', 'leave_attendance', 'access', 'concern', 'other')),
  subject          text not null check (length(trim(subject)) between 3 and 120),
  status           text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'withdrawn')),
  last_employee_at timestamptz not null default now(),
  last_admin_at    timestamptz,
  employee_seen_at timestamptz not null default now(),
  admin_seen_at    timestamptz,
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists hr_requests_employee_idx on public.hr_requests(employee_id);
create index if not exists hr_requests_status_idx on public.hr_requests(status);
create index if not exists hr_requests_resolved_by_idx on public.hr_requests(resolved_by);
drop trigger if exists hr_requests_updated_at on public.hr_requests;
create trigger hr_requests_updated_at before update on public.hr_requests
  for each row execute function public.set_updated_at();

create table if not exists public.hr_request_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.hr_requests(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  from_admin boolean not null,
  body       text not null check (length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists hr_request_messages_request_idx on public.hr_request_messages(request_id, created_at);
create index if not exists hr_request_messages_author_idx on public.hr_request_messages(author_id);

alter table public.hr_requests enable row level security;
alter table public.hr_request_messages enable row level security;
drop policy if exists "read: own or admin" on public.hr_requests;
create policy "read: own or admin" on public.hr_requests for select to authenticated
  using ((select public.is_admin()) or (employee_id = (select auth.uid()) and (select public.is_active_user())));
drop policy if exists "read: own or admin" on public.hr_request_messages;
create policy "read: own or admin" on public.hr_request_messages for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.hr_requests r where r.id = request_id and r.employee_id = (select auth.uid()) and (select public.is_active_user()))
  );
-- no write policies: all changes go through the functions below

-- ---------------------------------------------------------------------
create or replace function public.create_hr_request(p_category text, p_subject text, p_body text)
returns public.hr_requests
language plpgsql security definer set search_path = '' as $$
declare
  r      public.hr_requests;
  v_subj text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if not public.is_active_user() or public.is_admin()
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

-- Reply on a request. An employee replying to a resolved request reopens it;
-- an admin replying to an open one moves it to "in progress".
create or replace function public.reply_hr_request(p_id uuid, p_body text)
returns public.hr_request_messages
language plpgsql security definer set search_path = '' as $$
declare
  r       public.hr_requests;
  m       public.hr_request_messages;
  v_admin boolean := public.is_admin();
  v_body  text := trim(coalesce(p_body, ''));
begin
  select * into r from public.hr_requests where id = p_id for update;
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

-- Admin: in_progress / resolved / open (reopen). Employee: withdrawn (if not resolved).
create or replace function public.set_hr_request_status(p_id uuid, p_status text)
returns public.hr_requests
language plpgsql security definer set search_path = '' as $$
declare
  r       public.hr_requests;
  v_admin boolean := public.is_admin();
begin
  select * into r from public.hr_requests where id = p_id for update;
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

-- Opening a request marks it read for that side.
create or replace function public.mark_hr_request_seen(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() then
    update public.hr_requests set admin_seen_at = now() where id = p_id;
  else
    update public.hr_requests set employee_seen_at = now() where id = p_id and employee_id = auth.uid() and public.is_active_user();
  end if;
end $$;
revoke execute on function public.mark_hr_request_seen(uuid) from public, anon;
grant  execute on function public.mark_hr_request_seen(uuid) to authenticated;
