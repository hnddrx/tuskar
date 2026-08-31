"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  NotebookText,
  Table2,
  KanbanSquare,
  Settings2,
  Link2,
  FileText,
  BookOpenText,
  Menu,
  X,
  CalendarDays,
  Timer,
  Square,
  Mail,
  Archive,
} from "lucide-react";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { useTasks } from "@/context/TaskContext";
import TeamsNav from "@/components/TeamsNav";
import { DONE_STATUSES } from "@/lib/constants";
import ThemeToggle from "@/components/ThemeToggle";
import Logo, { Wordmark } from "@/components/Logo";
import ChatDock from "@/components/ChatDock";
import { useNow } from "@/lib/useNow";
import { entrySeconds } from "@/lib/time";
import { formatCountdown } from "@/lib/pomodoro";

// Grouped so "my stuff" and "the team's stuff" read as two different places
// at a glance — the two used to sit in one flat list where only the word
// "Team" distinguished them.
const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/time", label: "Time", icon: Timer },
    ],
  },
  {
    label: "Personal",
    accent: "personal",
    items: [
      { href: "/tasks", label: "My Tasks", icon: Table2 },
      { href: "/board", label: "My Board", icon: KanbanSquare },
      { href: "/notes", label: "Notes", icon: NotebookText },
    ],
  },
  { id: "teams" },
  {
    label: null,
    items: [
      { href: "/archive", label: "Archive", icon: Archive },
      { href: "/docs", label: "Auto Docs", icon: FileText },
      { href: "/jira", label: "Jira Import", icon: Link2 },
      { href: "/email", label: "Email Settings", icon: Mail },
      { href: "/config", label: "Configuration", icon: Settings2 },
      { href: "/guide", label: "User Guide", icon: BookOpenText },
    ],
  },
];

function Brand() {
  return <Wordmark />;
}

// The sidebar is only 240px wide, so Clerk's switcher has to be told to fill
// it and wrap its own label — left to its natural width it overflows the
// aside and lands on top of the page content next to it.
const SWITCHER_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    organizationSwitcherTrigger:
      "w-full justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-800",
    organizationPreview: "min-w-0",
    organizationPreviewMainIdentifier: "truncate text-sm",
    organizationPreviewSecondaryIdentifier: "truncate text-xs",
  },
};

function SidebarIdentity() {
  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3 pt-5">
        <Brand />
        <div className="shrink-0">
          <UserButton />
        </div>
      </div>
      <div className="px-3 pb-3">
        <OrganizationSwitcher hidePersonal={false} appearance={SWITCHER_APPEARANCE} />
      </div>
    </>
  );
}

// Team destinations carry the same indigo the Calendar uses for team events,
// so scope is signalled by colour consistently across the app.
const ACTIVE_STYLES = {
  team: "bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white",
  personal: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
  default: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
};

function NavLinks({ pathname, onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-2">
      {NAV_SECTIONS.map((section, i) =>
        section.id === "teams" ? (
          <Suspense key="teams" fallback={null}>
            <TeamsNav onNavigate={onNavigate} />
          </Suspense>
        ) : (
          <div key={section.label || `group-${i}`} className={i === 0 ? "" : "mt-4"}>
          {section.label && (
            <p className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  section.accent === "team"
                    ? "bg-indigo-400 dark:bg-indigo-500"
                    : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              {section.label}
            </p>
          )}
          <div className="space-y-1">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:py-2 ${
                    active
                      ? ACTIVE_STYLES[section.accent || "default"]
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  }`}
                >
                  <Icon size={16} strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
          </div>
          </div>
        )
      )}
    </nav>
  );
}

// Shown in the sidebar whenever a timer is running, so a clock left going on
// another page (or another device) is impossible to miss.
function RunningTimer({ running, tasks, onStop }) {
  // The ticker only runs while something is being timed.
  const now = useNow(1000, Boolean(running));
  if (!running) return null;

  const task = running.taskId ? tasks.find((t) => t.id === running.taskId) : null;

  return (
    <div className="border-t border-slate-200 px-4 pt-4 dark:border-slate-800">
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900 dark:bg-red-950/60">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            Tracking
          </span>
          <button
            onClick={() => onStop(running.id)}
            title="Stop the timer"
            aria-label="Stop the timer"
            className="rounded p-1 text-red-600 transition-colors hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900"
          >
            <Square size={13} />
          </button>
        </div>
        <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-700 dark:text-red-300">
          {formatCountdown(entrySeconds(running, now))}
        </p>
        <p className="truncate text-[11px] text-red-600/80 dark:text-red-400/80">
          {task ? `${task.ticketId} — ${task.name}` : running.description || "General time"}
        </p>
      </div>
    </div>
  );
}

function OpenCount({ hydrated, count }) {
  return (
    <div className="border-t border-slate-200 p-4 dark:border-slate-800">
      <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
        <p className="text-xs text-slate-400 dark:text-slate-500">Open tasks</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {hydrated ? count : "–"}
        </p>
      </div>
      <p className="mt-3 px-1 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
        Your tasks, comments, and Jira connection are saved to your account and
        sync across every device you sign in on.
      </p>
    </div>
  );
}

function SyncErrorBanner({ error, onRetry, onDismiss }) {
  if (!error) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
      <span>Couldn&apos;t save your last change: {error}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          className="rounded-md bg-amber-100 px-2 py-1 font-medium transition-colors hover:bg-amber-200 dark:bg-amber-900 dark:hover:bg-amber-800"
        >
          Retry
        </button>
        <button
          onClick={onDismiss}
          className="text-amber-500 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const {
    personal: { tasks },
    time: { running, stop },
    hydrated,
    syncError,
    retrySync,
    dismissSyncError,
  } = useTasks();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">{children}</div>;
  }

  const openCount = tasks.filter((t) => !DONE_STATUSES.includes(t.status)).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 md:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Menu size={20} />
        </button>

        <div className="flex flex-1 items-center gap-2">
          <Logo size={26} />
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Taskar
          </span>
        </div>
        <ThemeToggle />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 dark:bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center gap-2 px-4 pb-3 pt-5">
              <Brand />
              <div className="shrink-0">
                <UserButton />
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-3 pb-3">
              <OrganizationSwitcher hidePersonal={false} appearance={SWITCHER_APPEARANCE} />
            </div>
            <div className="px-4 pb-3">
              <ThemeToggle />
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <RunningTimer running={running} tasks={tasks} onStop={stop} />
        <OpenCount hydrated={hydrated} count={openCount} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
        <SidebarIdentity />
        <div className="px-4 pb-3">
          <ThemeToggle />
        </div>
        <NavLinks pathname={pathname} />
        <RunningTimer running={running} tasks={tasks} onStop={stop} />
        <OpenCount hydrated={hydrated} count={openCount} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col md:ml-60">
        <SyncErrorBanner error={syncError} onRetry={retrySync} onDismiss={dismissSyncError} />
        {children}
      </div>

      {/* Docked conversations sit above everything, on every page. */}
      <ChatDock />
    </div>
  );
}
