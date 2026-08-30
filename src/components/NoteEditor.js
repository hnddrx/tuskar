"use client";

import { useEffect, useRef, useState } from "react";
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
  FilePlus2,
  FileText,
  Circle,
  Loader2,
  Paperclip,
  ChevronDown,
} from "lucide-react";
import { ATTACHMENT_ACCEPT, formatFileSize } from "@/lib/attachments";
import ConfigListEditor from "@/components/ConfigListEditor";
import Breadcrumbs from "@/components/Breadcrumbs";
import { NoteTypeBadge } from "@/components/Badge";
import { generateNoteDoc, generateNoteWordHtml } from "@/lib/noteDocGenerator";
import { downloadMarkdown, downloadWordDoc } from "@/lib/docGenerator";
import RichTextEditor from "@/components/RichTextEditor";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import RecordPager from "@/components/RecordPager";
import { fromPlainText, toPlainText } from "@/lib/richText";
import { newId } from "@/lib/id";
import { useSpeechDictation } from "@/lib/useSpeechDictation";
import { DICTATION_LANG_KEY, DICTATION_LANGUAGES } from "@/lib/constants";

export default function NoteEditor({
  note,
  mode,
  tasks,
  onSave,
  onAutosave,
  onDelete,
  onConvertActionItem,
  onAttachmentsChange,
  breadcrumbs,
  pager,
}) {
  const [pendingChanges, setPendingChanges] = useState({});
  const isDirty = mode === "create" || Object.keys(pendingChanges).length > 0;

  // Flush unsaved changes if the user navigates to another module before
  // clicking Save, so switching pages never silently drops what they wrote.
  // Skipped if handleSave() already fired, so leaving right after an
  // explicit Save doesn't fire a redundant (and, for a new note, duplicate
  // insert-conflicting) autosave on top of it.
  const explicitSaveRef = useRef(false);
  const unmountFlushRef = useRef(null);
  // The live editor instance, so dictation can insert at the cursor.
  const editorRef = useRef(null);
  useEffect(() => {
    unmountFlushRef.current = () => {
      if (explicitSaveRef.current) return;
      const pending = pendingChanges;
      const save = onAutosave || onSave;
      if (mode === "create") {
        const draft = { ...note, ...pending };
        const hasContent = Boolean(
          draft.title?.trim() ||
            toPlainText(draft.bodyRich).trim() ||
            draft.attendees?.length ||
            draft.agenda?.length ||
            draft.actionItems?.length
        );
        if (hasContent) save(draft);
      } else if (Object.keys(pending).length > 0) {
        save(pending);
      }
    };
  }, [pendingChanges, mode, note, onSave, onAutosave]);
  useEffect(() => {
    return () => unmountFlushRef.current();
  }, []);

  function effective(field) {
    return field in pendingChanges ? pendingChanges[field] : note[field];
  }

  function patchPending(field, value) {
    explicitSaveRef.current = false;
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
    explicitSaveRef.current = true;
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

  const [exportOpen, setExportOpen] = useState(false);

  function draftNote() {
    return { ...note, ...pendingChanges };
  }

  function handleExportMarkdown() {
    const draft = draftNote();
    downloadMarkdown(`${draft.title || "note"}.md`, generateNoteDoc(draft, tasks));
  }

  // Carries the formatting Markdown cannot express — colour, font size,
  // alignment and tables.
  function handleExportWord() {
    const draft = draftNote();
    downloadWordDoc(`${draft.title || "note"}.doc`, generateNoteWordHtml(draft, tasks));
  }

  const [dictationLang, setDictationLang] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDictationLang(localStorage.getItem(DICTATION_LANG_KEY) || "");
  }, []);

  function selectDictationLang(code) {
    setDictationLang(code);
    localStorage.setItem(DICTATION_LANG_KEY, code);
  }

  const {
    supported: voiceSupported,
    listening: voiceListening,
    error: voiceError,
    toggle: toggleVoice,
  } = useSpeechDictation((transcript) => {
    // Insert at the cursor through the editor rather than appending to a
    // string, so dictated text lands where the user is actually typing and
    // picks up whatever formatting is active there.
    editorRef.current?.chain().focus().insertContent(transcript + " ").run();
  }, dictationLang);

  const type = effective("type");
  const isMom = type === "mom";

  return (
    <div className="px-4 py-6 sm:px-8 lg:px-12">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <NoteTypeBadge type={type} />
        <div className="flex items-center gap-2">
          <RecordPager pager={pager} />
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Download size={14} /> Export <ChevronDown size={12} />
            </button>
            {exportOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setExportOpen(false);
                      handleExportMarkdown();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Markdown (.md)
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setExportOpen(false);
                      handleExportWord();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Word / Docs (.doc)
                  </button>
                </div>
              </>
            )}
          </div>
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

      <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
        <div className="lg:col-span-2">
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6">
            <input
              value={effective("title")}
              onChange={(e) => patchPending("title", e.target.value)}
              placeholder="Note title"
              className="w-full border-0 bg-transparent px-0 text-xl font-semibold text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-300 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-700 sm:text-2xl"
            />
          </div>

          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                {isMom ? "Discussion" : "Note"}
              </label>
              <div className="flex items-center gap-1.5">
                {voiceSupported && (
                  <select
                    value={dictationLang}
                    onChange={(e) => selectDictationLang(e.target.value)}
                    disabled={voiceListening}
                    title="Dictation language"
                    className="rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs text-slate-500 transition-colors focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:focus:border-slate-500"
                  >
                    {DICTATION_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
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
            </div>
            {voiceError && (
              <p
                role="status"
                className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
              >
                {voiceError}
              </p>
            )}
            <RichTextEditor
              key={note.id}
              value={note.bodyRich || fromPlainText(note.body)}
              onChange={(doc) => patchPending("bodyRich", doc)}
              onReady={(instance) => {
                editorRef.current = instance;
              }}
              placeholder={isMom ? "What was discussed…" : "Write your note…"}
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

        <div className="mt-4 space-y-4 lg:mt-0">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Link to task
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

          <AttachmentsPanel
            noteId={note.id}
            mode={mode}
            attachments={note.attachments}
            onAttachmentsChange={onAttachmentsChange}
          />

          {isMom && (
            <>
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
            </>
          )}
        </div>
      </div>
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

function AttachmentsPanel({ noteId, mode, attachments, onAttachmentsChange }) {
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const mediaRecorderSupported = typeof window !== "undefined" && "MediaRecorder" in window;

  async function uploadFile(file) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/notes/${noteId}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      const updated = await res.json();
      onAttachmentsChange?.(updated);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleFilePick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        uploadFile(new File([blob], `recording-${Date.now()}.webm`, { type: blob.type }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Couldn't access the microphone");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function deleteAttachment(attachmentId) {
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete attachment");
      const updated = await res.json();
      onAttachmentsChange?.(updated);
    } catch (err) {
      setError(err.message || "Failed to delete attachment");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Paperclip size={13} /> Attachments
      </h2>

      {mode === "create" ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Save this note first to add files or recordings.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={handleFilePick}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <FilePlus2 size={13} /> Add file
            </button>
            {mediaRecorderSupported && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={uploading}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  recording
                    ? "animate-pulse border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {recording ? <Square size={13} /> : <Circle size={13} />}
                {recording ? "Stop recording" : "Record audio"}
              </button>
            )}
            {uploading && (
              <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                <Loader2 size={13} className="animate-spin" /> Uploading…
              </span>
            )}
          </div>

          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

          {attachments?.length > 0 && (
            <div className="mt-3 space-y-2">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/60"
                >
                  {a.kind === "image" && (
                    <button
                      type="button"
                      onClick={() => setPreview(a)}
                      title="Preview"
                      className="shrink-0 overflow-hidden rounded transition-opacity hover:opacity-80"
                    >
                      <img
                        src={`/api/notes/${noteId}/attachments/${a.id}`}
                        alt={a.filename}
                        className="h-12 w-12 object-cover"
                      />
                    </button>
                  )}
                  {a.kind === "audio" && (
                    <audio
                      controls
                      src={`/api/notes/${noteId}/attachments/${a.id}`}
                      className="h-8 flex-1"
                    />
                  )}
                  {a.kind === "file" && (
                    <FileText size={20} className="shrink-0 text-slate-400 dark:text-slate-500" />
                  )}
                  {a.kind === "image" && (
                    <button
                      type="button"
                      onClick={() => setPreview(a)}
                      className="min-w-0 flex-1 truncate text-left text-xs text-slate-600 transition-colors hover:underline dark:text-slate-400"
                      title={a.filename}
                    >
                      {a.filename}
                      <span className="ml-1 text-slate-400 dark:text-slate-500">
                        {formatFileSize(a.size)}
                      </span>
                    </button>
                  )}
                  {a.kind === "file" && (
                    <a
                      href={`/api/notes/${noteId}/attachments/${a.id}`}
                      download={a.filename}
                      className="min-w-0 flex-1 truncate text-xs text-slate-600 transition-colors hover:underline dark:text-slate-400"
                      title={a.filename}
                    >
                      {a.filename}
                      <span className="ml-1 text-slate-400 dark:text-slate-500">
                        {formatFileSize(a.size)}
                      </span>
                    </a>
                  )}
                  <button
                    onClick={() => deleteAttachment(a.id)}
                    title="Delete attachment"
                    className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ImagePreviewModal
        src={preview ? `/api/notes/${noteId}/attachments/${preview.id}` : null}
        attachment={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

