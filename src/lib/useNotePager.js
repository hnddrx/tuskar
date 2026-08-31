"use client";

import { useMemo } from "react";
import { useTasks } from "@/context/TaskContext";
import { filterNotes, parseNotesSearchParams } from "@/lib/noteList";
import { pagerFor } from "@/lib/recordPager";

// The Notes counterpart of useTaskPager: a note opened from the list knows
// its place in that list and can step to the neighbours. The `from` link back
// to the list encodes the search and type filter, so the pager re-derives the
// same sequence rather than carrying a copy of it around.

/**
 * @param {string} from      the `?from=` link back to the Notes list
 * @param {string} fromLabel its breadcrumb label, carried on to the neighbours
 * @param {string} noteId    the note on screen
 * @return {{index: number, total: number, prevHref: string|null, nextHref: string|null} | null}
 */
export function useNotePager(from, fromLabel, noteId) {
  const {
    personal: { allNotes: notes },
  } = useTasks();

  const ordered = useMemo(() => {
    let url;
    try {
      url = new URL(from, "http://placeholder");
    } catch {
      return null;
    }
    if (url.pathname !== "/notes") return null;
    return filterNotes(notes, parseNotesSearchParams(url.searchParams));
  }, [from, notes]);

  return useMemo(() => {
    if (!ordered) return null;
    const pager = pagerFor(ordered, noteId);
    if (!pager) return null;

    const hrefFor = (note) => {
      if (!note) return null;
      const params = new URLSearchParams({ from, fromLabel });
      return `/notes/${note.id}?${params.toString()}`;
    };

    return {
      index: pager.index,
      total: pager.total,
      prevHref: hrefFor(pager.prev),
      nextHref: hrefFor(pager.next),
    };
  }, [ordered, noteId, from, fromLabel]);
}
