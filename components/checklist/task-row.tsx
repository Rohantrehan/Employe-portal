"use client";

import { Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

/** Round tick button used by both the admin and the employee lists. */
export function TickButton({
  done,
  disabled,
  busy,
  onClick,
  label,
}: {
  done: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-pressed={done}
      aria-label={label}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition",
        done ? "border-success-dot bg-success-dot text-white" : "border-line bg-white text-transparent",
        !disabled && !done && "cursor-pointer hover:border-success-dot hover:text-success-dot/50",
        !disabled && done && "cursor-pointer hover:opacity-80",
        disabled && !done && "cursor-default border-dashed",
        busy && "animate-pulse",
      )}
    >
      <Check className="h-4 w-4" strokeWidth={3} />
    </button>
  );
}

/** "linkedin.com/in/aanya" from a full link. */
export const shortLink = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

export function AnswerLink({ url, className }: { url: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn("inline-flex max-w-full items-center gap-1 font-semibold text-info hover:underline", className)}>
      <span className="truncate">{shortLink(url)}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}
