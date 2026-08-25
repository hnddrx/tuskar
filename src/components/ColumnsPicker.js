"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";

// Popover for choosing which optional columns show in the Task Table,
// mirroring TaskFiltersPanel's open/outside-click pattern. `columns` is the
// full ordered list of { key, label, required }; `visibleKeys` / `onChange`
// track which non-required keys are currently shown.
export default function ColumnsPicker({ columns, visibleKeys, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggle(key) {
    onChange(
      visibleKeys.includes(key)
        ? visibleKeys.filter((k) => k !== key)
        : [...visibleKeys, key]
    );
  }

  const optional = columns.filter((c) => !c.required);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
      >
        <Columns3 size={14} />
        Columns
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <p className="px-2 py-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
            Show columns
          </p>
          {optional.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={visibleKeys.includes(c.key)}
                onChange={() => toggle(c.key)}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
