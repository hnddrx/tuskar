"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Click-to-open checkbox list of a team's members, committing an array of
// member ids. Used by TeamTaskFormModal and the team task detail page's
// inline assignee field — the two places a team task's (possibly multiple)
// assignees get edited.
export default function TeamAssigneePicker({ members, selectedIds, onChange, inline = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(id) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  }

  const selectedNames = members
    .filter((m) => selectedIds.includes(m.id))
    .map((m) => m.name);

  return (
    <div ref={ref} className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          inline
            ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            : "flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-600 transition-colors"
        }
      >
        <span className={selectedNames.length ? "" : "text-slate-400 dark:text-slate-500"}>
          {selectedNames.length ? selectedNames.join(", ") : "Unassigned"}
        </span>
        <ChevronDown size={13} className="ml-1 shrink-0 text-slate-400 dark:text-slate-500" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {members.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-slate-400 dark:text-slate-500">
              No team members yet
            </p>
          )}
          {members.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(m.id)}
                onChange={() => toggle(m.id)}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              {m.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
