"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** 3px red bar at the top of the page while navigating (same as the reference site). */
export function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start when an internal link is clicked
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setVisible(true);
      setWidth(12);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.08 : w)), 120);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Finish when the route changes
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setWidth((w) => (w > 0 ? 100 : 0));
    const t = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 350);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity .3s ease" }}
    >
      <div
        className="h-full rounded-r-full bg-brand shadow-[0_0_12px_rgba(212,0,15,.6)]"
        style={{ width: `${width}%`, transition: width === 0 ? "none" : "width .3s ease" }}
      />
    </div>
  );
}
