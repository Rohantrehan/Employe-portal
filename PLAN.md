# Employee Portal — Master Plan

> We work through this file one phase at a time. Tick a box when a task is done.
> When something is changed, add one line to the **Change Log** at the bottom.

- **Stack:** Next.js (App Router, TypeScript) + Tailwind CSS v4 + Supabase (Auth, Postgres, Row Level Security, Storage)
- **Design reference:** https://seller.rohtremedia.com/ (RohTre Media, also Next.js + Tailwind)
- **Supabase project:** the user will provide it. Do NOT use any project from the connected Supabase account.
- **Locale defaults:** Timezone `Asia/Kolkata`, currency INR (₹), dates shown as `DD MMM YYYY`
- **Work week:** Monday to Saturday, 09:00–17:00. Saturday is a full working day. Every Sunday is off.
- **Leave year:** January to December

---

## 1. Design System (copied from seller.rohtremedia.com)

All values below come from the live site's CSS. The portal must use these exact tokens.

### 1.1 Colors (Tailwind v4 `@theme` tokens)

| Token | Hex | Used for |
|---|---|---|
| `brand` | `#d4000f` | Primary buttons, active nav, accents, progress bar |
| `brand-dark` | `#b8000d` | Primary button hover |
| `ink` | `#111827` | Headings, main text |
| `body` | `#6b7280` | Secondary / paragraph text |
| `line` | `#e5e7eb` | Borders, dividers |
| `app` | `#f4f5f7` | Dashboard page background |
| `soft` | `#fafafb` | Subtle surfaces, secondary-button hover |
| `grey-tile` | `#f3f4f6` | Tiles, skeletons |
| `tint` | `#fbe6e7` | Red tint (icon chips, input focus ring) |
| `tint-2` | `#fcebec` | Card hover background |
| `rail` | `#14161b` | Dark sidebar ("rail") and dark CTA blocks |
| `rail-text` | `#a1a7b3` | Sidebar text |
| `success` / `success-tint` / `success-dot` | `#15803d` / `#e8f5ec` / `#22c55e` | Approved, Present, Clocked-in |
| `warning` / `warning-tint` | `#b45309` / `#fef3c7` | Pending, Late, Half day |
| `sky-700` / `sky-100` | `#0069a4` / `#dff2fe` | Info, Holiday badges |
| white | `#fff` | Cards |

The login page side panel uses this gradient: `linear-gradient(160deg,#fff4f4 0%,#fbe6e7 55%,#f7d5d8 100%)`

### 1.2 Typography
- Font: **Plus Jakarta Sans** (load with `next/font/google`, CSS variable `--font-jakarta`)
- Fallback: `"Segoe UI", system-ui, Arial, sans-serif`
- H1 (hero): `text-[44px] sm:text-[60px] font-extrabold leading-[1.02] tracking-[-0.035em]`
- H1 (login / page title): `text-[32px] font-extrabold leading-tight tracking-[-0.03em]`
- H2 (section): `text-[36px] sm:text-[44px] font-extrabold leading-[1.08] tracking-[-0.03em]`
- Eyebrow label: `text-[13px] font-bold uppercase tracking-[0.14em] text-brand` with a small `h-px w-8 bg-brand` line in front
- Small caps label: `text-[10px] font-bold uppercase tracking-wider text-body`

### 1.3 Shape, shadow, motion
- Card radius `20px` (`rounded-card`), inputs `rounded-2xl`, buttons fully round (`999px`)
- `shadow-card: 0 12px 32px -16px #11182729`, `shadow-pop: 0 18px 44px -20px #11182738`
- Easing `ease-deck: cubic-bezier(.33,1,.68,1)`
- Animations to copy: `enter` (fade up 16px, .65s), `pop` (.22s), `float` (6s), `pulse-ring` (red ring, 2.4s), `shimmer` (skeleton loader), and a 3px red top **route-progress bar** with a red glow

