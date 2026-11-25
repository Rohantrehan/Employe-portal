"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { setMyTaskDone } from "@/app/app/setup/actions";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { sortTasks, type Task } from "@/lib/checklists";
import { AnswerLink, TickButton } from "./task-row";

/** The employee's own onboarding steps. */
export function MyChecklist({ tasks }: { tasks: Task[] }) {
  const list = sortTasks(tasks);
  return (
    <ol className="space-y-3">
      {list.map((t, i) => (
        <Step key={t.id} t={t} n={i + 1} />
      ))}
    </ol>
  );
}

function Step({ t, n }: { t: Task; n: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | undefined>();
  const mine = t.owner === "employee";
  const done = !!t.done_at;

  const save = async (next: boolean) => {
    setBusy(true);
    setError(undefined);
    const r = await setMyTaskDone({ id: t.id, done: next, answer: next ? answer : "" });
    setBusy(false);
    if (!r.ok) {
      if (t.ask_link && next) setError(r.error);
      else toast.error(r.error);
      return;
    }
    if (next) toast.success("Nice, step done");
    router.refresh();
  };

  return (
    <li className={cn("card flex gap-4 p-5 transition sm:p-6", done && "bg-soft")}>
      <div className="flex flex-col items-center gap-2">
        <span className="text-[11px] font-bold text-body">{String(n).padStart(2, "0")}</span>
        <TickButton
          done={done}
          busy={busy}
          disabled={!mine || (!done && !!t.ask_link)}
          onClick={mine ? () => save(!done) : undefined}
          label={done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("text-[15px] font-bold", done ? "text-body line-through decoration-line" : "text-ink")}>{t.title}</h3>
          {!mine && <Badge tone={done ? "success" : "neutral"}>{done ? "Done by your admin" : "Your admin sets this up"}</Badge>}
        </div>
        {t.details && <p className="mt-1 text-sm text-body">{t.details}</p>}

        {done ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-body">
            <span>Done {formatDate(t.done_at)}</span>
            {t.answer && <AnswerLink url={t.answer} />}
          </p>
        ) : (
          mine && (
            <div className="mt-3 space-y-3">
              {t.link_url && (
                <a href={t.link_url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                  {t.link_label ?? "Open"} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {t.ask_link && (
                <form
                  className="flex flex-col gap-2 sm:flex-row sm:items-start"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(true);
                  }}
                >
                  <Input
                    wrapperClassName="min-w-0 flex-1"
                    className="!mt-0 !h-10"
                    aria-label={t.ask_link}
                    placeholder={t.item_key === "linkedin" ? "linkedin.com/in/your-name" : "Paste the link"}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    error={error}
                    hint={t.ask_link}
                    maxLength={500}
                    inputMode="url"
                  />
                  <Button type="submit" size="md" loading={busy} disabled={!answer.trim()}>
                    Done
                  </Button>
                </form>
              )}
              {!t.ask_link && !t.link_url && <p className="text-[13px] text-body">Tick the circle when you&apos;ve done this.</p>}
            </div>
          )
        )}
      </div>
    </li>
  );
}

/** Small "why" note under the list. */
export function SafetyNote() {
  return (
    <p className="mt-6 flex items-start gap-2 text-[13px] text-body">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      Scam links get shared on Discord now and then. The antivirus and a careful eye keep your PC and the team&apos;s accounts safe. Never open a
      &quot;free Nitro&quot; or login link from a stranger.
    </p>
  );
}
