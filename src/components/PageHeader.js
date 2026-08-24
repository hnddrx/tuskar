"use client";

import { Plus } from "lucide-react";

// Shared sticky header used at the top of every page: title/subtitle on the
// left, primary actions on the right. Stays pinned while the page scrolls,
// so a primary action like "New task" never requires scrolling to reach.
// `children` renders below the title row (e.g. a filters bar) and stays
// pinned too.
export default function PageHeader({ title, subtitle, actions, children, mobileFab }) {
  return (
    <>
      <div className="sticky top-14 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur sm:px-8 md:top-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
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
          className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg active:bg-slate-800 sm:hidden"
        >
          <Plus size={24} />
        </button>
      )}
    </>
  );
}
