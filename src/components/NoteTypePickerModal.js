"use client";

import Link from "next/link";
import { X, StickyNote, Users } from "lucide-react";

// Small centered chooser for the two note types, opened from either the
// desktop "New note" button or the mobile FAB — one shared entry point so
// both note types stay reachable at every screen size (see NotesPage).
export default function NoteTypePickerModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-sm sm:rounded-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">New note</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          <Link
            href="/notes/new?type=freeform"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            <StickyNote size={18} className="text-slate-500 dark:text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Freeform note</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">A quick note or journal entry.</p>
            </div>
          </Link>
          <Link
            href="/notes/new?type=mom"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            <Users size={18} className="text-slate-500 dark:text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Minutes of Meeting</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Attendees, agenda, and action items.</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
