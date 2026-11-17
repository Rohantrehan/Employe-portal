-- =====================================================================
-- 0011  Performance: faster RLS + missing foreign-key indexes
--  * auth.uid() / is_admin() wrapped in (select ...) so Postgres evaluates
--    them ONCE per query instead of once per row (Supabase advisor 0003).
--  * Admin "write" policies were FOR ALL, which overlapped the SELECT
--    policies (two permissive policies checked on every read, advisor 0006).
--    They are now split into insert / update / delete. Same access as before.
--  * Indexes on foreign keys that had none (advisor 0001).
-- =====================================================================

-- ---------- Read policies -------------------------------------------------
do $$
declare t text;
begin
  -- tables readable by their owner (employee_id) or an admin
  foreach t in array array['attendance', 'floating_swaps', 'leave_balances', 'leave_requests', 'overtime_entries'] loop
    execute format('drop policy if exists "read: own or admin" on public.%I', t);
    execute format($p$create policy "read: own or admin" on public.%I for select to authenticated
                     using (employee_id = (select auth.uid()) or (select public.is_admin()))$p$, t);
  end loop;

  -- tables readable by any active user
  foreach t in array array['departments', 'holidays', 'leave_policies', 'leave_types', 'settings'] loop
    execute format('drop policy if exists "read: active users" on public.%I', t);
    execute format($p$create policy "read: active users" on public.%I for select to authenticated
                     using ((select public.is_active_user()))$p$, t);
  end loop;

  -- admin writes: FOR ALL → separate insert / update / delete
  foreach t in array array['attendance', 'attendance_tasks', 'departments', 'floating_swaps', 'holidays', 'leave_balances',
                           'leave_policies', 'leave_requests', 'leave_types', 'overtime_entries', 'payslips', 'profiles', 'settings'] loop
    execute format('drop policy if exists "write: admin" on public.%I', t);
    execute format('drop policy if exists "insert: admin" on public.%I', t);
    execute format('drop policy if exists "update: admin" on public.%I', t);
    execute format('drop policy if exists "delete: admin" on public.%I', t);
    execute format('create policy "insert: admin" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "update: admin" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "delete: admin" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

drop policy if exists "read: own or admin" on public.profiles;
create policy "read: own or admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "read: own or admin" on public.attendance_tasks;
create policy "read: own or admin" on public.attendance_tasks for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.attendance a where a.id = attendance_tasks.attendance_id and a.employee_id = (select auth.uid()))
  );

drop policy if exists "read: own published or admin" on public.payslips;
create policy "read: own published or admin" on public.payslips for select to authenticated
  using ((select public.is_admin()) or (employee_id = (select auth.uid()) and status = 'published'));

drop policy if exists "read: admin" on public.audit_log;
create policy "read: admin" on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- ---------- Storage (leave documents) --------------------------------------
drop policy if exists "leave files: read own or admin" on storage.objects;
create policy "leave files: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'leave-attachments' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
drop policy if exists "leave files: upload own" on storage.objects;
create policy "leave files: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "leave files: delete own" on storage.objects;
create policy "leave files: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Foreign-key indexes --------------------------------------------
create index if not exists audit_log_actor_idx          on public.audit_log(actor_id);
create index if not exists floating_swaps_holiday_idx   on public.floating_swaps(holiday_id);
create index if not exists floating_swaps_reviewer_idx  on public.floating_swaps(reviewed_by);
create index if not exists leave_balances_type_idx      on public.leave_balances(leave_type_id);
create index if not exists leave_requests_type_idx      on public.leave_requests(leave_type_id);
create index if not exists leave_requests_reviewer_idx  on public.leave_requests(reviewed_by);
create index if not exists overtime_reviewer_idx        on public.overtime_entries(reviewed_by);
create index if not exists payslips_month_idx           on public.payslips(month);
