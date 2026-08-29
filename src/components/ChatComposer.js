"use client";

import { useRef, useState } from "react";
import { Send, Smile, Paperclip, X, Loader2 } from "lucide-react";
import { ATTACHMENT_ACCEPT, formatFileSize } from "@/lib/attachments";

// A small curated set rather than a picker library — enough for reactions and
// tone, with no dependency and nothing to load.
const EMOJI = [
  "👍", "🙏", "🎉", "🔥", "✅", "❌", "👀", "💡",
  "😀", "😅", "😂", "🙂", "😍", "🤔", "😐", "😴",
  "😢", "😡", "🚀", "⚠️", "❤️", "☕", "🐛", "📌",
];

/**
 * The message box, shared by the Chat page and every docked window so the two
 * behave identically. Uploading is separate from sending: the file transfers
 * while the message is still being typed, and the send carries only a
 * descriptor.
 */
export default function ChatComposer({ onSend, sending, compact = false }) {
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  async function submit(e) {
    e?.preventDefault?.();
    if (uploading) return;
    const ok = await onSend(draft, attachment);
    if (ok) {
      setDraft("");
      setAttachment(null);
    }
  }

  async function upload(file) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/chat/attachments", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setAttachment(data);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function insertEmoji(emoji) {
    const el = textareaRef.current;
    const at = el ? el.selectionStart : draft.length;
    setDraft((d) => d.slice(0, at) + emoji + d.slice(at));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + emoji.length, at + emoji.length);
    });
  }

  return (
    <form onSubmit={submit} className="border-t border-slate-200 px-2.5 py-2 dark:border-slate-800">
      {attachment && (
        <div className="mb-1.5 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-800/60">
          <Paperclip size={12} className="shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
            {attachment.filename}
          </span>
          <span className="shrink-0 text-slate-400">{formatFileSize(attachment.size)}</span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            aria-label="Remove attachment"
            className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {error && <p className="mb-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="relative flex items-end gap-1.5">
        {emojiOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setEmojiOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute bottom-full left-0 z-40 mb-1.5 grid w-56 grid-cols-8 gap-0.5 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  className="rounded p-1 text-base leading-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setEmojiOpen((o) => !o)}
          aria-label="Insert emoji"
          className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <Smile size={16} />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Attach a file"
          className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
        </button>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline.
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          rows={1}
          placeholder="Type a message…"
          className={`max-h-28 min-w-0 flex-1 resize-none rounded-md border border-slate-200 px-2.5 py-1.5 transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 ${
            compact ? "text-xs" : "text-sm"
          }`}
        />

        <button
          type="submit"
          disabled={sending || uploading || (!draft.trim() && !attachment)}
          aria-label="Send message"
          className="flex shrink-0 items-center rounded-md bg-slate-900 px-2.5 py-2 text-white transition-colors hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          <Send size={14} />
        </button>
      </div>
    </form>
  );
}
