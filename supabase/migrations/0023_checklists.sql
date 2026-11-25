-- =====================================================================
-- 0023  Onboarding / offboarding checklists + LinkedIn
--  * checklist_items      the company's list of steps (Settings → Checklists)
--  * employee_tasks       one person's copy of the steps (a snapshot, so
--                         editing the list never changes someone's progress)
--  * profiles.linkedin_url  filled in by the "Add RohTre Media on LinkedIn" step
--  * linkedin_milestones  "Have you posted about your N years?" answers
--  * Offboarding starts by itself when an exit is recorded, and experience /
--    relieving letters can only be issued once every offboarding step is done.
-- =====================================================================

-- ---------- Company list of steps --------------------------------------
create table if not exists public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('onboarding', 'offboarding')),
  title      text not null check (length(trim(title)) between 2 and 120),
  details    text check (details is null or length(details) <= 600),
  link_url   text check (link_url is null or (length(link_url) <= 500 and link_url ~* '^https://[^[:space:]]+$')),
  link_label text check (link_label is null or length(trim(link_label)) between 2 and 40),
  owner      text not null default 'employee' check (owner in ('employee', 'admin')),
  ask_link   text check (ask_link is null or length(trim(ask_link)) between 2 and 80),
  -- who gets it by default: everyone, short (<= 4 months) or long contracts, or only when picked
  applies    text not null default 'all' check (applies in ('all', 'short', 'long', 'pick')),
  key        text unique,                 -- built-in steps ('linkedin')
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists checklist_items_updated_at on public.checklist_items;
create trigger checklist_items_updated_at before update on public.checklist_items
  for each row execute function public.set_updated_at();
alter table public.checklist_items enable row level security;
drop policy if exists "read: admin" on public.checklist_items;
create policy "read: admin" on public.checklist_items for select to authenticated using ((select public.is_admin()));

