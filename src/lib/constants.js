// Central place for small shared constants / color maps used across the app.

export const STATUS_COLORS = {
  "Not Started": "bg-slate-100 text-slate-600 border-slate-200",
  "To Do": "bg-slate-100 text-slate-600 border-slate-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Blocked: "bg-red-50 text-red-700 border-red-200",
  "For Testing": "bg-amber-50 text-amber-700 border-amber-200",
  "For Demo": "bg-purple-50 text-purple-700 border-purple-200",
  "For Deployment": "bg-indigo-50 text-indigo-700 border-indigo-200",
  Done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

export const DEFAULT_STATUS_COLOR =
  "bg-slate-100 text-slate-600 border-slate-200";

export const PRIORITY_COLORS = {
  Critical: "bg-red-100 text-red-700",
  Highest: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-amber-100 text-amber-700",
  Normal: "bg-blue-100 text-blue-700",
  Low: "bg-slate-100 text-slate-600",
  Lowest: "bg-slate-100 text-slate-500",
};

export const DEFAULT_PRIORITY_COLOR = "bg-slate-100 text-slate-600";

export const TYPE_COLORS = {
  Task: "bg-blue-100 text-blue-700",
  Subtask: "bg-cyan-100 text-cyan-700",
  Story: "bg-emerald-100 text-emerald-700",
  Bug: "bg-red-100 text-red-700",
  Epic: "bg-violet-100 text-violet-700",
  Support: "bg-amber-100 text-amber-700",
  "Change Request": "bg-pink-100 text-pink-700",
  Testing: "bg-teal-100 text-teal-700",
};

export const DEFAULT_TYPE_COLOR = "bg-slate-100 text-slate-600";

export const NOTE_TYPE_COLORS = {
  freeform: "bg-slate-100 text-slate-600",
  mom: "bg-violet-100 text-violet-700",
};

export const DEFAULT_NOTE_TYPE_COLOR = "bg-slate-100 text-slate-600";

export const NOTE_TYPE_LABELS = {
  freeform: "Freeform",
  mom: "MOM",
};

export const DONE_STATUSES = ["Done", "Completed", "Cancelled"];

export const STORAGE_KEY = "taskar:v1";
export const JIRA_SETTINGS_KEY = "taskar:jira-settings:v1";
