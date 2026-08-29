"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Send, AtSign } from "lucide-react";
import { SyncBadge } from "@/components/Badge";
import { activeMentionQuery, matchMembers, insertMention, splitMentions } from "@/lib/mentions";

function formatTs(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Renders @mentions as highlighted spans, leaving the rest as plain text.
function CommentBody({ text, members }) {
  const segments = splitMentions(text, members);
  return (
    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">
      {segments.map((segment, i) =>
        segment.type === "mention" ? (
          <span
            key={i}
            className="rounded bg-indigo-50 px-1 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
          >
            {segment.value}
          </span>
        ) : (
          <span key={i}>{segment.value}</span>
        )
      )}
    </p>
  );
}

/**
 * `members` enables @-mentions — pass the team roster on team tasks, and
 * nothing on personal ones, where there is nobody to mention.
 */
export default function CommentThread({
  taskId,
  comments,
  addComment,
  deleteComment,
  showAuthorField = true,
  members = [],
}) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("Wren");
  const [mention, setMention] = useState(null); // { query, start, index }
  const textareaRef = useRef(null);

  const mentionsEnabled = members.length > 0;
  const suggestions = mention ? matchMembers(members, mention.query).slice(0, 6) : [];

  const thread = comments
    .filter((c) => c.ticketId === taskId)
    .sort((a, b) => (a.created < b.created ? 1 : -1));

  // Re-checks whether the caret sits inside a mention after every edit or
  // cursor move, so the picker follows the caret rather than only opening
  // when "@" is typed.
  function syncMention(value, caret) {
    if (!mentionsEnabled) return;
    const active = activeMentionQuery(value, caret);
    setMention(active ? { ...active, index: 0 } : null);
  }

  function handleChange(e) {
    setText(e.target.value);
    syncMention(e.target.value, e.target.selectionStart);
  }

  function choose(member) {
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : text.length;
    const result = insertMention(text, caret, mention.start, member);
    setText(result.text);
    setMention(null);
    // Put the caret after the inserted name rather than leaving it where the
    // half-typed query used to end.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
    });
  }

  function handleKeyDown(e) {
    if (!mention || suggestions.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setMention((m) => ({
        ...m,
        index:
          (m.index + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) %
          suggestions.length,
      }));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(suggestions[mention.index]);
    } else if (e.key === "Escape") {
      setMention(null);
    }
  }

  // Any click elsewhere dismisses the picker.
  useEffect(() => {
    if (!mention) return;
    const close = () => setMention(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [mention]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    addComment(taskId, { author, text: text.trim() });
    setText("");
    setMention(null);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => syncMention(text, e.target.selectionStart)}
            rows={2}
            placeholder={
              mentionsEnabled
                ? "Log an update, or @ someone…"
                : "Log an update or comment…"
            }
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
          />

          {mention && suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Team members"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-full z-30 mb-1 w-64 max-w-full overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              {suggestions.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === mention.index}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(m)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                      i === mention.index
                        ? "bg-slate-100 dark:bg-slate-800"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {m.name?.[0]?.toUpperCase() || "?"}
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-300">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {showAuthorField ? (
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:text-slate-400 dark:focus:border-slate-500"
            />
          ) : mentionsEnabled ? (
            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              <AtSign size={11} /> Type @ to mention a teammate
            </span>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            <Send size={13} /> Add update
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {thread.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No comments or updates logged yet.
          </p>
        )}
        {thread.map((c) => (
          <div
            key={c.id}
            className="group flex gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/60"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 dark:text-slate-400">
              {c.author?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {c.author}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {formatTs(c.created)}
                </span>
                <SyncBadge source={c.syncSource} />
              </div>
              <CommentBody text={c.text} members={members} />
            </div>
            <button
              onClick={() => deleteComment(c.id, taskId)}
              className="h-fit rounded p-1 text-slate-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-slate-600"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
