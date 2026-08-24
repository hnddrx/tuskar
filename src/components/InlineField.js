"use client";

import { useEffect, useRef, useState } from "react";

// Click-to-edit field for the Task Detail page (Odoo-style: no separate Edit
// mode). Renders `renderView(value)` — or plain text — until clicked, then
// swaps in a text/textarea/select/date/number input that commits via
// onCommit on blur/Enter and reverts on Escape without calling onCommit.
export default function InlineField({
  value,
  onCommit,
  type = "text",
  options = [],
  placeholder = "—",
  renderView,
  min,
  max,
  inline = false,
  viewClassName = "",
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(value ?? "");
    setEditing(true);
  }

  function commit(next = draft) {
    setEditing(false);
    if (next !== (value ?? "")) onCommit(next);
  }

  function cancel() {
    setEditing(false);
  }

  const inputBase =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-slate-400 focus:outline-none";

  if (editing) {
    if (type === "select") {
      return (
        <select
          ref={ref}
          value={draft}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setEditing(false)}
          className={inputBase}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    if (type === "textarea") {
      return (
        <textarea
          ref={ref}
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Escape" && cancel()}
          className={inputBase}
        />
      );
    }

    return (
      <input
        ref={ref}
        type={type}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") cancel();
        }}
        className={inputBase}
      />
    );
  }

  const viewBase = inline
    ? "inline-flex items-center rounded-md hover:opacity-80"
    : "block w-full rounded-md px-2 py-1 text-left hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={startEditing}
      className={`${viewBase} ${viewClassName}`}
    >
      {renderView
        ? renderView(value)
        : value || <span className="text-slate-400">{placeholder}</span>}
    </button>
  );
}
