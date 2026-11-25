"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { timeText, type RequestMessage } from "@/lib/requests";

type Result = { ok: true } | { ok: false; error: string };

/** The conversation. `side` decides which messages sit on the right ("mine"). */
export function Thread({ messages, side, employeeName }: { messages: RequestMessage[]; side: "employee" | "admin"; employeeName: string }) {
  return (
    <ol className="space-y-4" aria-label="Messages">
      {messages.map((m) => {
        const mine = m.from_admin === (side === "admin");
        const name = m.from_admin ? (side === "admin" ? (m.author ?? "Admin") : "HR") : side === "employee" ? "You" : employeeName;
        return (
          <li key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
            <Avatar name={m.from_admin ? (m.author ?? "HR") : employeeName} size={34} className={m.from_admin ? "!bg-ink" : undefined} />
            <div className={cn("min-w-0 max-w-[85%] sm:max-w-[75%]", mine && "text-right")}>
              <p className="text-[12px] text-body">
                <b className="font-semibold text-ink">{name}</b> · {timeText(m.created_at)}
              </p>
              <div
                className={cn(
                  "mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-left text-[15px] leading-relaxed",
                  mine ? "rounded-tr-md bg-ink text-white" : "rounded-tl-md border border-line bg-white text-ink",
                )}
              >
                {m.body}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ReplyBox({
  id,
  action,
  placeholder,
  note,
}: {
  id: string;
  action: (id: string, body: string) => Promise<Result>;
  placeholder: string;
  note?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const r = await action(id, body);
      if (!r.ok) return void toast.error(r.error);
      setBody("");
      router.refresh();
    });
  return (
    <form
      className="card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor="reply" className="sr-only">Reply</label>
      <textarea
        id="reply"
        rows={3}
        value={body}
        maxLength={3000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        className="w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-body/60 focus:border-brand focus:ring-4 focus:ring-tint"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-body">{note ?? "Ctrl + Enter to send"}</p>
        <Button type="submit" loading={pending} disabled={!body.trim()}>
          <Send className="h-4 w-4" /> Send
        </Button>
      </div>
    </form>
  );
}

/** Marks the request as read once it's on screen, then refreshes the menu badge. */
export function MarkSeen({ id, unread, action }: { id: string; unread: boolean; action: (id: string) => Promise<unknown> }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!unread || done.current) return;
    done.current = true;
    action(id).then(() => router.refresh());
  }, [id, unread, action, router]);
  return null;
}
