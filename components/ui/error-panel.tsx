"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "./button";

/** Friendly error screen used by the route error boundaries. */
export function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center animate-enter">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tint text-brand">
        <TriangleAlert className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-xl font-extrabold tracking-[-0.02em] text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-body">
        This page couldn&apos;t load. It&apos;s usually a brief connection problem. Try again, and if it keeps happening tell your admin.
      </p>
      {error.digest && <p className="mt-3 font-mono text-[11px] text-body">Ref: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>
        <RotateCcw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
