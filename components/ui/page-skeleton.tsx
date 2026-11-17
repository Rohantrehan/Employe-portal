import { Skeleton } from "./misc";

/** Shown inside the app shell while the next page loads, so navigation feels instant. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="animate-[enter_.3s_var(--ease-deck)_both]">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-9 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-16" />
            <Skeleton className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="card mt-6 p-6">
        <Skeleton className="h-4 w-40" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
