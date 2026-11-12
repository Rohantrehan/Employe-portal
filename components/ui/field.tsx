"use client";

import { forwardRef, useId, useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "mt-2 w-full rounded-2xl border bg-white px-4 text-[15px] text-ink outline-none transition placeholder:text-body/60 focus:border-brand focus:ring-4 focus:ring-tint disabled:cursor-not-allowed disabled:bg-soft disabled:text-body";

const borderFor = (error?: string) => (error ? "border-brand" : "border-line");

type Common = { label?: React.ReactNode; hint?: React.ReactNode; error?: string; wrapperClassName?: string };

function FieldWrap({
  label,
  hint,
  error,
  id,
  className,
  children,
}: Omit<Common, "wrapperClassName"> & { id: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("block", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] font-medium text-brand">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-body">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & Common>(
  function Input({ label, hint, error, wrapperClassName, className, id, ...props }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <FieldWrap label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fid}-err` : undefined}
          className={cn(control, "h-12", borderFor(error), className)}
          {...props}
        />
      </FieldWrap>
    );
  },
);

export const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & Common>(
  function PasswordInput({ label, hint, error, wrapperClassName, className, id, ...props }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    const [show, setShow] = useState(false);
    return (
      <FieldWrap label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
        <div className="relative">
          <input
            ref={ref}
            id={fid}
            type={show ? "text" : "password"}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${fid}-err` : undefined}
            className={cn(control, "h-12 pr-12", borderFor(error), className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-[calc(50%+4px)] grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-body transition-colors hover:bg-app hover:text-ink"
          >
            {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </FieldWrap>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(
  function Textarea({ label, hint, error, wrapperClassName, className, id, rows = 4, ...props }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <FieldWrap label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
        <textarea
          ref={ref}
          id={fid}
          rows={rows}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fid}-err` : undefined}
          className={cn(control, "resize-y py-3 leading-relaxed", borderFor(error), className)}
          {...props}
        />
      </FieldWrap>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & Common>(
  function Select({ label, hint, error, wrapperClassName, className, id, children, ...props }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <FieldWrap label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
        <div className="relative">
          <select
            ref={ref}
            id={fid}
            aria-invalid={!!error || undefined}
            className={cn(control, "h-12 cursor-pointer appearance-none pr-11", borderFor(error), className)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-[calc(50%+4px)] h-4 w-4 -translate-y-1/2 text-body" />
        </div>
      </FieldWrap>
    );
  },
);
