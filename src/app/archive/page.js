"use client";

import { useMemo, useState } from "react";
import { Archive, RotateCcw, Trash2, Search, X, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useTasks } from "@/context/TaskContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { ARCHIVE_TYPES, ARCHIVE_TYPE_KEYS } from "@/lib/archive";
import { formatDuration } from "@/lib/time";

// Everything you have deleted, in one place, with the two things you can do
// to it: put it back, or destroy it. Nothing else in the app hard-deletes a
// record, so this page is the only route data leaves by.

// What to call a record in a list that mixes tasks, notes, comments, events
// and time entries — each type keeps its name in a different field.
function titleOf(type, record) {
  switch (type) {
    case "task":
    case "teamTask":
      return `${record.ticketId} · ${record.name}`;
    case "note":
      return record.title || "Untitled note";
    case "comment":
    case "teamComment":
      return record.text || "(empty comment)";
    case "event":
    case "teamEvent":
      return record.title || "Untitled event";
    case "timeEntry":
      return record.description || "Time entry";
    default:
      return record.name || record.title || record.id;
  }
}

// A second line, only where it says something the title does not.
function detailOf(type, record) {
  switch (type) {
    case "comment":
    case "teamComment":
      return `on ${record.ticketId}`;
    case "event":
    case "teamEvent":
      return record.eventDate || null;
    case "timeEntry":
      return formatDuration(record.durationSeconds || 0);
    case "note":
      return record.body ? record.body.slice(0, 80) : null;
    default:
      return null;
  }
}

function whenArchived(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ArchivePage() {
  const {
    archive: { records, restore, deleteForever },
    hydrated,
  } = useTasks();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  // Keyed by `${type}:${id}` — two rows can never share one, so a slow
  // restore only ever spins its own row.
  const [busy, setBusy] = useState({});
  const [error, setError] = useState(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ARCHIVE_TYPE_KEYS.map((type) => {
      const all = records[type] || [];
      const items = q ? all.filter((r) => titleOf(type, r).toLowerCase().includes(q)) : all;
      return { type, ...ARCHIVE_TYPES[type], items };
    }).filter((g) => g.items.length > 0);
  }, [records, query]);

  const total = useMemo(
    () => ARCHIVE_TYPE_KEYS.reduce((sum, t) => sum + (records[t]?.length || 0), 0),
    [records]
  );
  const shown = groups.reduce((sum, g) => sum + g.items.length, 0);

  async function run(type, record, action) {
    const key = `${type}:${record.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message || "That didn't work");
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[key];
        return next;
      });
    }
  }

  function handleRestore(type, record) {
    return run(type, record, () => restore(type, record.id));
  }

  async function handleDeleteForever(type, record) {
    const ok = await confirm({
      title: "Delete permanently?",
      message: `"${titleOf(type, record)}" will be gone for good. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return undefined;
    return run(type, record, () => deleteForever(type, record.id));
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Archive"
        subtitle={
          total === 0
            ? "Deleted tasks, notes, comments and entries land here."
            : `${total} archived record${total === 1 ? "" : "s"}. Restore one, or delete it for good.`
        }
      >
        {total > 0 && (
          <div className="mt-4">
            <div className="relative w-full max-w-xs">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the archive…"
                aria-label="Search the archive"
                className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-7 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:focus:border-slate-500"
              />
              {query.trim() && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}
      </PageHeader>

      <div className="px-4 py-6 sm:px-8">
        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {!hydrated ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        ) : total === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-800">
            <Archive size={22} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing archived.</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Deleting anything in Taskar puts it here first — nothing is destroyed until
              you say so.
            </p>
          </div>
        ) : shown === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nothing in the archive matches &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.type}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group.plural}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {group.items.length}
                  </span>
                </h2>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                  {group.items.map((record) => {
                    const key = `${group.type}:${record.id}`;
                    const detail = detailOf(group.type, record);
                    return (
                      <div
                        key={record.id}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-700 dark:text-slate-300">
                            {titleOf(group.type, record)}
                          </p>
                          <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                            {detail ? `${detail} · ` : ""}
                            archived {whenArchived(record.archivedAt)}
                          </p>
                        </div>
                        {busy[key] ? (
                          <Loader2 size={15} className="shrink-0 animate-spin text-slate-400" />
                        ) : (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => handleRestore(group.type, record)}
                              title="Restore"
                              aria-label={`Restore ${group.label.toLowerCase()}`}
                              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                              <RotateCcw size={13} /> Restore
                            </button>
                            <button
                              onClick={() => handleDeleteForever(group.type, record)}
                              title="Delete permanently"
                              aria-label={`Delete ${group.label.toLowerCase()} permanently`}
                              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
