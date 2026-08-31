"use client";

import { Archive } from "lucide-react";

// "Show archived" for a list.
//
// Showing the archive adds the archived rows to the list rather than
// replacing it: the point of the toggle — as against the Archive page, which
// shows the archive on its own — is to see an archived record back among the
// ones that are still current, where you lost it.
//
// The count is on the button so the toggle is worth pressing only when there
// is something behind it; a list with nothing archived renders nothing at all.
export default function ArchivedToggle({ count = 0, active, onChange }) {
  if (!count && !active) return null;

  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      aria-pressed={active}
      title={active ? "Hide archived records" : "Show archived records in this list"}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
      }`}
    >
      <Archive size={13} />
      {active ? "Hide archived" : "Show archived"}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 text-[10px] ${
            active
              ? "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * The marker an archived row carries when a list is showing the archive, so
 * it can never be mistaken for a live one.
 */
export function ArchivedBadge({ archivedAt }) {
  if (!archivedAt) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <Archive size={10} /> Archived
    </span>
  );
}
