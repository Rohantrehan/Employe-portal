-- =====================================================================
-- 0002  Default data: settings row, leave types, 2026 + 2027 policies.
-- All of these can be changed later by the admin in the portal.
-- =====================================================================

insert into public.settings (id) values (1) on conflict (id) do nothing;

insert into public.leave_types (code, name, is_paid, tracks_balance, requires_attachment, color, sort_order) values
  ('SL', 'Sick Leave',     true,  true,  false, '#0069a4', 1),
  ('PL', 'Paid Leave',     true,  true,  false, '#15803d', 2),
  ('VL', 'Vacation Leave', true,  true,  false, '#b45309', 3),
  ('UL', 'Unpaid Leave',   false, false, false, '#6b7280', 4)
on conflict (code) do nothing;

-- Default yearly quotas (days). Admin will adjust these in Settings.
insert into public.leave_policies (leave_type_id, year, default_quota, carry_forward, max_carry)
select lt.id, y.year, q.quota, false, 0
from public.leave_types lt
join (values ('SL', 12.0), ('PL', 12.0), ('VL', 6.0), ('UL', 0.0)) as q(code, quota) on q.code = lt.code
cross join (values (2026), (2027)) as y(year)
on conflict (leave_type_id, year) do nothing;
