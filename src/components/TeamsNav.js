"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Users, KanbanSquare, MessagesSquare, ChevronRight } from "lucide-react";
import { useOrganizationList } from "@clerk/nextjs";
import { useTasks } from "@/context/TaskContext";
import { roomOrgId } from "@/lib/chat";
import {
  TEAM_PARAM,
  CHAT_PARAM,
  teamTasksHref,
  teamBoardHref,
  teamChatHref,
} from "@/lib/teamScope";

// The three destinations that exist once per team.
const TEAM_VIEWS = [
  { key: "tasks", label: "Team Tasks", icon: Users, href: teamTasksHref, at: "/team/tasks" },
  { key: "board", label: "Team Board", icon: KanbanSquare, href: teamBoardHref, at: "/team/board" },
  { key: "chat", label: "Chat", icon: MessagesSquare, href: teamChatHref, at: "/chat" },
];

// Matches the indigo the rest of the app uses for team scope.
const ACTIVE = "bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white";
const IDLE =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

const EXPANDED_KEY = "taskar:teams-expanded:v1";

function readExpanded() {
  try {
    return JSON.parse(window.localStorage.getItem(EXPANDED_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * One entry per team you are in, each opening onto that team's tasks, board
 * and room.
 *
 * Which team a page is showing lives in the URL, so these are ordinary links —
 * following one does not depend on the team switcher. The switcher is still
 * moved to match, because the parts of the app that are inherently
 * single-team (the Configuration screen, the team calendar) read it, and
 * leaving it pointing elsewhere would quietly put those out of step with the
 * page you are looking at.
 *
 * Reads the URL, so callers render it inside a Suspense boundary.
 */
export default function TeamsNav({ onNavigate }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    team: { orgs },
  } = useTasks();
  const { isLoaded, setActive } = useOrganizationList();
  const [expanded, setExpanded] = useState({});

  // Read after mount: the server has no localStorage, and rendering a
  // different tree there than here would be a hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(readExpanded());
  }, []);

  // Whichever team the current page is showing — from "?team=" on the task
  // and board pages, or from the room a conversation belongs to on /chat.
  const current =
    searchParams.get(TEAM_PARAM) || roomOrgId(searchParams.get(CHAT_PARAM) || "") || null;

  // An untouched team follows the page; once you have opened or closed one by
  // hand, that choice sticks.
  const isOpen = (id) => (id in expanded ? expanded[id] : id === current);

  const toggle = useCallback((id, openNow) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !openNow };
      try {
        window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {
        // A browser refusing storage only costs which teams were left open.
      }
      return next;
    });
  }, []);

  function follow(orgId) {
    onNavigate?.();
    if (isLoaded && setActive) {
      // Best effort, and deliberately not awaited: the link has already taken
      // you to the page, which reads the team from the URL either way.
      Promise.resolve(setActive({ organization: orgId })).catch(() => {});
    }
  }

  const allTeamsActive = pathname.startsWith("/team/") && !current;

  return (
    <div className="mt-4">
      <p className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500" />
        Teams
      </p>

      <div className="space-y-1">
        <Link
          href="/team/tasks"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:py-2 ${
            allTeamsActive ? ACTIVE : IDLE
          }`}
        >
          <Users size={16} strokeWidth={2} />
          All teams
        </Link>

        {orgs.length === 0 && (
          <p className="px-3 py-1 text-xs text-slate-400 dark:text-slate-500">
            You&apos;re not in a team yet.
          </p>
        )}

        {orgs.map((org) => {
          const open = isOpen(org.id);
          return (
            <div key={org.id}>
              <button
                onClick={() => toggle(org.id, open)}
                aria-expanded={open}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors sm:py-2 ${IDLE}`}
              >
                <ChevronRight
                  size={14}
                  className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                />
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-100 text-[10px] font-semibold uppercase text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                  {org.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
              </button>

              {open && (
                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2 dark:border-slate-800">
                  {TEAM_VIEWS.map(({ key, label, icon: Icon, href, at }) => {
                    const active = pathname.startsWith(at) && current === org.id;
                    return (
                      <Link
                        key={key}
                        href={href(org.id)}
                        onClick={() => follow(org.id)}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active ? ACTIVE : IDLE
                        }`}
                      >
                        <Icon size={15} strokeWidth={2} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
