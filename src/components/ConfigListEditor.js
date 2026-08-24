"use client";

import { useState } from "react";
import { Plus, X, GripVertical } from "lucide-react";

export default function ConfigListEditor({ title, hint, items, onChange }) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  }

  function remove(v) {
    onChange(items.filter((i) => i !== v));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mb-3 mt-3 space-y-1.5">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5"
          >
            <GripVertical size={13} className="shrink-0 text-slate-300" />
            <span className="flex-1 text-sm text-slate-700">{item}</span>
            <button
              onClick={() => remove(item)}
              className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-slate-400">No values yet.</p>
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
          placeholder="Add value…"
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
