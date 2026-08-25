"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTasks } from "@/context/TaskContext";
import NoteEditor from "@/components/NoteEditor";

export default function NoteDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { tasks, addTask } = useTasks();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);
  const lastPatchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notes/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setNote(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function savePatch(patch) {
    lastPatchRef.current = patch;
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, updatedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
      const updated = await res.json();
      setNote(updated);
      setSaveError(null);
    } catch (err) {
      setSaveError(err.message || "Failed to save");
    }
  }

  function retrySave() {
    if (lastPatchRef.current) savePatch(lastPatchRef.current);
  }

  async function handleDelete() {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      router.push("/notes");
    } catch (err) {
      setSaveError(err.message || "Failed to delete");
    }
  }

  function handleConvertActionItem(item, currentItems, pending) {
    const newTaskId = addTask({ name: item.text, syncSource: "Manual" });
    const updatedItems = currentItems.map((ai) =>
      ai.id === item.id ? { ...ai, taskId: newTaskId } : ai
    );
    savePatch({ ...pending, actionItems: updatedItems });
  }

  if (loading) {
    return <p className="px-4 py-6 text-sm text-slate-400 sm:px-8">Loading…</p>;
  }
  if (!note) {
    return <p className="px-4 py-6 text-sm text-slate-500 sm:px-8">Note not found.</p>;
  }

  return (
    <>
      {saveError && (
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-4 text-xs text-amber-800 sm:px-8">
          <div className="flex flex-1 items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <span>Couldn&apos;t save: {saveError}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={retrySave}
                className="rounded-md bg-amber-100 px-2 py-1 font-medium hover:bg-amber-200"
              >
                Retry
              </button>
              <button
                onClick={() => setSaveError(null)}
                className="text-amber-500 hover:text-amber-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <NoteEditor
        note={note}
        mode="edit"
        tasks={tasks}
        onSave={savePatch}
        onDelete={handleDelete}
        onConvertActionItem={handleConvertActionItem}
        breadcrumbs={[
          { label: "Notes", href: "/notes" },
          { label: note.title || "Untitled note" },
        ]}
      />
    </>
  );
}
