"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { RequestStatus } from "@/lib/requests";
import { setRequestStatus } from "../actions";

export function StatusButtons({ id, status }: { id: string; status: RequestStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (s: "open" | "in_progress" | "resolved", msg: string) =>
    start(async () => {
      const r = await setRequestStatus(id, s);
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });
  if (status === "withdrawn") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "open" && (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => set("in_progress", "Marked as in progress")}>
          <Clock className="h-3.5 w-3.5" /> In progress
        </Button>
      )}
      {status !== "resolved" ? (
        <Button size="sm" loading={pending} onClick={() => set("resolved", "Marked as resolved")}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
        </Button>
      ) : (
        <Button variant="secondary" size="sm" loading={pending} onClick={() => set("open", "Request reopened")}>
          <RotateCcw className="h-3.5 w-3.5" /> Reopen
        </Button>
      )}
    </div>
  );
}
