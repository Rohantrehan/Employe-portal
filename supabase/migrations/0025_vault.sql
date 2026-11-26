-- =====================================================================
-- 0025  Access manager (shared tool logins)
--  * vault_items   a shared account (ChatGPT, Frame.io, smm@ mailbox...).
--                  Password, notes and the authenticator secret are stored
--                  ENCRYPTED by the app server (AES-256-GCM, key in the
--                  VAULT_KEY env var). The database never sees plain text.
--  * vault_grants  who has which account; revoking keeps the history
--  * vault_events  every reveal, change, grant and revoke
--  * "Change this password" is worked out from the log: someone saw the
--    current password and has since lost access (revoked or left).
-- =====================================================================

create table if not exists public.vault_items (
  id                  uuid primary key,
  name                text not null check (length(trim(name)) between 2 and 80),
  url                 text check (url is null or (length(url) <= 300 and url ~* '^https://[^[:space:]]+$')),
  username            text check (username is null or length(username) <= 200),
  password_enc        text not null check (password_enc like 'v1:%' and length(password_enc) <= 2000),
  notes_enc           text check (notes_enc is null or (notes_enc like 'v1:%' and length(notes_enc) <= 6000)),
  totp_enc            text check (totp_enc is null or (totp_enc like 'v1:%' and length(totp_enc) <= 2000)),
  password_changed_at timestamptz not null default now(),
  archived_at         timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists vault_items_name_live on public.vault_items(lower(name)) where archived_at is null;
create index if not exists vault_items_created_by_idx on public.vault_items(created_by);
drop trigger if exists vault_items_updated_at on public.vault_items;
create trigger vault_items_updated_at before update on public.vault_items
  for each row execute function public.set_updated_at();

create table if not exists public.vault_grants (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.vault_items(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz
);
create unique index if not exists vault_grants_one_live on public.vault_grants(item_id, employee_id) where revoked_at is null;
create index if not exists vault_grants_employee_idx on public.vault_grants(employee_id);
create index if not exists vault_grants_granted_by_idx on public.vault_grants(granted_by);
create index if not exists vault_grants_revoked_by_idx on public.vault_grants(revoked_by);

create table if not exists public.vault_events (
  id        bigint generated always as identity primary key,
  item_id   uuid not null references public.vault_items(id) on delete cascade,
  actor_id  uuid references public.profiles(id) on delete set null,
  action    text not null check (action in ('create', 'update', 'password_change', 'archive', 'grant', 'revoke', 'view_password', 'view_code', 'view_notes')),
  target_id uuid references public.profiles(id) on delete set null,
  at        timestamptz not null default now()
);
create index if not exists vault_events_item_idx on public.vault_events(item_id, at desc);
create index if not exists vault_events_actor_idx on public.vault_events(actor_id, at desc);
create index if not exists vault_events_target_idx on public.vault_events(target_id);

-- ---------- Read access ----------------------------------------------------
-- Encrypted columns are never selectable by app users (only through vault_secret below).
alter table public.vault_items enable row level security;
alter table public.vault_grants enable row level security;
alter table public.vault_events enable row level security;
revoke select on public.vault_items from anon, authenticated;
grant select (id, name, url, username, password_changed_at, archived_at, created_at, updated_at) on public.vault_items to authenticated;

create or replace function public._has_vault_access(p_item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.vault_grants g
    join public.vault_items i on i.id = g.item_id
    where g.item_id = p_item and g.employee_id = auth.uid() and g.revoked_at is null and i.archived_at is null
  );
$$;
revoke execute on function public._has_vault_access(uuid) from public, anon;
grant execute on function public._has_vault_access(uuid) to authenticated;

drop policy if exists "read: admin or granted" on public.vault_items;
create policy "read: admin or granted" on public.vault_items for select to authenticated
  using ((select public.is_admin()) or public._has_vault_access(id));
drop policy if exists "read: admin or own" on public.vault_grants;
create policy "read: admin or own" on public.vault_grants for select to authenticated
  using ((select public.is_admin()) or (employee_id = (select auth.uid()) and revoked_at is null and (select public.is_active_user())));
drop policy if exists "read: admin" on public.vault_events;
create policy "read: admin" on public.vault_events for select to authenticated using ((select public.is_admin()));

-- =====================================================================
-- Reveal: checks access, rate-limits, logs, and hands the ENCRYPTED value
-- to the app server, which decrypts it with VAULT_KEY.
-- =====================================================================
create or replace function public.vault_secret(p_item uuid, p_what text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  i      public.vault_items;
  v_out  text;
begin
  if p_what not in ('password', 'code', 'notes') then
    raise exception 'Unknown field.' using errcode = 'P0001';
  end if;
  select * into i from public.vault_items where id = p_item;
  if not found or i.archived_at is not null or not (public.is_admin() or public._has_vault_access(p_item)) then
    raise exception 'You don''t have access to this account.' using errcode = '42501';
  end if;
  if (select count(*) from public.vault_events where actor_id = auth.uid() and action like 'view_%' and at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many reveals in the last hour. Try again later.' using errcode = 'P0001';
  end if;
  v_out := case p_what when 'password' then i.password_enc when 'code' then i.totp_enc else i.notes_enc end;
  if v_out is null then
    raise exception 'Nothing saved here.' using errcode = 'P0001';
  end if;
  insert into public.vault_events (item_id, actor_id, action) values (p_item, auth.uid(), 'view_' || p_what);
  return v_out;
end $$;
revoke execute on function public.vault_secret(uuid, text) from public, anon;
grant  execute on function public.vault_secret(uuid, text) to authenticated;

-- What each person can see in their list: whether a code / notes exist (not the values).
create or replace function public.my_vault()
returns table (id uuid, name text, url text, username text, has_code boolean, has_notes boolean, granted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.name, i.url, i.username, i.totp_enc is not null, i.notes_enc is not null, g.granted_at
  from public.vault_grants g join public.vault_items i on i.id = g.item_id
  where g.employee_id = auth.uid() and g.revoked_at is null and i.archived_at is null and public.is_active_user()
  order by lower(i.name);
$$;
revoke execute on function public.my_vault() from public, anon;
grant  execute on function public.my_vault() to authenticated;

-- =====================================================================
-- Admin
-- =====================================================================
create or replace function public.vault_save_item(
  p_id uuid, p_name text, p_url text, p_username text,
  p_password_enc text,   -- null = keep
  p_notes_enc text,      -- null = keep, '' = clear
  p_totp_enc text        -- null = keep, '' = clear
)
returns public.vault_items
language plpgsql security definer set search_path = '' as $$
declare
  r      public.vault_items;
  v_name text := trim(coalesce(p_name, ''));
  v_url  text := nullif(trim(coalesce(p_url, '')), '');
  v_user text := nullif(trim(coalesce(p_username, '')), '');
  v_new  boolean;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage shared accounts.' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Enter the account name (2 to 80 characters).' using errcode = 'P0001';
  end if;
  if v_url is not null and (length(v_url) > 300 or v_url !~* '^https://[^[:space:]]+$') then
    raise exception 'The sign-in link must start with https://' using errcode = 'P0001';
  end if;
  if length(coalesce(v_user, '')) > 200 then
    raise exception 'The username is too long.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.vault_items where lower(name) = lower(v_name) and archived_at is null and id <> p_id) then
    raise exception 'There is already an account called "%".', v_name using errcode = 'P0001';
  end if;

  select not exists (select 1 from public.vault_items where id = p_id) into v_new;
  if v_new then
    if p_password_enc is null then
      raise exception 'Enter the password.' using errcode = 'P0001';
    end if;
    insert into public.vault_items (id, name, url, username, password_enc, notes_enc, totp_enc, created_by)
    values (p_id, v_name, v_url, v_user, p_password_enc, nullif(p_notes_enc, ''), nullif(p_totp_enc, ''), auth.uid())
    returning * into r;
    insert into public.vault_events (item_id, actor_id, action) values (r.id, auth.uid(), 'create');
  else
    select * into r from public.vault_items where id = p_id for update;
    if r.archived_at is not null then
      raise exception 'This account was removed.' using errcode = 'P0001';
    end if;
    update public.vault_items
       set name = v_name, url = v_url, username = v_user,
           password_enc = coalesce(p_password_enc, password_enc),
           password_changed_at = case when p_password_enc is null then password_changed_at else now() end,
           notes_enc = case when p_notes_enc is null then notes_enc else nullif(p_notes_enc, '') end,
           totp_enc = case when p_totp_enc is null then totp_enc else nullif(p_totp_enc, '') end
     where id = p_id
    returning * into r;
    insert into public.vault_events (item_id, actor_id, action)
    values (r.id, auth.uid(), case when p_password_enc is null then 'update' else 'password_change' end);
  end if;
  perform public.log_action(case when v_new then 'vault.create' when p_password_enc is null then 'vault.update' else 'vault.password_change' end,
                            'vault_item', r.id::text, jsonb_build_object('name', r.name));
  return r;
end $$;
revoke execute on function public.vault_save_item(uuid, text, text, text, text, text, text) from public, anon;
grant  execute on function public.vault_save_item(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.vault_archive_item(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage shared accounts.' using errcode = '42501';
  end if;
  update public.vault_items set archived_at = now() where id = p_id and archived_at is null returning name into v_name;
  if v_name is null then
    raise exception 'Account not found.' using errcode = 'P0001';
  end if;
  update public.vault_grants set revoked_at = now(), revoked_by = auth.uid() where item_id = p_id and revoked_at is null;
  insert into public.vault_events (item_id, actor_id, action) values (p_id, auth.uid(), 'archive');
  perform public.log_action('vault.archive', 'vault_item', p_id::text, jsonb_build_object('name', v_name));
end $$;
revoke execute on function public.vault_archive_item(uuid) from public, anon;
grant  execute on function public.vault_archive_item(uuid) to authenticated;

create or replace function public.vault_grant(p_item uuid, p_employee uuid)
returns public.vault_grants
language plpgsql security definer set search_path = '' as $$
declare
  g   public.vault_grants;
  v_p public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can give access.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vault_items where id = p_item and archived_at is null) then
    raise exception 'Account not found.' using errcode = 'P0001';
  end if;
  select * into v_p from public.profiles where id = p_employee;
  if not found or v_p.role <> 'employee' then
    raise exception 'Pick an employee. Admins can already see every account.' using errcode = 'P0001';
  end if;
  if not v_p.is_active or (v_p.left_on is not null and v_p.left_on < public.local_today()) then
    raise exception '% has left or is deactivated.', v_p.full_name using errcode = 'P0001';
  end if;
  if exists (select 1 from public.vault_grants where item_id = p_item and employee_id = p_employee and revoked_at is null) then
    raise exception '% already has this account.', v_p.full_name using errcode = 'P0001';
  end if;
  insert into public.vault_grants (item_id, employee_id, granted_by) values (p_item, p_employee, auth.uid()) returning * into g;
  insert into public.vault_events (item_id, actor_id, action, target_id) values (p_item, auth.uid(), 'grant', p_employee);
  perform public.log_action('vault.grant', 'vault_item', p_item::text, jsonb_build_object('employee', p_employee));
  return g;
end $$;
revoke execute on function public.vault_grant(uuid, uuid) from public, anon;
grant  execute on function public.vault_grant(uuid, uuid) to authenticated;

-- Revoke one grant (p_item + p_employee), or everything someone has (p_item null).
create or replace function public.vault_revoke(p_item uuid, p_employee uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int; g record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove access.' using errcode = '42501';
  end if;
  v_count := 0;
  for g in
    update public.vault_grants set revoked_at = now(), revoked_by = auth.uid()
    where employee_id = p_employee and revoked_at is null and (p_item is null or item_id = p_item)
    returning item_id
  loop
    insert into public.vault_events (item_id, actor_id, action, target_id) values (g.item_id, auth.uid(), 'revoke', p_employee);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'Nothing to remove.' using errcode = 'P0001';
  end if;
  perform public.log_action('vault.revoke', 'profile', p_employee::text, jsonb_build_object('item', p_item, 'count', v_count));
  return v_count;
end $$;
revoke execute on function public.vault_revoke(uuid, uuid) from public, anon;
grant  execute on function public.vault_revoke(uuid, uuid) to authenticated;

-- Accounts whose current password was seen by someone who no longer has access.
create or replace function public.vault_rotation_needed()
returns table (item_id uuid, name text, people text[])
language sql stable security definer set search_path = '' as $$
  select i.id, i.name, array_agg(distinct p.full_name order by p.full_name)
  from public.vault_items i
  join public.vault_events e on e.item_id = i.id and e.action = 'view_password' and e.at > i.password_changed_at
  join public.profiles p on p.id = e.actor_id
  where public.is_admin()
    and i.archived_at is null
    and p.role = 'employee'
    and (
      not p.is_active
      or (p.left_on is not null and p.left_on < public.local_today())
      or not exists (select 1 from public.vault_grants g where g.item_id = i.id and g.employee_id = p.id and g.revoked_at is null)
    )
  group by i.id, i.name
  order by i.name;
$$;
revoke execute on function public.vault_rotation_needed() from public, anon;
grant  execute on function public.vault_rotation_needed() to authenticated;

-- People who leave lose access the day after their last working day.
create or replace function public.process_exits()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.profiles set is_active = false
  where is_active and left_on is not null and left_on < public.local_today();
  get diagnostics v_count = row_count;
  with gone as (
    update public.vault_grants g set revoked_at = now()
    from public.profiles p
    where p.id = g.employee_id and g.revoked_at is null and p.left_on is not null and p.left_on < public.local_today()
    returning g.item_id, g.employee_id
  )
  insert into public.vault_events (item_id, actor_id, action, target_id) select item_id, null, 'revoke', employee_id from gone;
  return v_count;
end $$;
revoke execute on function public.process_exits() from public, anon, authenticated;

-- Admin: which optional secrets an account has (never the values).
create or replace function public.vault_item_flags(p_id uuid)
returns table (has_code boolean, has_notes boolean)
language sql stable security definer set search_path = '' as $$
  select i.totp_enc is not null, i.notes_enc is not null from public.vault_items i where i.id = p_id and public.is_admin();
$$;
revoke execute on function public.vault_item_flags(uuid) from public, anon;
grant  execute on function public.vault_item_flags(uuid) to authenticated;
