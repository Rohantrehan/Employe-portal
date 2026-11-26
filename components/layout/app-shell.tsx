"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeftRight, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Wordmark } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/misc";
import { AREA_HOME, AREA_LABEL, NAV, isActive, type Area } from "./nav";

export type ShellUser = { name: string; email: string; avatarUrl?: string | null; subtitle?: string };

/** Counts shown next to menu items, by href. An item marked `optional` only shows when it has an entry here. */
export type NavBadges = Record<string, number>;
/** HR use both areas: a link to the other one. */
export type AreaSwitch = { href: string; label: string };

function Sidebar({ area, user, badges, switchTo, onNavigate }: { area: Area; user: ShellUser; badges?: NavBadges; switchTo?: AreaSwitch; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-rail text-rail-text">
      {/* soft red glow, as on the reference site's dark blocks */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand/20 blur-3xl" aria-hidden />

      <div className="relative flex h-16 items-center px-6">
        <Link href={AREA_HOME[area]} onClick={onNavigate} aria-label="Home">
          <Wordmark tone="white" height={24} />
        </Link>
      </div>
      <div className="relative px-6 pb-2">
        <span className="inline-flex rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
          {AREA_LABEL[area]}
        </span>
      </div>

      <nav className="rail-scroll relative flex-1 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV[area].map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-4")}>
            {group.title && (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{group.title}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.filter((item) => !item.optional || badges?.[item.href] !== undefined).map((item) => {
                const count = badges?.[item.href] ?? 0;
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-[7px] text-sm font-semibold transition-colors duration-200",
                        active ? "bg-white/[0.07] text-white" : "hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      {active && <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" aria-hidden />}
                      <span
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-lg transition-colors",
                          active ? "bg-brand text-white shadow-[0_6px_16px_-8px_rgba(212,0,15,.9)]" : "bg-white/[0.04] group-hover:text-white",
                        )}
                      >
                        <Icon className="h-[17px] w-[17px]" />
                      </span>
                      {item.label}
                      {count > 0 && (
                        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white" aria-label={`${count} to do`}>
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {switchTo && (
        <div className="relative px-3 pb-2">
          <Link
            href={switchTo.href}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06]">
              <ArrowLeftRight className="h-[17px] w-[17px]" />
            </span>
            {switchTo.label}
          </Link>
        </div>
      )}

      <div className="relative border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Avatar name={user.name} src={user.avatarUrl} size={36} className="!bg-white/10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{user.name}</p>
            <p className="truncate text-xs">{user.subtitle ?? user.email}</p>
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              aria-label="Log out"
              title="Log out"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <LogOut className="h-[17px] w-[17px]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  area,
  user,
  topbarRight,
  badges,
  switchTo,
  children,
}: {
  area: Area;
  user: ShellUser;
  badges?: NavBadges;
  switchTo?: AreaSwitch;
  topbarRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  return (
    <div className="min-h-screen bg-app">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] lg:block">
        <Sidebar area={area} user={user} badges={badges} switchTo={switchTo} />
      </aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cn("absolute inset-0 bg-ink/50 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[84%] max-w-[300px] transition-transform duration-300 ease-(--ease-deck)",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar area={area} user={user} badges={badges} switchTo={switchTo} onNavigate={() => setOpen(false)} />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute right-3 top-3.5 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-1 grid h-10 w-10 cursor-pointer place-items-center rounded-full text-ink hover:bg-app lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="truncate text-sm font-semibold text-body">{today}</p>
          <div className="ml-auto flex items-center gap-2">
            {topbarRight}
            <Avatar name={user.name} src={user.avatarUrl} size={34} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
