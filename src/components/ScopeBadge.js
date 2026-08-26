import { User, Users } from "lucide-react";

// Says which space a page's data lives in. Personal and team boards look
// otherwise identical, so without this the only cue is the page title — and
// the same colour language (slate = personal, indigo = team) is reused by
// the sidebar and the Calendar.
export default function ScopeBadge({ scope, teamName = null }) {
  const isTeam = scope === "team";
  const Icon = isTeam ? Users : User;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isTeam
          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      <Icon size={11} />
      {isTeam ? teamName || "Team" : "Personal"}
    </span>
  );
}
