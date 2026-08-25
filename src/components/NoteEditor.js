"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Save,
  Undo2,
  Trash2,
  Download,
  CheckSquare,
  Square,
  Plus,
  X,
  Mic,
  MicOff,
} from "lucide-react";
import ConfigListEditor from "@/components/ConfigListEditor";
import Breadcrumbs from "@/components/Breadcrumbs";
import { NoteTypeBadge } from "@/components/Badge";
import { generateNoteDoc } from "@/lib/noteDocGenerator";
import { downloadMarkdown } from "@/lib/docGenerator";
import { newId } from "@/lib/id";
import { useSpeechDictation } from "@/lib/useSpeechDictation";

export default function NoteEditor({
  note,
  mode,
  tasks,
  onSave,
  onDelete,
  onConvertActionItem,
  breadcrumbs,
}) {
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

  function handleConvert(item) {
    onConvertActionItem(item, effective("actionItems"), pendingChanges);
    setPendingChanges({});
  }

  function handleExport() {
    const draft = { ...note, ...pendingChanges };
    downloadMarkdown(`${draft.title || "note"}.md`, generateNoteDoc(draft, tasks));
  }

  const { supported: voiceSupported, listening: voiceListening, toggle: toggleVoice } =
    useSpeechDictation((transcript) => {
      const current = effective("body");
      patchPending("body", current ? `${current} ${transcript}` : transcript);
    });

  const type = effective("type");
  const isMom = type === "mom";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <NoteTypeBadge type={type} />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Download size={14} /> Export
          </button>
          {mode === "edit" && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-slate-800 dark:bg-slate-900"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {isDirty && (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                <Save size={14} /> Save
              </button>
              {mode === "edit" && (
                <button
                  onClick={handleDiscard}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <Undo2 size={14} /> Discard
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <input
          value={effective("title")}
          onChange={(e) => patchPending("title", e.target.value)}
          placeholder="Note title"
          className="mb-4 w-full border-0 border-b border-slate-200 px-0 pb-3 text-xl font-semibold text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-300 focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:text-slate-100 dark:placeholder:text-slate-700 dark:focus:border-slate-500"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Link to task (optional)
        </label>
        <select
          value={effective("linkedTaskId") || ""}
          onChange={(e) => patchPending("linkedTaskId", e.target.value || null)}
          className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-800/60 dark:focus:border-slate-500"
        >
          <option value="">No linked task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.ticketId} — {t.name}
            </option>
          ))}
        </select>
      </div>

      {isMom && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <ConfigListEditor
            title="Attendees"
            items={effective("attendees")}
            onChange={(v) => patchPending("attendees", v)}
          />
          <ConfigListEditor
            title="Agenda"
            items={effective("agenda")}
            onChange={(v) => patchPending("agenda", v)}
          />
        </div>
      )}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            {isMom ? "Discussion" : "Note"}
          </label>
          <button
            type="button"
            onClick={toggleVoice}
            disabled={!voiceSupported}
            title={
              voiceSupported
                ? voiceListening
                  ? "Stop dictation"
                  : "Dictate into this field"
                : "Voice input isn't supported in this browser"
            }
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              voiceListening
                ? "animate-pulse bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {voiceListening ? <MicOff size={13} /> : <Mic size={13} />}
            {voiceListening ? "Listening…" : "Dictate"}
          </button>
        </div>
        <textarea
          value={effective("body")}
          onChange={(e) => patchPending("body", e.target.value)}
          rows={10}
          placeholder={isMom ? "What was discussed…" : "Write your note…"}
          className="w-full border-0 px-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-300 dark:placeholder:text-slate-600"
        />
      </div>

      {isMom && (
        <ActionItemsEditor
          items={effective("actionItems")}
          onChange={(v) => patchPending("actionItems", v)}
          onConvert={handleConvert}
          tasks={tasks}
          canConvert={mode === "edit"}
        />
      )}
    </div>
  );
}

function ActionItemsEditor({ items, onChange, onConvert, tasks, canConvert }) {
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Action items</h2>
      <div className="mb-3 mt-3 space-y-1.5">
        {items.map((item) => {
          const task = item.taskId ? tasks.find((t) => t.id === item.taskId) : null;
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/60"
            >
              <button
                onClick={() => toggleDone(item.id)}
                className="shrink-0 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500"
              >
                {item.done ? <CheckSquare size={15} /> : <Square size={15} />}
              </button>
              <span
                className={`flex-1 text-sm ${
                  item.done ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {item.text}
              </span>
              {task ? (
                <Link
                  href={`/tasks/${task.id}`}
                  className="whitespace-nowrap text-xs text-blue-600 transition-colors hover:underline"
                >
                  {task.ticketId}
                </Link>
              ) : (
                <button
                  onClick={() => onConvert(item)}
                  disabled={!canConvert}
                  title={canConvert ? "Create a task from this action item" : "Save this note first"}
                  className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Convert to Task
                </button>
              )}
              <button
                onClick={() => remove(item.id)}
                className="rounded p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">No action items yet.</p>
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
          className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
        />
        <button
          type="submit"
          className="flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          <Plus size={13} /> Add
        </button>
      </form>
    </div>
  );
}
