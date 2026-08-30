"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Odoo-style record pager: "3 / 24" with arrows either side, shown on a
// record opened from a list. Renders nothing when there is no list behind
// this record (a bookmarked URL) or when it is the only one in it.
export default function RecordPager({ pager }) {
  if (!pager || pager.total < 2) return null;

  const arrow =
    "flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200";
  const disabled =
    "flex h-7 w-7 items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-slate-300 dark:border-slate-800/60 dark:bg-slate-900/50 dark:text-slate-700";

  return (
    <div className="flex items-center gap-1.5">
      <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
        {pager.index + 1} / {pager.total}
      </span>
      {pager.prevHref ? (
        <Link href={pager.prevHref} scroll className={arrow} aria-label="Previous record" title="Previous record">
          <ChevronLeft size={15} />
        </Link>
      ) : (
        <span className={disabled} aria-hidden="true">
          <ChevronLeft size={15} />
        </span>
      )}
      {pager.nextHref ? (
        <Link href={pager.nextHref} scroll className={arrow} aria-label="Next record" title="Next record">
          <ChevronRight size={15} />
        </Link>
      ) : (
        <span className={disabled} aria-hidden="true">
          <ChevronRight size={15} />
        </span>
      )}
    </div>
  );
}
