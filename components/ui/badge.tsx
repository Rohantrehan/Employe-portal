import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "info" | "dark";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-grey-tile text-body",
  brand: "bg-tint text-brand",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  info: "bg-info-tint text-info",
  dark: "bg-ink text-white",
};

const dots: Record<BadgeTone, string> = {
  neutral: "bg-body",
  brand: "bg-brand",
  success: "bg-success-dot",
  warning: "bg-warning",
  info: "bg-info",
  dark: "bg-white",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} aria-hidden />}
      {children}
    </span>
  );
}
