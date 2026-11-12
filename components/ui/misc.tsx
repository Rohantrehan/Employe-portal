import { cn } from "@/lib/cn";

/** Shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

/** Small red uppercase label with a leading line, as on the reference site. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.14em] text-brand", className)}>
      <span className="h-px w-8 bg-brand" aria-hidden />
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && (
        <span className="grid h-14 w-14 place-items-center rounded-full bg-tint text-brand [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </span>
      )}
      <p className="mt-4 text-base font-bold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-body">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-enter flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-3 text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-body">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const chipTones = {
  brand: "bg-tint text-brand",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  info: "bg-info-tint text-info",
  dark: "bg-ink text-white",
} as const;

/** KPI tile with the reference site's red top-line hover reveal. */
export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof chipTones;
  className?: string;
}) {
  return (
    <div className={cn("card card-hover group relative overflow-hidden p-5", className)}>
      <span
        className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-brand transition-transform duration-500 group-hover:scale-x-100"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-body">{label}</p>
        {icon && (
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full [&_svg]:h-[18px] [&_svg]:w-[18px]", chipTones[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.03em] text-ink">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-body">{sub}</p>}
    </div>
  );
}

/** Round initials avatar. */
export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full bg-ink font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
