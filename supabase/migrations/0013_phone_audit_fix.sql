-- 0013  update_my_phone: write the audit row directly (log_action is admin-only).
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
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'profile.phone', 'profile', auth.uid()::text, jsonb_build_object('phone', v_phone));
  return v_phone;
end $$;
