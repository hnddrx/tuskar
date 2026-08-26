"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Plus, Search, Download, List, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { useConfirm } from "@/components/ConfirmProvider";
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

const VIEW_KEY = "taskar:notes-view:v1";

export default function NotesPage() {
  const { tasks } = useTasks();
  const { userId } = useAuth();
  const confirm = useConfirm();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState("card");
  const lastUserIdRef = useRef(undefined);

  useEffect(() => {
    let cancelled = false;

    // Switched accounts without a full page reload — clear the previous
    // account's notes immediately so they never linger on screen.
    if (lastUserIdRef.current !== undefined && lastUserIdRef.current !== userId) {
      setNotes([]);
      setLoading(true);
    }
    lastUserIdRef.current = userId;

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
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(localStorage.getItem(VIEW_KEY) || "card");
  }, []);

  function selectView(v) {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

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

  async function handleDeleteNote(note) {
    const ok = await confirm({
      title: "Delete this note?",
      message: `"${note.title || "Untitled note"}" will be permanently deleted.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    if (res.ok) setNotes((prev) => prev.filter((n) => n.id !== note.id));
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
          <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => selectView("card")}
              title="Card view"
              aria-label="Card view"
              aria-pressed={view === "card"}
              className={`rounded p-1.5 transition-colors ${
                view === "card"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => selectView("list")}
              title="List view"
              aria-label="List view"
              aria-pressed={view === "list"}
              className={`rounded p-1.5 transition-colors ${
                view === "list"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </PageHeader>

      <div className="px-4 py-6 sm:px-8">
        {loading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No notes yet.</p>
        ) : view === "card" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((note) => {
              const linkedTask = note.linkedTaskId
                ? tasks.find((t) => t.id === note.linkedTaskId)
                : null;
              return (
                <div
                  key={note.id}
                  className="group relative rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <Link href={`/notes/${note.id}`} className="block pr-10">
                    <div className="mb-1.5 flex items-center gap-2">
                      <NoteTypeBadge type={note.type} />
                      {linkedTask && (
                        <span className="whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
                          {linkedTask.ticketId}
                        </span>
                      )}
                    </div>
                    <h2 className="mb-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {note.title || "Untitled note"}
                    </h2>
                    <p className="line-clamp-2 text-xs text-slate-400 dark:text-slate-500">
                      {note.body || "No content yet."}
                    </p>
                  </Link>
                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Link
                      href={`/notes/${note.id}`}
                      title="Edit"
                      aria-label="Edit note"
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <Pencil size={13} />
                    </Link>
                    <button
                      onClick={() => handleDeleteNote(note)}
                      title="Delete"
                      aria-label="Delete note"
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {filtered.map((note) => {
              const linkedTask = note.linkedTaskId
                ? tasks.find((t) => t.id === note.linkedTaskId)
                : null;
              return (
                <div
                  key={note.id}
                  className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <Link
                    href={`/notes/${note.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <NoteTypeBadge type={note.type} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {note.title || "Untitled note"}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-slate-400 dark:text-slate-500 sm:block">
                      {note.body || "No content yet."}
                    </span>
                    {linkedTask && (
                      <span className="hidden whitespace-nowrap text-xs text-slate-400 dark:text-slate-500 md:block">
                        {linkedTask.ticketId}
                      </span>
                    )}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Link
                      href={`/notes/${note.id}`}
                      title="Edit"
                      aria-label="Edit note"
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <Pencil size={13} />
                    </Link>
                    <button
                      onClick={() => handleDeleteNote(note)}
                      title="Delete"
                      aria-label="Delete note"
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NoteTypePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
