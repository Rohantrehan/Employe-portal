-- =====================================================================
-- 0012  Self-service profile + company settings
--  * update_my_phone(p_phone)  employees may change only their own phone
--  * save_settings(...)        admin edits office hours and attendance rules
-- =====================================================================

create or replace function public.update_my_phone(p_phone text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'Enter a valid phone number (10 to 15 digits).' using errcode = 'P0001';
  end if;
  update public.profiles set phone = v_phone where id = auth.uid();
  perform public.log_action('profile.phone', 'profile', auth.uid()::text, jsonb_build_object('phone', v_phone));
  return v_phone;
end $$;
revoke execute on function public.update_my_phone(text) from public, anon;
grant  execute on function public.update_my_phone(text) to authenticated;

create or replace function public.save_settings(
  p_company_name text,
  p_work_start   time,
  p_work_end     time,
  p_grace        int,
  p_half_day     numeric
)
returns public.settings
language plpgsql security definer set search_path = '' as $$
declare
  r public.settings;
  v_day numeric := extract(epoch from (p_work_end - p_work_start)) / 3600;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change settings.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_company_name, ''))) not between 2 and 120 then
    raise exception 'Company name must be 2 to 120 characters.' using errcode = 'P0001';
  end if;
  if p_work_start is null or p_work_end is null or p_work_end <= p_work_start then
    raise exception 'Office closing time must be after opening time.' using errcode = 'P0001';
  end if;
  if p_grace is null or p_grace not between 0 and 180 then
    raise exception 'Grace period must be between 0 and 180 minutes.' using errcode = 'P0001';
  end if;
  if p_half_day is null or p_half_day <= 0 or p_half_day >= v_day then
    raise exception 'Half-day threshold must be more than 0 and less than the working day (% h).', round(v_day, 2) using errcode = 'P0001';
  end if;

  update public.settings
     set company_name = trim(p_company_name), work_start = p_work_start, work_end = p_work_end,
         grace_minutes = p_grace, half_day_min_hours = p_half_day
   where id = 1
  returning * into r;

  perform public.log_action('settings.update', 'settings', '1', to_jsonb(r));
  return r;
end $$;
revoke execute on function public.save_settings(text, time, time, int, numeric) from public, anon;
grant  execute on function public.save_settings(text, time, time, int, numeric) to authenticated;
