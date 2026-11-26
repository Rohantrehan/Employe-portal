-- =====================================================================
-- 0028  2-step sign-in for everyone
--
--  * Every signed-in user needs a session that passed the authenticator
--    step (aal2) before the API returns or changes anything. Enforced for
--    all REST/RPC calls by a PostgREST pre-request check, and for files by
--    a restrictive storage policy.
--  * Exceptions: people who have left (documents-only area) keep password
--    only; my_account() works before the code so the sign-in pages can
--    tell who is logging in.
--  * Shared passwords / codes / notes in the access manager need a code
--    entered in the last 10 minutes (JWT amr totp timestamp).
-- =====================================================================

-- ---------- Who is logging in (works before the code) -------------------------
create or replace function public.my_account()
returns table (
  id uuid, role public.app_role, is_hr boolean, emp_code text, full_name text, email text, designation text,
  avatar_url text, is_active boolean, must_change_password boolean, left_on date, former_access boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.role, p.is_hr, p.emp_code, p.full_name, p.email, p.designation,
         p.avatar_url, p.is_active, p.must_change_password, p.left_on, p.former_access
    from public.profiles p
   where p.id = auth.uid();
$$;
revoke execute on function public.my_account() from public, anon;
grant  execute on function public.my_account() to authenticated;

-- ---------- Passed the code, or has left (documents only) --------------------
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or exists (
        select 1 from public.profiles
         where id = auth.uid() and role = 'employee'
           and left_on is not null and left_on < public.local_today()
      );
$$;
revoke execute on function public.mfa_ok() from public, anon;
grant  execute on function public.mfa_ok() to authenticated;

-- ---------- Every API request ---------------------------------------------------
create or replace function public.require_mfa()
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if c is null or c ->> 'role' is distinct from 'authenticated' then
    return;                                   -- anon (QR check page) and the service key
  end if;
  if c ->> 'aal' = 'aal2' then
    return;
  end if;
  if coalesce(current_setting('request.path', true), '') = '/rpc/my_account' then
    return;
  end if;
  if exists (
    select 1 from public.profiles
     where id = (c ->> 'sub')::uuid and role = 'employee'
       and left_on is not null and left_on < public.local_today()
  ) then
    return;
  end if;
  raise exception 'Two-step sign-in required.' using errcode = '42501', hint = 'mfa_required';
end $$;
revoke execute on function public.require_mfa() from public;
grant  execute on function public.require_mfa() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.require_mfa';
notify pgrst, 'reload config';

-- ---------- Files (leave documents, avatars, ...) ----------------------------------
drop policy if exists "two-step sign-in" on storage.objects;
create policy "two-step sign-in" on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- ---------- Shared passwords need a fresh code (10 minutes) ----------------------
create or replace function public._fresh_code(p_seconds int default 600)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select max((e ->> 'timestamp')::bigint)
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
     where e ->> 'method' = 'totp'
  ), 0) >= extract(epoch from now())::bigint - p_seconds;
$$;
revoke execute on function public._fresh_code(int) from public, anon, authenticated;

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
  if not public._fresh_code(600) then
    raise exception 'Enter a code from your authenticator app to see this.' using errcode = 'P0001', hint = 'step_up';
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

-- ---------- Own 2-step events in the audit log (employees can't use log_action) ----
create or replace function public.log_my_2fa(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_action not in ('2fa.setup', '2fa.login', '2fa.recheck') then
    return;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), p_action, 'profile', auth.uid()::text, null);
end $$;
revoke execute on function public.log_my_2fa(text) from public, anon;
grant  execute on function public.log_my_2fa(text) to authenticated;
