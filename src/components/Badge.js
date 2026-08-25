import {
  STATUS_COLORS,
  DEFAULT_STATUS_COLOR,
  PRIORITY_COLORS,
  DEFAULT_PRIORITY_COLOR,
  TYPE_COLORS,
  DEFAULT_TYPE_COLOR,
  NOTE_TYPE_COLORS,
  DEFAULT_NOTE_TYPE_COLOR,
  NOTE_TYPE_LABELS,
} from "@/lib/constants";

export function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const cls = PRIORITY_COLORS[priority] || DEFAULT_PRIORITY_COLOR;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {priority}
    </span>
  );
}

export function TypeBadge({ type }) {
  const cls = TYPE_COLORS[type] || DEFAULT_TYPE_COLOR;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {type}
    </span>
  );
}

export function NoteTypeBadge({ type }) {
  const cls = NOTE_TYPE_COLORS[type] || DEFAULT_NOTE_TYPE_COLOR;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {NOTE_TYPE_LABELS[type] || type}
    </span>
  );
}

export function SyncBadge({ source }) {
  const isJira = source === "Jira";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${
        isJira
          ? "bg-sky-50 text-sky-700 border border-sky-200"
          : "bg-neutral-50 text-neutral-500 border border-neutral-200"
      }`}
    >
      {isJira ? "Jira" : "Manual"}
    </span>
  );
}
