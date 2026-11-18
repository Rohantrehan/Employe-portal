import {
  CalendarDays,
  CalendarHeart,
  Clock3,
  FileText,
  LayoutDashboard,
  Plane,
  Settings,
  Timer,
  UserRound,
  Users,
  Wallet,
  Radio,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };
export type Area = "admin" | "employee" | "former";

export const NAV: Record<Area, NavGroup[]> = {
  admin: [
    {
      items: [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/admin/today", label: "Today", icon: Radio },
      ],
    },
    {
      title: "People",
      items: [
        { href: "/admin/employees", label: "Employees", icon: Users },
        { href: "/admin/leaves", label: "Leave requests", icon: Plane },
        { href: "/admin/overtime", label: "Extra hours", icon: Timer },
      ],
    },
    {
      title: "Company",
      items: [
        { href: "/admin/holidays", label: "Holidays", icon: CalendarHeart },
        { href: "/admin/payroll", label: "Payroll", icon: Wallet },
        { href: "/admin/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  employee: [
    {
      items: [
        { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/app/attendance", label: "Attendance", icon: Clock3 },
      ],
    },
    {
      title: "Time off",
      items: [
        { href: "/app/leaves", label: "Leaves", icon: Plane },
        { href: "/app/holidays", label: "Holidays", icon: CalendarDays },
        { href: "/app/overtime", label: "Extra hours", icon: Timer },
      ],
    },
    {
      title: "Me",
      items: [
        { href: "/app/payslips", label: "Payslips", icon: FileText },
        { href: "/app/profile", label: "Profile", icon: UserRound },
      ],
    },
  ],
  former: [{ items: [{ href: "/former", label: "My documents", icon: FileText, exact: true }] }],
};

/** Home page and sidebar label for each area. */
export const AREA_HOME: Record<Area, string> = { admin: "/admin", employee: "/app", former: "/former" };
export const AREA_LABEL: Record<Area, string> = { admin: "Admin panel", employee: "Employee portal", former: "Former employee" };

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}
