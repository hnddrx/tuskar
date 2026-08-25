"use client";

// A labeled group of toggle chips — used inside the Task Table filter panel
// for Status / Priority / Assignee (all multi-select, "combine" naturally by
// being ANDed together with everything else in the panel).
export default function ChipToggleGroup({ label, options, selected, onChange }) {
  function toggle(value) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:text-slate-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-slate-900 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