### 1.4 Components (exact CSS from the site)
```css
.btn-primary { background:#d4000f; color:#fff; min-height:40px; border-radius:999px; padding:0 20px;
  font-size:14px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:8px;
  box-shadow:0 6px 16px -10px #d4000f99; transition: background .3s, transform .3s, box-shadow .3s var(--ease-deck); }
.btn-primary:hover  { background:#b8000d; transform:translateY(-2px); box-shadow:0 14px 28px -12px #d4000f8c; }
.btn-primary:active { transform:scale(.97); }
.btn-primary:disabled { opacity:.6; cursor:not-allowed; transform:none; }
.btn-secondary { background:#fff; border:1px solid #e5e7eb; color:#111827; border-radius:999px; min-height:40px;
  padding:0 18px; font-size:14px; font-weight:600; }
.btn-secondary:hover { background:#fafafb; border-color:#d1d5db; transform:translateY(-2px); }
.card { background:#fff; border:1px solid #e5e7eb; border-radius:20px; box-shadow:var(--shadow-card); }
.card-hover:hover { border-color:#f3c4c7; transform:translateY(-4px); box-shadow:0 24px 48px -24px #11182747; }
```
- **Input:** `mt-2 h-12 w-full rounded-2xl border border-line bg-white px-4 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-tint`
- **Password input:** same as Input with `pr-12`, plus a show/hide eye button
- **Icon chip:** `grid h-7 w-7 place-items-center rounded-full bg-tint text-brand`
- **Numbered chip:** `grid h-9 w-9 rounded-full bg-ink text-white`, turns `bg-brand` on hover
- **Nav pill:** `rounded-full px-4 py-2 text-sm font-semibold text-body hover:bg-app hover:text-ink`
- **Dark CTA block:** `rounded-[32px] bg-rail text-white` with blurred red glows (`bg-brand/30 blur-3xl`)
- **Loader:** red "R" logo with `animate-pulse-ring` and `animate-float` on a white screen
- **Icons:** `lucide-react`
- **Logos:** `/logos/rohtre-r-red.png`, `/logos/rohtre-wordmark-black.png`, `/logos/rohtre-wordmark-white.png`. We will ask the user for the files, or use them with permission.

### 1.5 Layouts
- **Login page:** two columns. Left side is the form (max-w 400px, wordmark logo, eyebrow, "Welcome back.", email and password fields, full-width `btn-primary`). Right side (desktop only) is the pink gradient panel with floating feature pills.
- **Logged-in app:** dark `rail` sidebar on the left with the white wordmark, `rail-text` links, active link in brand red. The main area has the `app` grey background, white `card`s and a top bar showing the user's avatar and name.
- **Mobile:** the sidebar becomes a bottom sheet or drawer. Use a 16px gutter and no horizontal scroll.

---

## 2. Roles & Access

| | Admin | Employee |
|---|---|---|
| Login | `/login` (same page; the user is routed by role) | `/login` |
| Area | `/admin/*` | `/app/*` |
| Create accounts | ✅ creates employee logins | ❌ (no public sign-up) |
| See all employees' data | ✅ | ❌ only their own |
| Graphs | ✅ company-wide analytics | ✅ personal analytics |
| Leave policy | ✅ sets quotas per leave type | View balances only |
| Payslips | ✅ enters data and publishes | View and download own |

- Security uses Supabase Auth plus a `profiles.role` column (`admin` | `employee`). It is enforced in three places:
  1. Next.js `middleware.ts` (route guard)
  2. Server components / actions (role check)
  3. **Postgres RLS** on every table (the real security boundary)
- Admin creates employees with `supabase.auth.admin.createUser()` inside a **server action**, using the service-role key. The key never reaches the browser.
- The admin can deactivate an employee (ban the user and set `is_active=false`) and reset their password.

---

## 3. Feature Specification

### 3.1 Authentication
- Email and password login, with an error message for a wrong password or an inactive account
- The employee must change their password on first login (`must_change_password` flag)
- Forgot password: Supabase reset email (optional, Phase 9)
- Logout clears the session

### 3.2 Admin — Employee Management
- List employees (search, filter by department or status), add, edit, deactivate
- Fields: employee code, full name, email, phone, designation, department, date of joining, monthly CTC / salary structure, avatar, status
- Employee profile page: tabs for Attendance, Tasks, Leaves, Overtime, Payslips

