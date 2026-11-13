-- =====================================================================
-- 0003  Employee management helpers
--  * leave balances are created automatically for new employees
--  * admins can (re)initialise balances for a year
--  * admin audit logging helper
-- =====================================================================

-- Internal: create missing balances for one employee + year from the policies.
create or replace function public._init_leave_balances(p_employee uuid, p_year int)
returns void language sql security definer set search_path = '' as $$
  insert into public.leave_balances (employee_id, leave_type_id, year, allotted)
  select p_employee, lp.leave_type_id, p_year, lp.default_quota
  from public.leave_policies lp
  join public.leave_types lt on lt.id = lp.leave_type_id
  where lp.year = p_year and lt.tracks_balance and lt.is_active
  on conflict (employee_id, leave_type_id, year) do nothing;
$$;
revoke execute on function public._init_leave_balances(uuid, int) from public, anon, authenticated;

-- Admin-callable wrapper.
create or replace function public.init_leave_balances(p_employee uuid, p_year int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can initialise leave balances' using errcode = '42501';
  end if;
  perform public._init_leave_balances(p_employee, p_year);
end $$;
revoke execute on function public.init_leave_balances(uuid, int) from public, anon;
grant  execute on function public.init_leave_balances(uuid, int) to authenticated;

-- New employee profile -> balances for the current year (IST).
create or replace function public.profiles_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'employee' then
    perform public._init_leave_balances(new.id, extract(year from (now() at time zone 'Asia/Kolkata'))::int);
  end if;
  return new;
end $$;
revoke execute on function public.profiles_after_insert() from public, anon, authenticated;

create trigger profiles_init_balances
  after insert on public.profiles
  for each row execute function public.profiles_after_insert();

-- Audit helper (admins only).
create or replace function public.log_action(p_action text, p_entity text, p_entity_id text, p_payload jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can write the audit log' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_payload);
end $$;
revoke execute on function public.log_action(text, text, text, jsonb) from public, anon;
grant  execute on function public.log_action(text, text, text, jsonb) to authenticated;
