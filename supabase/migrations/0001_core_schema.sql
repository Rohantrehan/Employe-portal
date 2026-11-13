-- =====================================================================
-- 0001  Core schema for the Employee Portal
-- Tables, enums, helper functions, triggers and Row Level Security.
-- Business RPCs (clock in/out, leave workflow, payroll) come in later
-- migrations, one per phase.
-- =====================================================================

-- ---------- Enums ----------------------------------------------------
create type public.app_role          as enum ('admin', 'employee');
create type public.request_status    as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.holiday_type      as enum ('company', 'festival', 'floating');
create type public.day_part          as enum ('full', 'first_half', 'second_half');
create type public.attendance_status as enum ('present', 'late', 'half_day', 'missed_clock_out');
create type public.payslip_status    as enum ('draft', 'published');
create type public.payment_status    as enum ('pending', 'paid');

-- ---------- Generic updated_at trigger -------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Departments ----------------------------------------------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- ---------- Profiles (1:1 with auth.users) ---------------------------
create sequence public.emp_code_seq start 1;

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  role                 public.app_role not null default 'employee',
  emp_code             text not null unique default ('RT-' || lpad(nextval('public.emp_code_seq')::text, 3, '0')),
  full_name            text not null check (length(trim(full_name)) between 1 and 120),
  email                text not null unique,
  phone                text,
  designation          text,
  department_id        uuid references public.departments(id) on delete set null,
  date_of_joining      date,
  basic_salary         numeric(12,2) not null default 0 check (basic_salary >= 0),
  avatar_url           text,
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index profiles_department_idx on public.profiles(department_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Role helpers (used by RLS) --------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

-- Create a profile automatically when an auth user is created.
-- Role comes from app_metadata (only settable with the service-role key),
-- so a user can never make themselves admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'employee'),
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Employee clears their own "must change password" flag after changing it.
create or replace function public.mark_password_changed()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

-- ---------- Company settings (single row) ----------------------------
create table public.settings (
  id                 smallint primary key default 1 check (id = 1),
  company_name       text not null default 'RohTre Media',
  timezone           text not null default 'Asia/Kolkata',
  work_start         time not null default '09:00',
  work_end           time not null default '17:00',
  grace_minutes      int  not null default 15 check (grace_minutes between 0 and 180),
  half_day_min_hours numeric(4,2) not null default 4 check (half_day_min_hours between 0 and 12),
  weekly_off         smallint[] not null default '{0}',   -- 0 = Sunday (Postgres dow)
  updated_at         timestamptz not null default now()
);
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------- Leave types, policies, balances --------------------------
create table public.leave_types (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[A-Z]{2,6}$'),
  name                text not null,
  is_paid             boolean not null default true,
  tracks_balance      boolean not null default true,   -- false = unlimited (e.g. Unpaid)
  requires_attachment boolean not null default false,
  color               text not null default '#d4000f',
  is_active           boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);

create table public.leave_policies (
  id            uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year          int  not null check (year between 2020 and 2100),
  default_quota numeric(5,1) not null default 0 check (default_quota >= 0),
  carry_forward boolean not null default false,
  max_carry     numeric(5,1) not null default 0 check (max_carry >= 0),
  created_at    timestamptz not null default now(),
  unique (leave_type_id, year)
);

create table public.leave_balances (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year          int  not null,
  allotted      numeric(5,1) not null default 0,
  carried       numeric(5,1) not null default 0,
  used          numeric(5,1) not null default 0,
  pending       numeric(5,1) not null default 0,
  updated_at    timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);
create trigger leave_balances_updated_at before update on public.leave_balances
  for each row execute function public.set_updated_at();

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  leave_type_id   uuid not null references public.leave_types(id),
  start_date      date not null,
  end_date        date not null,
  day_part        public.day_part not null default 'full',
  days            numeric(4,1) not null check (days > 0),
  reason          text not null check (length(trim(reason)) between 3 and 1000),
  attachment_path text,
  status          public.request_status not null default 'pending',
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now(),
  check (end_date >= start_date),
  check (day_part = 'full' or start_date = end_date)   -- half day = single date
);
create index leave_requests_emp_idx    on public.leave_requests(employee_id, start_date);
create index leave_requests_status_idx on public.leave_requests(status);

-- ---------- Holidays & floating swaps --------------------------------
create table public.holidays (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  name       text not null check (length(trim(name)) between 1 and 120),
  type       public.holiday_type not null default 'company',
  year       int generated always as (extract(year from date)::int) stored,
  created_at timestamptz not null default now()
);
create index holidays_year_idx on public.holidays(year);

create table public.floating_swaps (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  holiday_id  uuid not null references public.holidays(id) on delete cascade,
  new_date    date not null,
  reason      text,
  status      public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now()
);
-- one live (pending/approved) swap per employee per holiday
create unique index floating_swaps_live_uidx on public.floating_swaps(employee_id, holiday_id)
  where status in ('pending', 'approved');

