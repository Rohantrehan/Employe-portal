import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-body transition-colors hover:bg-app hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer",
  danger: "btn-secondary !text-brand hover:!border-brand hover:!bg-tint-2",
};

const sizes: Record<Size, string> = {
  sm: "!min-h-8 h-8 !px-3.5 !text-[13px]",
  md: "h-10",
  lg: "h-12 !px-7 !text-[15px]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(variants[variant], sizes[size], block && "w-full", className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/** Same look as Button, for links (pass Next <Link> props through `as` is avoided for simplicity). */
export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(variants[variant], sizes[size], extra);
}
