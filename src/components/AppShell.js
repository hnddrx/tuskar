"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useTasks } from "@/context/TaskContext";
import { DONE_STATUSES } from "@/lib/constants";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/notes", label: "Notes", icon: NotebookText },
  { href: "/tasks", label: "Task Table", icon: Table2 },
  { href: "/board", label: "Board", icon: KanbanSquare },
  { href: "/docs", label: "Auto Docs", icon: FileText },
  { href: "/jira", label: "Jira Import", icon: Link2 },
  { href: "/config", label: "Configuration", icon: Settings2 },
  { href: "/guide", label: "User Guide", icon: BookOpenText },
];

function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
        T
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Taskar</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">Personal task tracker</p>
      </div>
    </div>
  );
}

function NavLinks({ pathname, onNavigate }) {
  return (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:py-2 ${
              active
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
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
  const { tasks, hydrated, syncError, retrySync, dismissSyncError } = useTasks();
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
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
            T
          </div>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Taskar</span>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 dark:bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-between flex-1">
                <Brand />
                <UserButton />
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="mr-4 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <OpenCount hydrated={hydrated} count={openCount} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="flex items-center justify-between pr-4">
          <Brand />
          <UserButton />
        </div>
        <NavLinks pathname={pathname} />
        <OpenCount hydrated={hydrated} count={openCount} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col md:ml-60">
        <SyncErrorBanner error={syncError} onRetry={retrySync} onDismiss={dismissSyncError} />
        {children}
      </div>
    </div>
  );
}