### 3.3 Attendance — Clock In / Clock Out with tasks
- **Clock In:** the employee must write **today's planned tasks** (one or more task lines) before the button works. The server records the time from the database (`now()`), not the browser clock, so it cannot be faked.
- **Clock Out:** the employee must write **what was completed** (they can mark each planned task done or not done and add notes). The server records the clock-out time.
- Rules:
  - One attendance row per employee per date. Clock-in is blocked on Sundays and company holidays, with a warning.
  - Clock-in after 09:00 + grace (default 15 min, set by admin) = **Late**
  - Clock-out before 17:00 = **Early leave**
  - Worked hours are calculated automatically. Under 4 hours = **Half day** (threshold set by admin).
  - If someone forgets to clock out, an auto-close job at 23:59 marks the row `missed_clock_out` and the admin can fix it.
- Live status card: "Clocked in at 09:04 · 3h 12m so far" with a pulsing green dot

### 3.4 Admin — Live "Today" board
- Every employee with a status: **Working** (clocked in), **On leave** (with leave type), **Not clocked in**, **Clocked out**, **Holiday**
- Each person's **today's task plan**, and their completed tasks after clock-out
- Filters, search, and daily history by date picker

### 3.5 Leave Management
- **Leave types** (admin can add and edit): Sick Leave, Paid Leave, Vacation Leave, Unpaid Leave (plus Floating Holiday as a special type)
- **Policy:** admin sets the yearly quota per type for everyone, can override per employee, and chooses whether unused leave carries forward
- **Balances:** per employee, per year, per type: allotted, used, pending, remaining
- **Apply for leave:**
  - Day types: **Full day**, **Half day (First half / Second half)**
  - **Date range** (from–to). The day count automatically **skips Sundays and company holidays**.
  - Reason and an optional attachment (e.g. medical note, stored in Supabase Storage)
  - The form shows a live preview: "This request uses 3.5 days of Paid Leave (Sun 16 Nov and Diwali excluded)"
  - Blocked if the balance is not enough (except Unpaid) or if it overlaps an existing request
- **Workflow:** Pending → Approved / Rejected (by admin, with a comment). The employee can cancel while it is pending.
- An approved leave deducts the balance, and its days show as "On leave" in attendance
- Unpaid leave days feed into the payslip as **LOP (Loss of Pay)** days

### 3.6 Holidays & Floating Holidays
- Admin manages the **holiday calendar** per year: date, name, type (`company` / `festival` / `floating`)
- Sundays are generated automatically as weekly off. They are not stored as rows.
- Employees see a **holiday calendar** (month view plus an upcoming list)
- **Floating holiday swap:** an employee can move a floating holiday to another working day
  - Any holiday the admin marks as `floating` can be swapped. There is no yearly count limit.
  - Request: "Swap *[holiday]* → *[new date]*". The new date must be a working day (not a Sunday or another holiday). **Admin approval is always required.**
  - After approval, the original date becomes a working day for that employee and the new date becomes their holiday

### 3.7 Overtime / Extra Hours
- Employee logs extra hours: date, hours, description of the work
- Admin approves or rejects them
- Approved hours for the month are shown on the payroll screen as a reference. The admin types the **Extra Pay** amount; there is no automatic rate.
- Optional: suggest overtime automatically when worked hours are over 8 h on a day

