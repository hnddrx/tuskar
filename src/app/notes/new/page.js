"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTasks } from "@/context/TaskContext";
import { newId, nowIso } from "@/lib/id";
import NoteEditor from "@/components/NoteEditor";

function NewNoteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { personal: { tasks } } = useTasks();
  const [saveError, setSaveError] = useState(null);
  const type = searchParams.get("type") === "mom" ? "mom" : "freeform";

  const draft = {
    id: newId("note"),
    type,
    title: "",
    body: "",
    linkedTaskId: null,
    attendees: [],
    agenda: [],
    actionItems: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  async function handleSave(record) {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
      router.push(`/notes/${record.id}`);
    } catch (err) {
      setSaveError(err.message || "Failed to save");
    }
  }

  // Fired when the user navigates away before clicking Save. Unlike
  // handleSave, this never redirects — the user has already left the page.
  function handleAutosave(record) {
    fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch(() => {});
  }

  return (
    <>
      {saveError && (
        <div className="flex items-center justify-between gap-3 px-4 pt-4 text-xs text-amber-800 dark:text-amber-300 sm:px-8 lg:px-12">
          <div className="flex flex-1 items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950">
            <span>Couldn&apos;t save: {saveError} — click Save to try again.</span>
            <button
              onClick={() => setSaveError(null)}
              className="text-amber-500 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <NoteEditor
        note={draft}
        mode="create"
        tasks={tasks}
        onSave={handleSave}
        onAutosave={handleAutosave}
        breadcrumbs={[
          { label: "Notes", href: "/notes" },
          { label: type === "mom" ? "New MOM" : "New note" },
        ]}
      />
    </>
  );
}

export default function NewNotePage() {
  return (
    <Suspense fallback={<div className="flex-1 p-8 text-sm text-slate-400 dark:text-slate-500">Loading…</div>}>
      <NewNoteInner />
    </Suspense>
  );
}