-- ---------- One person's steps ----------------------------------------------
create table if not exists public.employee_tasks (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('onboarding', 'offboarding')),
  item_id     uuid references public.checklist_items(id) on delete set null,
  item_key    text,
  title       text not null check (length(trim(title)) between 2 and 120),
  details     text,
  link_url    text,
  link_label  text,
  owner       text not null check (owner in ('employee', 'admin')),
  ask_link    text,
  sort_order  int not null default 0,
  answer      text check (answer is null or (length(answer) <= 500 and answer ~* '^https?://[^[:space:]]+$')),
  done_at     timestamptz,
  done_by     uuid references public.profiles(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists employee_tasks_one_item on public.employee_tasks(employee_id, kind, item_id) where item_id is not null;
create index if not exists employee_tasks_employee_idx on public.employee_tasks(employee_id);
create index if not exists employee_tasks_item_idx on public.employee_tasks(item_id);
create index if not exists employee_tasks_done_by_idx on public.employee_tasks(done_by);
create index if not exists employee_tasks_created_by_idx on public.employee_tasks(created_by);
alter table public.employee_tasks enable row level security;
drop policy if exists "read: own onboarding or admin" on public.employee_tasks;
create policy "read: own onboarding or admin" on public.employee_tasks for select to authenticated
  using ((select public.is_admin()) or (employee_id = (select auth.uid()) and kind = 'onboarding' and (select public.is_active_user())));
-- no write policies: all changes go through the functions below

-- ---------- LinkedIn -----------------------------------------------------------
alter table public.profiles add column if not exists linkedin_url text
  check (linkedin_url is null or (length(linkedin_url) <= 300 and linkedin_url ~* '^https://([a-z0-9-]+\.)?linkedin\.com/[^[:space:]]*$'));

create table if not exists public.linkedin_milestones (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  years       int not null check (years between 1 and 60),
  status      text not null check (status in ('posted', 'skipped')),
  post_url    text check (post_url is null or (length(post_url) <= 500 and post_url ~* '^https?://[^[:space:]]+$')),
  created_at  timestamptz not null default now(),
  primary key (employee_id, years)
);
alter table public.linkedin_milestones enable row level security;
drop policy if exists "read: own or admin" on public.linkedin_milestones;
create policy "read: own or admin" on public.linkedin_milestones for select to authenticated
  using ((select public.is_admin()) or employee_id = (select auth.uid()));

-- ---------- Default steps (editable in Settings) -------------------------------
insert into public.checklist_items (kind, title, details, link_url, link_label, owner, ask_link, applies, key, sort_order)
select * from (values
  ('onboarding', 'Install Bitdefender Antivirus Free',
   'Protects your PC from scam links and files shared on Discord. Install it before you join the server.',
   'https://www.bitdefender.com/en-us/consumer/free-antivirus', 'Download', 'employee', null, 'all', null, 10),
  ('onboarding', 'Install Parsec',
   'Used to connect to the editing machines. Sign up with your work email.',
   'https://parsec.app/downloads', 'Download', 'employee', null, 'all', null, 20),
  ('onboarding', 'Join the Discord server (3-month contract)',
   'Use the invite link and set your server nickname to your full name.',
   null, 'Join server', 'employee', null, 'short', null, 30),
  ('onboarding', 'Join the Discord server (6-month or longer contract)',
   'Use the invite link and set your server nickname to your full name.',
   null, 'Join server', 'employee', null, 'long', null, 40),
  ('onboarding', 'Add RohTre Media to your LinkedIn',
   'Add your position at RohTre Media to your experience, then paste your profile link here.',
   'https://www.linkedin.com/in/me/edit/forms/position/new/', 'Add on LinkedIn', 'employee', 'Your LinkedIn profile link', 'all', 'linkedin', 50),
  ('onboarding', 'Give Frame.io access', 'For editors.', null, null, 'admin', null, 'pick', null, 60),
  ('onboarding', 'Give ChatGPT access', null, null, null, 'admin', null, 'pick', null, 70),
  ('offboarding', 'Remove from the Discord server', null, null, null, 'admin', null, 'all', null, 10),
  ('offboarding', 'Remove Parsec access', null, null, null, 'admin', null, 'all', null, 20),
  ('offboarding', 'Remove the Bitdefender licence (if one was given)', null, null, null, 'admin', null, 'all', null, 30),
  ('offboarding', 'Revoke tool logins (Frame.io, ChatGPT and others)', null, null, null, 'admin', null, 'all', null, 40),
  ('offboarding', 'Change the passwords of shared accounts they used', null, null, null, 'admin', null, 'all', null, 50)
) v(kind, title, details, link_url, link_label, owner, ask_link, applies, key, sort_order)
where not exists (select 1 from public.checklist_items);

-- =====================================================================
-- Helpers
-- =====================================================================

-- 'short' (<= 4 months), 'long', or null when no contract is drafted or issued.
create or replace function public._contract_class(p_employee uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when l.date_to - l.date_from <= 123 then 'short' else 'long' end
  from public.letters l
  where l.employee_id = p_employee and l.kind = 'contract' and l.status <> 'cancelled' and l.date_to is not null
  order by (l.status = 'issued') desc, l.date_from desc
  limit 1;
$$;
revoke execute on function public._contract_class(uuid) from public, anon, authenticated;

-- Copy steps into someone's list (skips ones they already have). Returns how many were added.
create or replace function public._add_tasks(p_employee uuid, p_kind text, p_items uuid[], p_by uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  insert into public.employee_tasks (employee_id, kind, item_id, item_key, title, details, link_url, link_label, owner, ask_link, sort_order, created_by)
  select p_employee, i.kind, i.id, i.key, i.title, i.details, i.link_url, i.link_label, i.owner, i.ask_link, i.sort_order, p_by
  from public.checklist_items i
  where i.kind = p_kind and i.id = any(p_items)
    and not exists (select 1 from public.employee_tasks t where t.employee_id = p_employee and t.kind = p_kind and t.item_id = i.id);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public._add_tasks(uuid, text, uuid[], uuid) from public, anon, authenticated;

-- The steps someone gets by default.
create or replace function public._default_items(p_employee uuid, p_kind text)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(i.id), '{}')
  from public.checklist_items i
  where i.kind = p_kind
    and (i.applies = 'all' or i.applies = public._contract_class(p_employee));
$$;
revoke execute on function public._default_items(uuid, text) from public, anon, authenticated;

-- =====================================================================
-- Admin: the company list
-- =====================================================================
create or replace function public.save_checklist_item(
  p_id uuid, p_kind text, p_title text, p_details text, p_link_url text, p_link_label text,
  p_owner text, p_ask_link text, p_applies text
)
returns public.checklist_items
language plpgsql security definer set search_path = '' as $$
declare
  r       public.checklist_items;
  v_title text := trim(coalesce(p_title, ''));
  v_det   text := nullif(trim(coalesce(p_details, '')), '');
  v_url   text := nullif(trim(coalesce(p_link_url, '')), '');
  v_lbl   text := nullif(trim(coalesce(p_link_label, '')), '');
  v_ask   text := nullif(trim(coalesce(p_ask_link, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can change checklists.' using errcode = '42501';
  end if;
  if p_kind not in ('onboarding', 'offboarding') then
    raise exception 'Pick onboarding or offboarding.' using errcode = 'P0001';
  end if;
  if length(v_title) < 2 or length(v_title) > 120 then
    raise exception 'Enter a step name (2 to 120 characters).' using errcode = 'P0001';
  end if;
  if length(coalesce(v_det, '')) > 600 then
    raise exception 'Keep the details under 600 characters.' using errcode = 'P0001';
  end if;
  if v_url is not null and (length(v_url) > 500 or v_url !~* '^https://[^[:space:]]+$') then
    raise exception 'The link must start with https://' using errcode = 'P0001';
  end if;
  if p_owner not in ('employee', 'admin') then
    raise exception 'Pick who does this step.' using errcode = 'P0001';
  end if;
  if p_applies not in ('all', 'short', 'long', 'pick') then
    raise exception 'Pick who gets this step.' using errcode = 'P0001';
  end if;
  if p_kind = 'offboarding' and p_owner <> 'admin' then
    raise exception 'Offboarding steps are done by an admin.' using errcode = 'P0001';
  end if;
  if p_owner = 'admin' then v_ask := null; end if;

  if p_id is null then
    insert into public.checklist_items (kind, title, details, link_url, link_label, owner, ask_link, applies, sort_order)
    values (p_kind, v_title, v_det, v_url, case when v_url is null then null else coalesce(v_lbl, 'Open') end, p_owner, v_ask, p_applies,
            coalesce((select max(sort_order) + 10 from public.checklist_items where kind = p_kind), 10))
    returning * into r;
  else
    select * into r from public.checklist_items where id = p_id;
    if not found then
      raise exception 'Step not found.' using errcode = 'P0001';
    end if;
    if r.kind <> p_kind then
      raise exception 'A step can''t move between onboarding and offboarding.' using errcode = 'P0001';
    end if;
    if r.key = 'linkedin' and v_ask is null then
      raise exception 'The LinkedIn step must ask for the profile link.' using errcode = 'P0001';
    end if;
    update public.checklist_items
       set title = v_title, details = v_det, link_url = v_url,
           link_label = case when v_url is null then null else coalesce(v_lbl, 'Open') end,
           owner = case when key = 'linkedin' then 'employee' else p_owner end, ask_link = v_ask, applies = p_applies
     where id = p_id
    returning * into r;
  end if;
  perform public.log_action('checklist.item_save', 'checklist_item', r.id::text, jsonb_build_object('kind', r.kind, 'title', r.title));
  return r;
end $$;
revoke execute on function public.save_checklist_item(uuid, text, text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.save_checklist_item(uuid, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.delete_checklist_item(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.checklist_items;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change checklists.' using errcode = '42501';
  end if;
  select * into r from public.checklist_items where id = p_id;
  if not found then
    raise exception 'Step not found.' using errcode = 'P0001';
  end if;
  if r.key is not null then
    raise exception 'This step is built in. You can change its wording, but not remove it.' using errcode = 'P0001';
  end if;
  delete from public.checklist_items where id = p_id;   -- people's copies stay
  perform public.log_action('checklist.item_delete', 'checklist_item', p_id::text, jsonb_build_object('title', r.title));
end $$;
revoke execute on function public.delete_checklist_item(uuid) from public, anon;
grant  execute on function public.delete_checklist_item(uuid) to authenticated;

-- Swap with the step above (-1) or below (+1).
create or replace function public.move_checklist_item(p_id uuid, p_dir int)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.checklist_items; n public.checklist_items;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change checklists.' using errcode = '42501';
  end if;
  select * into r from public.checklist_items where id = p_id for update;
  if not found then
    raise exception 'Step not found.' using errcode = 'P0001';
  end if;
  if p_dir < 0 then
    select * into n from public.checklist_items where kind = r.kind and (sort_order, id) < (r.sort_order, r.id) order by sort_order desc, id desc limit 1;
  else
    select * into n from public.checklist_items where kind = r.kind and (sort_order, id) > (r.sort_order, r.id) order by sort_order, id limit 1;
  end if;
  if n.id is null then return; end if;
  if n.sort_order = r.sort_order then
    update public.checklist_items set sort_order = r.sort_order + sign(p_dir)::int where id = p_id;
  else
    update public.checklist_items set sort_order = n.sort_order where id = r.id;
    update public.checklist_items set sort_order = r.sort_order where id = n.id;
  end if;
end $$;
revoke execute on function public.move_checklist_item(uuid, int) from public, anon;
grant  execute on function public.move_checklist_item(uuid, int) to authenticated;

-- =====================================================================
-- Admin: one person's list
-- =====================================================================

-- Add company steps (and optionally one custom step) to someone's list.
create or replace function public.add_employee_tasks(p_employee uuid, p_kind text, p_items uuid[], p_custom text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_p      public.profiles;
  v_custom text := nullif(trim(coalesce(p_custom, '')), '');
  v_count  int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change checklists.' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = p_employee;
  if not found then
    raise exception 'Employee not found.' using errcode = 'P0001';
  end if;
  if v_p.role <> 'employee' then
    raise exception 'Checklists are for employees.' using errcode = 'P0001';
  end if;
  if p_kind not in ('onboarding', 'offboarding') then
    raise exception 'Pick onboarding or offboarding.' using errcode = 'P0001';
  end if;
  if p_kind = 'offboarding' and not exists (select 1 from public.employee_exits where employee_id = p_employee) then
    raise exception 'Record the exit first. Offboarding starts from there.' using errcode = 'P0001';
  end if;
  if v_custom is not null and length(v_custom) not between 2 and 120 then
    raise exception 'Enter a step name (2 to 120 characters).' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_items), 0) = 0 and v_custom is null then
    raise exception 'Pick at least one step.' using errcode = 'P0001';
  end if;

  v_count := public._add_tasks(p_employee, p_kind, coalesce(p_items, '{}'), auth.uid());
  if v_custom is not null then
    insert into public.employee_tasks (employee_id, kind, title, owner, sort_order, created_by)
    values (p_employee, p_kind, v_custom, 'admin',
            coalesce((select max(sort_order) + 1 from public.employee_tasks where employee_id = p_employee and kind = p_kind), 100), auth.uid());
    v_count := v_count + 1;
  end if;
  perform public.log_action('checklist.add', 'profile', p_employee::text, jsonb_build_object('kind', p_kind, 'added', v_count));
  return v_count;
end $$;
revoke execute on function public.add_employee_tasks(uuid, text, uuid[], text) from public, anon;
grant  execute on function public.add_employee_tasks(uuid, text, uuid[], text) to authenticated;

create or replace function public.remove_employee_task(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.employee_tasks;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change checklists.' using errcode = '42501';
  end if;
  delete from public.employee_tasks where id = p_id returning * into t;
  if t.id is null then
    raise exception 'Step not found.' using errcode = 'P0001';
  end if;
  perform public.log_action('checklist.remove', 'profile', t.employee_id::text, jsonb_build_object('title', t.title, 'kind', t.kind));
end $$;
revoke execute on function public.remove_employee_task(uuid) from public, anon;
grant  execute on function public.remove_employee_task(uuid) to authenticated;

-- =====================================================================
-- Ticking a step (employee: own onboarding steps they do; admin: any)
-- =====================================================================
create or replace function public.set_task_done(p_id uuid, p_done boolean, p_answer text)
returns public.employee_tasks
language plpgsql security definer set search_path = '' as $$
declare
  t        public.employee_tasks;
  v_admin  boolean := public.is_admin();
  v_answer text := nullif(trim(coalesce(p_answer, '')), '');
begin
  select * into t from public.employee_tasks where id = p_id for update;
  if not found then
    raise exception 'Step not found.' using errcode = 'P0001';
  end if;
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

-- =====================================================================
-- LinkedIn work anniversaries
-- =====================================================================
create or replace function public.answer_linkedin_milestone(p_years int, p_posted boolean, p_url text)
returns public.linkedin_milestones
language plpgsql security definer set search_path = '' as $$
declare
  v_join date;
  v_url  text := nullif(trim(coalesce(p_url, '')), '');
  r      public.linkedin_milestones;
begin
  if not public.is_active_user() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select date_of_joining into v_join from public.profiles where id = auth.uid();
  if v_join is null or p_years is null or p_years < 1 or (v_join + make_interval(years => p_years))::date > public.local_today() then
    raise exception 'That work anniversary hasn''t come yet.' using errcode = 'P0001';
  end if;
  if v_url is not null and v_url !~* '^https?://' then
    v_url := 'https://' || v_url;
  end if;
  if v_url is not null and (length(v_url) > 500 or v_url !~* '^https?://[^[:space:]]+\.[^[:space:]]+$') then
    raise exception 'That doesn''t look like a link. Copy it from your browser''s address bar.' using errcode = 'P0001';
  end if;
  insert into public.linkedin_milestones (employee_id, years, status, post_url)
  values (auth.uid(), p_years, case when p_posted then 'posted' else 'skipped' end, case when p_posted then v_url end)
  on conflict (employee_id, years) do update set status = excluded.status, post_url = excluded.post_url, created_at = now()
  returning * into r;
  return r;
end $$;
revoke execute on function public.answer_linkedin_milestone(int, boolean, text) from public, anon;
grant  execute on function public.answer_linkedin_milestone(int, boolean, text) to authenticated;

-- =====================================================================
-- Offboarding starts with the exit, and goes away if the exit is undone
-- =====================================================================
create or replace function public.employee_exits_checklist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public._add_tasks(new.employee_id, 'offboarding', public._default_items(new.employee_id, 'offboarding'), auth.uid());
    return new;
  end if;
  delete from public.employee_tasks where employee_id = old.employee_id and kind = 'offboarding';
  return old;
end $$;
revoke execute on function public.employee_exits_checklist() from public, anon, authenticated;
drop trigger if exists employee_exits_checklist on public.employee_exits;
create trigger employee_exits_checklist after insert or delete on public.employee_exits
  for each row execute function public.employee_exits_checklist();

-- People who left before this feature: give them their offboarding list now.
insert into public.employee_tasks (employee_id, kind, item_id, item_key, title, details, link_url, link_label, owner, ask_link, sort_order)
select e.employee_id, i.kind, i.id, i.key, i.title, i.details, i.link_url, i.link_label, i.owner, i.ask_link, i.sort_order
from public.employee_exits e cross join public.checklist_items i
where i.kind = 'offboarding' and i.applies = 'all'
  and not exists (select 1 from public.employee_tasks t where t.employee_id = e.employee_id and t.kind = 'offboarding');

-- =====================================================================
-- Exit letters wait for the offboarding list
-- =====================================================================
create or replace function public.issue_letter(p_id uuid)
returns public.letters
language plpgsql security definer set search_path = '' as $$
declare
  r      public.letters;
  v_exit public.employee_exits;
  v_sig  uuid;
  v_pre  text;
  v_year int := extract(year from public.local_today())::int;
  v_n    int;
  v_name text;
  v_code text;
  v_hit  public.letters;
  v_open int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can issue letters.' using errcode = '42501';
  end if;
  select * into r from public.letters where id = p_id for update;
  if not found then
    raise exception 'Letter not found.' using errcode = 'P0001';
  end if;
  if r.status <> 'draft' then
    raise exception 'This letter is already %.', r.status using errcode = 'P0001';
  end if;

  if r.kind in ('experience', 'relieving') then
    select * into v_exit from public.employee_exits where employee_id = r.employee_id;
    if not found then
      raise exception 'Record the employee''s exit first.' using errcode = 'P0001';
    end if;
    if public.local_today() < v_exit.last_day then
      raise exception 'Letters can be issued from their last working day (%).', to_char(v_exit.last_day, 'DD Mon YYYY') using errcode = 'P0001';
    end if;
    if r.kind = 'experience' and not v_exit.letters_allowed then
      raise exception 'The experience letter is turned off for this employee.' using errcode = 'P0001';
    end if;
    select count(*) into v_open from public.employee_tasks
     where employee_id = r.employee_id and kind = 'offboarding' and done_at is null;
    if v_open > 0 then
      raise exception 'Finish the offboarding checklist first (% step% left), so tools and logins are taken back before the letters go out.',
        v_open, case when v_open = 1 then '' else 's' end using errcode = 'P0001';
    end if;
  end if;

  if r.kind = 'contract' then
    select * into v_hit from public.letters c
     where c.employee_id = r.employee_id and c.kind = 'contract' and c.status = 'issued'
       and daterange(c.date_from, c.date_to, '[]') && daterange(r.date_from, r.date_to, '[]')
     limit 1;
    if found then
      raise exception 'This overlaps contract % (% to %). Change the dates or cancel that one first.',
        v_hit.ref_no, to_char(v_hit.date_from, 'DD Mon YYYY'), to_char(v_hit.date_to, 'DD Mon YYYY') using errcode = 'P0001';
    end if;
  end if;

  select id into v_sig from public.letter_signatures where retired_at is null;
  if v_sig is null then
    raise exception 'Add a signature first (Settings → Letters & signature).' using errcode = 'P0001';
  end if;

  -- numbers are never reused, cancelled letters keep theirs
  perform pg_advisory_xact_lock(hashtext('letters.ref_no'));
  select letter_prefix into v_pre from public.settings where id = 1;
  select count(*) + 1 into v_n from public.letters
   where kind = r.kind and ref_no is not null and extract(year from issue_date) = v_year;
  select full_name, emp_code into v_name, v_code from public.profiles where id = r.employee_id;

  update public.letters
     set status = 'issued',
         ref_no = format('%s/%s/%s/%s', coalesce(v_pre, 'RT'),
                         case r.kind when 'experience' then 'EXP' when 'relieving' then 'REL' when 'offer' then 'OFF' else 'CON' end,
                         v_year, lpad(v_n::text, 3, '0')),
         issue_date = public.local_today(),
         signature_id = v_sig,
         full_name = v_name,
         emp_code = v_code,
         issued_by = auth.uid(),
         issued_at = now()
   where id = p_id
  returning * into r;

  perform public.log_action('letter.issue', 'letter', r.id::text, jsonb_build_object('ref_no', r.ref_no, 'employee', r.employee_id));
  return r;
end $$;
revoke execute on function public.issue_letter(uuid) from public, anon;
grant  execute on function public.issue_letter(uuid) to authenticated;
