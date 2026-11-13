"use client";

import { useRef } from "react";
import { Plus, X } from "lucide-react";

/** Editable list of one-line tasks. Enter adds a new line, Backspace on an empty line removes it. */
export function TaskListEditor({
  value,
  onChange,
  placeholder = "e.g. Finish the homepage banner",
  max = 20,
  label,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  label: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const focus = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());

  const update = (i: number, text: string) => onChange(value.map((v, j) => (j === i ? text : v)));
  const add = (at: number) => {
    if (value.length >= max) return;
    onChange([...value.slice(0, at + 1), "", ...value.slice(at + 1)]);
    focus(at + 1);
  };
  const remove = (i: number) => {
    if (value.length === 1) return onChange([""]);
    onChange(value.filter((_, j) => j !== i));
    focus(Math.max(0, i - 1));
  };

  return (
    <div role="group" aria-label={label}>
      <ol className="space-y-2">
        {value.map((task, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={task}
              maxLength={500}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (task.trim()) add(i);
                } else if (e.key === "Backspace" && task === "" && value.length > 1) {
                  e.preventDefault();
                  remove(i);
                }
              }}
              placeholder={i === 0 ? placeholder : "Another task"}
              aria-label={`${label} ${i + 1}`}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-[15px] text-ink outline-none transition placeholder:text-body/60 focus:border-brand focus:ring-4 focus:ring-tint"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove task ${i + 1}`}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-body transition-colors hover:bg-app hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      {value.length < max && (
        <button
          type="button"
          onClick={() => add(value.length - 1)}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-brand transition-colors hover:bg-tint-2"
        >
          <Plus className="h-4 w-4" /> Add task
        </button>
      )}
      <p className="mt-1 text-[13px] text-body">Press Enter for a new line.</p>
    </div>
  );
}
