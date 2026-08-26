// Central place for small shared constants / color maps used across the app.

export const STATUS_COLORS = {
  "Not Started": "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  "To Do": "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  Blocked: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  "For Testing": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  "For Demo": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900",
  "For Deployment": "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-900",
  Done: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  Cancelled: "bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700",
};

export const DEFAULT_STATUS_COLOR =
  "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

export const PRIORITY_COLORS = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Highest: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  High: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  Medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Normal: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Lowest: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export const DEFAULT_PRIORITY_COLOR = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

export const TYPE_COLORS = {
  Task: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Subtask: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  Story: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Bug: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Epic: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  Support: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "Change Request": "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  Testing: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
};

export const DEFAULT_TYPE_COLOR = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

export const NOTE_TYPE_COLORS = {
  freeform: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  mom: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

export const DEFAULT_NOTE_TYPE_COLOR = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

export const NOTE_TYPE_LABELS = {
  freeform: "Freeform",
  mom: "MOM",
};

export const DONE_STATUSES = ["Done", "Completed", "Cancelled"];

export const STORAGE_KEY = "taskar:v1";
export const JIRA_SETTINGS_KEY = "taskar:jira-settings:v1";
export const DICTATION_LANG_KEY = "taskar:dictation-lang:v1";

// A curated subset of languages Web Speech API commonly supports. "" means
// "follow the browser's own language" (navigator.language).
export const DICTATION_LANGUAGES = [
  { code: "", label: "Browser default" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "fil-PH", label: "Filipino" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ar-SA", label: "Arabic" },
];
