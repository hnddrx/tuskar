"use client";

import { useState } from "react";
import { Save, Undo2, Trash2, Download, CheckSquare, Square, Plus, X } from "lucide-react";
import ConfigListEditor from "@/components/ConfigListEditor";
import { NoteTypeBadge } from "@/components/Badge";
import { generateNoteDoc } from "@/lib/noteDocGenerator";
import { downloadMarkdown } from "@/lib/docGenerator";
import { newId } from "@/lib/id";

export default function NoteEditor({ note, mode, tasks, onSave, onDelete }) {
  const [pendingChanges, setPendingChanges] = useState({});
  const isDirty = mode === "create" || Object.keys(pendingChanges).length > 0;

  function effective(field) {
    return field in pendingChanges ? pendingChanges[field] : note[field];
  }

  function patchPending(field, value) {
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (mode === "edit" && value === note[field]) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  }

  function handleSave() {
    if (mode === "create") {
      onSave({ ...note, ...pendingChanges });
    } else {
      onSave(pendingChanges);
      setPendingChanges({});
    }
  }

  function handleDiscard() {
    setPendingChanges({});
  }

  function handleExport() {
    const draft = { ...note, ...pendingChanges };
    downloadMarkdown(`${draft.title || "note"}.md`, generateNoteDoc(draft, tasks));
  }

  const type = effective("type");
  const isMom = type === "mom";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <NoteTypeBadge type={type} />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={14} /> Export
          </button>
          {mode === "edit" && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {isDirty && (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Save size={14} /> Save
              </button>
              {mode === "edit" && (
                <button
                  onClick={handleDiscard}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Undo2 size={14} /> Discard
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <input
        value={effective("title")}
        onChange={(e) => patchPending("title", e.target.value)}
        placeholder="Note title"
        className="mb-4 w-full rounded-md border border-slate-200 px-3 py-2 text-lg font-semibold focus:border-slate-400 focus:outline-none"
      />

      <label className="mb-1 block text-xs font-medium text-slate-500">
        Link to task (optional)
      </label>
      <select
        value={effective("linkedTaskId") || ""}
        onChange={(e) => patchPending("linkedTaskId", e.target.value || null)}
        className="mb-4 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
      >
        <option value="">No linked task</option>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.ticketId} — {t.name}
          </option>
        ))}
      </select>

      {isMom && (
        <>
          <div className="mb-4">
            <ConfigListEditor
              title="Attendees"
              items={effective("attendees")}
              onChange={(v) => patchPending("attendees", v)}
            />
          </div>
          <div className="mb-4">
            <ConfigListEditor
              title="Agenda"
              items={effective("agenda")}
              onChange={(v) => patchPending("agenda", v)}
            />
          </div>
        </>
      )}

      <label className="mb-1 block text-xs font-medium text-slate-500">
        {isMom ? "Discussion" : "Note"}
      </label>
      <textarea
        value={effective("body")}
        onChange={(e) => patchPending("body", e.target.value)}
        rows={10}
        placeholder={isMom ? "What was discussed…" : "Write your note…"}
        className="mb-4 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      />

      {isMom && (
        <ActionItemsEditor
          items={effective("actionItems")}
          onChange={(v) => patchPending("actionItems", v)}
        />
      )}
    </div>
  );
}

function ActionItemsEditor({ items, onChange }) {
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newId("action"), text, done: false, taskId: null }]);
    setDraft("");
  }

  function toggleDone(id) {
    onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function remove(id) {
    onChange(items.filter((i) => i.id !== id));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">Action items</h2>
      <div className="mb-3 mt-3 space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5"
          >
            <button
              onClick={() => toggleDone(item.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600"
            >
              {item.done ? <CheckSquare size={15} /> : <Square size={15} />}
            </button>
            <span
              className={`flex-1 text-sm ${
                item.done ? "text-slate-400 line-through" : "text-slate-700"
              }`}
            >
              {item.text}
            </span>
            <button
              onClick={() => remove(item.id)}
              className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-slate-400">No action items yet.</p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add action item…"
          className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          className="flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          <Plus size={13} /> Add
        </button>
      </form>
    </div>
  );
}
