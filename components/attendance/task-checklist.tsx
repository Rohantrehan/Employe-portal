import { CheckCircle2, Circle, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/attendance";

/** Read-only list of a day's tasks: planned ones with done/not done, plus extra ones added at clock-out. */
export function TaskChecklist({ tasks, showStatus = true, className }: { tasks: Task[]; showStatus?: boolean; className?: string }) {
  if (!tasks.length) return <p className={cn("text-sm text-body", className)}>No tasks written.</p>;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2 text-sm">
          {!t.planned ? (
            <Plus className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Extra task" />
          ) : showStatus && t.done ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Done" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-body/50" aria-label={showStatus ? "Not done" : "Planned"} />
          )}
          <span className={cn("text-ink", showStatus && t.planned && !t.done && "text-body")}>{t.title}</span>
        </li>
      ))}
    </ul>
  );
}