### 3.8 Payslips (Salary Slips)
- The payslip has **only 3 amounts**:
  1. **Basic Salary** (pre-filled from the employee's profile; the admin can edit it)
  2. **Performance Bonus** (entered by the admin)
  3. **Extra Pay** (for extra working hours; entered by the admin)
  - **Net Pay = Basic + Performance Bonus + Extra Pay.** There are no deductions (no PF, ESI, tax or LOP).
- Admin opens **Payroll → Month**. Each employee's row shows reference info (read-only): working days in the month, days present, leave days taken, approved extra hours
- The admin fills in the 3 amounts, saves a **Draft**, then clicks **Publish** (one employee or all at once)
- The employee sees all published payslips (history table: month, basic, bonus, extra pay, net, paid on) and can **download a PDF**
- The PDF is generated on the server with `@react-pdf/renderer`, branded with the logo and colors. It is created on demand, so it is always in sync with the data.
- Payment status: Pending / Paid (with paid date and reference number)

### 3.9 Dashboards & Graphs
Charts use **Recharts**, styled with the brand palette.

**Admin dashboard**
- KPI tiles: total employees, present today, on leave today, pending leave requests, pending overtime, upcoming holiday
- Attendance trend (last 30 days, present / late / absent, stacked bars)
- Leave usage by type (donut) and by month (bars)
- Average working hours per employee (bar)
- Overtime hours per month (line)
- Payroll cost by month (bar)

**Employee dashboard**
- Clock-in / out card with today's tasks
- Leave balance per type (donut or progress rings)
- My working hours this week and month (bar, with the 8 h target line)
- My attendance this month (calendar heat-map: present / late / leave / holiday / Sunday)
- Overtime this month, next holiday, latest payslip

### 3.10 Nice-to-have (later)
- Notifications (in-app bell, plus optional email on leave approval and payslip publish)
- Audit log of admin actions
- CSV / Excel export of attendance and leaves
- Announcements board

---

## 4. Database Schema (Supabase / Postgres)

All tables have `id uuid pk default gen_random_uuid()` and `created_at timestamptz default now()` unless noted. **RLS is ON for every table.**

```text
profiles            (id = auth.users.id) role, emp_code, full_name, email, phone, designation,
                    department_id, date_of_joining, basic_salary, avatar_url, is_active, must_change_password
departments         name
settings            (single row) work_start 09:00, work_end 17:00, grace_minutes 15,
                    half_day_min_hours 4, weekly_off = [0] (Sunday)
leave_types         code, name, is_paid, color, requires_attachment, is_active
leave_policies      leave_type_id, year, default_quota, carry_forward (bool), max_carry
leave_balances      employee_id, leave_type_id, year, allotted, carried, used, pending   (unique emp+type+year)
leave_requests      employee_id, leave_type_id, start_date, end_date,
                    day_part ('full'|'first_half'|'second_half'), days numeric(4,1),
                    reason, attachment_path, status ('pending'|'approved'|'rejected'|'cancelled'),
                    reviewed_by, reviewed_at, review_note
holidays            date, name, type ('company'|'festival'|'floating'), year
floating_swaps      employee_id, holiday_id, new_date, status, reviewed_by, reviewed_at
attendance          employee_id, work_date, clock_in, clock_out, worked_minutes,
                    status ('present'|'late'|'half_day'|'missed_clock_out'), early_leave bool
                    (unique employee_id + work_date)
attendance_tasks    attendance_id, title, planned bool, done bool, note
overtime_entries    employee_id, work_date, hours numeric(4,2), description, status, reviewed_by
payslips            employee_id, month (date, 1st of month), working_days, present_days, leave_days,
                    overtime_hours, basic_salary, performance_bonus, extra_pay,
                    net_pay (generated = basic_salary + performance_bonus + extra_pay),
                    status ('draft'|'published'), payment_status, paid_on, payment_ref
                    (unique employee_id + month)
audit_log           actor_id, action, entity, entity_id, payload jsonb
```

**Database functions and triggers**
- `is_admin()`: a security-definer helper used by the RLS policies
- `working_days_between(start, end, employee)`: skips Sundays, holidays and the employee's approved floating swaps
- `clock_in(tasks text[])` / `clock_out(updates jsonb)`: RPCs that use server time and enforce the rules
- Trigger on `leave_requests` status change: update `leave_balances.used/pending`
- `pg_cron` job: auto-close missed clock-outs daily at 23:59 IST

**RLS pattern**
- Employee: `select/insert` own rows (`employee_id = auth.uid()`), `update` own *pending* requests only
- Admin: full access through `is_admin()`
- `payslips`: employees can only `select` rows where `status = 'published'`

---

## 5. Project Structure

```text
employee-portal/
  app/
    (auth)/login/page.tsx
    (auth)/change-password/page.tsx
    admin/
      layout.tsx            ← dark rail sidebar
      page.tsx              ← analytics dashboard
      today/page.tsx        ← live board
      employees/…           ← list, new, [id]
      leaves/…              ← requests, policies, types
      holidays/page.tsx
      overtime/page.tsx
      payroll/[month]/page.tsx
      settings/page.tsx
    app/
      layout.tsx
      page.tsx              ← employee dashboard + clock card
      attendance/page.tsx
      leaves/page.tsx       ← apply + history + balances
      holidays/page.tsx     ← calendar + floating swap
      overtime/page.tsx
      payslips/page.tsx
      payslips/[id]/pdf/route.ts
      profile/page.tsx
  components/ui/            ← Button, Card, Input, Badge, Modal, Table, Tabs, Skeleton, Toast
  components/charts/
  lib/supabase/             ← client.ts, server.ts, admin.ts (service role, server-only)
  lib/validators/           ← zod schemas
  supabase/migrations/      ← numbered SQL files
  middleware.ts
  PLAN.md
```

**Libraries:** `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `react-hook-form`, `recharts`, `lucide-react`, `date-fns` + `date-fns-tz`, `@react-pdf/renderer`, `sonner` (toasts)

---

## 6. Build Phases (we go one by one)

### Phase 0 — Setup
- [x] Create the Next.js app (Next 15.5.4, TypeScript, App Router, Tailwind v4, ESLint) in this folder
- [x] `git init` and the first commit
- [x] `.env.example` committed (real `.env.local` is git-ignored)
- [x] `.env.local` has the project URL (`rfnjiayqzyhttbhpjfoc`) and `DATABASE_URL`
- [x] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable) and `SUPABASE_SERVICE_ROLE_KEY` (secret) to `.env.local`. Both tested against the live API on 2026-11-13 ✅
- [x] Install the libraries listed in §5
- [x] Supabase clients: `lib/supabase/client.ts` (browser), `server.ts` (cookies), `admin.ts` (service role, server-only)
- [x] RohTre logos saved to `public/logos/`, site icon to `app/icon.svg`

### Phase 1 — Design System
- [x] Add the `@theme` tokens (§1.1–1.3) to `app/globals.css` and load the Plus Jakarta Sans font (`app/layout.tsx`)
- [x] Build UI primitives in `components/ui/`: Button (primary/secondary/ghost/danger, sm/md/lg, loading), Card, Input, PasswordInput, Select, Textarea, Badge, Modal, Table, Tabs, Skeleton, EmptyState, Eyebrow, PageHeader, StatTile, Avatar, plus toasts (`sonner`)
- [x] Build the route-progress bar and the logo loader (also used as `app/loading.tsx`)
- [x] Build the app shell (`components/layout/app-shell.tsx`): dark rail sidebar with grouped nav (admin and employee menus in `nav.ts`), top bar with today's date, mobile drawer
- [x] Add a `/styleguide` page (the home page redirects there until Phase 2). Checked on desktop in Chrome.
- [ ] Check the mobile layout on a real phone or in DevTools (couldn't resize the browser window in this session)

### Phase 2 — Database & Auth
- [x] Migration runner `npm run db:migrate` (`scripts/migrate.mjs`; tracks applied files in `ops.migrations`)
- [x] `0001_core_schema.sql`: all 14 tables from §4, enums, RLS on every table, `is_admin()`, auto-profile trigger on new auth users (role read from `app_metadata`, which only the server can set), `mark_password_changed()`. Applied ✅
- [x] `0002_seed_defaults.sql`: settings row, leave types SL/PL/VL/UL, 2026 + 2027 quotas (Sick 12, Paid 12, Vacation 6, Unpaid unlimited). Applied ✅
- [x] Login page (reference layout), middleware session refresh and redirects, role layouts (`/admin` admin only, `/app` employee only), logout route, branded 404
- [x] Forced first-login password change (`/change-password`)
- [x] `npm run create-admin -- email "Full Name"` script (prints a one-time temporary password)
- [x] First admin account: the user created it in the Supabase dashboard, then it was promoted to admin (Rohan Trehan, RT-001; role set in both `profiles` and `app_metadata`)
- [x] Logged out, `/`, `/admin` and `/app` redirect to `/login`. The login page renders on narrow screens.
- [x] The user logged in as admin end to end ✅
- [x] Security test passed (14/14) with a throwaway employee: they see only their own profile and balances, can't make themselves admin, change their salary, create payslips, add holidays or write the audit log, and logged-out visitors see nothing. The test user was deleted and the code counter reset.

### Phase 3 — Admin: Employees
- [x] Migration `0003_employees.sql`: new employees automatically get their current-year leave balances, plus `init_leave_balances()` (admin only) and the `log_action()` audit helper
- [x] Employee list `/admin/employees`: Active / Deactivated / All tabs, search (name, email, code), department filter, card list on phones
- [x] Add employee `/admin/employees/new`: creates the login (`auth.admin.createUser`) and fills the profile. Shows the temporary password once with copy buttons. Rolls back the login if saving the profile fails.
- [x] Employee detail `/admin/employees/[id]`: edit all fields (email and role changes are synced to the login), at-a-glance card, leave-balance bars, reset password (new temporary password shown once), deactivate / re-activate (bans the login, history kept)
- [x] Safety rules: an admin can't remove their own admin access, deactivate themselves, or reset their own password from here
- [x] Departments: add, rename and delete in a pop-up on the employee list (employees in a deleted department are kept, with no department)
- [x] Every admin action is written to `audit_log`
- [ ] The user to click through the screens (create, edit, deactivate, reset) and report any issues
- Later phases add Attendance / Leave / Payslip history to the detail page

### Phase 4 — Attendance & Daily Tasks
- [x] Migration `0004_attendance.sql`:
  - `clock_in(tasks[])` and `clock_out(done[], extra[], summary)` RPCs. Server time only, Sunday / holiday / full-day-leave blocked, tasks required at clock-in, summary required at clock-out.
  - `attendance_compute` trigger recalculates late (after 09:00 + grace), half day (under 4 h), early leave (before 17:00) and missed clock-out on every insert or update, so admin corrections recompute too
  - `day_info()` works out what kind of day it is: working, weekly off, holiday (including moved floating holidays), leave or half-day leave
  - `team_day(date)` for the admin board, admin only
  - pg_cron job `close-missed-clock-outs` at 23:59 IST, plus the same cleanup on every clock-in and when the Today board loads
- [x] Migration `0005_attendance_month.sql`: `employee_month(employee, month)` returns every day of a month (self or admin)
- [x] Employee dashboard `/app`: clock card in 4 states (off day, ready to clock in, working with a live timer and plan, day complete). The clock-in pop-up has a task-list editor; the clock-out pop-up has a ticklist, extra tasks and a summary. Monthly stat tiles.
- [x] Employee `/app/attendance`: month calendar (Monday-first, coloured by status, hours per day), day details panel (in/out times, tasks, summary, admin note), previous months
- [x] Admin `/admin/today`: stat tiles, filter tabs (Working / Clocked out / Away / Not in), search, one card per person (times, plan or completed tasks, summary), date picker for history, refreshes every 60 s on today
- [x] Admin attendance fix: "Edit times" or "Add attendance" on any card (IST time inputs plus a note the employee can see). Audit logged.
- [x] Middleware sends people to their own area by role at the HTTP level (proper 307 instead of a browser redirect after the page starts loading)
- [x] Tests: attendance logic 19/19 and page rendering 13/13, using throwaway employees that were deleted afterwards
- [ ] The user to check `/admin/today` in the browser (couldn't render it as admin in tests without the admin password)

### Phase 5 — Holidays
- [ ] Admin holiday calendar CRUD (company / festival / floating)
- [ ] Employee holiday calendar view
- [ ] Floating holiday swap request and approval

### Phase 6 — Leave Management
- [ ] Admin: leave types, yearly policies, per-employee overrides, balance initialisation per year
- [ ] Employee: balances view, apply form (full / half / range) with the live day-count preview
- [ ] Approval queue for the admin, cancel for the employee, balance triggers
- [ ] Show leave days in attendance and on the Today board

### Phase 7 — Overtime
- [ ] Employee overtime log form and history
- [ ] Admin approval queue

### Phase 8 — Payroll & Payslips
- [ ] Basic salary field on the employee profile
- [ ] Monthly payroll screen: reference info (days, leaves, extra hours) plus 3 editable amounts (Basic, Performance Bonus, Extra Pay), with draft and publish
- [ ] Payslip PDF template (branded) plus a download route with an ownership check
- [ ] Employee payslip history and download

### Phase 9 — Dashboards & Graphs
- [ ] Admin analytics dashboard (§3.9)
- [ ] Employee personal dashboard (§3.9)
- [ ] Postgres views / RPCs for chart data, so the browser does not do heavy queries

### Phase 10 — Polish, QA & Deploy
- [ ] Notifications, audit log, CSV export (from §3.10, if wanted)
- [ ] Run Supabase advisors (security and performance), and test RLS with an employee account
- [ ] Mobile responsive pass, empty and loading states, accessibility check
- [ ] Deploy (Vercel recommended), add production env vars, create the real admin account

---

## 7. Decisions & Open Questions

**Decided (2026-11-12)**
1. Framework: **Next.js** ✅
2. Logos: use the RohTre logo files from the site ✅
3. Saturday: **full working day**, 9–5 ✅
4. Floating holiday swap: **admin approval required**. Any holiday marked floating can be swapped, with no count limit. ✅
5. Payslip: only **Basic Salary + Performance Bonus + Extra Pay**. No deductions. ✅
6. Extra working pay: the admin types the amount manually ✅
7. Leave year: **January–December** ✅

**Still open (using these defaults until told otherwise)**
8. Late / half-day rules: 15-minute grace period, 4-hour half-day threshold (both can be changed by the admin in Settings)
9. Approvals: admin only, with no manager step

---

## 8. Change Log
| Date | Change |
|---|---|
| 2026-11-12 | Researched seller.rohtremedia.com (design tokens, fonts, components, login layout). Created PLAN.md. |
| 2026-11-12 | User answers applied: Next.js; Saturday is a full day; floating swaps need admin approval and have no limit; payslip is Basic + Performance Bonus + Extra Pay only (no deductions, no overtime rate); leave year Jan–Dec; logos approved. Removed salary_structures and overtime rate settings. |
| 2026-11-12 | Phase 0 done (except the Supabase keys): scaffolded Next.js, installed libraries, added the Supabase client helpers, downloaded the logos, and the build passes. |
| 2026-11-12 | Phase 1 done: design tokens, Plus Jakarta Sans, UI components, route-progress bar, logo loader, app shell (sidebar, top bar, mobile drawer), `/styleguide` page. Moved the Next.js dev badge to the bottom right so it doesn't cover the sidebar. Type-check, lint and build pass. |
| 2026-11-13 | Phase 2 (most of it): connected to the user's Supabase database, applied migrations 0001 + 0002, built login, change-password, logout, middleware, role-guarded layouts, the 404 page and the create-admin script. `/styleguide` now shows only in development. Waiting on the API keys to create the admin and test end to end. Default leave quotas are placeholders for the admin to adjust. |
| 2026-11-13 | Keys verified. The user created an account in the Supabase dashboard, which was promoted to admin (Rohan Trehan). Note: if an admin's role is changed by hand, update BOTH `profiles.role` and `auth.users.raw_app_meta_data.role`. |
| 2026-11-13 | Phase 3 built: employee list, add, edit, deactivate, reset password, departments, automatic leave balances (migration 0003), audit logging, plus `lib/format.ts` (dates as DD MMM YYYY, ₹ amounts) and `lib/password.ts`. The security test passed 14/14. Type-check and lint pass. |
| 2026-11-13 | Phase 4 built: clock in/out with tasks, automatic statuses, nightly pg_cron cleanup, employee dashboard and attendance calendar, admin Today board with attendance fixes (migrations 0004 + 0005). Middleware now enforces the role area. Tests 19/19 + 13/13. Added `summary` and `is_late` columns to attendance (late is now tracked separately from half day). |
