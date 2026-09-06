"use client";

import { useState } from "react";
import Link from "next/link";
import { PriorityBadge, SyncBadge } from "@/components/Badge";
import { ProgressBar } from "@/components/ProgressBar";
import { DONE_STATUSES } from "@/lib/constants";
import { dropUpdate } from "@/lib/board";

/**
 * The Kanban itself, shared by My Board and the Team Board.
 *
 * It was written twice before, which is how both copies came to carry the same
 * drag bugs. The two boards differ in what a card links to, who it says is on
 * it, and whether this person may move one at all — so those are props, and
 * the dragging is not.
 *
 * `columns` comes from lib/board's boardColumns; `tasks` is the same flat list
 * those columns were built from, which is what a drop is resolved against.
 */
export default function Board({ columns, tasks, cardHref, assigneeLabel, canMove = true, onMove }) {
  const [dragId, setDragId] = useState(null);
  const [overStatus, setOverStatus] = useState(null);

  const dragging = dragId !== null;

  function endDrag() {
    setDragId(null);
    setOverStatus(null);
  }

  /**
   * Whether the board claims a drag at all: only while one of its own cards is
   * in hand. Without that guard it would also swallow links and files dragged
   * in from elsewhere and read them as a card that does not exist.
   *
   * Every part of the board claims the drag, including the columns that cannot
   * take the card and the gaps between them. That is deliberate: a card is a
   * link, and a link released over anything that has not claimed it is a link
   * dropped on the page, which navigates. Claiming the whole board is what
   * makes releasing a card somewhere useless do nothing at all, rather than
   * abandoning the board for the dragged card's own task page.
   */
  function claims() {
    return canMove && dragging;
  }

  /** …and whether this particular column can actually take the card. */
  function accepts(column) {
    return claims() && column.configured;
  }

  function handleDrop(event, column) {
    if (!claims()) return;
    event.preventDefault();
    if (!accepts(column)) return endDrag();
    const update = dropUpdate(tasks, dragId, column.status);
    if (update) onMove(update.id, update.patch);
    endDrag();
  }

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-4"
      onDragOver={(e) => claims() && e.preventDefault()}
      onDrop={(e) => {
        if (!claims()) return;
        e.preventDefault();
        endDrag();
      }}
    >
      {columns.map((column) => (
        <div
          key={column.status}
          onDragOver={(e) => {
            if (!claims()) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = accepts(column) ? "move" : "none";
            setOverStatus(accepts(column) ? column.status : null);
          }}
          // No dragLeave handler: only one column is ever marked, so moving to
          // the next one clears the last, and dragEnd clears it either way.
          // Clearing on leave instead made the mark flicker every time the
          // pointer crossed a card inside the column.
          onDrop={(e) => handleDrop(e, column)}
          className={`w-64 shrink-0 rounded-xl p-3 transition-colors sm:w-72 ${
            column.configured
              ? "bg-slate-100/70 dark:bg-slate-800/60"
              : "bg-amber-50/70 dark:bg-amber-950/30"
          } ${
            overStatus === column.status
              ? "outline outline-2 outline-slate-400 dark:outline-slate-500"
              : ""
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <h3
              className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              title={
                column.configured
                  ? column.status
                  : `${column.status} — not one of this board's statuses`
              }
            >
              {column.status}
            </h3>
            <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-xs text-slate-400 dark:bg-slate-900 dark:text-slate-500">
              {column.tasks.length}
            </span>
          </div>

          {/* Said once per stray column rather than once per card: these tasks
              are on the board only so they can be found and moved off it. */}
          {!column.configured && (
            <p className="mb-2 px-1 text-[11px] leading-snug text-amber-700 dark:text-amber-500">
              Not a status on this board. Drag these onto a column to file them.
            </p>
          )}

          <div className="space-y-2">
            {column.tasks.map((t) => (
              <Link
                key={t.id}
                href={cardHref(t)}
                draggable={canMove}
                onDragStart={(e) => {
                  if (!canMove) return;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", t.id);
                  setDragId(t.id);
                }}
                // A drag abandoned outside a column used to leave the card in
                // hand, so the next drop moved it instead of the card actually
                // being dragged.
                onDragEnd={endDrag}
                className={`block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 ${
                  canMove ? "cursor-grab active:cursor-grabbing" : ""
                } ${DONE_STATUSES.includes(column.status) ? "opacity-70" : ""}`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {t.ticketId}
                  </span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <p className="mb-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-200">
                  {t.name}
                </p>
                <ProgressBar value={t.progress} className="mb-2" />
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {assigneeLabel(t)}
                  </span>
                  <SyncBadge source={t.syncSource} />
                </div>
              </Link>
            ))}
            {column.tasks.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                Nothing here
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