-- ---------- Attendance & daily tasks ---------------------------------
create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles(id) on delete cascade,
  work_date      date not null,
  clock_in       timestamptz not null,
  clock_out      timestamptz,
  worked_minutes int check (worked_minutes >= 0),
  status         public.attendance_status not null default 'present',
  early_leave    boolean not null default false,
  admin_note     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, work_date),
  check (clock_out is null or clock_out >= clock_in)
);
create index attendance_date_idx on public.attendance(work_date);
create trigger attendance_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();

create table public.attendance_tasks (
  id            uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 500),
  planned       boolean not null default true,   -- false = added at clock-out
  done          boolean not null default false,
  note          text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index attendance_tasks_att_idx on public.attendance_tasks(attendance_id);

-- ---------- Extra hours (overtime) -----------------------------------
create table public.overtime_entries (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date   date not null,
  hours       numeric(4,2) not null check (hours > 0 and hours <= 16),
  description text not null check (length(trim(description)) between 3 and 1000),
  status      public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now()
);
create index overtime_emp_idx on public.overtime_entries(employee_id, work_date);

-- ---------- Payslips --------------------------------------------------
create table public.payslips (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  month             date not null check (extract(day from month) = 1),
  working_days      numeric(4,1) not null default 0,
  present_days      numeric(4,1) not null default 0,
  leave_days        numeric(4,1) not null default 0,
  overtime_hours    numeric(6,2) not null default 0,
  basic_salary      numeric(12,2) not null default 0 check (basic_salary >= 0),
  performance_bonus numeric(12,2) not null default 0 check (performance_bonus >= 0),
  extra_pay         numeric(12,2) not null default 0 check (extra_pay >= 0),
  net_pay           numeric(12,2) generated always as (basic_salary + performance_bonus + extra_pay) stored,
  status            public.payslip_status not null default 'draft',
  published_at      timestamptz,
  payment_status    public.payment_status not null default 'pending',
  paid_on           date,
  payment_ref       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (employee_id, month)
);
create trigger payslips_updated_at before update on public.payslips
  for each row execute function public.set_updated_at();

-- ---------- Audit log -------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);

-- =====================================================================
-- Row Level Security
-- Employees: read their own rows. Writes that need business rules go
-- through security-definer RPCs added in later phases.
-- Admins: full access via is_admin().
-- =====================================================================
alter table public.departments      enable row level security;
alter table public.profiles         enable row level security;
alter table public.settings         enable row level security;
alter table public.leave_types      enable row level security;
alter table public.leave_policies   enable row level security;
alter table public.leave_balances   enable row level security;
alter table public.leave_requests   enable row level security;
alter table public.holidays         enable row level security;
alter table public.floating_swaps   enable row level security;
alter table public.attendance       enable row level security;
alter table public.attendance_tasks enable row level security;
alter table public.overtime_entries enable row level security;
alter table public.payslips         enable row level security;
alter table public.audit_log        enable row level security;

-- Nothing is readable without logging in.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on function public.is_admin(), public.is_active_user(), public.mark_password_changed() from anon, public;
grant  execute on function public.is_admin(), public.is_active_user(), public.mark_password_changed() to authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Reference data: every active user can read, only admins write.
create policy "read: active users" on public.departments    for select to authenticated using (public.is_active_user());
create policy "write: admin"       on public.departments    for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: active users" on public.settings       for select to authenticated using (public.is_active_user());
create policy "write: admin"       on public.settings       for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: active users" on public.leave_types    for select to authenticated using (public.is_active_user());
create policy "write: admin"       on public.leave_types    for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: active users" on public.leave_policies for select to authenticated using (public.is_active_user());
create policy "write: admin"       on public.leave_policies for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: active users" on public.holidays       for select to authenticated using (public.is_active_user());
create policy "write: admin"       on public.holidays       for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profiles: own row or admin. Only admins change profiles.
create policy "read: own or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "write: admin"       on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Own-data tables: employee reads own rows, admin does everything.
create policy "read: own or admin" on public.leave_balances   for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "write: admin"       on public.leave_balances   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: own or admin" on public.leave_requests   for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "write: admin"       on public.leave_requests   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: own or admin" on public.floating_swaps   for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "write: admin"       on public.floating_swaps   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: own or admin" on public.attendance       for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "write: admin"       on public.attendance       for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read: own or admin" on public.overtime_entries for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "write: admin"       on public.overtime_entries for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read: own or admin" on public.attendance_tasks for select to authenticated using (
  public.is_admin() or exists (select 1 from public.attendance a where a.id = attendance_id and a.employee_id = auth.uid())
);
create policy "write: admin" on public.attendance_tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Payslips: employees only ever see their own PUBLISHED slips.
create policy "read: own published or admin" on public.payslips for select to authenticated
  using (public.is_admin() or (employee_id = auth.uid() and status = 'published'));
create policy "write: admin" on public.payslips for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read: admin" on public.audit_log for select to authenticated using (public.is_admin());
