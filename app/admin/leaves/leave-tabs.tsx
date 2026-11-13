"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

export function LeaveTabs({ tab, year, thisYear, pending }: { tab: string; year: number; thisYear: number; pending: number }) {
  const router = useRouter();
  return (
    <Tabs
      value={tab}
      onChange={(t) => router.push(`/admin/leaves?tab=${t}${year === thisYear ? "" : `&year=${year}`}`)}
      items={[
        { value: "requests", label: "Requests", count: pending || undefined },
        { value: "balances", label: "Balances" },
        { value: "types", label: "Leave types & quotas" },
      ]}
    />
  );
}
