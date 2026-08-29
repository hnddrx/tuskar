"use client";

import { Plus } from "lucide-react";
import ScopeBadge from "@/components/ScopeBadge";

// Shared sticky header used at the top of every page: title/subtitle on the
// left, primary actions on the right. Stays pinned while the page scrolls,
// so a primary action like "New task" never requires scrolling to reach.
// `children` renders below the title row (e.g. a filters bar) and stays
// pinned too.
export default function PageHeader({ title, subtitle, actions, children, mobileFab, scope, teamName }) {
  return (
    <>
      <div className="sticky top-14 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-8 md:top-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
              {scope && <ScopeBadge scope={scope} teamName={teamName} />}
            </div>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div
              className={`shrink-0 flex-wrap items-center gap-2 ${
                // When a mobile FAB covers the primary action, avoid showing
                // both — the header actions reappear at the sm breakpoint.
                mobileFab ? "hidden sm:flex" : "flex"
              }`}
            >
              {actions}
            </div>
          )}
        </div>
        {children}
      </div>

      {/* Rendered outside the header's backdrop-blur container — a
          backdrop-filter ancestor would otherwise re-anchor this
          fixed-position button to the header instead of the viewport. */}
      {mobileFab && (
        <button
          onClick={mobileFab.onClick}
          aria-label={mobileFab.label || "New task"}
          // Stacked above the floating chat launcher, which owns the corner.
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-colors active:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:active:bg-slate-300 sm:hidden"
        >
          <Plus size={24} />
        </button>
      )}
    </>
  );
}
