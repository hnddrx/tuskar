"use client";

import { useEffect, useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import ChipToggleGroup from "@/components/ChipToggleGroup";
import { ShortcutHint } from "@/components/ShortcutProvider";

export const DEFAULT_FILTERS = {
  statuses: [],
  priorities: [],
  assignees: [],
  source: "all", // 'all' | 'jira' | 'manual'
  createdFrom: "",
  createdTo: "",
  dueFrom: "",
  dueTo: "",
};

export function countActiveFilters(filters) {
  let n =
    filters.statuses.length + filters.priorities.length + filters.assignees.length;
  if (filters.source !== "all") n += 1;
  if (filters.createdFrom || filters.createdTo) n += 1;
  if (filters.dueFrom || filters.dueTo) n += 1;
  return n;
}

export default function TaskFiltersPanel({
  open,
  onOpenChange,
  config,
  filters,
  onChange,
}) {
  const ref = useRef(null);
  const activeCount = countActiveFilters(filters);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onOpenChange(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onOpenChange]);

  function patch(p) {
    onChange({ ...filters, ...p });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => onOpenChange(!open)}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
          activeCount > 0
            ? "border-slate-900 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        }`}
      >
        <SlidersHorizontal size={14} />
        Filters
        {/* The key itself is claimed by whichever page renders this panel. */}
        <ShortcutHint shortcutKey="f" />
        {activeCount > 0 && (
          <span
            className={`ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
              activeCount > 0 ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100" : ""
            }`}
          >
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 max-h-[75vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Filters</p>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="space-y-4">
            <ChipToggleGroup
              label="Status"
              options={config.statuses}
              selected={filters.statuses}
              onChange={(v) => patch({ statuses: v })}
            />
            <ChipToggleGroup
              label="Priority"
              options={config.priorities}
              selected={filters.priorities}
              onChange={(v) => patch({ priorities: v })}
            />
            <ChipToggleGroup
              label="Assignee"
              options={config.assignees}
              selected={filters.assignees}
              onChange={(v) => patch({ assignees: v })}
            />

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Source</p>
              <div className="flex gap-1.5">
                {[
                  { key: "all", label: "All" },
                  { key: "jira", label: "Jira" },
                  { key: "manual", label: "Manual" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => patch({ source: opt.key })}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      filters.source === opt.key
                        ? "border-slate-900 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                Due date range
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.dueFrom}
                  onChange={(e) => patch({ dueFrom: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
                />
                <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
                <input
                  type="date"
                  value={filters.dueTo}
                  onChange={(e) => patch({ dueTo: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                Created date range
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.createdFrom}
                  onChange={(e) => patch({ createdFrom: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
                />
                <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
                <input
                  type="date"
                  value={filters.createdTo}
                  onChange={(e) => patch({ createdTo: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              disabled={activeCount === 0}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
            >
              Clear all filters
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
