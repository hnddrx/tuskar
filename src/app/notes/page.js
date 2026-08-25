"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Download } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import PageHeader from "@/components/PageHeader";
import { NoteTypeBadge } from "@/components/Badge";
import NoteTypePickerModal from "@/components/NoteTypePickerModal";
import { generateNotesCompilationDoc } from "@/lib/noteDocGenerator";
import { downloadMarkdown } from "@/lib/docGenerator";

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "freeform", label: "Freeform" },
  { key: "mom", label: "MOM" },
];

export default function NotesPage() {
  const { tasks } = useTasks();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notes")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setNotes(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      if (!q) return true;
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    });
  }, [notes, query, typeFilter]);

  function compileAll() {
    downloadMarkdown("taskar-notes.md", generateNotesCompilationDoc(notes, tasks));
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Notes"
        subtitle="Freeform notes and meeting minutes, saved to your account."
        actions={
          <>
            <button
              onClick={compileAll}
              disabled={notes.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Download size={14} /> Compile all notes
            </button>
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              <Plus size={16} /> New note
            </button>
          </>
        }
        mobileFab={{ onClick: () => setPickerOpen(true), label: "New note" }}
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  typeFilter === f.key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="px-4 py-6 sm:px-8">
        {loading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((note) => {
              const linkedTask = note.linkedTaskId
                ? tasks.find((t) => t.id === note.linkedTaskId)
                : null;
              return (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className="block rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <div className="flex items-center gap-2">
                    <NoteTypeBadge type={note.type} />
                    <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {note.title || "Untitled note"}
                    </span>
                    {linkedTask && (
                      <span className="whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
                        · {linkedTask.ticketId}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                    {note.body || "No content yet."}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <NoteTypePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
