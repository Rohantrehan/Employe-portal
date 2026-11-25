-- =====================================================================
-- 0020  Admin 2-factor sign-in (Supabase TOTP)
--
-- Admin rights now need a session that passed the authenticator-app step
-- (JWT claim aal = 'aal2'). A stolen admin password alone gives no admin
-- access: is_admin() is false, so every admin RLS policy and admin
-- function refuses. Employees are not affected.
--
-- Recovery if an admin loses their phone: another admin uses
-- "Reset 2-factor" on that person's page, or remove the factor in the
-- Supabase dashboard (Authentication -> Users -> the user -> MFA factors).
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1 from public.profiles
       where id = auth.uid() and role = 'admin' and is_active
     );
$$;
revoke execute on function public.is_admin() from anon, public;
grant  execute on function public.is_admin() to authenticated;
